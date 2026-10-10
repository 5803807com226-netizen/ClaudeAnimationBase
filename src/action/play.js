// action/play.js: plays an ACTION SCENE: a validated Motion Plan (tools/action/plan.mjs → src/stories/_act_<id>/scene.js
// sets ACTION_SCENE = { plan, characters: { id: { rig, image } }, props: { id: { spec, image } } } and calls playAction).
// Per frame: compose (composer.js) → solve every skeleton (rig.js: FK, leg IK, look) → place props (world / hand /
// aimed) → solve the hands onto the prop grips (IK) → draw back to front with the props slotted between the chains →
// effects (muzzle flash and bolt at the prop's muzzle anchor, landing dust at the feet, motion trails) → rig overlay.
// Page options: ?mode=points (Mode B colored points) ?overlay=1 (rig overlay) ?density=6 ?psize=1.
// window.ACTION_DEBUG.frame(t) gives the solved state (joints, grips, muzzle, feet) for tools/action/verify.mjs.
const ACT_Q = new URLSearchParams(location.search);
function playAction(SC) {
  const plan = SC.plan, CH = {}, PR = {};
  let CP = null;
  (window.PRELOAD = window.PRELOAD || []).push(async () => {
    for (const [id, c] of Object.entries(SC.characters)) CH[id] = await loadCharacter(c.rig, c.image, { grid: c.grid });
    for (const [id, p] of Object.entries(SC.props || {})) PR[id] = await loadProp(p.spec, p.image);
    CP = buildComposer(plan, CH, PR);
  });
  const opt = { mode: ACT_Q.get('mode') || plan.render?.mode || 'texture', overlay: ACT_Q.has('overlay') || !!plan.render?.overlay,
    density: +(ACT_Q.get('density') || plan.render?.points?.density || 6), size: +(ACT_Q.get('psize') || plan.render?.points?.size || 1) };
  const memo = new Map();
  const frameAt = t => { const k = Math.round(t * 2400); if (!memo.has(k)) { if (memo.size > 4000) memo.clear(); memo.set(k, solveFrame(CP, plan, t)); } return memo.get(k); };
  window.ACTION_DEBUG = { frame: t => CP && summarize(frameAt(t)), plan, ready: () => !!CP, chars: CH };
  const fxList = () => CP.fx ??= scheduleFx(CP, plan, frameAt);
  shots([[0, (t) => {
    if (!CP) return;
    const F = frameAt(t), cam = cameraAt(plan, t, frameAt);
    drawBackdrop(plan, cam);
    push(); translate(-cam.x, 0);
    // motion trails (ghosts of the last moments, faded)
    const trail = plan.actions.find(a => (a.type === 'motion_trail') && t >= a.start && t <= a.start + a.duration);
    if (trail) for (let i = (trail.ghosts ?? trail.params?.ghosts ?? 3); i >= 1; i--) drawFrame(frameAt(Math.max(0, t - i * (trail.gap ?? .035))), { ...opt, camX: cam.x, alpha: .22 / i, overlay: false, ghost: true });
    drawShadows(F, plan);
    drawFrame(F, { ...opt, camX: cam.x });
    drawFx(fxList(), t, frameAt, plan);
    if (opt.overlay) for (const c of Object.values(F.chars)) drawRigOverlay(c.C, c.S);
    pop();
  }]]);
}

async function loadProp(spec, url) {
  const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('could not load ' + url)); i.src = url; });
  const [cv, cx] = cpuCanvas(img.width, img.height); cx.drawImage(img, 0, 0);
  const d = cx.getImageData(0, 0, img.width, img.height).data; let bottom = 0;
  for (let y = img.height - 1; y >= 0 && !bottom; y--) for (let x = 0; x < img.width; x++) if (d[(y * img.width + x) * 4 + 3] > 40) { bottom = y; break; }
  const tex = createImage(img.width, img.height); tex.drawingContext.drawImage(cv, 0, 0); tex.setModified?.(true);
  return { spec, tex, w: img.width, h: img.height, bottom };
}

