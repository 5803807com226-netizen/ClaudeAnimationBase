// studio/workspace.mjs: the WORKSPACE half of the studio server: every other tool of the repository behind one set of
// routes, so the studio is the single program (projects stay in server.mjs). Nothing here re-implements a tool: each
// action runs the existing command as a studio job (live log) and the pages read the files those tools write.
//   GET  /api/ws/health      programs, Claude Code, ComfyUI, AutoCinematic folder (cached 20 s)
//   GET  /api/ws/catalog     motion presets (capability catalog) + the Action Composer presets with Thai names
//   GET  /api/ws/videos      finished videos        GET /api/ws/renders   render jobs + per-scene results
//   GET  /api/ws/stories     stories with collage artwork        GET /api/ws/images   character images to pick from
//   GET  /api/ws/rigs        rigged characters      PUT /api/ws/rig/<id>  joints moved by hand in the rig editor
//   GET  /api/ws/audit       the latest audit report
//   GET|POST /api/ws/settings   studio/config.local.json (merged, whitelisted keys; the API key is never sent back)
//   POST /api/ws/run         { tool, ... } one whitelisted tool as a job      POST /api/ws/shutdown   quit the program
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, basename, extname } from 'node:path';
import { ACTION_CATALOG, ACTION_LAYERS } from '../tools/action/plan.mjs';

const WIN = process.platform === 'win32';
const rj = (f, d = null) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };
const url = f => `/files/${f.replace(/\\/g, '/')}?v=${Math.round(statSync(f).mtimeMs)}`;
const okId = id => /^[a-z0-9][a-z0-9_]{0,40}$/.test(id || '');
const ls = d => existsSync(d) ? readdirSync(d) : [];
const SETTINGS = ['python', 'comfyEngines', 'claudeModel', 'provider', 'autocinematic', 'renderFlags', 'footageWidth'];
const CFG_FILE = 'studio/config.local.json';

// quick, bounded probes of the programs the studio drives
let HEALTH = null;
async function health(cfg, PY) {
  if (HEALTH && Date.now() - HEALTH.at < 20000) return HEALTH;
  const ver = (cmd, a) => { const r = spawnSync(cmd, a, { encoding: 'utf8', timeout: 15000, shell: WIN && !['node', 'ffmpeg', 'git'].includes(cmd) }); return r.status === 0 ? ((r.stdout || '') + (r.stderr || '')).trim().split('\n')[0].slice(0, 70) : null; };
  const c = cfg(), engines = c.comfyEngines || 'tools/comfy/engines.local.json', E = rj(engines);
  const server = (E?.server || 'http://127.0.0.1:8188').replace(/\/$/, '');
  let comfy = null; try { const ac = new AbortController(), t = setTimeout(() => ac.abort(), 2500); const r = await fetch(server + '/system_stats', { signal: ac.signal }); clearTimeout(t);
    if (r.ok) { const d = (await r.json()).devices?.[0]; comfy = d ? `${d.name.replace(/^cuda:\d+ /, '')} · VRAM ${(d.vram_total / 2 ** 30).toFixed(0)} GB` : 'ออนไลน์'; } } catch {}
  const ac = c.autocinematic || 'D:/AI/AutoCinematic_Story_Studio_V12.9.36.3_PDF_RESEARCH_FULL_WITH_RUNNER';
  HEALTH = { at: Date.now(), items: [
    { id: 'node', name: 'Node.js', ok: true, detail: process.version },
    { id: 'ffmpeg', name: 'FFmpeg (ตัดต่อวิดีโอ)', ...(v => ({ ok: !!v, detail: v ? v.replace(/ Copyright.*/, '') : 'ไม่พบ: ติดตั้ง ffmpeg แล้วเพิ่มใน PATH' }))(ver('ffmpeg', ['-version'])) },
    { id: 'python', name: 'Python (ของ ComfyUI)', ...(v => ({ ok: !!v, detail: v || `ไม่พบ: ${PY()} (ตั้งค่าได้ที่หน้า ตั้งค่า)` }))(ver(PY(), ['--version'])) },
    { id: 'claude', name: 'Claude Code (ผู้กำกับ Opus)', ...(v => ({ ok: !!v, detail: v ? `${v} · โมเดล ${c.claudeModel || 'opus'}` : 'ไม่พบ: npm install -g @anthropic-ai/claude-code แล้วเปิด claude เพื่อ /login' }))(ver('claude', ['--version'])) },
    { id: 'engines', name: 'ไฟล์ตั้งค่า ComfyUI', ok: !!E, detail: E ? `${engines} · ${Object.keys(E.engines || {}).join(', ')}` : `ไม่พบ ${engines}` },
    { id: 'comfy', name: 'ComfyUI (สร้างภาพ)', ok: !!comfy, detail: comfy || `ติดต่อ ${server} ไม่ได้: เปิด ComfyUI ก่อน` },
    { id: 'autocinematic', name: 'โฟลเดอร์ AutoCinematic', ok: existsSync(ac), detail: ac },
  ] };
  return HEALTH;
}

