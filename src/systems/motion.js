// systems/motion.js: Path Follow & Cartoon Physics. Pure functions of time: no state survives between frames, so
// frames render in parallel. They return numbers (positions, velocities, squash, events); they never draw.
//
//   travel(t, keys)          1D travel with real acceleration: keys [[t, x, v], ...] (px, px/s), cubic Hermite between keys
//   hops(t, jumps)           jumps over a ground: [{ t0 takeoff, t1 landing, h px, crouch s, land s, amt }]:
//                            anticipation crouch, parabolic flight, stretch on the way up and down, squash and settle on landing
//   footfalls(keys, stride, t0, t1, jumps)   the times feet hit the ground (for dust, sound, camera bob), computed once
//   makePath(points), follow(t, path, t0, t1, ease)   curved paths at constant speed along their length, with the tangent
//   ballistic(t, t0, [x, y], [vx, vy], g)   a thrown or falling object
//   velocity(fn, t)          the velocity of any position function fn(t) → [x, y]
// Squash convention: sq > 0 squashes (wider, shorter), sq < 0 stretches. A body gets scale(1 + .8 sq, 1 - sq).

function travel(t, keys) {
  const n = keys.length;
  if (t <= keys[0][0]) return { x: keys[0][1] + keys[0][2] * (t - keys[0][0]), v: keys[0][2] };
  for (let i = 1; i < n; i++) if (t <= keys[i][0]) {
    const [t0, x0, v0] = keys[i - 1], [t1, x1, v1] = keys[i], h = t1 - t0, s = (t - t0) / h, s2 = s * s, s3 = s2 * s;
    return {
      x: (2 * s3 - 3 * s2 + 1) * x0 + (s3 - 2 * s2 + s) * h * v0 + (-2 * s3 + 3 * s2) * x1 + (s3 - s2) * h * v1,
      v: ((6 * s2 - 6 * s) * x0 + (3 * s2 - 4 * s + 1) * h * v0 + (-6 * s2 + 6 * s) * x1 + (3 * s2 - 2 * s) * h * v1) / h,
    };
  }
  const [t1, x1, v1] = keys[n - 1]; return { x: x1 + v1 * (t - t1), v: v1 };
}

function hops(t, jumps) {
  const out = { dy: 0, vy: 0, air: false, sq: 0, phase: 'ground', k: 0, landAge: Infinity };
  for (const j of jumps) {
    const { t0, t1, h, crouch = .14, land = .45, amt = 1 } = j, d = t1 - t0;
    if (t >= t0 - crouch && t < t0) { out.sq += .26 * amt * ease(seg(t, t0 - crouch, t0)); out.phase = 'crouch'; }
    else if (t >= t0 && t <= t1) {
      const k = (t - t0) / d;
      out.dy -= 4 * h * k * (1 - k); out.vy -= 4 * h * (1 - 2 * k) / d; out.air = true; out.phase = 'air'; out.k = k;
      out.sq -= .24 * amt * Math.pow(Math.abs(1 - 2 * k), 1.5);                 // stretched while fast, round at the top
    } else if (t > t1 && t < t1 + land) {
      const a = t - t1; out.sq += .34 * amt * Math.exp(-8 * a) * Math.cos(20 * a); out.phase = 'land'; out.landAge = Math.min(out.landAge, a);
    }
  }
  return out;
}

function footfalls(keys, stride, t0, t1, jumps = [], dt = 1 / 240) {
  const out = []; let last = Math.floor(travel(t0, keys).x / stride);
  for (let t = t0; t <= t1; t += dt) {
    const s = Math.floor(travel(t, keys).x / stride), air = jumps.some(j => t >= j.t0 - .05 && t <= j.t1 + .05);
    if (s !== last && !air && Math.abs(travel(t, keys).v) > 30) out.push(t);
    last = s;
  }
  return out;
}

function makePath(points, n = 10) {
  const C = through(points, n), L = [0];
  for (let i = 1; i < C.length; i++) L.push(L[i - 1] + Math.hypot(C[i][0] - C[i - 1][0], C[i][1] - C[i - 1][1]));
  const len = L[L.length - 1];
  return {
    len,
    at(u) {   // u 0..1 along the length → { x, y, a (tangent angle) }
      const d = clamp(u) * len; let i = 1; while (i < L.length - 1 && L[i] < d) i++;
      const f = (d - L[i - 1]) / ((L[i] - L[i - 1]) || 1), p = C[i - 1], q = C[i];
      return { x: lerp(p[0], q[0], f), y: lerp(p[1], q[1], f), a: Math.atan2(q[1] - p[1], q[0] - p[0]) };
    },
  };
}
const follow = (t, path, t0, t1, e = ease) => path.at(e(seg(t, t0, t1)));
const ballistic = (t, t0, [x, y], [vx, vy], g = 1800) => { const a = Math.max(0, t - t0); return [x + vx * a, y + vy * a + .5 * g * a * a]; };
const velocity = (fn, t, dt = 1 / 48) => { const a = fn(t - dt), b = fn(t + dt); return [(b[0] - a[0]) / (2 * dt), (b[1] - a[1]) / (2 * dt)]; };
