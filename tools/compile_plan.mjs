// tools/compile_plan.mjs: the MOTION PLAN COMPILER. A shot manifest (docs/integration/SHOT_MANIFEST_SCHEMA.md) →
// validated, data-resolved executable plan → a generated story (src/stories/_plan_<id>/, played by src/plan/play.js)
// plus a per-shot render job. Nothing natural-language is executed: `purpose` / `notes` are carried as documentation.
// Problems are reported BEFORE rendering; a blocked shot is never silently replaced by a still.
//   node tools/compile_plan.mjs --manifest=<file> [--catalog=out/capabilities.json] [--allow-experimental] [--dry]
//        [--aspect=9:16|16:9] [--chrome=<path>] [--soft-gl]   (without --catalog the live catalog is loaded from the engine)
// Output: out/plans/<id>/compile_report.json (always), and unless blocked or --dry: src/stories/_plan_<id>/{config.js,
// plan.js}, out/plans/<id>/job.json (segments for tools/pipeline.mjs, one per shot, with expected motion).
// Exit codes: 0 ok, 1 blocked shots (see the report), 2 bad manifest.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { args, launch } from './lib/harness.mjs';
import { loadCatalog } from './capabilities.mjs';

const ASPECT_SIZE = { '9:16': [1080, 1920], '16:9': [1920, 1080] };   // production formats (4:5 stays legacy-only)
const fail = m => { console.error('compile_plan: ' + m); process.exit(2); };
if (!args.manifest) fail('usage: node tools/compile_plan.mjs --manifest=<shot_manifest.json>');
const M = JSON.parse(readFileSync(args.manifest, 'utf8')), base = dirname(resolve(args.manifest));
// --aspect renders the same plan in the other production format (a separate story / job id per format)
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
M.shots = M.shots.map(s => ({ ...s, layers: pickAspect(s.layers), camera: pickAspect(s.camera), collage: pickAspect(s.collage), transition_in: pickAspect(s.transition_in) }));

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

const report = { schema: 'compile_report/1', project_id: M.project_id, aspect: M.aspect, catalog: catalog.hash, timing: measured ? 'measured' : 'provisional', warnings, shots: [] };
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
  const layers = (s.layers || []).map(L => {
    const c = checkLayer({ ...L, id: `${s.id}.${L.id}` }, len, prov, errors, subs); if (!c || !c.cap) return null;
    if (collage ? !(c.cap === 'collage.layer' || c.space === 'text') : c.cap === 'collage.layer') { errors.push(`${s.id}.${L.id}: ${c.cap} ${collage ? 'is not a collage layer or text (a collage shot takes collage.layer and type.* layers)' : 'needs treatment "collage"'}`); return null; }
    if (c.cap === 'collage.layer') {   // its moves: collage.* motions, each checked like any capability
      if (!/^[a-z0-9]+(_[a-z0-9]+)*\.png$/.test(c.params.file || '')) errors.push(`${s.id}.${L.id}.file: a lower_snake_case .png name is required`);
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
    if (!C.assets || typeof C.assets !== 'string') errors.push(`${s.id}.collage.assets: the artwork folder is required (e.g. "assets/stories/<id>/")`);
    if (C.camera && !(Array.isArray(C.camera) && C.camera.every(k => Array.isArray(k) && k.length >= 4 && k.slice(0, 4).every(v => typeof v === 'number')))) errors.push(`${s.id}.collage.camera: keys [[t, x, y, zoom, ease?], ...]`);
    let transition;
    if (tr && typeof tr === 'object') { const r = checkLayer({ id: `${s.id}.transition_in`, ...tr }, len, prov, errors, subs); if (r && r.cap) { if (CAPS[r.cap].category !== 'transition') errors.push(`${s.id}.transition_in: ${r.cap} is not a transition`); else transition = { kind: r.cap.slice(11), ...r.params }; } }
    else if (tr && tr !== 'cut') errors.push(`${s.id}.transition_in: a collage shot takes { "cap": "transition.<kind>", "params": {...} } or "cut"`);
    scene = { assets: C.assets, background: C.background || s.background || M.strategy?.background || '#F3F1EC', duration: +len.toFixed(3), aspects: [M.aspect],
      camera: C.camera, boil: C.boil, gen: C.gen, transition,
      layers: layers.filter(L => L.cap === 'collage.layer').map(L => ({ id: L.id.slice(s.id.length + 1), ...L.params, motion: L.motion })),
      type: layers.filter(L => L.space === 'text').map(L => ({ id: L.id, preset: L.cap.slice(5), ...L.params })), narration: s.narration ? [{ at: 0, end: len, text: s.narration }] : [] };
  }
  const mapLayers = layers.filter(L => CAPS[L.cap].category === 'map');
  if (mapLayers.length && camera?.cap !== 'mapView') errors.push('map layers need camera mapView');
  const exp = { min_changed_frac: .01, intentional_still: false, ...s.expected_motion };
  report.shots.push({ id: s.id, start: s.start, end: s.end, treatment: s.treatment, backend: s.backend || 'javascript_motion',
    status: errors.length ? 'blocked' : 'compiled', errors, substitutions: subs, provenance: prov, expected_motion: exp, purpose: s.purpose || null });
  compiled.push(collage ? { id: s.id, start: s.start, end: s.end, collage: scene, expected_motion: exp } : { id: s.id, start: s.start, end: s.end, background: s.background, camera, layers, expected_motion: exp });
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
  `const PLAN = ${JSON.stringify({ id: M.project_id, catalog: catalog.hash, background: M.strategy?.background, shots: compiled.map(s => s.collage ? { ...s, collage: undefined, scene: sceneId(s) } : s) })};\nplayPlan(PLAN);\n`);
const job = { id: M.project_id, fps: M.fps || 24, size: [w, h], aspect: M.aspect, fade: 0, audio: M.audio?.narration?.file ? resolve(base, M.audio.narration.file) : null,
  segments: compiled.map((s, i) => ({ id: s.id, type: 'story', story, range: [s.start, s.end], transition: s.collage ? 'cut' : M.shots[i].transition_in || 'cut',   // collage transitions are drawn in the frames themselves expected_motion: s.expected_motion,
    shot_hash: createHash('sha256').update(JSON.stringify([s, M.aspect, look, M.strategy?.background])).digest('hex').slice(0, 16) })) };   // per-shot cache key for tools/pipeline.mjs
writeFileSync(`${outDir}/job.json`, JSON.stringify(job, null, 2));
console.log(`compiled ${compiled.length} shot(s), ${total.toFixed(2)} s, ${M.aspect} → ${dir}/ and ${outDir}/job.json`);
