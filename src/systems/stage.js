// systems/stage.js: a whole scene from DATA. Picks a world theme and characters by name from the registries, builds
// actors (systems/actor.js), a camera, and registers the shot. A story is then a data file plus optional `extras` for
// one-off elements. Themes register with WORLDS.name = opts => ({ sky(t, ctx), layers }); characters with
// CHARACTERS.name = opts => character (see src/worlds, src/characters).
//
//   playStage({
//     world: { theme, ground: x => y, opts, intro: s (the world draws itself across the frame first; 0 = no), ahead: px,
//              reveal: false (the whole environment from the first frame: no reveal front at all) },
//     actors: [{ character: 'pip', opts, ...makeActor spec }],
//     camera: { follow: 0, lag, lead, offset: [x, y], y: [[t, y], ...], zoom: [[t, z], ...], shakeOnLand: px },
//     screen: [(t, ctx) => ...],   // extra screen-space painters behind the world (a moon, a shooting star)
//     extras: { back: [(t, ctx) => ...], front: [...] },   // world-space painters around the actors
//     fade: { in: s, out: s, color }, background: '#…', duration,
//   })
// ctx = { t, cam: { cx, cy, zoom, left, right }, camAt(t), actors, world, ground }.
const WORLDS = {}, CHARACTERS = {};

function playStage(spec) {
  const W0 = spec.world, theme = WORLDS[W0.theme]({ ground: W0.ground, ...W0.opts });
  const actors = spec.actors.map((a, i) => makeActor({ id: 'actor' + i, ...a, character: CHARACTERS[a.character](a.opts || {}), ground: a.ground || W0.ground }));
  const C = { follow: 0, lag: .5, lead: .3, offset: [0, 0], shakeOnLand: 7, ...spec.camera }, hero = actors[C.follow];
  const camAt = t => {
    const zoom = C.zoom ? kf(t, C.zoom) : 1, [fx] = followCam(t, hero.pos, { lag: C.lag, lead: C.lead });
    const cx = fx + C.offset[0], cy = C.y ? kf(t, C.y) : H / 2;
    return { cx, cy, zoom, left: cx - W / 2 / zoom, right: cx + W / 2 / zoom };
  };
  // the reveal front: sweeps across the frame during the intro, then stays past the right edge (and ahead of the hero)
  const reveal = t => {
    const c = camAt(t), x = hero.state(t).x + (W0.ahead ?? 360), full = c.right + 160;
    return W0.intro ? Math.max(x, lerp(c.left - 300, full, easeOut(seg(t, 0, W0.intro)))) : Math.max(x, full);
  };
  const world = makeWorld({ ground: W0.ground, reveal: W0.reveal === false ? null : reveal, layers: theme.layers });
  const fade = { in: .4, out: .4, color: spec.background || '#F4ECDF', ...spec.fade }, dur = spec.duration || DUR;

  shots([[0, (t) => {
    const cam = camAt(t), ctx = { t, cam, camAt, actors, world, ground: W0.ground };
    let sx = 0, sy = 0;
    if (C.shakeOnLand) for (const a of actors) for (const l of a.events.landings) { const d = t - l; if (d > 0 && d < .5) { const [x, y] = shakeXY(t, C.shakeOnLand * Math.exp(-9 * d)); sx += x; sy += y; } }
    background(spec.background || '#F4ECDF');
    if (theme.sky) theme.sky(t, ctx);
    (spec.screen || []).forEach(f => f(t, ctx));
    camBegin(cam.cx + sx, cam.cy + C.offset[1] + sy, cam.zoom);
    drawLayers(world, t, L => L.depth <= 1);
    (spec.extras?.back || []).forEach(f => f(t, ctx));
    actors.forEach(a => a.draw(t));
    (spec.extras?.front || []).forEach(f => f(t, ctx));
    drawLayers(world, t, L => L.depth > 1);
    camEnd();
    if (fade.in && t < fade.in) flash(1 - t / fade.in, fade.color);
    if (fade.out && t > dur - fade.out) flash((t - (dur - fade.out)) / fade.out, fade.color);
  }]]);
  return { actors, world, camAt };
}