// ---------- one solved frame: skeletons, props, grips ----------
const LIMB_IK = { leg_f: ['thigh_f', 'shin_f', 'foot_f', 1], leg_b: ['thigh_b', 'shin_b', 'foot_b', 1], arm_f: ['upperarm_f', 'forearm_f', 'hand_f', -1], arm_b: ['upperarm_b', 'forearm_b', 'hand_b', -1] };
const GRIP_ALONG = .55;   // where a hand closes on a grip, along the hand bone
function wristFor(C, s, flip, grip, handAng, hand) { const L = C.byName['hand_' + hand].len * GRIP_ALONG * s; return [grip[0] - flip * Math.cos(handAng) * L, grip[1] - Math.sin(handAng) * L]; }
function ikDict(C, st, s, flip, extra = {}) {
  const ik = {};
  for (const [limb, [up, mid, end, bend]] of Object.entries(LIMB_IK)) {
    const k = extra[limb] || st.ik[limb]; if (!k || !(k.w > 0) || !k.target || !C.byName[up]) continue;
    let target = k.target;
    if (k.grip) target = wristFor(C, s, flip, k.target, k.endAngle ?? Math.PI / 2, limb.slice(-1));   // a grip point → where the wrist must be
    ik[up] = { mid, end, target, w: k.w, bend: k.bend ?? bend, endAngle: k.endAngle };
  }
  return ik;
}
function solveFrame(CP, plan, t) {
  const comp = composeAt(CP, plan, t), F = { t, chars: {}, props: {} };
  for (const [id, c] of Object.entries(comp.chars)) {
    const K = CP.chars[id], C = K.C, pose = { ...c.pose };
    let S = solveSkeleton(C, c.root, pose, ikDict(C, c.st, K.s, c.root.flip));
    if (c.look) S = actLookAt(C, c, pose, S, K);
    if (c.st.pointAt) S = pointAtSolve(C, c, pose, S, K);
    F.chars[id] = { C, K, S, c, pose };
  }
  // props: where each one is, then the hands onto its grips
  for (const [id, pr] of Object.entries(comp.props)) {
    const P = pr.P, ch = F.chars[pr.char];
    let pose;
    if (pr.mode === 'hand' && ch) {
      const { C, K, S, c } = ch, f = c.root.flip, hand = pr.hand;
      const handPose = propFromHand(P, C, S, K, f, hand);
      const aimW = c.st.aim?.w || 0;
      pose = aimW > 0 ? blendPose(handPose, propAimed(P, C, S, K, f, c.st.aim, c.st.recoil || 0), aimW) : handPose;
      // just attached: ease from where it lay into the hand (no pop)
      const k = clamp((t - pr.attachT) / .18); if (k < 1) pose = blendPose(restPose(P), pose, smooth(k));
      // the hands solve onto the grips: the primary always, the other hand onto grip 2 while aiming two-handed
      const ex = {}, ha = pose.ang + Math.PI / 2;
      ex['arm_' + hand] = { w: 1, target: propPoint(P, pose, 'grip', f), endAngle: ha, grip: true, bend: -1 };
      const other = hand === 'f' ? 'b' : 'f';
      if (aimW > 0 && c.st.aim.two && P.A.spec.anchors.grip2) ex['arm_' + other] = { w: aimW, target: propPoint(P, pose, 'grip2', f), endAngle: ha, grip: true, bend: -1 };
      ch.S = solveSkeleton(C, c.root, ch.pose, { ...ikDict(C, c.st, K.s, f), ...ikDict(C, { ik: ex }, K.s, f, ex) });
      pose.flip = f; pose.z = hand === 'f' ? 70 : 15; pose.held = hand;
    } else if (pr.releaseT != null && pr.mode === 'world') pose = fallen(P, CP, plan, pr.releaseT, t);
    else pose = restPose(P);
    F.props[id] = { P, pose, mode: pr.mode, hand: pr.hand, char: pr.char };
  }
  return F;
}
const restPose = P => ({ x: P.rest.x, y: P.rest.y, ang: P.rest.ang, flip: 1, z: 55 });
const blendPose = (a, b, k) => ({ ...b, x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), ang: lerpA(a.ang, b.ang, k) });
// a prop-frame anchor → frame px, for a pose { x, y (the prop's origin), ang (canonical: 0 = forward), flip }
function propPoint(P, pose, key, flip = pose.flip ?? 1) { const [ox, oy] = P.anchor(key), c = Math.cos(pose.ang), s = Math.sin(pose.ang); return [pose.x + flip * (ox * c - oy * s), pose.y + ox * s + oy * c]; }
// held in one hand: the grip anchor on the hand's grip point, pointing along the hand turned forward
function propFromHand(P, C, S, K, f, hand) {
  const ha = S.A['hand_' + hand], ang = ha - Math.PI / 2 + (P.holdAngle || 0), gp = bonePoint(C, S, 'hand_' + hand, C.byName['hand_' + hand].len * GRIP_ALONG);
  const [gx, gy] = P.anchor('grip'), c = Math.cos(ang), s = Math.sin(ang);
  return { x: gp[0] - f * (gx * c - gy * s), y: gp[1] - (gx * s + gy * c), ang, flip: f };
}
// aimed: held out from the front shoulder toward the target, the muzzle line on the target; recoil kicks it back and up
function propAimed(P, C, S, K, f, aim, recoil) {
  const sh = S.world.upperarm_f.a, T = aim.target, dx = T[0] - sh[0], dy = T[1] - sh[1], d = Math.hypot(dx, dy) || 1;
  const reach = (C.byName.upperarm_f.len + C.byName.forearm_f.len) * K.s * .72;
  let ang = Math.atan2(dy, f * dx); ang = clamp(ang, -1.2, 1.0);
  const dir = [f * Math.cos(ang), Math.sin(ang)], kick = recoil * reach * .12;
  const grip = [sh[0] + dir[0] * (reach - kick), sh[1] + dir[1] * (reach - kick) + .08 * reach];
  ang -= recoil * .22;
  const [gx, gy] = P.anchor('grip'), c = Math.cos(ang), s = Math.sin(ang);
  return { x: grip[0] - f * (gx * c - gy * s), y: grip[1] - (gx * s + gy * c), ang, flip: f };
}
// dropped: it leaves the hand with the hand's velocity, falls, bounces and settles flat on the ground
function fallen(P, CP, plan, tr, t) {
  const key = 'rel' + tr; if (!P[key]) {
    const at = u => { const F = solveFrame(CP, plan, u), pr = F.props[P.pr.id]; return pr.pose; };
    const a = at(tr - .001), b = at(tr - 1 / 60 - .001);
    // evaluate as if still attached just before the release
    P[key] = { p0: a, v: [(a.x - b.x) * 60, (a.y - b.y) * 60], w: angNorm(a.ang - b.ang) * 60 };
  }
  const R = P[key], g = 2600, groundY = P.rest.y, dt = 1 / 240; let x = R.p0.x, y = R.p0.y, vx = R.v[0], vy = R.v[1], ang = R.p0.ang, w = R.w;
  for (let u = tr; u < t; u += dt) {
    vy += g * dt; x += vx * dt; y += vy * dt; ang += w * dt;
    if (y >= groundY) { y = groundY; vy = -vy * .32; vx *= .6; w *= .5; if (Math.abs(vy) < 60) vy = 0; ang = lerpA(ang, 0, .25); }
    if (y >= groundY - .5 && vy === 0) { vx *= .9; ang = lerpA(ang, 0, .08); }
  }
  return { x, y, ang, flip: R.p0.flip ?? 1, z: 55 };
}
function actLookAt(C, c, pose, S, K) {
  const n = S.world.neck.a, T = c.look.target, f = c.root.flip;
  const gaze = Math.atan2(T[1] - n[1], f * (T[0] - n[0]));   // canonical: 0 = straight ahead
  const want = clamp(gaze, -.7, .6) * c.look.w;
  const p2 = { ...pose, neck: (pose.neck || 0) + want * .35, head: (pose.head || 0) + want * .55 };
  Object.assign(pose, p2);
  return solveSkeleton(C, c.root, pose, ikDict(C, c.st, K.s, f));
}
function pointAtSolve(C, c, pose, S, K) {
  const { hand, target, k } = c.st.pointAt, f = c.root.flip, sh = S.world['upperarm_' + hand].a, d = Math.hypot(target[0] - sh[0], target[1] - sh[1]) || 1;
  const L = (C.byName['upperarm_' + hand].len + C.byName['forearm_' + hand].len) * K.s * .97, tgt = [sh[0] + (target[0] - sh[0]) / d * L, sh[1] + (target[1] - sh[1]) / d * L];
  const ang = Math.atan2(target[1] - sh[1], f * (target[0] - sh[0]));
  return solveSkeleton(C, c.root, pose, { ...ikDict(C, c.st, K.s, f), ['upperarm_' + hand]: { mid: 'forearm_' + hand, end: 'hand_' + hand, target: tgt, w: k, bend: -1, endAngle: ang } });
}

