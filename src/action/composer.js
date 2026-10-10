// action/composer.js: the ACTION COMPOSER. A Motion Plan (motion_plan/1, see tools/action/plan.mjs) is a list of preset
// actions on one timeline; this turns it into one continuous performance, frame by frame, as a pure function of time.
//
//   LAYERS (low → high priority): root, lower_body, upper_body, hands, head, secondary, effects, camera.
//   Every action writes only the JOINT GROUPS in its mask (catalog.js): root, spine, head, arm_f, arm_b, hand_f, hand_b,
//   leg_f, leg_b, prop, fx. Groups blend in priority order: a higher layer overrides a lower one only where its mask
//   says, so legs run (lower_body) while the torso aims (upper_body) and the hands keep their grips (hands).
//   Same layer: the later action interrupts the earlier one, crossfading over its blend_in. An action whose successor
//   starts when it ends stays at full weight until the successor has blended in (no dip to neutral between actions).
//   Additive actions (fire's recoil, breathe, bounce) add on top instead of replacing.
//   ROOT MOTION: horizontal speed is blended like any channel and integrated over time (a table at 240 Hz), so the
//   stride of every step matches how far the hips actually travelled: planted feet do not slide.
//   GROUND: grounded legs are two-bone IK chains whose feet are pinned to the ground line during stance.
//   PROPS: a prop is in the world, attached to a hand (it follows the hand), or aimed (its pose comes from the aim and
//   both hands follow its grips by IK). Switching blends the prop's pose, and the hands always solve onto its grips,
//   so a held prop cannot drift from the hand while running, jumping or landing.
const ACT_PRIORITY = Object.fromEntries(ACTION_LAYERS.map((l, i) => [l, i]));
const ACT_GROUP_BONES = { spine: ['spine'], head: ['neck', 'head'], arm_f: ['upperarm_f', 'forearm_f', 'hand_f'], arm_b: ['upperarm_b', 'forearm_b', 'hand_b'],
  leg_f: ['thigh_f', 'shin_f', 'foot_f'], leg_b: ['thigh_b', 'shin_b', 'foot_b'] };
const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const lerpA = (a, b, k) => a + angNorm(b - a) * k;
const lerp2 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];

