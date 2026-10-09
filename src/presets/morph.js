// shapeMorph: one painted shape melts through a list of shapes (and colours), with a squash-pop mid-change.
//   shapes   names from SHAPES, in order            colors   one per shape (blended on the way)
//   dur      seconds per morph    hold  seconds between morphs      x, y, size, spin (radians over the whole run)
// Shapes are resampled to the same point count, started at the top and wound the same way, so they don't twist.
function resamplePts(pts, n = 48) {
  const area = pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
  let P = area < 0 ? pts.slice().reverse() : pts.slice();                   // clockwise on screen
  let top = 0; P.forEach((p, i) => { if (p[1] < P[top][1] - 1e-6) top = i; }); P = P.slice(top).concat(P.slice(0, top));
  const len = [0]; P.forEach((p, i) => len.push(len[i] + Math.hypot(P[(i + 1) % P.length][0] - p[0], P[(i + 1) % P.length][1] - p[1])));
  return Array.from({ length: n }, (_, j) => {
    const d = len[len.length - 1] * j / n; let i = 0; while (len[i + 1] < d) i++;
    const a = P[i], b = P[(i + 1) % P.length], f = (d - len[i]) / ((len[i + 1] - len[i]) || 1);
    return [lerp(a[0], b[0], f), lerp(a[1], b[1], f)];
  });
}
definePreset('shapeMorph', {
  label: 'Shape Morph', about: 'resampled point lists blended with lerp, colour with mixCol',
  meta: { version: '1.0.0', category: 'object', tags: ['morph', 'transform', 'shape', 'change'] },
  defaults: { shapes: ['circle', 'star', 'heart'], colors: [PAL.sky, PAL.ochre, PAL.rose], x: W / 2, y: H / 2, size: 200 * US(), hold: .5, spin: 0, dur: .8 },
  run(t, o) {
    const n = o.shapes.length - 1, step = o.dur + o.hold, i = clamp(Math.floor((t - o.at) / step), 0, n - 1), s0 = o.at + i * step;
    const k = easeBy(o.ease)(seg(t, s0, s0 + o.dur)), shape = j => resamplePts(SHAPES[o.shapes[j]](0, 0, o.size));
    const A = shape(i), B = shape(i + 1), pts = A.map((p, j) => [lerp(p[0], B[j][0], k), lerp(p[1], B[j][1], k)]);
    const pop = 1 + .14 * Math.sin(k * Math.PI);
    presetPlace(o.x, o.y, o.spin * seg(t, o.at, o.at + n * step), pop, pop, () =>
      paint(pts, { wash: mixCol(o.colors[i], o.colors[i + 1], k), ink: PAL.ink, sw: 1 }));
  },
  demo: { bg: PAL.cream, layers: [['shapeMorph', { shapes: ['circle', 'star', 'heart', 'square'], colors: [PAL.sky, PAL.ochre, PAL.rose, PAL.sap], at: .3, spin: .4 }]] },
});
