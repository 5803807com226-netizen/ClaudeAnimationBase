// tools/action/plan.mjs: MOTION PLAN validator + scene builder for the Action Composer.
//   node tools/action/plan.mjs --plan=<motion_plan.json> [--check] [--substitute] [--out-story=_act_<id>]
//   node tools/action/plan.mjs --catalog      (presets, layers, joint groups, effects and the schema as JSON)
// Validates a Motion Plan (schema motion_plan/1, below) against the preset catalog (src/action/catalog.js): unknown
// actions are rejected with the closest supported ones as alternatives (--substitute takes the closest instead and
// says so), parameters are checked against their limits, props and targets must exist, a prop must be held to aim or
// fire, actions must fit the duration. Writes out/action/<id>/plan_report.json (always) and, unless --check or blocked:
//   src/stories/_act_<id>/{config.js, scene.js}   (played by src/action/play.js; render with render.mjs --story=…)
//   assets/action/<id>/                            copies of the character and prop images it uses
//   out/action/<id>/motion_plan.json               the normalised plan (re-render it any time: no AI call needed)
// Exit codes: 0 ok, 1 invalid plan (see the report), 2 bad arguments / unreadable files.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve, basename, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const catSrc = readFileSync(ROOT + 'src/action/catalog.js', 'utf8');
export const { ACTION_CATALOG, ACTION_LAYERS, ACTION_GROUPS, ACTION_EFFECTS, ACTION_ALIASES } =
  new Function('window', catSrc + '; return { ACTION_CATALOG, ACTION_LAYERS, ACTION_GROUPS, ACTION_EFFECTS, ACTION_ALIASES };')(undefined);

// the Motion Plan schema (JSON Schema draft 2020-12 subset; the validator below enforces it and the cross-checks)
export const MOTION_PLAN_SCHEMA = {
  $id: 'motion_plan/1', type: 'object', required: ['schema', 'id', 'duration', 'characters', 'actions'],
  properties: {
    schema: { const: 'motion_plan/1' }, id: { type: 'string', pattern: '^[a-z0-9_]{1,40}$' }, title: { type: 'string' },
    duration: { type: 'number', minimum: .5, maximum: 120 }, fps: { type: 'integer', minimum: 12, maximum: 60 }, aspect: { enum: ['9:16', '16:9', '4:5'] },
    ground_y: { type: 'number', minimum: .4, maximum: .98 },
    backdrop: { type: 'object', properties: { sky: { type: 'string' }, ground: { type: 'string' }, obstacles: { type: 'array' } } },
    camera: { type: 'object', properties: { follow: { type: 'string' }, frame_x: { type: 'number' }, amount: { type: 'number' } } },
    render: { type: 'object', properties: { mode: { enum: ['texture', 'points'] }, overlay: { type: 'boolean' }, points: { type: 'object' } } },
    characters: { type: 'array', minItems: 1, items: { type: 'object', required: ['id', 'rig'], properties: { id: { type: 'string' }, rig: { type: 'string' }, image: { type: 'string' },
      x: { type: 'number', minimum: -.5, maximum: 1.5 }, height: { type: 'number', minimum: .05, maximum: .95 }, facing: { enum: ['left', 'right'] } } } },
    props: { type: 'array', items: { type: 'object', required: ['id', 'spec'], properties: { id: { type: 'string' }, spec: { type: 'string' }, image: { type: 'string' },
      x: { type: 'number' }, y: { type: 'number' }, rest_on: { type: 'number', minimum: 0, maximum: 1 }, angle: { type: 'number' }, scale: { type: 'number', minimum: .05, maximum: 5 } } } },
    actions: { type: 'array', items: { type: 'object', required: ['type', 'start', 'duration'], properties: { type: { type: 'string' }, start: { type: 'number', minimum: 0 },
      duration: { type: 'number', exclusiveMinimum: 0 }, character: { type: 'string' }, layer: { enum: null }, mask: { type: 'array' }, target: {}, effects: { type: 'array' }, params: { type: 'object' } } } },
  },
};
MOTION_PLAN_SCHEMA.properties.actions.items.properties.layer.enum = ACTION_LAYERS;