function buildComposer(plan, chars, props) {
  const G = plan.ground_y * H, out = {};
  for (const ch of plan.characters) {
    const C = chars[ch.id];
    const s = (ch.height * H) / C.height;                                    // frame px per image px
    const legLen = C.byName.thigh_f.len + C.byName.shin_f.len, ankleH = (C.groundY - C.J.ankle_f[1]) * s;
    const hipOff = C.byName.thigh_f.off, standY = G - ankleH - (legLen * .985 + hipOff[1]) * s;   // hips height standing (knees a hair soft)
    const acts = plan.actions.filter(a => (a.character || plan.characters[0].id) === ch.id).map((a, i) => {
      const type = ACTION_ALIASES[a.type] || a.type, cat = ACTION_CATALOG[type], prm = {};
      for (const [k, d] of Object.entries(cat.params)) prm[k] = a[k] ?? a.params?.[k] ?? d.default;
      const layer = a.layer && ACT_PRIORITY[a.layer] != null ? a.layer : cat.layer;
      return { ...a, i, type, cat, p: prm, layer, pri: ACT_PRIORITY[layer] ?? 1, mask: new Set(a.mask || cat.mask), start: a.start, end: a.start + a.duration, dur: a.duration,
        bi: Math.min(prm.blend_in, a.duration / 2), bo: prm.blend_out, additive: !!cat.additive };
    });
    // while a prop is in a hand and nothing else directs that arm, the arm holds it in front at the waist (an implicit
    // carry action on the upper body, from the moment the hand closes until it lets go)
    for (const pr of plan.props || []) {
      let at = null, hand = 'f';
      for (const a of [...plan.actions].sort((x, y) => x.start - y.start)) {
        const ty = ACTION_ALIASES[a.type] || a.type, tgt = a.target ?? a.params?.target; if (tgt !== pr.id || (a.character && a.character !== ch.id)) continue;
        if (ty === 'pick_up') { at = a.start + a.duration * .45; hand = a.hand || a.params?.hand || 'f'; }
        if (ty === 'drop' && at != null) { acts.push(implicitCarry(at, a.start + a.duration * .35, hand)); at = null; }
      }
      if (at != null) acts.push(implicitCarry(at, plan.duration + 1, hand));
    }
    acts.sort((a, b) => a.pri - b.pri || a.start - b.start || a.i - b.i);
    // successor: the next action of the same layer whose mask overlaps, starting near this one's end (it takes over)
    for (const a of acts) if (GROUNDED.has(a.type) && acts.some(b => GAITS[b.type] && b.pri === a.pri && Math.abs(b.end - a.start) < .05)) a.bi = Math.min(a.bi, .08);   // a stop takes over fast (its step-in does the rest)
    for (const a of acts) {
      // the next action of this layer that shares joints takes over; until it does, this one holds its last pose
      // (a gap in a layer does not drop the body back to neutral)
      // (an action that starts INSIDE this one interrupts it only while it plays, on top, by its own weight: when it
      // ends, this one shows again: a dodge in the middle of a run, then running on)
      const nx = acts.filter(b => b !== a && b.pri === a.pri && !b.additive && !a.additive && b.start >= a.end - Math.max(b.bi, .05) && [...b.mask].some(m => a.mask.has(m)));
      a.next = nx.sort((x, y) => x.start - y.start)[0] || null;
    }
    // an action nested inside a longer one of its layer (a dodge inside a run) gives the joints back when it ends
    for (const a of acts) a.nested = acts.some(b => b !== a && b.pri === a.pri && b.start < a.start && b.end > a.end + .1 && [...b.mask].some(m => a.mask.has(m)));
    for (const a of acts) if (a.nested) a.next = null;
    for (const a of acts) a.nextCovers = !!a.next && [...a.mask].every(m => a.next.mask.has(m));
    for (const a of acts) if (a.start <= .001) a.bi = 0;   // nothing to blend from at the very start of the scene
    const env = (a, t) => {
      if (t < a.start) return 0;
      let w = a.bi > 0 ? smooth((t - a.start) / a.bi) : 1;
      if (t > a.end) {
        // handed over: hold until the successor has blended in, then let go. A successor that covers only part of
        // this action's joints does not take over the rest: then this one fades out (no joint is dropped at once)
        if (a.next && a.nextCovers) { if (t > a.next.start + a.next.bi + .02) return 0; }
        else w *= a.bo > 0 ? 1 - smooth((t - Math.max(a.end, a.next ? a.next.start + a.next.bi : a.end)) / a.bo) : 0;
      }
      return w * a.p.weight;
    };
    const flipAt = t => { let f = (ch.facing === 'left' ? -1 : 1); for (const a of acts) if (a.type === 'turn' && t >= a.start + a.dur / 2) f = -f; return f; };
    // ---- root x: blended horizontal speed, integrated ----
    const DT = 1 / 240, N = Math.ceil((plan.duration + 1) / DT) + 2, X = new Float64Array(N), V = new Float64Array(N);
    X[0] = ch.x * W;
    const speedOf = (a, t, i) => {
      const f = flipAt(t), k = (t - a.start) / a.dur;
      if (a.type === 'walk' || a.type === 'run' || a.type === 'sprint') return (a.p.direction === 'left' ? -1 : a.p.direction === 'right' ? 1 : f) * a.p.speed * a.p.strength;
      if (a.type === 'jump') { if (a.v0 == null) a.v0 = a.p.distance >= 0 ? f * a.p.distance / Math.max(.1, a.dur * .85) : V[Math.max(0, Math.round(a.start / DT) - 1)]; return k < .12 ? a.v0 * .6 : a.v0; }
      if (a.type === 'dodge') return -f * a.p.distance * Math.PI / 2 / (a.dur * .6) * Math.sin(Math.PI * clamp(k / .6)) * (k < .6 ? 1 : 0);
      if (a.type === 'land') { const v0 = a.v0 ??= V[Math.max(0, Math.round(a.start / DT) - 1)]; return v0 * Math.max(0, 1 - (t - a.start) / .08); }   // momentum dies in the knees (within 0.08 s)
      return null;
    };
    for (let i = 0; i < N - 1; i++) {
      const t = i * DT; let v = 0;
      for (const a of acts) { if (!a.mask.has('root')) continue; const w = env(a, t); if (w <= 0) continue; const sv = speedOf(a, t, i); if (sv == null) { v = v * (1 - w); continue; } v = v + (sv - v) * w; }
      V[i] = v; X[i + 1] = X[i] + v * DT;
    }
    const rootX = t => { const f = clamp(t / DT, 0, N - 2), i = Math.floor(f); return X[i] + (X[i + 1] - X[i]) * (f - i); };
    const rootV = t => V[clamp(Math.round(t / DT), 0, N - 2)];
    out[ch.id] = { ch, C, s, legLen, ankleH, standY, acts, env, flipAt, rootX, rootV, G, plan };
  }
  const CP = { chars: out, props: buildProps(plan, out, props) };
  for (const K of Object.values(out)) K.CP = CP;
  return CP;
}

