// tools/compile_plan.mjs: the MOTION PLAN COMPILER. A shot manifest (docs/integration/SHOT_MANIFEST_SCHEMA.md) →
// validated, data-resolved executable plan → a generated story (src/stories/_plan_<id>/, played by src/plan/play.js)
// plus a per-shot render job. Nothing natural-language is executed: `purpose` / `notes` are carried as documentation.
// Problems are reported BEFORE rendering; a blocked shot is never silently replaced by a still.
//   node tools/compile_plan.mjs --manifest=<file> [--catalog=out/capabilities.json] [--allow-experimental] [--dry]
//        [--aspect=9:16|16:9] [--chrome=<path>] [--soft-gl]   (without --catalog the live catalog is loaded from the engine)
//        [--no-polish] [--no-sfx]   (skip the auto-polish pass / the automatic sound cues: tools/lib/polish.mjs)
// Output: out/plans/<id>/compile_report.json (always), and unless blocked or --dry: src/stories/_plan_<id>/{config.js,
// plan.js}, out/plans/<id>/job.json (segments for tools/pipeline.mjs, one per shot, with expected motion).
// Exit codes: 0 ok, 1 blocked shots (see the report), 2 bad manifest.
// Treatment "action": an articulated character from its reference image (tools/action/, docs/ACTION_COMPOSER.md). The shot
// gives "action": { characters: [{ id, image | rig, x, height, facing, template }], props: [{ id, image | spec, x, scale }],
// actions: [...] (catalog presets) | story: "<sentence>" (the rule-based director), camera, backdrop, render }. Rigs and prop
// anchors are made automatically from images (cached by image hash, in out/plans/<id>/action/); the motion plan is validated
// like any other; the shot renders as its own story (_act_<id>) and joins the film as one segment. Text layers (type.*,
// e.g. the karaoke subtitle) draw on top.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { args, launch } from './lib/harness.mjs';
import { loadCatalog } from './capabilities.mjs';
import { polishManifest, sfxCues } from './lib/polish.mjs';
import { validatePlan, buildScene } from './action/plan.mjs';
import { ruleDirect } from './action/direct.mjs';
import { copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, relative } from 'node:path';
process.env.PYTHONUTF8 ??= '1'; process.env.PYTHONIOENCODING ??= 'utf-8';   // Python children print UTF-8 (Windows pipes default to cp1252)

const ASPECT_SIZE = { '9:16': [1080, 1920], '16:9': [1920, 1080] };   // production formats (4:5 stays legacy-only)
const fail = m => { console.error('compile_plan: ' + m); process.exit(2); };
if (!args.manifest) fail('usage: node tools/compile_plan.mjs --manifest=<shot_manifest.json>');
const M = JSON.parse(readFileSync(args.manifest, 'utf8')), base = dirname(resolve(args.manifest));
// --aspect renders the same plan in the other production format (a separate story / job id per format)
const PLANNED_ASPECT = M.aspect;   // the format the director planned in (action shots keep their world in its pixels)
if (args.aspect && args.aspect !== M.aspect) { M.aspect = args.aspect; M.project_id += '_' + String(args.aspect).replace(':', 'x'); }
if (M.schema !== 'shot_manifest/1') fail(`schema must be "shot_manifest/1", got ${JSON.stringify(M.schema)}`);
if (!/^[A-Za-z0-9_-]{1,60}$/.test(M.project_id || '')) fail('project_id: letters, digits, _ and - only');
if (!ASPECT_SIZE[M.aspect]) fail(`aspect must be one of ${Object.keys(ASPECT_SIZE).join(', ')} (got ${M.aspect})`);
if (!Array.isArray(M.shots) || !M.shots.length) fail('shots: none');
if (M.mode === 'motion_only' && M.shots.some(s => s.backend === 'ltx_video')) fail('mode motion_only forbids backend ltx_video');
// a value may be per format ({ "9:16": …, "16:9": … }, as in the engine): the compiled plan is for one format, so pick it
const isAspectMap = v => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length && Object.keys(v).every(k => /^(\d+:\d+|tall|wide|default)$/.test(k));
const pickAspect = v => isAspectMap(v) ? pickAspect(v[M.aspect] ?? v[ASPECT_SIZE[M.aspect][1] > ASPECT_SIZE[M.aspect][0] ? 'tall' : 'wide'] ?? v.default)
  : Array.isArray(v) ? v.map(pickAspect) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, pickAspect(x)])) : v;
