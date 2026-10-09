// systems/stage.js: a whole scene from DATA. Picks a world theme and characters by name from the registries, builds
// actors (systems/actor.js), a camera, and registers the shot. A story is then a data file plus optional `extras` for
// one-off elements. Themes register with WORLDS.name = opts => ({ sky(t, ctx), layers }); characters with
// CHARACTERS.name = opts => character (see src/worlds, src/characters).
//
//   playStage({
//     world: { theme, ground: x => y, opts, intro: s (the world draws itself across the frame first; 0 = no), ahead: px,
//              reveal: false (the whole environment from the first frame: no reveal front at all) },
//     actors: [{ character: 'pip', opts, ...makeActor spec }],
//     camera: { follow: 0, lag, lead, offset: [x, y], y: [[t, y], ...], zoom: [[t, z], ...], shakeOnLand: px,
//               framing: { '9:16': { zoom, dy, lead }, '16:9': {...}, '4:5': {...} } (multiplies / offsets per aspect),
//               keepInFrame: true (the hero never leaves the action-safe area) },
//     screen: [(t, ctx) => ...],   // extra screen-space painters behind the world (a moon, a shooting star)
//     extras: { back: [(t, ctx) => ...], front: [...] },   // world-space painters around the actors
//     fade: { in: s, out: s, color }, background: '#…', duration,
//   })
// ctx = { t, cam: { cx, cy, zoom, left, right }, camAt(t), actors, world, ground }.
const WORLDS = {}, CHARACTERS = {};
// For a theme's screen-space sky: the screen y of a world height (e.g. its horizon) under the stage camera.
const horizonOnScreen = (ctx, worldY) => ctx && ctx.cam ? (worldY - ctx.cam.cy) * ctx.cam.zoom + H / 2 : worldY - PARALLAX_REF[1] + H / 2;

function playStage(spec) {
  const W0 = spec.world, theme = WORLDS[W0.theme]({ ground: W0.ground, ...W0.opts });
  const actors = spec.actors.map((a, i) => makeActor({ id: 'actor' + i, ...a, character: CHARACTERS[a.character](a.opts || {}), ground: a.ground || W0.ground }));
  const C = { follow: 0, lag: .5, lead: .3, offset: [0, 0], shakeOnLand: 7, keepInFrame: true, ...spec.camera }, hero = actors[C.follow];
  // Per-aspect framing: the story's camera keys are written once; taller frames push in so the hero keeps its size on
  // screen, and the hero is kept inside the action-safe area whatever the format (responsive.js).
  const F = { zoom: 1, dy: 0, ...byAspect({ '16:9': { zoom: 1 }, '4:5': { zoom: 1.12 }, '9:16': { zoom: 1.28 } }, {}), ...byAspect(C.framing || {}, {}) };
  const heroBox = (t, cx, cy, zoom) => {   // the hero's screen box under a camera
    const s = hero.state(t), u = hero.spec.u, ch = hero.spec.character, top = s.y - (ch.height ?? ch.feet + 1.2) * u, half = (ch.width ?? 1.1) * u;
    const sx = v => (v - cx) * zoom + W / 2, sy = v => (v - cy) * zoom + H / 2;
    return { x0: sx(s.x - half), x1: sx(s.x + half), y0: sy(top), y1: sy(s.y) };
  };
  const camAt = t => {
    const zoom = (C.zoom ? kf(t, C.zoom) : 1) * F.zoom, [fx] = followCam(t, hero.pos, { lag: C.lag, lead: F.lead ?? C.lead });
    let cx = fx + C.offset[0], cy = (C.y ? kf(t, C.y) : PARALLAX_REF[1]) + F.dy;
    if (C.keepInFrame) {
      const sa = safeArea('action'), b = heroBox(t, cx, cy, zoom);
      if (b.y1 > sa.y1) cy += (b.y1 - sa.y1) / zoom; else if (b.y0 < sa.y0) cy -= (sa.y0 - b.y0) / zoom;
      if (b.x0 < sa.x0) cx -= (sa.x0 - b.x0) / zoom; else if (b.x1 > sa.x1) cx += (b.x1 - sa.x1) / zoom;
    }
    return { cx, cy, zoom, left: cx - W / 2 / zoom, right: cx + W / 2 / zoom };
  };
  // for tools/aspect_test.mjs: where everything is on screen at time t
  window.STAGE_INFO = t => { const c = camAt(t); return { cam: c, actors: actors.map((a, i) => i === C.follow ? heroBox(t, c.cx, c.cy, c.zoom) : null).filter(Boolean), safe: safeArea('action') }; };
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
