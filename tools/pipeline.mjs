// tools/pipeline.mjs: the integration pipeline. A JOB (plain JSON: what AutoCinematic or a person writes) → one MP4.
// Reuses everything that exists: gen_assets / validate_assets (collage art), render.mjs (JavaScript motion and collage
// scenes), the ComfyUI client (an LTX-2.5 clip), text_png (Thai text over the clip), ffmpeg (crossfades, audio).
// Every step is checkpointed in out/pipeline/<id>/state.json by a hash of its inputs: a rerun skips what is done and
// redoes only what failed or changed. Everything is logged to out/pipeline/<id>/pipeline.log.
//
//   node tools/pipeline.mjs --job=jobs/hybrid_pilot.json [--python=<ComfyUI python>] [--chrome=<path>] [--soft-gl]
//        [--allow-missing=ltx] (no LTX engine / ComfyUI down: a held still stands in, clearly marked in the report)
//        [--force=<step>|all] [--max-seconds=0.2 --fade=0.05] (smoke test: segments truncated) [--mock-ltx] [--offline]
//
// Job: { id, fps, size: [w, h], fade (s), audio (path, optional), assets: [{ story }],
//        segments: [ { id, type: 'story', story, range: [a, b] }
//                  | { id, type: 'ltx', engine: 'ltx', prompt, negative, seconds, image (optional: image-to-video),
//                      text: 'line|line' (live Thai text, optional), textY } ] }
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, statSync, copyFileSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { comfyGenerate } from './comfy/client.mjs';
import { direct, TRANSITIONS } from './lib/director.mjs';
import { windows, loadBeats, cueTimes } from './lib/timeline.mjs';

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
const report = { job: job.id, started: new Date().toISOString(), steps: [], substitutes: [] };
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
  const segs = [];
  for (const S of job.segments) {
    const out = `${dir}seg_${S.id}.mp4`, max = args['max-seconds'] ? +args['max-seconds'] : null;
    if (S.type === 'story') {
      let [a, b] = S.range; if (max) b = Math.min(b, a + max);
      const inputs = [S, a, b, fileHash(`src/stories/${S.story}/story.js`), fileHash(`src/stories/${S.story}/scene.js`), fileHash(`src/stories/${S.story}/config.js`), fileHash('src/collage/collage.js'), fileHash('src/core.js')];
      await step(`segment:${S.id}`, inputs, out, () => {
        const raw = S.hold > 0 ? out.replace(/\.mp4$/, '.raw.mp4') : out;
        run('node', ['render.mjs', `--story=${S.story}`, '--clip', `--range=${a}:${b}`, `--fps=${fps}`, ...(S.speed && S.speed !== 1 ? [`--speed=${S.speed}`] : []), `--out=${raw}`, ...(S.assets ? [`--assets=${S.assets}`] : []), ...pass], `render ${S.id}`);
        if (S.hold > 0) run('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-vf', `tpad=stop_mode=clone:stop_duration=${max ? Math.min(S.hold, .1) : S.hold}`, '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', out], `hold ${S.id}`);   // a real pause on the last frame
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
  }

  // 3. assemble: per-boundary transitions (the director's choice, or the job's single fade), then the sound: narration
  //    (cut per beat and placed where its shot actually starts, so pauses and transitions never drift it), SFX cues,
  //    an optional low ambience bed. No music. Missing sound files are skipped and reported.
  const final = `${dir}${job.id}.mp4`, fade = args.fade != null ? +args.fade : job.fade ?? .3;
  const have = f => { if (f && existsSync(f)) return f; if (f) report.substitutes.push({ segment: 'audio', substitute: `missing ${f}: skipped` }); return null; };
  const narr = have(job.narration?.audio || job.audio), amb = have(job.ambience?.file);
  const sfx = (job.sfx || []).filter(c => have(c.file));
  await step('assemble', [segs.map(fileHash), fade, job.segments.map(S => S.transition), narr && fileHash(narr), amb && fileHash(amb), job.ambience, sfx.map(c => [c, fileHash(c.file)]), plan?.windows], final, () => {
    const d = segs.map(duration), starts = [0]; let chain = '', last = '[0:v]', t = 0;
    for (let i = 1; i < segs.length; i++) {
      const [name, dur0] = TRANSITIONS[job.segments[i].transition] || ['fade', fade], dur = Math.min(dur0, d[i - 1] / 2, d[i] / 2);
      t += d[i - 1] - dur; starts.push(t);
      chain += `${last}[${i}:v]xfade=transition=${name}:duration=${dur.toFixed(3)}:offset=${t.toFixed(3)}[x${i}];`; last = `[x${i}]`;
    }
    const total = t + d[segs.length - 1], inputs = segs.flatMap(s => ['-i', s]), A = [];
    let k = segs.length; const ms = x => Math.max(0, Math.round(x * 1000));
    if (narr) {
      inputs.push('-i', narr); const n = k++;
      if (plan) plan.windows.forEach((w, i) => A.push(`[${n}:a]atrim=${w.start}:${w.end},asetpts=PTS-STARTPTS,adelay=${ms(starts[i])}:all=1[n${i}]`));
      else A.push(`[${n}:a]anull[n0]`);
    }
    const byBeat = Object.fromEntries(job.segments.map((S, i) => [S.beat || S.id, starts[i]]));
    sfx.forEach((c, i) => { inputs.push('-i', c.file); const at = c.at ?? ((byBeat[c.beat] ?? 0) + (c.offset || 0));
      A.push(`[${k++}:a]volume=${c.gain ?? 1},adelay=${ms(at)}:all=1[s${i}]`); });
    if (amb) { inputs.push('-stream_loop', '-1', '-i', amb); A.push(`[${k++}:a]volume=${job.ambience.gain ?? .12},afade=t=in:d=1,afade=t=out:st=${Math.max(0, total - 1.5).toFixed(2)}:d=1.5[amb]`); }
    const labels = A.map(f => f.match(/\[(\w+)\]$/)[1]);
    const mix = labels.length ? `;${A.join(';')};${labels.map(l => `[${l}]`).join('')}amix=inputs=${labels.length}:normalize=0,apad,atrim=0:${total.toFixed(3)}[a]` : '';
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
