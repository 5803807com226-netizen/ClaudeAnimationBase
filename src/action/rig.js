// action/rig.js: REFERENCE-DRIVEN CHARACTER RIG. One flat character image + an editable rig spec (char_rig/1, made by
// tools/action/rig_analyze.py, corrected in AutoCinematic's rig editor) becomes an articulated character:
//   - the image is split into body REGIONS (chains: body, arm_f, arm_b, leg_f, leg_b …) by each bone's capsule; where
//     capsules overlap, the chain drawn in front (higher z) keeps the pixel, as in the reference itself;
//   - Mode A 'texture': each chain is a deformable triangle MESH over the original pixels, linear-blend skinned to its
//     bones (soft weights within a chain, so elbows and knees bend instead of hinging); chains are drawn in z order;
//   - Mode B 'points': colored points sampled from the same image, with the same region, bone weights and local
//     offsets, following the same skeleton. Density and point size are settings. Both modes use one skeleton and one
//     pose, so every motion preset drives both.
// Poses are canonical: the character faces +x; each bone's angle is relative to its parent, measured from a NEUTRAL
// stance (spine and head up, arms and legs straight down, feet forward). A pose { bone: delta (radians) } adds to that.
// Facing left is a mirror (a flat image has no other side: a labelled fallback).
//   const C = await loadCharacter(rigSpec, imageUrl)            (PRELOAD: see action/play.js)
//   const S = solveSkeleton(C, root, pose, ik)                   world joints and bone angles, in frame px
//   drawActor(C, S, { mode: 'texture' | 'points', alpha, tint })   drawRigOverlay(C, S)
const ACT_NEUTRAL = { spine: -Math.PI / 2, neck: -Math.PI / 2, head: -Math.PI / 2, upperarm: Math.PI / 2, forearm: Math.PI / 2, hand: Math.PI / 2,
  thigh: Math.PI / 2, shin: Math.PI / 2, foot: 0, tail: Math.PI, leg: Math.PI / 2, body: -Math.PI / 2 };
const actKind = name => name.replace(/_(f|b|ff|fb|hf|hb)$/, '');
const angNorm = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const cpuCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d', { willReadFrequently: true })]; };

