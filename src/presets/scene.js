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
