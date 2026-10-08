// art.js: the drawings for "one message": a phone, a message bubble, a person in profile, mind blobs and a spiral.
// They only draw, in place; story.js and the presets move them. Swap any of them to restyle the story.
const ART = (() => {
  const C = { ink: PAL.ink, coral: '#E2735A', cream: '#FFF5E2', slate: '#3D4262', screen: '#EDF2EE', skin: '#EBBB9C', hair: '#2F3C7A' };

  // Shapes for the presets (shapeMorph and popBounce take shape names): a speech bubble with a tail, and a soft blob.
  SHAPES.bubble = (x, y, r) => {
    const w = 2.4 * r, h = 1.5 * r, x0 = x - w / 2, y0 = y - h / 2, p = rrPts(x0, y0, w, h, .5 * r);
    p.splice(12, 0, [x0 + w * .42, y0 + h], [x0 + w * .18, y0 + h + .5 * r], [x0 + w * .27, y0 + h]);   // tail, on the bottom edge
    return p;
  };
  SHAPES.blob = (x, y, r) => Array.from({ length: 36 }, (_, i) => {
    const a = i / 36 * TAU, k = 1 + .13 * Math.sin(3 * a + 1.3) + .07 * Math.sin(5 * a + .4);
    return [x + Math.cos(a) * r * k, y + Math.sin(a) * r * .9 * k];
  });

  // Two wavy lines that stand for the message (never letters). k 0..1 shortens them away.
  function bubbleLines(r, k = 1) {
    if (k <= .02) return;
    [[-.22, .78], [.2, .45]].forEach(([dy, len], j) => {
      const pts = []; for (let i = 0; i <= 6; i++) pts.push([(-.8 + 1.6 * len * k * i / 6) * r, (dy + .05 * Math.sin(i * 1.9 + j)) * r]);
      inkLine(pts, Math.max(.4, r / 55), C.cream, 'inkfine', .5);
    });
  }
  function bubble(r, o = {}) {
    paint(SHAPES.bubble(0, 0, r), { wash: o.color || C.coral, ink: C.ink, sw: 1.1 });
    bubbleLines(r, o.lines ?? 1);
  }

  // A phone, u = size unit (8.6u tall), centred on (0, 0).
  function phone(u) {
    paint(rrPts(-2.2 * u, -4.3 * u, 4.4 * u, 8.6 * u, .62 * u), { wash: C.slate, ink: C.ink, sw: 1.3 });
    paint(rrPts(-1.9 * u, -3.85 * u, 3.8 * u, 7.5 * u, .38 * u), { wash: C.screen, fill: '#CFE3DD', fillOp: 60, bleed: .15, tex: .5, ink: null });
    paint(rrPts(-.55 * u, -4.12 * u, 1.1 * u, .14 * u, .07 * u), { wash: C.ink, ink: null });
    inkLine([[-.6 * u, 3.95 * u], [.6 * u, 3.95 * u]], .9, C.cream, 'inkfine', 0);
  }

  // A person in profile, facing right; (x, y) = centre of the head, r = head radius. The neck runs off the bottom.
  //   tension 0..1 knits the brow and turns the mouth down; blink 0..1 closes the eye; skin, hair override colours.
  const SKIN = [[-.85, -.62], [-.45, -.98], [.1, -1.05], [.55, -.86], [.78, -.52], [.86, -.3], [.84, -.17], [1.02, .03], [.87, .11], [.91, .22],
    [.84, .3], [.89, .38], [.79, .58], [.52, .72], [.42, .95], [.47, 2.6], [-.38, 2.6], [-.34, .95], [-.62, .58], [-.93, .25], [-.97, -.18]];
  const HAIR = [[-1, .32], [-.99, -.2], [-.86, -.7], [-.42, -1.08], [.14, -1.14], [.62, -.92], [.84, -.55], [.62, -.62], [.3, -.66], [.02, -.52],
    [-.22, -.28], [-.38, .05], [-.55, .4], [-.72, .6]];
  function head(x, y, r, o = {}) {
    const P = pts => pts.map(([a, b]) => [x + a * r, y + b * r]), t = o.tension || 0, sw = 1.5;
    boilSeed('head');
    paint(P(SKIN), { wash: o.skin || C.skin, ink: C.ink, sw, curv: .5 });
    paint(P([[.5, .06], [.6, .02], [.66, .1], [.58, .16]]), { fill: PAL.rose, fillOp: 45, bleed: .2, ink: null });   // cheek
    paint(P(HAIR), { wash: o.hair || C.hair, ink: C.ink, sw, curv: .5 });
    inkLine(P([[-.08, -.12], [-.2, -.08], [-.22, .06], [-.1, .12]]), sw * .7, C.ink, 'inkfine', .6);                  // ear
    if ((o.blink || 0) > .5) inkLine(P([[.54, -.15], [.61, -.13], [.68, -.15]]), sw * .8, C.ink, 'inkfine', .5);
    else { inkLine(P([[.54, -.15], [.61, -.2], [.68, -.16]]), sw * .8, C.ink, 'inkfine', .5); paint(ellPts(x + .615 * r, y - .155 * r, .03 * r, .036 * r, 10), { wash: C.ink, ink: null }); }
    inkLine(P([[.49, -.29], [.6, -.32 - .02 * t], [.72, -.28 + .07 * t]]), sw * 1.1, C.ink, 'ink', .5);              // brow
    inkLine(P([[.79, .3], [.86, .3 + .025 * t]]), sw * .7, C.ink, 'inkfine', 0);                                     // mouth
  }

  // Background pools of colour for the mind: opaque wash with a watercolour fill over it.
  function mindBlob(r, col) {
    paint(SHAPES.blob(0, 0, r), { wash: col, fill: mixCol(col, '#FFFFFF', .25), fillOp: 70, bleed: .2, tex: .6, ink: null });
  }

  // An Archimedean spiral around (cx, cy): radius a + b·θ for θ in 0..theta, turned by rot.
  const spiralPt = (cx, cy, th, o) => { const r = o.a + o.b * th; return [cx + Math.cos(th + o.rot) * r, cy + Math.sin(th + o.rot) * r * .85]; };
  function spiral(cx, cy, o) {
    if (o.theta < .3) return;
    const pts = []; for (let th = 0; th <= o.theta; th += .15) pts.push(spiralPt(cx, cy, th, o));
    boilSeed('spiral'); inkLine(pts, o.sw, o.col, 'ink', .5);
  }

  return { C, bubble, bubbleLines, phone, head, mindBlob, spiral, spiralPt };
})();
