// meadow.js: a world THEME (art only): an evening meadow for systems/world.js, as layers of tile painters. The world
// system decides where tiles are, the parallax and the reveal; this file only decides how a tile looks. Another theme
// (city, sea, space, paper…) is another file with the same shape.
//
//   const world = makeWorld({ ground, reveal, layers: meadowLayers({ ground, palette, rocks: [x, ...] }) });
function meadowLayers(o) {
  const P = { far: '#B9A6CF', cloud: '#FFF7EE', hill: '#9DBFA2', hillDk: '#7FA388', tree: '#5E9479', treeWarm: '#E8A45C', trunk: '#6B5246',
    ground: '#A9CC72', groundDk: '#8DB65E', flower: ['#EE8A7A', '#FFF3DD', '#F2C14E'], rock: '#AFA49C', rockDk: '#8E837D', fg: '#5F8C4C', ink: PAL.ink, ...o.palette };
  const G = o.ground, rise = (g, y0, y) => lerp(y0, y, g);   // a prop rising out of its base as it grows in

  return [
    { name: 'clouds', depth: .08, tile: 900, draw: ({ x0, r, t, grow }) => {
      const x = x0 + 450 * r(1) + t * 14, y = 180 + 140 * r(2), s = .7 + .6 * r(3), g = clamp(grow(x + 160));
      if (g <= .01) return;
      for (let j = 0; j < 4; j++) paint(ellPts(x + (j - 1.5) * 52 * s, y - (j % 2) * 26 * s, 62 * s * g, 40 * s * g, 18), { wash: P.cloud, ink: null });
    } },
    { name: 'mountains', depth: .22, tile: 760, draw: ({ x0, x1, r, grow }) => {
      const g = grow(x1 + 160), base = 790;   // rise once the front has passed the whole range
      if (g <= .05) return;
      const pk = [[x0 - 60, base], [x0 + 220 * r(1) + 120, base - (180 + 160 * r(2)) * g], [x0 + 470, base - (110 + 120 * r(3)) * g], [x0 + 560 + 100 * r(4), base - (200 + 140 * r(5)) * g], [x1 + 60, base]];
      paint(through(pk, 6).concat([[x1 + 60, base + 80 * g], [x0 - 60, base + 80 * g]]), { wash: P.far, fill: mixCol(P.far, '#FFFFFF', .2), fillOp: 60, bleed: .15, tex: .5, ink: null });
    } },
    { name: 'hills', depth: .5, tile: 620, draw: ({ x0, r, grow }) => {
      const cx = x0 + 310, g = grow(cx + 420), base = 800, hh = (120 + 80 * r(1)) * g; if (g <= .01) return;
      paint(ellPts(cx, base, 420, hh, 30), { wash: r(2) < .5 ? P.hill : P.hillDk, ink: P.ink, sw: .8 });
      const n = Math.floor(r(3) * 3);
      for (let j = 0; j < n; j++) {   // lollipop trees on the hilltop, growing up as the world reaches them
        const tx = cx + (r(4 + j) - .5) * 360, tg = clamp(grow(Math.max(tx + 40, cx + 420))), ty = base - hh * Math.sqrt(Math.max(0, 1 - ((tx - cx) / 420) ** 2)) + 6, h = (70 + 40 * r(7 + j)) * tg;
        if (tg <= .02) continue;
        inkLine([[tx, ty], [tx, ty - h]], 2.2, P.trunk, 'ink', 0);
        paint(ellPts(tx, ty - h - 22 * tg, 30 * tg, 36 * tg, 16), { wash: r(9 + j) < .7 ? P.tree : P.treeWarm, ink: P.ink, sw: .8 });
      }
    } },
    { name: 'ground', depth: 1, tile: 420, draw: ({ x0, x1, r, front, grow }) => {
      // the ink line is drawn a little ahead of the colour, as if being sketched
      const line = groundShape(G, x0, x1 + 2, 1500, 28, front), gs = groundShape(G, x0, x1 + 2, 1500, 28, front - 46);
      if (!line) return;
      if (gs) paint(gs.shape, { wash: P.ground, ink: null });
      const band = groundShape(x => G(x) + 120, x0, x1 + 2, 1500, 40, front - 46); if (band) paint(band.shape, { wash: P.groundDk, ink: null });
      inkLine(line.top, 2, P.ink, 'ink', .4);
      for (let j = 0; j < 7; j++) {   // grass ticks on the line
        const x = x0 + (j + r(20 + j)) / 7 * (x1 - x0), g = clamp(grow(x)); if (g <= .05) continue;
        const y = G(x); inkLine([[x - 3, y - 1], [x - 6, y - 10 * g]], 1.1, P.ink, 'inkfine', 0); inkLine([[x + 2, y - 1], [x + 5, y - 12 * g]], 1.1, P.ink, 'inkfine', 0);
      }
      if (r(40) < .6) {   // a flower
        const x = x0 + 60 + 300 * r(41), g = grow(x), y = G(x), h = (36 + 30 * r(42)) * clamp(g);
        if (g > .02) { inkLine([[x, y], [x + 3, y - h]], 1.4, P.leafStem || '#4C8A43', 'ink', .5); paint(ellPts(x + 3, y - h, 9 * g, 9 * g, 10), { wash: P.flower[Math.floor(r(43) * 3)], ink: P.ink, sw: .7 }); }
      }
      for (const rx of o.rocks || []) if (rx >= x0 && rx < x1) {   // story-placed rocks (obstacles)
        const g = grow(rx), y = G(rx); if (g <= .02) continue;
        paint([[rx - 46, y + 6], [rx - 40, rise(g, y + 4, y - 30)], [rx - 12, rise(g, y + 4, y - 54)], [rx + 22, rise(g, y + 4, y - 46)], [rx + 44, rise(g, y + 4, y - 14)], [rx + 48, y + 6]],
          { wash: P.rock, ink: P.ink, sw: 1.4, curv: .4 });
        inkLine([[rx - 8, rise(g, y, y - 40)], [rx + 14, rise(g, y, y - 26)]], .9, P.rockDk, 'inkfine', .5);
      }
    } },
    { name: 'foreground', depth: 1.45, tile: 700, draw: ({ x0, r, grow }) => {
      if (r(1) > .55) return;
      const x = x0 + 600 * r(2), g = clamp(grow(x)), y = G(x) + 330; if (g <= .02) return;
      for (let j = 0; j < 5; j++) inkLine([[x + j * 10, y], [x + j * 10 + (j - 2) * 14, y - (90 + 60 * r(3 + j)) * g]], 6, P.fg, 'ink', .5);
    } },
  ];
}
