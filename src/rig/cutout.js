// rig/cutout.js: cutout characters. A character is a tree of parts (torso, neck, head, face features, arms, hair),
// each drawn at a joint on its parent, by a painter function (code-drawn) or a transparent PNG layer (artwork).
// The same rig, poses and IK animate both, so a story can start code-drawn and swap in artwork part by part.
// See docs/CHARACTER_ASSETS.md for the artwork spec.
//
//   const ME = defineCharacter({ id, parts: [...], lag });
//   const T = drawCharacter(ME, x, y, u, poseFn, t);    // (x, y) = the root joint in world space, u = size unit (px)
//
// Part: { name, parent, joint: [x, y] in the parent's units and local space, z: draw order,
//         draw(u, pose, ch)  or  img: { src: 'path.png' | { key: 'path.png', ... }, pick: pose => key, w, h, anchor: [ax, ay] } (units),
//         drag: k  (follow-through: the part trails its parent's rotation by ch.lag seconds, scaled by k) }
// poseFn(t) returns { [part]: { rot, s, sx, sy, dx, dy, hide, worldRot, worldK, ik }, ...anything painters read }:
//   rot: radians relative to the parent · s: uniform scale, inherited · sx, sy: this part only · dx, dy: joint offset (units)
//   z: draw order for this frame (swap an arm from behind the body to in front of it mid-move)
//   worldRot (+ worldK 0..1): blend the part toward an absolute angle (a hand flat on a cheek, whatever the arm does)
//   ik: { lower, end, target: [x, y] or T => [x, y] (world), k 0..1, bend: ±1 } on an upper bone: two-bone IK
//       (upper → lower → end), blended with the posed rotations by k. Rotations blend the short way round.
// The pose is a function of time, so drag can sample it in the past: no state, safe for parallel rendering.

const RIG_IMAGES = {};
function defineCharacter(spec) {
  const parts = spec.parts.map(p => ({ ...p }));
  for (const p of parts) p.kids = parts.filter(q => q.parent === p.name);
  const srcs = [];
  for (const p of parts) if (p.img) srcs.push(...(typeof p.img.src === 'string' ? [p.img.src] : Object.values(p.img.src)));
  // A page opened straight from disk (file://) may refuse to load images: warn and draw without them rather than hang.
  // Preview PNG characters through a local server (e.g. npx http-server) or render.mjs, which allows file access.
  if (srcs.length) (window.PRELOAD = window.PRELOAD || []).push(async () => {
    for (const s of srcs) if (!RIG_IMAGES[s]) try { RIG_IMAGES[s] = await loadImage(s); } catch (e) { console.warn('cutout rig: could not load ' + s + ' (serve the page over http to preview PNG layers)'); }
  });
  return { lag: .12, ...spec, parts, roots: parts.filter(p => !p.parent) };
}

const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const lerpAng = (a, b, k) => a + angDiff(a, b) * k;

// World transforms { x, y, a, s } of every part for one pose.
function rigSolve(ch, x, y, u, pose) {
  const T = {};
  const place = (p, P) => {
    const q = pose[p.name] || {}, j = p.joint || [0, 0];
    let X;
    if (!P) X = { x: x + (q.dx || 0) * u, y: y + (q.dy || 0) * u, a: 0, s: 1 };
    else {
      const jx = (j[0] + (q.dx || 0)) * u * P.s, jy = (j[1] + (q.dy || 0)) * u * P.s, c = Math.cos(P.a), s = Math.sin(P.a);
      X = { x: P.x + jx * c - jy * s, y: P.y + jx * s + jy * c, a: P.a, s: P.s };
    }
    let rot = q.rot || 0;
    if (q.worldRot != null) rot = lerpAng(rot, q.worldRot - X.a, q.worldK ?? 1);
    X.a += rot; X.s *= q.s ?? 1; T[p.name] = X;
    p.kids.forEach(k => place(k, X));
  };
  ch.roots.forEach(r => place(r, null));
  return T;
}
// A point given in a part's local units, in world space.
function rigPoint(T, part, [px, py], u) {
  const X = T[part], c = Math.cos(X.a), s = Math.sin(X.a), x = px * u * X.s, y = py * u * X.s;
  return [X.x + x * c - y * s, X.y + x * s + y * c];
}
// Two-bone IK: world angles of the upper and lower bones reaching from (sx, sy) toward (tx, ty).
function ik2(sx, sy, tx, ty, L1, L2, bend = 1) {
  const dx = tx - sx, dy = ty - sy, d = clamp(Math.hypot(dx, dy), Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
  const a = Math.atan2(dy, dx), b = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1)), a1 = a + bend * b;
  const ex = sx + Math.cos(a1) * L1, ey = sy + Math.sin(a1) * L1;
  return [a1, Math.atan2(ty - ey, tx - ex)];
}

