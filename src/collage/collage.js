// collage/collage.js: ARTWORK-FIRST scenes. A scene is DATA (a manifest: layers of imported PNG artwork, camera keys,
// text, reveals); this file only plays it. Artwork is designed outside the code (Z Image / Qwen / hand-made) and is never
// drawn here: layers are placed, given depth, shadows and paper treatment, and moved. Pure function of time.
//
//   SCENES.id = {                                   // in a story file, e.g. src/stories/<id>/scene.js (JSON-safe data)
//     assets: 'assets/stories/<id>/scene1/', duration: 3, look: 'collage',
//     camera: [[t, x, y, zoom, ease], ...],           // world px (the world is the 1080 × 1920 page), zoom in log space
//     layers: [{                                      // drawn in order (back to front)
//       id, file: 'name.png', size: [w] | [null, h],  // world px; the other side follows the image's aspect (never stretched)
//       at: [x, y], anchor: [ax, ay] (0..1 of the image, default centre), rot (deg), scale, opacity, depth (parallax: 1 = page),
//       paper: { shadow: { dx, dy, blur, opacity, color }, border: px, borderColor, grain: 0..1 },
//       keys: [[t, { x, y, rot, scale, opacity }, ease], ...],   // absolute values at times (missing = unchanged)
//       step: 2,                                      // animate on twos (12 fps holds: a hand-made feel); 1 = smooth
//       reveal: { kind: 'place', at, dur, from: 'top' | 'bottom' | 'left' | 'right', dist, rot (deg), lift },
//       fill: true,                                   // a full-bleed backdrop: must cover the frame under every camera
//       subject: true,                                // text must never cover it (typeOverlay subjects)
//     }],
//     type: [ typeOverlay items ],  narration: [{ at, end, text }]   // live Thai text; beats kept for retiming
//   };
//   aspects: ['9:16', '16:9', '4:5'] (formats it supports); camera and any placement value may be per format: { '9:16': …, … }
//   playCollage(SCENES.id)
const SCENES = window.SCENES = window.SCENES || {};
const COLLAGE_IMG = {};   // file → { img, cut, shadow, pad } prepared once

// A shared camera from keys [[t, x, y, zoom, ease]]: eased segments, zoom interpolated in log space (pushes feel even).
function cameraKeys(keys) {
  const EZ = { ease, easeIn, easeOut, linear: clamp, backOut };
  return t => {
    let i = 1; while (i < keys.length - 1 && t > keys[i][0]) i++;
    const [t0, x0, y0, z0] = keys[i - 1], [t1, x1, y1, z1, e] = keys[i], k = (EZ[e] || ease)(seg(t, t0, t1));
    return [lerp(x0, x1, k), lerp(y0, y1, k), Math.exp(lerp(Math.log(z0), Math.log(z1), k))];
  };
}

// ---------- image preparation (once per file, on a 2D canvas) ----------
function canvasOf(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
function silhouette(src, col) {   // the image's alpha, filled with one colour
  const c = canvasOf(src.width, src.height), x = c.getContext('2d');
  x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, c.width, c.height); return c;
}
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
  const toP5 = c => { if (!c) return null; const g = createGraphics(c.width, c.height); g.pixelDensity(1); g.drawingContext.drawImage(c, 0, 0); return g; };
  // the visible artwork's bounds (fractions of the image), measured once on a small CPU canvas: subject boxes follow the art,
  // not the transparent canvas around it
  const sm = canvasOf(Math.min(256, el.width), Math.min(256, el.height) * Math.min(256, el.width) / el.width), smx = sm.getContext('2d', { willReadFrequently: true });
  smx.drawImage(el, 0, 0, sm.width, sm.height); const d = smx.getImageData(0, 0, sm.width, sm.height).data; let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (let y = 0; y < sm.height; y++) for (let x = 0; x < sm.width; x++) if (d[(y * sm.width + x) * 4 + 3] > 20) { x0 = Math.min(x0, x / sm.width); x1 = Math.max(x1, (x + 1) / sm.width); y0 = Math.min(y0, y / sm.height); y1 = Math.max(y1, (y + 1) / sm.height); }
  return { w: el.width, h: el.height, pad, cut: toP5(cut), shadow: toP5(shadow), bbox: x1 > x0 ? [x0, y0, x1, y1] : [0, 0, 1, 1] };
}

