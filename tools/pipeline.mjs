// tools/pipeline.mjs: the integration pipeline. A JOB (plain JSON: what AutoCinematic or a person writes) → one MP4.
// Reuses everything that exists: gen_assets / validate_assets (collage art), render.mjs (JavaScript motion and collage
// scenes), the ComfyUI client (an LTX-2.5 clip), text_png (Thai text over the clip), ffmpeg (crossfades, audio).
// Every step is checkpointed in out/pipeline/<id>/state.json by a hash of its inputs: a rerun skips what is done and
// redoes only what failed or changed. Everything is logged to out/pipeline/<id>/pipeline.log.
//
//   node tools/pipeline.mjs --job=jobs/hybrid_pilot.json [--python=<ComfyUI python>] [--chrome=<path>] [--soft-gl]
//        [--allow-missing=ltx] (no LTX engine / ComfyUI down: a held still stands in, clearly marked in the report)
//        [--force=<step>|all] [--max-seconds=0.2 --fade=0.05] (smoke test: segments truncated) [--mock-ltx] [--offline]
//        [--only=S01,S03]   render (or re-render, with --force=all) just these segments; no assembly
//        [--failed-only]    re-render only segments that failed (render error or motion check), reuse the rest, assemble
// Segments with `expected_motion` (compiled shot plans) are motion-checked after rendering (tools/motion_check.mjs);
// a failed check fails the segment. Every rendered segment gets a preview seg_<id>.jpg (three frames) for the UI.
// A failing segment no longer stops the others: all are attempted, and assembly waits until every one has passed.
//
// Job: { id, fps, size: [w, h], fade (s), audio (path, optional), assets: [{ story }],
//        segments: [ { id, type: 'story', story, range: [a, b] }
//                  | { id, type: 'ltx', engine: 'ltx', prompt, negative, seconds, image (optional: image-to-video),
//                      text: 'line|line' (live Thai text, optional), textY } ] }
import { audioMix } from './lib/audiomix.mjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, statSync, copyFileSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { comfyGenerate } from './comfy/client.mjs';
import { direct, TRANSITIONS } from './lib/director.mjs';
import { windows, loadBeats, cueTimes } from './lib/timeline.mjs';
import { presetFiles } from './lib/capfiles.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
if (!args.job) { console.error('usage: node tools/pipeline.mjs --job=jobs/<id>.json'); process.exit(1); }
const job = JSON.parse(readFileSync(args.job, 'utf8')), fps = job.fps || 24, [W, H] = job.size || [1080, 1920];
// a beat-based job (narration beats with intents) is expanded by the director into segments; segment jobs pass through
const plan = job.beats ? direct(job) : null; if (plan) job.segments = plan.segments;
// continuity grade for AI-video / still shots, so they sit with the JavaScript segments (same warmth, contrast, grain)
const GRADES = { collage: 'eq=contrast=1.04:saturation=0.92:gamma=1.02,colorbalance=rs=0.04:gs=0.01:bs=-0.04,noise=alls=7:allf=t,vignette=PI/5',
  watercolor: 'eq=contrast=0.98:saturation=0.88:gamma=1.04,colorbalance=rs=0.03:bs=-0.02,noise=alls=5:allf=t,vignette=PI/6', none: '' };
