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
function cameraKeys(keys) {
  const EZ = { ease, easeIn, easeOut, linear: clamp, backOut };
  return t => {
    let i = 1; while (i < keys.length - 1 && t > keys[i][0]) i++;
    const [t0, x0, y0, z0] = keys[i - 1], [t1, x1, y1, z1, e] = keys[i], k = (EZ[e] || ease)(seg(t, t0, t1));
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
  place: { about: 'a cut-out laid onto the page: arrives from off the page lifted (bigger, softer shadow) and settles with a press',
    defaults: { at: 0, dur: .6, from: 'bottom', dist: 900, rot: 6, lift: 1 },
    apply(s, t, m) {
      const k = seg(t, m.at, m.at + m.dur), e = easeOut(k), v = DIRV[m.from] || DIRV.bottom;
      if (t < m.at) s.opacity = 0;
      s.x += v[0] * m.dist * (1 - e); s.y += v[1] * m.dist * (1 - e); s.rot += m.rot * (1 - e);
      s.lift = m.lift * (1 - easeIn(k)) + .25 * spring(t, m.at + m.dur, 8, 20);
      s.scale *= 1 + .04 * s.lift;
    } },
  pop: { about: 'stop-motion grow from the anchor (put the anchor at the base for trees and buildings): 0 → overshoot → rest',
    defaults: { at: 0, dur: .45, from: 0, overshoot: 1.9, rot: 6 },
    apply(s, t, m, L) {
      if (t < m.at) { s.opacity = 0; return; }
      const k = seg(t, m.at, m.at + m.dur), o = m.overshoot, b = k >= 1 ? 1 : 1 + (o + 1) * Math.pow(k - 1, 3) + o * Math.pow(k - 1, 2);
      s.scale *= lerp(m.from, 1, b); s.rot += m.rot * (1 - k) * (hash((L.id || '').length + m.at) < .5 ? -1 : 1);
    } },
  wipe: { about: 'draw-on reveal of the artwork from one side (roads, ribbons, bridges, lines); out: true wipes it away',
    defaults: { at: 0, dur: .8, dir: 'right', ease: 'easeOut', out: false },
    apply(s, t, m) {
      let k = motionEase(m.ease)(seg(t, m.at, m.at + m.dur)); if (m.out) k = 1 - k;
      if (k <= 0) { s.opacity = 0; return; }
      if (k < 1) s.crop = { dir: m.dir, k };
    } },
  peel: { about: 'the cut-out comes apart in torn wedges that lift and fall away one by one, uncovering the layer beneath (assemble: true runs it backwards)',
    defaults: { at: 0, dur: 1.2, pieces: 6, stagger: .6, dist: 520, fall: 900, spin: 70, start: -90, assemble: false },
    apply(s, t, m) { s.peel = { m, t }; if (!m.assemble && t >= m.at + m.dur) s.opacity = 0; if (m.assemble && t < m.at) s.opacity = 0; } },
  follow: { about: 'ride on another layer (a hand carrying the object it places): its position plus a grip offset, until a time',
    defaults: { target: '', grip: [0, 0], until: 1e9, turn: true },
    apply(s, t, m, L, X) {
      const o = X.stateById(m.target, Math.min(t, m.until)); if (!o) return;
      s.x = o.x + m.grip[0]; s.y = o.y + m.grip[1]; if (m.turn) s.rot += o.rot - (X.layerById(m.target).rot || 0);
      s.opacity *= o.opacity > .01 ? 1 : 0; s.lift = Math.max(s.lift, o.lift);
    } },
  leave: { about: 'exit off the page (a hand withdrawing, an object thrown away)',
    defaults: { at: 0, dur: .5, to: 'bottom', dist: 1300, rot: 8 },
    apply(s, t, m) {
      if (t < m.at) return; const k = seg(t, m.at, m.at + m.dur), e = easeIn(k), v = DIRV[m.to] || DIRV.bottom;
      s.x += v[0] * m.dist * e; s.y += v[1] * m.dist * e; s.rot += m.rot * e; if (k >= 1) s.opacity = 0;
    } },
  roll: { about: 'roll along a path (a fruit, a ball, a coin): spins by the distance travelled, optional hops and a dashed trail',
    defaults: { at: 0, dur: 2, path: [], ease: 'ease', hops: 0, hop: 120, spin: true, trail: null },
    apply(s, t, m, L, X) {
      const P = pathInfo(m.path); if (!P) return;
      const k = motionEase(m.ease)(seg(t, m.at, m.at + m.dur)), d = k * P.len, [x, y] = pathAt(P, d);
      s.x = x; s.y = y;
      if (m.hops) { const u = k * m.hops, n = Math.floor(u); s.y -= m.hop * Math.pow(.6, n) * Math.sin(Math.PI * (u - n)) * (k < 1 ? 1 : 0); }
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
  boil: { about: 'stop-motion jitter on held frames (a hand-animated feel)', defaults: { amp: 1.5, rot: .4, rate: 12 },
    apply(s, t, m, L) { const n = Math.floor(t * m.rate), h = hash(n * 3.1 + (L.id || '').length * 17.3);
      s.x += (h - .5) * 2 * m.amp; s.y += (hash(n * 7.7 + 1.3) - .5) * 2 * m.amp; s.rot += (hash(n * 5.3 + 9.1) - .5) * 2 * m.rot; } },
};
// Verified aspect support per collage motion (tools/aspect_test.mjs target collage_reel; never list a ratio that has not passed).
const COLLAGE_MOTION_ASPECTS = Object.fromEntries(['place', 'pop', 'wipe', 'peel', 'follow', 'leave', 'roll', 'walk', 'sway', 'float', 'appear', 'vanish', 'boil',
  'transition.push', 'transition.slide'].map(n => [n, ['9:16', '16:9']]));   // spin, fade and cut: not in the fixture yet ([] = experimental)
const COLLAGE_TRANSITIONS = { cut: 'hard cut', fade: 'cross-dissolve', push: 'zoom through the outgoing scene (into focus) to paper, then settle into the next', slide: 'the next scene slides over the last like a sheet of paper, with a shadowed edge' };

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
function preparePieces(P, n, start = -90) {
  const W0 = P.cutC.width, H0 = P.cutC.height, b = P.bbox, cx = P.pad + (b[0] + b[2]) / 2 * P.w, cy = P.pad + (b[1] + b[3]) / 2 * P.h;
  const R = Math.hypot(W0, H0), rnd = lcg(31 + n), J = 14, EPS = .03;   // EPS: neighbouring pieces overlap a little (no hairline seams)
  const qs = Array.from({ length: n + 1 }, (_, i) => (start * Math.PI / 180) + i / n * TAU + (i % n ? (rnd() - .5) * .35 : 0));
  const jit = qs.map(() => Array.from({ length: J }, () => (rnd() - .5) * .09)); jit[n] = jit[0];
  const edge = (i, off) => [[cx, cy], ...jit[i].map((w, j) => { const r = R * (j + 1) / J, q = qs[i] + w + off; return [cx + Math.cos(q) * r, cy + Math.sin(q) * r]; })];   // a torn line outwards
  return Array.from({ length: n }, (_, i) => {
    const poly = [...edge(i, -EPS), ...edge(i + 1, EPS).reverse()], mid = (qs[i] + qs[i + 1]) / 2;
    const clipTo = (src) => { if (!src) return null; const c = canvasOf(W0, H0), x = c.getContext('2d'); x.beginPath(); poly.forEach(([px, py], j) => j ? x.lineTo(px, py) : x.moveTo(px, py)); x.closePath(); x.clip(); x.drawImage(src, 0, 0); return toP5(c); };
    return { cut: clipTo(P.cutC), shadow: clipTo(P.shadowC), dir: [Math.cos(mid), Math.sin(mid)], hinge: [cx + Math.cos(mid) * Math.min(P.w, P.h) * .25, cy + Math.sin(mid) * Math.min(P.w, P.h) * .25] };
  });
}

// ---------- one scene: build its players (the reel and the single scene both use this) ----------
function buildCollage(scene, sid = '') {
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
      for (const m of L.motions) if (m.kind === 'peel') { const key = `${L.src}|${m.pieces}|${m.start}`; if (!COLLAGE_PIECES[key]) COLLAGE_PIECES[key] = preparePieces(COLLAGE_IMG[L.src], m.pieces, m.start); }
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
  // an image (or a crop of it: the wipe) at ox, oy, dw × dh in the layer's frame; the crop runs over the artwork's bbox
  const blit = (img, ox, oy, dw, dh, crop, P) => {
    if (!crop) { image(img, ox, oy, dw, dh); return; }
    const cw = img.width, ch = img.height, b = P.bbox, ax0 = (P.pad + b[0] * P.w) / cw, ax1 = (P.pad + b[2] * P.w) / cw, ay0 = (P.pad + b[1] * P.h) / ch, ay1 = (P.pad + b[3] * P.h) / ch;
    let u0 = 0, u1 = 1, v0 = 0, v1 = 1; const k = crop.k;
    if (crop.dir === 'right') u1 = lerp(ax0, ax1, k); else if (crop.dir === 'left') u0 = lerp(ax1, ax0, k);
    else if (crop.dir === 'down') v1 = lerp(ay0, ay1, k); else v0 = lerp(ay1, ay0, k);   // 'up': grows from the bottom
    if (u1 - u0 <= 0 || v1 - v0 <= 0) return;
    image(img, ox + u0 * dw, oy + v0 * dh, (u1 - u0) * dw, (v1 - v0) * dh, u0 * cw, v0 * ch, (u1 - u0) * cw, (v1 - v0) * ch);
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
    const [w, h] = sizeOf(L), k = w / P.w, sh = L.paper?.shadow, op = s.opacity * alpha;
    parallax(L.depth, () => {
      flushBrush(); push(); translate(s.x, s.y); rotate(s.rot * Math.PI / 180); scale(s.scale);
      const ox = -L.anchor[0] * w - P.pad * k, oy = -L.anchor[1] * h - P.pad * k, dw = P.cut.width * k, dh = P.cut.height * k;
      const one = (cut, shadow, lift, o) => {
        if (shadow) {   // the lift pushes the shadow further away and softer
          const lf = 1 + 2.2 * lift;
          tint(255, 255 * (sh.opacity ?? .35) * o / (1 + .6 * lift));
          blit(shadow, ox + (sh.dx ?? 8) * lf, oy + (sh.dy ?? 12) * lf, dw * (1 + .02 * lift), dh * (1 + .02 * lift), s.crop, P);
        }
        if (cut) { tint(255, 255 * o); blit(cut, ox, oy, dw, dh, s.crop, P); }
      };
      if (s.peel) drawPeel(L, P, s, ox, oy, dw, dh, k, one, op);
      else one(P.cut, P.shadow, s.lift, op);
      noTint(); pop();
    });
  };
  // the peel: pieces leave in turn (lift on a hinge, then fly outward and fall, spinning, fading); assemble reverses time
  const drawPeel = (L, P, s, ox, oy, dw, dh, k, one, op) => {
    const { m, t } = s.peel, pcs = COLLAGE_PIECES[`${L.src}|${m.pieces}|${m.start}`];
    if (!pcs || (!m.assemble && t < m.at) || (m.assemble && t >= m.at + m.dur)) { one(P.cut, P.shadow, s.lift, op); return; }   // whole: no seams
    const n = pcs.length, per = m.dur / (1 + (n - 1) * m.stagger), st = per * m.stagger;
    const poses = pcs.map((pc, i) => {
      const t0 = m.at + i * st; let q = seg(t, t0, t0 + per); if (m.assemble) q = 1 - seg(t, m.at + (n - 1 - i) * st, m.at + (n - 1 - i) * st + per);
      return q >= 1 ? null : { pc, i, q, lift: Math.min(1, q * 4), fly: easeIn(seg(q, .2, 1)), sgn: i % 2 ? 1 : -1 };
    }).filter(Boolean);
    const place = (p, fn) => {   // a piece lifts on its hinge, then flies outward and falls, spinning
      const hx = ox + p.pc.hinge[0] * k, hy = oy + p.pc.hinge[1] * k;
      push(); translate(p.pc.dir[0] * m.dist * p.fly, p.pc.dir[1] * m.dist * p.fly + m.fall * p.fly * p.fly);
      translate(hx, hy); rotate((p.sgn * 10 * p.lift + p.sgn * m.spin * p.fly) * Math.PI / 180); scale(1 + .06 * p.lift); translate(-hx, -hy); fn(); pop();
    };
    // resting pieces first (shadows, then art), then the moving ones above them, each with its own shadow
    const rest = poses.filter(p => p.q <= 0), moving = poses.filter(p => p.q > 0);
    rest.forEach(p => place(p, () => one(null, p.pc.shadow, s.lift, op)));
    rest.forEach(p => place(p, () => one(p.pc.cut, null, s.lift, op)));
    moving.forEach(p => place(p, () => one(p.pc.cut, p.pc.shadow, .6 * p.lift + s.lift, op * (1 - seg(p.q, .7, 1)))));
  };
  const subjects = t => layers.filter(L => L.subject && COLLAGE_IMG[L.src] && stateOf(L, t).opacity > .05).map(L => screenBox(L, t));
  const text = scene.type && scene.type.length ? typeOverlay({ narration: scene.narration || [], items: scene.type, subjects, duration: scene.duration || DUR }) : null;
  const typeInfo = text ? window.TYPE_INFO : null;
  // draw the scene at local time t; v: { alpha, zoom (multiplier), focus: [x, y] (world point the zoom heads into) }
  const drawScene = (t, v = {}) => {
    const a = v.alpha ?? 1;
    if (a >= 1) background(scene.background || '#EFE6D6');
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
  for (const S of list) { const B = buildCollage(S, Object.keys(SCENES).find(k => SCENES[k] === S) || ''); parts.push({ ...B, start: T0, tr: { kind: 'cut', dur: 0, ...(av(S.transition) || {}) } }); T0 += B.duration; }
  const at = t => { let i = 0; while (i < parts.length - 1 && t >= parts[i + 1].start) i++; return i; };
  const veil = (k, col) => { if (k <= .003) return; push(); noStroke(); const c = color(col); c.setAlpha(255 * clamp(k)); fill(c); rect(-60, -60, W + 120, H + 120); pop(); };
  shots([[0, (t) => {
    const i = at(t), P = parts[i], lt = t - P.start, nx = parts[i + 1];
    // inside a transition window? [start - dur/2, start + dur/2] around the join with the next (or this) scene
    const join = nx && t >= nx.start - nx.tr.dur / 2 ? i + 1 : (P.tr.dur && lt < P.tr.dur / 2 && i > 0 ? i : -1);
    if (join < 0) { P.drawScene(lt); if (P.text) P.text.draw(lt); return; }
    const A = parts[join - 1], B = parts[join], tr = B.tr, d = tr.dur, u = seg(t, B.start - d / 2, B.start + d / 2);   // 0..1 across the join
    const la = t - A.start, lb = Math.max(0, t - B.start), paper = tr.color || B.scene.background || '#F4F1EA';
    if (tr.kind === 'push') {   // into the focus of A, through paper, out of B's wider frame
      if (u < .5) { const k = easeIn(u * 2); A.drawScene(la, { zoom: Math.exp(Math.log(tr.zoom || 4) * k), focus: tr.focus }); veil(seg(u, .25, .5), paper); }
      else { const k = easeOut((u - .5) * 2); B.drawScene(lb, { zoom: lerp(1.25, 1, k) }); veil(1 - seg(u, .5, .75), paper); }
    } else if (tr.kind === 'fade') { A.drawScene(la); B.drawScene(lb, { alpha: ease(u) }); }
    else if (tr.kind === 'slide') {   // B slides over A like a sheet of paper; a soft shadow along its leading edge
      const v = DIRV[tr.from || 'right'], k = easeInOutCubic(u), dx = v[0] * W * (1 - k), dy = v[1] * H * (1 - k), gl = drawingContext;
      A.drawScene(la);
      if (k > 0) {
        push(); noStroke(); for (let j = 0; j < 8; j++) { fill(20, 14, 8, 10); rect(dx - v[0] * j * 5 - 4, dy - v[1] * j * 5 - 4, W + 8, H + 8); } pop();
        flushBrush(); gl.enable(gl.SCISSOR_TEST); gl.scissor(Math.max(0, dx), Math.max(0, -dy), W - Math.abs(dx), H - Math.abs(dy));
        push(); translate(dx, dy); B.drawScene(lb); pop(); flushBrush(); gl.disable(gl.SCISSOR_TEST);
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
