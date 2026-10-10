// studio/server.mjs: MOTION STUDIO, one program from a story to a finished video.
//   node studio/server.mjs [--port=4747] [--no-open]        (Windows: double-click MotionStudio.bat)
// A local web app (http://127.0.0.1:4747, this computer only). Each button runs one step of the pipeline; "AUTO" runs
// them all in order and stops at the first problem. Steps (each is an existing tool, run as a job with a live log):
//   1 story + settings → 2 Opus Director (style, Thai script, shot manifest; studio/director.mjs) → 3 compile
//   (tools/compile_plan.mjs, blocked shots repaired by Opus once) → 4 footage plates (tools/footage.py) → 5 artwork
//   (tools/gen_assets.mjs on your ComfyUI, or labelled mock stand-ins) → 6 preview contact sheet (+ optional Opus review)
//   → 7 final render (tools/pipeline.mjs).
// Projects live in projects/<id>/ (not committed). Settings: studio/config.local.json (not committed), all optional:
//   { "provider": "claude-code" (your Claude plan, default) | "api", "claudeModel": "opus", "anthropicApiKey": "...",
//     "python": "python", "renderFlags": [], "comfyEngines": "tools/comfy/engines.local.json", "footageWidth": 1920 }
import http from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, createReadStream } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as D from './director.mjs';
import { handleWorkspace } from './workspace.mjs';

process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), '..'));   // run from the repository root
const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
const PORT = +(args.port || 4747), ROOT = process.cwd();
const cfg = () => D.loadConfig();
const PY = () => cfg().python || (process.platform === 'win32' ? 'python' : 'python3');
const RF = () => cfg().renderFlags || [];
const ENGINES = () => cfg().comfyEngines || 'tools/comfy/engines.local.json';

// ---------- projects ----------
const PDIR = id => `projects/${id}/`;
const okId = id => /^[a-z0-9][a-z0-9_]{0,40}$/.test(id || '');
const rj = (f, d = null) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch (e) { return d; } };
const wj = (f, v) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(v, null, 2)); };
function projectView(id) {
  const P = rj(PDIR(id) + 'project.json'); if (!P) return null;
  const rep = rj(`out/plans/${id}/compile_report.json`), out = `out/pipeline/${id}/${id}.mp4`;
  return { project: P, director: rj(PDIR(id) + 'director.json'), manifest: rj(PDIR(id) + 'manifest.json'), report: rep,
    preview: existsSync(PDIR(id) + 'preview.jpg') ? `/files/${PDIR(id)}preview.jpg?v=${statSync(PDIR(id) + 'preview.jpg').mtimeMs}` : null,
    video: existsSync(out) ? `/files/${out}?v=${statSync(out).mtimeMs}` : null, videoPath: existsSync(out) ? resolve(out) : null,
    compiled: existsSync(`src/stories/_plan_${id}/plan.js`) };
}
const listProjects = () => existsSync('projects') ? readdirSync('projects').filter(d => existsSync(PDIR(d) + 'project.json')).map(d => ({ id: d, title: rj(PDIR(d) + 'project.json').title || d })) : [];

