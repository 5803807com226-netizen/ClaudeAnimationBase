// presets/planet.js: real planets from real maps. A planet is an equirectangular surface texture (NASA mission data;
// tools/get_space_textures.mjs downloads them into assets/space/textures/ and writes the credits) wrapped onto a sphere
// per pixel: it turns on its tilted axis, the Sun lights one side (soft terminator, dark night side), the air glows at
// the rim, Saturn's rings pass behind and in front of it. Never a drawn planet: without its texture the layer throws.
//   planet   one body (body: 'mars' … or image: <your own equirectangular map>), on screen

const SPACE_TEX = 'assets/space/textures/';
// real values: axial tilt (degrees); air: rim glow colour (null = none); ring: Saturn's ring (radii in planet radii)
const SPACE_BODIES = {
  sun:     { image: 'sun.jpg', tilt: 7.25, glow: '#FFB347', emissive: true },
  mercury: { image: 'mercury.jpg', tilt: .03 },
  venus:   { image: 'venus_atmosphere.jpg', tilt: 177.4, air: '#F2D8A6' },
  earth:   { image: 'earth.jpg', tilt: 23.44, air: '#7FB8FF' },
  moon:    { image: 'moon.jpg', tilt: 6.68 },
  mars:    { image: 'mars.jpg', tilt: 25.19, air: '#E8A982' },
  jupiter: { image: 'jupiter.jpg', tilt: 3.13, air: '#E9D9C0' },
  saturn:  { image: 'saturn.jpg', tilt: 26.73, air: '#EADDB8', ring: { image: 'saturn_ring.png', inner: 1.24, outer: 2.27 } },
  uranus:  { image: 'uranus.jpg', tilt: 97.77, air: '#BDEFF5' },
  neptune: { image: 'neptune.jpg', tilt: 28.32, air: '#8DB2FF' },
};
const spaceBodyImage = (o, k = 'image') => { if (o[k]) return o[k]; const B = SPACE_BODIES[o.body], f = B && (k === 'image' ? B.image : B.ring?.image); return f ? SPACE_TEX + f : ''; };

// a picture a layer needs but no preload brought (a preset demo, a layer added live): its load starts at once; a render
// waits for it (window.AFTER_DRAW) and draws the frame again; a file that does not exist stops with an error
const SPACE_LOADING = new Map(), SPACE_FAILED = new Set();
function spaceImg(path, who, hint) {
  if (STICKER_IMG[path]) return STICKER_IMG[path];
  if (!path || SPACE_FAILED.has(path)) throw new Error(`${who}: ${path || '(no picture)'} could not be loaded: ${hint}`);
  if (!SPACE_LOADING.has(path)) SPACE_LOADING.set(path, loadImage(path).then(im => { STICKER_IMG[path] = im; }, () => { SPACE_FAILED.add(path); }));
  return null;
}
(window.AFTER_DRAW = window.AFTER_DRAW || []).push(async () => {
  const wait = [...SPACE_LOADING].filter(([p]) => !STICKER_IMG[p] && !SPACE_FAILED.has(p)).map(([, pr]) => pr); if (!wait.length) return false;
  await Promise.all(wait); return true;
});

function planetPixels(im) {   // the texture's pixels, read once
  if (!im._px) { const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height; const x = cv.getContext('2d', { willReadFrequently: true });
    x.drawImage(im.canvas || im.elt, 0, 0); im._px = x.getImageData(0, 0, im.width, im.height).data; }
  return im._px;
}