function catalog(RF) {
  const f = 'out/capabilities.json';
  if (!existsSync(f)) spawnSync('node', ['tools/capabilities.mjs', `--out=${f}`, ...RF()], { timeout: 180000 });
  const C = rj(f, { capabilities: [] });
  return { hash: C.hash, capabilities: C.capabilities, layers: ACTION_LAYERS,
    actions: Object.entries(ACTION_CATALOG).map(([id, a]) => ({ id, th: a.th, about: a.about, layer: a.layer, params: Object.keys(a.params || {}) })) };
}

function videos() {
  const out = [];
  const add = (f, kind, title) => { if (existsSync(f)) out.push({ file: resolve(f), url: url(f), kind, title, size: statSync(f).size, at: statSync(f).mtimeMs }); };
  for (const d of ls('out/pipeline')) add(`out/pipeline/${d}/${d}.mp4`, 'ภาพยนตร์', d);
  for (const d of ls('out/studio/rigs')) for (const f of ls(`out/studio/rigs/${d}`).filter(f => f.endsWith('.mp4'))) add(`out/studio/rigs/${d}/${f}`, 'ตัวละคร', d);
  for (const d of ls('out/action')) for (const f of ls(`out/action/${d}`).filter(f => f.endsWith('.mp4'))) add(`out/action/${d}/${f}`, 'ท่าทาง', d);
  return out.sort((a, b) => b.at - a.at);
}

function renders() {
  const jobs = new Map();
  for (const f of ls('jobs').filter(f => f.endsWith('.json'))) { const j = rj('jobs/' + f); if (j?.id) jobs.set(j.id, { id: j.id, job: 'jobs/' + f, source: 'งานแบบ JSON' }); }
  for (const d of ls('out/plans')) if (existsSync(`out/plans/${d}/job.json`)) jobs.set(d, { id: d, job: `out/plans/${d}/job.json`, source: 'แผนช็อตที่คอมไพล์แล้ว' });
  const fixtures = ls('tools/fixtures/plans').filter(f => f.endsWith('.json')).map(f => { const m = rj('tools/fixtures/plans/' + f); return m?.shots ? { manifest: 'tools/fixtures/plans/' + f, id: m.project_id, title: m.title || m.project_id, shots: m.shots.length, seconds: m.shots.at(-1)?.end, compiled: jobs.has(m.project_id) } : null; }).filter(Boolean);
  const list = [...jobs.values()].map(J => {
    const dir = `out/pipeline/${J.id}/`, R = rj(dir + 'report.json'), S = rj(dir + 'state.json', {}), job = rj(J.job, {});
    const segs = (job.segments || []).map(s => { const st = S[`segment:${s.id}`], jpg = `${dir}seg_${s.id}.jpg`;
      return { id: s.id, done: !!st?.ok, failed: st && !st.ok, error: st?.error || null, motion: st?.motion?.pass ?? null, preview: existsSync(jpg) ? url(jpg) : null }; });
    const mp4 = `${dir}${J.id}.mp4`;
    return { ...J, scenes: segs, video: existsSync(mp4) ? url(mp4) : null, videoFile: existsSync(mp4) ? resolve(mp4) : null, ok: R?.ok ?? null, error: R?.error || null,
      notes: (R?.substitutes || []).map(s => `${s.segment}: ${s.substitute}`), at: existsSync(J.job) ? statSync(J.job).mtimeMs : 0 };
  }).sort((a, b) => b.at - a.at);
  return { jobs: list, fixtures };
}