const grade = GRADES[job.continuity?.look ?? 'collage'] ?? '';
const dir = `out/pipeline/${job.id}/`; mkdirSync(dir, { recursive: true });
const stateFile = dir + 'state.json', state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : {};
const PY = args.python || (process.platform === 'win32' ? 'python' : 'python3'), CACHE = process.env.ASSET_CACHE || '.cache/assets';
const pass = [...(args.chrome ? [`--chrome=${args.chrome}`] : []), ...(args['soft-gl'] ? ['--soft-gl'] : [])];
const sha = (...x) => createHash('sha256').update(x.map(v => typeof v === 'string' || Buffer.isBuffer(v) ? v : JSON.stringify(v)).join('\u0000')).digest('hex').slice(0, 16);
const fileHash = f => existsSync(f) ? sha(readFileSync(f)) : 'missing';
const log = m => { const line = `[${new Date().toISOString()}] ${m}`; console.log(m); appendFileSync(dir + 'pipeline.log', line + '\n'); };
const save = () => writeFileSync(stateFile, JSON.stringify(state, null, 1));
const run = (cmd, a, what) => {
  log(`  $ ${cmd} ${a.join(' ')}`);
  const r = spawnSync(cmd, a, { encoding: 'utf8', maxBuffer: 1 << 26 });
  appendFileSync(dir + 'pipeline.log', (r.stdout || '') + (r.stderr || ''));
  if (r.status !== 0) throw new Error(`${what} failed (exit ${r.status}): ${(r.stderr || r.stdout || r.error || '').toString().trim().split('\n').slice(-3).join(' | ')}`);
  return r.stdout || '';
};
const duration = f => +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim();
const report = { job: job.id, started: new Date().toISOString(), steps: [], substitutes: [], segments: {} };
// everything a story segment's pixels depend on besides its own story files (engine, capabilities, plan player)
const ENGINE = ['src/core.js', 'src/timeline.js', 'src/look.js', 'src/responsive.js', 'src/type/text.js', 'src/type/kinetic.js', 'src/plan/play.js', 'src/presets/index.js', ...presetFiles()];
const only = args.only ? String(args.only).split(',') : null, failedOnly = !!args['failed-only'];
if (only) { const ids = new Set(job.segments.map(S => S.id)), bad = only.filter(x => !ids.has(x)); if (bad.length) { console.error(`--only: no segment ${bad.join(', ')}`); process.exit(1); } }
// did this segment's last attempt fail (render error or failed motion check)?
const hasFailed = id => state[`segment:${id}`] && !state[`segment:${id}`].ok;
// three frames of a clip side by side, for the UI's scene preview
const preview = (clip, jpg) => { const d = duration(clip), w = Math.min(W, H) > 1000 ? 360 : 240;
  run('ffmpeg', ['-y', '-loglevel', 'error', ...[.2, .5, .85].flatMap(f => ['-ss', (d * f).toFixed(2), '-i', clip]), '-filter_complex',
    `[0:v]scale=${w}:-2[a];[1:v]scale=${w}:-2[b];[2:v]scale=${w}:-2[c];[a][b][c]hstack=inputs=3`, '-frames:v', '1', '-q:v', '4', jpg], 'preview'); };
// a step runs only if its inputs changed or it never succeeded; its output path must exist
async function step(name, inputs, out, fn) {
  const key = sha(inputs), done = state[name];
  const force = args.force === 'all' || String(args.force || '').split(',').includes(name);
  if (!force && done?.key === key && done.ok && (!out || existsSync(out))) { log(`✓ ${name} (done before, skipped)`); report.steps.push({ name, status: 'cached' }); return done; }
  log(`▶ ${name}`); const t0 = Date.now();
  try {
    const extra = await fn() || {};
    state[name] = { key, ok: true, out, at: new Date().toISOString(), secs: Math.round((Date.now() - t0) / 1000), ...extra }; save();
    log(`✓ ${name} (${state[name].secs} s)`); report.steps.push({ name, status: 'done', ...extra }); return state[name];
  } catch (e) {
    state[name] = { key, ok: false, error: e.message, at: new Date().toISOString() }; save();
    log(`✗ ${name}: ${e.message}`); report.steps.push({ name, status: 'FAILED', error: e.message }); throw e;
  }
}

