// systems/acting.js: Character Acting. Pose channels as data, a library of reactions, gaits and leans. Pure functions
// of time; they return numbers for a character's painters (or PNG layers) to read. Works with src/rig/cutout.js, whose
// lookAt / saccade / blinkAt / bump cover eyes and breaths.
//
//   track(t, keys)            pose keyframes as data: [[t, { channel: value, ... }], ...]; each channel eases between the keys
//                             that set it and holds otherwise. Strings (a mouth shape) switch at their key.
//   react(t, t0, kind, amt)   a reaction starting at t0: take, notice, flinch, joy, relief, shake, nod. Returns channel offsets
//                             (sq squash, dy body units, rot lean, eyes wider, brow up, happy eyes, arms up) to merge()
//   merge(...poses)           adds numeric channels, later strings win
//   gait(dist, stride, o)     a walk/run cycle from the distance travelled: leg swing, body bob, arm swing
//   lean(v, a, o)             lean into speed and against acceleration (radians)

function track(t, keys, e = ease) {
  const out = {}, names = new Set(keys.flatMap(k => Object.keys(k[1])));
  for (const n of names) {
    const ks = keys.filter(k => n in k[1]).map(k => [k[0], k[1][n]]);
    if (typeof ks[0][1] !== 'number') { let v = ks[0][1]; for (const [kt, kv] of ks) if (t >= kt) v = kv; out[n] = v; }
    else out[n] = kf(t, ks, e);
  }
  return out;
}

function merge(...poses) {
  const out = {};
  for (const p of poses) for (const k in p) out[k] = typeof p[k] === 'number' && typeof out[k] === 'number' ? out[k] + p[k] : p[k];
  return out;
}

const REACTIONS = {
  // a surprise take: a quick squash (anticipation), then a stretch up that springs back; eyes and brows pop
  take: a => a < 0 ? { sq: .16 * ease(seg(a, -.1, 0)) } :
    { sq: -.3 * Math.exp(-6 * a) * Math.cos(14 * a), dy: -.35 * Math.exp(-7 * a) * Math.max(0, Math.cos(9 * a)), eyes: .7 * Math.exp(-2.2 * a), brow: .9 * Math.exp(-1.8 * a) },
  // flinch: recoil away (lean back), squeeze, eyes shut briefly
  flinch: a => a < 0 ? {} : { rot: -.22 * Math.exp(-5 * a) * Math.cos(8 * a), sq: .2 * Math.exp(-8 * a), blink: a < .18 ? 1 : 0, brow: -.5 * Math.exp(-3 * a) },
  // joy: a bounce of delight, happy eyes, arms up
  joy: a => a < 0 ? {} : { happy: a < 1.1 ? 1 : 0, arms: 1.1 * bump(a, 0, .9), dy: -.25 * bump(a, .05, .35), sq: .12 * Math.exp(-6 * a) * Math.cos(16 * a), brow: .4 * bump(a, 0, 1) },
  // relief: an exhale (settle down and wide), eyes close softly
  relief: a => a < 0 ? {} : { sq: .1 * bump(a, 0, .7), dy: .08 * bump(a, 0, .7), blink: bump(a, .05, .55) > .6 ? 1 : 0, brow: -.2 * bump(a, 0, .9) },
  // notice: something caught the eye: a small lift and widened eyes (smaller than a take, no squash first)
  notice: a => a < 0 ? {} : { dy: -.12 * bump(a, 0, .45), eyes: .45 * Math.exp(-2 * a), brow: .5 * Math.exp(-1.5 * a) },
  // shake: shaking something off (snow, water): a quick side-to-side wiggle that dies away
  shake: a => a < 0 || a > .7 ? {} : { rot: .12 * Math.sin(a * 38) * (1 - a / .7), sq: .05 * Math.abs(Math.sin(a * 38)) * (1 - a / .7), blink: a < .5 ? 1 : 0 },
  // nod: two dips
  nod: a => a < 0 ? {} : { rot: .12 * Math.sin(seg(a, 0, .5) * TAU * 2) * (1 - seg(a, 0, .5)) },
};
function react(t, t0, kind, amt = 1) {
  const r = REACTIONS[kind](t - t0), out = {};
  for (const k in r) out[k] = typeof r[k] === 'number' && !['blink', 'happy'].includes(k) ? r[k] * amt : r[k];
  return out;
}

function gait(dist, stride, o = {}) {
  const p = dist / stride * Math.PI, swing = o.swing ?? .55;   // one step per stride; a full cycle is two steps
  return { phase: p, legL: Math.sin(p) * swing, legR: -Math.sin(p) * swing, bob: -Math.abs(Math.sin(p)) * (o.bob ?? .06), arms: Math.sin(p) * (o.arms ?? .4) };
}
const lean = (v, a, o = {}) => clamp(v * (o.k ?? .00022) - a * (o.ka ?? .00009), -(o.max ?? .3), o.max ?? .3);
