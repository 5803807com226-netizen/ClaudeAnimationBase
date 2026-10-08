// story.js: "ข้อความเดียว ทำไมทำให้เราหงุดหงิดทั้งวัน?" (one message), a 15 s vertical story built from the motion presets.
// See STORYBOARD.md. What a future story swaps is at the top: NARRATION (timing reference, never drawn), CUE (story
// beats in video seconds: retime these to the real narration), the palette, and the shot list below, whose layers are
// ['presetId', options] or small functions that compute positions and hand them to presets. The drawings are in art.js.
const STORY = (() => {
  const NARRATION = [
    { at: 0, end: 3, text: 'ข้อความเดียว ทำเราหงุดหงิดทั้งวัน' },
    { at: 3, end: 6, text: 'ทั้งที่เขาส่งมาแค่ครั้งเดียว' },
    { at: 6, end: 9, text: 'แต่เราอ่านมันซ้ำในหัวเป็นสิบรอบ' },
    { at: 9, end: 12, text: 'ข้อความนั้นจบไปแล้ว' },
    { at: 12, end: 15, text: 'แต่ความคิดของเรายังไม่จบ' },
  ];
  const CUE = {
    phone: .35, notify: 1.25, push: 1.55,          // 1: the phone pops in, one notification lands, the camera pushes in
    lift: 3.0,                                      // 2: the message lifts off, the phone sinks, the camera pulls far back
    cut: 6.0, orbit: 6.9, copies: 7.5,              // 3: match cut; the message circles the head and multiplies
    dissolve: 9.0, mind: 9.3,                       // 4: the bubbles melt into blobs; the room becomes the mind
    pull: 11.6, spiral: 11.8, end: 14.15,           // 5: the blobs are drawn into a spiral that keeps turning; wipe out
  };
  const P = {
    paper: '#F3EBDC', lav: '#E4D9EA', mind: '#262B5C', coral: ART.C.coral, coralLt: '#F4B49A', cream: ART.C.cream,
    blobs: ['#B49AD6', '#86C7C0', '#E99AAE', '#F2C27A', '#A9B8EC', '#CFA3D9', '#9FD3B4'],
    pools: [[230, 930, 300, '#5E4F9E'], [870, 1180, 360, '#3C7A90'], [260, 1640, 330, '#7A4E90'], [830, 700, 250, '#4C66AA']],   // x, y, r, colour
  };

  // ---------- shot A (0–6 s): the phone and the message ----------
  const A = {
    at: 0, bg: P.paper,
    camera: { keys: [[0, [540, 960, 1]], [CUE.push, [540, 960, 1]], [CUE.push + .9, [540, 790, 1.9]], [CUE.lift, [540, 790, 1.85]],
                     [CUE.lift + 1.8, [540, 620, .7]], [CUE.cut, [540, 600, .66]]], drift: 5 },
    layers: [
      (lt) => {   // the phone pops in, buzzes when the notification lands, and sinks away once the message has left it
        const sink = easeIn(seg(lt, CUE.lift + .3, CUE.lift + 1.6)), buzz = .05 * spring(lt, CUE.notify, 5, 55);
        push(); translate(540, 1000 + 1500 * sink); rotate(buzz + .3 * sink); translate(-540, -1000);
        preset('popBounce', lt, { x: 540, y: 1000, size: 100, at: CUE.phone, dur: .6, hops: 0, wobble: .08, draw: u => ART.phone(u), id: 'phone' });
        if (lt < CUE.lift) preset('objectReveal', lt, { x: 540, y: 760, size: 70, from: 'center', at: CUE.notify, dur: .5, glow: null, wobble: .2, draw: r => ART.bubble(r), id: 'note' });
        pop();
      },
      ['particleBurst', { x: 540, y: 760, at: CUE.notify + .05, dur: .7, count: 10, pSize: 11, size: 170, shape: 'circle', colors: [P.coral, P.coralLt, P.cream], gravity: 0, glow: null, spin: 0, id: 'ping' }],
      (lt) => {   // the message lifts off the screen and floats, bobbing, in empty space (bob is 0 at the lift and the cut)
        if (lt >= CUE.lift) preset('objectReveal', lt, { x: 540, y: 560 + 10 * wob(lt, .5), size: 70, from: 'below', dist: 200, arc: 0, ease: 'ease', at: CUE.lift, dur: 1.1, glow: null, wobble: .12, draw: r => ART.bubble(r), id: 'msg' });
      },
    ],
    after: [['brushWipe', { part: 'reveal', at: 0, dur: .7, colors: [P.coral, P.coralLt] }]],
  };

  // ---------- shot B (6–15 s): the head, the orbit, the mind, the spiral ----------
  const b = t => t - CUE.cut;                                     // video time → time in shot B
  const START = [540, 934];                                       // where the message is on screen at the cut (matches A's last frame)
  const O = { x: 520, y: 1290, rx: 400, ry: 130, tilt: -.12 }, SC = [560, 1020], N = 7;   // the orbit around the head; the spiral's centre
  const s3 = b(CUE.dissolve), v3 = .7 + .5 * s3;                  // the orbit speeds up until the dissolve, then eases off
  const ang = lt => lt < s3 ? .7 * lt + .25 * lt * lt : .7 * s3 + .25 * s3 * s3 + .6 * (lt - s3) + (v3 - .6) / .8 * (1 - Math.exp(-.8 * (lt - s3)));
  const spawn = i => i ? b(CUE.copies) + .2 * (i - 1) : -1, morphAt = i => b(CUE.dissolve) + .1 * i, pullAt = i => b(CUE.pull) + .09 * i;
  const sizeOf = i => i ? 34 + 26 * hash(i + 3) : 46;
  const mindK = lt => ease(seg(lt, b(CUE.mind) - .3, b(CUE.mind) + 1.2));
  function slot(i, lt) {
    const a = ang(lt) + i * TAU / N + .35 * hash(i + 9), rs = i ? .75 + .45 * hash(i + 2) : 1, ex = Math.cos(a) * O.rx * rs, ey = Math.sin(a) * O.ry * rs;
    return { x: O.x + ex * Math.cos(O.tilt) - ey * Math.sin(O.tilt), y: O.y + ex * Math.sin(O.tilt) + ey * Math.cos(O.tilt), depth: Math.sin(a) };
  }
  function bubbleAt(i, lt) {   // the message (i = 0) settles into the orbit; each copy springs out of it into its own lane
    const k0 = ease(seg(lt, b(CUE.orbit) - .5, b(CUE.orbit) + .3)), o = slot(0, lt), s = slot(i, lt);
    const ox = lerp(START[0], o.x, k0), oy = lerp(START[1], o.y, k0), k = i ? easeOut(seg(lt, spawn(i), spawn(i) + .7)) : k0;
    const x = i ? lerp(ox, s.x, k) : ox, y = i ? lerp(oy, s.y, k) : oy, p = easeIn(seg(lt, pullAt(i), pullAt(i) + 1));
    return { x: lerp(x, SC[0], p), y: lerp(y, SC[1], p), size: sizeOf(i) * (1 + .2 * s.depth * k) * (1 - p), depth: s.depth * k };
  }
  function drawBubble(i, lt) {
    const st = bubbleAt(i, lt), m = morphAt(i);
    if (lt < spawn(i) || st.size < 1) return;
    if (lt < m) preset('popBounce', lt, { x: st.x, y: st.y, size: st.size, at: spawn(i), dur: .45, hops: 0, wobble: .12, draw: r => ART.bubble(r, { lines: 1 - seg(lt, m - .3, m) }), id: 'bub' + i });
    else preset('shapeMorph', lt, { x: st.x, y: st.y, size: st.size, shapes: ['bubble', 'blob'], colors: [P.coral, P.blobs[i]], at: m, dur: .9, hold: 0, spin: .6 * (hash(i + 5) - .5), id: 'bub' + i });
  }
  const bubbles = front => (lt) => { for (let i = 0; i < N; i++) if ((bubbleAt(i, lt).depth > 0) === front) drawBubble(i, lt); };

  const B = {
    at: CUE.cut,
    bg: lt => mixCol(mixCol(P.paper, P.lav, ease(seg(lt, .5, 3))), P.mind, mindK(lt)),
    camera: { keys: [[0, [540, 960, 1, 0]], [1.5, [540, 1080, .92, 0]], [b(CUE.pull), [540, 1060, .95, 0]], [9, [560, 1030, 1.25, -.14]]], drift: 5 },
    layers: [
      (lt) => P.pools.forEach(([x, y, r, col], i) =>   // the mind: pools of colour bloom behind everything
        preset('objectReveal', lt, { x: x + 18 * wob(lt, .06, i * .3), y, size: r, from: 'center', at: b(CUE.mind) + .22 * i, dur: 1.1, ease: 'easeOut', glow: null, wobble: 0, draw: s => ART.mindBlob(s, col), id: 'pool' + i })),
      bubbles(false),
      (lt) => {   // the person rises into frame under the message; the brow knits as the copies pile up; colours sink into the mind
        const k2 = mindK(lt), blink = [4.6, 7.2].some(c => Math.abs(lt - c) < .06);
        ART.head(500, 1560 + 760 * (1 - easeOut(seg(lt, 0, 1.5))), 270, { tension: ease(seg(lt, b(CUE.copies), b(CUE.copies) + 1.2)), blink: blink ? 1 : 0,
          skin: mixCol(ART.C.skin, '#C99AB0', .5 * k2), hair: mixCol(ART.C.hair, '#1C2150', .6 * k2) });
      },
      bubbles(true),
      (lt) => { for (let i = 0; i < N; i++) {   // each bubble breaks into a puff of dust as it melts
        const st = bubbleAt(i, morphAt(i));
        preset('particleBurst', lt, { x: st.x, y: st.y, at: morphAt(i), dur: 1.1, count: 7, pSize: 9, size: 120, shape: 'circle', colors: [P.coralLt, P.cream, P.blobs[i]], gravity: -70, glow: null, spin: 0, seed: i, id: 'dust' + i });
      } },
      (lt) => {   // the thought spiral: draws itself out, then never stops turning; sparks ride outward along it
        const s0 = b(CUE.spiral); if (lt < s0) return;
        const grow = seg(lt, s0, s0 + .8), o = { a: 10, b: 15, rot: -1.15 * (lt - s0), sw: 2.6, col: P.coralLt,
          theta: TAU * 3.2 * easeOut(seg(lt, s0, s0 + 1.6)) + .9 * Math.max(0, lt - s0 - 1.6) };
        glow(SC[0], SC[1], 330 * grow, P.coral, .5 * grow);
        ART.spiral(SC[0], SC[1], o);
        for (let i = 0; i < 7; i++) {
          const u = frac(.16 * lt + i / 7), r = (5 + 9 * u) * Math.min(1, u * 8, (1 - u) * 6), [x, y] = ART.spiralPt(SC[0], SC[1], u * o.theta, o);
          if (r > .5) { boilSeed('spark' + i); paint(ellPts(x, y, r, r, 12), { wash: P.cream, ink: null }); }
        }
      },
    ],
    after: [['brushWipe', { part: 'cover', at: b(CUE.end), dur: .75, colors: [PAL.night, PAL.violet] }]],
  };

  return { id: 'one_message', title: 'ข้อความเดียว ทำไมทำให้เราหงุดหงิดทั้งวัน?', narration: NARRATION, cue: CUE, shots: [A, B] };
})();
playStory(STORY);
