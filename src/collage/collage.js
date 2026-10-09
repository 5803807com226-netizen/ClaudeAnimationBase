// collage/collage.js: ARTWORK-FIRST scenes. A scene is DATA (a manifest: layers of imported PNG artwork, camera keys,
// text, reveals); this file only plays it. Artwork is designed outside the code (Z Image / Qwen / hand-made) and is never
// drawn here: layers are placed, given depth, shadows and paper treatment, and moved. Pure function of time.
//
//   SCENES.id = {                                   // in a story file, e.g. src/stories/<id>/scene.js (JSON-safe data)
//     assets: 'assets/stories/<id>/scene1/', duration: 3, look: 'collage',
//     camera: [[t, x, y, zoom, ease], ...],           // world px (the world is the 1080 × 1920 page), zoom in log space
//     boil: { amp: 1.5, rot: .4, rate: 12 },          // optional: stop-motion jitter on every stepped (step ≥ 2) cut-out
//     layers: [{                                      // drawn in order (back to front)
//       id, file: 'name.png', size: [w] | [null, h],  // world px; the other side follows the image's aspect (never stretched)
//       at: [x, y], anchor: [ax, ay] (0..1 of the image, default centre), rot (deg), scale, opacity, depth (parallax: 1 = page),
//       paper: { shadow: { dx, dy, blur, opacity, color }, border: px, borderColor, grain: 0..1 },
//       keys: [[t, { x, y, rot, scale, opacity }, ease], ...],   // absolute values at times (missing = unchanged)
//       step: 2,                                      // animate on twos (12 fps holds: a hand-made feel); 1 = smooth
//       reveal: { kind: 'place', at, dur, from: 'top' | 'bottom' | 'left' | 'right', dist, rot (deg), lift },
//       motion: [{ kind, ... }, ...],                 // COLLAGE MOTIONS (below), applied in order after keys and reveal
//       boil: false | { amp, rot, rate },             // per layer (false: never jitter, e.g. a hand that must stay on its grip)
//       fill: true,                                   // a full-bleed backdrop: must cover the frame under every camera
//       subject: true,                                // text must never cover it (typeOverlay subjects)
//     }],
//     type: [ typeOverlay items ],  narration: [{ at, end, text }]   // live Thai text; beats kept for retiming
//   };
//   aspects: ['9:16', '16:9', '4:5'] (formats it supports); camera and any placement value may be per format: { '9:16': …, … }
//   playCollage(SCENES.id)                                     one scene
//   playCollage([SCENES.a, SCENES.b, …])                       a reel: scenes back to back; a scene's
//     transition: { kind: 'cut' | 'fade' | 'push' | 'slide', dur, focus: [x, y], zoom, from, color }   joins it to the one before
const SCENES = window.SCENES = window.SCENES || {};
const COLLAGE_IMG = {};   // file → { img, cut, shadow, pad } prepared once
const COLLAGE_PIECES = {};   // file|pieces → the cut split into torn wedges (the peel motion)

// A shared camera from keys [[t, x, y, zoom, ease]]: eased segments, zoom interpolated in log space (pushes feel even).
// ease 'smooth' on a key: that segment is part of ONE continuous move (cubic Hermite, the velocity carried through the
// keys, so a multi-key pan never jerks at a key; it starts and ends at rest). Other eases: each segment on its own.
function cameraKeys(keys) {
  const EZ = { ease, easeIn, easeOut, linear: clamp, backOut };
  const P = keys.map(k => [k[1], k[2], Math.log(k[3])]), T = keys.map(k => k[0]), n = keys.length;
  const vel = keys.map((k, i) => i === 0 || i === n - 1 || keys[i][4] !== 'smooth' || keys[i + 1][4] !== 'smooth' ? [0, 0, 0]   // rest at the ends of a smooth run
    : P[i].map((_, j) => (P[i + 1][j] - P[i - 1][j]) / Math.max(1e-6, T[i + 1] - T[i - 1])));
  return t => {
    let i = 1; while (i < n - 1 && t > keys[i][0]) i++;
    const [t0, x0, y0, z0] = keys[i - 1], [t1, x1, y1, z1, e] = keys[i];
    if (e === 'smooth') {
      const h = Math.max(1e-6, t1 - t0), u = clamp((t - t0) / h), u2 = u * u, u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
      const q = [0, 1, 2].map(j => h00 * P[i - 1][j] + h10 * h * vel[i - 1][j] + h01 * P[i][j] + h11 * h * vel[i][j]);
      return [q[0], q[1], Math.exp(q[2])];
    }
    const k = (EZ[e] || ease)(seg(t, t0, t1));
    return [lerp(x0, x1, k), lerp(y0, y1, k), Math.exp(lerp(Math.log(z0), Math.log(z1), k))];
  };
}