function stories() {
  return ls('src/stories').filter(d => !d.startsWith('_act_')).map(d => {
    const files = ['scene.js', 'plan.js'].map(f => `src/stories/${d}/${f}`).filter(existsSync);
    const src = files.map(f => readFileSync(f, 'utf8')).join('\n');
    if (!/SCENES\.\w+\s*=/.test(src)) return null;
    const dirs = [...new Set([...src.matchAll(/"?assets"?\s*:\s*["']([^"']+)["']/g)].map(m => m[1]))].filter(x => x.startsWith('assets/') || x.includes('/'));
    const art = dirs.map(x => ({ dir: x, files: ls(x).filter(f => /\.png$/i.test(f)).length }));
    return { id: d, compiled: d.startsWith('_plan_'), scenes: (src.match(/SCENES\.\w+\s*=/g) || []).length, art };
  }).filter(Boolean);
}

function images() {   // character / reference images: the story art folders and the studio's own uploads
  const out = [];
  for (const d of ls('assets/stories')) for (const f of ls(`assets/stories/${d}`).filter(f => /\.png$/i.test(f))) out.push({ group: d, name: f, path: `assets/stories/${d}/${f}`, url: url(`assets/stories/${d}/${f}`) });
  return out;
}

function rigs() {
  return ls('out/studio/rigs').filter(okId).map(id => {
    const d = `out/studio/rigs/${id}/`, rig = rj(`${d}${id}.rig.json`); if (!rig) return null;
    const J = Object.values(rig.joints || {}), V = rj(`out/action/studio_${id}/verify.json`);
    const sheet = `${d}sheet.jpg`, clip = `${d}${id}.mp4`;
    return { id, template: rig.template, image: existsSync(d + rig.image) ? url(d + rig.image) : null, size: rig.size, joints: rig.joints, bones: rig.bones.map(b => [b.from, b.to]),
      counts: { all: J.length, uncertain: J.filter(j => j.confidence === 'uncertain').length, manual: J.filter(j => j.confidence === 'manual').length },
      warnings: rig.warnings || [], plan: rj(`${d}plan.json`), sheet: existsSync(sheet) ? url(sheet) : null, clip: existsSync(clip) ? url(clip) : null,
      verify: V ? { passed: V.checks?.filter(c => c.ok).length ?? null, total: V.checks?.length ?? null, checks: (V.checks || []).map(c => ({ name: c.name, pass: c.ok, detail: c.detail })) } : null };
  }).filter(Boolean);
}

function latestAudit() {
  const d = ls('out/audit').filter(x => existsSync(`out/audit/${x}/report.json`)).sort().pop();
  return d ? { dir: `out/audit/${d}/`, report: rj(`out/audit/${d}/report.json`) } : null;
}