definePreset('planet', {
  label: 'Planet', about: 'a real planet, moon or the Sun from its real surface map (body: sun, mercury, venus, earth, moon, mars, jupiter, saturn, uranus, neptune; or image: an equirectangular map): a sphere turning on its real tilted axis, lit by the Sun from one side (light: degrees, the night side dark; the Sun glows by itself), its air glowing at the rim, Saturn with its rings; grows in, can zoom (zoom / zoomTo) and slide (x/y → toX/toY); several planets side by side compare sizes',
  meta: { version: '1.0.0', category: 'fx', tags: ['space', 'planet', 'solar system', 'moon', 'sun', 'mars', 'jupiter', 'saturn', 'earth', 'astronomy', 'globe', 'nasa', 'texture'], camera: 'screen', layers: ['screen'],
    params: { body: { enum: [null, ...Object.keys(SPACE_BODIES)] }, size: { min: .02, max: 3 }, spin: { min: -60, max: 60 }, light: { min: -180, max: 180 }, night: { min: 0, max: 1 }, zoom: { min: .1, max: 20 } },
    assets: [{ param: 'image', type: 'image' }] },
  defaults: { body: 'earth', image: '', imageRing: '', size: .38, x: .5, y: .5, toX: null, toY: null, zoom: 1, zoomTo: null, spin: 12, turn: 0, tilt: null, light: -35, night: .12, label: '', labelColor: '#FFFFFF', bg: null, out: null, outDur: .5, ease: 'ease', dur: 1.2 },
  run(t, o) {
    const q = o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1, a = Math.min(clamp((t - o.at) / .5), q); if (a <= 0) return;
    const B = SPACE_BODIES[o.body] || {}, path = spaceBodyImage(o), im = spaceImg(path, 'planet', 'run node tools/get_space_textures.mjs (or give image: an equirectangular map)'); if (!im) return;
    const { g, c } = stkCtx(o, 'planet:' + (o.id ?? o.body)), u = US(), k = presetK(t, o), z = o.zoomTo != null ? Math.exp(lerp(Math.log(o.zoom), Math.log(o.zoomTo), k)) : o.zoom;
    const cx = lerp(o.x, o.toX ?? o.x, k) * W, cy = lerp(o.y, o.toY ?? o.y, k) * H, R = o.size * Math.min(W, H) / 2 * z * (.92 + .08 * easeOut(clamp((t - o.at) / .8)));
    c.save(); c.globalAlpha = a;
    if (o.bg === 'sky') spaceSky(c); else if (o.bg) { c.fillStyle = o.bg; c.fillRect(0, 0, W, H); }
    const tilt = (o.tilt ?? B.tilt ?? 0) * Math.PI / 180, ring = B.ring && { ...B.ring, im: spaceImg(spaceBodyImage(o, 'imageRing'), 'planet', 'the ring map is missing: run node tools/get_space_textures.mjs') };
    if (ring?.im) planetRing(c, cx, cy, R, ring, tilt, 'back');
    if (B.emissive) {   // the Sun: a corona behind the disc
      const gl = c.createRadialGradient(cx, cy, R * .9, cx, cy, R * 2.2); gl.addColorStop(0, B.glow + 'CC'); gl.addColorStop(.3, B.glow + '44'); gl.addColorStop(1, B.glow + '00');
      c.fillStyle = gl; c.beginPath(); c.arc(cx, cy, R * 2.2, 0, TAU); c.fill(); }
    if (R > .5 && cx + R > 0 && cx - R < W && cy + R > 0 && cy - R < H) planetDisc(c, im, cx, cy, R, (o.turn + (t - o.at) * o.spin) * Math.PI / 180, tilt, B.emissive ? null : o.light * Math.PI / 180, o.night);
    if (B.air) {   // the air: a thin glow on the lit rim
      const ga = c.createRadialGradient(cx, cy, R * .96, cx, cy, R * 1.09); ga.addColorStop(0, B.air + '00'); ga.addColorStop(.35, B.air + '99'); ga.addColorStop(1, B.air + '00');
      c.fillStyle = ga; c.beginPath(); c.arc(cx, cy, R * 1.09, 0, TAU); c.arc(cx, cy, R * .96, 0, TAU, true); c.fill(); }
    if (ring?.im) planetRing(c, cx, cy, R, ring, tilt, 'front');
    if (o.label) {   // the name, below the planet (and below the ring's lowest point)
      const ka = clamp((t - o.at - .4) / .4); c.globalAlpha = a * ka; c.font = fontCss({ font: 'display', weight: 800, size: 46 }); c.textAlign = 'center'; c.textBaseline = 'top';
      c.lineWidth = 7 * u; c.strokeStyle = 'rgba(10,12,20,.85)'; c.lineJoin = 'round'; const ry = ring?.im ? Math.hypot(ring.outer * Math.sin(tilt), ring.outer * .22 * Math.cos(tilt)) : 0, ly = cy + R * Math.max(1, ry) + 18 * u; c.strokeText(o.label, cx, ly); c.fillStyle = o.labelColor; c.fillText(o.label, cx, ly); }
    c.restore(); stkBlit(g);
  },
  preload: o => [spaceBodyImage(o), spaceBodyImage(o, 'imageRing')].filter(Boolean),
  demo: { bg: '#0D1736', after: [['planet', { at: 0, body: 'mars', bg: 'sky', label: 'ดาวอังคาร' }]] },
});

