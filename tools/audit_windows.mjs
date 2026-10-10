// tools/audit_windows.mjs: END-TO-END AUDIT of the local install (made for Windows, runs anywhere). It only RUNS the
// existing tools and measures what they produce; it writes nothing outside out/audit/<stamp>/ except generated, git-
// ignored engine files (src/stories/_plan_audit_* / _act_audit_*, assets/action/audit_*, starter SFX, .cache/).
// Never touched: your projects/, studio/config.local.json, tools/comfy/engines.local.json (read only), your artwork
// folders (the 30 s film works on a COPY of assets/stories/stone_friends/), the AutoCinematic folder (patch checks are
// `git apply --check`, read only). No MOCK result counts as a PASS.
//
//   node tools/audit_windows.mjs --python="C:\ComfyUI_windows_portable\python_embeded\python.exe"
//        [--autocinematic="D:\AI\AutoCinematic_Story_Studio_V12.9.36.3_PDF_RESEARCH_FULL_WITH_RUNNER"]
//        [--narration=<voice.wav|mp3>]   a real Thai voice for the 30 s film (without it the film has SFX only)
//        [--claude-call]                 also send ONE tiny prompt through Claude Code (uses your plan)
//        [--only=git,tools,...] [--skip=film,...]   steps: git tools catalog tests studio claude comfy rig demo cache patches film
//        [--chrome=<path>] [--soft-gl]
// Output: out/audit/<stamp>/REPORT.md and report.json (PASS / FAIL / WARN / SKIP per check, output locations, problems).
import { spawnSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { tmpdir } from 'node:os';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
const WIN = process.platform === 'win32', PY = args.python || (WIN ? 'python' : 'python3');
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19), DIR = `out/audit/${stamp}/`; mkdirSync(DIR, { recursive: true });
const only = args.only ? String(args.only).split(',') : null, skip = String(args.skip || '').split(',');
const want = s => (!only || only.includes(s)) && !skip.includes(s);
const pass = [...(args.chrome ? [`--chrome=${args.chrome}`] : []), ...(args['soft-gl'] ? ['--soft-gl'] : [])];
const R = { started: new Date().toISOString(), platform: `${process.platform} ${process.arch}`, checks: [], outputs: [], problems: [] };
const LOG = DIR + 'audit.log';
const log = s => { console.log(s); writeFileSync(LOG, s + '\n', { flag: 'a' }); };
function check(step, name, status, detail = '', out = null) {
  R.checks.push({ step, name, status, detail }); if (out) R.outputs.push({ step, what: name, where: out });
  if (status === 'FAIL') R.problems.push(`${step} / ${name}: ${detail}`);
  log(`  ${status.padEnd(4)}  ${name}${detail ? '  — ' + detail : ''}`);
}
// run a command, bounded; .cmd shims (npm, claude) need a shell on Windows
function sh(cmd, a = [], { timeout = 600, cwd } = {}) {
  const r = spawnSync(cmd, a, { encoding: 'utf8', timeout: timeout * 1000, cwd, shell: WIN && !/\.exe$/i.test(cmd) && !['node', 'ffmpeg', 'ffprobe', 'git'].includes(cmd), maxBuffer: 1 << 26 });
  const text = (r.stdout || '') + (r.stderr || '');
  writeFileSync(LOG, `$ ${cmd} ${a.join(' ')}\n${text}\n`, { flag: 'a' });
  return { code: r.error ? (r.error.code === 'ETIMEDOUT' ? 'timeout' : r.error.message) : r.status, out: text };
}
const last = (t, n = 1) => t.trim().split('\n').slice(-n).join(' | ').slice(0, 300);
const probe = f => { const r = sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', f]); try { return JSON.parse(r.out.slice(r.out.indexOf('{'))); } catch { return null; } };
const meanVolume = f => { const m = sh('ffmpeg', ['-i', f, '-af', 'volumedetect', '-f', 'null', '-']).out.match(/mean_volume: (-?[\d.]+) dB/); return m ? +m[1] : null; };
async function http(url, ms = 4000) { try { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); const r = await fetch(url, { signal: c.signal }); clearTimeout(t); return { status: r.status, text: await r.text() }; } catch (e) { return { status: 0, text: e.message }; } }
const step = (id, title) => { log(`\n== ${id}: ${title}`); return want(id); };

// 1. git: what is checked out, and is it the latest main?
if (step('git', 'repository is the latest main')) {
  const br = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']).out.trim(), head = sh('git', ['log', '-1', '--format=%h %ad %s', '--date=short']).out.trim();
  const dirty = sh('git', ['status', '--porcelain']).out.split('\n').filter(Boolean);
  const f = sh('git', ['fetch', 'origin', 'main'], { timeout: 120 });
  const behind = f.code === 0 ? +sh('git', ['rev-list', '--count', 'HEAD..origin/main']).out.trim() : null;
  check('git', 'checked out', 'PASS', `${br} @ ${head}`);
  check('git', 'up to date with origin/main', behind === 0 ? 'PASS' : behind == null ? 'WARN' : 'FAIL', behind == null ? `fetch failed: ${last(f.out)}` : behind ? `${behind} commit(s) behind: run "git pull origin main"` : 'yes');
  check('git', 'local changes', dirty.length ? 'WARN' : 'PASS', dirty.length ? `${dirty.length} uncommitted/untracked file(s) (kept as they are): ${dirty.slice(0, 6).map(l => l.slice(3)).join(', ')}${dirty.length > 6 ? ', …' : ''}` : 'none');
}

// 2. tools on PATH
if (step('tools', 'required programs')) {
  for (const [n, c, a] of [['Node.js', 'node', ['--version']], ['npm', 'npm', ['--version']], ['ffmpeg', 'ffmpeg', ['-version']], ['ffprobe', 'ffprobe', ['-version']], ['Python (ComfyUI)', PY, ['--version']], ['Git', 'git', ['--version']]]) {
    const r = sh(c, a, { timeout: 30 }); check('tools', n, r.code === 0 ? 'PASS' : 'FAIL', r.code === 0 ? r.out.split('\n')[0].trim().slice(0, 80) : `not found (${c})`);
  }
  const mods = ['puppeteer-core', 'p5', 'p5.brush', 'd3-geo', '@anthropic-ai/sdk'].filter(m => !existsSync(`node_modules/${m}`));
  check('tools', 'node packages', mods.length ? 'FAIL' : 'PASS', mods.length ? `missing ${mods.join(', ')}: run "npm install"` : 'installed');
  const py = sh(PY, ['-c', 'import numpy, PIL; print("ok")'], { timeout: 60 });
  check('tools', 'Python numpy + Pillow', /ok/.test(py.out) ? 'PASS' : 'FAIL', /ok/.test(py.out) ? '' : last(py.out));
}

// 3. the capability catalog: motion presets + the 33 Action Composer presets (read from the engine itself)
const CAT = DIR + 'capabilities.json';
if (step('catalog', 'motion presets and Action Composer presets')) {
  const r = sh('node', ['tools/capabilities.mjs', `--out=${CAT}`, ...pass], { timeout: 300 });
  if (r.code !== 0) check('catalog', 'capability catalog', 'FAIL', last(r.out, 2));
  else {
    const cat = JSON.parse(readFileSync(CAT, 'utf8')), caps = cat.capabilities, exp = caps.filter(c => c.status !== 'verified');
    const by = {}; for (const c of caps) (by[c.category] ||= []).push(c.id);
    check('catalog', 'capabilities', 'PASS', `${caps.length} (${Object.entries(by).map(([k, v]) => `${k} ${v.length}`).join(', ')})`, CAT);
    check('catalog', 'experimental capabilities', exp.length ? 'WARN' : 'PASS', exp.length ? exp.map(c => c.id).join(', ') : 'none');
    const n = Object.keys(cat.actions?.presets || {}).length;
    check('catalog', 'Action Composer presets', n === 33 ? 'PASS' : 'FAIL', `${n} of 33: ${Object.keys(cat.actions?.presets || {}).join(' ')}`);
  }
}

// 4. the engine's own fast tests
if (step('tests', 'engine self-tests')) {
  for (const t of ['test_engine.mjs', 'test_audiomix.mjs', 'test_thai_segmentation.mjs']) {
    const r = sh('node', [`tools/${t}`, ...(t === 'test_engine.mjs' ? pass : [])], { timeout: 300 }); check('tests', t, r.code === 0 ? 'PASS' : 'FAIL', last(r.out));
  }
}

// 5. Motion Studio: MotionStudio.bat exists, the server answers, the page loads
if (step('studio', 'MotionStudio.bat and the local web UI')) {
  check('studio', 'MotionStudio.bat', existsSync('MotionStudio.bat') ? 'PASS' : 'FAIL', existsSync('MotionStudio.bat') ? '' : 'missing');
  let server = null, st = await http('http://127.0.0.1:4747/api/state');
  if (st.status !== 200) { server = spawn('node', ['studio/server.mjs'], { stdio: 'ignore' }); for (let i = 0; i < 20 && st.status !== 200; i++) { await new Promise(r => setTimeout(r, 500)); st = await http('http://127.0.0.1:4747/api/state'); } }
  const page = await http('http://127.0.0.1:4747/');
  check('studio', 'web page http://127.0.0.1:4747/', page.status === 200 && /Motion/.test(page.text) ? 'PASS' : 'FAIL', `HTTP ${page.status}${server ? ' (started for the test, stopped after)' : ' (your running studio)'}`);
  if (st.status === 200) {
    const s = JSON.parse(st.text);
    check('studio', 'API /api/state', 'PASS', `${s.projects.length} project(s), provider ${s.provider}, model ${s.model}`);
    check('studio', 'studio sees ComfyUI settings', s.comfy ? 'PASS' : 'FAIL', s.comfy ? 'engines file found' : 'no tools/comfy/engines.local.json');
  } else check('studio', 'API /api/state', 'FAIL', `HTTP ${st.status}: ${st.text.slice(0, 120)}`);
  if (server) server.kill();
}

// 6. Claude Code (the studio's Director runs `claude -p` on your plan)
if (step('claude', 'Claude Code connection')) {
  const v = sh('claude', ['--version'], { timeout: 60 });
  check('claude', 'Claude Code installed', v.code === 0 ? 'PASS' : 'FAIL', v.code === 0 ? v.out.trim().split('\n')[0] : 'not found: npm install -g @anthropic-ai/claude-code, then run claude and /login');
  if (v.code === 0 && args['claude-call']) {
    const r = sh('claude', ['-p', 'Reply with the single word OK.'], { timeout: 180, cwd: tmpdir() });
    check('claude', 'one prompt through your plan', /\bOK\b/i.test(r.out) ? 'PASS' : 'FAIL', last(r.out));
  } else if (v.code === 0) check('claude', 'one prompt through your plan', 'SKIP', 'add --claude-call to test it (one small call on your plan)');
}

// 7. ComfyUI: the engines file (read only) and the server
let comfyOK = false;
if (step('comfy', 'ComfyUI connection')) {
  const f = 'tools/comfy/engines.local.json';
  if (!existsSync(f)) check('comfy', 'engines.local.json', 'FAIL', 'missing: copy tools/comfy/engines.example.json and point it at your exported API workflows');
  else {
    const E = JSON.parse(readFileSync(f, 'utf8')), server = (E.server || 'http://127.0.0.1:8188').replace(/\/$/, '');
    const missing = Object.entries(E.engines || {}).filter(([, e]) => e.workflow && !existsSync(e.workflow)).map(([k]) => k);
    check('comfy', 'engines.local.json', missing.length ? 'FAIL' : 'PASS', `engines: ${Object.keys(E.engines || {}).join(', ')}${missing.length ? `; workflow file missing for ${missing.join(', ')}` : ''}`);
    const r = await http(server + '/system_stats');
    comfyOK = r.status === 200;
    let gpu = ''; try { const d = JSON.parse(r.text).devices?.[0]; gpu = d ? `${d.name}, VRAM ${(d.vram_total / 2 ** 30).toFixed(1)} GB` : ''; } catch {}
    check('comfy', `ComfyUI server ${server}`, comfyOK ? 'PASS' : 'FAIL', comfyOK ? gpu : 'not reachable: start ComfyUI first');
  }
}

// 8. rigging the user's own characters (caveman + dinosaur) with the Action Composer, measured by tools/action/verify.mjs
if (step('rig', 'Action Composer rigging of the caveman and dinosaur reference images')) {
  const src = 'assets/stories/stone_friends/', D = DIR + 'rig/'; mkdirSync(D, { recursive: true });
  const refs = [['TARO', args.caveman || src + 'taro_front.png'], ['DINO', args.dino || src + 'dino_stand.png']];
  const chars = [];
  for (const [id, img] of refs) {
    if (!existsSync(img)) { check('rig', `${id} reference`, 'FAIL', `missing ${img}`); continue; }
    copyFileSync(img, D + basename(img));   // a copy: the analysis never touches your file
    const r = sh(PY, ['tools/action/rig_analyze.py', `--image=${D + basename(img)}`, '--template=human', `--id=${id.toLowerCase()}`, `--out=${D}${id.toLowerCase()}.rig.json`], { timeout: 120 });
    const rig = existsSync(`${D}${id.toLowerCase()}.rig.json`) ? JSON.parse(readFileSync(`${D}${id.toLowerCase()}.rig.json`, 'utf8')) : null;
    const unc = rig ? Object.values(rig.joints).filter(j => j.confidence === 'uncertain').length : 0;
    check('rig', `${id} rig from ${basename(img)}`, !rig ? 'FAIL' : unc ? 'WARN' : 'PASS', rig ? `${Object.keys(rig.joints).length} joints, ${unc} uncertain${r.out.includes('warning') ? ': ' + r.out.split('\n').filter(l => /warning/.test(l)).join('; ').slice(0, 220) : ''}` : last(r.out), `${D}${id.toLowerCase()}.rig.json`);
    if (rig) chars.push({ id, rig: `${id.toLowerCase()}.rig.json` });
  }
  if (chars.length === 2) {
    writeFileSync(D + 'plan.json', JSON.stringify({ schema: 'motion_plan/1', id: 'audit_rig', duration: 4, fps: 24, aspect: '9:16', ground_y: .8, backdrop: { sky: '#EAF1F4', ground: '#D9CBB0' },
      characters: [{ ...chars[0], x: .25, height: .36, facing: 'right' }, { ...chars[1], x: .7, height: .28, facing: 'left' }],
      actions: [{ character: 'TARO', type: 'idle', start: 0, duration: .6 }, { character: 'TARO', type: 'walk', start: .6, duration: 1.8 }, { character: 'TARO', type: 'wave', start: 2.5, duration: 1.3 },
        { character: 'DINO', type: 'idle', start: 0, duration: 1.2 }, { character: 'DINO', type: 'bounce', start: 1.2, duration: 1.4 }, { character: 'DINO', type: 'idle', start: 2.6, duration: 1.4 }] }, null, 1));
    const p = sh('node', ['tools/action/plan.mjs', `--plan=${D}plan.json`], { timeout: 120 });
    if (p.code !== 0) check('rig', 'motion plan', 'FAIL', last(p.out, 2));
    else {
      const s = sh('node', ['render.mjs', '--story=_act_audit_rig', '--sheet=0.3,1.0,1.6,2.2,2.9,3.6', '--cols=6', '--w=240', `--out=${D}sheet.jpg`, ...pass], { timeout: 900 });
      check('rig', 'preview sheet (LOOK AT IT: limbs must stay attached)', s.code === 0 ? 'PASS' : 'FAIL', s.code === 0 ? 'rendered' : last(s.out), D + 'sheet.jpg');
      const v = sh('node', ['tools/action/verify.mjs', '--story=_act_audit_rig', ...pass], { timeout: 900 });
      for (const m of v.out.matchAll(/^(PASS|FAIL)\s+(.+)\n\s+(.+)$/gm)) check('rig', 'verify: ' + m[2].trim(), m[1], m[3].trim());
      if (!/checks passed/.test(v.out)) check('rig', 'verify', 'FAIL', last(v.out, 2));
    }
  }
}

// helpers for the films: copy a fixture manifest under a new id into the audit folder (relative files come along)
function stageManifest(id, newId, edit = M => M) {
  const src = `tools/fixtures/plans/${id}.json`, M = JSON.parse(readFileSync(src, 'utf8')); M.project_id = newId;
  const D = DIR + newId + '/'; mkdirSync(D, { recursive: true });
  for (const f of readdirSync('tools/fixtures/plans')) if (f.startsWith(id) && !f.endsWith('.json')) copyFileSync('tools/fixtures/plans/' + f, D + f);
  writeFileSync(D + 'manifest.json', JSON.stringify(edit(M), null, 1)); return D + 'manifest.json';
}
const segLines = out => ({ rendered: [...out.matchAll(/▶ segment:(\S+)/g)].map(m => m[1]), kept: [...out.matchAll(/segment:(\S+) \((?:done|passed) before/g)].map(m => m[1]) });
function filmCheck(stepId, id, { seconds, audio }) {
  const mp4 = `out/pipeline/${id}/${id}.mp4`, rep = `out/pipeline/${id}/report.json`;
  if (!existsSync(mp4)) return check(stepId, 'final MP4', 'FAIL', 'not produced: see ' + `out/pipeline/${id}/pipeline.log`), false;
  const p = probe(mp4), v = p?.streams?.find(s => s.codec_type === 'video'), a = p?.streams?.find(s => s.codec_type === 'audio'), d = +(p?.format?.duration || 0);
  check(stepId, 'final MP4', v ? 'PASS' : 'FAIL', `${v?.width}x${v?.height}, ${d.toFixed(2)} s, ${(statSync(mp4).size / 2 ** 20).toFixed(1)} MB`, mp4);
  if (seconds) check(stepId, `length ≈ ${seconds} s`, Math.abs(d - seconds) <= 1.5 ? 'PASS' : 'FAIL', `${d.toFixed(2)} s`);
  if (audio) { const mv = a ? meanVolume(mp4) : null; check(stepId, 'audio track', a && mv != null && mv > -60 ? 'PASS' : 'FAIL', a ? `mean ${mv} dB` : 'no audio stream'); }
  const R2 = existsSync(rep) ? JSON.parse(readFileSync(rep, 'utf8')) : null;
  const segs = Object.entries(R2?.segments || {}).map(([id, s]) => ({ id, ...s })), bad = segs.filter(s => !s.ok || s.motion?.pass === false);
  if (segs.length) check(stepId, 'motion verification per scene', bad.length ? 'FAIL' : 'PASS', `${segs.length - bad.length}/${segs.length} scenes move as planned${bad.length ? '; static: ' + bad.map(s => s.id).join(', ') : ''}`);
  for (const s of R2?.substitutes || []) check(stepId, `substitute in ${s.segment}`, 'WARN', s.substitute);
  return true;
}

// 9. Motion Only demo (no LTX, no AI video, no artwork generation): the Magellan map prototype, full length
if (step('demo', 'Motion Only demo (map prototype, ~10 s, no LTX / AI video)')) {
  const m = stageManifest('magellan_proto', 'audit_motion_only');
  const c = sh('node', ['tools/compile_plan.mjs', `--manifest=${m}`, `--catalog=${existsSync(CAT) ? CAT : 'out/capabilities.json'}`, ...pass], { timeout: 300 });
  check('demo', 'compile shot manifest', c.code === 0 ? 'PASS' : 'FAIL', last(c.out));
  if (c.code === 0) {
    const t0 = Date.now(), r = sh('node', ['tools/pipeline.mjs', '--job=out/plans/audit_motion_only/job.json', `--python=${PY}`, '--force=all', ...pass], { timeout: 3600 });
    check('demo', 'render all scenes', r.code === 0 ? 'PASS' : 'FAIL', `${Math.round((Date.now() - t0) / 1000)} s; ${last(r.out)}`);
    filmCheck('demo', 'audit_motion_only', { seconds: null, audio: false });
  }
}

// 10. caching and failed-only re-rendering, on the demo above
if (step('cache', 'caching and failed-only re-rendering')) {
  const job = 'out/plans/audit_motion_only/job.json', state = 'out/pipeline/audit_motion_only/state.json';
  if (!existsSync(state)) check('cache', 'needs the demo step', 'SKIP', 'run the demo step first');
  else {
    const t0 = Date.now(), r = sh('node', ['tools/pipeline.mjs', `--job=${job}`, `--python=${PY}`, ...pass], { timeout: 600 }), L = segLines(r.out), dt = (Date.now() - t0) / 1000;
    check('cache', 'rerun reuses every finished scene', L.rendered.length === 0 && r.code === 0 ? 'PASS' : 'FAIL', `${dt.toFixed(1)} s, re-rendered: ${L.rendered.join(', ') || 'none'}`);
    const S = JSON.parse(readFileSync(state, 'utf8')), victim = Object.keys(S).filter(k => k.startsWith('segment:')).pop();
    S[victim] = { ...S[victim], ok: false, error: 'marked failed by the audit' }; writeFileSync(state, JSON.stringify(S, null, 1));
    const f = sh('node', ['tools/pipeline.mjs', `--job=${job}`, `--python=${PY}`, '--failed-only', ...pass], { timeout: 3600 }), F = segLines(f.out);
    check('cache', `--failed-only re-renders only ${victim.slice(8)}`, f.code === 0 && F.rendered.length === 1 && F.rendered[0] === victim.slice(8) ? 'PASS' : 'FAIL', `re-rendered: ${F.rendered.join(', ') || 'none'}; kept: ${F.kept.join(', ') || 'none'}`);
  }
}

// 11. AutoCinematic: which of the repository's patches are installed (read-only `git apply --check`)
if (step('patches', 'AutoCinematic integration patches')) {
  const AC = args.autocinematic || 'D:/AI/AutoCinematic_Story_Studio_V12.9.36.3_PDF_RESEARCH_FULL_WITH_RUNNER';
  if (!existsSync(AC)) check('patches', 'AutoCinematic folder', 'FAIL', `not found: ${AC} (pass --autocinematic=<folder>)`);
  else {
    check('patches', 'AutoCinematic folder', 'PASS', AC);
    for (const p of readdirSync('patches').filter(f => f.endsWith('.patch')).sort()) {
      const abs = resolve('patches', p), rev = sh('git', ['apply', '--check', '--reverse', abs], { cwd: AC, timeout: 60 }), fwd = rev.code === 0 ? null : sh('git', ['apply', '--check', abs], { cwd: AC, timeout: 60 });
      check('patches', p, rev.code === 0 ? 'PASS' : 'FAIL', rev.code === 0 ? 'installed' : fwd.code === 0 ? 'NOT installed (it would apply cleanly)' : `not installed and does not apply: ${last(fwd.out)}`);
    }
    const app = join(AC, 'app.py'); if (existsSync(app)) { const s = readFileSync(app, 'utf8'); check('patches', 'Action Composer button in app.py', /Action Composer/.test(s) ? 'PASS' : 'FAIL', /Action Composer/.test(s) ? 'found' : 'not found'); }
    const py = sh(PY, ['-m', 'py_compile', app], { timeout: 60 }); if (existsSync(app)) check('patches', 'app.py compiles', py.code === 0 ? 'PASS' : 'FAIL', py.code === 0 ? '' : last(py.out));
  }
}

// 12. one complete 30 s animation with audio: "stone_friends" (6 shots, your caveman + dinosaur art), on a COPY of the art folder
if (step('film', 'complete 30 s animation with audio (stone_friends)')) {
  const ART = DIR + 'art/stone_friends/'; mkdirSync(ART, { recursive: true });
  for (const f of readdirSync('assets/stories/stone_friends')) if (/\.png$/i.test(f)) copyFileSync('assets/stories/stone_friends/' + f, ART + f);
  // starter SFX (synthesized locally, never AI); kept in assets/sfx/<category>/starter_*.wav, ignored by git
  const sfx = sh(PY, ['tools/make_sfx.py'], { timeout: 300 }); check('film', 'starter SFX pack', sfx.code === 0 ? 'PASS' : 'FAIL', last(sfx.out));
  const voice = args.narration && existsSync(args.narration) ? resolve(args.narration) : null;
  if (args.narration && !voice) check('film', 'narration file', 'FAIL', `not found: ${args.narration}`);
  if (!voice) check('film', 'narration voice', 'WARN', 'no --narration=<file>: the film gets SFX only (the system has no text-to-speech; record or generate the Thai voice and pass it)');
  const m = stageManifest('stone_friends', 'audit_stone_friends', M => {
    for (const s of M.shots) if (s.collage?.assets) s.collage.assets = ART;
    if (voice) M.audio = { ...(M.audio || {}), narration: { file: voice, measured: false } };
    return M;
  });
  const c = sh('node', ['tools/compile_plan.mjs', `--manifest=${m}`, `--catalog=${existsSync(CAT) ? CAT : 'out/capabilities.json'}`, ...pass], { timeout: 300 });
  check('film', 'compile shot manifest', c.code === 0 ? 'PASS' : 'FAIL', last(c.out));
  if (c.code === 0) {
    // artwork first: generate what is missing on YOUR ComfyUI (cached), then validate every layer strictly
    if (!comfyOK && want('comfy')) check('film', 'artwork generation', 'FAIL', 'ComfyUI is not reachable: the missing backgrounds cannot be generated');
    const g = sh('node', ['tools/gen_assets.mjs', '--story=_plan_audit_stone_friends', `--python=${PY}`], { timeout: 7200 });
    const v = sh('node', ['tools/validate_assets.mjs', '--story=_plan_audit_stone_friends'], { timeout: 300 });
    check('film', 'artwork complete and valid', v.code === 0 ? 'PASS' : 'FAIL', v.code === 0 ? last(v.out) : v.out.split('\n').filter(l => /FAIL/.test(l)).map(l => l.trim()).slice(0, 10).join('; '), ART);
    if (v.code === 0) {
      const t0 = Date.now(), r = sh('node', ['tools/pipeline.mjs', '--job=out/plans/audit_stone_friends/job.json', `--python=${PY}`, ...pass], { timeout: 7200 });
      check('film', 'render all scenes + assemble', r.code === 0 ? 'PASS' : 'FAIL', `${Math.round((Date.now() - t0) / 1000)} s; ${last(r.out)}`);
      filmCheck('film', 'audit_stone_friends', { seconds: 30, audio: true });
    } else check('film', 'render', 'SKIP', 'not rendered: a film with missing artwork would show blank shots');
  }
}

// report
R.finished = new Date().toISOString();
const count = s => R.checks.filter(c => c.status === s).length;
R.summary = { PASS: count('PASS'), FAIL: count('FAIL'), WARN: count('WARN'), SKIP: count('SKIP') };
writeFileSync(DIR + 'report.json', JSON.stringify(R, null, 1));
const steps = [...new Set(R.checks.map(c => c.step))];
const md = [`# ClaudeAnimationBase audit — ${R.started.slice(0, 16).replace('T', ' ')}`, '',
  `Platform: ${R.platform}. Result: **${R.summary.PASS} PASS, ${R.summary.FAIL} FAIL, ${R.summary.WARN} WARN, ${R.summary.SKIP} SKIP.** MOCK output is never counted as a PASS.`, '',
  ...steps.flatMap(s => [`## ${s}`, '', '| result | check | detail |', '|---|---|---|', ...R.checks.filter(c => c.step === s).map(c => `| ${c.status} | ${c.name} | ${String(c.detail).replace(/\|/g, '/').replace(/\n/g, ' ')} |`), '']),
  '## Output locations', '', ...R.outputs.map(o => `- ${o.step}: ${o.what} → \`${o.where}\``), '',
  '## Remaining problems', '', ...(R.problems.length ? R.problems.map(p => '- ' + p) : ['- none found by this audit']), '',
  `Full command log: \`${LOG}\``];
writeFileSync(DIR + 'REPORT.md', md.join('\n'));
log(`\n${R.summary.PASS} PASS, ${R.summary.FAIL} FAIL, ${R.summary.WARN} WARN, ${R.summary.SKIP} SKIP → ${DIR}REPORT.md`);
