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
  brushWipe: ['9:16', '16:9', '4:5'], objectReveal: ['9:16', '16:9', '4:5'], particleBurst: ['9:16', '16:9', '4:5'] };
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