// the disc: every pixel inverse-projected (orthographic) onto the texture, at most 900 px across then scaled up
function planetDisc(c, im, cx, cy, R, rot, tilt, light, night) {
  const D = Math.max(8, Math.min(900, Math.ceil(R * 2))), px = planetPixels(im), TW = im.width, TH = im.height;
  if (!planetDisc.cv || planetDisc.cv.width !== D) { planetDisc.cv = document.createElement('canvas'); planetDisc.cv.width = planetDisc.cv.height = D; }
  const x2 = planetDisc.cv.getContext('2d', { willReadFrequently: true }), img = x2.createImageData(D, D), out = img.data;
  const ct = Math.cos(tilt), st = Math.sin(tilt), lx = light == null ? 0 : Math.cos(light), ly = light == null ? 0 : -Math.sin(light), lz = .35;   // light from the side, a little toward the viewer
  const ll = Math.hypot(lx, ly, lz);
  for (let j = 0; j < D; j++) for (let i = 0; i < D; i++) {
    const sx = (i + .5) / D * 2 - 1, sy = 1 - (j + .5) / D * 2, r2 = sx * sx + sy * sy; if (r2 >= 1) continue;
    const sz = Math.sqrt(1 - r2), bx = sx * ct + sy * st, by = -sx * st + sy * ct;   // undo the axial tilt (a roll on screen)
    const lat = Math.asin(by), lon = Math.atan2(bx, sz) + rot;
    const U = ((lon / TAU + .5) % 1 + 1) % 1 * TW, V = clamp((.5 - lat / Math.PI) * TH, 0, TH - 1);
    const x0 = Math.floor(U) % TW, y0 = Math.floor(V), x1 = (x0 + 1) % TW, y1 = Math.min(TH - 1, y0 + 1), fx = U - Math.floor(U), fy = V - y0;
    const A = (y0 * TW + x0) * 4, Bq = (y0 * TW + x1) * 4, C = (y1 * TW + x0) * 4, Dq = (y1 * TW + x1) * 4, w0 = (1 - fx) * (1 - fy), w1 = fx * (1 - fy), w2 = (1 - fx) * fy, w3 = fx * fy;
    let sh = 1;
    if (light != null) { const d = (sx * lx + sy * ly + sz * lz) / ll; sh = night + (1 - night) * clamp(d * 1.6 + .08); sh *= .82 + .18 * sz; }   // soft terminator, darker limb
    else sh = .78 + .22 * Math.pow(sz, .5);   // the Sun: limb darkening
    const di = (j * D + i) * 4;
    for (let ch = 0; ch < 3; ch++) out[di + ch] = (px[A + ch] * w0 + px[Bq + ch] * w1 + px[C + ch] * w2 + px[Dq + ch] * w3) * sh;
    out[di + 3] = 255 * clamp((1 - Math.sqrt(r2)) * D / 1.5);   // anti-aliased edge
  }
  x2.putImageData(img, 0, 0);
  c.save(); c.imageSmoothingQuality = 'high'; c.drawImage(planetDisc.cv, cx - R, cy - R, R * 2, R * 2); c.restore();
}

