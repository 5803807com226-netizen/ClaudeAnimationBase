// phase2_lumo/story.js: Lumo, a paper lantern, trudges through a night forest as snow falls, spots a fallen log, heaves
// itself over it and lands heavily in the snow, relieved; a shooting star streaks over the trees, Lumo stops to watch,
// and glows brighter for joy. DATA for systems/stage.js: same systems as phase1_demo, different character and world.
// A heavier character is only different numbers: slower travel, a longer crouch, a lower jump, a bigger landing.
(() => {
  const LOG = 705, ground = x => 760 + 22 * Math.sin(x * .002 + 1.1) + 10 * Math.sin(x * .0055);
  let stage = null;   // set below; the star is in the sky (screen space), so looking at it needs the camera
  const STAR = makePath([[.92, .075], [.78, .16], [.625, .26], [.54, .305]].map(([x, y]) => [x * W, y * H]));   // in frame fractions: any aspect
  const starScreen = t => { const p = follow(t, STAR, 4.2, 4.95, easeIn); return [p.x, p.y]; };
  const starWorld = t => { if (!stage) return [0, 0]; const c = stage.camAt(t), [sx, sy] = starScreen(t); return [c.cx + (sx - W / 2) / c.zoom, c.cy + (sy - H / 2) / c.zoom]; };

  // custom: the shooting star, in the sky behind the world
  const shootingStar = (t) => {
    if (t < 4.2 || t > 5.8) return;
    const fade = 1 - seg(t, 4.95, 5.8), [x, y] = starScreen(Math.min(t, 4.95));
    if (t < 4.95) {
      trail(t, starScreen, { len: .55, n: 18, w0: 12, w1: 1, color: '#FFF3C4', op: 230, id: 'starTrail' });
      for (const lag of [.18, .1]) { const [gx, gy] = starScreen(t - lag); glow(gx, gy, 60 - lag * 150, '#FFE7A8', .5); }   // light along the streak
      emit(t, { id: 'starDust', rate: 60, life: .7, from: 4.2, to: 4.95, source: starScreen, gravity: 60, spawn: (k, r) => ({ vx: (r(1) - .5) * 40, vy: (r(2) - .2) * 30, size: 2 + 3 * r(3) }),
        draw: p => paint(starPts(p.x, p.y, p.size * (1 - p.k) + .5, .4, 4), { wash: '#FFF6D8', washOp: 255 * (1 - p.k), ink: null }) });
    }
    glow(x, y, 90 * (t < 4.95 ? 1 : fade), '#FFE7A8', fade);
    boilSeed('star'); paint(starPts(x, y, 13 * (t < 4.95 ? 1 : fade + .2), .42, 4, t * 2), { wash: '#FFF8E2', ink: null });
  };

  stage = playStage({
    background: '#141C3F', duration: 7, fade: { color: '#0E1430' },
    world: { theme: 'snowforest', ground, opts: { logs: [LOG] }, reveal: false },   // the whole forest from the first frame
    actors: [{
      character: 'lumo', u: 82,
      motion: { stride: 60,
        keys: [[0, -80, 190], [1.5, 250, 300], [2.55, 600, 340], [3.15, 810, 330], [4.2, 1150, 240], [5.2, 1330, 0], [7, 1330, 0]],
        jumps: [{ t0: 2.55, t1: 3.15, h: 150, crouch: .22, amt: 1.15 }, { t0: 5.85, t1: 6.2, h: 50, crouch: .14, amt: .8 }] },
      // eyes first, then the body: look → blink → notice → (crouch) → act; after the landing a glance back at the log
      look: [[0, 'ahead'], [1.82, [LOG, ground(LOG) - 30]], [3.3, [LOG, ground(LOG) - 40]], [3.85, 'ahead'], [4.26, starWorld]],
      reactions: [[1.9, 'notice', .9], [3.2, 'relief', 1], [3.55, 'shake', 1], [4.34, 'notice', 1], [4.6, 'take', .45], [5.45, 'joy', 1]],
      mouth: [[0, 'smile'], [1.9, 'o'], [2.55, 'open'], [3.2, 'smile'], [4.36, 'o'], [5.0, 'smile'], [5.45, 'open'], [6.3, 'smile']],
      blinks: [.8, 1.8, 3.84, 4.24, 6.6],
      channels: [[0, { glow: 1 }], [5.45, { glow: 1 }], [5.8, { glow: 1.9 }], [6.6, { glow: 1.4 }]],
      gait: { swing: .45, bob: .08, arms: .3, squash: .05 }, lean: { k: .00016, ka: .00012 }, idle: { breath: .035, sway: .02 },
      fx: { shadow: { color: '#8C9CC6', op: 160 }, dust: { color: '#FFFFFF', life: .8 }, impact: { color: '#5B6EA6' }, trail: { color: '#FFC066', glow: true }, speed: false, light: { color: '#FFB65C', r: 2.4, a: .5 } },
    }],
    // closer, so the face reads: face in the upper third; wider for the jump and for the star; push in on the joy
    camera: { lag: .55, lead: .3, shakeOnLand: 9,
      zoom: [[0, 1.18], [1.7, 1.18], [2.0, 1.28], [2.45, 1.15], [3.4, 1.15], [3.9, 1.22], [4.25, 1.08], [5.0, 1.08], [5.6, 1.38], [7, 1.42]],
      y: [[0, 680], [1.7, 680], [2.0, 672], [2.45, 682], [3.4, 682], [3.9, 676], [4.25, 600], [5.0, 600], [5.6, 668], [7, 666]] },
    screen: [shootingStar],
  });
})();