M.shots = M.shots.map(s => ({ ...s, layers: pickAspect(s.layers), camera: pickAspect(s.camera), collage: pickAspect(s.collage), transition_in: pickAspect(s.transition_in), action: pickAspect(s.action) }));

let catalog;
if (args.catalog) catalog = JSON.parse(readFileSync(args.catalog, 'utf8'));
else { const b = await launch(); try { catalog = await loadCatalog(b); } finally { await b.close(); } }
const CAPS = Object.fromEntries(catalog.capabilities.map(c => [c.id, c]));
const allowExp = !!(args['allow-experimental'] || M.allow_experimental);
const warnings = [];
if (M.capability_catalog && M.capability_catalog !== catalog.hash) warnings.push(`planned against catalog ${M.capability_catalog}, compiling against ${catalog.hash}`);

// ---- timing: measured narration cues (SRT) drive shot starts when a shot gives `say: [firstCue, lastCue]` ----
const srtFile = M.audio?.narration?.timing ? resolve(base, M.audio.narration.timing) : null;
const cues = srtFile && existsSync(srtFile) ? readFileSync(srtFile, 'utf8').replace(/\r/g, '').trim().split(/\n\n+/).map(b => {
  const l = b.split('\n'), m = l[1].match(/(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/), s = (h, mi, se, ms) => +h * 3600 + +mi * 60 + +se + +ms / 1000;
  return { i: +l[0], start: s(m[1], m[2], m[3], m[4]), end: s(m[5], m[6], m[7], m[8]), text: l.slice(2).join(' ') };
}) : null;
// measured = cue times from an aligned SRT, or explicit per-shot times taken from the measured voice (no SRT given)
const measured = !!(M.audio?.narration?.measured && (cues || !srtFile));
if (srtFile && !cues) warnings.push(`narration timing file missing: ${srtFile} (shot times are provisional)`);
if (cues && !measured) warnings.push('narration timing is not marked measured: shot times are provisional until the real voice is aligned');
if (!cues && !measured) warnings.push('no measured narration timing: shot times are provisional');
M.shots.forEach((s, i) => {
  if (s.say && cues) { const a = cues.find(c => c.i === s.say[0]); if (a) s.start = +(Math.max(0, a.start - (s.lead ?? .3))).toFixed(3); }
  if (i && s.say && cues) M.shots[i - 1].end = s.start;
});
const last = M.shots[M.shots.length - 1];
if (last.say && cues && last.end == null) { const z = cues.find(c => c.i === last.say[1]); if (z) last.end = +(z.end + (last.tail ?? 1)).toFixed(3); }

// ---- per-shot validation ----
const typeOf = v => Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v) ? 'color' : typeof v;
function resolveData(v, prov, path) {   // {"$data": "<id>", "field": "coords"} → the sourced value; provenance recorded
  if (v && typeof v === 'object' && !Array.isArray(v) && '$data' in v) {
    const d = M.data?.[v.$data]; if (!d) throw `${path}: unknown data "${v.$data}"`;
    if (!d.source) throw `${path}: data "${v.$data}" has no source (blocked:unsourced_data)`;
    prov.push({ data: v.$data, source: d.source, confidence: d.confidence || 'unspecified', note: d.note || null });
    const out = v.field ? d[v.field] : d; if (out === undefined) throw `${path}: data "${v.$data}" has no field "${v.field}"`; return out;
  }
  if (Array.isArray(v)) return v.map((x, i) => resolveData(x, prov, `${path}[${i}]`));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolveData(x, prov, `${path}.${k}`)]));
  return v;
}
function checkLayer(L, len, prov, errors, subs) {
  let cap = CAPS[L.cap];
  if (!cap && L.fallback?.startsWith('alternative:')) { const alt = L.fallback.slice(12); if (CAPS[alt]) { subs.push(`${L.id}: ${L.cap} → ${alt}`); cap = CAPS[alt]; L.cap = alt; } }
  if (!cap) return errors.push(`${L.id}: blocked:unknown_capability "${L.cap}"`);
  if (cap.status !== 'verified' && !allowExp) return errors.push(`${L.id}: blocked:unverified_capability "${L.cap}" (pass --allow-experimental to preview)`);
  if (cap.aspects.length && !cap.aspects.includes(M.aspect)) errors.push(`${L.id}: ${L.cap} has not passed ${M.aspect}`);
  // geography is a fact: on map layers, places and routes must come from sourced `data`, never literal coordinates
  if (cap.category === 'map') for (const k of ['lonlat', 'coords']) { const v = L.params?.[k];
    if (v !== undefined && !(v && typeof v === 'object' && !Array.isArray(v) && '$data' in v)) errors.push(`${L.id}.${k}: blocked:unsourced_data (use {"$data": "<id>", "field": "${k}"} with a sourced data entry)`); }
  let params;
  try { params = resolveData(L.params || {}, prov, `${L.id}.params`); } catch (e) { return errors.push(`${L.id}: ${e}`); }
  for (const [k, v] of Object.entries(params)) {
    const S = cap.params[k];
    if (!S) { errors.push(`${L.id}: blocked:invalid_param "${k}" (not a parameter of ${cap.id}; has ${Object.keys(cap.params).join(', ')})`); continue; }
    const t = typeOf(v);
    if (S.type === 'number' && t !== 'number') errors.push(`${L.id}.${k}: expected number, got ${t}`);
    else if (S.type === 'boolean' && t !== 'boolean') errors.push(`${L.id}.${k}: expected boolean, got ${t}`);
    else if (S.type === 'color' && t !== 'color' && v !== null) errors.push(`${L.id}.${k}: expected #rrggbb colour, got ${JSON.stringify(v)}`);
    if (S.enum && !S.enum.includes(v)) errors.push(`${L.id}.${k}: ${JSON.stringify(v)} not in ${S.enum.join('|')}`);
    if (t === 'number' && ((S.min != null && v < S.min) || (S.max != null && v > S.max))) errors.push(`${L.id}.${k}: ${v} outside ${S.min ?? ''}..${S.max ?? ''}`);
  }
  const at = typeof params.at === 'number' ? params.at : 0, dur = params.dur ?? (cap.kind === 'collage' ? 0 : cap.params.dur?.default ?? 0);   // collage motions may run on (walk, sway)
  if (at > len) errors.push(`${L.id}: starts at ${at} s, after the shot ends (${len.toFixed(2)} s)`);
  else if (at + dur > len + .05) warnings.push(`${L.id}: its move (${at}+${dur} s) runs past the shot end (${len.toFixed(2)} s) and will be cut`);
  return { id: L.id, cap: cap.id, params, space: cap.kind === 'type' ? 'text' : cap.camera === 'screen' ? 'screen' : 'world' };
}