// Saturn's rings: the ring texture is a radial strip (inner → outer, with alpha), drawn as thin ellipses around the
// planet, tilted with it; the far half before the planet, the near half after it
function planetRing(c, cx, cy, R, ring, tilt, half) {
  const im = ring.im, px = planetPixels(im), n = Math.max(40, Math.round((ring.outer - ring.inner) * R / 1.5)), open = .22;   // how far the ring opens toward us
  c.save(); c.translate(cx, cy); c.rotate(-tilt); c.lineWidth = (ring.outer - ring.inner) * R / n * 1.6;
  for (let s = 0; s < n; s++) {
    const f = (s + .5) / n, rr = R * lerp(ring.inner, ring.outer, f), ix = Math.min(im.width - 1, Math.floor(f * im.width)) * 4, alpha = px[ix + 3] / 255; if (alpha < .02) continue;
    c.strokeStyle = `rgba(${px[ix]},${px[ix + 1]},${px[ix + 2]},${alpha * .95})`; c.beginPath();
    if (half === 'back') c.ellipse(0, 0, rr, rr * open, 0, Math.PI, TAU); else c.ellipse(0, 0, rr, rr * open, 0, 0, Math.PI);
    c.stroke();
  }
  c.restore();
}

// deep-space pictures: real telescope images and NASA visualisations (tools/get_space_textures.mjs --photos downloads them
// from the NASA Image and Video Library into assets/space/photos/ with their credits); name → file
const SPACE_PHOTO_DIR = 'assets/space/photos/';
const SPACE_PHOTOS = ['blackhole_m87', 'blackhole_sgra', 'blackhole_sim', 'andromeda', 'milky_way_center', 'whirlpool', 'sombrero', 'deep_field', 'pillars', 'carina', 'orion', 'crab'];
const spacePhotoPath = o => o.image || (o.photo ? SPACE_PHOTO_DIR + o.photo + '.jpg' : '');

