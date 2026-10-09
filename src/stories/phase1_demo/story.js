// phase1_demo/story.js: Pip runs through a meadow that draws itself ahead of it, spots a rock, jumps it, lands with an
// impact, is pleased; a firefly zips past, Pip slows to watch it, and hops for joy. Composition and data only: the
// motion, acting, world and FX come from src/systems, the look from pip.js and meadow.js.
(() => {
  const U = 78, ROCK = 1090;
  const ground = x => 760 + 34 * Math.sin(x * .0023 + .4) + 14 * Math.sin(x * .0061 + 1.3);
  const MOVE = {
    keys: [[0, -60, 260], [1.6, 520, 500], [2.42, 920, 560], [3.06, 1270, 540], [3.6, 1540, 470], [5.1, 2200, 0], [6.6, 2200, 0]],
    jumps: [{ t0: 2.42, t1: 3.06, h: 210 }, { t0: 5.62, t1: 5.98, h: 60, crouch: .12, amt: .7 }],
  };
  const STEPS = footfalls(MOVE.keys, 70, 0, 5.2, MOVE.jumps);
  const S = t => {
    const tr = travel(t, MOVE.keys), hp = hops(t, MOVE.jumps), gy = ground(tr.x);
    return { x: tr.x, v: tr.v, a: (travel(t + 1 / 48, MOVE.keys).v - travel(t - 1 / 48, MOVE.keys).v) * 24, y: gy + hp.dy, gy, hp };
  };
  const world = makeWorld({ ground, reveal: t => S(t).x + 330, layers: meadowLayers({ ground, rocks: [ROCK] }) });
  const PIP = makePip();

  // the firefly: in from the right along a curve, past Pip, then hovering by its head
  const FLY = makePath([[2950, 360], [2620, 470], [2380, 560], [2170, 520], [2160, 430], [2260, 450]]);
  const fly = t => { if (t < 5.6) { const p = follow(t, FLY, 4.2, 5.6, easeOut); return [p.x, p.y]; } const p = FLY.at(1); return [p.x + 22 * wob(t, .7), p.y + 14 * wob(t, 1.1, .3)]; };

  // where Pip looks: ahead, the rock, ahead, the firefly
  const head = t => { const s = S(t); return [s.x + 10, s.y - (PIP_FEET + .2) * U]; };
  const LOOK = [[0, t => [S(t).x + 400, S(t).gy - 60]], [1.78, [ROCK, ground(ROCK) - 30]], [3.1, t => [S(t).x + 400, S(t).gy - 60]], [4.3, fly]];
  const MOUTH = [[0, { mouth: 'smile' }], [1.8, { mouth: 'o' }], [2.42, { mouth: 'open' }], [3.12, { mouth: 'smile' }], [4.35, { mouth: 'o' }], [4.95, { mouth: 'smile' }], [5.4, { mouth: 'open' }], [6.15, { mouth: 'smile' }]];
  const acting = t => merge(react(t, 1.8, 'take', .6), react(t, 3.2, 'joy', .7), react(t, 4.35, 'take', .45), react(t, 5.4, 'joy', 1));

  function pose(t) {
    const s = S(t), g = gait(s.x, 70, { swing: .6 }), R = acting(t), air = s.hp.air, moving = Math.abs(s.v) > 40 && !air;
    const [hx, hy] = head(t), [tx, ty] = saccade(t, LOOK), look = lookAt(hx, hy, tx, ty, 260, 200);
    const tuck = air ? .6 * (1 - Math.abs(1 - 2 * s.hp.k)) + .25 : 0, up = (air ? .9 : 0) + (R.arms || 0);
    return {
      legL: { rot: moving ? g.legL : tuck }, legR: { rot: moving ? g.legR : -tuck },
      armL: { rot: up + (moving ? g.arms * .5 : 0) }, armR: { rot: -up + (moving ? g.arms * .5 : 0) },
      face: { look, blink: Math.max(blinkAt(t, [.9, 4.0]), R.blink || 0), wide: (R.eyes || 0) + (air ? .35 : 0), happy: R.happy || 0, brow: R.brow || 0,
        ...track(t, MOUTH), open: air ? .4 + .5 * (1 - Math.abs(1 - 2 * s.hp.k)) : 0 },
    };
  }

  function shot(t) {
    const s = S(t), R = acting(t), [cx] = followCam(t, tt => [S(tt).x, 0], { lag: .5, lead: .3 }), land = t - MOVE.jumps[0].t1;
    const [sx, sy] = land > 0 && land < .5 ? shakeXY(t, 7 * Math.exp(-9 * land)) : [0, 0];
    background('#F4ECDF');
    boilSeed('sun'); glow(1520, 210, 150, '#FFC27A', .5); paint(ellPts(1520, 210, 58, 58, 24), { wash: '#F6C46A', ink: PAL.ink, sw: 1 });
    camBegin(cx + 120 + sx, kf(t, [[0, 560], [4.6, 560], [6.6, 610]]) + sy, kf(t, [[0, 1], [4.6, 1], [6.6, 1.12]]));
    drawLayers(world, t, L => L.depth <= 1);

    // contact shadow, dust, impact: the ground reacting to Pip
    boilSeed('shadow'); const lift = s.gy - s.y;
    paint(ellPts(s.x, s.gy + 4, U * (.95 - .45 * clamp(lift / 220)), U * .16, 16), { wash: '#6E8A55', washOp: 150 * (1 - .5 * clamp(lift / 220)), ink: null });
    const ev = STEPS.map(ft => ({ t: ft, x: S(ft).x - 14, y: S(ft).gy, n: 2, size: 10, dir: 1 }));
    MOVE.jumps.forEach((j, i) => { ev.push({ t: j.t0, x: S(j.t0).x, y: S(j.t0).gy, n: 3, size: 12 }); ev.push({ t: j.t1, x: S(j.t1).x, y: S(j.t1).gy, n: i ? 4 : 8, size: i ? 12 : 20, spread: 1.6 }); });
    puffs(t, ev, { color: '#FFF8EC', life: .65 });
    impactLines(t, MOVE.jumps[0].t1, S(MOVE.jumps[0].t1).x, S(MOVE.jumps[0].t1).gy - 6, { r0: U * .95, reach: 34, len: 22 });

    // speed and the jump's trail, then Pip
    const body = tt => { const q = S(tt); return [q.x - 6, q.y - PIP_FEET * U]; };
    if (s.hp.air || s.hp.phase === 'land') trail(t, body, { len: .22, n: 12, w0: U * 1.1, w1: 2, color: '#F4B85A', op: 95, id: 'jumpTrail' });
    speedLines(t, s.x - U * .6, s.y - PIP_FEET * U, s.v, { from: 420, full: 560, spread: U * 1.6, len: 150, color: '#8C8079' });
    const sq = s.hp.sq + (R.sq || 0), bob = Math.abs(s.v) > 40 && !s.hp.air ? gait(s.x, 70).bob : 0;
    push(); translate(s.x, s.y); rotate(lean(s.v, s.a) + (R.rot || 0)); scale(1 + .8 * sq, 1 - sq);
    drawCharacter(PIP, 0, (-PIP_FEET + bob + (R.dy || 0)) * U, U, pose, t);
    pop();

    // the firefly: a glowing trail of drifting sparks
    if (t > 4.15) {
      const [fx, fy] = fly(t);
      emit(t, { id: 'fly', rate: 40, life: .8, from: 4.15, source: fly, gravity: 30, spawn: (k, r) => ({ vx: (r(1) - .5) * 30, vy: (r(2) - .5) * 30, size: 3 + 5 * r(3) }),
        draw: p => paint(ellPts(p.x, p.y, p.size * (1 - p.k), p.size * (1 - p.k), 8), { wash: '#FFE9A8', washOp: 230 * (1 - p.k), ink: null }) });
      trail(t, fly, { len: .3, n: 12, w0: 14, w1: 1, color: '#FFD98A', op: 150, id: 'flyTrail' });
      glow(fx, fy, 120, '#FFC86A', 1); boilSeed('fly'); paint(ellPts(fx, fy, 12, 10, 12), { wash: '#FFF2C4', ink: PAL.ink, sw: .8 });
    }
    drawLayers(world, t, L => L.depth > 1);
    camEnd();
    if (t < .4) flash(1 - t / .4, '#F4ECDF');
    if (t > 6.2) flash((t - 6.2) / .4, '#F4ECDF');
  }
  shots([[0, (t) => shot(t)]]);
})();
