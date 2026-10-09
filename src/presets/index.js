// presets/index.js: the motion preset registry.
//
//   preset(name, t, opts, inner)   draws one preset at time t (seconds, usually shot-local: `lt` in a shot fn).
//
// Every preset is a pure function of t, so it renders the same in parallel and out of order. Every preset takes
//   at, dur, ease   when it starts (s), how long its main move lasts (s), and an easing name: linear ease easeIn easeOut
//                   backOut elasticOut (or any function k => k)
// and, for presets that draw an object, x, y, size, color, shape ('star' circle heart square) or your own
// draw(size), which paints around (0, 0). Add a preset with definePreset() in its own file under src/presets/.
// presetShot() in scene.js picks and configures presets from data.

const PRESETS = {};
// Verified aspect support per preset: ratios its gallery demo has PASSED in tools/aspect_test.mjs (low-res frames, framing
// checked by eye). Never list a ratio that has not passed; a new preset starts with [] and is added after its test.
const PRESET_ASPECTS = { cameraMove: ['9:16', '16:9', '4:5'], popBounce: ['9:16', '16:9', '4:5'], shapeMorph: ['9:16', '16:9', '4:5'],
  brushWipe: ['9:16', '16:9', '4:5'], objectReveal: ['9:16', '16:9', '4:5'], particleBurst: ['9:16', '16:9', '4:5'],
  // map capabilities: fixture = the compiled Magellan prototype plan (aspect_test target map_proto); production formats only
  mapView: ['9:16', '16:9'], mapBase: ['9:16', '16:9'], routeDraw: ['9:16', '16:9'], mapMarker: ['9:16', '16:9'], mapLabel: ['9:16', '16:9'],
  // style kit (fixture: aspect_test target map_style)
  mapRegion: ['9:16', '16:9'], mapSprite: ['9:16', '16:9'], captionBar: ['9:16', '16:9'] };
const EASES = { linear: clamp, ease, easeIn, easeOut, backOut, elasticOut };
const easeBy = e => typeof e === 'function' ? e : EASES[e] || ease;
const presetK = (t, o) => easeBy(o.ease)(seg(t, o.at, o.at + o.dur));   // eased 0..1 progress of the main move

// name, label (gallery title), about (one line), defaults, run(t, o, inner), demo (a presetShot spec for the gallery)
function definePreset(name, spec) { PRESETS[name] = { name, ...spec }; }

function preset(name, t, opts = {}, inner) {
  const P = PRESETS[name]; if (!P) throw new Error(`unknown preset "${name}" (have: ${Object.keys(PRESETS).join(', ')})`);
  boilSeed('preset|' + name + '|' + (opts.id ?? ''));          // stable linework while the preset's own marks move
  return P.run(t, { at: 0, dur: 1, ease: 'ease', ...P.defaults, ...opts }, inner);
}

// ---------- shared pieces for presets that draw an object ----------
const SHAPES = {
  circle: (x, y, r) => ellPts(x, y, r, r, 28),
  star: (x, y, r) => starPts(x, y, r, .45, 5),
  heart: (x, y, r) => heartPts(x, y + r * .1, r),
  square: (x, y, r) => rrPts(x - r * .85, y - r * .85, r * 1.7, r * 1.7, r * .3),
};
// Draw the preset's object around (0, 0): o.draw(size) if given, else a painted shape.
function presetItem(o) {
  if (o.draw) return o.draw(o.size, o);
  paint(SHAPES[o.shape](0, 0, o.size), { wash: o.color, ink: PAL.ink, sw: 1 });
}
// Run fn in a frame placed at (x, y), rotated and scaled (sx, sy): the object's local space.
function presetPlace(x, y, rot, sx, sy, fn) { push(); translate(x, y); rotate(rot); scale(sx, sy); fn(); pop(); }