definePreset('spacePhoto', {
  label: 'Space Photo', about: 'a real deep-space picture (photo: blackhole_m87, blackhole_sgra, blackhole_sim, andromeda, milky_way_center, whirlpool, sombrero, deep_field, pillars, carina, orion, crab; or image: your own) filling the frame (fit cover: re-framed on focus, never stretched) with a slow push-in (zoom → zoomTo), an optional slow turn (spin, degrees per second: a galaxy, a black hole) and a gentle glow pulse; or fit circle: the picture as a round object over the sky (a black hole seen from afar); a name and a small credit line',
  meta: { version: '1.0.0', category: 'fx', tags: ['space', 'black hole', 'galaxy', 'nebula', 'hubble', 'webb', 'telescope', 'photo', 'andromeda', 'universe', 'deep field', 'nasa'], camera: 'screen', layers: ['screen'],
    params: { photo: { enum: [null, ...SPACE_PHOTOS] }, fit: { enum: ['cover', 'circle'] }, zoom: { min: .5, max: 8 }, spin: { min: -20, max: 20 }, size: { min: .1, max: 1.5 } },
    assets: [{ param: 'image', type: 'image' }] },
  defaults: { photo: 'andromeda', image: '', fit: 'cover', focus: [.5, .5], zoom: 1, zoomTo: 1.15, spin: 0, glow: .15, size: .6, x: .5, y: .45, bg: 'sky', label: '', credit: '', out: null, outDur: .6, ease: 'ease', dur: 6 },
  run(t, o) {
    const q = o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1, a = Math.min(clamp((t - o.at) / .6), q); if (a <= 0) return;
    const path = spacePhotoPath(o), im = spaceImg(path, 'spacePhoto', 'run node tools/get_space_textures.mjs --photos (or give image:)'); if (!im) return;
    const { g, c } = stkCtx(o, 'spacePhoto:' + (o.id ?? o.photo)), u = US(), k = presetK(t, o), z = Math.exp(lerp(Math.log(o.zoom), Math.log(o.zoomTo ?? o.zoom), k));
    const rot = (t - o.at) * o.spin * Math.PI / 180, el = im.canvas || im.elt, pulse = 1 + o.glow * .5 * (Math.sin((t - o.at) * 1.3) * .5 + .5);
    c.save(); c.globalAlpha = a;
    if (o.fit === 'circle') {   // a round object over the sky: the picture's middle, soft-edged, with a glow
      if (o.bg === 'sky') spaceSky(c); else if (o.bg) { c.fillStyle = o.bg; c.fillRect(0, 0, W, H); }
      const cx = o.x * W, cy = o.y * H, R = o.size * Math.min(W, H) / 2 * z;
      const gl = c.createRadialGradient(cx, cy, R * .6, cx, cy, R * 1.5); gl.addColorStop(0, `rgba(255,190,120,${.35 * o.glow * pulse * 3})`); gl.addColorStop(1, 'rgba(255,190,120,0)');
      c.fillStyle = gl; c.beginPath(); c.arc(cx, cy, R * 1.5, 0, TAU); c.fill();
      c.save(); c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.clip(); c.translate(cx, cy); c.rotate(rot);
      const s = 2 * R * 1.05 / Math.min(im.width, im.height); c.drawImage(el, -im.width * s * o.focus[0], -im.height * s * o.focus[1], im.width * s, im.height * s); c.restore();
      const vg = c.createRadialGradient(cx, cy, R * .7, cx, cy, R); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(5,8,20,.9)'); c.fillStyle = vg; c.beginPath(); c.arc(cx, cy, R + 1, 0, TAU); c.fill();
    } else {   // cover the frame around the focus point; a turn needs the cover radius of the diagonal
      const need = rot ? Math.hypot(W, H) : 0, s = Math.max((need || W) / im.width, (need || H) / im.height) * z, w = im.width * s, h = im.height * s;
      c.save(); c.translate(W / 2, H / 2); c.rotate(rot);
      const fx = clamp(w * o.focus[0], (need || W) / 2, w - (need || W) / 2), fy = clamp(h * o.focus[1], (need || H) / 2, h - (need || H) / 2);   // the focus, kept so the picture still covers the frame
      c.drawImage(el, -fx, -fy, w, h);
      if (o.glow) { c.globalCompositeOperation = 'screen'; c.globalAlpha = a * o.glow * (pulse - 1) * 2; c.drawImage(el, -fx, -fy, w, h); c.globalCompositeOperation = 'source-over'; c.globalAlpha = a; }   // the glow breathes
      c.restore();
    }
    if (o.label) { const ka = clamp((t - o.at - .5) / .5); c.globalAlpha = a * ka; c.font = fontCss({ font: 'display', weight: 800, size: 54 }); c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 8 * u; c.strokeStyle = 'rgba(10,12,20,.85)'; c.lineJoin = 'round'; const ly = o.fit === 'circle' ? o.y * H + o.size * Math.min(W, H) / 2 * z + 50 * u : H * .2;
      c.strokeText(o.label, W / 2, ly); c.fillStyle = '#FFFFFF'; c.fillText(o.label, W / 2, ly); }
    if (o.credit) { c.globalAlpha = a * .75; c.font = fontCss({ font: 'body', weight: 400, size: 20 }); c.textAlign = 'right'; c.textBaseline = 'bottom'; c.fillStyle = '#FFFFFF'; c.fillText(o.credit, W - 18 * u, H - 14 * u); }
    c.restore(); stkBlit(g);
  },
  preload: o => [spacePhotoPath(o)].filter(Boolean),
  demo: { bg: '#0D1736', after: [['spacePhoto', { at: 0, photo: 'andromeda', label: 'กาแล็กซีแอนดรอเมดา' }]] },
});