// ---------- COLLAGE MOTIONS: reusable, data-driven moves for cut-out layers ----------
// Each takes the layer's state s ({ x, y, rot, scale, opacity, lift, crop, peel }) at quantized time t and changes it.
// `m` is the motion's data (defaults merged), `L` the layer, `X` the scene context ({ stateById }). Pure functions of t.
// Add a motion here (with about + defaults); it shows up in the capability catalog as collage.<name>.
const DIRV = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] };
const motionEase = e => ({ ease, easeIn, easeOut, backOut, linear: clamp })[e] || (typeof e === 'function' ? e : ease);
const COLLAGE_MOTIONS = {
  place: { about: 'a cut-out laid onto the page: arrives from off the page lifted (bigger, softer shadow), overshoots a touch, presses down and settles with a small rotational wobble',
    defaults: { at: 0, dur: .6, from: 'bottom', dist: 900, rot: 6, lift: 1, overshoot: .5, wobble: 2.5, press: .025 },
    apply(s, t, m) {
      const k = seg(t, m.at, m.at + m.dur), o = m.overshoot, v = DIRV[m.from] || DIRV.bottom, end = m.at + m.dur;
      const e = k >= 1 ? 1 : 1 + (o + 1) * Math.pow(k - 1, 3) + o * Math.pow(k - 1, 2);   // lands a little past its spot, comes back
      if (t < m.at) s.opacity = 0;
      s.x += v[0] * m.dist * (1 - e); s.y += v[1] * m.dist * (1 - e);
      s.rot += m.rot * (1 - easeOut(k)) + m.wobble * spring(t, end, 7, 17);
      s.lift = m.lift * (1 - easeIn(k)) + .25 * spring(t, end, 8, 20);
      s.scale *= (1 + .04 * Math.max(0, s.lift)) * (1 - (t >= end ? m.press * Math.exp(-14 * (t - end)) : 0));   // the press on landing
    } },
  pop: { about: 'stop-motion grow from the anchor (put the anchor at the base for trees and buildings): 0 → overshoot → rest',
    defaults: { at: 0, dur: .45, from: 0, overshoot: 1.9, rot: 6 },
    apply(s, t, m, L) {
      if (t < m.at) { s.opacity = 0; return; }
      const k = seg(t, m.at, m.at + m.dur), o = m.overshoot, b = k >= 1 ? 1 : 1 + (o + 1) * Math.pow(k - 1, 3) + o * Math.pow(k - 1, 2);
      s.scale *= lerp(m.from, 1, b); s.rot += m.rot * (1 - k) * (hash((L.id || '').length + m.at) < .5 ? -1 : 1);
    } },
  wipe: { about: 'draw-on reveal with a torn paper edge: from one side (dir), or along a path drawn like a brush (roads, rivers, ribbons, bridges); out: true wipes it away',
    defaults: { at: 0, dur: .8, dir: 'right', ease: 'easeOut', out: false, tear: .025, path: null, width: .3 },
    apply(s, t, m) {
      let k = motionEase(m.ease)(seg(t, m.at, m.at + m.dur)); if (m.out) k = 1 - k;
      if (k <= 0) { s.opacity = 0; return; }
      if (k < 1) s.crop = { m, k: Math.round(k * 240) / 240 };   // 240 steps: masks are cached per step
    } },
  peel: { about: 'the cut-out comes apart in torn wedges: each lifts on a hinge, is flicked off and tumbles away under gravity (front and back of the paper alternating) until it leaves the frame, uncovering the layer beneath',
    defaults: { at: 0, dur: 1.2, pieces: 6, stagger: .6, speed: 700, gravity: 3200, spin: 300, start: -90, back: '#F6EBD8', flight: 1.5, seed: 1 },
    apply(s, t, m) { s.peel = { m, t }; if (t < m.at) return; if (t >= m.at + m.dur + m.flight) s.opacity = 0; } },
  follow: { about: 'ride on another layer (a hand carrying the object it places), trailing it slightly; at until it lets go and eases back off the object (release)',
    defaults: { target: '', grip: [0, 0], until: 1e9, turn: true, drag: .03, maxDrag: 18, release: [0, 40], releaseDur: .18 },
    apply(s, t, m, L, X) {
      const tt = Math.min(t, m.until), o = X.stateById(m.target, tt); if (!o) return;
      // drag: the hand trails its object a little (by its velocity, capped), like a wrist following the fingers
      const p = X.stateById(m.target, tt - .04), vx = (o.x - p.x) / .04, vy = (o.y - p.y) / .04, vm = Math.hypot(vx, vy), dg = vm ? Math.min(m.maxDrag, vm * m.drag) / vm : 0;
      const r = easeOut(seg(t, m.until, m.until + m.releaseDur));
      s.x = o.x + m.grip[0] - vx * dg + m.release[0] * r; s.y = o.y + m.grip[1] - vy * dg + m.release[1] * r; if (m.turn) s.rot += o.rot - (X.layerById(m.target).rot || 0);
      s.opacity *= o.opacity > .01 ? 1 : 0; s.lift = Math.max(s.lift, o.lift);
    } },
  leave: { about: 'exit off the page with anticipation (a small wind-up the other way, then away: a hand withdrawing, an object thrown away)',
    defaults: { at: 0, dur: .5, to: 'bottom', dist: 1300, rot: 8, anticipate: 1.2 },
    apply(s, t, m) {
      if (t < m.at) return; const k = seg(t, m.at, m.at + m.dur), a = m.anticipate, e = (a + 1) * k * k * k - a * k * k, v = DIRV[m.to] || DIRV.bottom;   // back-in
      s.x += v[0] * m.dist * e; s.y += v[1] * m.dist * e; s.rot += m.rot * e; if (k >= 1) s.opacity = 0;
    } },
  roll: { about: 'roll along a path (a fruit, a ball, a coin): spins by the distance travelled; hops lose height each bounce and the shadow stays on the ground (smaller and fainter in the air); optional dashed trail',
    defaults: { at: 0, dur: 2, path: [], ease: 'ease', hops: 0, hop: 120, decay: .6, spin: true, trail: null },
    apply(s, t, m, L, X) {
      const P = pathInfo(m.path); if (!P) return;
      const k = motionEase(m.ease)(seg(t, m.at, m.at + m.dur)), d = k * P.len, [x, y] = pathAt(P, d);
      s.x = x; s.y = y;
      if (m.hops && k < 1) { const u = k * m.hops, n = Math.floor(u); s.air = m.hop * Math.pow(m.decay, n) * Math.sin(Math.PI * (u - n)); s.y -= s.air; }
      if (m.spin) s.rot += d / Math.max(1, X.sizeOf(L)[0] / 2) * 180 / Math.PI;
      if (m.trail) s.trail = { P, d };
    } },
  walk: { about: 'a small cut-out figure walks: travels at a speed with a step bob and a rock (crowds, passers-by)',
    defaults: { at: 0, dur: 1e9, speed: 120, bob: 8, steps: 2.2, rock: 3 },
    apply(s, t, m) {
      const u = clamp(t - m.at, 0, m.dur); s.x += m.speed * u;
      const ph = Math.PI * 2 * m.steps * u; s.y -= m.bob * Math.abs(Math.sin(ph)); s.rot += m.rock * Math.sin(ph + .6);
    } },
  sway: { about: 'a breeze sway about the anchor (trees, flags, signs)', defaults: { amp: 3, hz: .4, phase: 0 },
    apply(s, t, m) { s.rot += m.amp * Math.sin(Math.PI * 2 * (m.hz * t + m.phase)); } },
  float: { about: 'a gentle float (planes, balloons, letters)', defaults: { amp: 10, hz: .5, phase: 0, x: 0 },
    apply(s, t, m) { const q = Math.PI * 2 * (m.hz * t + m.phase); s.y += m.amp * Math.sin(q); s.x += m.x * Math.cos(q); } },
  spin: { about: 'turn about the anchor', defaults: { at: 0, dur: 1, turns: 1, ease: 'ease' },
    apply(s, t, m) { s.rot += 360 * m.turns * motionEase(m.ease)(seg(t, m.at, m.at + m.dur)); } },
  appear: { about: 'a replacement cut with a stop-motion flicker (season change, swapped objects): hidden, then on/off, then on',
    defaults: { at: 0, flutter: 2, rate: 12 },
    apply(s, t, m) { const n = Math.floor((t - m.at) * m.rate); if (t < m.at || (n < 2 * m.flutter && n % 2 === 1)) s.opacity = 0; } },
  vanish: { about: 'the reverse of appear: a flicker, then gone', defaults: { at: 0, flutter: 2, rate: 12 },
    apply(s, t, m) { const n = Math.floor((t - m.at) * m.rate); if (t >= m.at && (n >= 2 * m.flutter || n % 2 === 0)) s.opacity = 0; } },
  cycle: { about: 'replacement animation (the stop-motion way to animate): several layers on one spot are frames of one cycle, shown one at a time at fps (walk cycles, flags, flames, smoke, blinking signs)',
    defaults: { at: 0, dur: 1e9, index: 0, count: 2, fps: 8, pingpong: false, hold: 'first' },
    apply(s, t, m) {
      if (t < m.at) { if (m.index !== 0) s.opacity = 0; return; }
      if (t >= m.at + m.dur) { if (m.index !== (m.hold === 'last' ? m.count - 1 : 0)) s.opacity = 0; return; }
      const n = Math.floor((t - m.at) * m.fps + 1e-6), per = m.pingpong ? 2 * m.count - 2 : m.count, q = n % Math.max(1, per), f = q < m.count ? q : per - q;
      if (f !== m.index) s.opacity = 0;
    } },
  drop: { about: 'falls in from above under gravity and bounces to rest, losing height each bounce, with a landing wobble',
    defaults: { at: 0, height: 900, gravity: 5200, bounce: .32, bounces: 2, wobble: 4 },
    apply(s, t, m) {
      if (t < m.at) { s.opacity = 0; return; }
      const g = m.gravity, t1 = Math.sqrt(2 * m.height / g); let tt = t - m.at, y;
      if (tt < t1) { y = m.height - .5 * g * tt * tt; s.lift = .6 * y / m.height; }
      else {   // closed-form bounces: each one restitution × the last impact speed
        tt -= t1; let v = g * t1 * m.bounce, n = 0; y = 0;
        while (n < m.bounces) { const d = 2 * v / g; if (tt < d) { y = v * tt - .5 * g * tt * tt; break; } tt -= d; v *= m.bounce; n++; }
        s.rot += m.wobble * spring(t, m.at + t1, 6, 16);
      }
      s.y -= y;
    } },
  swing: { about: 'hangs from its anchor (put the anchor at the pin) and swings to rest like a pendulum: hanging signs, tags, lanterns; enter: true swings in from out of frame',
    defaults: { at: 0, amp: 24, hz: 1.1, decay: 2.2, enter: false },
    apply(s, t, m) {
      if (t < m.at) { if (m.enter) s.opacity = 0; return; }
      const u = t - m.at; s.rot += m.amp * Math.exp(-m.decay * u) * Math.cos(TAU * m.hz * u);
      if (m.enter) { const k = easeOut(seg(u, 0, .35)); s.y -= (1 - k) * 600; }
    } },
  fly: { about: 'travels along a smooth path (planes, birds, cars on a road, a paper boat): optional facing along the path and banking into turns',
    defaults: { at: 0, dur: 2, path: [], ease: 'ease', orient: false, face: 0, bank: 0, smooth: true, hide: false, scaleTo: 1 },
    apply(s, t, m) {
      const P = pathInfo(m.smooth ? smoothPath(m.path) : m.path); if (!P) return;
      if (m.hide && (t < m.at || t > m.at + m.dur)) { s.opacity = 0; return; }
      if (t < m.at && !m.hide) return;   // until it sets off, the layer keeps its own place and pose (start the path there)
      const k = motionEase(m.ease)(seg(t, m.at, m.at + m.dur)), d = k * P.len, [x, y] = pathAt(P, d), w = easeOut(seg(t, m.at, m.at + Math.min(.3, m.dur * .25)));
      s.x = x; s.y = y; s.scale *= lerp(1, m.scaleTo, k);   // scaleTo: perspective (smaller as it drives into the distance)
      if (m.orient || m.bank) {
        const a = pathAt(P, Math.max(0, d - 12)), b = pathAt(P, Math.min(P.len, d + 12)), c = pathAt(P, Math.min(P.len, d + 40));
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), ang2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
        if (m.orient) s.rot += w * (ang * 180 / Math.PI + m.face);   // the facing turns in over the first moment, never snaps
        if (m.bank) s.rot += w * m.bank * ((ang2 - ang + 3 * Math.PI) % TAU - Math.PI) * 180 / Math.PI * 4;
      }
    } },
  flutter: { about: 'drifts down like a falling leaf, petal or paper scrap: side-to-side sway, rocking, slow fall',
    defaults: { at: 0, dur: 3, fall: 900, sway: 110, hz: .7, rock: 28, phase: 0 },
    apply(s, t, m) {
      if (t < m.at) { s.opacity = 0; return; }
      const u = t - m.at, q = TAU * (m.hz * u + m.phase); s.y += m.fall * u / m.dur; s.x += m.sway * Math.sin(q); s.rot += m.rock * Math.cos(q);
    } },
  slam: { about: 'stamped onto the page: drops in from big and lifted, hits hard with a short shake (titles, stamps, stickers, a big reveal)',
    defaults: { at: 0, dur: .16, from: 1.9, shake: 14, rot: -6 },
    apply(s, t, m) {
      if (t < m.at) { s.opacity = 0; return; }
      const k = easeIn(seg(t, m.at, m.at + m.dur)), a = t - m.at - m.dur;
      s.scale *= lerp(m.from, 1, k); s.lift = Math.max(s.lift, 2 * (1 - k)); s.rot += m.rot * (1 - k);
      if (a > 0 && a < .35) { const d = m.shake * Math.exp(-11 * a); s.x += d * Math.sin(a * 95); s.y += d * Math.cos(a * 77) * .6; }
    } },
  shake: { about: 'a decaying jolt at a moment (an impact, a door slam, a surprise)',
    defaults: { at: 0, dur: .4, amp: 10, rot: 2, hz: 18 },
    apply(s, t, m) {
      const a = t - m.at; if (a < 0 || a > m.dur) return; const d = Math.pow(1 - a / m.dur, 2), q = TAU * m.hz * a;
      s.x += m.amp * d * Math.sin(q); s.y += m.amp * .5 * d * Math.cos(q * 1.3); s.rot += m.rot * d * Math.sin(q * .9);
    } },
  pulse: { about: 'a gentle breathing scale (draws the eye to a focus object, a heart, a button)', defaults: { at: 0, amp: .04, hz: .8 },
    apply(s, t, m) { if (t >= m.at) s.scale *= 1 + m.amp * Math.sin(TAU * m.hz * (t - m.at)); } },
  orbit: { about: 'circles around a point (a plane around a globe, a moon, satellites); depth makes the near half bigger',
    defaults: { center: [540, 960], rx: 300, ry: 90, hz: .3, phase: 0, depth: .15, at: 0 },
    apply(s, t, m) { const q = TAU * (m.hz * Math.max(0, t - m.at) + m.phase); s.x = m.center[0] + m.rx * Math.cos(q); s.y = m.center[1] + m.ry * Math.sin(q); s.scale *= 1 + m.depth * Math.sin(q); } },
  boil: { about: 'stop-motion jitter on held frames (a hand-animated feel)', defaults: { amp: 1.5, rot: .4, rate: 12 },
    apply(s, t, m, L) { const n = Math.floor(t * m.rate), h = hash(n * 3.1 + (L.id || '').length * 17.3);
      s.x += (h - .5) * 2 * m.amp; s.y += (hash(n * 7.7 + 1.3) - .5) * 2 * m.amp; s.rot += (hash(n * 5.3 + 9.1) - .5) * 2 * m.rot; } },
};
// Verified aspect support per collage motion (tools/aspect_test.mjs target collage_reel; never list a ratio that has not passed).
// Fixtures: collage_reel and collage_kit (aspect_test targets of the same names).
const COLLAGE_MOTION_ASPECTS = Object.fromEntries(['place', 'pop', 'wipe', 'peel', 'follow', 'leave', 'roll', 'walk', 'sway', 'float', 'appear', 'vanish', 'boil',
  'cycle', 'drop', 'swing', 'fly', 'flutter', 'slam', 'shake', 'pulse', 'orbit', 'spin',
  'transition.push', 'transition.slide', 'transition.tear', 'transition.iris', 'transition.whip', 'transition.fade', 'transition.cut'].map(n => [n, ['9:16', '16:9']]));
