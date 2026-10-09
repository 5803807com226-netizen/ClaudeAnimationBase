// systems/actor.js: a character PERFORMANCE from data. Combines the motion system (travel, hops, footfalls), the acting
// system (gait, lean, reactions, look, blinks) and the FX system (shadow, dust, impact, trails, speed lines) into
// generic channels, and hands them to the character's adapter. Nothing here knows what the character looks like.
//
//   const a = makeActor({
//     character,                 // from a character file: a rig plus { feet, head, pose(channels) } (see pip.js, lumo.js)
//     u, ground: x => y,         // size unit (px), the ground under the feet
//     motion: { keys: [[t, x, v], ...], jumps: [{ t0, t1, h, crouch, amt }], stride },
//     look: [[t, target], ...],  // target: [x, y], t => [x, y], or 'ahead'
//     reactions: [[t0, kind, amt], ...], mouth: [[t, shape], ...], blinks: [t, ...],
//     channels: [[t, { name: value }], ...],   // any extra keyed channels the character reads (e.g. glow)
//     gait: { swing, bob, arms, squash (per-step squash, for heavy walkers) }, lean: { k, ka, max },
//     idle: { breath, sway } (breathing and weight shift while standing still),
//     fx: { shadow, dust, impact, trail, speed, light }  // colours and switches; false turns one off. light: { color, r, a }
//                                                 // a pool of light on the ground under a glowing character (glow channel scales it). trail.glow: a trail of light
//                                                 // (additive) instead of paint, for characters that shine on dark grounds
//   });
//   a.state(t) · a.channels(t) · a.head(t) · a.events · a.draw(t)
// Channels: legL legR armL armR (radians), tuck (0..1, airborne), look [x, y], blink, wide, happy, brow, mouth, open,
// sq (squash), rot (lean), dy (body units), plus whatever `channels` adds.