// ---------- jobs: one at a time, each a list of steps, with a live log ----------
let JOB = null;
const log = m => { if (!JOB) return; for (const l of String(m).split(/\r?\n/)) if (l.trim()) JOB.log.push(l.replace(/\x1b\[[0-9;]*m/g, '')); if (JOB.log.length > 4000) JOB.log.splice(0, JOB.log.length - 4000); };
function run(cmd, argv, { allowFail = false } = {}) {   // a tool as a child process; its output goes to the job log
  return new Promise((res, rej) => {
    log(`$ ${cmd} ${argv.join(' ')}`);
    const p = spawn(cmd, argv, { cwd: ROOT, shell: false }); JOB.child = p;
    p.stdout.on('data', d => log(d)); p.stderr.on('data', d => log(d));
    p.on('error', e => rej(new Error(`${cmd}: ${e.message}`)));
    p.on('close', code => { JOB.child = null; if (code === 0 || allowFail) res(code); else rej(new Error(`${cmd} ${argv[0]} exited with ${code}`)); });
  });
}
function startJob(name, steps) {
  if (JOB && JOB.status === 'running') throw new Error('another step is running: wait for it, or stop it');
  JOB = { name, status: 'running', log: [], started: Date.now(), step: '' };
  (async () => {
    try { for (const [label, fn] of steps) { JOB.step = label; log(`\n━━ ${label}`); await fn(); } JOB.status = 'done'; log('\n✔ done'); }
    catch (e) { JOB.status = 'failed'; log('\n✖ ' + e.message); }
  })();
}

// ---------- the steps ----------
async function catalog() {   // the live capability catalog (what the engine can render), refreshed when the engine changes
  const f = 'out/capabilities.json', newest = ['src/collage/collage.js', 'src/type/kinetic.js', ...readdirSync('src/presets').filter(x => x.endsWith('.js')).map(x => 'src/presets/' + x)].map(x => statSync(x).mtimeMs);
  if (!existsSync(f) || statSync(f).mtimeMs < Math.max(...newest)) await run('node', ['tools/capabilities.mjs', `--out=${f}`, ...RF()]);
  return rj(f);
}
const api = () => { const c = cfg(); if (!D.hasCredentials(c)) throw new Error((c.provider || 'claude-code') === 'claude-code' ? 'Claude Code was not found: install it (npm install -g @anthropic-ai/claude-code), run "claude" once and log in with your Claude plan, or use the no-AI test' : 'no Claude API key: put "anthropicApiKey" in studio/config.local.json (or set ANTHROPIC_API_KEY)'); return D.client(c); };
function saveDirection(id, out, kind) {
  const prev = rj(PDIR(id) + 'director.json', { history: [] });
  wj(PDIR(id) + 'director.json', { title: out.title, logline: out.logline, style: out.style, notes: out.notes || prev.notes || [], history: [...(prev.history || []), { kind, at: new Date().toISOString(), usage: out.usage || null }] });
  wj(PDIR(id) + 'manifest.json', out.manifest);
  if (out.usage) log(out.usage.plan ? `Claude (${out.usage.model}, your plan): ${out.usage.input} in / ${out.usage.output} out tokens, no API charge` : `Opus API: ${out.usage.input} in / ${out.usage.output} out tokens (cache read ${out.usage.cacheRead}), ≈ $${out.usage.cost}`);
}
async function stepDirect(id, mode) {
  const P = rj(PDIR(id) + 'project.json');
  if (!P.story?.trim()) throw new Error('write the story first');
  if (mode === 'test') { saveDirection(id, D.testDirect(P), 'test'); log('no-AI test layout written'); return; }
  const cat = await catalog(); log('asking Opus to direct the film (one call; a minute or two)…');
  // the director sees a frame of every footage clip (to place stickers on what is really in the shot)
  P.footage = (P.footage || []).map(c => ({ ...c, thumb: c.dir && existsSync(c.dir + 'thumb.jpg') ? readFileSync(c.dir + 'thumb.jpg').toString('base64') : null }));
  if (P.footage.some(c => !c.dir)) throw new Error('prepare the footage plates first (button: เตรียมฟุตเทจ)');
  saveDirection(id, await D.direct(api(), cat, P, { log }), 'direct');
}
// the project's sound and finishing settings go into the manifest before every compile (so changing them needs no new direction)
function applySettings(P, m) {
  const M = rj(m), A = { ...(M.audio || {}) };
  if (P.narration?.file) A.narration = { measured: false, ...A.narration, file: P.narration.file }; else delete A.narration;
  if (P.music?.file) A.music = { gain: .22, duck: .7, ...(A.music || {}), file: P.music.file }; else delete A.music;
  if (P.sfx === false) A.sfx = false; else delete A.sfx;
  M.audio = A; M.subtitles = P.subtitles !== false; M.polish = P.polish !== false;
  wj(m, M);
}
async function stepCompile(id, { repair = true } = {}) {
  const P = rj(PDIR(id) + 'project.json'), m = PDIR(id) + 'manifest.json'; if (!existsSync(m)) throw new Error('no manifest yet: run the Director first');
  applySettings(P, m);
  if (P.sfx !== false && !existsSync('assets/sfx/pop/starter_1.wav')) { log('making the starter SFX pack (once)…'); await run(PY(), ['tools/make_sfx.py'], { allowFail: true }); }
  await catalog();
  for (const a of [P.aspect]) {
    const code = await run('node', ['tools/compile_plan.mjs', `--manifest=${m}`, '--catalog=out/capabilities.json', ...(a !== rj(m).aspect ? [`--aspect=${a}`] : [])], { allowFail: true });
    if (code === 0) return;
    const rep = rj(`out/plans/${id}/compile_report.json`);
    if (code !== 1 || !repair || !rep || rj(PDIR(id) + 'director.json')?.history?.at(-1)?.kind === 'test') throw new Error('the compiler blocked some shots (see the log)');
    log('asking Opus to fix the blocked shots (one call)…');
    saveDirection(id, await D.repair(api(), rj('out/capabilities.json'), P, rj(m), rep, { log }), 'repair');
    applySettings(P, m);
    if (await run('node', ['tools/compile_plan.mjs', `--manifest=${m}`, '--catalog=out/capabilities.json'], { allowFail: true }) !== 0) throw new Error('still blocked after one repair: see the log, edit the manifest, or direct again');
  }
}
async function stepFootage(id) {
  const P = rj(PDIR(id) + 'project.json'); if (!P.footage?.length) { log('no footage clips in this project'); return; }
  for (const c of P.footage) {
    const dir = `assets/stories/${id}/footage/${c.name}/`;
    await run(PY(), ['tools/footage.py', 'prepare', '--in', c.path, '--out', dir, ...(c.start ? ['--start', String(c.start)] : []), ...(c.end ? ['--end', String(c.end)] : []), '--width', String(cfg().footageWidth || 1920)]);
    await run(PY(), ['tools/footage.py', 'track', '--dir', dir]);
    const meta = rj(dir + 'meta.json'), mid = Math.max(1, Math.round(meta.frames / 2));
    spawnSync(PY(), ['-c', `from PIL import Image; im=Image.open(r'${dir}f${String(mid).padStart(5, '0')}.jpg'); im.thumbnail((768,768)); im.save(r'${dir}thumb.jpg', quality=82)`]);
    Object.assign(c, { dir, duration: meta.duration, size: meta.size });
  }
  wj(PDIR(id) + 'project.json', P);
}
const mockDir = id => `out/mock_assets/${id}/`;
async function stepArt(id, mode) {
  const st = `_plan_${id}`; if (!existsSync(`src/stories/${st}/plan.js`)) throw new Error('compile first');
  if (mode === 'preflight') return run('node', ['tools/comfy/preflight.mjs', `--engines=${ENGINES()}`]);
  if (mode === 'dry') return run('node', ['tools/gen_assets.mjs', `--story=${st}`, '--dry']);
  if (mode === 'mock') return run('node', ['tools/gen_assets.mjs', `--story=${st}`, '--mock', `--out=${mockDir(id)}`]);
  if (mode === 'validate') return run('node', ['tools/validate_assets.mjs', `--story=${st}`]);
  await run('node', ['tools/gen_assets.mjs', `--story=${st}`, `--engines=${ENGINES()}`, `--python=${PY()}`]);
  await run('node', ['tools/validate_assets.mjs', `--story=${st}`]);
}
const hasRealArt = id => { const r = spawnSync('node', ['tools/validate_assets.mjs', `--story=_plan_${id}`], { cwd: ROOT, encoding: 'utf8' }); return r.status === 0; };
async function stepPreview(id) {
  const P = rj(PDIR(id) + 'project.json'), M = rj(PDIR(id) + 'manifest.json'); if (!M) throw new Error('no manifest');
  const times = M.shots.map(s => +((s.start + s.end) / 2).toFixed(2)), real = hasRealArt(id);
  if (!real) log('artwork not complete: the preview uses the mock stand-ins (labelled MOCK)');
  await run('node', ['render.mjs', `--story=_plan_${id}`, `--sheet=${times.join(',')}`, `--cols=${Math.min(6, times.length)}`, `--w=${P.aspect === '16:9' ? 360 : 220}`,
    `--out=${PDIR(id)}preview.jpg`, ...(real ? [] : [`--assets=${mockDir(id)}`]), ...RF()]);
}
async function stepReview(id) {
  const P = rj(PDIR(id) + 'project.json'); if (!existsSync(PDIR(id) + 'preview.jpg')) throw new Error('make a preview first');
  log('Opus is looking at the preview (one call)…');
  const out = await D.review(api(), await catalog(), P, rj(PDIR(id) + 'manifest.json'), readFileSync(PDIR(id) + 'preview.jpg').toString('base64'), { log });
  saveDirection(id, out, 'review'); for (const n of out.notes) log('• ' + n);
}
async function stepRender(id) {
  if (!hasRealArt(id)) throw new Error('the artwork is not complete (validate_assets fails): generate it before the final render');
  await run('node', ['tools/pipeline.mjs', `--job=out/plans/${id}/job.json`, `--python=${PY()}`, ...RF()]);
}
function autoSteps(id, opts) {
  const P = rj(PDIR(id) + 'project.json');
  return [
    ...(P.footage?.length ? [['footage plates', () => stepFootage(id)]] : []),
    ['Opus Director', () => stepDirect(id, opts.mode || 'opus')],
    ['compile', () => stepCompile(id)],
    ['artwork', () => stepArt(id, opts.art || 'gen')],
    ['preview', () => stepPreview(id)],
    ...(opts.review ? [['Opus review', () => stepReview(id)], ['compile', () => stepCompile(id)], ['artwork', () => stepArt(id, opts.art || 'gen')], ['preview', () => stepPreview(id)]] : []),
    ...(opts.render ? [['final render', () => stepRender(id)]] : []),
  ];
}

// ---------- http ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4', '.css': 'text/css', '.woff2': 'font/woff2' };
const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(type === 'application/json' ? JSON.stringify(body) : body); };
const body = req => new Promise(r => { let b = ''; req.on('data', d => b += d); req.on('end', () => { try { r(b ? JSON.parse(b) : {}); } catch (e) { r({}); } }); });
function serveFile(res, rel, req) {
  const f = resolve(ROOT, decodeURIComponent(rel)); const allowed = ['projects', 'out', 'studio', 'assets/stories', 'assets/fonts'].some(d => f.startsWith(resolve(ROOT, d) + (process.platform === 'win32' ? '\\' : '/')));
  if (!allowed || !existsSync(f) || !statSync(f).isFile()) return send(res, 404, { error: 'not found' });
  const size = statSync(f).size, range = req.headers.range, type = MIME[extname(f)] || 'application/octet-stream';
  if (range && type === 'video/mp4') { const [a, b] = range.replace('bytes=', '').split('-').map(Number), end = b || size - 1;
    res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${a}-${end}/${size}`, 'accept-ranges': 'bytes', 'content-length': end - a + 1 }); return createReadStream(f, { start: a, end }).pipe(res); }
  res.writeHead(200, { 'content-type': type, 'content-length': size }); createReadStream(f).pipe(res);
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x'), p = url.pathname, m = p.match(/^\/api\/project\/([^/]+)(?:\/(\w+))?$/);
    if (p === '/' || p === '/index.html') return send(res, 200, readFileSync('studio/app.html'), MIME['.html']);
    if (p.startsWith('/files/')) return serveFile(res, p.slice(7), req);
    if (await handleWorkspace(p, req, res, { send, body, cfg, PY, RF, run, startJob })) return;
    if (p === '/api/state') { const c = cfg(); return send(res, 200, { projects: listProjects(), credentials: D.hasCredentials(c), provider: c.provider || 'claude-code', comfy: existsSync(ENGINES()), model: (c.provider || 'claude-code') === 'claude-code' ? (c.claudeModel || 'opus') + ' (Claude Code, your plan)' : D.MODEL + ' (API)', job: JOB && { name: JOB.name, status: JOB.status, step: JOB.step } }); }
    if (p === '/api/job') return send(res, 200, JOB ? { name: JOB.name, status: JOB.status, step: JOB.step, log: JOB.log.slice(+(url.searchParams.get('from') || 0)), total: JOB.log.length } : { status: 'idle', log: [], total: 0 });
    if (p === '/api/job/stop' && req.method === 'POST') { if (JOB?.child) JOB.child.kill(); if (JOB) { JOB.status = 'failed'; log('stopped by you'); } return send(res, 200, { ok: true }); }
    if (p === '/api/project' && req.method === 'POST') {
      const b = await body(req); if (!okId(b.id)) return send(res, 400, { error: 'project id: small letters, digits and _ only (e.g. chiangmai_trip)' });
      const P = { ...(rj(PDIR(b.id) + 'project.json') || {}), ...b, footage: (b.footage || []).filter(c => c.path && c.name).map(c => ({ ...c, name: c.name.toLowerCase().replace(/[^a-z0-9_]/g, '_') })) };
      wj(PDIR(b.id) + 'project.json', P); return send(res, 200, projectView(b.id));
    }
    if (m) {
      const id = m[1], act = m[2]; if (!okId(id) || !existsSync(PDIR(id) + 'project.json')) return send(res, 404, { error: 'no such project' });
      if (!act && req.method === 'GET') return send(res, 200, projectView(id));
      if (act === 'manifest' && req.method === 'PUT') { const b = await body(req); if (!b.shots) return send(res, 400, { error: 'not a manifest' }); wj(PDIR(id) + 'manifest.json', b); return send(res, 200, projectView(id)); }
      const b = await body(req);
      const steps = { direct: [['Opus Director', () => stepDirect(id, b.mode)]], compile: [['compile', () => stepCompile(id)]], footage: [['footage plates', () => stepFootage(id)]],
        art: [['artwork: ' + (b.mode || 'gen'), () => stepArt(id, b.mode)]], preview: [['preview', () => stepPreview(id)]], review: [['Opus review', () => stepReview(id)], ['compile', () => stepCompile(id)], ['preview', () => stepPreview(id)]],
        render: [['final render', () => stepRender(id)]], auto: autoSteps(id, b) }[act];
      if (!steps) return send(res, 404, { error: 'unknown action' });
      startJob(`${act} · ${id}`, steps); return send(res, 200, { ok: true });
    }
    send(res, 404, { error: 'not found' });
  } catch (e) { send(res, 500, { error: e.message }); }
});
const openBrowser = url => spawn(process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open', process.platform === 'win32' ? ['/c', 'start', '', url] : [url], { detached: true, stdio: 'ignore' }).on('error', () => {});
server.on('error', e => {   // already running (opened twice): just show the open studio
  if (e.code === 'EADDRINUSE') { console.log(`Motion Studio is already running: http://127.0.0.1:${PORT}/`); if (!args['no-open']) openBrowser(`http://127.0.0.1:${PORT}/`); setTimeout(() => process.exit(0), 500); }
  else throw e;
});
server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}/`; console.log(`Motion Studio: ${url}  (Ctrl+C to quit)`);
  if (!args['no-open']) spawn(process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open', process.platform === 'win32' ? ['/c', 'start', '', url] : [url], { detached: true, stdio: 'ignore' }).on('error', () => {});
});