const COLLAGE_TRANSITIONS = { tear: 'the scene is torn in two along a ragged paper edge and the halves pulled apart, the next one underneath (at: where, 0..1 of the width)', iris: 'the next scene opens out of a ragged paper hole growing from focus (screen fractions)', whip: 'a fast whip pan: out one side, in from the other, with smear echoes (from: side the next comes from)', cut: 'hard cut', fade: 'cross-dissolve', push: 'one continuous zoom: into the outgoing scene\'s focus while the next grows out of it (match cut); paper: true dips through paper', slide: 'the next scene slides over the last like a sheet of paper, with a shadowed edge' };

// a path through the given points, smoothed (centripetal-free Catmull-Rom, sampled): flights never kink at a point
function smoothPath(pts, per = 12) {
  if (!pts || pts.length < 3) return pts; const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let j = 0; j < per; j++) { const u = j / per, u2 = u * u, u3 = u2 * u;
      out.push([0, 1].map(c => .5 * (2 * p1[c] + (-p0[c] + p2[c]) * u + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * u2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * u3))); }
  }
  out.push(pts[pts.length - 1]); return out;
}
// a polyline: lengths for travel by distance
function pathInfo(pts) {
  if (!pts || pts.length < 2) return null; const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, len: cum[cum.length - 1] };
}
function pathAt(P, d) {
  let i = 1; while (i < P.pts.length - 1 && d > P.cum[i]) i++;
  const k = clamp((d - P.cum[i - 1]) / Math.max(1e-6, P.cum[i] - P.cum[i - 1])), a = P.pts[i - 1], b = P.pts[i];
  return [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
}

// ---------- image preparation (once per file, on a 2D canvas) ----------
function canvasOf(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
function silhouette(src, col) {   // the image's alpha, filled with one colour
  const c = canvasOf(src.width, src.height), x = c.getContext('2d');
  x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, c.width, c.height); return c;
}
const toP5 = c => { if (!c) return null; const g = createGraphics(c.width, c.height); g.pixelDensity(1); g.drawingContext.drawImage(c, 0, 0); return g; };
function prepareLayerImage(el, paper = {}, scale = 1) {
  // scale = image px per world px (so borders and blurs given in world px are right at any image resolution)
  const border = (paper.border || 0) * scale, blur = (paper.shadow?.blur ?? 0) * scale, pad = Math.ceil(border + blur * 2 + 4);
  // 1. the artwork with paper grain multiplied inside its own shape
  let art = canvasOf(el.width, el.height); const a = art.getContext('2d'); a.drawImage(el, 0, 0);
  if (paper.grain) {
    const n = canvasOf(el.width, el.height), nx = n.getContext('2d'), id = nx.createImageData(n.width, n.height), rnd = lcg(7);
    for (let i = 0; i < id.data.length; i += 4) { const v = 255 - rnd() * rnd() * 60; id.data[i] = v; id.data[i + 1] = v - 2; id.data[i + 2] = v - 5; id.data[i + 3] = 255; }
    nx.putImageData(id, 0, 0);
    a.save(); a.globalAlpha = clamp(paper.grain); a.globalCompositeOperation = 'multiply'; a.drawImage(n, 0, 0); a.restore();
    a.globalCompositeOperation = 'destination-in'; a.drawImage(el, 0, 0); a.globalCompositeOperation = 'source-over';
  }
  // 2. the cut: a paper margin around the shape (alpha dilated in a ring of offsets), then the artwork on top
  const cut = canvasOf(el.width + 2 * pad, el.height + 2 * pad), cx = cut.getContext('2d');
  if (border > 0) { const s = silhouette(el, paper.borderColor || '#FBF6EC'); for (let i = 0; i < 24; i++) { const q = i / 24 * TAU; cx.drawImage(s, pad + Math.cos(q) * border, pad + Math.sin(q) * border); } }
  cx.drawImage(art, pad, pad);
  // 3. the cast shadow: the cut's silhouette, blurred
  let shadow = null;
  if (paper.shadow) {
    shadow = canvasOf(cut.width, cut.height); const sx = shadow.getContext('2d');
    sx.filter = `blur(${blur}px)`; sx.drawImage(silhouette(cut, paper.shadow.color || '#2B1E14'), 0, 0); sx.filter = 'none';
  }
  // the visible artwork's bounds (fractions of the image), measured once on a small CPU canvas: subject boxes follow the art,
  // not the transparent canvas around it
  const sm = canvasOf(Math.min(256, el.width), Math.min(256, el.height) * Math.min(256, el.width) / el.width), smx = sm.getContext('2d', { willReadFrequently: true });
  smx.drawImage(el, 0, 0, sm.width, sm.height); const d = smx.getImageData(0, 0, sm.width, sm.height).data; let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (let y = 0; y < sm.height; y++) for (let x = 0; x < sm.width; x++) if (d[(y * sm.width + x) * 4 + 3] > 20) { x0 = Math.min(x0, x / sm.width); x1 = Math.max(x1, (x + 1) / sm.width); y0 = Math.min(y0, y / sm.height); y1 = Math.max(y1, (y + 1) / sm.height); }
  return { w: el.width, h: el.height, pad, cutC: cut, shadowC: shadow, cut: toP5(cut), shadow: toP5(shadow), bbox: x1 > x0 ? [x0, y0, x1, y1] : [0, 0, 1, 1] };
}
// The peel's pieces: the cut split into n wedges around the artwork's centre, along torn (jagged) lines. Each piece keeps
// the full cut's canvas size, so it draws exactly where the whole would; dir is its outward direction (image px).
function preparePieces(P, n, start = -90, back = '#F6EBD8') {
  const W0 = P.cutC.width, H0 = P.cutC.height, b = P.bbox, cx = P.pad + (b[0] + b[2]) / 2 * P.w, cy = P.pad + (b[1] + b[3]) / 2 * P.h;
  const R = Math.hypot(W0, H0), rnd = lcg(31 + n), J = 14, EPS = .03;   // EPS: neighbouring pieces overlap a little (no hairline seams)
  const qs = Array.from({ length: n + 1 }, (_, i) => (start * Math.PI / 180) + i / n * TAU + (i % n ? (rnd() - .5) * .35 : 0));
  const jit = qs.map(() => Array.from({ length: J }, () => (rnd() - .5) * .09)); jit[n] = jit[0];
  const edge = (i, off) => [[cx, cy], ...jit[i].map((w, j) => { const r = R * (j + 1) / J, q = qs[i] + w + off; return [cx + Math.cos(q) * r, cy + Math.sin(q) * r]; })];   // a torn line outwards
  return Array.from({ length: n }, (_, i) => {
    const poly = [...edge(i, -EPS), ...edge(i + 1, EPS).reverse()], mid = (qs[i] + qs[i + 1]) / 2;
    const clipTo = (src) => { if (!src) return null; const c = canvasOf(W0, H0), x = c.getContext('2d'); x.beginPath(); poly.forEach(([px, py], j) => j ? x.lineTo(px, py) : x.moveTo(px, py)); x.closePath(); x.clip(); x.drawImage(src, 0, 0); return toP5(c); };
    return { cut: clipTo(P.cutC), shadow: clipTo(P.shadowC), back: clipTo(silhouette(P.cutC, back)), dir: [Math.cos(mid), Math.sin(mid)], hinge: [cx + Math.cos(mid) * Math.min(P.w, P.h) * .25, cy + Math.sin(mid) * Math.min(P.w, P.h) * .25] };
  });
}

// ---------- one scene: build its players (the reel and the single scene both use this) ----------
function buildCollage(scene, sid = '', exitAt = null) {
  // ?assets=<dir> (render.mjs --assets=<dir>) swaps the artwork folder, e.g. for a mock preview kept apart from real art;
  // {scene} in it stands for the scene's id (a reel's scenes keep their own folders: --assets=out/mock_assets/<story>/{scene})
  const qdir = new URLSearchParams(location.search).get('assets'), dir0 = qdir ? qdir.replace(/\{scene\}/g, sid) : scene.assets || '', dir = dir0 ? dir0.replace(/\/?$/, '/') : '';
  const cam = cameraKeys(av(scene.camera) || [[0, W / 2, H / 2, 1, 'ease'], [scene.duration || DUR, W / 2, H / 2, 1, 'ease']]);
  const sceneBoil = scene.boil;
  // any placement value may be per format ({ '9:16': …, '16:9': …, '4:5': … }, responsive.js av)
  const layers = scene.layers.map(L0 => { const L = { ...L0 }; for (const k of ['at', 'size', 'anchor', 'rot', 'scale', 'opacity', 'depth', 'keys', 'reveal', 'motion']) if (k in L) L[k] = av(L[k]);
    const ms = [].concat(L.reveal || [], L.motion || []).map(m => av(m)).filter(Boolean).map(m => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, av(v)])));   // per-format values inside a motion too
    const bo = L.boil === false ? null : L.boil || ((L.step || 1) >= 2 && !L.fill && sceneBoil ? sceneBoil : null);
    if (bo) ms.push({ kind: 'boil', ...bo });
    const motions = ms.map(m => { const M = COLLAGE_MOTIONS[m.kind]; if (!M) throw new Error(`collage: unknown motion "${m.kind}" on layer ${L.id} (have: ${Object.keys(COLLAGE_MOTIONS).join(', ')})`); return { ...M.defaults, ...m }; });
    return { anchor: [.5, .5], rot: 0, scale: 1, opacity: 1, depth: 1, step: 1, ...L, motions, src: dir + L.file }; });
  const byId = Object.fromEntries(layers.map(L => [L.id, L]));
  (window.PRELOAD = window.PRELOAD || []).push(async () => {
    for (const L of layers) {
      if (!COLLAGE_IMG[L.src]) {
        try {
          const im = await loadImage(L.src);
          COLLAGE_IMG[L.src] = prepareLayerImage(im.canvas || im.elt || im, L.paper, L.size[0] == null ? im.height / L.size[1] : im.width / L.size[0]);
        } catch (e) { console.error(`collage: could not load ${L.src} (run tools/validate_assets.mjs)`); continue; }
      }
      for (const m of L.motions) if (m.kind === 'peel') { const key = `${L.src}|${m.pieces}|${m.start}|${m.back}`; if (!COLLAGE_PIECES[key]) COLLAGE_PIECES[key] = preparePieces(COLLAGE_IMG[L.src], m.pieces, m.start, m.back); }
    }
  });
  const quant = (t, step) => step > 1 ? Math.floor(t * 24 / step + 1e-6) / (24 / step) : t;
  // the layer's world-space size (never stretched)
  const sizeOf = L => { const P = COLLAGE_IMG[L.src], r = P ? P.h / P.w : 1;   // [w] or [null, h]: the other side follows the image
    return L.size[0] == null ? [L.size[1] / r, L.size[1]] : [L.size[0], L.size[1] ?? L.size[0] * r]; };
  const X = { stateById: (id, t) => byId[id] && stateOf(byId[id], t), layerById: id => byId[id], sizeOf };
  // a layer's state at time t: keys (absolute values), then its motions in order
  const stateOf = (L, t) => {
    const tq = quant(t, L.step), s = { x: L.at[0], y: L.at[1], rot: L.rot, scale: L.scale, opacity: L.opacity, lift: 0 };
    if (L.keys) for (const p of ['x', 'y', 'rot', 'scale', 'opacity']) {
      const ks = L.keys.filter(k => k[1][p] != null); if (!ks.length) continue;
      let v = ks[0][1][p], prevT = -Infinity, prevV = v;
      for (const [kt, kv, e] of ks) { if (tq >= kt) { v = kv[p]; prevT = kt; prevV = kv[p]; } else { if (prevT > -Infinity) v = lerp(prevV, kv[p], motionEase(e || 'ease')(seg(tq, prevT, kt))); break; } }
      s[p] = v;
    }
    for (const m of L.motions) COLLAGE_MOTIONS[m.kind].apply(s, tq, m, L, X);
    return s;
  };
  // the layer's screen box under the camera (for text avoidance and tests)
  const screenBox = (L, t) => {
    const s = stateOf(L, t), [w, h] = sizeOf(L), [cx, cy, z] = cam(t), shx = (cx - PARALLAX_REF[0]) * (1 - L.depth), shy = (cy - PARALLAX_REF[1]) * (1 - L.depth);
    const b = COLLAGE_IMG[L.src]?.bbox || [0, 0, 1, 1], ox = s.x - L.anchor[0] * w * s.scale + shx, oy = s.y - L.anchor[1] * h * s.scale + shy;
    const Xs = v => (v - cx) * z + W / 2, Ys = v => (v - cy) * z + H / 2;
    return { x0: Xs(ox + b[0] * w * s.scale), x1: Xs(ox + b[2] * w * s.scale), y0: Ys(oy + b[1] * h * s.scale), y1: Ys(oy + b[3] * h * s.scale) };
  };
  // the wipe's mask: the revealed part of the artwork (and of its shadow), on 2D canvases, cached per layer and step.
  // dir: a torn edge sweeps across the art's bounds; path: a round brush drawn along points given in fractions of the art.
  const MASKS = new Map();
  const maskedOf = (L, P, crop) => {
    const key = crop.k, hit = MASKS.get(L); if (hit && hit.key === key) return hit;
    if (hit) { hit.cut.remove(); hit.shadow?.remove(); }
    const m = crop.m, k = crop.k, W0 = P.cutC.width, H0 = P.cutC.height, b = P.bbox;
    const bx0 = P.pad + b[0] * P.w, bx1 = P.pad + b[2] * P.w, by0 = P.pad + b[1] * P.h, by1 = P.pad + b[3] * P.h, bw = bx1 - bx0, bh = by1 - by0;
    const mask = canvasOf(W0, H0), x = mask.getContext('2d'); x.fillStyle = x.strokeStyle = '#000';
    if (m.path && m.path.length > 1) {   // a brush along the path, up to k of its length; the leading end is round
      const pts = m.path.map(([u, v]) => [bx0 + u * bw, by0 + v * bh]), Pi = pathInfo(pts), d = k * Pi.len;
      x.lineCap = x.lineJoin = 'round'; x.lineWidth = m.width * bw; x.beginPath(); x.moveTo(...pts[0]);
      for (let i = 1; i < pts.length && Pi.cum[i - 1] < d; i++) x.lineTo(...(Pi.cum[i] <= d ? pts[i] : pathAt(Pi, d)));
      x.stroke();
    } else {   // a torn edge, perpendicular to dir, sweeping over the bounds (pad: the edge starts and ends fully outside)
      const horiz = m.dir === 'right' || m.dir === 'left', len = horiz ? bh : bw, span = horiz ? bw : bh, amp = m.tear * Math.min(bw, bh), N = 40, rnd = lcg(97);
      const jag = Array.from({ length: N + 1 }, () => (rnd() - .5) * 2 * amp), e = -amp + k * (span + 2 * amp);   // edge distance from the start side
      x.beginPath();
      const pt = (along, across) => horiz ? [m.dir === 'right' ? bx0 + across : bx1 - across, by0 + along] : [bx0 + along, m.dir === 'down' ? by0 + across : by1 - across];
      const far = -4 * amp - P.pad * 2;
      x.moveTo(...pt(-P.pad, far)); for (let i = 0; i <= N; i++) x.lineTo(...pt(-P.pad + (len + 2 * P.pad) * i / N, e + jag[i])); x.lineTo(...pt(len + P.pad, far)); x.closePath(); x.fill();
    }
    const apply = src => { if (!src) return null; const c = canvasOf(W0, H0), cx = c.getContext('2d'); cx.drawImage(mask, 0, 0); cx.globalCompositeOperation = 'source-in'; cx.drawImage(src, 0, 0); return toP5(c); };
    const out = { key, cut: apply(P.cutC), shadow: apply(P.shadowC) }; MASKS.set(L, out); return out;
  };
  const drawTrail = (L, s) => {   // the roll's dashed trail, on the path behind the object (a motion mark, not artwork)
    const m = L.motions.find(q => q.kind === 'roll'), tr = { color: '#E8541E', width: 5, dash: 16, gap: 12, len: 600, ...m.trail }, { P, d } = s.trail;
    push(); stroke(tr.color); strokeWeight(tr.width); noFill();
    for (let a = Math.max(0, d - tr.len); a < d - 30; a += tr.dash + tr.gap) { const p = pathAt(P, a), q = pathAt(P, Math.min(d - 30, a + tr.dash)); line(p[0], p[1] + (tr.dy ?? 0), q[0], q[1] + (tr.dy ?? 0)); }
    pop();
  };
  const drawLayer = (L, t, alpha = 1) => {
    const P = COLLAGE_IMG[L.src]; if (!P) return;
    const s = stateOf(L, t); if (s.trail) parallax(L.depth, () => drawTrail(L, s));
    if (s.opacity * alpha <= .003) return;
    const [w, h] = sizeOf(L), k = w / P.w, sh = L.paper?.shadow, op = s.opacity * alpha, R = s.rot * Math.PI / 180;
    const mk = s.crop ? maskedOf(L, P, s.crop) : null;
    // a world-space offset (light direction, gravity) in the layer's rotated, scaled frame
    const local = (dx, dy, rot = R) => [(Math.cos(rot) * dx + Math.sin(rot) * dy) / s.scale, (-Math.sin(rot) * dx + Math.cos(rot) * dy) / s.scale];
    parallax(L.depth, () => {
      flushBrush(); push(); translate(s.x, s.y); rotate(R); scale(s.scale);
      const ox = -L.anchor[0] * w - P.pad * k, oy = -L.anchor[1] * h - P.pad * k, dw = P.cut.width * k, dh = P.cut.height * k;
      // one cut-out (or a piece of one) with its shadow; rot: its total rotation (the shadow falls the same way whatever it is)
      const one = (cut, shadow, lift, o, rot = R) => {
        if (shadow) {   // the lift pushes the shadow further away and softer; in the air (a hop) it stays on the ground
          const lf = 1 + 2.2 * lift, air = s.air || 0, hs = air ? 1 / (1 + air / 260) : 1;
          const [sx, sy] = local((sh.dx ?? 8) * lf, (sh.dy ?? 12) * lf + air, rot), cxs = ox + dw / 2, cys = oy + dh / 2;
          tint(255, 255 * (sh.opacity ?? .35) * o * hs / (1 + .6 * lift));
          image(shadow, cxs - dw * hs * (1 + .02 * lift) / 2 + sx, cys - dh * hs * (1 + .02 * lift) / 2 + sy, dw * hs * (1 + .02 * lift), dh * hs * (1 + .02 * lift));
        }
        if (cut) { tint(255, 255 * o); image(cut, ox, oy, dw, dh); }
      };
      if (s.peel) drawPeel(L, P, s, ox, oy, k, one, op, local);
      else one(mk ? mk.cut : P.cut, mk ? mk.shadow : P.shadow, s.lift, op);
      noTint(); pop();
    });
  };
  // the peel: each piece lifts on its hinge, is flicked outward and up, then tumbles under gravity (the paper's front and
  // back alternating as it turns, held on the layer's frames) until it has left the frame. Pieces vary in timing, launch
  // angle, speed and spin; the uncovered layer shows through the gaps. Pure function of t.
  const drawPeel = (L, P, s, ox, oy, k, one, op, local) => {
    const { m, t } = s.peel, pcs = COLLAGE_PIECES[`${L.src}|${m.pieces}|${m.start}|${m.back}`];
    if (!pcs || t < m.at) { one(P.cut, P.shadow, s.lift, op); return; }   // whole until it starts: no seams
    const n = pcs.length, st = m.dur / Math.max(1, n - 1) * m.stagger, LIFT = .12;
    const poses = pcs.map((pc, i) => {
      const h = q => hash(i * 13.7 + m.seed * 3.1 + q), t0 = m.at + i * st + (h(1) - .5) * st * .6, tau = t - t0;
      return { pc, i, tau, sgn: h(2) < .5 ? -1 : 1, ang: (h(3) - .5) * .7, sp: .75 + .5 * h(4), spin: .7 + .6 * h(5), ph: h(6) * TAU };
    }).filter(p => p.tau < LIFT + m.flight);
    const R0 = s.rot * Math.PI / 180;
    const draw = (p, layer) => {
      const hx = ox + p.pc.hinge[0] * k, hy = oy + p.pc.hinge[1] * k, lift = clamp(p.tau / LIFT), f = Math.max(0, p.tau - LIFT);
      const c = Math.cos(p.ang), sn = Math.sin(p.ang), dx = p.pc.dir[0] * c - p.pc.dir[1] * sn, dy = p.pc.dir[0] * sn + p.pc.dir[1] * c;
      const v = m.speed * p.sp, wx = dx * v * f, wy = (dy * v - v * .55) * f + .5 * m.gravity * f * f;   // world px: flick out and up, then fall
      const [lx, ly] = local(wx, wy), rot = (p.sgn * (9 * lift + m.spin * p.spin * f)) * Math.PI / 180;
      const showBack = f > 0 && Math.cos(TAU * 1.6 * p.spin * f + p.ph) < -.2;   // tumbling: the back of the paper turns up
      push(); translate(lx, ly); translate(hx, hy); rotate(rot); scale(1 + .06 * lift); translate(-hx, -hy);
      if (layer === 'shadow') one(null, p.pc.shadow, .6 * lift + s.lift + f * 1.5, op, R0 + rot);
      else one(showBack ? p.pc.back : p.pc.cut, null, 0, op, R0 + rot);
      pop();
    };
    const rest = poses.filter(p => p.tau <= 0), moving = poses.filter(p => p.tau > 0).sort((a, b) => b.tau - a.tau);
    rest.forEach(p => draw(p, 'shadow')); rest.forEach(p => draw(p, 'art'));
    moving.forEach(p => { draw(p, 'shadow'); draw(p, 'art'); });
  };
  const subjects = t => layers.filter(L => L.subject && COLLAGE_IMG[L.src] && stateOf(L, t).opacity > .05).map(L => screenBox(L, t));
  // text that has no exit of its own leaves before the transition out of this scene (never frozen over a zoom or slide)
  const items = (scene.type || []).map(it => it.out || exitAt == null ? it : { ...it, out: { at: Math.max(it.at + .3, exitAt - .25), dur: .25, kind: 'up' } });
  const text = items.length ? typeOverlay({ narration: scene.narration || [], items, subjects, duration: scene.duration || DUR }) : null;
  const typeInfo = text ? window.TYPE_INFO : null;
  // draw the scene at local time t; v: { alpha, zoom (multiplier), focus: [x, y] (world point the zoom heads into) }
  const drawScene = (t, v = {}) => {
    const a = v.alpha ?? 1;
    if (a >= 1 && !v.rect) background(scene.background || '#EFE6D6');   // rect: inside a clip mask (background() would ignore it)
    else { push(); noStroke(); const c = color(scene.background || '#EFE6D6'); c.setAlpha(255 * a); fill(c); rect(-60, -60, W + 120, H + 120); pop(); }
    let [cx, cy, z] = cam(t);
    if (v.zoom && v.zoom !== 1) { const f = v.focus || [cx, cy], k = 1 - 1 / v.zoom; cx = lerp(cx, f[0], k); cy = lerp(cy, f[1], k); z *= v.zoom; }
    camBegin(cx, cy, z);
    for (const L of layers) drawLayer(L, t, a);
    camEnd();
  };
  return { scene, layers, cam, stateOf, screenBox, subjects, drawScene, text, typeInfo, duration: scene.duration || DUR };
}