function implicitCarry(t0, t1, hand) {
  const cat = ACTION_CATALOG.carry, p = {}; for (const [k, d] of Object.entries(cat.params)) p[k] = d.default;
  p.blend_in = .3;
  return { type: 'carry', implicit: true, i: 1e6, cat, p, layer: 'upper_body', pri: ACT_PRIORITY.upper_body, mask: new Set(['arm_' + hand]), start: t0, end: t1, dur: Math.max(.05, t1 - t0), bi: .3, bo: .25, additive: false, hand };
}
// ---------- per-frame evaluation ----------
// state: { root, pose, ik, look, groups } → solved skeleton, prop poses, effect list
function composeAt(CP, plan, t, opts = {}) {
  const frame = { chars: {}, props: {}, fx: [] };
  for (const [id, K] of Object.entries(CP.chars)) frame.chars[id] = evalCharacter(K, plan, t, CP, opts);
  frame.props = evalProps(CP, plan, t, frame);
  return frame;
}
function evalCharacter(K, plan, t, CP, opts = {}) {
  const { C, s, acts, env } = K, flip = K.flipAt(t);
  const st = { root: { x: K.rootX(t), y: K.standY, dy: 0, rot: 0, sx: 1, sy: 1 }, pose: {}, ik: {}, look: null, armHold: {} };
  // the neutral stance: both feet planted under the hips (IK), arms relaxed
  standBase(K, st, t, flip);
  for (const a of acts) {
    if (opts.exclude && (a === opts.exclude || a.start >= opts.exclude.start)) continue;   // the state an action starts from
    const w = env(a, t); if (w <= 0) continue;
    const pre = ACTION_EVAL[a.type]; if (!pre) continue;
    const o = pre(K, a, Math.min(t, a.next ? t : t), clamp((t - a.start) / a.dur), st, flip, CP, plan); if (!o) continue;
    mergeAction(st, o, a, w * (a.p.strength != null && a.additive ? a.p.strength : 1));
  }
  reachGuard(K, st, flip);
  if (!opts.noSecondary) secondary(K, plan, t, st, flip, CP);
  // the turn: a drawing-only squash in x through the switch (the skeleton itself never squashes to zero: its IK would)
  let vsx = 1; for (const a of acts) if (a.type === 'turn' && t >= a.start && t <= a.end) vsx = Math.max(.15, Math.abs(Math.cos(Math.PI * clamp((t - a.start) / a.dur))));
  const root = { x: st.root.x, y: st.root.y + st.root.dy, rot: st.root.rot, s, sx: st.root.sx, sy: st.root.sy, flip, vsx };
  return { root, pose: st.pose, ik: st.ik, look: st.look, armHold: st.armHold, st };
}
// every planted foot must reach the ground: if the hips are too high for a leg to touch its foothold (a long stance,
// the hips not over the feet after a stop), they come down just enough. Feet never hover; the body gives instead.
function reachGuard(K, st, f) {
  const C = K.C, L = (C.byName.thigh_f.len + C.byName.shin_f.len) * K.s * .995;
  for (const side of ['f', 'b']) {
    const k = st.ik['leg_' + side]; if (!k || !(k.w > .99) || !k.target || k.target[1] < K.G - K.ankleH - .5) continue;
    const off = C.byName['thigh_' + side].off, hx = st.root.x + f * off[0] * K.s, hy = st.root.y + st.root.dy + off[1] * K.s * st.root.sy, dx = k.target[0] - hx;
    if (Math.abs(dx) >= L) continue;
    const minY = k.target[1] - Math.sqrt(L * L - dx * dx); if (hy < minY) st.root.dy += minY - hy;
  }
}
// merge one action's output into the running state, group by group (mask), weight w
function mergeAction(st, o, a, w) {
  const m = a.mask, add = a.additive;
  if (o.root && m.has('root')) for (const k of ['dy', 'rot']) if (o.root[k] != null) st.root[k] = add ? st.root[k] + o.root[k] * w : lerp(st.root[k], o.root[k], w);
  if (o.root && m.has('root')) for (const k of ['sx', 'sy']) if (o.root[k] != null) st.root[k] = add ? st.root[k] * (1 + (o.root[k] - 1) * w) : lerp(st.root[k], o.root[k], w);
  for (const [g, bones] of Object.entries(ACT_GROUP_BONES)) {
    if (!m.has(g)) continue;
    for (const b of bones) if (o.pose && o.pose[b] != null) st.pose[b] = add ? (st.pose[b] || 0) + o.pose[b] * w : lerpA(st.pose[b] || 0, o.pose[b], w);
    const limb = g.startsWith('leg') ? g : g.startsWith('arm') ? g : null;
    if (limb && o.ik && o.ik[limb] !== undefined && !add) {
      const P = st.ik[limb] || { w: 0 }, N = o.ik[limb] || { w: 0 };
      st.ik[limb] = { w: lerp(P.w || 0, N.w || 0, w), target: P.target && N.target ? lerp2(P.target, N.target, w) : (N.target || P.target),
        endAngle: P.endAngle != null && N.endAngle != null ? lerpA(P.endAngle, N.endAngle, w) : (N.endAngle ?? P.endAngle), bend: N.bend ?? P.bend,
        grip: N.w > 0 && N.target ? !!N.grip : !!P.grip };   // a grip target is where the hand closes, not where the wrist goes
    }
  }
  if (o.look && m.has('head')) st.look = st.look && !add ? { target: lerp2(st.look.target, o.look.target, w), w: lerp(st.look.w, o.look.w, w) } : { ...o.look, w: (o.look.w ?? 1) * w };
  if (o.armHold) for (const [h, v] of Object.entries(o.armHold)) if (m.has('arm_' + h) || m.has('hand_' + h)) st.armHold[h] = lerp(st.armHold[h] || 0, v, w);
  if (o.aim && m.has('prop')) st.aim = st.aim ? { ...o.aim, w: lerp(st.aim.w, o.aim.w ?? 1, w) } : { ...o.aim, w: (o.aim.w ?? 1) * w };
  if (o.recoil) st.recoil = (st.recoil || 0) + o.recoil * w;
  if (o.pointAt && (m.has('arm_' + o.pointAt.hand) || m.has('hand_' + o.pointAt.hand))) st.pointAt = { ...o.pointAt, k: o.pointAt.k * w };
}

// feet: canonical helpers. Feet are IK targets in frame px; x along the facing direction from a hips-relative offset.
const footRest = (K, side) => K.C.byName['thigh_' + side].off[0] * K.s;                        // a foot's x offset under its hip
const ankleTarget = (K, x) => [x, K.G - K.ankleH];
function standBase(K, st, t, flip) {
  // the neutral stance stands where the latest leg action began (not under the moving hips: blending into a walk
  // from it must not drag the feet)
  const last = K.acts.filter(a => a.start <= t && [...a.mask].some(m => m.startsWith('leg'))).sort((x, y) => y.start - x.start)[0];
  Object.assign(st.ik, feetPlanted(K, K.rootX(last ? last.start : 0), flip));
  Object.assign(st.pose, { upperarm_f: -.08, forearm_f: -.18, upperarm_b: .1, forearm_b: -.22, hand_f: 0, hand_b: 0 });
}