try {
  // 0. tools present
  for (const [cmd, a] of [['ffmpeg', ['-version']], ['ffprobe', ['-version']]]) if (spawnSync(cmd, a).status !== 0) throw new Error(`${cmd} not found on PATH`);

  // 1. collage artwork: generate what is missing or invalid (cached, so a rerun costs nothing), then validate strictly
  for (const A of job.assets || []) {
    const sceneFile = `src/stories/${A.story}/scene.js`;
    await step(`assets:${A.story}`, [fileHash(sceneFile), fileHash('tools/comfy/imageops.py'), A], null, async () => {
      if (!A.skipGenerate) {
        const g = spawnSync('node', ['tools/gen_assets.mjs', `--story=${A.story}`, `--python=${PY}`, ...(args.offline ? ['--offline'] : [])], { encoding: 'utf8' });
        appendFileSync(dir + 'pipeline.log', (g.stdout || '') + (g.stderr || ''));
        log((g.stdout || '').trim().split('\n').filter(l => /PASS|FAIL|adopting|generating/.test(l)).map(l => '    ' + l.trim()).join('\n'));
      }
      const v = spawnSync('node', ['tools/validate_assets.mjs', `--story=${A.story}`], { encoding: 'utf8' });
      appendFileSync(dir + 'pipeline.log', v.stdout || '');
      if (v.status !== 0) throw new Error(`asset validation failed for ${A.story}:\n${(v.stdout || '').split('\n').filter(l => /FAIL/.test(l)).join('\n')}`);
    });
  }

  // 2. segments
  const segs = [], failed = [];
  for (const S of job.segments) {
    const out = `${dir}seg_${S.id}.mp4`, max = args['max-seconds'] ? +args['max-seconds'] : null;
    if (only && !only.includes(S.id)) continue;
    if (failedOnly && !hasFailed(S.id) && state[`segment:${S.id}`]?.ok && existsSync(out)) { segs.push(out); log(`✓ segment:${S.id} (passed before, kept)`); continue; }
    try {
    if (S.type === 'story') {
      let [a, b] = S.range; if (max) b = Math.min(b, a + max);
      // a compiled plan's segment is keyed by ITS OWN compiled shot (shot_hash), so editing one shot re-renders one shot
      const own = S.shot_hash ? [S.shot_hash] : [fileHash(`src/stories/${S.story}/story.js`), fileHash(`src/stories/${S.story}/scene.js`), fileHash(`src/stories/${S.story}/config.js`), fileHash('src/collage/collage.js')];
      const inputs = [S, a, b, ...own, ...ENGINE.map(fileHash)];
      await step(`segment:${S.id}`, inputs, out, () => {
        const raw = S.hold > 0 ? out.replace(/\.mp4$/, '.raw.mp4') : out;
        run('node', ['render.mjs', `--story=${S.story}`, '--clip', `--range=${a}:${b}`, `--fps=${fps}`, ...(S.speed && S.speed !== 1 ? [`--speed=${S.speed}`] : []), `--out=${raw}`, ...(S.assets ? [`--assets=${S.assets}`] : []), ...pass], `render ${S.id}`);
        if (S.hold > 0) run('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-vf', `tpad=stop_mode=clone:stop_duration=${max ? Math.min(S.hold, .1) : S.hold}`, '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', out], `hold ${S.id}`);   // a real pause on the last frame
        preview(out, out.replace(/\.mp4$/, '.jpg'));
        if (!S.expected_motion) return {};
        const E = S.expected_motion, mj = out.replace(/\.mp4$/, '.motion.json');
        const r = spawnSync('node', ['tools/motion_check.mjs', `--in=${out}`, `--min=${E.min_changed_frac ?? .01}`, ...(E.intentional_still ? ['--still'] : []), `--json=${mj}`], { encoding: 'utf8' });
        appendFileSync(dir + 'pipeline.log', r.stdout + r.stderr);
        const M = existsSync(mj) ? JSON.parse(readFileSync(mj, 'utf8')) : null;
        if (!M?.pass) throw new Error(`failed:motion — ${(r.stdout || r.stderr).trim().split('\n')[0]}`);
        return { motion: M.results[0] };
      });
    } else if (S.type === 'ltx') {
      const secs = max ? Math.min(S.seconds, max) : S.seconds, frames = Math.max(9, Math.round(secs * fps / 8) * 8 + 1);   // LTX wants 8n + 1 frames
      const engines = existsSync('tools/comfy/engines.local.json') ? JSON.parse(readFileSync('tools/comfy/engines.local.json', 'utf8')) : null;
      const eng = engines?.engines?.[S.engine || 'ltx'];
      await step(`segment:${S.id}`, [S, secs, grade, args['mock-ltx'] ? 'mock' : eng && fileHash(eng.workflow), S.image && fileHash(S.image)], out, async () => {
        let clip = null, substitute = null;
        const ck = sha('ltx', S.prompt, S.negative || '', frames, W, H, S.image ? fileHash(S.image) : '', eng ? fileHash(eng.workflow) : 'none');
        const cached = [`${CACHE}/ltx_${ck}.mp4`, `${CACHE}/ltx_${ck}.webm`, `${CACHE}/ltx_${ck}.webp`].find(existsSync);
        if (cached) { clip = cached; log(`    LTX clip from cache: ${cached}`); }
        else if (args['mock-ltx']) { clip = `${CACHE}/ltx_mock_${ck}.mp4`; mkdirSync(CACHE, { recursive: true }); run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `testsrc2=s=768x1344:r=${fps}:d=${secs}`, '-pix_fmt', 'yuv420p', clip], 'mock LTX clip'); substitute = 'mock test pattern (--mock-ltx)'; }
        else {
          try {
            if (!eng) throw new Error('no "ltx" engine in tools/comfy/engines.local.json (export your LTX-2.5 workflow with Save (API Format))');
            log(`    generating the LTX clip (${frames} frames)…`);
            const buf = await comfyGenerate({ server: engines.server, ...eng }, { positive: S.prompt, negative: S.negative || '', seed: S.seed ?? 4101, width: S.genSize?.[0] || 768, height: S.genSize?.[1] || 1344,
              length: frames, ref: S.image ? readFileSync(S.image) : null, video: true }, { timeout: +(args.timeout || 1800) });
            const ext = buf.slice(0, 4).toString('ascii') === 'RIFF' ? 'webp' : buf[0] === 0x1a ? 'webm' : 'mp4';
            mkdirSync(CACHE, { recursive: true }); clip = `${CACHE}/ltx_${ck}.${ext}`; writeFileSync(clip, buf);
          } catch (e) {
            if (!String(args['allow-missing'] || '').includes('ltx')) throw e;
            substitute = `held still (LTX unavailable: ${e.message})`;
          }
        }
        // normalise: cover-crop to the frame, the job's fps, the segment's length; the Thai text on top (rendered by Chrome)
        const textPng = S.text ? `${dir}text_${S.id}.png` : null;
        if (textPng) run('node', ['tools/text_png.mjs', `--text=${S.text}`, `--out=${textPng}`, `--w=${W}`, `--h=${H}`, `--y=${S.textY ?? .14}`, ...pass], 'Thai text');
        const vf = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${fps},format=yuv420p`;
        const src = clip ? ['-i', clip] : ['-loop', '1', '-i', S.image || job.fallbackImage];
        if (!clip && !(S.image || job.fallbackImage)) throw new Error('no LTX clip and no image to hold instead');
        const nF = Math.round(secs * fps), move = { push: `z='min(zoom+0.0008,1.08)'`, pull: `z='if(eq(on,0),1.08,max(zoom-0.0008,1))'`, drift: `z=1.04:x='iw/2-(iw/zoom/2)+on*0.4'`, hold: `z=1` }[S.camera || 'push'] || `z='min(zoom+0.0008,1.08)'`;
        const zoom = (clip ? (S.camera && S.camera !== 'hold' ? `,zoompan=${move}:d=1:s=${W}x${H}:fps=${fps}` : '') : `,zoompan=${move}:d=${nF}:s=${W}x${H}:fps=${fps}`) + (grade ? ',' + grade : '');
        run('ffmpeg', ['-y', '-loglevel', 'error', ...src, ...(textPng ? ['-i', textPng] : []), '-t', String(secs),
          '-filter_complex', `[0:v]${vf}${zoom}[v]${textPng ? `;[1:v]format=rgba,fade=t=in:st=0.3:d=0.3:alpha=1[t];[v][t]overlay=0:0:format=auto[o]` : ''}`,
          '-map', textPng ? '[o]' : '[v]', '-r', String(fps), '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', out], `normalise ${S.id}`);
        return { substitute };
      });
      if (state[`segment:${S.id}`]?.substitute) report.substitutes.push({ segment: S.id, substitute: state[`segment:${S.id}`].substitute });
    } else throw new Error(`unknown segment type "${S.type}"`);
    segs.push(out);
    } catch (e) { failed.push(S.id); }
    report.segments[S.id] = { ok: !!state[`segment:${S.id}`]?.ok, clip: existsSync(out) ? out : null, preview: existsSync(out.replace(/\.mp4$/, '.jpg')) ? out.replace(/\.mp4$/, '.jpg') : null,
      motion: state[`segment:${S.id}`]?.motion || null, error: state[`segment:${S.id}`]?.error || null };
  }
  if (failed.length) throw new Error(`${failed.length} segment(s) failed: ${failed.join(', ')}. Fix, then rerun with --failed-only (passed segments are kept).`);
  if (only) { log(`\nSCENES ONLY (${only.join(', ')}): rendered, not assembled`); report.ok = true; report.scenes_only = only; writeFileSync(dir + 'report.json', JSON.stringify(report, null, 1)); process.exit(0); }

  // 3. assemble: per-boundary transitions (the director's choice, or the job's single fade), then the sound: narration
  //    (cut per beat and placed where its shot actually starts, so pauses and transitions never drift it), SFX cues,
  //    an optional low ambience bed, an optional music bed (looped, faded, ducked under the narration with a sidechain
  //    compressor: job.music { file, gain, duck: 0..1 how far it dips, 0 = off }). Missing sound files are skipped and reported.
  const final = `${dir}${job.id}.mp4`, fade = args.fade != null ? +args.fade : job.fade ?? .3;
  const have = f => { if (f && existsSync(f)) return f; if (f) report.substitutes.push({ segment: 'audio', substitute: `missing ${f}: skipped` }); return null; };
  const narr = have(job.narration?.audio || job.audio), amb = have(job.ambience?.file), mus = have(job.music?.file);
  const sfx = (job.sfx || []).filter(c => have(c.file));
  await step('assemble', ['assemble/4', segs.map(fileHash), fade, job.segments.map(S => S.transition), narr && fileHash(narr), amb && fileHash(amb), job.ambience, mus && fileHash(mus), job.music, sfx.map(c => [c, fileHash(c.file)]), plan?.windows], final, () => {
    // xfade needs inputs on one timebase and frame rate; without this ffmpeg silently cuts the output short (2 × 1.5 s
    // segments came out 1.58 s long)
    const d = segs.map(duration), starts = [0]; let chain = segs.map((_, i) => `[${i}:v]settb=AVTB,fps=${fps},format=yuv420p[n${i}];`).join(''), last = '[n0]', t = 0;
    for (let i = 1; i < segs.length; i++) {
      const tr = job.segments[i].transition;
      if (tr === 'cut' || tr === 'match') {   // a real hard cut: shots butt end to end, nothing overlaps, so narration and
        t += d[i - 1]; starts.push(t);       // SFX placed on the shot timeline never drift (a 0.04 s dissolve per cut did)
        chain += `${last}[n${i}]concat=n=2:v=1:a=0[x${i}];`; last = `[x${i}]`; continue;
      }
      const [name, dur0] = TRANSITIONS[tr] || ['fade', fade], dur = Math.min(dur0, d[i - 1] / 2, d[i] / 2);
      t += d[i - 1] - dur; starts.push(t);
      chain += `${last}[n${i}]xfade=transition=${name}:duration=${dur.toFixed(3)}:offset=${t.toFixed(3)}[x${i}];`; last = `[x${i}]`;
    }
    const total = t + d[segs.length - 1], inputs = segs.flatMap(s => ['-i', s]), A = [];
    const AM = audioMix({ k0: segs.length, total, starts, segments: job.segments, narr, windows: plan?.windows, sfx, amb, ambience: job.ambience, mus, music: job.music });
    inputs.push(...AM.inputs); const mix = AM.mix;
    const grain = job.continuity?.globalGrain ? `,noise=alls=${job.continuity.globalGrain}:allf=t` : '';
    run('ffmpeg', ['-y', '-loglevel', 'error', ...inputs,
      '-filter_complex', `${chain}${last}null${grain}[v]${mix}`,
      '-map', '[v]', ...(mix ? ['-map', '[a]', '-c:a', 'aac', '-b:a', '192k'] : []),
      '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(fps), '-movflags', '+faststart', '-t', total.toFixed(3), final], 'assemble');
    return { seconds: +total.toFixed(2), audio: !!mix, starts: starts.map(x => +x.toFixed(2)) };
  });
  const audio = state.assemble?.audio;
  report.output = final; report.seconds = duration(final); report.ok = true;
  log(`\nDONE → ${final}  (${report.seconds.toFixed(2)} s${audio ? ', with audio' : ', silent'})`);
  for (const s of report.substitutes) log(`  NOTE ${s.segment}: ${s.substitute}`);
} catch (e) {
  report.ok = false; report.error = e.message;
  log(`\nSTOPPED: ${e.message}\nFix it and run the same command again: finished steps are skipped (state: ${stateFile}, log: ${dir}pipeline.log).`);
}
writeFileSync(dir + 'report.json', JSON.stringify(report, null, 1));
process.exit(report.ok ? 0 : 1);