// ---- action shots: reference images -> rigs / prop anchors (auto, cached) -> a validated motion plan ----
const PY = args.python || (process.platform === 'win32' ? 'python' : 'python3');
const fhash = f => createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 16);
const actionId = s => { const id = `${M.project_id}_${s.id}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  return id.length <= 40 ? id : id.slice(0, 31) + '_' + createHash('sha256').update(id).digest('hex').slice(0, 8); };
// an image (from the manifest's folder) analysed into <work>/<name>.<kind>.json; redone only when the image changes
function analysed(img, kind, opts, work, errors, path) {
  const src = resolve(base, img);
  if (!existsSync(src)) { errors.push(`${path}: image not found: ${img}`); return null; }
  const name = basename(src).replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_]/g, '_'), dst = `${work}/${name}${src.slice(src.lastIndexOf('.')).toLowerCase()}`;
  const out = `${work}/${name}.${kind}.json`, stamp = `${out}.src`, h = fhash(src) + JSON.stringify(opts);
  if (existsSync(out) && existsSync(stamp) && readFileSync(stamp, 'utf8') === h) return out;
  copyFileSync(src, dst);
  const tool = kind === 'rig' ? 'tools/action/rig_analyze.py' : 'tools/action/prop_analyze.py';
  const r = spawnSync(PY, [tool, `--image=${dst}`, `--id=${name}`, `--out=${out}`, ...Object.entries(opts).map(([k, v]) => `--${k}=${v}`)], { encoding: 'utf8' });
  if (r.status !== 0 || !existsSync(out)) { errors.push(`${path}: automatic ${kind} failed for ${img}: ${(r.stderr || r.stdout || r.error?.message || '').trim().split('\n').slice(-2).join(' ')}`); return null; }
  writeFileSync(stamp, h);
  return out;
}
function actionPlan(s, len, errors, warns) {
  const A = s.action, path = `${s.id}.action`;
  if (!A || typeof A !== 'object') { errors.push(`${path}: a shot with treatment "action" needs "action": { characters, actions | story }`); return null; }
  const id = actionId(s), work = resolve(`out/plans/${M.project_id}/action/${s.id}`); mkdirSync(work, { recursive: true });
  const rel = f => relative(work, f).split('\\').join('/');
  const chars = (A.characters || []).map((c, i) => {
    const cid = c.id || `CHAR_${String(i + 1).padStart(3, '0')}`;
    const rig = c.rig ? resolve(base, c.rig) : c.image ? analysed(c.image, 'rig', { template: c.template || 'human' }, work, errors, `${path}.characters[${i}]`) : null;
    if (!c.rig && !c.image) errors.push(`${path}.characters[${i}]: give "image" (a reference picture: the rig is made automatically) or "rig"`);
    return rig && { id: cid, rig: rel(rig), x: c.x ?? .2 + .25 * i, height: c.height ?? .34, facing: c.facing || 'right' };
  });
  const props = (A.props || []).map((p, i) => {
    const spec = p.spec ? resolve(base, p.spec) : p.image ? analysed(p.image, 'prop', { kind: p.kind || 'handheld', forward: p.forward || 'right' }, work, errors, `${path}.props[${i}]`) : null;
    if (!p.spec && !p.image) errors.push(`${path}.props[${i}]: give "image" or "spec"`);
    return spec && { id: p.id || `PROP_${i + 1}`, spec: rel(spec), x: p.x ?? .31, scale: p.scale ?? .72, ...(p.rest_on != null ? { rest_on: p.rest_on } : {}) };
  });
  if (!chars.length) errors.push(`${path}.characters: at least one character`);
  if (errors.length) return null;
  // planned in another format (--aspect): keep the world in the planned pixels (same run-up to the same obstacle; the
  // follow camera frames it) and keep aim / point targets at the same height above the ground
  const from = A.aspect || PLANNED_ASPECT, [W0, H0] = ASPECT_SIZE[from] || ASPECT_SIZE[M.aspect], [W1, H1] = ASPECT_SIZE[M.aspect], gy = A.ground_y ?? .8;
  const kx = W0 / W1, dy = gy * (H1 - H0), moved = from !== M.aspect;
  if (moved) { chars.forEach(c => c.x = +(c.x * kx).toFixed(4)); props.forEach(p => p.x = +(p.x * kx).toFixed(4)); }
  const backdrop = A.backdrop && moved ? { ...A.backdrop, obstacles: (A.backdrop.obstacles || []).map(o => ({ ...o, x: +(o.x * kx).toFixed(4) })) } : A.backdrop;
  let actions = A.actions;
  if (!Array.isArray(actions) && typeof A.story === 'string') {   // no timeline given: the rule-based director (no AI) composes one
    actions = ruleDirect(A.story, { charId: chars[0].id, props: props.map(p => p.id), duration: len, aspect: M.aspect, x0: chars[0].x }).actions;
    warns.push(`${path}: actions composed from "story" by the rule-based director (${actions.length})`);
  }
  if (!Array.isArray(actions) || !actions.length) { errors.push(`${path}: "actions" (a timeline of presets) or "story" is required`); return null; }
  if (moved) actions = actions.map(a => Array.isArray(a.target) ? { ...a, target: [a.target[0], Math.round(a.target[1] + dy)] } : a);
  if (moved) warns.push(`${path}: planned in ${from}, rendered in ${M.aspect}: world kept in ${from} pixels, targets kept above the ground`);
  const plan = { schema: 'motion_plan/1', id, title: s.purpose || s.id, duration: +len.toFixed(3), fps: M.fps || 24, aspect: M.aspect, ground_y: A.ground_y ?? .8,
    look: M.strategy?.look || 'classic', ...(backdrop ? { backdrop } : {}), ...(A.render ? { render: A.render } : {}),
    ...(A.camera === null ? {} : { camera: A.camera || { follow: chars[0].id, frame_x: .38, amount: .9 } }), characters: chars, props, actions };
  writeFileSync(`${work}/motion_plan.json`, JSON.stringify(plan, null, 1));
  const r = validatePlan(plan, { base: work });
  r.errors.forEach(e => errors.push(`${path}: ${e}`)); r.warnings.forEach(w => warns.push(`${path}: ${w}`));
  if (!r.ok) return null;
  const files = [...chars.map(c => resolve(work, c.rig)), ...props.map(p => resolve(work, p.spec))];
  const imgs = files.map(f => { const j = JSON.parse(readFileSync(f, 'utf8')); return resolve(dirname(f), j.image); });
  const engine = ['src/action/catalog.js', 'src/action/rig.js', 'src/action/composer.js', 'src/action/play.js', 'src/look.js'];
  return { id, story: `_act_${id}`, plan: r.plan, inputs: [...files, ...imgs, ...engine].map(f => existsSync(f) ? fhash(f) : f) };
}

// ---- auto-polish: entrances, camera, transitions, subtitles the director left out (tools/lib/polish.mjs) ----
if (args['no-polish']) M.polish = false;
const polished = polishManifest(M, { CAPS, allowExp, aspect: M.aspect });

const report = { schema: 'compile_report/1', project_id: M.project_id, aspect: M.aspect, catalog: catalog.hash, timing: measured ? 'measured' : 'provisional', warnings, polish: polished, shots: [] };
const compiled = [];
let t = 0;
for (const [i, s] of M.shots.entries()) {
  const errors = [], prov = [], subs = [];
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(s.id || '')) errors.push(`shot ${i}: bad id`);
  if (s.backend && s.backend !== 'javascript_motion') errors.push(`blocked:backend "${s.backend}" is not rendered by this compiler (motion only)`);
  if (typeof s.start !== 'number' || typeof s.end !== 'number' || s.end <= s.start) errors.push(`times: need numeric start < end (got ${s.start}–${s.end})`);
  else if (Math.abs(s.start - t) > .02) errors.push(`times: starts at ${s.start} s but the previous shot ends at ${t} s (gap or overlap)`);
  const len = (s.end ?? 0) - (s.start ?? 0);
  let camera = null;
  if (s.camera) { const c = checkLayer({ id: `${s.id}.camera`, ...s.camera }, len, prov, errors, subs); if (c && c.cap) { camera = c; if (CAPS[c.cap].category !== 'camera') errors.push(`${s.id}.camera: ${c.cap} is not a camera capability`); } }
  const collage = s.treatment === 'collage';
  const action = s.treatment === 'action', actionWarn = [];
  const act = action ? actionPlan(s, len, errors, actionWarn) : null;
  actionWarn.forEach(w => warnings.push(w));
  const layers = (s.layers || []).map(L => {
    const c = checkLayer({ ...L, id: `${s.id}.${L.id}` }, len, prov, errors, subs); if (!c || !c.cap) return null;
    if (action && c.space !== 'text') { errors.push(`${s.id}.${L.id}: an action shot takes only text layers (type.*) on top of its character`); return null; }
    if (collage ? !(c.cap === 'collage.layer' || c.space === 'text') : c.cap === 'collage.layer') { errors.push(`${s.id}.${L.id}: ${c.cap} ${collage ? 'is not a collage layer or text (a collage shot takes collage.layer and type.* layers)' : 'needs treatment "collage"'}`); return null; }
    if (c.cap === 'collage.layer') {   // its moves: collage.* motions, each checked like any capability
      if (c.params.doodle) { const k = c.params.doodle.kind; if (!CAPS['doodle.' + k]) errors.push(`${s.id}.${L.id}.doodle: unknown kind "${k}" (have: ${Object.keys(CAPS).filter(x => x.startsWith('doodle.')).map(x => x.slice(7)).join(', ')})`); }
      else if (!/^[a-z0-9]+(_[a-z0-9]+)*\.png$/.test(c.params.file || '')) errors.push(`${s.id}.${L.id}.file: a lower_snake_case .png name is required (or a doodle)`);
      if (c.params.space === 'footage' && !s.collage?.footage) errors.push(`${s.id}.${L.id}: space "footage" needs collage.footage (a prepared plate)`);
      if (!Array.isArray(c.params.size) || !Array.isArray(c.params.at)) errors.push(`${s.id}.${L.id}: size [w] | [null, h] and at [x, y] are required`);
      c.motion = (L.motion || []).map((m, j) => {
        const r = checkLayer({ id: `${s.id}.${L.id}.motion[${j}]`, ...m }, len, prov, errors, subs); if (!r || !r.cap) return null;
        if (CAPS[r.cap].category !== 'collage' || r.cap === 'collage.layer') { errors.push(`${s.id}.${L.id}.motion[${j}]: ${r.cap} is not a collage motion`); return null; }
        return { kind: r.cap.slice(8), ...r.params };
      }).filter(Boolean);
    } else if (L.motion) errors.push(`${s.id}.${L.id}: only collage layers take a motion list`);
    return c;
  }).filter(Boolean);
  let scene = null;
  if (collage) {   // → a collage scene (src/collage/collage.js), played with its neighbours as one reel
    const C = s.collage || {}, tr = s.transition_in;
    if (C.footage && !(typeof C.footage.dir === 'string' && existsSync(C.footage.dir.replace(/\/?$/, '/') + 'meta.json'))) errors.push(`${s.id}.collage.footage.dir: no prepared plate at ${C.footage.dir} (python tools/footage.py prepare)`);
    if (!C.assets || typeof C.assets !== 'string') errors.push(`${s.id}.collage.assets: the artwork folder is required (e.g. "assets/stories/<id>/")`);
    if (C.camera && !(Array.isArray(C.camera) && C.camera.every(k => Array.isArray(k) && k.length >= 4 && k.slice(0, 4).every(v => typeof v === 'number')))) errors.push(`${s.id}.collage.camera: keys [[t, x, y, zoom, ease?], ...]`);
    let transition;
    if (tr && typeof tr === 'object') { const r = checkLayer({ id: `${s.id}.transition_in`, ...tr }, len, prov, errors, subs); if (r && r.cap) { if (CAPS[r.cap].category !== 'transition') errors.push(`${s.id}.transition_in: ${r.cap} is not a transition`); else transition = { kind: r.cap.slice(11), ...r.params }; } }
    else if (tr && tr !== 'cut') errors.push(`${s.id}.transition_in: a collage shot takes { "cap": "transition.<kind>", "params": {...} } or "cut"`);
    scene = { assets: C.assets, background: C.background || s.background || M.strategy?.background || '#F3F1EC', duration: +len.toFixed(3), aspects: [M.aspect],
      camera: C.camera, boil: C.boil, gen: C.gen, transition, footage: C.footage,
      layers: layers.filter(L => L.cap === 'collage.layer').map(L => ({ id: L.id.slice(s.id.length + 1), ...L.params, motion: L.motion })),
      type: layers.filter(L => L.space === 'text').map(L => ({ id: L.id, preset: L.cap.slice(5), ...L.params })), narration: s.narration ? [{ at: 0, end: len, text: s.narration }] : [] };
  }
  if (action && camera) errors.push(`${s.id}.camera: an action shot has its own follow camera (action.camera)`);
  const mapLayers = layers.filter(L => CAPS[L.cap].category === 'map');
  if (mapLayers.length && camera?.cap !== 'mapView') errors.push('map layers need camera mapView');
  const exp = { min_changed_frac: .01, intentional_still: false, ...s.expected_motion };
  report.shots.push({ id: s.id, start: s.start, end: s.end, treatment: s.treatment, backend: s.backend || 'javascript_motion',
    status: errors.length ? 'blocked' : 'compiled', errors, substitutions: subs, provenance: prov, expected_motion: exp, purpose: s.purpose || null });
  compiled.push(collage ? { id: s.id, start: s.start, end: s.end, collage: scene, expected_motion: exp }
    : action ? { id: s.id, start: s.start, end: s.end, action: act, layers, expected_motion: exp }
    : { id: s.id, start: s.start, end: s.end, background: s.background, camera, layers, expected_motion: exp });
  t = s.end;
}
const total = t, target = M.target_seconds, tol = M.tolerance_seconds ?? 2;
report.duration = { total: +total.toFixed(3), target: target ?? null, within_tolerance: target == null ? null : Math.abs(total - target) <= tol };
if (target != null && !report.duration.within_tolerance) warnings.push(`duration ${total.toFixed(2)} s is outside ${target} ± ${tol} s`);
const blocked = report.shots.filter(s => s.status === 'blocked');
report.status = blocked.length ? 'blocked' : 'compiled';

const outDir = `out/plans/${M.project_id}`; mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/compile_report.json`, JSON.stringify(report, null, 2));
for (const s of report.shots) console.log(`${s.status === 'compiled' ? 'OK     ' : 'BLOCKED'} ${s.id}  ${s.start}–${s.end} s  ${s.treatment || ''}${s.errors.length ? '\n    ' + s.errors.join('\n    ') : ''}`);
for (const w of warnings) console.log('warning: ' + w);
if (blocked.length) { console.log(`${blocked.length} shot(s) blocked → ${outDir}/compile_report.json`); process.exit(1); }
if (args.dry) { console.log('dry run: nothing written'); process.exit(0); }

