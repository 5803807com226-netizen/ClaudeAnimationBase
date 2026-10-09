// phase1_demo/story.js: Pip runs through a meadow that draws itself, spots a rock, jumps it, lands with an impact, is
// pleased; a firefly zips past, Pip slows to watch it and hops for joy. DATA for systems/stage.js: which world and
// character, the performance (motion, jumps, looks, reactions, mouth), the camera. Only the firefly is custom code.
(() => {
  const ROCK = 1090, ground = x => 760 + 34 * Math.sin(x * .0023 + .4) + 14 * Math.sin(x * .0061 + 1.3);
  const FLY = makePath([[2950, 360], [2620, 470], [2380, 560], [2170, 520], [2160, 430], [2260, 450]]);
  const fly = t => { if (t < 5.6) { const p = follow(t, FLY, 4.2, 5.6, easeOut); return [p.x, p.y]; } const p = FLY.at(1); return [p.x + 22 * wob(t, .7), p.y + 14 * wob(t, 1.1, .3)]; };

  // custom: the firefly, a glowing light leaving a trail of drifting sparks
  const firefly = (t) => {
    if (t < 4.15) return;
    emit(t, { id: 'fly', rate: 45, life: .9, from: 4.15, source: fly, gravity: 30, spawn: (k, r) => ({ vx: (r(1) - .5) * 40, vy: (r(2) - .5) * 40, size: 3 + 6 * r(3) }),
      draw: p => paint(ellPts(p.x, p.y, p.size * (1 - p.k), p.size * (1 - p.k), 8), { wash: '#FFE39A', washOp: 240 * (1 - p.k), ink: null }) });
    trail(t, fly, { len: .35, n: 14, w0: 18, w1: 1, color: '#FFD27A', op: 170, id: 'flyTrail' });
    for (const lag of [.16, .08]) { const [gx, gy] = fly(t - lag); glow(gx, gy, 70 - lag * 200, '#FFC86A', .55); }   // light lingering along the path
    const [fx, fy] = fly(t); glow(fx, fy, 150, '#FFC86A', 1);
    boilSeed('fly'); paint(ellPts(fx, fy, 13, 11, 12), { wash: '#FFF2C4', ink: PAL.ink, sw: .9 });
    paint(ellPts(fx - 6, fy - 10, 9, 5, 8, 0, -.5), { wash: '#FFFFFF', washOp: 170, ink: PAL.ink, sw: .5 }); paint(ellPts(fx + 6, fy - 10, 9, 5, 8, 0, .5), { wash: '#FFFFFF', washOp: 170, ink: PAL.ink, sw: .5 });
  };

  playStage({
    background: '#F4ECDF', duration: 6.6,
    world: { theme: 'meadow', ground, opts: { rocks: [ROCK] }, intro: 1.3, ahead: 360 },
    actors: [{
      character: 'pip', u: 80,
      motion: { stride: 70,
        keys: [[0, -60, 260], [1.6, 520, 500], [2.42, 920, 560], [3.06, 1270, 540], [3.6, 1540, 470], [5.1, 2200, 0], [6.6, 2200, 0]],
        jumps: [{ t0: 2.42, t1: 3.06, h: 210 }, { t0: 5.62, t1: 5.98, h: 60, crouch: .12, amt: .7 }] },
      look: [[0, 'ahead'], [1.78, [ROCK, ground(ROCK) - 30]], [3.1, 'ahead'], [4.3, fly]],
      reactions: [[1.8, 'take', .6], [3.2, 'joy', .7], [4.35, 'take', .45], [5.4, 'joy', 1]],
      mouth: [[0, 'smile'], [1.8, 'o'], [2.42, 'open'], [3.12, 'smile'], [4.35, 'o'], [4.95, 'smile'], [5.4, 'open'], [6.15, 'smile']],
      blinks: [.9, 4.0],
      fx: { shadow: { color: '#6E8A55', op: 150 }, dust: { color: '#FFF8EC', life: .65 }, trail: { color: '#F2A93B', op: 120 } },
    }],
    camera: { lag: .5, lead: .3, y: [[0, 470], [4.6, 470], [6.6, 540]], zoom: [[0, 1], [4.6, 1], [6.6, 1.14]] },
    extras: { front: [firefly] },
  });
})();
