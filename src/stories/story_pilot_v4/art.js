// art.js (story_pilot_v4): drawings only, in place, around (0, 0) unless noted. The phone and the speech bubble are
// reused from one_message (ART); this adds the thought, a faceless figure, vibration marks and soft paper discs.
// No letters or numbers anywhere: the message is always drawn as two wavy lines (ART.bubbleLines).
const PILOT_ART = (() => {
  const C = { coral: ART.C.coral, ink: PAL.ink, figure: '#353B6C', figureLt: '#4B5288', disc: '#EADFD0' };

  // A thought: a puffy cloud the same size and colour as the speech bubble, so one can stand in for the other.
  SHAPES.thought = (x, y, r) => Array.from({ length: 60 }, (_, i) => {
    const a = i / 60 * TAU, bump = 1 + .1 * Math.pow(Math.abs(Math.sin(a * 3.5)), .6);
    return [x + Math.cos(a) * 1.2 * r * bump, y + Math.sin(a) * .78 * r * bump];
  });
  function thought(r, o = {}) {
    const col = o.color || C.coral;
    const tr = o.trail === true ? 1 : o.trail || 0;   // 0..1: the two small puffs that make it a thought (shrink them away)
    if (tr > .02) [[-.95, .95, .2], [-1.25, 1.3, .12]].forEach(([dx, dy, s], i) => {
      boilSeed('trail' + i); paint(ellPts(dx * r, dy * r, s * r * tr, s * r * tr, 14), { wash: col, ink: C.ink, sw: .9 });
    });
    paint(SHAPES.thought(0, 0, r), { wash: col, ink: C.ink, sw: 1.1, curv: .5 });
    ART.bubbleLines(r * .9, o.lines ?? 1);
  }

  // A calm, faceless figure (head and shoulders), facing us; (x, y) = centre of the head, r = head radius. It runs off
  // the bottom of the frame. A soft rim of light on one side gives it volume without any features.
  function figure(x, y, r) {
    // the head: an ellipse from its lower left, over the top, to its lower right (screen y down)
    const head = Array.from({ length: 21 }, (_, i) => { const a = (115 + i * 310 / 20) * Math.PI / 180; return [Math.cos(a) * .8, Math.sin(a)]; });
    const P = [[-2.6, 16], [-2.5, 2.6], [-2.05, 1.72], [-.75, 1.42], [-.32, 1.12], ...head, [.32, 1.12], [.75, 1.42], [2.05, 1.72], [2.5, 2.6], [2.6, 16]];   // shoulders ≈ 3 head widths; runs off the frame
    boilSeed('figure'); paint(P.map(([a, b]) => [x + a * r, y + b * r]), { wash: C.figure, ink: C.ink, sw: 1.4, curv: .5 });
    glow(x - .55 * r, y - .5 * r, 1.4 * r, '#FFD9A8', .22);
  }

  // Vibration marks either side of the phone (u = phone unit), k 0..1 fades them.
  // The phone's screen while it is asleep (k 1 = dark), over ART.phone's lit screen.
  function sleepScreen(u, k) { if (k > .01) paint(rrPts(-1.9 * u, -3.85 * u, 3.8 * u, 7.5 * u, .38 * u), { wash: '#2C3150', washOp: 255 * k, ink: null }); }

  function buzzMarks(u, k) {
    if (k <= .02) return;
    for (const s of [-1, 1]) for (let j = 0; j < 2; j++) {
      const x = s * (2.75 + .55 * j) * u, h = (1.1 - .25 * j) * u * k;
      inkLine([[x, -h], [x + s * .25 * u, 0], [x, h]], 1.3, C.ink, 'inkfine', .5);
    }
  }

  // A large soft paper disc for the background layers.
  function disc(r, col = C.disc) { paint(ellPts(0, 0, r, r, 40, 3), { wash: col, ink: null }); }

  return { C, thought, figure, sleepScreen, buzzMarks, disc };
})();