// ---------- the presets (pure functions of the action's progress u = 0..1 and time t) ----------
// each returns { root: { dy, rot, sx, sy }, pose: { bone: delta }, ik: { limb: { w, target, endAngle, bend } }, look, aim, armHold, recoil }
const ACTION_EVAL = {
  idle(K, a, t, u, st, f) {
    const b = Math.sin(t * Math.PI * 2 * .32), x0 = standAnchor(K, a), ik = feetPlanted(K, x0, f);
    if (a.stepIn) {   // after a walk or run: the free foot steps in beside the planted one (lifted: it never drags)
      const e = smooth((t - a.start) / .3), S2 = a.stepIn, lift = Math.sin(Math.PI * e) * .07 * K.legLen * K.s;
      ik['leg_' + S2.side] = { ...ik['leg_' + S2.side], target: [lerp(S2.from[0], S2.to[0], e), lerp(S2.from[1], S2.to[1], e) - lift] };
    }
    const pose = { spine: .03 + b * .015, neck: -.02, head: b * .01, upperarm_f: -.06 + b * .02, upperarm_b: .08 - b * .02, forearm_f: -.2, forearm_b: -.24 };
    if (a.stepIn?.pose) { const e = smooth((t - a.start) / .35); for (const k of Object.keys(pose)) if (a.stepIn.pose[k] != null) pose[k] = lerpA(a.stepIn.pose[k], pose[k], e); }   // the arms and chest ease out of the gait
    return { root: { dy: b * .006 * K.legLen * K.s }, pose, ik };
  },
  breathe(K, a, t) { const b = Math.sin(t * Math.PI * 2 * a.p.rate); return { pose: { spine: b * .02, neck: -b * .012 }, root: { dy: b * .004 * K.legLen * K.s } }; },
  walk(K, a, t, u, st, f) { return actGait(K, a, t, st, f, GAITS.walk(a)); },
  run(K, a, t, u, st, f) { return actGait(K, a, t, st, f, GAITS.run(a)); },
  sprint(K, a, t, u, st, f) { return actGait(K, a, t, st, f, GAITS.sprint(a)); },
  jump(K, a, t, u, st, f) {
    // anticipation (crouch, arms back) → push-off (the legs extend while the feet still hold the ground, IK) → air (the
    // legs tuck, FK) → reaching down for the ground at the end. Every pose is interpolated from the one before it, so
    // nothing pops at the phase changes.
    const pre = .12 * a.dur, lt = t - a.start, hp = a.p.height * a.p.strength, ll = K.legLen * K.s, x0 = K.rootX(a.start);
    const crouchK = lt < pre ? smooth(lt / pre) : 1 - smooth((lt - pre) / (.12 * a.dur));          // the crouch, then its release
    const air = clamp((t - (a.start + pre)) / (a.end - a.start - pre)), lift = 4 * hp * air * (1 - air);
    const tuck = Math.sin(Math.PI * Math.min(1, air * 1.15)) * a.p.tuck, reachDown = smooth((air - .7) / .3);
    const C = { spine: .25, upperarm_f: .5, upperarm_b: .6, forearm_f: -.3, forearm_b: -.3 };                       // the crouch pose
    const A = { spine: .16, thigh_f: -1.15 * tuck - .1, shin_f: 1.45 * tuck + .05, foot_f: -.25 * tuck, thigh_b: -.4 * tuck + .3 * Math.min(1, air * 4), shin_b: 1.3 * tuck + .2 * Math.min(1, air * 4), foot_b: .1,
      upperarm_f: -1.35 * Math.sin(Math.PI * Math.min(1, air * 1.3)), upperarm_b: -1.0 * Math.sin(Math.PI * Math.min(1, air * 1.3)), forearm_f: -.6, forearm_b: -.5 };
    for (const k of ['thigh_f', 'shin_f', 'thigh_b', 'shin_b']) A[k] *= 1 - .75 * reachDown;                      // legs reach for the ground before touch-down
    const k0 = lt < pre ? 0 : smooth((lt - pre) / (.18 * a.dur));                                                   // crouch pose → air pose
    const pose = {}; for (const n of new Set([...Object.keys(C), ...Object.keys(A)])) pose[n] = lerp(lt < pre ? (C[n] || 0) * smooth(lt / pre) : (C[n] || 0), A[n] || 0, k0);
    const ikw = lt < pre ? 1 : 1 - smooth((lt - pre) / (.14 * a.dur));                                             // feet keep the ground while the legs push
    let feet = feetPlanted(K, x0, f, ikw);
    if (reachDown > 0) {   // late air: the feet reach for their landing footholds (where the land action will pin them)
      const xl = landAnchor(K, a), hgt = lift;
      feet = { leg_f: { w: reachDown, target: [standFootX(K, xl, f, 'f'), K.G - K.ankleH - hgt], endAngle: 0, bend: 1 }, leg_b: { w: reachDown, target: [standFootX(K, xl, f, 'b'), K.G - K.ankleH - hgt], endAngle: 0, bend: 1 } };
    }
    const stretch = air > 0 && air < .2 ? .08 * Math.sin(Math.PI * air / .2) : 0, squat = lt < pre ? .06 * smooth(lt / pre) : 0;
    return { root: { dy: crouchK * .2 * ll - lift, sy: 1 + stretch - squat, sx: 1 - stretch * .6 + squat * .5 }, pose, ik: feet };
  },
  crouch(K, a, t, u, st, f) {
    const k = smooth(Math.min(1, u * 4)) * (u > .85 ? 1 - smooth((u - .85) / .15) * 0 : 1), d = a.p.depth * a.p.strength * K.legLen * K.s, x0 = K.rootX(a.start);
    return { root: { dy: k * d }, pose: { spine: .3 * k }, ik: feetPlanted(K, x0, f) };
  },
  dodge(K, a, t, u, st, f) { const k = Math.sin(Math.PI * clamp(u / .7)) * (u < .7 ? 1 : 0); return { root: { dy: k * .12 * K.legLen * K.s, rot: -f * 0 }, pose: { spine: -a.p.lean * k, neck: .2 * k, upperarm_f: -.8 * k, upperarm_b: -.6 * k } }; },
  fall(K, a, t, u, st, f) {
    const g = 2600, lt = t - a.start, h0 = a.p.from_height, y = Math.max(0, h0 - .5 * g * lt * lt), fl = Math.sin(t * 18);
    // near the ground the feet reach for their landing footholds (as at the end of a jump): touch-down never slides
    const reach = smooth(1 - y / Math.max(1, Math.min(h0, .5 * K.legLen * K.s))), xl = landAnchor(K, a);
    const feet = reach > 0 ? { leg_f: { w: reach, target: [standFootX(K, xl, f, 'f'), K.G - K.ankleH - y], endAngle: 0, bend: 1 }, leg_b: { w: reach, target: [standFootX(K, xl, f, 'b'), K.G - K.ankleH - y], endAngle: 0, bend: 1 } } : { leg_f: { w: 0 }, leg_b: { w: 0 } };
    return { root: { dy: -y }, pose: { thigh_f: -.6 + .2 * fl, shin_f: .9, thigh_b: .2 - .2 * fl, shin_b: .8, upperarm_f: -2.2 + .3 * fl, upperarm_b: -2 - .3 * fl, forearm_f: -.4, forearm_b: -.4, spine: -.1 }, ik: feet };
  },
  land(K, a, t, u, st, f) {
    const ll = K.legLen * K.s, x0 = K.rootX(a.start), lt = t - a.start;
    // impact: the knees give (fast), hold a beat, rise with a small overshoot; squash on contact
    const dip = a.p.depth * a.p.strength * ll * (lt < .07 ? smooth(lt / .07) : Math.max(0, 1 - smooth((lt - .07) / Math.max(.1, a.dur - .07))) * (1 + .15 * Math.sin(Math.PI * clamp((lt - .07) / (a.dur - .07)))));
    const sq = Math.exp(-9 * lt) * .12;
    const xf = landAnchor(K, a);
    return { root: { dy: dip, sy: 1 - sq, sx: 1 + sq * .8 }, pose: { spine: .45 * dip / ll * 2.2, neck: -.2 * dip / ll * 2, upperarm_f: -.9 * dip / ll * 2, upperarm_b: -.5 * dip / ll * 2, forearm_f: -.5, forearm_b: -.4 },
      ik: feetPlanted(K, xf, f) };
  },
  look(K, a, t, u) { return a.p.target ? { look: { target: a.p.target, w: 1 } } : null; },
  turn() { return null; },   // handled by flipAt (the mirror) and the squash in evalCharacter
  wave(K, a, t, u) { const h = a.p.hand, k = smooth(Math.min(1, u * 5)) * (u > .85 ? 1 - smooth((u - .85) / .15) : 1), wv = Math.sin(u * Math.PI * 2 * a.p.count);
    return { pose: { ['upperarm_' + h]: -2.6 * k, ['forearm_' + h]: (-.5 + .45 * wv) * k, ['hand_' + h]: .2 * wv * k } }; },
  point(K, a, t, u, st, f) { if (!a.p.target) return null; const h = a.p.hand, k = smooth(Math.min(1, u * 4)); return { pointAt: { hand: h, target: a.p.target, k }, pose: { spine: -.05 * k } }; },
  reach(K, a, t, u, st, f, CP) { return reachOut(K, a, u, f, CP, false); },
  pick_up(K, a, t, u, st, f, CP) { return reachOut(K, a, u, f, CP, true); },
  hold(K, a) { const h = a.hand || 'f'; return { pose: { ['upperarm_' + h]: -.12, ['forearm_' + h]: -.45, ['hand_' + h]: 0 } }; },
  carry(K, a, t) { const h = a.hand || a.p?.hand || 'f', sw = Math.sin(t * 5.2) * .04; return { pose: { ['upperarm_' + h]: -.28 + sw, ['forearm_' + h]: -.62, ['hand_' + h]: 0 } }; },
  drop(K, a, t, u) { return { pose: { upperarm_f: -.35 * Math.sin(Math.PI * clamp(u * 1.5)), forearm_f: -.6 } }; },
  transfer(K, a, t, u) { return { pose: { upperarm_f: -.9 * Math.sin(Math.PI * u), upperarm_b: -.9 * Math.sin(Math.PI * u), forearm_f: -.8, forearm_b: -.8 } }; },
  aim(K, a, t, u, st, f) {
    if (!a.p.target) return null;
    return { aim: { target: a.p.target, two: a.p.two_hands !== false, w: 1 }, look: { target: a.p.target, w: 1 }, pose: { spine: -.06 } };
  },
  fire(K, a, t, u) {
    // each shot: a sharp kick, decaying; the effects are scheduled separately (fireEvents)
    let r = 0; for (let i = 0; i < a.p.shots; i++) { const ts = a.start + i * a.p.interval, d = t - ts; if (d >= 0) r += Math.exp(-14 * d) * (d < .03 ? d / .03 : 1); }
    return { recoil: r * a.p.recoil, pose: { spine: -.12 * r * a.p.recoil, neck: .06 * r } };
  },
  react(K, a, t, u) { const k = u < .22 ? Math.sin(Math.PI / 2 * u / .22) : Math.exp(-5 * (u - .22)), s = a.p.direction === 'forward' ? 1 : -1;   // a sharp jolt, then it settles (continuous)
    return { pose: { spine: s * .35 * k, neck: -s * .3 * k, upperarm_f: -1.2 * k, upperarm_b: -1.4 * k, forearm_f: -.8 * k, forearm_b: -.8 * k } }; },
  recoil(K, a, t, u) { return { recoil: Math.exp(-10 * (t - a.start)) * a.p.strength }; },
  squash_stretch() { return null; }, inertia() { return null; }, head_follow() { return null; },
  bounce(K, a, t, u) { const c = a.p.count, v = (u * c) % 1; return { root: { dy: -4 * a.p.height * v * (1 - v), sy: 1 + .06 * Math.sin(Math.PI * v), sx: 1 - .04 * Math.sin(Math.PI * v) } }; },
  overshoot(K, a, t) { const sp = spring(t, a.start, 5, 16); return { pose: { spine: .12 * sp, neck: -.1 * sp } }; },
  arm_swing(K, a, t) { const sw = Math.sin(t * Math.PI * 2 * a.p.rate) * .45; return { pose: { upperarm_f: sw, upperarm_b: -sw } }; },
  motion_trail() { return null; }, dust() { return null; }, impact() { return null; },
};
const GAITS = {
  walk: a => ({ stance: .62, lift: .09, bob: .02, lean: .05, armAmp: .32, foreBend: -.25, stride: .62, crouch: .09 }),
  run: a => ({ stance: .38, lift: .2, bob: .045, lean: a.p.lean, armAmp: .62, foreBend: -1.35, stride: 1.05, crouch: .11 }),
  sprint: a => ({ stance: .32, lift: .26, bob: .05, lean: a.p.lean, armAmp: .8, foreBend: -1.5, stride: 1.35, crouch: .16 }),
};
// where the feet go down: a landing pins them under the hips at the end of the momentum; a standing action that
// follows a landing (or another standing action) keeps those footholds, so the feet never slide between them
const GROUNDED = new Set(['land', 'idle', 'crouch', 'pick_up', 'reach']);
function landAnchor(K, a) {
  const land = a.type === 'land' ? a : K.acts.find(b => b.type === 'land' && Math.abs(b.start - a.end) < .05);
  return land ? K.rootX(land.start + .1) : K.rootX(a.end + .1);
}
function standAnchor(K, a) {
  const prev = K.acts.filter(b => b !== a && b.pri === a.pri && b.start < a.start && b.end <= a.start + .05 && [...b.mask].some(m => m.startsWith('leg'))).sort((x, y) => y.end - x.end || y.start - x.start)[0];
  if (!prev || !(GROUNDED.has(prev.type) || GAITS[prev.type])) return K.rootX(a.start);   // after a jump, a fall … : under the hips
  if (!prev) return K.rootX(a.start);
  if (GAITS[prev.type]) {
    // stopping from a walk or run: the foot that is planted when the gait ends stays exactly where it is; the stance
    // is built around it (the other foot steps in beside it, in the air)
    const f = K.flipAt(a.start), G2 = actGait(K, prev, prev.end, null, f, GAITS[prev.type](prev)), ll = K.legLen * K.s;
    const ground = side => G2.ik['leg_' + side].target[1] >= K.G - K.ankleH - .5;
    const side = ground('f') ? 'f' : ground('b') ? 'b' : 'f', fx = G2.ik['leg_' + side].target[0];
    const x0 = fx - f * (footRest(K, side) + (side === 'f' ? STANCE : -STANCE) * ll), other = side === 'f' ? 'b' : 'f';
    a.stepIn ??= { side: other, from: G2.ik['leg_' + other].target, to: ankleTarget(K, standFootX(K, x0, f, other)), pose: G2.pose };
    return x0;
  }
  return prev.type === 'land' ? landAnchor(K, prev) : standAnchor(K, prev);
}
// both feet planted around x0 (the standing stance: front foot a little ahead, back foot a little behind)
const STANCE = .05;
const standFootX = (K, x0, f, side) => x0 + f * (footRest(K, side) + (side === 'f' ? STANCE : -STANCE) * K.legLen * K.s);
function feetPlanted(K, x0, f, w = 1) {
  return { leg_f: { w, target: ankleTarget(K, standFootX(K, x0, f, 'f')), endAngle: 0, bend: 1 }, leg_b: { w, target: ankleTarget(K, standFootX(K, x0, f, 'b')), endAngle: 0, bend: 1 } };
}
// a gait cycle tied to the distance the hips really travelled since the action began: each foot is planted (pinned in
// the world) for the stance part of its cycle and swings to its next plant point with a lift arc
// where the feet are when an action begins: the composed state just before it, without it (cached on the action)
function feetAtStart(K, a) {
  if (a.feet0) return a.feet0;
  const plan = K.plan, f = K.flipAt(a.start), S = evalCharacter(K, plan, Math.max(0, a.start - 1e-4), K.CP, { noSecondary: true, exclude: a }).st, ll = K.legLen * K.s, x0 = K.rootX(a.start);
  const out = {};
  for (const side of ['f', 'b']) {
    const k = S.ik['leg_' + side], tx = k?.target ? k.target[0] : standFootX(K, x0, f, side), ty = k?.target ? k.target[1] : K.G - K.ankleH;
    out[side] = { rel: (tx - x0 - f * footRest(K, side)) * f, lift: Math.max(0, K.G - K.ankleH - ty), grounded: !k || ty >= K.G - K.ankleH - .5 };
  }
  return (a.feet0 = out);
}
function actGait(K, a, t, st, f, g) {
  const ll = K.legLen * K.s, step = (a.p.stride > 0 ? a.p.stride : g.stride * ll), cyc = 2 * step, x0 = K.rootX(a.start);
  const D = Math.abs(K.rootX(t) - x0), dir = Math.sign(K.rootX(t + .05) - x0) || f;
  const out = { ik: {}, pose: {}, root: {} }, F0 = feetAtStart(K, a);
  // roles: the foot that is planted (the front one if both are) keeps its foothold for the first stance; the other
  // takes the first swing, from wherever it is. Half a cycle apart, as a gait must be.
  const grounded = ['f', 'b'].filter(s2 => F0[s2].grounded);
  const keep = grounded.length === 1 ? grounded[0] : grounded.length === 2 ? (F0.f.rel >= F0.b.rel ? 'f' : 'b') : (F0.f.lift <= F0.b.lift ? 'f' : 'b');
  const swing1 = keep === 'f' ? 'b' : 'f', o = { [swing1]: Math.max(g.stance, .5) * cyc }; o[keep] = o[swing1] - cyc / 2;
  for (const side of ['f', 'b']) {
    const p = (D + o[side]) / cyc, k = Math.floor(p), q = p - k, rest = footRest(K, side);
    const plant = n => (n + g.stance / 2) * cyc - o[side];                                             // the n-th foothold, along the path from x0
    const first = k * cyc - o[side] <= 1e-6;                                                            // this cycle began before the gait did
    let rel, lift = 0, ang = 0;
    const swingTo = (from, lift0, v) => { const e = smooth(v); rel = lerp(from, plant(k + 1), e); lift = Math.sin(Math.PI * v) * g.lift * ll + lift0 * (1 - e); ang = .55 * Math.sin(Math.PI * v) * (1 - 2 * v); };
    if (first && side === keep) {
      // the kept foot stays where it stands until the hips are half a stance past it, then swings to its next foothold
      const Dl = Math.max(0, Math.min(k * cyc + g.stance * cyc - o[side], F0[side].rel + g.stance / 2 * cyc)), Dss = (k + 1) * cyc - o[side];
      if (D < Dl) rel = F0[side].rel; else swingTo(F0[side].rel, 0, clamp((D - Dl) / Math.max(1, Dss - Dl)));
    } else if (first && side === swing1 && q >= g.stance) {
      swingTo(F0[side].rel, F0[side].lift, (q - g.stance) / (1 - g.stance));                              // the first swing starts where the foot is
    } else if (q < g.stance) rel = plant(k);                                                                // stance: pinned
    else swingTo(plant(k), 0, (q - g.stance) / (1 - g.stance));
    out.ik['leg_' + side] = { w: 1, target: [x0 + dir * rel + f * rest, K.G - K.ankleH - lift], endAngle: ang * (dir === f ? 1 : -1), bend: 1 };
  }
  // the hips bob, lowest at mid-stance; the crouch keeps every stance foot within the leg's reach
  const q2 = ((D + o.f) / cyc * 2) % 1, mid = g.stance / 2;
  out.root.dy = g.bob * ll * Math.cos(Math.PI * 2 * (q2 - mid)) + (g.crouch || 0) * ll;
  const phase = (D + o.f) / cyc, sw = Math.sin(Math.PI * 2 * phase) * g.armAmp * a.p.arm_swing;
  Object.assign(out.pose, { spine: g.lean, neck: -g.lean * .6, upperarm_f: -sw - .1, upperarm_b: sw - .1, forearm_f: g.foreBend - .2 * Math.max(0, -sw), forearm_b: g.foreBend - .2 * Math.max(0, sw) });
  out.armHold = {};
  return out;
}
// reach (and pick up): crouch just enough that the prop's grip is within the arm's reach, lean in, the hand meets the
// grip by IK at 45 % of the action, holds it (attach), and the body rises with it
function reachOut(K, a, u, f, CP, pick) {
  const tgt = a.p.target; let gp = null;
  if (typeof tgt === 'string') { const pr = CP.props[tgt]; if (pr) gp = pr.restGrip; } else if (Array.isArray(tgt)) gp = tgt;
  if (!gp) return null;
  const h = a.p.hand || 'f', ll = K.legLen * K.s, x0 = K.rootX(a.start);
  const need = a.depth ??= reachDepth(K, a, gp, f, h);
  const down = u < .45 ? smooth(u / .45) : 1 - smooth((u - .55) / .45) * (u > .55 ? 1 : 0);
  // the hand: in by 45 % (IK onto the grip, turned to the handle), closes, then the IK lets go over 30 % while the
  // target rises with the body: the arm settles into the carry pose with the prop already in hand
  const hk = u < .45 ? smooth(u / .45) : 1 - smooth((u - .45) / .3);
  const pr = typeof tgt === 'string' ? CP.props[tgt] : null, handAng = (pr ? pr.rest.ang + pr.holdAngle : Math.PI / 2);
  const rise = u < .45 ? 0 : (down - 1) * need.depth * -1;   // how far the hips have come back up since the grab
  const target = [gp[0], gp[1] - (u < .45 ? 0 : need.depth * (1 - down))];
  return { root: { dy: down * need.depth }, pose: { spine: down * need.lean, neck: -down * need.lean * .5 },
    ik: { ['arm_' + h]: { w: hk, target, endAngle: handAng, bend: -1, grip: true }, ...feetPlanted(K, x0, f) }, reachHand: h };
}
function reachDepth(K, a, gp, f, h) {
  // the most comfortable pose (least knee bend, then least lean) whose shoulder is within 92 % of the arm's reach of
  // the grip: people bend at the hips as much as at the knees to pick something up (lean up to 1.3 rad, ~75°)
  const C = K.C, armLen = C.byName['upperarm_' + h].len + C.byName['forearm_' + h].len + C.byName['hand_' + h].len * .55;
  let best = null;
  for (let d = 0; d <= .9; d += .03) for (let lean = 0; lean <= 1.3; lean += .1) {   // up to a deep squat (short cartoon arms need it)
    const S = solveSkeleton(C, { x: K.rootX(a.start), y: K.standY + d * K.legLen * K.s, rot: 0, s: K.s, sx: 1, sy: 1, flip: f }, { spine: lean, neck: -lean * .5 });
    const sh = S.world['upperarm_' + h].a, cost = d + lean * .45;
    if (Math.hypot(gp[0] - sh[0], gp[1] - sh[1]) <= armLen * K.s * .92 && (!best || cost < best.cost)) best = { depth: d * K.legLen * K.s, lean, cost };
  }
  if (best) return best;
  console.warn(`${a.type}: the target is out of the arm's reach from where the character stands (move the prop or the character closer)`);
  return { depth: .9 * K.legLen * K.s, lean: .9, unreachable: true };
}