const lev = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
export const alternatives = (type, n = 3) => Object.keys(ACTION_CATALOG).map(k => [k, lev(String(type).toLowerCase(), k)]).sort((a, b) => a[1] - b[1]).slice(0, n).map(x => x[0]);

// returns { ok, errors, warnings, plan (normalised) }
// where a character roughly is at time t (frame px) and which way it faces: gaits move it at their speed and a jump keeps
// the momentum it took off with (or covers its distance), as the composer's root integration does
export function roughX(P, cid, t) {
  const c = (P.characters || []).find(x => x.id === cid) || P.characters?.[0]; if (!c) return [0, 1];
  let x = c.x * ({ '9:16': 1080, '16:9': 1920, '4:5': 1080 }[P.aspect] || 1080), f = c.facing === 'left' ? -1 : 1, v = 0;
  for (const a of [...(P.actions || [])].sort((p, q) => p.start - q.start)) {
    if (a.start >= t) break; const prm = a.params || a, cat = ACTION_CATALOG[a.type]; if (!cat) continue;
    const span = Math.max(0, Math.min(t, a.start + a.duration) - a.start);
    if (['walk', 'run', 'sprint'].includes(a.type)) { v = prm.speed ?? cat.params.speed.default; x += f * v * span; }
    else if (a.type === 'jump') { const d = prm.distance ?? cat.params.distance.default; x += f * (d >= 0 ? d / Math.max(.1, a.duration * .85) : v) * span; }
    else if (cat.mask.includes('root') && a.type !== 'land') v = 0;
    if (a.type === 'turn' && a.start + a.duration / 2 < t) f = -f;
  }
  return [x, f];
}

