// particleBurst: confetti, sparks or hearts fly out from a point, fall under gravity and shrink away.
//   x, y    origin    size  how far they fly (px)     count   particles      pSize  particle size (px)
//   shape   'star' circle heart square, or 'mix'       colors  palette cycled over the particles
//   angle, arc   direction and width of the spray (radians; arc TAU = all round)      gravity  px they fall by the end
//   glow    colour of the flash at the origin (null = none)         spin  max tumble (radians)
// Each particle's path is closed-form from hash(i), so nothing is simulated frame to frame.
definePreset('particleBurst', {
  label: 'Particle Burst', about: 'hash-seeded particles on easeOut arcs with gravity, tumble, shrink and a glow() flash',
  defaults: { x: W / 2, y: 520, size: 420, count: 26, pSize: 26, shape: 'mix', colors: [PAL.ochre, PAL.rose, PAL.clay, PAL.cream, PAL.teal], angle: -Math.PI / 2, arc: TAU, gravity: 260, glow: PAL.ochre, spin: 3, seed: 0, ease: 'easeOut', dur: 1.4 },
  run(t, o) {
    const age = seg(t, o.at, o.at + o.dur); if (t < o.at || age >= 1) return;
    if (o.glow) glow(o.x, o.y, o.size * .8, o.glow, Math.pow(1 - seg(age, 0, .35), 2));
    const names = Object.keys(SHAPES);
    for (let i = 0; i < o.count; i++) {
      const h = j => hash(i * 7.31 + j * 3.7 + o.seed * 101), a = o.angle + (((i + .5) / o.count) - .5) * o.arc + (h(1) - .5) * o.arc / o.count;
      const r = o.size * (.45 + .55 * h(2)) * presetK(t, o), s = o.pSize * (.6 + .8 * h(3)) * (1 - easeIn(age));
      if (s < 1.5) continue;
      boilSeed('burst' + (o.id ?? '') + '|' + i);
      presetPlace(o.x + Math.cos(a) * r, o.y + Math.sin(a) * r + o.gravity * age * age, o.spin * (h(4) - .5) * age * 4, 1, 1, () =>
        paint(SHAPES[o.shape === 'mix' ? names[Math.floor(h(5) * names.length)] : o.shape](0, 0, s), { wash: o.colors[i % o.colors.length], ink: PAL.ink, sw: .7 }));
    }
  },
  demo: {
    bg: PAL.night, ground: { y: 860, color: PAL.indigo },
    layers: [(lt) => clawd(960, 860, 26, emotions(lt, [[0, 'neutral'], [.5, 'excited']])), ['particleBurst', { x: 960, y: 420, at: .5 }], ['particleBurst', { x: 960, y: 420, at: 2.2, seed: 1, shape: 'heart', colors: [PAL.rose, PAL.clayLt] }]],
  },
});
