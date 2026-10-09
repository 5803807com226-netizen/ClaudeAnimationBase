// story.js (story_pilot_v4): "ข้อความเดียว", the V4.1 storytelling pilot. ONE continuous shot: one camera, one motif
// (the coral message: speech bubble → thought → many thoughts → one calm circle), one colour story (coral → gold).
// See STORYBOARD.md. Edit the DATA blocks at the top; the layers below only read them.
//   NARRATION  script + provisional timing (retime to a real narration file)   CUE  story beats (video seconds)
//   PAL        palette            CAMERA  choreography keys [t, x, y, zoom, ease into this key]
//   TYPE       selective kinetic text (live text, Thai shaped)                   ORBIT  the repeating thoughts
(() => {
  // ---------- DATA ----------
  const NARRATION = [
    { at: .2, end: 2.8, text: 'ข้อความเดียวจากเขา ทำเราหงุดหงิดได้ทั้งวัน' },
    { at: 3.1, end: 5.6, text: 'ทั้งที่เขาพิมพ์มาแค่ครั้งเดียว' },
    { at: 6.1, end: 9.6, text: 'แต่เราอ่านข้อความนั้นซ้ำในหัวไม่รู้กี่รอบ' },
    { at: 10.4, end: 13.2, text: 'ตกลงเขาทำให้เราทุกข์ หรือใจเราเองกันแน่?' },
  ];
  const CUE = {
    wake: .35, buzz: .55, rise: .9,                 // 1: the screen wakes, the phone buzzes, the message rises out of it
    cut: 3.4,                                       // 2: match cut inside the coral: the bubble is now a thought
    enter: 6.3, orbit: 7.0, copies: 7.0, every: .4, // 3: the thought enters an orbit round the head; copies, one every 0.4 s
    converge: 10.0, morph: 10.55, settle: 11.4,     // 4: the orbit spirals in, everything becomes one circle; then the hold
  };
  const PAL = { paper: '#F3EBDC', dusk: '#ECE3E6', calm: '#F4EBDA', coral: ART.C.coral, gold: '#EDBE6E', shadow: '#D9CBB5' };
  const CAMERA = [   // [t, x, y, zoom, ease into this key]; zoom is interpolated in log space (a dive feels like a dive)
    [0, 540, 1040, 1, 'ease'], [1.9, 540, 1010, 1.04, 'ease'],
    [2.6, 540, 800, 1.75, 'ease'], [2.95, 540, 785, 1.82, 'ease'],                 // push to the message, hold the read
    [3.4, 540, 765, 22, 'easeIn'],                                                // dive into the coral
    [4.7, 540, 800, 1.5, 'easeOut'], [6.0, 540, 880, 1.2, 'ease'],              // out of the coral: the thought, alone
    [7.0, 540, 1080, .9, 'ease'], [9.8, 540, 1090, 1.04, 'ease'],                 // reveal the figure, then slow pressure
    [11.8, 540, 1040, .95, 'ease'], [15, 540, 1040, .96, 'ease'],                 // release into the calm frame; hold
  ];
  const PHONE = [540, 1180, 62], BUBBLE = [540, 765, 80];          // world positions: phone [x, y, unit], bubble [x, y, r]
  const ORBIT = { cx: 540, cy: 1100, rx: 330, ry: 100, w0: 1.5, acc: .45, n: 6, copy: .74 };   // around the head
  const HEAD = [540, 1185, 96], CALM = [540, 905, 86];           // the figure's head [x, y, r]; the final circle [x, y, r]
  const TYPE = [
    { text: 'ข้อความเดียวจากเขา', preset: 'pop', at: .35, stagger: .06, y: .14, maxLines: 1, out: { at: 2.7, kind: 'up' },
      style: { font: 'display', weight: 800, size: 100, color: PAL_INK() } },
    { text: 'ทำเราหงุดหงิดได้ทั้งวัน', preset: 'highlight', at: 1.25, y: .205, maxLines: 1, out: { at: 2.75, kind: 'up' },
      style: { font: 'display', weight: 600, size: 82, color: PAL_INK(), highlight: '#F4B49A' } },
    { text: 'แค่ครั้งเดียว', preset: 'pop', at: 4.55, stagger: .08, y: .7, maxLines: 1, out: { at: 5.85 },
      style: { font: 'display', weight: 800, size: 128, color: ART.C.coral, stroke: { color: '#F3EBDC', width: 8 } } },
    { text: 'ซ้ำในหัว', preset: 'reveal', at: 7.4, cursor: ART.C.coral, y: .135, maxLines: 1, out: { at: 9.85 },
      style: { font: 'display', weight: 700, size: 92, color: PAL_INK() } },
    { text: 'ไม่รู้กี่รอบ', preset: 'pop', at: 8.55, stagger: .07, y: .205, maxLines: 1, out: { at: 9.85 },
      style: { font: 'display', weight: 800, size: 110, color: ART.C.coral } },
    { text: 'ตกลงเขาทำให้เราทุกข์', preset: 'reveal', at: 11.5, cursor: '#B58A3E', y: .135, maxLines: 1,
      style: { font: 'display', weight: 700, size: 84, color: PAL_INK() } },
    { text: 'หรือใจเราเองกันแน่?', preset: 'slide', from: 'below', bar: '#EDBE6E', at: 12.6, y: .21, maxLines: 1,
      style: { font: 'display', weight: 800, size: 100, color: PAL_INK() } },
  ];
  function PAL_INK() { return '#2B2233'; }

  // ---------- derived motion (pure functions of t) ----------
  const EZ = { ease, easeIn, easeOut, linear: clamp };
  const camAt = t => {
    let i = 1; while (i < CAMERA.length - 1 && t > CAMERA[i][0]) i++;
    const [t0, x0, y0, z0] = CAMERA[i - 1], [t1, x1, y1, z1, e] = CAMERA[i], k = EZ[e](seg(t, t0, t1));
    return [lerp(x0, x1, k), lerp(y0, y1, k), Math.exp(lerp(Math.log(z0), Math.log(z1), k))];
  };
  // the orbit angle: starts at the right of the ellipse (screen direction: the thought arrives moving right and down)
  const theta = t => { const d = Math.max(0, t - CUE.orbit); return ORBIT.w0 * d + .5 * ORBIT.acc * d * d; };
  const inward = t => ease(seg(t, CUE.converge, CUE.settle - .2));              // 0 → 1 as the orbit collapses
  const centre = t => [lerp(ORBIT.cx, CALM[0], inward(t)), lerp(ORBIT.cy, CALM[1], inward(t))];
  const orbitPt = (t, ph) => { const [cx, cy] = centre(t), a = theta(t) + ph, s = 1 - inward(t);
    return { x: cx + Math.cos(a) * ORBIT.rx * s, y: cy + Math.sin(a) * ORBIT.ry * s, depth: Math.sin(a) }; };
  // the main thought's path from where it floated (the bubble's place) into the orbit's entry point
  const entry = makePath([[BUBBLE[0], BUBBLE[1]], [BUBBLE[0] + 150, BUBBLE[1] + 140], [ORBIT.cx + ORBIT.rx, ORBIT.cy]]);
  const bob = t => 7 * Math.sin((t - CUE.cut) * 2.2) * seg(t, CUE.cut, CUE.cut + .6);
  const mainAt = t => {
    if (t < CUE.enter) return { x: BUBBLE[0], y: BUBBLE[1] + bob(t), depth: 1, trail: true };
    if (t < CUE.orbit) { const { x, y } = follow(t, entry, CUE.enter, CUE.orbit, ease); return { x, y, depth: 1 - ease(seg(t, CUE.enter, CUE.orbit)), trail: 1 - easeIn(seg(t, CUE.enter, CUE.enter + .4)) }; }
    return orbitPt(t, 0);
  };
  const copyAt = (t, k) => {   // copy k emerges from the main thought and slides back to its slot, 1/n of a turn apart
    const s = CUE.copies + k * CUE.every, ph = -(k + 1) * TAU / ORBIT.n * easeOut(seg(t, s, s + .7));
    return { ...orbitPt(t, ph), grow: backOut(seg(t, s, s + .4)) * (1 - easeIn(seg(t, CUE.converge + .1, CUE.morph + .5))) };
  };
  const bg = t => mixCol(mixCol(PAL.paper, PAL.dusk, seg(t, 6, 8)), PAL.calm, seg(t, 10, 11.6));
  const depthCol = d => mixCol(PAL.coral, '#F2C9BC', .45 * (1 - d) / 2);              // behind the head: paler

  // ---------- drawing ----------
  const thoughtAt = (p, r, t, id, lines = 1) => { boilSeed(id); push(); translate(p.x, p.y); scale(1 + .1 * p.depth);
    PILOT_ART.thought(r, { color: depthCol(p.depth), lines, trail: p.trail }); pop(); };
  const backdrop = (t) => {   // soft paper discs at two parallax depths: depth without props
    for (const [d, x, y, r] of [[.45, 180, 520, 260], [.45, 930, 1480, 300], [.7, 960, 640, 170], [.7, 120, 1350, 210]]) {
      parallax(d, () => { boilSeed('disc' + x); push(); translate(x, y); PILOT_ART.disc(r, mixCol('#EADFD0', bg(t), .35)); pop(); });
    }
  };
  const scene1 = (t) => {   // the phone and the message (until the match cut)
    const [px, py, u] = PHONE, buzz = .045 * spring(t, CUE.buzz, 5, 60);
    boilSeed('phone-shadow'); paint(ellPts(px + 10, py + 4.6 * u, 2.6 * u, .5 * u, 20), { wash: PAL.shadow, ink: null });
    push(); translate(px, py); rotate(buzz);
    ART.phone(u);
    PILOT_ART.sleepScreen(u, 1 - seg(t, CUE.wake, CUE.wake + .25));
    const wake = seg(t, CUE.wake, CUE.wake + .25); if (wake > 0) glow(0, -.5 * u, 3.4 * u, '#FFF1D6', .45 * wake);
    PILOT_ART.buzzMarks(u, Math.min(seg(t, CUE.buzz, CUE.buzz + .1), 1 - seg(t, CUE.buzz + .45, CUE.buzz + .7)));
    pop();
    preset('objectReveal', t, { x: BUBBLE[0], y: BUBBLE[1], size: BUBBLE[2], from: 'below', dist: 230, arc: 40, at: CUE.rise, dur: .6, glow: null, wobble: .12,
      draw: r => ART.bubble(r), id: 'message' });
  };
  const scene2to4 = (t) => {   // the thought, its orbit and copies, the figure, and the final circle
    const m = mainAt(t), live = [];
    if (t >= CUE.copies) for (let k = 0; k < ORBIT.n - 1; k++) { const c = copyAt(t, k); if (c.grow > .01) live.push({ ...c, k }); }
    const draw = c => { push(); translate(c.x, c.y); scale(c.grow); translate(-c.x, -c.y); thoughtAt(c, BUBBLE[2] * ORBIT.copy, t, 'copy' + c.k); pop(); };
    const main = () => {
      if (t < CUE.morph) thoughtAt(m, BUBBLE[2] * lerp(1, .8, seg(t, CUE.enter, CUE.orbit)), t, 'thought', 1 - seg(t, CUE.converge, CUE.morph));
      else {   // the thought melts into one simple circle, coral → gold, and rests above the head
        preset('shapeMorph', t, { shapes: ['thought', 'circle'], colors: [PAL.coral, PAL.gold], x: m.x, y: m.y, size: lerp(BUBBLE[2] * .8, CALM[2], seg(t, CUE.morph, CUE.settle)),
          at: CUE.morph, dur: .8, hold: 99, id: 'calm' });
        const g = seg(t, CUE.settle - .3, CUE.settle + .6); if (g > 0) glow(m.x, m.y, CALM[2] * 3.2, '#FFE2A8', .35 * g * (1 + .08 * Math.sin(t * 1.7)));
      }
    };
    const behind = d => d < 0;   // depth sort: what is behind the head is drawn before the figure
    live.filter(c => behind(c.depth)).sort((a, b) => a.depth - b.depth).forEach(draw);
    if (t >= CUE.orbit && t < CUE.morph && behind(m.depth)) main();
    if (t >= 5.6) PILOT_ART.figure(HEAD[0], HEAD[1] + 30 * (1 - easeOut(seg(t, 5.6, 7))), HEAD[2]);
    live.filter(c => !behind(c.depth)).sort((a, b) => a.depth - b.depth).forEach(draw);
    if (!(t >= CUE.orbit && t < CUE.morph && behind(m.depth))) main();
  };

  const text = typeOverlay({ narration: NARRATION, items: TYPE });
  shots([[0, (t) => {
    background(bg(t));
    const [cx, cy, z] = camAt(t), drift = z < 3 ? 4 : 0;
    camBegin(cx + drift * wob(t, .13), cy + drift * wob(t, .1, .3), z);
    backdrop(t);
    if (t < CUE.cut) scene1(t); else scene2to4(t);
    camEnd();
    text.draw(t);
  }]]);
  window.PILOT = { NARRATION, CUE, CAMERA, camAt };   // for tests and retiming tools
})();
