// pip.js: "Pip", an original character for the motion systems: a round seed-creature with a sprout, stubby legs and
// big eyes. ART only: each part is a painter on the cutout rig (src/rig/cutout.js) and can be replaced by a PNG layer
// of the same name. Motion comes from the systems (acting, motion); Pip only reads the pose.
//
//   const P = makePip({ colors: { body: '#…' } });   drawCharacter(P, x, y, u, t => pose, t)   (x, y) = body centre, u = body radius
// Pose: { legL, legR, armL, armR: { rot }, sprout: { rot }, face: { look [x, y], blink, wide, happy, brow, mouth, open } }
//   mouth: 'smile' | 'open' | 'o' | 'flat'. Feet are 1.5 u below the body centre (PIP_FEET).
// For actors (systems/actor.js) it also exposes the adapter: feet, head, pose(channels). Registered as CHARACTERS.pip.
const PIP_FEET = 1.5;
function makePip(o = {}) {
  const C = { body: '#F2B33D', belly: '#FFE2A0', shade: '#D98E2B', blush: '#EE8A7A', leaf: '#6FB45C', leafDk: '#4C8A43', eye: '#FFFDF6', ink: PAL.ink, ...o.colors };
  const F = .14;                                    // features sit toward the right: Pip faces the way it runs
  const sw = u => u / 42;
  const face = pose => ({ look: [0, 0], blink: 0, wide: 0, happy: 0, brow: 0, mouth: 'smile', open: 0, ...pose.face });
  const BODY = Array.from({ length: 30 }, (_, i) => { const a = i / 30 * TAU, s = Math.sin(a); return [Math.cos(a) * (1 + (s > 0 ? .07 : .02) * s), s * (s > 0 ? .95 : 1.06)]; });   // a little pear-shaped: weight at the bottom

  function leg(u) {
    paint(ribbon([[0, 0], [0, .34 * u], [.02 * u, .64 * u]], .21 * u, .16 * u), { wash: C.shade, ink: C.ink, sw: sw(u) });
    paint(ellPts(.11 * u, .7 * u, .25 * u, .13 * u, 14), { wash: C.shade, ink: C.ink, sw: sw(u) });
    paint(ellPts(.06 * u, .66 * u, .12 * u, .04 * u, 8), { wash: C.belly, washOp: 120, ink: null });   // shine on the shoe
  }
  function arm(u, dir) {
    paint(ribbon([[0, 0], [dir * .22 * u, .03 * u], [dir * .42 * u, .02 * u]], .17 * u, .14 * u), { wash: C.body, ink: C.ink, sw: sw(u) });
    paint(ellPts(dir * .46 * u, .02 * u, .12 * u, .11 * u, 12), { wash: C.body, ink: C.ink, sw: sw(u) });   // a little round hand
  }
  function eye(u, f, side) {
    const w = .2 * u * (1 + .3 * f.wide), h = .25 * u * (1 + .3 * f.wide), s = sw(u);
    if (f.happy > .5) { inkLine([[-w, .05 * u], [0, -.12 * u], [w, .05 * u]], s * 1.6, C.ink, 'ink', .5); return; }
    if (f.blink > .5) { inkLine([[-w, 0], [0, .07 * u], [w, 0]], s * 1.5, C.ink, 'ink', .5); return; }
    paint(ellPts(0, 0, w, h, 18), { wash: C.eye, ink: C.ink, sw: s * .9 });
    const [lx, ly] = f.look, px = lx * w * .42, py = ly * h * .38, pr = .6 * w;
    paint(ellPts(px, py, pr, pr * 1.15, 14), { wash: C.ink, ink: null });
    paint(ellPts(px - pr * .35, py - pr * .45, pr * .3, pr * .3, 8), { wash: C.eye, ink: null });
    paint(ellPts(px + pr * .35, py + pr * .4, pr * .14, pr * .14, 6), { wash: C.eye, ink: null });
  }

  const parts = [
    { name: 'body', z: 1, draw: (u, pose) => {
      const f = face(pose), s = sw(u);
      paint(BODY.map(([x, y]) => [x * u, y * u]), { wash: C.body, ink: C.ink, sw: s * 1.1, curv: .5 });
      paint([[.55, -.75], [.95, -.3], [1.0, .25], [.75, .75], [.3, .98], [.55, .55], [.72, .05], [.68, -.4]].map(([x, y]) => [x * u, y * u]), { wash: C.shade, washOp: 120, ink: null, curv: .5 });   // form shadow
      paint(ellPts(.12 * u, .38 * u, .55 * u, .42 * u, 20), { wash: C.belly, ink: null });                  // belly
      paint(ellPts(-.42 * u, -.5 * u, .26 * u, .14 * u, 12, 0, -.6), { wash: '#FFFFFF', washOp: 150, ink: null });   // gloss
      paint(ellPts((-.48 + F) * u, .12 * u, .14 * u, .08 * u, 10), { fill: C.blush, fillOp: 130, bleed: .1, ink: null });
      paint(ellPts((.52 + F) * u, .1 * u, .12 * u, .08 * u, 10), { fill: C.blush, fillOp: 130, bleed: .1, ink: null });
      for (const [x, ...rest] of [[-.3 + F], [.3 + F]]) {                                                      // brows
        const b = f.brow, side = x < F ? -1 : 1;
        inkLine([[(x - .1) * u, (-.6 - .1 * b + side * .04 * b) * u], [x * u, (-.64 - .1 * b) * u], [(x + .1) * u, (-.6 - .1 * b - side * .04 * b) * u]], s * 1.1, C.ink, 'ink', .5);   // a small arch, clear of the eye
      }
    } },
    { name: 'legL', parent: 'body', joint: [-.3, .78], z: 0, draw: u => leg(u) },
    { name: 'legR', parent: 'body', joint: [.32, .78], z: 0, draw: u => leg(u) },
    { name: 'armL', parent: 'body', joint: [-.92, .1], z: 2, drag: .5, draw: u => arm(u, -1) },
    { name: 'armR', parent: 'body', joint: [.92, .1], z: 2, drag: .5, draw: u => arm(u, 1) },
    { name: 'eyeL', parent: 'body', joint: [-.3 + F, -.18], z: 3, draw: (u, pose) => eye(u, face(pose), -1) },
    { name: 'eyeR', parent: 'body', joint: [.3 + F, -.18], z: 3, draw: (u, pose) => eye(u, face(pose), 1) },
    { name: 'mouth', parent: 'body', joint: [F * .9, .2], z: 3, draw: (u, pose) => {
      const f = face(pose), s = sw(u), w = .16 * u;
      if (f.mouth === 'open' || f.open > .05) {
        const h = (.08 + .14 * Math.max(f.open, f.mouth === 'open' ? 1 : 0)) * u;
        paint([[-w, 0], [w, 0], [w * .7, h * .7], [0, h], [-w * .7, h * .7]], { wash: '#7A3540', ink: C.ink, sw: s, curv: .5 });
      } else if (f.mouth === 'o') paint(ellPts(0, .03 * u, .07 * u, .09 * u, 12), { wash: '#7A3540', ink: C.ink, sw: s });
      else if (f.mouth === 'flat') inkLine([[-w * .8, .02 * u], [w * .8, .02 * u]], s * 1.2, C.ink, 'ink', 0);
      else inkLine([[-w, -.02 * u], [0, .07 * u], [w, -.02 * u]], s * 1.2, C.ink, 'ink', .5);
    } },
    { name: 'sprout', parent: 'body', joint: [.04, -.98], z: .5, drag: .9, draw: u => {
      inkLine([[0, 0], [.04 * u, -.18 * u], [.02 * u, -.34 * u]], sw(u) * 2.2, C.leafDk, 'ink', .5);
      paint(ellPts(.2 * u, -.42 * u, .22 * u, .1 * u, 14, 0, -.5), { wash: C.leaf, ink: C.ink, sw: sw(u) * .8 });
      inkLine([[.04 * u, -.36 * u], [.36 * u, -.5 * u]], sw(u) * .6, C.leafDk, 'inkfine', 0);
    } },
  ];
  return { ...defineCharacter({ id: o.id || 'pip', parts, C, lag: .1 }),
    feet: PIP_FEET, head: [F, -.18], height: PIP_FEET + 1.5, width: 1.15,   // full height (to the leaf tip) and half-width, in u
    pose: c => ({ legL: { rot: c.legL }, legR: { rot: c.legR }, armL: { rot: c.armL }, armR: { rot: c.armR },
      face: { look: c.look, blink: c.blink, wide: c.wide, happy: c.happy, brow: c.brow, mouth: c.mouth, open: c.open } }) };
}
CHARACTERS.pip = makePip;