// one whitelisted tool → job steps (each step runs an existing command)
function toolSteps(b, { run, PY, RF, cfg }) {
  const t = b.tool, need = (c, m) => { if (!c) throw new Error(m); };
  switch (t) {
    case 'render': {
      need(typeof b.job === 'string' && /^(jobs|out\/plans)\/[\w./-]+\.json$/.test(b.job) && existsSync(b.job), 'ไม่พบไฟล์งาน');
      const extra = b.mode === 'failed' ? ['--failed-only'] : b.mode === 'force' ? ['--force=all'] : b.mode === 'preview' ? ['--max-seconds=1.5'] : [];
      return [[{ failed: 'เรนเดอร์เฉพาะฉากที่พัง', force: 'เรนเดอร์ใหม่ทั้งหมด', preview: 'เรนเดอร์ทดลอง (ฉากละ 1.5 วินาที)' }[b.mode] || 'เรนเดอร์', () => run('node', ['tools/pipeline.mjs', `--job=${b.job}`, `--python=${PY()}`, ...extra, ...RF()])]];
    }
    case 'compile': {
      need(typeof b.manifest === 'string' && /^(tools\/fixtures\/plans|projects\/[a-z0-9_]+)\/[\w.-]+\.json$/.test(b.manifest) && existsSync(b.manifest), 'ไม่พบแผนช็อต');
      return [['ตรวจและคอมไพล์แผนช็อต', () => run('node', ['tools/compile_plan.mjs', `--manifest=${b.manifest}`, '--catalog=out/capabilities.json', ...(['9:16', '16:9', '4:5'].includes(b.aspect) ? [`--aspect=${b.aspect}`] : []), ...RF()])]];
    }
    case 'art': {
      need(/^[a-z0-9_]+$/i.test(b.story || '') && existsSync(`src/stories/${b.story}`), 'ไม่พบเรื่อง');
      const engines = cfg().comfyEngines || 'tools/comfy/engines.local.json';
      if (b.mode === 'validate') return [['ตรวจภาพประกอบ', () => run('node', ['tools/validate_assets.mjs', `--story=${b.story}`], { allowFail: true })]];
      if (b.mode === 'dry') return [['ดู prompt ที่จะใช้สร้างภาพ', () => run('node', ['tools/gen_assets.mjs', `--story=${b.story}`, '--dry'])]];
      return [['สร้างภาพที่ยังขาด (ComfyUI)', () => run('node', ['tools/gen_assets.mjs', `--story=${b.story}`, `--engines=${engines}`, `--python=${PY()}`], { allowFail: true })],
        ['ตรวจภาพประกอบ', () => run('node', ['tools/validate_assets.mjs', `--story=${b.story}`])]];
    }
    case 'rig': {
      need(okId(b.id), 'ชื่อตัวละคร: ภาษาอังกฤษตัวเล็ก ตัวเลข และ _ เท่านั้น');
      const src = String(b.image || '').trim().replace(/^"|"$/g, ''); need(/\.png$/i.test(src) && existsSync(src), 'ไม่พบไฟล์ภาพ .png (ต้องเป็นภาพพื้นหลังโปร่งใส)');
      need(['human', 'quadruped', 'object'].includes(b.template || 'human'), 'แม่แบบไม่ถูกต้อง');
      need((b.template || 'human') === 'human', 'ตอนนี้เครื่องเล่นท่าทางรองรับเฉพาะแม่แบบ "คน/ยืนสองขา" (แบบสี่ขายังเล่นไม่ได้)');
      const d = `out/studio/rigs/${b.id}/`;
      return [['ตรวจภาพและสร้างโครงกระดูก', () => { mkdirSync(d, { recursive: true }); copyFileSync(src, d + basename(src));
        return run(PY(), ['tools/action/rig_analyze.py', `--image=${d + basename(src)}`, `--template=${b.template || 'human'}`, `--id=${b.id}`, `--out=${d}${b.id}.rig.json`]); }]];
    }
    case 'action': {
      need(okId(b.id) && existsSync(`out/studio/rigs/${b.id}/${b.id}.rig.json`), 'สร้างโครงกระดูกตัวละครก่อน');
      const acts = (b.actions || []).filter(a => ACTION_CATALOG[a.type]).map(a => ({ type: a.type, start: +a.start || 0, duration: Math.max(.1, +a.duration || 1) }));
      need(acts.length, 'เพิ่มท่าทางอย่างน้อย 1 ท่า');
      const dur = Math.max(...acts.map(a => a.start + a.duration)) + .4, d = `out/studio/rigs/${b.id}/`, story = `_act_studio_${b.id}`;
      const plan = { schema: 'motion_plan/1', id: `studio_${b.id}`, duration: +dur.toFixed(2), fps: 24, aspect: ['9:16', '16:9', '4:5'].includes(b.aspect) ? b.aspect : '9:16', ground_y: .8,
        backdrop: { sky: '#EEF2F3', ground: '#DCCFB6' }, characters: [{ id: 'CHAR', rig: `${b.id}.rig.json`, x: Math.min(.8, Math.max(.2, +b.x || .3)), height: .4, facing: b.facing === 'left' ? 'left' : 'right' }], actions: acts };
      writeFileSync(d + 'plan.json', JSON.stringify(plan, null, 1));
      const times = Array.from({ length: 6 }, (_, i) => +(dur * (i + .5) / 6).toFixed(2)).join(',');
      const steps = [['ตรวจแผนท่าทาง', () => run('node', ['tools/action/plan.mjs', `--plan=${d}plan.json`])],
        ['ภาพตัวอย่าง 6 เฟรม', () => run('node', ['render.mjs', `--story=${story}`, `--sheet=${times}`, '--cols=6', '--w=220', `--out=${d}sheet.jpg`, ...RF()])],
        ['วัดคุณภาพการเคลื่อนไหว', () => run('node', ['tools/action/verify.mjs', `--story=${story}`, ...RF()], { allowFail: true })]];
      if (b.clip) steps.push(['เรนเดอร์คลิป', () => run('node', ['render.mjs', `--story=${story}`, '--clip', '--fps=24', `--out=${d}${b.id}.mp4`, ...RF()])]);
      return steps;
    }
    case 'audit': {
      const steps = String(b.steps || '').split(',').filter(s => /^[a-z]+$/.test(s));
      const ac = cfg().autocinematic;
      return [['ตรวจสุขภาพระบบ', () => run('node', ['tools/audit_windows.mjs', `--python=${PY()}`, ...(steps.length ? [`--only=${steps.join(',')}`] : []), ...(b.claudeCall ? ['--claude-call'] : []), ...(ac ? [`--autocinematic=${ac}`] : []), ...RF()], { allowFail: true })]];
    }
    case 'sfx': return [['สร้างชุดเสียงประกอบเริ่มต้น', () => run(PY(), ['tools/make_sfx.py'])]];
    case 'catalog': return [['อ่านความสามารถของเอนจินใหม่', () => run('node', ['tools/capabilities.mjs', '--out=out/capabilities.json', ...RF()])]];
    default: throw new Error('ไม่รู้จักคำสั่ง ' + t);
  }
}