// ---------- capability catalog (read by tools/capabilities.mjs for the Director and the plan compiler) ----------
// Every registered preset is discoverable: its parameter schema is inferred from `defaults` (number, string, boolean,
// color, array), and an optional `meta` in the preset spec adds category, tags, constraints and required assets:
//   meta: { version, category, tags: [], params: { name: { min, max, enum, type } }, assets: [{ param, type }], camera, layers }
// Status is 'verified' only for presets with aspects that PASSED tools/aspect_test.mjs; otherwise 'experimental'.
const PRESET_DEMO_ONLY = new Set(['x', 'y', 'size']);   // sized from the frame at load: their defaults are not limits
function inferParam(v) {
  if (typeof v === 'number') return { type: 'number' };
  if (typeof v === 'boolean') return { type: 'boolean' };
  if (typeof v === 'string') return /^#[0-9a-f]{3,8}$/i.test(v) ? { type: 'color' } : { type: 'string' };
  if (Array.isArray(v)) return { type: 'array' };
  return { type: v === null ? 'any' : typeof v };
}
function capabilityOf(P, kind, aspects) {
  const m = P.meta || {}, params = {};
  for (const [k, v] of Object.entries({ at: 0, dur: 1, ease: 'ease', ...P.defaults })) params[k] = { ...inferParam(v), ...(PRESET_DEMO_ONLY.has(k) ? {} : { default: v }) };
  for (const [k, v] of Object.entries(m.params || {})) params[k] = { ...params[k], ...v };
  if (params.ease) params.ease.enum = Object.keys(EASES);
  return { id: kind === 'type' ? 'type.' + P.name : P.name, kind, version: m.version || '1.0.0', category: m.category || kind,
    label: P.label || P.name, about: P.about || '', tags: m.tags || [], params, assets: m.assets || [], camera: m.camera || 'world',
    layers: m.layers || ['object'], aspects: aspects || [], status: (aspects || []).length ? 'verified' : 'experimental' };
}
window.CAPABILITY_CATALOG = () => [
  ...Object.values(PRESETS).map(P => capabilityOf(P, 'preset', PRESET_ASPECTS[P.name])),
  ...(typeof TYPE_PRESETS === 'undefined' ? [] : Object.keys(TYPE_PRESETS).map(n => capabilityOf({ name: n, label: n, about: 'kinetic typography item preset (playType / typeOverlay)',
    defaults: { text: '', end: 1, x: .5, y: .5, maxWidth: .84, maxLines: 3, safe: 'title', style: {}, out: null, by: 'word', stagger: .08, prefer: 'up', say: null, unitDur: null, from: null, to: null,
      rate: 12, tilt: null, boil: 1, papers: [], inks: [], weights: [], bar: null, padX: .28, padY: .12, cursor: null, words: [], keep: true, burst: null, flash: null, hlAt: null,
      digits: null, decimals: 0, locale: null, prefix: '', suffix: '', suffixStyle: {} }, meta: { category: 'type', tags: ['text', 'title', 'label', 'caption'], layers: ['text'], camera: 'screen' } }, 'type', TYPE_PRESET_ASPECTS[n]))),
  // collage motions: a layer's `motion: [{ kind, ... }]` in a collage manifest (src/collage/collage.js); artwork is imported PNGs
  ...(typeof COLLAGE_MOTIONS === 'undefined' ? [] : Object.entries(COLLAGE_MOTIONS).map(([n, M]) => ({ ...capabilityOf({ name: n, label: n, about: M.about, defaults: M.defaults,
    meta: { category: 'collage', tags: ['collage', 'cutout', 'paper', 'stop-motion'], layers: ['collage layer'], camera: 'world', assets: ['png cut-out (the layer)'] } }, 'collage', COLLAGE_MOTION_ASPECTS[n]), id: 'collage.' + n }))),
  // a collage layer itself (one imported PNG cut-out) for compiled plans: shot layers { cap: 'collage.layer', params, motion: [...] }
  ...(typeof COLLAGE_MOTIONS === 'undefined' ? [] : [{ ...capabilityOf({ name: 'layer', label: 'collage layer', about: 'one imported PNG cut-out placed on the collage page (world px on the 1080 × 1920 page): size [w] or [null, h] (never stretched), at, anchor, depth (parallax), step (2 = on twos), paper (shadow, border, grain), subject (text avoids it); its moves are its motion list of collage.* capabilities; gen: how tools/gen_assets.mjs makes the PNG',
    defaults: { file: '', size: [400], at: [540, 960], anchor: [.5, .5], rot: 0, scale: 1, opacity: 1, depth: 1, step: 2, paper: {}, subject: false, fill: false, edgeOk: false, keys: [], boil: {}, gen: {} },
    meta: { category: 'collage-layer', tags: ['collage', 'cutout', 'png', 'layer'], layers: ['collage layer'], camera: 'world', assets: ['png cut-out'] } }, 'collage', COLLAGE_MOTION_ASPECTS.layer), id: 'collage.layer' }]),
  ...(typeof COLLAGE_TRANSITIONS === 'undefined' ? [] : Object.entries(COLLAGE_TRANSITIONS).map(([n, about]) => ({ ...capabilityOf({ name: n, label: n, about: `collage reel transition: ${about}`,
    defaults: { dur: .6, focus: null, zoom: 4, from: 'right', color: '' }, meta: { category: 'transition', tags: ['collage', 'transition', 'reel'], layers: ['scene'], camera: 'screen' } }, 'transition', COLLAGE_MOTION_ASPECTS['transition.' + n]), id: 'transition.' + n }))),
];
