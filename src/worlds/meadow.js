// meadow.js: a world THEME (art only): an evening meadow. systems/world.js decides where tiles are, the parallax and
// the reveal; this file decides how the sky and each tile look. Registered as WORLDS.meadow; another theme (snow
// forest, city, sea…) is another file with the same shape: opts => ({ sky(t, ctx), layers: [...] }).
//   opts: { ground: x => y, palette: {...}, rocks: [x, ...] (story-placed obstacles) }
WORLDS.meadow = (o) => {
  const P = { skyTop: '#E9DCEB', skyLow: '#F8E6CF', sun: '#F6C46A', far: '#B9A6CF', farLit: '#CDBFE0', haze: '#F1E4E4', cloud: '#FFF7EE', cloudSh: '#E3D5E6',
    hillFar: '#A9C3B4', hill: '#93B898', hillDk: '#7FA388', tree: '#5E9479', treeDk: '#4C7D63', treeWarm: '#E8A45C', pine: '#4F7F66', trunk: '#6B5246',
    ground: '#A9CC72', groundMid: '#98C064', groundDk: '#86AE58', bush: '#78A55A', flower: ['#EE8A7A', '#FFF3DD', '#F2C14E', '#C9A2E0'],
    rock: '#AFA49C', rockDk: '#8E837D', stem: '#4C8A43', fg: '#4C7A3C', fgDk: '#365F2C', ink: PAL.ink, ...o.palette };
  const G = o.ground, rise = (g, y0, y) => lerp(y0, y, g);
  const pine = (x, y, h, g, col) => {   // a pine: three tiers, one outline each
    for (let k = 0; k < 3; k++) { const ty = y - h * (.25 + k * .25) * g, w = h * (.32 - k * .07) * g; paint([[x - w, ty + h * .2 * g], [x, ty - h * .22 * g], [x + w, ty + h * .2 * g]], { wash: col, ink: P.ink, sw: .7 }); }
    inkLine([[x, y], [x, y - h * .2 * g]], 2, P.trunk, 'ink', 0);
  };
  const lolly = (x, y, h, g, col) => {
    inkLine([[x, y], [x + 2, y - h * g]], 2.2, P.trunk, 'ink', .3);
    paint(ellPts(x + 2, y - h * g - 20 * g, 30 * g, 36 * g, 16), { wash: col, ink: P.ink, sw: .8 });
    paint(ellPts(x + 12, y - h * g - 12 * g, 14 * g, 18 * g, 10), { wash: P.treeDk, washOp: 110, ink: null });   // shade side
  };
  const rolling = (base, a1, a2, s) => x => base + a1 * Math.sin(x * .0031 + s) + a2 * Math.sin(x * .0077 + s * 2);

  // the sky is in screen space but follows the world horizon, so it fits any frame height and framing
  const sky = (t, ctx) => {
    boilSeed('sky'); const hz = horizonOnScreen(ctx, 720), n = Math.ceil((H + 120) / 160) + 1, s = Math.min(W, H) / 1080;
    for (let i = 0; i < n; i++) { const y = -60 + i * 160; paint(rectPts(-60, y, W + 120, 200), { wash: mixCol(P.skyTop, P.skyLow, clamp((y + 100) / Math.max(200, hz + 60))), ink: null }); }
    paint(ellPts(W * .5, hz - 20, W * .8, 160 * s, 30), { fill: P.haze, fillOp: 140, bleed: .3, tex: .4, ink: null });    // haze at the horizon
    const sx = W * .79, sy = Math.max(110 * s, hz - 560 * s);
    glow(sx, sy, 220 * s, '#FFC27A', .6); paint(ellPts(sx, sy, 64 * s, 64 * s, 28), { wash: P.sun, ink: P.ink, sw: 1 });
    paint(ellPts(sx - 15 * s, sy - 15 * s, 30 * s, 22 * s, 12), { wash: '#FFE3A6', washOp: 160, ink: null });
  };

  const hillsFar = rolling(690, 30, 14, .7), hillsNear = rolling(728, 36, 16, 2.1);
  return { sky, palette: P, layers: [
    { name: 'clouds', depth: .08, tile: 820, draw: ({ x0, r, t, grow }) => {
      const x = x0 + 400 * r(1) + t * 14, y = 160 + 160 * r(2), s = .7 + .6 * r(3), g = clamp(grow(x + 160));
      if (g <= .01) return;
      for (let j = 0; j < 5; j++) paint(ellPts(x + (j - 2) * 46 * s, y + 8 * s, 50 * s * g, 26 * s * g, 14), { wash: P.cloudSh, ink: null });   // shaded underside
      for (let j = 0; j < 4; j++) paint(ellPts(x + (j - 1.5) * 50 * s, y - (j % 2) * 24 * s, 58 * s * g, 36 * s * g, 18), { wash: P.cloud, ink: null });
    } },
    { name: 'mountains', depth: .18, tile: 760, draw: ({ x0, x1, r, grow }) => {
      const g = grow(x1 + 160), base = 730; if (g <= .05) return;
      const pk = [[x0 - 60, base], [x0 + 220 * r(1) + 120, base - (180 + 160 * r(2)) * g], [x0 + 470, base - (110 + 120 * r(3)) * g], [x0 + 560 + 100 * r(4), base - (200 + 140 * r(5)) * g], [x1 + 60, base]];
      const outline = through(pk, 6);
      paint(outline.concat([[x1 + 60, base + 60 * g], [x0 - 60, base + 60 * g]]), { wash: P.far, fill: P.farLit, fillOp: 70, bleed: .15, tex: .5, ink: null });
      const i = 1 + Math.floor(r(6) * 2), [px, py] = pk[i];   // the lit face of one peak
      paint([[px, py], [px - 70 * g, py + 120 * g], [px - 10 * g, py + 140 * g]], { wash: P.farLit, ink: null });
      paint(rectPts(x0 - 60, base - 40 * g, x1 - x0 + 120, 100 * g), { wash: P.haze, washOp: 120, ink: null });   // haze over the feet
    } },
    { name: 'hillsFar', depth: .32, tile: 600, draw: ({ x0, x1, r, front, grow }) => {
      const gs = groundShape(hillsFar, x0, x1 + 2, 4000, 30, front); if (!gs) return;
      paint(gs.shape, { wash: P.hillFar, ink: null }); inkLine(gs.top, .8, mixCol(P.hillFar, P.ink, .4), 'inkfine', .4);
      for (let j = 0; j < 6; j++) { const x = x0 + (j + r(j)) / 6 * 600, g = clamp(grow(x + 60)); if (g < .05 || x > front) continue; pine(x, hillsFar(x) + 4, 34 + 18 * r(10 + j), g, mixCol(P.pine, P.hillFar, .45)); }
    } },
    { name: 'hillsNear', depth: .55, tile: 560, draw: ({ x0, x1, r, front, grow }) => {
      const gs = groundShape(hillsNear, x0, x1 + 2, 4000, 30, front); if (!gs) return;
      paint(gs.shape, { wash: P.hill, ink: null }); inkLine(gs.top, 1.1, P.ink, 'ink', .4);
      const band = groundShape(x => hillsNear(x) + 50, x0, x1 + 2, 4000, 40, front); if (band) paint(band.shape, { wash: P.hillDk, washOp: 140, ink: null });
      const n = 1 + Math.floor(r(3) * 3);
      for (let j = 0; j < n; j++) {
        const x = x0 + (j + .2 + .6 * r(4 + j)) / n * 560, g = clamp(grow(x + 50)); if (g <= .02 || x > front) continue;
        const y = hillsNear(x) + 4;
        if (r(7 + j) < .55) lolly(x, y, 64 + 36 * r(9 + j), g, r(12 + j) < .75 ? P.tree : P.treeWarm); else pine(x, y, 90 + 40 * r(14 + j), g, P.pine);
        paint(ellPts(x + 22, y + 2, 26 * g, 7 * g, 10), { wash: P.hillDk, washOp: 140, ink: null });   // contact shadow
      }
    } },
    { name: 'ground', depth: 1, tile: 420, draw: ({ x0, x1, r, front, grow }) => {
      // the ink line is drawn a little ahead of the colour, as if being sketched
      const line = groundShape(G, x0, x1 + 2, 4000, 28, front), gs = groundShape(G, x0, x1 + 2, 4000, 28, front - 46);
      if (!line) return;
      if (gs) paint(gs.shape, { wash: P.ground, ink: null });
      for (const [dy, col] of [[60, P.groundMid], [150, P.groundDk]]) { const b = groundShape(x => G(x) + dy + 10 * Math.sin(x * .01), x0, x1 + 2, 4000, 40, front - 46); if (b) paint(b.shape, { wash: col, ink: null }); }
      inkLine(line.top, 2, P.ink, 'ink', .4);
      for (let j = 0; j < 11; j++) {   // grass ticks along the line
        const x = x0 + (j + r(20 + j)) / 11 * (x1 - x0), g = clamp(grow(x)); if (g <= .05) continue;
        const y = G(x); inkLine([[x - 3, y - 1], [x - 7, y - 11 * g]], 1.1, P.ink, 'inkfine', 0); inkLine([[x + 2, y - 1], [x + 6, y - 13 * g]], 1.1, P.ink, 'inkfine', 0);
      }
      for (let j = 0; j < 7; j++) {   // texture: short strokes in the grass below the line
        const x = x0 + 420 * r(60 + j), y = G(x) + 40 + 200 * r(70 + j); if (x > front - 46) continue;
        inkLine([[x, y], [x + 14, y - 3]], .9, mixCol(P.groundDk, P.ink, .25), 'inkfine', 0);
      }
      if (r(40) < .55) {   // a bush sitting on the line
        const x = x0 + 60 + 300 * r(41), g = clamp(grow(x)), y = G(x); if (g > .02) for (let k = 0; k < 3; k++) paint(ellPts(x + (k - 1) * 26 * g, y - 16 * g - (k === 1 ? 10 * g : 0), 26 * g, 22 * g, 14), { wash: k === 1 ? P.bush : mixCol(P.bush, P.ink, .12), ink: P.ink, sw: .8 });
      }
      for (let k = 0; k < (r(44) < .7 ? 3 : 0); k++) {   // a cluster of flowers
        const x = x0 + 120 + 200 * r(45) + k * 18, g = grow(x), y = G(x), h = (30 + 26 * r(46 + k)) * clamp(g); if (g <= .02) continue;
        inkLine([[x, y], [x + 3, y - h]], 1.3, P.stem, 'ink', .5); paint(ellPts(x + 3, y - h, 8 * g, 8 * g, 10), { wash: P.flower[Math.floor(r(50 + k) * 4)], ink: P.ink, sw: .7 });
      }
      for (const rx of o.rocks || []) if (rx >= x0 && rx < x1) {   // story-placed rocks (obstacles)
        const g = grow(rx), y = G(rx); if (g <= .02) continue;
        paint(ellPts(rx + 10, y + 4, 56 * g, 9 * g, 12), { wash: P.groundDk, ink: null });
        paint([[rx - 46, y + 6], [rx - 40, rise(g, y + 4, y - 30)], [rx - 12, rise(g, y + 4, y - 54)], [rx + 22, rise(g, y + 4, y - 46)], [rx + 44, rise(g, y + 4, y - 14)], [rx + 48, y + 6]],
          { wash: P.rock, ink: P.ink, sw: 1.4, curv: .4 });
        paint([[rx + 6, rise(g, y, y - 46)], [rx + 22, rise(g, y, y - 44)], [rx + 42, rise(g, y, y - 14)], [rx + 44, y + 4], [rx + 18, y + 4]], { wash: P.rockDk, washOp: 160, ink: null, curv: .4 });
      }
    } },
    { name: 'foreground', depth: 1.4, tile: 520, draw: ({ x0, r, grow }) => {
      if (r(1) > .8) return;
      const x = x0 + 480 * r(2), g = clamp(grow(x)), y = G(x) + 250; if (g <= .02) return;
      for (let j = 0; j < 7; j++) inkLine([[x + j * 9, y + 40], [x + j * 9 + (j - 3) * 14, y - (110 + 90 * r(3 + j)) * g]], 8, j % 2 ? P.fg : P.fgDk, 'ink', .5);
      if (r(12) < .4) { const fx = x + 30, fh = 150 * g; inkLine([[fx, y], [fx + 8, y - fh]], 6, P.fgDk, 'ink', .5); paint(ellPts(fx + 8, y - fh, 18 * g, 18 * g, 12), { wash: P.flower[0], ink: P.ink, sw: .8 }); }
    } },
  ] };
};