// ---------- drawing ----------
function drawBackdrop(plan, cam) {
  const B = plan.backdrop || {}, G = plan.ground_y * H;
  background(B.sky || '#EAF1F4');
  noStroke(); fill(B.ground || '#D9CBB0'); rect(0, G, W, H - G);
  fill(0, 0, 0, 18); rect(0, G, W, 6);
  for (const o of B.obstacles || []) { push(); translate(-cam.x, 0); fill(o.color || '#B98A5A'); stroke('#2B2233'); strokeWeight(4); rect(o.x * W - o.w / 2, G - o.h, o.w, o.h, 6); line(o.x * W - o.w / 2, G - o.h, o.x * W + o.w / 2, G); line(o.x * W + o.w / 2, G - o.h, o.x * W - o.w / 2, G); pop(); }
}
function cameraAt(plan, t, frameAt) {
  const c = plan.camera; if (!c || !c.follow) return { x: 0 };
  // a soft follow: the frame drifts toward keeping the character near `frame_x`, smoothed over a short window
  let x = 0, n = 0; for (let u = -.3; u <= .3; u += .1) { const F = frameAt(clamp(t + u, 0, plan.duration)), ch = F.chars[c.follow]; if (!ch) continue; x += ch.c.root.x; n++; }
  x /= Math.max(1, n); return { x: (x - (c.frame_x ?? .5) * W) * (c.amount ?? 1) };
}
function drawShadows(F, plan) {
  const G = plan.ground_y * H; flushBrush(); push(); noStroke();
  for (const c of Object.values(F.chars)) { const lift = Math.max(0, (c.K.standY - c.c.root.y)) / (c.K.legLen * c.K.s); const w = c.K.legLen * c.K.s * .9 * (1 - .4 * clamp(lift)); fill(30, 20, 15, 46 * (1 - .6 * clamp(lift))); ellipse(c.c.root.x, G + 4, w, w * .13); }
  for (const p of Object.values(F.props)) if (!p.pose.held) { fill(30, 20, 15, 30); ellipse(p.pose.x, G + 3, p.P.A.w * p.P.scale * .8, 10); }
  pop();
}
function drawFrame(F, opt) {
  for (const [id, c] of Object.entries(F.chars)) {
    const slots = Object.values(F.props).filter(p => p.char === id && p.pose.held).map(p => ({ z: p.pose.z, draw: () => drawProp(p, opt) }));
    push();
    drawActor(c.C, c.S, { mode: opt.mode, alpha: opt.alpha, density: opt.density, size: opt.size, between: slots, camX: opt.camX });
    pop();
  }
  for (const p of Object.values(F.props)) if (!p.pose.held) { push(); drawProp(p, opt); pop(); }
}
function drawProp(p, opt) {
  const { P, pose } = p, an = P.A.spec.anchors;
  flushBrush(); push(); translate(pose.x, pose.y); scale(pose.flip ?? 1, 1); rotate(pose.ang); scale(P.scale);
  if (opt.alpha != null && opt.alpha < 1) tint(255, 255 * opt.alpha);
  image(P.A.tex, -an.origin[0], -an.origin[1], P.A.w, P.A.h); pop();
}