// ---------- loading: skeleton, regions, mesh, points ----------
async function loadCharacter(spec, url, opt = {}) {
  const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('could not load ' + url)); i.src = url; });
  const [cv, cx] = cpuCanvas(img.width, img.height); cx.drawImage(img, 0, 0);
  const mirror = spec.facing === 'left';   // normalise: the rig always faces +x
  if (mirror) { cx.setTransform(-1, 0, 0, 1, img.width, 0); cx.clearRect(0, 0, img.width, img.height); cx.drawImage(img, 0, 0); cx.setTransform(1, 0, 0, 1, 0, 0); }
  const W = img.width, H = img.height, px = cx.getImageData(0, 0, W, H).data;
  const J = {}; for (const [k, j] of Object.entries(spec.joints)) J[k] = [mirror ? W - j.x : j.x, j.y];
  // bones: bind (image) angle and length, canonical neutral angle, parent offsets
  const bones = spec.bones.map(b => ({ ...b, a: J[b.from], b: J[b.to] }));
  const byName = Object.fromEntries(bones.map(b => [b.name, b]));
  const root = spec.joints.hips ? J.hips : J[bones[0].from];
  for (const b of bones) {
    b.len = Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]) || 1; b.bind = Math.atan2(b.b[1] - b.a[1], b.b[0] - b.a[0]);
    b.neutral = ACT_NEUTRAL[b.name] ?? ACT_NEUTRAL[actKind(b.name)] ?? b.bind;
    const P = b.parent ? byName[b.parent] : null;
    b.neutralLocal = b.neutral - (P ? (ACT_NEUTRAL[P.name] ?? ACT_NEUTRAL[actKind(P.name)] ?? P.bind) : 0);
    // where this bone starts, in its parent's frame (along / across the parent, in bind pixels); roots: from the hips
    const o = P ? P.a : root, ref = P ? P.bind : 0, dx = b.a[0] - o[0], dy = b.a[1] - o[1];
    b.off = [dx * Math.cos(-ref) - dy * Math.sin(-ref), dx * Math.sin(-ref) + dy * Math.cos(-ref)];
    b.kids = [];
  }
  for (const b of bones) if (b.parent) byName[b.parent].kids.push(b);
  // the neutral pose re-poses the parent frames; keep each child's attachment where the bind image has it, relative
  // to the parent's direction (a shoulder stays at the side of the chest whichever way the spine points)
  const order = []; const visit = b => { order.push(b); b.kids.forEach(visit); }; bones.filter(b => !b.parent).forEach(visit);
  // ---- regions: each opaque pixel → the bone whose capsule claims it (front chains win overlaps) ----
  const zOf = Object.fromEntries(bones.map(b => [b.name, b.z ?? 50]));
  const lab = new Int16Array(W * H).fill(-1), nearLab = new Int16Array(W * H).fill(-1), segT = (x, y, b) => ((x - b.a[0]) * (b.b[0] - b.a[0]) + (y - b.a[1]) * (b.b[1] - b.a[1])) / (b.len * b.len), segD = (x, y, b) => {
    const vx = b.b[0] - b.a[0], vy = b.b[1] - b.a[1], t = clamp(segT(x, y, b));
    return Math.hypot(x - b.a[0] - vx * t, y - b.a[1] - vy * t);
  };
  // the body's root bone (the spine) does not claim pixels beyond its own root: below the hips they belong to the legs
  const claimD = (x, y, b) => { const d = segD(x, y, b); return !b.parent && b.chain === 'body' && segT(x, y, b) < 0 ? d * 2.2 : d; };
  const margin = opt.capsule ?? 1.3, marginOf = b => b.chain === 'body' ? Math.min(margin, 1.1) : margin;   // the trunk's capsule is drawn tight
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (px[(y * W + x) * 4 + 3] < 8) continue;
    let best = -1, bz = -1e9, bn = 1e9, near = -1, nd = 1e9;
    bones.forEach((b, i) => {
      const dn = claimD(x, y, b) / Math.max(4, b.radius || 20);
      if (dn < nd) { nd = dn; near = i; }
      if (dn <= marginOf(b) && (zOf[b.name] > bz || (zOf[b.name] === bz && dn < bn))) { best = i; bz = zOf[b.name]; bn = dn; }
    });
    lab[y * W + x] = best >= 0 ? best : near; nearLab[y * W + x] = near;
  }
  refineRegions(lab, nearLab, px, W, H, bones, opt, segD);
  const chains = [...new Set(bones.map(b => b.chain))].map(name => ({ name, bones: bones.filter(b => b.chain === name), z: Math.max(...bones.filter(b => b.chain === name).map(b => b.z ?? 50)) }))
    .sort((a, b) => a.z - b.z);
  const chainOf = bones.map(b => chains.findIndex(c => c.name === b.chain));
  // skin weights of a point among its chain's bones: the nearest bone owns it outright; only where two bones are about
  // equally near (the zone around a joint, about a third of the limb's radius wide) do they blend. Wide blends would
  // smear a bent elbow into a stretched wedge.
  const weights = (x, y, ch) => {
    const d = ch.bones.map(b => segD(x, y, b)), m = Math.min(...d), near = ch.bones[d.indexOf(m)], sg = Math.max(3, (near.radius || 20) * .33);
    const w = d.map(v => Math.exp(-Math.pow((v - m) / sg, 2))), s = w.reduce((a, v) => a + v, 0);
    return ch.bones.map((b, i) => [bones.indexOf(b), w[i] / s]).filter(v => v[1] > .02);
  };
  // ---- Mode A: a mesh per chain over the pixels its region owns ----
  const g = opt.grid ?? Math.max(6, Math.round(Math.max(W, H) / 110));
  for (const [ci, ch] of chains.entries()) {
    const [tc, tx] = cpuCanvas(W, H), out = tx.createImageData(W, H);
    let own = 0;
    for (let i = 0; i < W * H; i++) if (lab[i] >= 0 && chainOf[lab[i]] === ci) { for (let k = 0; k < 4; k++) out.data[i * 4 + k] = px[i * 4 + k]; own++; }
    tx.putImageData(out, 0, 0); ch.pixels = own;
    const tex = createImage(W, H); tex.drawingContext.drawImage(tc, 0, 0); tex.setModified?.(true); ch.tex = tex;
    // grid cells that hold any of this chain's pixels (a one-cell margin keeps anti-aliased edges)
    const gw = Math.ceil(W / g), gh = Math.ceil(H / g), cell = new Uint8Array(gw * gh);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (lab[i] >= 0 && chainOf[lab[i]] === ci) cell[Math.floor(y / g) * gw + Math.floor(x / g)] = 1; }
    const vid = new Map(), verts = [], tris = [];
    const V = (gx, gy) => { const k = gy * (gw + 1) + gx; if (!vid.has(k)) { const x = Math.min(W, gx * g), y = Math.min(H, gy * g); vid.set(k, verts.length); verts.push({ x, y, u: x / W, v: y / H, w: weights(x, y, ch) }); } return vid.get(k); };
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
      let on = cell[gy * gw + gx]; if (!on) for (let dy = -1; dy <= 1 && !on; dy++) for (let dx = -1; dx <= 1 && !on; dx++) { const X = gx + dx, Y = gy + dy; if (X >= 0 && Y >= 0 && X < gw && Y < gh && cell[Y * gw + X]) on = 2; }
      if (!on) continue;
      const a = V(gx, gy), b = V(gx + 1, gy), c = V(gx + 1, gy + 1), d = V(gx, gy + 1); tris.push(a, b, c, a, c, d);
    }
    ch.verts = verts; ch.tris = tris;
  }
  // ---- Mode B: colored points (position, RGBA, region, bone weights) ----
  const makePoints = (step) => {
    const pts = [];
    for (let y = Math.floor(step / 2); y < H; y += step) for (let x = Math.floor(step / 2); x < W; x += step) {
      const i = y * W + x; if (lab[i] < 0 || px[i * 4 + 3] < 40) continue;
      const ci = chainOf[lab[i]]; pts.push({ x, y, c: [px[i * 4], px[i * 4 + 1], px[i * 4 + 2], px[i * 4 + 3]], chain: ci, w: weights(x, y, chains[ci]) });
    }
    return pts;
  };
  const ys = []; for (const k of Object.keys(J)) ys.push(J[k][1]);
  const bbox = spec.bbox || [0, 0, W, H];
  return { spec, url, W, H, J, root, bones, byName, order, chains, lab, g, makePoints, points: {}, mirror, height: bbox[3] - bbox[1],
    groundY: Math.max(...['toe_f', 'toe_b', 'ankle_f', 'ankle_b'].filter(k => J[k]).map(k => J[k][1]), bbox[3]) };
}