function rigPose(ch, x, y, u, poseFn, t) {
  const pose = poseFn(t);
  for (const k in pose) if (pose[k] && typeof pose[k] === 'object' && !Array.isArray(pose[k])) pose[k] = { ...pose[k] };
  let T = rigSolve(ch, x, y, u, pose);
  for (const p of ch.parts) {            // IK chains, blended over the posed (FK) rotations
    const ik = pose[p.name]?.ik; if (!ik || !(ik.k > 0)) continue;
    const lo = ch.parts.find(q => q.name === ik.lower), end = ch.parts.find(q => q.name === ik.end);
    const S = T[p.name], L1 = Math.hypot(...lo.joint) * u * S.s, L2 = Math.hypot(...end.joint) * u * S.s;
    const tg = typeof ik.target === 'function' ? ik.target(T) : ik.target, [a1, a2] = ik2(S.x, S.y, tg[0], tg[1], L1, L2, ik.bend ?? 1);
    const parentA = S.a - (pose[p.name].rot || 0), d1 = Math.atan2(lo.joint[1], lo.joint[0]), d2 = Math.atan2(end.joint[1], end.joint[0]);
    const up = pose[p.name], low = pose[ik.lower] = { ...(pose[ik.lower] || {}) };
    const r1 = a1 - d1 - parentA, r2 = a2 - d2 - (a1 - d1);   // the lower bone turns relative to the upper bone's FRAME (a1 - d1), not its bone line
    up.rot = lerpAng(up.rot || 0, r1, clamp(ik.k)); low.rot = lerpAng(low.rot || 0, r2, clamp(ik.k));
    T = rigSolve(ch, x, y, u, pose);
  }
  return { pose, T };
}

function drawCharacter(ch, x, y, u, poseFn, t) {
  const { pose, T: T0 } = rigPose(ch, x, y, u, poseFn, t);
  let T = T0;
  if (ch.parts.some(p => p.drag)) {      // follow-through: dragging parts trail their parent's swing
    const { T: Tp } = rigPose(ch, x, y, u, poseFn, t - ch.lag);
    for (const p of ch.parts) if (p.drag && p.parent) {
      const q = pose[p.name] = { ...(pose[p.name] || {}) };
      q.rot = (q.rot || 0) + p.drag * angDiff(T[p.parent].a, Tp[p.parent].a);
    }
    T = rigSolve(ch, x, y, u, pose);
  }
  const zOf = p => pose[p.name]?.z ?? p.z ?? 0;
  for (const p of ch.parts.slice().sort((a, b) => zOf(a) - zOf(b))) {
    const q = pose[p.name] || {}, X = T[p.name]; if (q.hide) continue;
    boilSeed('rig|' + (ch.id || '') + '|' + p.name);
    push(); translate(X.x, X.y); rotate(X.a); scale(X.s * (q.sx ?? 1), X.s * (q.sy ?? 1));
    if (p.img) {
      const im = RIG_IMAGES[typeof p.img.src === 'string' ? p.img.src : p.img.src[p.img.pick(pose)]];
      if (im) { flushBrush(); rotate(jit(p.img.boil ?? .004)); image(im, -p.img.anchor[0] * u, -p.img.anchor[1] * u, p.img.w * u, p.img.h * u); }
    } else p.draw(u, pose, ch);
    pop();
  }
  return T;
}

// ---------- acting helpers (pure functions of t) ----------
// Eye/head aim: where (tx, ty) is from (fx, fy), as lookX, lookY in -1..1.
const lookAt = (fx, fy, tx, ty, rx = 420, ry = 320) => [clamp((tx - fx) / rx, -1, 1), clamp((ty - fy) / ry, -1, 1)];
// Saccades: list = [[t0, point or t => point], ...]. The eyes snap (in `dur`) from one target to the next; targets may move.
function saccade(t, list, dur = .09) {
  let i = 0; while (i + 1 < list.length && t >= list[i + 1][0]) i++;
  const at = (j) => typeof list[j][1] === 'function' ? list[j][1](t) : list[j][1], cur = at(i);
  if (!i) return cur;
  const k = easeOut(seg(t, list[i][0], list[i][0] + dur)), prev = at(i - 1);
  return [lerp(prev[0], cur[0], k), lerp(prev[1], cur[1], k)];
}
// Blinks at the given times: 0 open → 1 shut → 0, over d seconds each.
const blinkAt = (t, times, d = .14) => times.reduce((m, c) => Math.max(m, ease(1 - Math.abs(t - c) / (d / 2))), 0);
// A quick in-and-out bump over [a, b] (a breath, a shrug): 0 → 1 → 0.
const bump = (t, a, b) => Math.sin(Math.PI * seg(t, a, b));