function makeActor(spec) {
  const C = spec.character, U = spec.u, G = spec.ground, M = spec.motion, stride = M.stride ?? 70, jumps = M.jumps || [];
  const fx = { shadow: { color: '#000000', op: 60 }, dust: { color: PAL.cream, life: .65 }, impact: { color: PAL.ink }, trail: { color: '#F4B85A', op: 110 },
    speed: { color: '#8C8079', from: 420, full: 560 }, ...spec.fx };
  const end = M.keys[M.keys.length - 1][0];
  const steps = footfalls(M.keys, stride, M.keys[0][0], end, jumps);
  const state = t => {
    const tr = travel(t, M.keys), hp = hops(t, jumps), gy = G(tr.x);
    return { x: tr.x, v: tr.v, a: (travel(t + 1 / 48, M.keys).v - travel(t - 1 / 48, M.keys).v) * 24, y: gy + hp.dy, gy, hp };
  };
  const head = t => { const s = state(t); return [s.x + C.head[0] * U, s.y - (C.feet - C.head[1]) * U]; };
  const resolve = (tg, t) => tg === 'ahead' ? (() => { const s = state(t); return [s.x + 400 * (Math.sign(s.v) || 1), s.gy - 60]; })() : typeof tg === 'function' ? tg(t) : tg;
  const LOOK = (spec.look || [[0, 'ahead']]).map(([lt, tg]) => [lt, t => resolve(tg, t)]);
  const MOUTH = (spec.mouth || [[0, 'smile']]).map(([mt, m]) => [mt, { mouth: m }]);

  function channels(t) {
    const s = state(t), air = s.hp.air, moving = Math.abs(s.v) > 40 && !air, g = gait(s.x, stride, spec.gait);
    const R = merge(...(spec.reactions || []).map(([t0, kind, amt]) => react(t, t0, kind, amt)));
    const [hx, hy] = head(t), [tx, ty] = saccade(t, LOOK);
    const tuck = air ? .6 * (1 - Math.abs(1 - 2 * s.hp.k)) + .25 : 0, up = (air ? .9 : 0) + (R.arms || 0);
    const idle = spec.idle && Math.abs(s.v) < 30 && !air && s.hp.phase === 'ground' ? { breath: spec.idle.breath ?? .03, sway: spec.idle.sway ?? .02 } : null;
    return {
      legL: moving ? g.legL : tuck, legR: moving ? g.legR : -tuck, tuck,
      armL: up + (moving ? g.arms * .5 : 0), armR: -up + (moving ? g.arms * .5 : 0),
      look: lookAt(hx, hy, tx, ty, 260, 200), blink: Math.max(blinkAt(t, spec.blinks || []), R.blink || 0),
      wide: (R.eyes || 0) + (air ? .35 : 0), happy: R.happy || 0, brow: R.brow || 0,
      ...track(t, MOUTH), open: air ? .4 + .5 * (1 - Math.abs(1 - 2 * s.hp.k)) : 0,
      sq: s.hp.sq + (R.sq || 0) + (moving && spec.gait?.squash ? spec.gait.squash * Math.abs(Math.cos(g.phase)) ** 4 : 0) + (idle ? idle.breath * .5 * (1 + Math.sin(t * 2.4)) : 0),
      rot: lean(s.v, s.a, spec.lean) + (R.rot || 0) + (idle ? idle.sway * Math.sin(t * 1.3) : 0), dy: (moving ? g.bob : 0) + (R.dy || 0),
      ...(spec.channels ? track(t, spec.channels) : {}),
    };
  }

  const body = t => { const s = state(t); return [s.x - 6, s.y - (C.feet - .2) * U]; };
  function draw(t) {
    const s = state(t), ch = channels(t), lift = s.gy - s.y;
    if (fx.light) glow(s.x, s.gy - 4, U * (fx.light.r ?? 2.2) * (.8 + .2 * (ch.glow ?? 1)), fx.light.color, (fx.light.a ?? .45) * (ch.glow ?? 1) * (1 - .4 * clamp(lift / 200)));   // light on the ground
    if (fx.shadow) { boilSeed((spec.id || 'actor') + '|shadow'); paint(ellPts(s.x, s.gy + 4, U * (.95 - .45 * clamp(lift / 220)), U * .16, 16), { wash: fx.shadow.color, washOp: fx.shadow.op * (1 - .5 * clamp(lift / 220)), ink: null }); }
    if (fx.dust) {
      const ev = steps.map(ft => ({ t: ft, x: state(ft).x - 14 * Math.sign(state(ft).v || 1), y: state(ft).gy, n: 2, size: U * .17, dir: Math.sign(state(ft).v) || 1 }));
      jumps.forEach(j => { ev.push({ t: j.t0, x: state(j.t0).x, y: state(j.t0).gy, n: 3, size: U * .2 }); ev.push({ t: j.t1, x: state(j.t1).x, y: state(j.t1).gy, n: j.h > 120 ? 8 : 4, size: U * (j.h > 120 ? .32 : .2), spread: 1.6 }); });
      puffs(t, ev, { color: fx.dust.color, life: fx.dust.life });
    }
    if (fx.impact) jumps.filter(j => j.h > 120).forEach(j => impactLines(t, j.t1, state(j.t1).x, state(j.t1).gy - 6, { r0: U * .95, reach: U * .5, len: U * .32, color: fx.impact.color }));
    if (fx.trail && fx.trail.glow && (s.hp.air || s.hp.phase === 'land')) for (const lag of [.03, .07, .11, .15, .19]) { const [gx, gy] = body(t - lag); glow(gx, gy, U * (1.5 - lag * 4), fx.trail.color, .5 - lag * 2); }
    else if (fx.trail && (s.hp.air || s.hp.phase === 'land')) {
      trail(t, body, { len: .24, n: 12, w0: U * 1.2, w1: 2, color: fx.trail.color, op: fx.trail.op, id: (spec.id || 'actor') + '|trail' });
      for (const lag of [.05, .1]) { const [ax, ay] = body(t - lag); boilSeed('ghost' + lag); paint(ellPts(ax, ay, U * .8, U * .8, 18), { wash: fx.trail.color, washOp: fx.trail.op * (1 - lag * 6), ink: null }); }   // afterimages
    }
    if (fx.speed) speedLines(t, s.x - U * .6 * (Math.sign(s.v) || 1), s.y - C.feet * U, s.v, { from: fx.speed.from, full: fx.speed.full, spread: U * 1.6, len: 150, color: fx.speed.color });
    push(); translate(s.x, s.y); rotate(ch.rot); scale(1 + .8 * ch.sq, 1 - ch.sq);
    drawCharacter(C, 0, (-C.feet + ch.dy) * U, U, tt => C.pose(channels(tt)), t);
    pop();
  }
  return { spec, state, channels, head, events: { steps, takeoffs: jumps.map(j => j.t0), landings: jumps.map(j => j.t1) }, draw, pos: t => { const s = state(t); return [s.x, s.y]; } };
}