// Cartoon art is made of fills bounded by ink lines; a fill belongs wholly to one body part. Each ink-bounded region
// takes the bone that claims most of its pixels (a shoulder cap peeking past the trunk goes with its arm, not the
// trunk); ink pixels then follow the region around them. Regions without a clear majority, very large regions and
// art without outlines keep the per-pixel capsule split. (Colour is never read as anatomy: the bones still decide.)
// Each region votes with the bone NEAREST its pixels (normalised by the bone's radius), not the one drawn in front: a
// back sleeve that pokes out past the trunk is nearest its arm; the trunk's fill is nearest the spine. Draw order
// (lab) is kept only for pixels that no clear region owns (art without outlines, very large fills).
function refineRegions(lab, nearLab, px, W, H, bones, opt = {}, segD) {
  // a fill naturally spans several bones of ONE limb (sleeve, forearm, hand): regions vote for a chain, and inside the
  // winning chain each pixel goes to its nearest bone
  const N = W * H, isInk = new Uint8Array(N), solid = i => px[i * 4 + 3] > 8;
  for (let i = 0; i < N; i++) if (px[i * 4 + 3] > 40 && .3 * px[i * 4] + .59 * px[i * 4 + 1] + .11 * px[i * 4 + 2] < (opt.ink ?? 80)) isInk[i] = 1;
  // seal the lines: anti-aliased edges are lighter than the ink and would let neighbouring fills leak into each other
  const dil = isInk.slice(); for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; if (isInk[i]) { dil[i - 1] = dil[i + 1] = dil[i - W] = dil[i + W] = 1; } }
  isInk.set(dil);
  const parent = new Int32Array(N).map((_, i) => i), find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const join = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (!solid(i) || isInk[i] || lab[i] < 0) continue;
    if (x > 0 && solid(i - 1) && !isInk[i - 1] && lab[i - 1] >= 0) join(i, i - 1);
    if (y > 0 && solid(i - W) && !isInk[i - W] && lab[i - W] >= 0) join(i, i - W);
  }
  const votes = new Map(); let total = 0;
  const chainOf = b => bones[b].chain, chainBones = {}; bones.forEach((b, i) => (chainBones[b.chain] ??= []).push(i));
  for (let i = 0; i < N; i++) { if (lab[i] < 0 || isInk[i]) continue; total++; const r = find(i); let v = votes.get(r); if (!v) votes.set(r, v = new Map()); const c = chainOf(nearLab[i]); v.set(c, (v.get(c) || 0) + 1); }
  const owner = new Map();
  for (const [r, v] of votes) {
    let n = 0, best = null, bn = 0; for (const [l, c] of v) { n += c; if (c > bn) { bn = c; best = l; } }
    if (n < total * .6 && bn / n >= .55) owner.set(r, best);   // a fill over 60 % of the figure means the art has no outlines to trust
  }
  const nearestIn = (x, y, chain) => { let best = -1, bd = 1e9; for (const bi of chainBones[chain]) { const d = segD(x, y, bones[bi]) / Math.max(4, bones[bi].radius || 20); if (d < bd) { bd = d; best = bi; } } return best; };
  for (let i = 0; i < N; i++) if (lab[i] >= 0 && !isInk[i]) { const o = owner.get(find(i)); if (o != null && chainOf(lab[i]) !== o) lab[i] = nearestIn(i % W, (i / W) | 0, o); }
  // ink pixels: an outline belongs to the NEAREST fill (a shared, doubled line splits down the middle, so each shape
  // keeps its own edge); with no fill within 6 px the capsule's choice stays
  const out = lab.slice();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (!isInk[i] || lab[i] < 0) continue;
    let best = -1, bd = 1e9;
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) { const d = dx * dx + dy * dy; if (d >= bd) continue; const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const j = Y * W + X; if (isInk[j] || lab[j] < 0 || !solid(j)) continue; bd = d; best = lab[j]; }
    if (best >= 0) out[i] = best;
  }
  lab.set(out);
}