// ---------- effects ----------
// scheduled once from the plan: shots (muzzle flash + bolt from the muzzle anchor, at the prop's pose at that instant),
// landing / jump dust at the feet, impacts
function scheduleFx(CP, plan, frameAt) {
  const fx = [];
  for (const a of plan.actions) {
    const ty = ACTION_ALIASES[a.type] || a.type, eff = a.effects || ACTION_CATALOG[ty]?.effects || [];
    if (ty === 'fire') {
      const n = a.shots ?? a.params?.shots ?? 1, iv = a.interval ?? a.params?.interval ?? .18;
      for (let i = 0; i < n; i++) {
        const ts = a.start + i * iv, F = frameAt(ts), pr = Object.values(F.props).find(p => p.pose.held); if (!pr) continue;
        const m = propPoint(pr.P, pr.pose, 'muzzle'), ang = pr.pose.ang, f = pr.pose.flip ?? 1;
        if (eff.includes('muzzle_flash')) fx.push({ kind: 'flash', t: ts, prop: pr.P.pr.id });
        if (eff.includes('bolt')) fx.push({ kind: 'bolt', t: ts, x: m[0], y: m[1], dx: f * Math.cos(ang), dy: Math.sin(ang) });
        fx.push({ kind: 'smoke', t: ts, x: m[0], y: m[1] });
      }
    }
    if (ty === 'land' || (ty === 'dust') || (eff.includes('dust') && ty !== 'land')) {
      const F = frameAt(a.start + .02), ch = F.chars[a.character || plan.characters[0].id]; if (!ch) continue;
      for (const side of ['f', 'b']) { const p = ch.S.world['foot_' + side]; fx.push({ kind: 'dust', t: a.start, x: (p.a[0] + p.b[0]) / 2, y: plan.ground_y * H, amount: (a.amount ?? a.params?.amount ?? 1) * ch.K.s / .6 }); }
    }
    if (ty === 'jump') { const F = frameAt(a.start + a.duration * .12), ch = F.chars[a.character || plan.characters[0].id]; if (ch) fx.push({ kind: 'dust', t: a.start + a.duration * .12, x: ch.c.root.x, y: plan.ground_y * H, amount: .6 * ch.K.s / .6 }); }
    if (ty === 'impact' && (a.target || a.params?.target)) fx.push({ kind: 'impact', t: a.start, x: (a.target || a.params.target)[0], y: (a.target || a.params.target)[1] });
  }
  return fx;
}
function drawFx(list, t, frameAt, plan) {
  flushBrush(); push(); noStroke();
  for (const e of list) {
    const a = t - e.t; if (a < 0) continue;
    if (e.kind === 'flash' && a < .09) {                       // follows the muzzle anchor every frame it is visible
      const F = frameAt(t), pr = F.props[e.prop]; if (!pr) continue;
      const m = propPoint(pr.P, pr.pose, 'muzzle'), f = pr.pose.flip ?? 1, ang = pr.pose.ang, k = 1 - a / .09, R = 70 * k + 30;
      push(); translate(m[0], m[1]); scale(f, 1); rotate(ang);
      fill(255, 240, 160, 230 * k); for (let i = 0; i < 8; i++) { const q = i / 8 * TAU, r = i % 2 ? R * .45 : R; triangle(0, -R * .12, 0, R * .12, Math.cos(q) * r + R * .3, Math.sin(q) * r * .55); }
      fill(255, 255, 255, 240 * k); ellipse(R * .2, 0, R * .7, R * .45); fill(120, 230, 255, 160 * k); ellipse(R * .55, 0, R * 1.3, R * .3); pop();
    }
    if (e.kind === 'bolt' && a < 1.2) {
      const sp = 2600, x = e.x + e.dx * sp * a, y = e.y + e.dy * sp * a, L = 150;
      push(); strokeCap(ROUND); stroke(120, 230, 255, 120); strokeWeight(26); line(x - e.dx * L, y - e.dy * L, x, y); stroke(255, 255, 255, 240); strokeWeight(9); line(x - e.dx * L * .8, y - e.dy * L * .8, x, y); pop();
    }
    if (e.kind === 'smoke' && a < .6) { const k = a / .6; for (let i = 0; i < 4; i++) { fill(230, 230, 240, 120 * (1 - k)); ellipse(e.x + (i - 1.5) * 12 * k * 3 + 20 * k, e.y - 30 * k - i * 6, 28 + 50 * k, 28 + 50 * k); } }
    if (e.kind === 'dust' && a < .8) {
      const k = a / .8, n = 7, A = e.amount || 1;
      for (let i = 0; i < n; i++) { const dir = (i / (n - 1) - .5) * 2, r = (24 + 40 * k) * A * (.7 + .3 * ((i * 37) % 5) / 5); fill(205, 185, 150, 170 * (1 - k)); ellipse(e.x + dir * 120 * A * easeOut(k), e.y - 12 * A - 30 * A * k * (1 - Math.abs(dir) * .5), r * 1.4, r); }
    }
    if (e.kind === 'impact' && a < .4) { const k = a / .4; noFill(); stroke(255, 255, 255, 220 * (1 - k)); strokeWeight(8 * (1 - k)); ellipse(e.x, e.y, 60 + 260 * k); noStroke(); }
  }
  pop();
}
// for verification: joints, feet, grips, muzzle, props
function summarize(F) {
  const o = { t: F.t, chars: {}, props: {} };
  for (const [id, c] of Object.entries(F.chars)) {
    const S = c.S, j = {}; for (const [n, w] of Object.entries(S.world)) j[n] = { a: w.a, b: w.b, ang: S.A[n] };
    o.chars[id] = { root: c.c.root, bones: j, ground: c.K.G, ankleH: c.K.ankleH, ik: c.c.st.ik, grips: { f: bonePoint(c.C, S, 'hand_f', c.C.byName.hand_f.len * GRIP_ALONG), b: bonePoint(c.C, S, 'hand_b', c.C.byName.hand_b.len * GRIP_ALONG) } };
  }
  for (const [id, p] of Object.entries(F.props)) {
    const an = p.P.A.spec.anchors;
    o.props[id] = { mode: p.mode, hand: p.hand, pose: p.pose, grip: propPoint(p.P, p.pose, 'grip'), grip2: an.grip2 ? propPoint(p.P, p.pose, 'grip2') : null, muzzle: an.muzzle ? propPoint(p.P, p.pose, 'muzzle') : null };
  }
  return o;
}
