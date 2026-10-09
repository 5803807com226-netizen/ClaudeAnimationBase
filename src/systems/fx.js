// systems/fx.js: Particle Trails & Motion FX. Every particle's state is computed from its spawn time and a stable
// random, never simulated frame to frame, so any frame renders on its own. Effects take painter functions or colours,
// so they follow the scene's art style.
//
//   emit(t, { rate, life, source: s => [x, y], spawn: (k, r, s) => ({ vx, vy, ... }), gravity, drag, from, to, draw })
//        a continuous emitter: particles leave `source` (a moving point, sampled at each spawn time) at `rate` per second
//   puffs(t, events, o)        dust/smoke puffs at events [{ t, x, y, n, size, dir }] (footfalls, landings, takeoffs)
//   impactLines(t, t0, x, y, o)  short strokes radiating from a contact, extending out and fading
//   trail(t, posFn, o)         a tapered ribbon through where posFn was over the last o.len seconds
//   speedLines(t, x, y, v, o)  streaks behind a fast mover, more and longer with speed, re-drawn on each boil frame

function emit(t, o) {
  const k0 = Math.ceil(Math.max(o.from ?? -1e9, t - o.life) * o.rate), k1 = Math.floor(Math.min(o.to ?? 1e9, t) * o.rate);
  for (let k = k0; k <= k1; k++) {
    const s = k / o.rate, age = t - s, r = j => hash(k * 12.9898 + j * 78.233 + (o.seed || 0) * 31.7);
    const [sx, sy] = o.source(s), p = o.spawn ? o.spawn(k, r, s) : {}, d = o.drag ? (1 - Math.exp(-o.drag * age)) / o.drag : age;
    boilSeed((o.id || 'emit') + '|' + k);
    o.draw({ x: sx + (p.vx || 0) * d, y: sy + (p.vy || 0) * d + .5 * (o.gravity || 0) * age * age, age, k: age / o.life, r, ...p });
  }
}

function puffs(t, events, o = {}) {
  const life = o.life ?? .6, col = o.color || PAL.cream;
  events.forEach((e, ei) => {
    const a = t - e.t; if (a < 0 || a > life) return;
    const n = e.n ?? 4, k = a / life, s = e.size ?? 14;
    for (let i = 0; i < n; i++) {
      const r = j => hash(ei * 91.7 + i * 17.3 + j * 5.1), side = (e.dir ?? 0) ? -e.dir : (i % 2 ? 1 : -1);
      const x = e.x + side * (8 + 46 * r(1) * (e.spread ?? 1)) * easeOut(k) + (r(2) - .5) * 10, y = e.y - (4 + 26 * r(3)) * easeOut(k);
      const rad = s * (.5 + .7 * r(4)) * (.55 + .8 * easeOut(k)) * (1 - k * .35);
      boilSeed('puff|' + ei + '|' + i);
      paint(ellPts(x, y, rad, rad * .82, 12), { wash: col, washOp: 255 * (1 - k) ** 1.4, ink: o.ink === false ? null : o.ink || null, sw: .6 });
    }
  });
}

function impactLines(t, t0, x, y, o = {}) {
  const a = t - t0, life = o.life ?? .4; if (a < 0 || a > life) return;
  const k = a / life, n = o.n ?? 7, [a0, a1] = o.arc || [-Math.PI * .95, -Math.PI * .05];
  const col = mixCol(o.color || PAL.ink, o.fade || '#B9B2B4', k), r0 = (o.r0 ?? 40) + (o.reach ?? 40) * easeOut(k), len = (o.len ?? 24) * (1 - k * .7);
  for (let i = 0; i < n; i++) {
    const ang = lerp(a0, a1, (i + .5) / n) + (hash(i * 7.7 + t0) - .5) * .25, c = Math.cos(ang), s = Math.sin(ang);
    boilSeed('impact|' + t0 + '|' + i);
    inkLine([[x + c * r0, y + s * r0 * (o.squashY ?? .8)], [x + c * (r0 + len), y + s * (r0 + len) * (o.squashY ?? .8)]], o.sw ?? 1.6, col, 'ink', 0);
  }
}

function trail(t, posFn, o = {}) {
  const len = o.len ?? .3, n = o.n ?? 14, pts = [];
  for (let i = n; i >= 0; i--) pts.push(posFn(t - len * i / n));
  let d = 0; for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  if (d < (o.minLen ?? 20)) return;
  boilSeed(o.id || 'trail');
  paint(ribbon(pts, o.w1 ?? 1, o.w0 ?? 16), { wash: o.color || PAL.cream, washOp: o.op ?? 150, ink: null });
}

function speedLines(t, x, y, v, o = {}) {
  const k = clamp((Math.abs(v) - (o.from ?? 380)) / ((o.full ?? 650) - (o.from ?? 380))); if (k <= 0) return;
  const n = Math.round((o.count ?? 6) * (.4 + .6 * k)), dir = Math.sign(v) || 1;
  for (let i = 0; i < n; i++) {
    const r = j => hash(i * 13.1 + BOILN * 7.3 + j * 3.3), yy = y + (r(1) - .5) * (o.spread ?? 120), x0 = x - dir * ((o.gap ?? 60) + 70 * r(2)), L = (o.len ?? 160) * k * (.45 + .55 * r(3));
    boilSeed('speed|' + i);
    inkLine([[x0, yy], [x0 - dir * L, yy]], o.sw ?? 1.2, o.color || PAL.ink, 'inkfine', 0);
  }
}