const story = `_plan_${M.project_id}`, dir = `src/stories/${story}`, [w, h] = ASPECT_SIZE[M.aspect]; mkdirSync(dir, { recursive: true });
const look = M.strategy?.look || 'classic';
writeFileSync(`${dir}/config.js`, `// GENERATED by tools/compile_plan.mjs from ${args.manifest}. Do not edit: change the manifest and recompile.\n` +
  `const PROJECT = ${JSON.stringify({ width: w, height: h, aspect: M.aspect, duration: +total.toFixed(3), bpm: 120, offset: 0, audio: '', look, files: ['src/plan/play.js', 'plan.js'] })};\n`);
// collage shots become SCENES entries (so tools/gen_assets.mjs and validate_assets.mjs work on the compiled story too)
const sceneId = s => `${M.project_id}_${s.id}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
writeFileSync(`${dir}/plan.js`, `// GENERATED by tools/compile_plan.mjs (${catalog.hash}). Do not edit.\n` +
  compiled.filter(s => s.collage).map(s => `SCENES.${sceneId(s)} = ${JSON.stringify(s.collage)};\n`).join('') +
  `const PLAN = ${JSON.stringify({ id: M.project_id, catalog: catalog.hash, background: M.strategy?.background, shots: compiled.map(s => s.collage ? { ...s, collage: undefined, scene: sceneId(s) } : s.action ? { id: s.id, start: s.start, end: s.end, action: s.action.story, layers: [] } : s) })};\nplayPlan(PLAN);\n`);
