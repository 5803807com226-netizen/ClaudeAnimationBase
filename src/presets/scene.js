// presets/scene.js: pick and configure presets from data, so a story shot is a short spec instead of animation code.
//
//   const shotA = presetShot({
//     bg: PAL.sky, ground: { y: 860, color: PAL.sap },                  // background (or bg: (lt, dur) => colour); both optional
//     camera: { from: [960, 540, 1], to: [1200, 560, 1.3], dur: 4 },     // cameraMove options; wraps bg + layers
//     layers: [                                                          // drawn in order, in the camera
//       (lt) => clawd(700, 860, 26, feel('happy', lt)),                   // a function is your own content: fn(lt, dur, t)
//       ['objectReveal', { x: 1200, y: 700, at: 1.5 }],                   // ['preset', options]
//       ['particleBurst', d => ({ x: 1200, y: 700, at: d - 2 })],         // options may be fn(dur), to time from the end
//     ],
//     after: [['brushWipe', d => ({ part: 'cover', at: d - .8 })]],      // screen space, after the camera: transitions
//   });
//   shots([[0, shotA], [5, shotB]]);       // a real video; or presetSequence([[0, shotA], [5, shotB]], 10) for a loop
// All `at` times are relative to the start of the shot.
function presetShot(spec) {
  const run = (L, lt, dur, t) => typeof L === 'function' ? L(lt, dur, t) : preset(L[0], lt, typeof L[1] === 'function' ? L[1](dur) : L[1]);
  return (t, lt, dur) => {
    const world = () => {
      // A flat, opaque background looks the same as a wash at 255, but a frame whose first wash is the full background
      // can composite it through the previous frame's mask (p5.brush 2.2.3): a ghost of the last shape, the rest bare.
      if (spec.bg) background(typeof spec.bg === 'function' ? spec.bg(lt, dur) : spec.bg);
      if (spec.ground) { boilSeed('ground'); paint(rectPts(-600, spec.ground.y, W + 1200, H + 400 - spec.ground.y), { wash: spec.ground.color, ink: PAL.ink, sw: 1 }); }
      (spec.layers || []).forEach(L => run(L, lt, dur, t));
    };
    if (spec.camera) preset('cameraMove', lt, typeof spec.camera === 'function' ? spec.camera(dur) : spec.camera, world); else world();
    (spec.after || []).forEach(L => run(L, lt, dur, t));
  };
}
// A timed list of shots as a standalone loop (LOOPS) of length len: [[start, shotFn], ...].
function presetSequence(list, len) {
  const f = t => {
    let i = 0; while (i + 1 < list.length && t >= list[i + 1][0]) i++;
    const t0 = list[i][0], end = i + 1 < list.length ? list[i + 1][0] : len;
    list[i][1](t, t - t0, end - t0);
  };
  f.len = len; return f;
}
// A story as data: { shots: [{ at, ...presetShot spec }, ...], narration: [{ at, end, text }] }. narration is timing
// reference for the voiceover (never drawn); see src/stories/ and story.html.
function playStory(story) { shots(story.shots.map(s => [s.at, presetShot(s)])); }
// Layered parallax inside a camera: content drawn in fn moves on screen at `depth` × the camera's motion
// (depth < 1: far, slower; > 1: near, faster). Draw far layers first. Anchored to a fixed world point (PARALLAX_REF,
// responsive.js), not the canvas centre, so a layer sits in the same place in every aspect ratio.
function parallax(depth, fn) {
  if (!CAM) return fn();
  push(); translate((CAM.cx - PARALLAX_REF[0]) * (1 - depth), (CAM.cy - PARALLAX_REF[1]) * (1 - depth)); fn(); pop();
}

// Object-driven transition: ONE object carries the viewer from one idea to the next. It leaves its source with an
// anticipation squash, travels a smooth path (via points), morphs its outline and colour on the way (any two SHAPES,
// resampled so they don't twist), stretches along the motion, and settles with a little overshoot. Pure function of t.
//   objectTransition(t, { at, dur, from: { x, y, size, shape, color }, to: { ... }, via: [[x, y], ...],
//     ease, anticipate (s, .18), morph: [k0, k1] (when the outline changes, as fractions of the trip, [.15, .85]),
//     ink, sw, inside: (mk, size) => draw content in the object's local space (e.g. lines on a message) })
//   → { x, y, k (trip 0..1), mk (morph 0..1), size }: so other elements can follow or react to it.
// objectTransitionAt(t, o) gives the same pose without drawing (for layout, subjects and followers).
function objectTransitionAt(t, o) {
  const F = o.from, T = o.to, k = easeBy(o.ease || 'ease')(seg(t, o.at, o.at + o.dur)), m = o.morph || [.15, .85], mk = ease(seg(k, m[0], m[1]));
  const P = through([[F.x, F.y], ...(o.via || []), [T.x, T.y]], 10), L = [0];   // the path, at constant speed
  for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const d = k * L[L.length - 1]; let i = 1; while (i < L.length - 1 && L[i] < d) i++;
  const f = (d - L[i - 1]) / ((L[i] - L[i - 1]) || 1), x = lerp(P[i - 1][0], P[i][0], f), y = lerp(P[i - 1][1], P[i][1], f);
  return { x, y, k, mk, size: lerp(F.size, T.size, mk) };
}
function objectTransition(t, o) {
  const { x, y, k, mk, size } = objectTransitionAt(t, o), F = o.from, T = o.to, A = resamplePts(SHAPES[F.shape](0, 0, F.size)), B = resamplePts(SHAPES[T.shape](0, 0, T.size));
  const pts = A.map((p, j) => [lerp(p[0], B[j][0], mk), lerp(p[1], B[j][1], mk)]);
  const pre = seg(t, o.at - (o.anticipate ?? .18), o.at), go = Math.sin(Math.PI * seg(k, 0, .5));            // squash, then stretch
  const settle = .06 * spring(t, o.at + o.dur, 6, 16), sq = .08 * Math.sin(Math.PI * pre) * (t < o.at ? 1 : 0);
  const sx = 1 + sq - .05 * go + settle, sy = 1 - sq + .07 * go - settle;
  push(); translate(x, y); scale(sx, sy);
  paint(pts, { wash: mixCol(F.color, T.color, mk), ink: o.ink ?? PAL.ink, sw: o.sw ?? 1.1, curv: .3 });
  if (o.inside) o.inside(mk, size);
  pop();
  return { x, y, k, mk, size };
}
