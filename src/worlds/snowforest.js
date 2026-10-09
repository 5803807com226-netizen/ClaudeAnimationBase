// snowforest.js: a world THEME (art only): a snowy pine forest at night, with falling snow at two depths. Same shape as
// meadow.js, so the world system, camera, actors and FX treat it identically. Registered as WORLDS.snowforest.
//   opts: { ground: x => y, palette: {...}, logs: [x, ...] (story-placed obstacles) }
WORLDS.snowforest = (o) => {
  const P = { skyTop: '#141C3F', skyLow: '#3A4E86', moon: '#F3EFD8', star: '#FFF8E2', far: '#1F2B52', farSnow: '#9DB0D8', pineFar: '#22325C', pine: '#1D2B4E',
    pineSnow: '#DCE6F6', snow: '#E8EEF8', snowMid: '#CBD7EE', snowShade: '#A9B9DC', grass: '#7C6E66', log: '#6A4D3F', logEnd: '#C79A73', fg: '#16203D', flake: '#F4F8FF', ink: '#141A30', ...o.palette };
  const G = o.ground, rise = (g, y0, y) => lerp(y0, y, g);
  const pine = (x, y, h, g, col, snow) => {
    for (let k = 0; k < 4; k++) {
      const ty = y - h * (.2 + k * .2) * g, w = h * (.36 - k * .075) * g, tip = ty - h * .22 * g;
      paint([[x - w, ty + h * .16 * g], [x, tip], [x + w, ty + h * .16 * g]], { wash: col, ink: P.ink, sw: .7 });
      if (snow) paint([[x - w * .55, ty + h * .02 * g], [x, tip + 4], [x + w * .55, ty + h * .02 * g], [x, ty - h * .06 * g]], { wash: P.pineSnow, ink: null });   // snow on the tier
    }
  };
  const flakes = (x0, tile, r, t, n, size, speed, op) => {   // a pure function of t: each flake falls and sways on its own clock
    for (let k = 0; k < n; k++) {
      const y = ((r(100 + k) * 1400 + t * speed * (.7 + .6 * r(200 + k))) % 1400) - 200, x = x0 + r(300 + k) * tile + 30 * Math.sin(t * 1.3 + k);
      paint(ellPts(x, y, size * (.6 + .8 * r(400 + k)), size * (.6 + .8 * r(400 + k)), 8), { wash: P.flake, washOp: op, ink: null });
    }
  };
  const sky = (t) => {
    boilSeed('sky');
    for (let i = 0; i < 14; i++) paint(rectPts(-60, -60 + i * 64, W + 120, 120), { wash: mixCol(P.skyTop, P.skyLow, Math.pow(i / 13, 1.4)), ink: null });
    for (let i = 0; i < 46; i++) {   // stars, each twinkling on its own clock
      const x = hash(i) * W, y = hash(i + 50) * 520, tw = .5 + .5 * Math.sin(t * (2 + 2 * hash(i + 9)) + i);
      boilSeed('star' + i); paint(starPts(x, y, (2 + 3 * hash(i + 3)) * (.6 + .5 * tw), .4, 4), { wash: P.star, washOp: 120 + 120 * tw, ink: null });
    }
    glow(420, 190, 260, '#AFC3FF', .55); boilSeed('moon');
    paint(ellPts(420, 190, 62, 62, 28), { wash: P.moon, ink: P.ink, sw: 1 });
    paint(ellPts(400, 176, 16, 12, 10), { wash: '#DCD6BC', ink: null }); paint(ellPts(440, 206, 10, 8, 8), { wash: '#DCD6BC', ink: null });
  };
  const ridge = (base, a, s) => x => base + a * Math.sin(x * .0028 + s) + a * .4 * Math.sin(x * .0071 + s * 3);
  const treeLineFar = ridge(700, 18, .3), treeLineNear = ridge(735, 22, 1.7);

  return { sky, palette: P, layers: [
    { name: 'mountains', depth: .15, tile: 720, draw: ({ x0, x1, r, grow }) => {
      const g = grow(x1 + 160), base = 700; if (g <= .05) return;
      const pk = [[x0 - 60, base], [x0 + 140 + 120 * r(1), base - (230 + 130 * r(2)) * g], [x0 + 420, base - (140 + 90 * r(3)) * g], [x0 + 560 + 80 * r(4), base - (260 + 120 * r(5)) * g], [x1 + 60, base]];
      paint(pk.concat([[x1 + 60, base + 60], [x0 - 60, base + 60]]), { wash: P.far, ink: null });
      for (const i of [1, 3]) { const [px, py] = pk[i], [ax, ay] = pk[i - 1], [bx, by] = pk[i + 1], k = .28 * g;   // snow caps that follow the slopes
        paint([[lerp(px, ax, k), lerp(py, ay, k)], [px, py], [lerp(px, bx, k), lerp(py, by, k)], [lerp(px, bx, k * .5), lerp(py, by, k * .5) + 14], [px, py + 30 * g], [lerp(px, ax, k * .5), lerp(py, ay, k * .5) + 12]], { wash: P.farSnow, ink: null }); }
    } },
    { name: 'forestFar', depth: .35, tile: 600, draw: ({ x0, x1, r, front, grow }) => {
      const gs = groundShape(treeLineFar, x0, x1 + 2, 1300, 30, front); if (!gs) return;
      paint(gs.shape, { wash: P.pineFar, ink: null });
      for (let j = 0; j < 9; j++) { const x = x0 + (j + r(j)) / 9 * 600, g = clamp(grow(x + 40)); if (g > .05 && x < front) pine(x, treeLineFar(x) + 6, 70 + 50 * r(20 + j), g, P.pineFar, false); }
    } },
    { name: 'snowFar', depth: .45, tile: 700, draw: ({ x0, r, t }) => flakes(x0, 700, r, t, 16, 3, 60, 170) },
    { name: 'forestNear', depth: .62, tile: 520, draw: ({ x0, x1, r, front, grow }) => {
      const gs = groundShape(treeLineNear, x0, x1 + 2, 1300, 30, front); if (!gs) return;
      paint(gs.shape, { wash: P.snowShade, ink: null }); inkLine(gs.top, 1, P.ink, 'inkfine', .4);
      const n = 3 + Math.floor(r(1) * 3);
      for (let j = 0; j < n; j++) { const x = x0 + (j + .15 + .7 * r(2 + j)) / n * 520, g = clamp(grow(x + 50)); if (g > .05 && x < front) pine(x, treeLineNear(x) + 6, 130 + 80 * r(10 + j), g, P.pine, true); }
    } },
    { name: 'ground', depth: 1, tile: 420, draw: ({ x0, x1, r, front, grow }) => {
      const line = groundShape(G, x0, x1 + 2, 1500, 28, front), gs = groundShape(G, x0, x1 + 2, 1500, 28, front - 46);
      if (!line) return;
      if (gs) paint(gs.shape, { wash: P.snow, ink: null });
      for (const [dy, col] of [[70, P.snowMid], [170, P.snowShade]]) { const b = groundShape(x => G(x) + dy + 12 * Math.sin(x * .008), x0, x1 + 2, 1500, 40, front - 46); if (b) paint(b.shape, { wash: col, ink: null }); }
      inkLine(line.top, 1.8, P.ink, 'ink', .4);
      for (let j = 0; j < 4; j++) {   // dry grass poking through the snow
        const x = x0 + 420 * r(30 + j), g = clamp(grow(x)), y = G(x); if (g <= .05 || x > front) continue;
        for (let k = -1; k <= 1; k++) inkLine([[x + k * 5, y], [x + k * 9, y - (14 + 10 * r(40 + j)) * g]], 1.1, P.grass, 'inkfine', .3);
      }
      for (const lx of o.logs || []) if (lx >= x0 && lx < x1) {   // a fallen log, story-placed
        const g = grow(lx), y = G(lx); if (g <= .02) continue;
        paint(ellPts(lx + 8, y + 5, 90 * g, 10 * g, 12), { wash: P.snowShade, ink: null });
        paint(rrPts(lx - 80, rise(g, y, y - 44), 150, 44 * g, 20 * g), { wash: P.log, ink: P.ink, sw: 1.3 });
        paint(ellPts(lx + 70, rise(g, y - 2, y - 22), 15 * g, 22 * g, 14), { wash: P.logEnd, ink: P.ink, sw: 1.1 });
        paint(rrPts(lx - 76, rise(g, y, y - 50), 140, 12 * g, 6 * g), { wash: P.snow, ink: P.ink, sw: .8 });   // snow on top
      }
    } },
    { name: 'snowNear', depth: 1.25, tile: 620, draw: ({ x0, r, t }) => flakes(x0, 620, r, t, 7, 6, 110, 220) },
    { name: 'foreground', depth: 1.45, tile: 640, draw: ({ x0, r, grow }) => {
      if (r(1) > .35) return;
      const x = x0 + 560 * r(2), g = clamp(grow(x)), y = G(x) + 640; if (g <= .02) return;   // mostly below frame: only the top frames the shot
      pine(x, y, 480 * g, 1, P.fg, true);
    } },
  ] };
};