// action shots: each is its own story (the engine scene of its motion plan), with the shot's text layers on top
for (const s of compiled.filter(s => s.action)) buildScene(s.action.plan, { story: s.action.story,
  type: s.layers.map(L => ({ id: L.id, ...L.params, preset: L.cap.slice(5) })) });
const job = { id: M.project_id, fps: M.fps || 24, size: [w, h], aspect: M.aspect, fade: 0, audio: M.audio?.narration?.file ? resolve(base, M.audio.narration.file) : null,
  segments: compiled.map((s, i) => ({ id: s.id, type: 'story', story: s.action ? s.action.story : story, range: s.action ? [0, +(s.end - s.start).toFixed(3)] : [s.start, s.end], transition: s.collage ? 'cut' : M.shots[i].transition_in || 'cut', expected_motion: s.expected_motion,   // collage transitions are drawn in the frames themselves
    shot_hash: createHash('sha256').update(JSON.stringify([s.action ? { ...s, action: { story: s.action.story, plan: s.action.plan, inputs: s.action.inputs } } : s, M.aspect, look, M.strategy?.background])).digest('hex').slice(0, 16) })) };   // per-shot cache key for tools/pipeline.mjs
// sound: automatic SFX cues where the picture moves, and the music bed (ducked under the narration by tools/pipeline.mjs)
const sfx = sfxCues(compiled, { off: args['no-sfx'] || M.audio?.sfx === false });
if (sfx.cues.length) job.sfx = sfx.cues;
// collage shots need their artwork BEFORE rendering: the pipeline generates what has a gen block (ComfyUI, cached) and
// validates every layer, so missing art stops the run with a list instead of rendering blank shots
if (compiled.some(s => s.collage)) job.assets = [{ story }];
sfx.warnings.forEach(w => console.log('warning: ' + w));
const music = M.audio?.music;
if (music?.file) { job.music = { gain: .22, duck: .7, ...music, file: resolve(base, music.file) }; if (!existsSync(job.music.file)) console.log(`warning: music file missing: ${job.music.file} (the video will have no music)`); }
writeFileSync(`${outDir}/job.json`, JSON.stringify(job, null, 2));
report.sound = { sfx: sfx.cues.length, music: job.music?.file || null, warnings: sfx.warnings };
writeFileSync(`${outDir}/compile_report.json`, JSON.stringify(report, null, 2));
console.log(`compiled ${compiled.length} shot(s), ${total.toFixed(2)} s, ${M.aspect} → ${dir}/ and ${outDir}/job.json` +
  `${polished.length ? `; polish: ${polished.length} addition(s)` : ''}${sfx.cues.length ? `; ${sfx.cues.length} SFX cue(s)` : ''}${job.music ? '; music bed' : ''}`);