export function validatePlan(P0, { substitute = false, base = ROOT } = {}) {
  const errors = [], warnings = [], P = structuredClone(P0);
  const S = MOTION_PLAN_SCHEMA.properties, num = (v, s, path) => { if (typeof v !== 'number' || !isFinite(v)) return errors.push(`${path}: a number is required`);
    if (s.minimum != null && v < s.minimum) errors.push(`${path}: ${v} is below ${s.minimum}`); if (s.maximum != null && v > s.maximum) errors.push(`${path}: ${v} is above ${s.maximum}`); };
  if (P.schema !== 'motion_plan/1') errors.push(`schema: must be "motion_plan/1"`);
  if (!/^[a-z0-9_]{1,40}$/.test(P.id || '')) errors.push('id: small letters, digits and _ only');
  num(P.duration, S.duration, 'duration');
  P.fps ??= 24; P.aspect ??= '9:16'; P.ground_y ??= .82;
  if (!S.aspect.enum.includes(P.aspect)) errors.push(`aspect: one of ${S.aspect.enum.join(', ')}`);
  num(P.ground_y, S.ground_y, 'ground_y');
  if (!Array.isArray(P.characters) || !P.characters.length) errors.push('characters: at least one character');
  const ids = new Set();
  for (const [i, c] of (P.characters || []).entries()) {
    if (!c.id || ids.has(c.id)) errors.push(`characters[${i}].id: a unique id is required`); ids.add(c.id);
    c.x ??= .3; c.height ??= .4; c.facing ??= 'right';
    const rp = resolve(base, c.rig || ''); if (!c.rig || !existsSync(rp)) { errors.push(`characters[${i}].rig: file not found (${c.rig})`); continue; }
    let rig; try { rig = JSON.parse(readFileSync(rp, 'utf8')); } catch (e) { errors.push(`characters[${i}].rig: not JSON (${e.message})`); continue; }
    if (rig.schema !== 'char_rig/1') errors.push(`characters[${i}].rig: schema must be char_rig/1`);
    const ip = resolve(dirname(rp), c.image || rig.image); if (!existsSync(ip)) errors.push(`characters[${i}].image: not found (${ip})`);
    // rig sanity: every bone's joints exist, parents exist, no cycles
    const names = new Set(rig.bones.map(b => b.name));
    for (const b of rig.bones) { if (!rig.joints[b.from] || !rig.joints[b.to]) errors.push(`${c.id} rig: bone ${b.name} uses a missing joint`); if (b.parent && !names.has(b.parent)) errors.push(`${c.id} rig: bone ${b.name} has a missing parent ${b.parent}`); }
    for (const b of rig.bones) { let p = b, n = 0; while (p && p.parent && n < 64) { p = rig.bones.find(x => x.name === p.parent); n++; } if (n >= 64) errors.push(`${c.id} rig: a parent cycle at ${b.name}`); }
    if (rig.uncertain?.length) warnings.push(`${c.id}: rig joints still uncertain (check them in the rig editor): ${rig.uncertain.join(', ')}`);
    c._rig = rig; c._rigPath = rp; c._imagePath = ip;
  }
  const propIds = new Set();
  for (const [i, p] of (P.props || []).entries()) {
    if (!p.id || propIds.has(p.id)) errors.push(`props[${i}].id: a unique id is required`); propIds.add(p.id);
    const sp = resolve(base, p.spec || ''); if (!existsSync(sp)) { errors.push(`props[${i}].spec: file not found (${p.spec})`); continue; }
    const spec = JSON.parse(readFileSync(sp, 'utf8')); if (spec.schema !== 'prop/1') errors.push(`props[${i}].spec: schema must be prop/1`);
    for (const k of ['origin', 'grip']) if (!spec.anchors?.[k]) errors.push(`props[${i}]: the prop needs a "${k}" anchor`);
    const ip = resolve(dirname(sp), p.image || spec.image); if (!existsSync(ip)) errors.push(`props[${i}].image: not found (${ip})`);
    p.x ??= .5; p._spec = spec; p._specPath = sp; p._imagePath = ip;
  }
  // actions
  const held = [];   // [t, propId, held?]
  for (const [i, a] of (P.actions || []).entries()) {
    const path = `actions[${i}]`; let type = ACTION_ALIASES[a.type] || a.type;
    if (!ACTION_CATALOG[type]) {
      const alt = alternatives(a.type);
      if (substitute) { warnings.push(`${path}: "${a.type}" is not a preset; substituted "${alt[0]}" (alternatives: ${alt.join(', ')})`); type = alt[0]; }
      else { errors.push(`${path}: "${a.type}" is not a supported preset. Alternatives: ${alt.join(', ')}`); continue; }
    }
    a.type = type; const cat = ACTION_CATALOG[type];
    num(a.start, { minimum: 0 }, `${path}.start`); num(a.duration, { minimum: .02, maximum: P.duration }, `${path}.duration`);
    if (a.start + a.duration > P.duration + .01) errors.push(`${path}: ends at ${(a.start + a.duration).toFixed(2)} s, after the plan (${P.duration} s)`);
    if (a.character && !ids.has(a.character)) errors.push(`${path}.character: no character "${a.character}"`);
    if (a.layer && !ACTION_LAYERS.includes(a.layer)) { warnings.push(`${path}.layer: "${a.layer}" is not a layer (${ACTION_LAYERS.join(', ')}); using ${cat.layer}`); delete a.layer; }
    if (a.mask) for (const m of a.mask) if (!ACTION_GROUPS.includes(m)) errors.push(`${path}.mask: "${m}" is not a joint group (${ACTION_GROUPS.join(', ')})`);
    for (const e of a.effects || []) if (!ACTION_EFFECTS.includes(e)) errors.push(`${path}.effects: "${e}" is not an effect (${ACTION_EFFECTS.join(', ')})`);
    // parameters: top-level fields or params{}
    const prm = { ...a.params }; for (const k of Object.keys(cat.params)) if (a[k] !== undefined) prm[k] = a[k];
    for (const [k, v] of Object.entries(prm)) {
      const d = cat.params[k]; if (!d) { warnings.push(`${path}: "${k}" is not a parameter of ${type} (ignored)`); continue; }
      if (d.type === 'number') num(v, d, `${path}.${k}`);
      if (d.type === 'enum' && !d.values.includes(v)) errors.push(`${path}.${k}: one of ${d.values.join(', ')}`);
      if (d.type === 'point' && !(Array.isArray(v) && v.length === 2 && v.every(n => typeof n === 'number'))) errors.push(`${path}.${k}: a point [x, y] in frame px is required`);
      if (d.type === 'prop' && !propIds.has(v)) errors.push(`${path}.${k}: no prop "${v}"`);
      if (d.type === 'point_or_prop' && !(propIds.has(v) || (Array.isArray(v) && v.length === 2))) errors.push(`${path}.${k}: a prop id or a point [x, y]`);
    }
    if (['aim', 'point', 'look'].includes(type) && !prm.target) errors.push(`${path}: ${type} needs a target [x, y]`);
    if (['pick_up', 'reach'].includes(type) && !prm.target) errors.push(`${path}: ${type} needs a target (a prop id)`);
    if (type === 'pick_up') held.push([a.start + a.duration * .45, prm.target, true]);
    if (type === 'drop') held.push([a.start + a.duration * .35, prm.target, false]);
    a.params = prm;
  }
  // a prop must be in hand to aim, fire, hold or carry it
  held.sort((x, y) => x[0] - y[0]);
  const inHand = t => { let h = null; for (const [tt, id, on] of held) { if (tt > t) break; h = on ? id : (h === id ? null : h); } return h; };
  for (const [i, a] of (P.actions || []).entries()) if (['fire', 'hold', 'carry'].includes(a.type) || (a.type === 'aim' && (P.props || []).length)) {
    if (!inHand(a.start + .001) && a.type !== 'aim') errors.push(`actions[${i}]: ${a.type} at ${a.start} s needs a prop in hand (pick_up it first)`);
    if (a.type === 'aim' && !inHand(a.start + a.duration)) warnings.push(`actions[${i}]: aim without a prop in hand points the arm only`);
  }
  // a target behind the character (mid-way or at the end of the action, from its rough position) is usually a planning slip
  for (const [i, a] of (P.actions || []).entries()) if (['point', 'aim', 'look'].includes(a.type) && Array.isArray(a.params?.target)) {
    for (const t of [a.start + a.duration * .5, a.start + a.duration]) { const [x, f] = roughX(P, a.character, t);
      if ((a.params.target[0] - x) * f < 0) { warnings.push(`actions[${i}]: ${a.type}'s target is behind the character by ${+t.toFixed(2)} s (about x ${Math.round(x)}): it will be pointed at over the shoulder`); break; } }
  }
  // a fall starts in the air: from a standing pose it would teleport the character up first
  for (const [i, a] of (P.actions || []).entries()) if (a.type === 'fall' && a.start > .01) {
    const before = (P.actions || []).filter(b => b !== a && (ACTION_CATALOG[b.type]?.layer === 'lower_body') && b.start < a.start && b.start + b.duration > a.start - .05);
    if (!before.some(b => ['jump', 'fall'].includes(b.type))) warnings.push(`actions[${i}]: a fall that does not follow a jump starts ${a.params?.from_height ?? 300} px up in the air (start the scene with it, or use jump)`);
  }
  // overlapping actions of one layer that share joints: allowed (the later interrupts), but worth knowing
  const acts = P.actions || [];
  for (let i = 0; i < acts.length; i++) for (let j = i + 1; j < acts.length; j++) {
    const a = acts[i], b = acts[j]; if (!ACTION_CATALOG[a.type] || !ACTION_CATALOG[b.type]) continue;
    const la = a.layer || ACTION_CATALOG[a.type].layer, lb = b.layer || ACTION_CATALOG[b.type].layer;
    if (la === lb && a.start < b.start + b.duration - .01 && b.start < a.start + a.duration - .01 && !ACTION_CATALOG[a.type].additive && !ACTION_CATALOG[b.type].additive)
      warnings.push(`actions ${i} (${a.type}) and ${j} (${b.type}) overlap on layer ${la}: the later one interrupts`);
  }
  return { ok: !errors.length, errors, warnings, plan: P };
}

