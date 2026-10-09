// cameraMove: pan and zoom the camera from one framing to another, with optional drift and shake.
//   from / to   [x, y, zoom] world point at screen centre and zoom      rot  [from, to] radians
//   keys        instead of from/to: [[t, [x, y, zoom, rot?]], ...] keyframes through kf(), each segment eased (all the same length)
//   smooth      with keys: ONE continuous move through them (velocity carried through each key; at rest only at the ends)
//   settle      0..1: arrives with a small overshoot and settles (a camera operator landing on the framing)
//   drift       px of slow sway (the camera is never dead)               shake  px of shake, e.g. on an impact
// kfSmooth: keys [[t, [values]]] as one cubic Hermite curve, the velocity carried through every inner key
function kfSmooth(t, keys) {
  if (!Array.isArray(keys[0][1])) return kf(t, keys);
  const n = keys.length; if (t <= keys[0][0]) return keys[0][1]; if (t >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 1; while (t > keys[i][0]) i++;
  const vel = j => j === 0 || j === n - 1 ? keys[j][1].map(() => 0) : keys[j][1].map((_, c) => (keys[j + 1][1][c] - keys[j - 1][1][c]) / (keys[j + 1][0] - keys[j - 1][0]));
  const [t0, a] = keys[i - 1], [t1, b] = keys[i], h = t1 - t0, u = (t - t0) / h, u2 = u * u, u3 = u2 * u, va = vel(i - 1), vb = vel(i);
  return a.map((_, c) => (2 * u3 - 3 * u2 + 1) * a[c] + (u3 - 2 * u2 + u) * h * va[c] + (-2 * u3 + 3 * u2) * b[c] + (u3 - u2) * h * vb[c]);
}
// Pass the scene as `inner` and it is wrapped in camBegin/camEnd; without it, you must call camEnd() yourself.
definePreset('cameraMove', {
  label: 'Camera Pan & Zoom', about: 'camBegin/camEnd driven by eased from → to keyframes, plus drift and shake',
  meta: { version: '1.0.0', category: 'camera', tags: ['camera', 'pan', 'zoom', 'push', 'pull', 'drift', 'shake'], params: { drift: { min: 0, max: 60 }, shake: { min: 0, max: 40 } }, camera: 'camera', layers: ['camera'] },
  defaults: { from: [W / 2, H / 2, 1], to: [W / 2, H / 2, 1.3], rot: [0, 0], drift: 0, shake: 0, smooth: false, settle: 0, dur: 3 },
  run(t, o, inner) {
    const k0 = presetK(t, o), k = o.settle ? k0 + o.settle * .06 * spring(t, o.at + o.dur, 5, 9) : k0, v = o.keys ? (o.smooth ? kfSmooth(t, o.keys) : kf(t, o.keys, easeBy(o.ease))) : null, [sx, sy] = o.shake ? shakeXY(t, o.shake) : [0, 0];
    const [cx, cy, z] = v || o.from.map((f, i) => lerp(f, o.to[i], k)), rot = v ? v[3] || 0 : lerp(o.rot[0], o.rot[1], k);
    camBegin(cx + o.drift * wob(t, .23) + sx, cy + o.drift * .6 * wob(t, .17, .3) + sy, z, rot);
    if (inner) { inner(); camEnd(); }
  },
  demo: {
    bg: PAL.sky, ground: { y: ny(860 / 1080), color: PAL.sap },
    camera: { from: [W / 2, H / 2, 1], to: [nx(1250 / 1920), ny(600 / 1080), 1.5], at: .3, dur: 3, drift: 10 },
    layers: [(lt) => { clawd(nx(700 / 1920), ny(860 / 1080), 24 * US(), feel('happy', lt)); paint(heartPts(nx(1500 / 1920), ny(860 / 1080) - 60 * US(), 70 * US()), { wash: PAL.rose, ink: PAL.ink, sw: 1 }); }],
  },
});
