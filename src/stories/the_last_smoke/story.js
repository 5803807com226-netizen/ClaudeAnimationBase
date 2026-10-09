// the_last_smoke/story.js: five 3 s shots of ONE rigged traveller (rig_spec.js) on the existing engine: defineCharacter /
// drawCharacter (two-bone IK, follow-through drag), the cameraMove and particleBurst presets, the look system.
// Every pose is a pure function of time (parallel / out-of-order rendering is safe). The walk is solved from PLANTED
// foot and staff targets in world space, so feet and staff cannot slide; window.RIG_QA(t) reports the contact error.
(() => {
  if (typeof defineCharacter !== 'function') return;   // tools/gen_assets reads this story's manifests in a sandbox
  const R = window.SMOKE_RIG;
  const DIR = (new URLSearchParams(location.search).get('assets') || 'assets/stories/the_last_smoke/').replace(/\/?$/, '/');
  const IM = {}, FILES = [];
  const want = f => (FILES.push(f), f);
  (window.PRELOAD = window.PRELOAD || []).push(async () => {
    for (const f of FILES) try { IM[f] = await loadImage(DIR + f); } catch (e) { console.error('the_last_smoke: missing ' + DIR + f); }
  });
  const E = Object.fromEntries(['environments/s01_sky', 'environments/s01_far_mountains', 'environments/s01_mid_mountains', 'environments/s01_ridge',
    'environments/s01_foreground', 'fx/s01_fog_back', 'fx/s01_fog_front', 'environments/s02_sky', 'environments/s02_far_mountains',
    'environments/s02_walkable_path', 'environments/s02_foreground_gravel', 'fx/s02_dust', 'environments/s03_soft_valley', 'environments/s04_soft_stone',
    'details/s04_right_hand_relaxed', 'details/s04_right_hand_tense', 'details/s04_staff_close', 'details/s04_left_bandaged_forearm', 'fx/s04_dust_mote',
    'environments/s05_sky', 'environments/s05_far_valley', 'environments/s05_mid_valley', 'environments/s05_cliff', 'fx/s05_smoke_puff', 'fx/s05_campfire']
    .map(k => [k.split('/')[1], want(k + '.png')]));

  // ---------- rigs from the spec (images never boil: a painted feature look, not hand-drawn jitter) ----------
  const rig = (spec, id, lag = .14) => defineCharacter({ id, lag, parts: spec.parts.map(p => ({
    name: p.name, parent: p.parent, joint: p.joint || [0, 0], z: p.z, drag: p.drag,
    img: p.files ? { src: Object.fromEntries(Object.entries(p.files).map(([k, f]) => [k, DIR + spec.dir + f])), pick: q => q.eyesState || 'open', w: p.w, h: p.h, anchor: p.anchor, boil: 0 }
      : { src: DIR + spec.dir + p.file, w: p.w, h: p.h, anchor: p.anchor, boil: 0 } })) });
  const BODY = rig(R.body, 'wanderer_side'), HERO3Q = rig(R.hero3q, 'wanderer_3q', .2), FACE = rig(R.face, 'wanderer_face', .18), BACK = rig(R.back, 'wanderer_back', .2);
  const BP = Object.fromEntries(R.body.parts.map(p => [p.name, p]));

  // ---------- 2.5D layers: depth 0 = infinitely far, 1 = the character's plane ----------
  // ?freezecam (render.mjs --query=freezecam): every camera holds its first framing, to prove the SUBJECT moves on its own
  const FREEZE = new URLSearchParams(location.search).has('freezecam');
  const camOf = (c, lt) => { const k = FREEZE ? 0 : easeBy(c.ease || 'ease')(seg(lt, 0, c.dur)); return c.from.map((v, i) => lerp(v, c.to[i], k)); };
  function layer(f, cam, d, x, y, w, h, o = {}) {   // (x, y) = layer centre in the depth-1 world; w, h in px at zoom 1
    const im = IM[f]; if (!im) return;
    const [cx, cy, z] = cam, zd = 1 + (z - 1) * d, cxd = W / 2 + (cx - W / 2) * d, cyd = H / 2 + (cy - H / 2) * d;
    push(); imageMode(CENTER); if (o.alpha != null) tint(255, 255 * clamp(o.alpha));
    image(im, W / 2 + (x - cxd) * zd, H / 2 + (y - cyd) * zd, w * zd * (o.s || 1), h * zd * (o.s || 1)); pop();
  }
  const aspectOf = f => IM[f] ? IM[f].height / IM[f].width : 1;
  const band = (f, cam, d, y, w, o) => layer(f, cam, d, W / 2 + (o?.dx || 0), y, w, w * aspectOf(f), o);   // a full-width band at height y
  // the character plane uses the engine's camera preset with the same keys, so parallax and rig agree exactly
  const inCam = (c, lt, fn) => preset('cameraMove', lt, { from: c.from, to: FREEZE ? c.from : c.to, at: 0, dur: c.dur, ease: c.ease || 'ease' }, fn);
  const breath = (t, rate = .3, ph = 0) => Math.sin((t * rate + ph) * TAU);

  // ================= S02: the walk (solved first: S01's stance and RIG_QA reuse it) =================
  const U2 = 105, GROUND = H * .8, P = 1.35, CYC = 2 * P, SWING = 1.13, V = 1.25 / P;   // step period, swing time, speed u/s
  const SPEC = R.body, ANK = SPEC.ankle_height, TOE = SPEC.foot_toe, HEEL = SPEC.foot_heel, GRIP = SPEC.staff_grip_to_tip;
  const X0 = W * .32 / U2;                                         // root x at shot start, in u (world)
  const rootX = t => X0 + V * t;
  const STRIKE = { foot_l: .70, foot_r: .70 + P };                 // heel strikes (local s): the two footfalls
  const PLANT_AHEAD = .62;                                         // heel lands this far ahead of the hip (u)
  // planted ankle x for the stance that began at heel strike ts (u)
  const plantX = ts => rootX(ts) + PLANT_AHEAD;
  const rot2 = (r, [x, y]) => [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
  // foot state at t: { ank: [x, y] in u (y up from ground), roll (rad, + = heel up / toe down), stance }
  function footState(name, t) {
    let ts = STRIKE[name]; while (ts > t) ts -= CYC; while (ts + CYC <= t) ts += CYC;   // the last strike at or before t
    const lift = ts + CYC - SWING, x = plantX(ts);
    const stanceAt = (tt, xp, tsp) => {                           // heel-strike flatten, flat, heel-roll toward toe-off
      const lft = tsp + CYC - SWING, rHeel = -.25 * (1 - easeOut(seg(tt, tsp, tsp + .16))), rToe = .6 * ease(seg(tt, lft - .42, lft));
      if (rHeel < -1e-4) { const [ox, oy] = rot2(rHeel, [HEEL, ANK]); return { ank: [xp + HEEL - ox, oy], roll: rHeel }; }
      const [ox, oy] = rot2(rToe, [TOE, ANK]); return { ank: [xp + TOE - ox, oy], roll: rToe };
    };
    if (t < lift) return { ...stanceAt(t, x, ts), stance: true, plant: x };
    const k = seg(t, lift, ts + CYC), A = stanceAt(lift, x, ts), x2 = plantX(ts + CYC);
    const [hx, hy] = rot2(-.25, [HEEL, ANK]), B = { ank: [x2 + HEEL - hx, hy], roll: -.25 };   // landing pose
    const s = ease(k);
    return { ank: [lerp(A.ank[0], B.ank[0], s), lerp(A.ank[1], B.ank[1], s) + .42 * Math.sin(Math.PI * Math.pow(k, .8))],
      roll: lerp(A.roll, B.roll, s) + .25 * Math.sin(Math.PI * k), stance: false };
  }
  // staff: planted (tip fixed) or swinging forward to the next plant; taps at local 1.35 s and 2.50 s (spec)
  const TAPS = [-.15, 1.35, 2.5, 3.9], STAFF_AHEAD = 1.15;
  function staffTip(t) {
    let i = 0; while (i + 1 < TAPS.length && TAPS[i + 1] <= t) i++;
    const tp = TAPS[i], nx = TAPS[i + 1], lift = nx - .4, x = rootX(tp) + STAFF_AHEAD;
    if (t < lift) return { tip: [x, 0], planted: true };
    const k = seg(t, lift, nx), x2 = rootX(nx) + STAFF_AHEAD;
    return { tip: [lerp(x, x2, ease(k)), .35 * Math.sin(Math.PI * k)], planted: false };
  }
  const W2 = ([x, y]) => [x * U2, GROUND - y * U2];               // u (y up from ground) → world px
  function walkPose(t) {
    const bob = .075 * Math.cos(TAU * (t - STRIKE.foot_l) / P), hipY = 4.0 - bob;        // lowest just after each strike
    const rx = rootX(t), pelvisY = GROUND - hipY * U2, pelvisX = rx * U2;
    const L = footState('foot_l', t), Rf = footState('foot_r', t), S = staffTip(t);
    const sway = .035 * Math.sin(TAU * (t - STRIKE.foot_l) / CYC);
    const lean = .2 + .03 * Math.cos(TAU * (t - STRIKE.foot_l) / P);
    // staff + right arm: the grip lies on the staff's line, GRIP u from the tip, toward a natural chest-high hand position
    const tipW = W2(S.tip), sh = [pelvisX + (.05 + .15 * Math.cos(lean) + 2.25 * Math.sin(lean)) * U2, pelvisY - (.15 + 2.25 * Math.cos(lean)) * U2];
    const want = [sh[0] + .7 * U2, sh[1] + 1.55 * U2], dx = want[0] - tipW[0], dy = want[1] - tipW[1], dl = Math.hypot(dx, dy);
    const grip = [tipW[0] + dx / dl * GRIP * U2, tipW[1] + dy / dl * GRIP * U2], ang = Math.atan2(tipW[1] - grip[1], tipW[0] - grip[0]) - Math.PI / 2;
    const [ox, oy] = rot2(ang, [0, BP.staff.joint[1] * U2]), wrist = [grip[0] - ox, grip[1] - oy];
    const swingL = Math.sin(TAU * (t - STRIKE.foot_l) / CYC);           // far arm counter-swings against the far leg
    return {
      _qa: { L, R: Rf, S, tipW, grip },
      pelvis: { rot: sway * .5 }, torso: { rot: lean + sway, sy: 1 + .012 * breath(t, .55) },
      head: { rot: -lean * .55 - .08 + .03 * Math.sin(TAU * (t - .2) / P) },
      scarf_back: { rot: .1 * wob(t, .9) + .05 * wob(t, 2.3, .4) }, scarf_front: { rot: .04 * wob(t, 1.1, .2) },
      hair_back: { rot: .06 * wob(t, 1.3) }, robe_hem: { rot: .05 * swingL },
      thigh_l: { ik: { lower: 'calf_l', end: 'foot_l', target: W2(L.ank), k: 1, bend: -1 } }, foot_l: { worldRot: L.roll, worldK: 1 },
      thigh_r: { ik: { lower: 'calf_r', end: 'foot_r', target: W2(Rf.ank), k: 1, bend: -1 } }, foot_r: { worldRot: Rf.roll, worldK: 1 },
      upper_arm_l: { rot: -lean + .06 - .12 * swingL }, forearm_l: { rot: -.22 - .06 * swingL }, hand_l: { rot: .08 },   // a tired free arm: mostly hangs
      upper_arm_r: { ik: { lower: 'forearm_r', end: 'hand_r', target: wrist, k: 1, bend: 1 } },
      hand_r: { worldRot: ang, worldK: 1 }, staff: { worldRot: ang, worldK: 1 },
      _root: [pelvisX, pelvisY],
    };
  }
  // contact QA (tools/rig_contact_check.mjs): solved joint positions vs the planted targets, in px
  window.RIG_QA = t => {
    const q = walkPose(t), { T } = rigPose(BODY, q._root[0], q._root[1], U2, () => walkPose(t), t);
    const tip = rigPoint(T, 'staff', [0, GRIP], U2), fl = [T.foot_l.x, T.foot_l.y], fr = [T.foot_r.x, T.foot_r.y];
    // the point the foot pivots on (heel while landing / flat, toe while rolling off): it must not move during its phase
    const sole = n => { const s = footState(n, t); return s.roll > 1e-4 ? { p: rigPoint(T, n, [TOE, ANK], U2), pivot: 'toe' } : { p: rigPoint(T, n, [HEEL, ANK], U2), pivot: 'heel' }; };
    return { t, footL: { err: Math.hypot(fl[0] - W2(q._qa.L.ank)[0], fl[1] - W2(q._qa.L.ank)[1]), stance: q._qa.L.stance, contact: sole('foot_l').p, pivot: sole('foot_l').pivot },
      footR: { err: Math.hypot(fr[0] - W2(q._qa.R.ank)[0], fr[1] - W2(q._qa.R.ank)[1]), stance: q._qa.R.stance, contact: sole('foot_r').p, pivot: sole('foot_r').pivot },
      staff: { err: Math.hypot(tip[0] - q._qa.tipW[0], tip[1] - q._qa.tipW[1]), planted: q._qa.S.planted, tip }, ground: GROUND,
      knees: { l: T.calf_l.a - T.thigh_l.a, r: T.calf_r.a - T.thigh_r.a } };
  };
  const C2 = { from: [W * .5, H * .55, 1.0], to: [W * .5 + V * U2 * 3 * .55, H * .55, 1.02], dur: 3 };   // tracks ~55 % of his travel
  function shot2(t, lt) {
    const cam = camOf(C2, lt);
    background('#3A4868');
    band(E.s02_sky, cam, 0, H * .45, W * 1.6);
    band(E.s02_far_mountains, cam, .25, H * .58, W * 2.0);
    inCam(C2, lt, () => {
      layer(E.s02_walkable_path, [W / 2, H / 2, 1], 1, W * .9, GROUND + W * 2.2 * aspectOf(E.s02_walkable_path) / 2 - 30, W * 2.2, W * 2.2 * aspectOf(E.s02_walkable_path));
      const q = walkPose(lt); drawCharacter(BODY, q._root[0], q._root[1], U2, walkPose, lt);
      for (const [n, ts] of Object.entries(STRIKE)) {             // restrained contact dust: two soft puffs per heel strike
        const a = lt - ts; if (a < 0 || a > 1.1) continue;
        const x = (plantX(ts) + HEEL) * U2, k = easeOut(seg(a, 0, 1.1)), fade = .55 * (1 - seg(a, .25, 1.1)) * ease(seg(a, 0, .08));
        for (const sd of [-1, 1]) layer(E.s02_dust, [W / 2, H / 2, 1], 1, x + sd * (14 + 46 * k), GROUND - 8 - 18 * k, 70 + 60 * k, (70 + 60 * k) * .6, { alpha: fade });
      }
    });
    band(E.s02_foreground_gravel, cam, 1.3, GROUND + 150, W * 2.4);
  }

  // ================= S01: wide on the ridge, 3/4 hero; wind, breath, fog layers moving against each other =================
  const C1 = { from: [W * .5, H * .5, 1.0], to: [W * .5 + 20, H * .49, 1.07], dur: 3, ease: 'easeOut' }, U1 = 72, RIDGE_Y = H * .7;   // easeOut: the opening moves from frame 1
  const STAND_TOP = .12;   // s01_ridge.png: its flat standing top is at 12 % of the image height (calibrate per real plate)
  function shot1(t, lt) {
    const cam = camOf(C1, lt);
    background('#2E3A58');
    band(E.s01_sky, cam, 0, H * .5, W * 1.3);
    band(E.s01_far_mountains, cam, .15, H * .5, W * 1.5);
    band(E.s01_fog_back, cam, .3, H * .55, W * 1.6, { dx: 110 * lt - 150, alpha: .7 + .1 * breath(lt, .4) });   // streams right
    band(E.s01_mid_mountains, cam, .4, H * .6, W * 1.5);
    inCam(C1, lt, () => {
      const rw = W * 1.4, rh = rw * aspectOf(E.s01_ridge);           // the plate's standing line (STAND_TOP of its height) meets his feet
      layer(E.s01_ridge, [W / 2, H / 2, 1], 1, W / 2, RIDGE_Y + rh * (.5 - STAND_TOP), rw, rh);
      const b = breath(lt, .38, -.1);
      drawCharacter(HERO3Q, W * .4, RIDGE_Y, U1, t2 => ({
        // one full breath (shoulders rise, chest fills), a slow weight shift onto the staff, the head lifting toward the valley
        body3q: { sy: 1 + .022 * breath(t2, .36, -.1), sx: 1 - .006 * breath(t2, .36, -.1), rot: -.018 * ease(seg(t2, .2, 2.4)) },
        head3q: { rot: -.06 + .07 * ease(seg(t2, .4, 1.8)) - .012 * breath(t2, .36), dy: -.1 * ease(seg(t2, .4, 1.8)) },
        // wind: a gusting scarf tail and cloak tip (two frequencies, so the cloth never loops visibly in 3 s)
        scarf3q: { rot: .26 * wob(t2, .75) + .1 * wob(t2, 2.3, .3) + .12 * ease(seg(t2, 1.0, 1.6)) }, hem3q: { rot: .1 * wob(t2, .65, .5) + .04 * wob(t2, 1.9) },
      }), lt);
    });
    band(E.s01_fog_front, cam, 1.15, H * .74, W * 1.8, { dx: -140 * lt + 160, alpha: .55 });               // streams left, against it
    band(E.s01_foreground, cam, 1.35, H * .93, W * 1.7);
  }

  // ================= S03: face close-up — blink at 1.15 s, eye dart, one breath, head nod, hair wisps =================
  const C3 = { from: [W * .5, H * .5, 1.0], to: [W * .5, H * .49, 1.025], dur: 3 }, U3 = W / 5.4;
  function shot3(t, lt) {
    const cam = camOf(C3, lt);
    background('#5A6A8A');
    layer(E.s03_soft_valley, cam, .2, W * .5 - 25 * lt, H * .5, W * 1.35, W * 1.35 * aspectOf(E.s03_soft_valley));   // haze drifts on its own
    inCam(C3, lt, () => drawCharacter(FACE, W * .5, H * .5 + 3.3 * U3, U3, t2 => {
      const bl = blinkAt(t2, [1.15], .2), b = breath(t2, .33, .1), dart = saccade(t2, [[0, [0, 0]], [1.9, [.05, -.01]], [2.6, [0, 0]]]);
      return { eyesState: bl > .5 ? 'closed' : 'open', face: { rot: -.015 + .02 * ease(seg(t2, .3, 1.4)) - .012 * ease(seg(t2, 2.0, 2.9)), dy: -.05 * b, sy: 1 + .006 * b },
        eyes: { dx: dart[0], dy: dart[1] }, wisps: { rot: .05 * wob(t2, .6) + .02 * wob(t2, 1.7, .2) } };
    }, lt));
  }

  // ================= S04: macro — RIGHT hand tightens on the staff; LEFT bandaged forearm separate; dust motes =================
  const C4 = { from: [W * .5, H * .5, 1.0], to: [W * .5, H * .5, 1.012], dur: 3 };
  function shot4(t, lt) {
    const cam = camOf(C4, lt), Wd = W * 1.04, Hd = Wd * 16 / 9, k = ease(seg(lt, .9, 1.6));
    background('#6E6052');
    layer(E.s04_soft_stone, cam, .2, W / 2 + 10 * lt, H / 2, W * 1.3, W * 1.3 * aspectOf(E.s04_soft_stone));
    for (let i = 0; i < 9; i++) {                                // suspended dust, drifting in world space
      const a = lt + i * 1.7, x = W * (.08 + .1 * i) + 40 * Math.sin(a * .7 + i), y = H * (.15 + .08 * ((i * 37) % 10)) - 22 * lt;
      layer(E.s04_dust_mote, cam, .6, x, y, 30, 30, { alpha: .35 + .25 * Math.sin(a * 1.3) });
    }
    layer(E.s04_staff_close, cam, 1, W / 2, H / 2, Wd, Hd);
    const sq = 1 - .012 * k, up = -6 * k;                           // knuckles tighten: a slight squeeze up the staff
    // the tense hand fades in ON TOP of a fully opaque relaxed hand (no see-through ghost mid-change), which then drops out
    if (k < 1) layer(E.s04_right_hand_relaxed, cam, 1, W / 2, H / 2 + up, Wd, Hd, { s: sq });
    if (k > 0) layer(E.s04_right_hand_tense, cam, 1, W / 2, H / 2 + up, Wd, Hd, { s: sq, alpha: k });
    const b = breath(lt, .35);
    layer(E.s04_left_bandaged_forearm, cam, 1.15, W / 2 - 12 + 8 * b, H / 2 + 10 * b, Wd, Hd);
  }

  // ================= S05: over the shoulder — smoke rises in world space from a distant fire =================
  const C5 = { from: [W * .5, H * .5, 1.0], to: [W * .5 + 30, H * .5, 1.045], dur: 3 }, U5 = 205, FIRE = [W * .7, H * .64];   // the fire sits ON the far valley floor (calibrate per real plate)
  function smoke(cam, lt) {                                      // puffs emitted every .32 s from 9.5 s before the shot: a full plume at frame 1
    for (let i = 0; i < 40; i++) {
      const born = -9.5 + i * .32 + (hash(i) - .5) * .1, age = lt - born; if (age < 0 || age > 9.5) continue;
      const rise = 48 * age - 1.2 * age * age, x = FIRE[0] + 2.2 * Math.pow(age, 1.9) + 7 * Math.sin(age * .9 + i), y = FIRE[1] - rise;   // a column that leans with the breeze as it climbs
      const r = 12 + 10 * age, a = .55 * ease(seg(age, 0, .8)) * (1 - seg(age, 5, 9.5));
      layer(E.s05_smoke_puff, cam, .35, x, y, r * 2, r * 2, { alpha: a });
    }
    layer(E.s05_campfire, cam, .35, FIRE[0], FIRE[1] + 4, 26, 26, { alpha: .75 + .25 * Math.sin(lt * 23) * Math.sin(lt * 7.3) });
  }
  function shot5(t, lt) {
    const cam = camOf(C5, lt);
    background('#4B5878');
    band(E.s05_sky, cam, 0, H * .45, W * 1.3);
    glow(W * .7, H * .42, W * .45, '#FFC27A', .25 + .3 * ease(seg(lt, 0, 3)));      // the sun glow ramps up
    band(E.s05_far_valley, cam, .3, H * .7, W * 1.5);
    smoke(cam, lt);
    band(E.s05_mid_valley, cam, .5, H * .97, W * 1.5);   // stays below the fire so the plume reads
    band(E.s05_cliff, cam, .85, H * .88, W * 1.4);
    inCam(C5, lt, () => drawCharacter(BACK, W * .22, H + 1.2 * U5, U5, t2 => {
      const b = breath(t2, .4), lift = .5 - .5 * Math.cos(Math.PI * seg(t2, .6, 2.2));
      return { back_body: { dy: -.06 * lift - .02 * b, sy: 1 + .008 * b }, back_head: { rot: .05 * ease(seg(t2, 1.2, 2.6)), dx: .05 * ease(seg(t2, 1.2, 2.6)) },
        back_scarf: { rot: .16 * wob(t2, .7) + .07 * wob(t2, 1.9, .4) } };
    }, lt));
  }

  shots([[0, shot1], [3, shot2], [6, shot3], [9, shot4], [12, shot5]]);
})();