// ---------- playing: one scene, or a reel of scenes joined by transitions ----------
function playCollage(sceneOrList) {
  const list = Array.isArray(sceneOrList) ? sceneOrList : [sceneOrList];
  const parts = []; let T0 = 0;
  list.forEach((S, j) => { const nt = list[j + 1] && av(list[j + 1].transition), d = nt && nt.kind !== 'cut' ? (nt.dur ?? .6) : 0;
    const B = buildCollage(S, Object.keys(SCENES).find(k => SCENES[k] === S) || '', d ? (S.duration || DUR) - d / 2 : null); parts.push({ ...B, start: T0, tr: { kind: 'cut', dur: 0, ...(av(S.transition) || {}) } }); T0 += B.duration; });
  const at = t => { let i = 0; while (i < parts.length - 1 && t >= parts[i + 1].start) i++; return i; };
  const veil = (k, col) => { if (k <= .003) return; push(); noStroke(); const c = color(col); c.setAlpha(255 * clamp(k)); fill(c); rect(-60, -60, W + 120, H + 120); pop(); };
  shots([[0, (t) => {
    const i = at(t), P = parts[i], lt = t - P.start, nx = parts[i + 1];
    // inside a transition window? [start - dur/2, start + dur/2] around the join with the next (or this) scene
    const join = nx && t >= nx.start - nx.tr.dur / 2 ? i + 1 : (P.tr.dur && lt < P.tr.dur / 2 && i > 0 ? i : -1);
    if (join < 0) { P.drawScene(lt); if (P.text) P.text.draw(lt); return; }
    const A = parts[join - 1], B = parts[join], tr = B.tr, d = tr.dur, u = seg(t, B.start - d / 2, B.start + d / 2);   // 0..1 across the join
    const la = t - A.start, lb = Math.max(0, t - B.start), paper = tr.color || B.scene.background || '#F4F1EA';
    if (tr.kind === 'push') {   // one continuous forward move: A rushes into its focus while B grows out of it (a match cut);
      // paper: true dips through the paper colour instead (the classic version)
      const Z = tr.zoom || 4, za = Math.exp(Math.log(Z) * easeIn(seg(u, 0, .62))), zb = Math.exp(Math.log(tr.from ?? .45) * (1 - easeOut(seg(u, .38, 1))));
      if (tr.paper) {
        if (u < .5) { A.drawScene(la, { zoom: za, focus: tr.focus }); veil(seg(u, .25, .5), paper); }
        else { B.drawScene(lb, { zoom: lerp(1.25, 1, easeOut((u - .5) * 2)) }); veil(1 - seg(u, .5, .75), paper); }
      } else {
        const mix = ease(seg(u, .38, .62));
        if (mix < 1) A.drawScene(la, { zoom: za, focus: tr.focus });
        if (mix > 0) B.drawScene(lb, { zoom: zb, alpha: mix });
      }
    } else if (tr.kind === 'fade') { A.drawScene(la); B.drawScene(lb, { alpha: ease(u) }); }
    else if (tr.kind === 'slide') {   // B slides over A like a sheet of paper; a soft shadow along its leading edge
      const v = DIRV[tr.from || 'right'], k = easeInOutCubic(u), dx = v[0] * W * (1 - k), dy = v[1] * H * (1 - k), gl = drawingContext;
      A.drawScene(la);
      if (k > 0) {
        push(); noStroke(); for (let j = 0; j < 8; j++) { fill(20, 14, 8, 10); rect(dx - v[0] * j * 5 - 4, dy - v[1] * j * 5 - 4, W + 8, H + 8); } pop();
        flushBrush(); gl.enable(gl.SCISSOR_TEST); gl.scissor(Math.max(0, dx), Math.max(0, -dy), W - Math.abs(dx), H - Math.abs(dy));
        push(); translate(dx, dy); B.drawScene(lb); pop(); flushBrush(); gl.disable(gl.SCISSOR_TEST);
      }
    } else if (tr.kind === 'tear') {   // A is torn in two along a ragged line; the halves are pulled apart, B is underneath
      const k = easeInOutCubic(u), N = 26, rnd = lcg(53), cx0 = W * (tr.at ?? .5), jag = Array.from({ length: N + 1 }, () => (rnd() - .5) * W * .05);
      const edge = side => Array.from({ length: N + 1 }, (_, i) => [cx0 + jag[i] + side * 3, -40 + (H + 80) * i / N]);
      B.drawScene(lb);
      for (const side of [-1, 1]) {
        const off = side * k * W * .62, rot = side * k * .12, e = edge(side), far = side * W * 1.5;
        push(); translate(W / 2 + off, H * .9); rotate(rot); translate(-W / 2, -H * .9);
        noStroke(); fill(20, 14, 8, 26 * Math.min(1, k * 6)); beginShape(); for (const [x, y] of e) vertex(x + side * 14, y + 10); vertex(cx0 + far, H + 60); vertex(cx0 + far, -60); endShape(CLOSE);   // its shadow on B
        push(); beginClip(); beginShape(); for (const [x, y] of e) vertex(x, y); vertex(cx0 + far, H + 60); vertex(cx0 + far, -60); endShape(CLOSE); endClip();
        A.drawScene(la, { rect: true }); pop();
        stroke(tr.edge || '#FBF7EE'); strokeWeight(5); noFill(); beginShape(); for (const [x, y] of e) vertex(x, y); endShape();   // the white torn fibre edge
        pop();
      }
    } else if (tr.kind === 'iris') {   // B opens out of a ragged paper hole growing from the focus (screen point, fractions)
      const k = easeInOutCubic(u), f = tr.focus ? [W * tr.focus[0], H * tr.focus[1]] : [W / 2, H / 2], R = k * Math.hypot(W, H) * 1.05, N = 48, rnd = lcg(71);
      const ring = Array.from({ length: N }, (_, i) => { const q = i / N * TAU, r = R * (1 + (rnd() - .5) * .08); return [f[0] + Math.cos(q) * r, f[1] + Math.sin(q) * r]; });
      A.drawScene(la);
      if (R > 1) {
        push(); beginClip(); beginShape(); for (const [x, y] of ring) vertex(x, y); endShape(CLOSE); endClip(); B.drawScene(lb, { rect: true, zoom: lerp(1.15, 1, k) }); pop();
        push(); stroke(tr.edge || '#FBF7EE'); strokeWeight(7); noFill(); beginShape(); for (const [x, y] of ring) vertex(x, y); endShape(CLOSE); pop();
      }
    } else if (tr.kind === 'whip') {   // a fast pan: A flies out, B flies in from the other side, with smear echoes on the move
      const v = DIRV[tr.from || 'right'], k = easeInOutCubic(u), sp = Math.sin(Math.PI * u);
      const shift = q => [-v[0] * W * q, -v[1] * H * q];
      const drawAt = (S, lt, q, alpha) => { push(); translate(...shift(q)); S.drawScene(lt, alpha < 1 ? { alpha, rect: true } : { rect: true }); pop(); };
      background(B.scene.background || '#EFE6D6');
      for (const [S, lt, q0] of [[A, la, 0], [B, lb, -1]]) {
        const q = q0 + k; if (Math.abs(q) >= 1.2) continue;
        for (let e = 3; e >= 1; e--) if (sp > .2) drawAt(S, lt, q - e * .04 * sp, .18 * sp);   // the smear: trailing echoes
        drawAt(S, lt, q, 1);
      }
    } else { (u < .5 ? A : B).drawScene(u < .5 ? la : lb); }
    const tP = u < .5 ? A : B, tl = u < .5 ? la : lb; if (tP.text) tP.text.draw(tl);
  }]]);
  // for tests and tools: the scene playing at t (subjects, type boxes and layer boxes in its own local time)
  const local = t => { const i = at(t); return [parts[i], t - parts[i].start]; };
  if (parts.some(p => p.typeInfo)) window.TYPE_INFO = t => { const [P, lt] = local(t); return P.typeInfo ? P.typeInfo(lt) : { safe: safeArea('title'), subjects: P.subjects(lt), items: [] }; };
  window.COLLAGE_INFO = { scene: parts[0].scene, layers: parts[0].layers, cam: parts[0].cam, stateOf: parts[0].stateOf, screenBox: parts[0].screenBox, subjects: t => { const [P, lt] = local(t); return P.subjects(lt); }, parts, local };
  return window.COLLAGE_INFO;
}
const easeInOutCubic = x => (x = clamp(x)) < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