// ---------- playing a scene ----------
function playCollage(scene) {
  // ?assets=<dir> (render.mjs --assets=<dir>) swaps the artwork folder, e.g. for a mock preview kept apart from real art
  const dir = new URLSearchParams(location.search).get('assets') || scene.assets || '';
  const cam = cameraKeys(av(scene.camera) || [[0, W / 2, H / 2, 1, 'ease'], [scene.duration || DUR, W / 2, H / 2, 1, 'ease']]);
  // any placement value may be per format ({ '9:16': …, '16:9': …, '4:5': … }, responsive.js av)
  const layers = scene.layers.map(L0 => { const L = { ...L0 }; for (const k of ['at', 'size', 'anchor', 'rot', 'scale', 'opacity', 'depth', 'keys', 'reveal']) if (k in L) L[k] = av(L[k]);
    return { anchor: [.5, .5], rot: 0, scale: 1, opacity: 1, depth: 1, step: 1, ...L, src: (dir ? dir.replace(/\/?$/, '/') : '') + L.file }; });
  (window.PRELOAD = window.PRELOAD || []).push(async () => {
    for (const L of layers) if (!COLLAGE_IMG[L.src]) {
      try {
        const im = await loadImage(L.src);
        COLLAGE_IMG[L.src] = prepareLayerImage(im.canvas || im.elt || im, L.paper, L.size[0] == null ? im.height / L.size[1] : im.width / L.size[0]);
      } catch (e) { console.error(`collage: could not load ${L.src} (run tools/validate_assets.mjs)`); }
    }
  });
  const quant = (t, step) => step > 1 ? Math.floor(t * 24 / step) / (24 / step) : t;
  // a layer's state at time t: keys (absolute values), then its reveal
  const stateOf = (L, t) => {
    const tq = quant(t, L.step), s = { x: L.at[0], y: L.at[1], rot: L.rot, scale: L.scale, opacity: L.opacity, lift: 0 };
    if (L.keys) for (const p of ['x', 'y', 'rot', 'scale', 'opacity']) {
      const ks = L.keys.filter(k => k[1][p] != null); if (!ks.length) continue;
      let v = ks[0][1][p], prevT = -Infinity, prevV = v;
      for (const [kt, kv, e] of ks) { if (tq >= kt) { v = kv[p]; prevT = kt; prevV = kv[p]; } else { if (prevT > -Infinity) v = lerp(prevV, kv[p], ({ ease, easeIn, easeOut, backOut, linear: clamp })[e || 'ease'](seg(tq, prevT, kt))); break; } }
      s[p] = v;
    }
    const R = L.reveal;
    if (R && R.kind === 'place') {   // a cut-out laid onto the page: arrives from off the page, lifted (bigger, softer
      const k = seg(tq, R.at, R.at + (R.dur ?? .6)), e = easeOut(k), d = R.dist ?? 900;   // shadow), and settles with a small press
      const v = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] }[R.from || 'bottom'];
      if (tq < R.at) s.opacity = 0;
      s.x += v[0] * d * (1 - e); s.y += v[1] * d * (1 - e); s.rot += (R.rot ?? 6) * (1 - e);
      s.lift = (R.lift ?? 1) * (1 - easeIn(k)) + .25 * spring(tq, R.at + (R.dur ?? .6), 8, 20);
      s.scale *= 1 + .04 * s.lift;
    }
    return s;
  };
  // the layer's world-space size (never stretched) and its screen box under the camera (for text avoidance and tests)
  const sizeOf = L => { const P = COLLAGE_IMG[L.src], r = P ? P.h / P.w : 1;   // [w] or [null, h]: the other side follows the image
    return L.size[0] == null ? [L.size[1] / r, L.size[1]] : [L.size[0], L.size[1] ?? L.size[0] * r]; };
  const screenBox = (L, t) => {
    const s = stateOf(L, t), [w, h] = sizeOf(L), [cx, cy, z] = cam(t), shx = (cx - PARALLAX_REF[0]) * (1 - L.depth), shy = (cy - PARALLAX_REF[1]) * (1 - L.depth);
    const b = COLLAGE_IMG[L.src]?.bbox || [0, 0, 1, 1], ox = s.x - L.anchor[0] * w * s.scale + shx, oy = s.y - L.anchor[1] * h * s.scale + shy;
    const X = v => (v - cx) * z + W / 2, Y = v => (v - cy) * z + H / 2;
    return { x0: X(ox + b[0] * w * s.scale), x1: X(ox + b[2] * w * s.scale), y0: Y(oy + b[1] * h * s.scale), y1: Y(oy + b[3] * h * s.scale) };
  };
  const drawLayer = (L, t) => {
    const P = COLLAGE_IMG[L.src]; if (!P) return;
    const s = stateOf(L, t); if (s.opacity <= .003) return;
    const [w, h] = sizeOf(L), k = w / P.w, sh = L.paper?.shadow;
    parallax(L.depth, () => {
      flushBrush(); push(); translate(s.x, s.y); rotate(s.rot * Math.PI / 180); scale(s.scale);
      const ox = -L.anchor[0] * w - P.pad * k, oy = -L.anchor[1] * h - P.pad * k, dw = P.cut.width * k, dh = P.cut.height * k;
      if (P.shadow) {   // the lift pushes the shadow further away and softer
        const lf = 1 + 2.2 * s.lift;
        tint(255, 255 * (sh.opacity ?? .35) * s.opacity / (1 + .6 * s.lift));
        image(P.shadow, ox + (sh.dx ?? 8) * lf, oy + (sh.dy ?? 12) * lf, dw * (1 + .02 * s.lift), dh * (1 + .02 * s.lift));
      }
      tint(255, 255 * s.opacity); image(P.cut, ox, oy, dw, dh); noTint();
      pop();
    });
  };

  const subjects = t => layers.filter(L => L.subject && COLLAGE_IMG[L.src] && stateOf(L, t).opacity > .05).map(L => screenBox(L, t));
  const text = scene.type && scene.type.length ? typeOverlay({ narration: scene.narration || [], items: scene.type, subjects, duration: scene.duration || DUR }) : null;
  shots([[0, (t) => {
    background(scene.background || '#EFE6D6');
    const [cx, cy, z] = cam(t);
    camBegin(cx, cy, z);
    for (const L of layers) drawLayer(L, t);
    camEnd();
    if (text) text.draw(t);
  }]]);
  window.COLLAGE_INFO = { scene, layers, cam, stateOf, screenBox, subjects };   // for tests and tools
  return window.COLLAGE_INFO;
}