// ---------- the skeleton ----------
// root: { x, y (frame px of the hips), rot, s (frame px per image px), sx, sy (squash), flip (−1 faces left) }
// pose: { bone: delta } · ik: { boneName (the upper bone): { target: [x, y], mid, end, w, bend: ±1, endAngle } }
function solveSkeleton(C, root, pose = {}, ik = {}) {
  const S = { world: {}, ang: {}, root, s: root.s };
  const toWorld = (x, y) => [root.x + root.flip * x * root.s * (root.sx ?? 1), root.y + y * root.s * (root.sy ?? 1)];   // a hips-relative canonical point → frame px
  const R = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
  // canonical (unflipped, unscaled) joint positions relative to the hips
  const P = {}, A = {};
  for (const b of C.order) {
    const par = b.parent ? C.byName[b.parent] : null;
    const pa = par ? A[par.name] : (root.rot || 0);
    const start = par ? (() => { const o = R(b.off, pa); return [P[par.name][0] + o[0], P[par.name][1] + o[1]]; })() : R(b.off, root.rot || 0);
    A[b.name] = (par ? pa : (root.rot || 0)) + b.neutralLocal + (pose[b.name] || 0) + (par ? 0 : 0);
    P[b.name] = start;
  }
  // two-bone IK (in canonical space): upper bone → mid bone → end bone, the end bone's tip-to-start meets the target
  for (const [up, k] of Object.entries(ik)) {
    if (!k || !(k.w > 0) || !C.byName[up] || !C.byName[k.mid]) continue;
    const U = C.byName[up], M = C.byName[k.mid], s0 = P[up];
    let T = [(k.target[0] - root.x) / (root.flip * root.s * (root.sx ?? 1)), (k.target[1] - root.y) / (root.s * (root.sy ?? 1))];   // frame → canonical
    if (k.endOffset) T = [T[0] - k.endOffset[0], T[1] - k.endOffset[1]];
    // a partial weight blends the TARGET from where the limb's end is without IK, then solves fully: blending the
    // angles instead can swing a limb the long way round when the two poses are nearly opposite
    const wIK = k.w;
    if (wIK < 1) { const me = [P[k.mid][0] + Math.cos(A[k.mid]) * M.len, P[k.mid][1] + Math.sin(A[k.mid]) * M.len]; T = [me[0] + (T[0] - me[0]) * wIK, me[1] + (T[1] - me[1]) * wIK]; }
    const l1 = U.len, l2 = M.len, dx = T[0] - s0[0], dy = T[1] - s0[1];
    const d = clamp(Math.hypot(dx, dy), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3), base = Math.atan2(dy, dx);
    const c1 = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1), bend = k.bend ?? 1;   // +1 bends to +x (knees), -1 to -x (elbows)
    const a1 = base - bend * Math.acos(c1), e = [s0[0] + Math.cos(a1) * l1, s0[1] + Math.sin(a1) * l1], a2 = Math.atan2(T[1] - e[1], T[0] - e[0]);
    A[up] = a1; A[k.mid] = a2;
    if (k.endAngle != null && k.end && C.byName[k.end]) A[k.end] = A[k.end] + angNorm(k.endAngle - A[k.end]) * wIK;
    // re-place the subtree below the upper bone with the new angles
    const replace = (b) => {
      for (const c of b.kids) {
        if (!(k.end && c.name === k.end) && c.name !== k.mid) A[c.name] = A[b.name] + c.neutralLocal + (pose[c.name] || 0);
        const o = R(c.off, A[b.name]); P[c.name] = [P[b.name][0] + o[0], P[b.name][1] + o[1]]; replace(c);
      }
    };
    // the mid bone keeps its IK angle; the end bone follows the mid unless it has its own endAngle
    const keepEnd = k.endAngle != null;
    const saved = { [k.mid]: A[k.mid], ...(keepEnd ? { [k.end]: A[k.end] } : {}) };
    const replace2 = (b) => { for (const c of b.kids) { A[c.name] = saved[c.name] ?? (A[b.name] + c.neutralLocal + (pose[c.name] || 0)); const o = R(c.off, A[b.name]); P[c.name] = [P[b.name][0] + o[0], P[b.name][1] + o[1]]; replace2(c); } };
    replace2(U);
  }
  // world: flip + scale + translate
  for (const b of C.bones) {
    const st = P[b.name], a = A[b.name], en = [st[0] + Math.cos(a) * b.len, st[1] + Math.sin(a) * b.len];
    S.world[b.name] = { a: toWorld(...st), b: toWorld(...en), ang: root.flip < 0 ? Math.PI - a : a, canon: a, start: st, end: en };
    S.ang[b.name] = a;
  }
  S.toWorld = toWorld; S.P = P; S.A = A;
  return S;
}
// a point in a bone's local frame (image px along / across the bone, from its start) → frame px
function bonePoint(C, S, bone, along, across = 0) {
  const W = S.world[bone], b = C.byName[bone], a = W.canon, st = W.start;
  return S.toWorld(st[0] + Math.cos(a) * along - Math.sin(a) * across, st[1] + Math.sin(a) * along + Math.cos(a) * across);
}