// writes the story + copies the images; returns the story id
export function buildScene(P, { story, type } = {}) {   // type: text items drawn on top (typeOverlay), e.g. a film's subtitle
  const id = P.id, sid = story || `_act_${id}`, dir = `${ROOT}src/stories/${sid}`, adir = `${ROOT}assets/action/${id}`;
  mkdirSync(dir, { recursive: true }); mkdirSync(adir, { recursive: true });
  const rel = f => relative(ROOT, f).split('\\').join('/');
  const characters = {}, props = {};
  for (const c of P.characters) { const dst = `${adir}/${c.id}_${basename(c._imagePath)}`; copyFileSync(c._imagePath, dst); characters[c.id] = { rig: c._rig, image: rel(dst) }; }
  for (const p of P.props || []) { const dst = `${adir}/${p.id}_${basename(p._imagePath)}`; copyFileSync(p._imagePath, dst); props[p.id] = { spec: p._spec, image: rel(dst) }; }
  const clean = JSON.parse(JSON.stringify(P, (k, v) => k.startsWith('_') ? undefined : v));
  const [w, h] = { '9:16': [1080, 1920], '16:9': [1920, 1080], '4:5': [1080, 1350] }[P.aspect];
  writeFileSync(`${dir}/config.js`, `// GENERATED by tools/action/plan.mjs from motion plan "${id}". Do not edit: change the plan and rebuild.\n` +
    `const PROJECT = ${JSON.stringify({ width: w, height: h, aspect: P.aspect, duration: P.duration, bpm: 120, offset: 0, audio: '', look: P.look || 'classic',
      files: ['src/action/catalog.js', 'src/action/rig.js', 'src/action/composer.js', 'src/action/play.js', 'scene.js'] })};\n`);
  writeFileSync(`${dir}/scene.js`, `// GENERATED by tools/action/plan.mjs. Do not edit.\nconst ACTION_SCENE = ${JSON.stringify({ plan: clean, characters, props, ...(type?.length ? { type } : {}) })};\nplayAction(ACTION_SCENE);\n`);
  mkdirSync(`${ROOT}out/action/${id}`, { recursive: true });
  writeFileSync(`${ROOT}out/action/${id}/motion_plan.json`, JSON.stringify(clean, null, 2));
  return sid;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
  // --catalog: the presets, layers, joint groups, effects and the plan schema as JSON (AutoCinematic's Action Composer reads it)
  if (args.catalog) { process.stdout.write(JSON.stringify({ catalog: ACTION_CATALOG, layers: ACTION_LAYERS, groups: ACTION_GROUPS, effects: ACTION_EFFECTS, aliases: ACTION_ALIASES, schema: MOTION_PLAN_SCHEMA })); process.exit(0); }
  if (!args.plan) { console.error('usage: node tools/action/plan.mjs --plan=<motion_plan.json> [--check] [--substitute] | --catalog'); process.exit(2); }
  let P; try { P = JSON.parse(readFileSync(args.plan, 'utf8')); } catch (e) { console.error('plan.mjs: ' + e.message); process.exit(2); }
  const r = validatePlan(P, { substitute: !!args.substitute, base: dirname(resolve(args.plan)) });
  const id = /^[a-z0-9_]{1,40}$/.test(P.id || '') ? P.id : 'invalid';
  mkdirSync(`${ROOT}out/action/${id}`, { recursive: true });
  writeFileSync(`${ROOT}out/action/${id}/plan_report.json`, JSON.stringify({ ok: r.ok, errors: r.errors, warnings: r.warnings }, null, 2));
  for (const e of r.errors) console.log('ERROR   ' + e);
  for (const w of r.warnings) console.log('warning ' + w);
  if (!r.ok) { console.log(`plan "${id}": INVALID (${r.errors.length} error(s)) → out/action/${id}/plan_report.json`); process.exit(1); }
  if (args.check) { console.log(`plan "${id}": valid (${r.plan.actions.length} actions)`); process.exit(0); }
  const sid = buildScene(r.plan, { story: args['out-story'] });
  console.log(`plan "${id}": valid, ${r.plan.actions.length} actions → src/stories/${sid}/ (render: node render.mjs --story=${sid} …)`);
}