export async function handleWorkspace(p, req, res, ctx) {
  const { send, body, cfg, PY, RF, startJob } = ctx;
  if (!p.startsWith('/api/ws/')) return false;
  const r = p.slice(8);
  if (r === 'health') { if (new URL(req.url, 'http://x').searchParams.has('fresh')) HEALTH = null; send(res, 200, await health(cfg, PY)); return true; }
  if (r === 'catalog') { send(res, 200, catalog(RF)); return true; }
  if (r === 'videos') { send(res, 200, videos()); return true; }
  if (r === 'renders') { send(res, 200, renders()); return true; }
  if (r === 'stories') { send(res, 200, stories()); return true; }
  if (r === 'images') { send(res, 200, images()); return true; }
  if (r === 'rigs') { send(res, 200, rigs()); return true; }
  if (r === 'audit') { send(res, 200, latestAudit()); return true; }
  if (r === 'settings') {
    if (req.method === 'POST') {
      const b = await body(req), cur = rj(CFG_FILE, {});
      for (const k of SETTINGS) if (k in b) { if (b[k] === '' || b[k] == null) delete cur[k]; else cur[k] = b[k]; }
      writeFileSync(CFG_FILE, JSON.stringify(cur, null, 2)); HEALTH = null;
    }
    const c = rj(CFG_FILE, {}); send(res, 200, { ...Object.fromEntries(SETTINGS.filter(k => k in c).map(k => [k, c[k]])), hasApiKey: !!c.anthropicApiKey }); return true;
  }
  const rm = r.match(/^rig\/([a-z0-9_]+)$/);
  if (rm && req.method === 'PUT') {   // joints moved by hand in the rig editor: saved as "manual" (blue in the overlay)
    const f = `out/studio/rigs/${rm[1]}/${rm[1]}.rig.json`, rig = rj(f); if (!rig) { send(res, 404, { error: 'ไม่พบโครงกระดูก' }); return true; }
    const b = await body(req);
    for (const [n, j] of Object.entries(b.joints || {})) if (rig.joints[n] && Number.isFinite(+j.x) && Number.isFinite(+j.y)) rig.joints[n] = { ...rig.joints[n], x: +(+j.x).toFixed(1), y: +(+j.y).toFixed(1), confidence: 'manual' };
    rig.uncertain = Object.entries(rig.joints).filter(([, j]) => j.confidence === 'uncertain').map(([n]) => n);
    writeFileSync(f, JSON.stringify(rig, null, 1)); send(res, 200, { ok: true }); return true;
  }
  if (r === 'run' && req.method === 'POST') { const b = await body(req); startJob(`${b.tool}${b.id || b.story ? ' · ' + (b.id || b.story) : ''}`, toolSteps(b, ctx)); send(res, 200, { ok: true }); return true; }
  if (r === 'shutdown' && req.method === 'POST') { send(res, 200, { ok: true }); setTimeout(() => process.exit(0), 300); return true; }
  return false;
}
