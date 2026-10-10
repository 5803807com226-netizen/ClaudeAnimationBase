// objectReveal: an object arrives from off-screen (or grows from nothing) on an arc, lands with a wobble and a glow.
//   from   'below' | 'above' | 'left' | 'right' | 'center'     dist  px it travels      arc  px of arc height
//   glow   colour of the light it casts (null = none)          glowR  light radius in sizes      wobble  landing wobble (radians)
definePreset('objectReveal', {
  label: 'Object Reveal', about: 'arcPt entrance with backOut landing, spring wobble and a glow() halo',
  meta: { version: '1.0.0', category: 'object', tags: ['reveal', 'entrance', 'arrive', 'arc', 'glow'], params: { from: { enum: ['below', 'above', 'left', 'right', 'center'] } } },
  defaults: { x: W / 2, y: ny(640 / 1080), size: 120 * US(), color: PAL.rose, shape: 'heart', icon: null, from: 'below', dist: 600 * US(), arc: 120 * US(), glow: PAL.ochre, glowR: 3, wobble: .25, ease: 'backOut', dur: .9 },
  run(t, o) {
    if (t < o.at) return;
    const k = presetK(t, o), d = { below: [0, 1], above: [0, -1], left: [-1, 0], right: [1, 0], center: [0, 0] }[o.from];
    const [px, py] = arcPt([o.x + d[0] * o.dist, o.y + d[1] * o.dist], [o.x, o.y], o.arc, k), s = o.from === 'center' ? k : 1;
    if (o.glow) glow(px, py, o.size * o.glowR * (.3 + .7 * clamp(k)), o.glow, clamp(k) * (.8 + .2 * pulse(t)));   // light goes under the object
    presetPlace(px, py, o.wobble * spring(t, o.at + o.dur, 6, 18), s, s, () => presetItem(o));
  },
  demo: {
    bg: PAL.night, ground: { y: ny(860 / 1080), color: PAL.indigo },
    layers: [(lt) => clawd(nx(560 / 1920), ny(860 / 1080), 26 * US(), { ...emotions(lt, [[0, 'neutral'], [1.3, 'starstruck']]), lookX: .6, lookY: -.3 }),
             ['objectReveal', { x: nx(1150 / 1920), y: ny(860 / 1080) - 220 * US(), size: 130 * US(), at: .8 }]],
  },
});