// ---------- secondary motion (automatic, scaled by squash_stretch / inertia / head_follow actions) ----------
function secondary(K, plan, t, st, f, CP) {
  const scale = name => K.acts.filter(a => a.type === name).reduce((m, a) => Math.max(m, t >= a.start && t <= a.end ? a.p.strength : 0), 1);
  const h = 1 / 30, x = K.rootX, ax = (x(t + h) - 2 * x(t) + x(t - h)) / (h * h);
  const yOf = tt => { const s2 = evalCharacter(K, plan, tt, CP, { noSecondary: true }); return s2.root.y; };
  const ay = (yOf(t + h) - 2 * (st.root.y + st.root.dy) + yOf(t - h)) / (h * h);
  const inert = clamp(-f * ax / 6000, -.12, .12) * scale('inertia');
  st.pose.spine = (st.pose.spine || 0) + inert;
  st.pose.head = (st.pose.head || 0) + clamp(ay / 40000, -.15, .15) * scale('head_follow') - inert * .6;
}

// ---------- props ----------
function buildProps(plan, CH, props) {
  const out = {};
  for (const pr of plan.props || []) {
    const A = props[pr.id]; if (!A) continue;
    const scale = (pr.scale ?? .75) * Object.values(CH)[0].s, an = A.spec.anchors;
    const anchor = k => [(an[k][0] - an.origin[0]) * scale, (an[k][1] - an.origin[1]) * scale];   // relative to the prop origin, prop frame
    // rest pose on the ground: origin placed so the image's lowest opaque row touches the ground line
    // at rest it lies on the ground, or on a surface (rest_on: a height as a fraction of the frame, e.g. a crate's top)
    const surf = (pr.rest_on ?? plan.ground_y) * H, restY = surf - (A.bottom - an.origin[1]) * scale, rest = { x: pr.x * W, y: pr.y != null ? pr.y * H : restY, ang: pr.angle || 0, flip: 1 };
    const g = anchor('grip');
    // the attachment timeline from the actions: pick_up attaches at 45 % of the action, drop releases at 35 %, transfer swaps hands at 50 %
    const ev = [];
    for (const a of plan.actions) {
      const ty = ACTION_ALIASES[a.type] || a.type, tgt = a.target ?? a.params?.target;
      if (tgt !== pr.id && !(['aim', 'fire', 'hold', 'carry'].includes(ty))) continue;
      if (ty === 'pick_up') ev.push({ t: a.start + a.duration * .45, kind: 'attach', hand: a.hand || a.params?.hand || 'f', char: a.character || plan.characters[0].id });
      if (ty === 'drop') ev.push({ t: a.start + a.duration * .35, kind: 'release' });
      if (ty === 'transfer') ev.push({ t: a.start + a.duration * .5, kind: 'swap', hand: a.to || a.params?.to || 'b' });
    }
    ev.sort((a, b) => a.t - b.t);
    out[pr.id] = { pr, A, scale, anchor, rest, restGrip: [rest.x + g[0], rest.y + g[1]], ev, holdAngle: A.spec.hold_angle ?? .6 };
  }
  return out;
}
// where is each prop at time t, and which hands solve onto it
function evalProps(CP, plan, t, frame) {
  const res = {};
  for (const [id, P] of Object.entries(CP.props)) {
    let state = { mode: 'world' }, attachT = null, hand = 'f', char = plan.characters[0].id, releaseT = null;
    for (const e of P.ev) { if (e.t > t) break; if (e.kind === 'attach') { state = { mode: 'hand' }; attachT = e.t; hand = e.hand; char = e.char; } if (e.kind === 'release') { state = { mode: 'world' }; releaseT = e.t; } if (e.kind === 'swap') hand = e.hand; }
    res[id] = { P, mode: state.mode, attachT, releaseT, hand, char };
  }
  return res;
}