// ---------- drawing ----------
// skinned position of a bind-image point with weights w: Σ w · (joint + R(angle − bind) · (p − bindJoint)), canonical
function skinPoint(C, S, x, y, w) {
  let X = 0, Y = 0;
  for (const [bi, k] of w) {
    const b = C.bones[bi], st = S.P[b.name], d = S.A[b.name] - b.bind, c = Math.cos(d), s = Math.sin(d), ox = x - b.a[0], oy = y - b.a[1];
    X += k * (st[0] + ox * c - oy * s); Y += k * (st[1] + ox * s + oy * c);
  }
  return S.toWorld(X, Y);
}
// draw order: the chains by z, with `between` callbacks slotted in at a z (a held prop between the body and the front arm)
function drawActor(C, S, o = {}) {
  const mode = o.mode || 'texture', slots = (o.between || []).slice().sort((a, b) => a.z - b.z); let si = 0;
  const flushSlots = z => { while (si < slots.length && slots[si].z <= z) slots[si++].draw(); };
  if (mode === 'points') return drawPoints(C, S, o, flushSlots, slots, () => si);
  flushBrush(); push(); noStroke(); textureMode(NORMAL);
  if (o.alpha != null && o.alpha < 1) tint(255, 255 * o.alpha);
  for (const ch of C.chains) {
    flushSlots(ch.z - .5);
    const P = ch.verts.map(v => skinPoint(C, S, v.x, v.y, v.w));
    if (o.regions) { const hue = { body: [255, 90, 90], arm_f: [70, 160, 255], arm_b: [40, 200, 120], leg_f: [250, 200, 40], leg_b: [190, 90, 230] }[ch.name] || [200, 200, 200]; tint(...hue, 255); }   // ?regions=1: which region owns which pixels
    texture(ch.tex); beginShape(TRIANGLES);
    for (const i of ch.tris) { const v = ch.verts[i], p = P[i]; vertex(p[0], p[1], 0, v.u, v.v); }
    endShape();
  }
  pop(); flushSlots(1e9);
}
let ACT_PT = null;
function drawPoints(C, S, o, flushSlots) {
  const step = Math.max(2, Math.round(o.density ?? 6)), key = 's' + step;
  const pts = C.points[key] ??= C.makePoints(step);
  if (!ACT_PT || ACT_PT[0].width !== W || ACT_PT[0].height !== H) ACT_PT = cpuCanvas(W, H);
  const [cv, c] = ACT_PT, r = Math.max(1, (o.size ?? 1) * step * S.s * .62), sh = o.shape || 'circle';
  for (const ch of C.chains.map((_, i) => i)) {
    flushSlots(C.chains[ch].z - .5);
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H); c.globalAlpha = o.alpha ?? 1; c.translate(-(o.camX || 0), 0);   // the points layer is screen space: apply the camera
    for (const p of pts) {
      if (p.chain !== ch) continue;
      const q = skinPoint(C, S, p.x, p.y, p.w);
      c.fillStyle = `rgba(${p.c[0]},${p.c[1]},${p.c[2]},${p.c[3] / 255})`;
      if (sh === 'square') c.fillRect(q[0] - r, q[1] - r, 2 * r, 2 * r); else { c.beginPath(); c.arc(q[0], q[1], r, 0, TAU); c.fill(); }
    }
    const im = createImage(W, H); im.drawingContext.drawImage(cv, 0, 0); im.setModified?.(true);
    flushBrush(); push(); resetMatrix(); translate(-W / 2, -H / 2); image(im, 0, 0); pop();
  }
  flushSlots(1e9);
}
// bones as lines, joints as dots coloured by confidence (green detected, orange estimated, red uncertain), names
function drawRigOverlay(C, S, o = {}) {
  flushBrush(); push(); strokeCap(ROUND);
  for (const b of C.bones) { const w = S.world[b.name]; stroke(40, 70, 220, 220); strokeWeight(Math.max(2, 3 * S.s)); line(w.a[0], w.a[1], w.b[0], w.b[1]); }
  const col = { detected: [30, 170, 60], estimated: [240, 140, 20], uncertain: [220, 30, 30] };
  const seen = new Set();
  for (const b of C.bones) for (const [jn, p] of [[b.from, S.world[b.name].a], [b.to, S.world[b.name].b]]) {
    if (seen.has(jn)) continue; seen.add(jn);
    const c = col[C.spec.joints[jn]?.confidence] || [120, 120, 120];
    noStroke(); fill(255); circle(p[0], p[1], 15 * Math.max(.6, S.s)); fill(...c); circle(p[0], p[1], 10 * Math.max(.6, S.s));
  }
  pop();
}
