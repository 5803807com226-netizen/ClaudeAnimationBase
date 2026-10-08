// cameraMove: pan and zoom the camera from one framing to another, with optional drift and shake.
//   from / to   [x, y, zoom] world point at screen centre and zoom      rot  [from, to] radians
//   keys        instead of from/to: [[t, [x, y, zoom, rot?]], ...] keyframes through kf(), each segment eased (all the same length)
//   drift       px of slow sway (the camera is never dead)               shake  px of shake, e.g. on an impact
// Pass the scene as `inner` and it is wrapped in camBegin/camEnd; without it, you must call camEnd() yourself.
definePreset('cameraMove', {
  label: 'Camera Pan & Zoom', about: 'camBegin/camEnd driven by eased from → to keyframes, plus drift and shake',
  defaults: { from: [W / 2, H / 2, 1], to: [W / 2, H / 2, 1.3], rot: [0, 0], drift: 0, shake: 0, dur: 3 },
  run(t, o, inner) {
    const k = presetK(t, o), v = o.keys ? kf(t, o.keys, easeBy(o.ease)) : null, [sx, sy] = o.shake ? shakeXY(t, o.shake) : [0, 0];
    const [cx, cy, z] = v || o.from.map((f, i) => lerp(f, o.to[i], k)), rot = v ? v[3] || 0 : lerp(o.rot[0], o.rot[1], k);
    camBegin(cx + o.drift * wob(t, .23) + sx, cy + o.drift * .6 * wob(t, .17, .3) + sy, z, rot);
    if (inner) { inner(); camEnd(); }
  },
  demo: {
    bg: PAL.sky, ground: { y: 860, color: PAL.sap },
    camera: { from: [W / 2, H / 2, 1], to: [1250, 600, 1.5], at: .3, dur: 3, drift: 10 },
    layers: [(lt) => { clawd(700, 860, 24, feel('happy', lt)); paint(heartPts(1500, 800, 70), { wash: PAL.rose, ink: PAL.ink, sw: 1 }); }],
  },
});
