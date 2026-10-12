// presets/paperfx.js: paper-collage explainer pieces (studied from a "how gunpowder changed everything" map short).
// The pictures in them are artwork items (art → image, generated PNGs); the presets only stage them:
//   orbitBadges   round picture badges with ribbon labels pop in one by one around a centre, then merge into it (the
//                 ingredients of something, the parts of an idea) with a flash
//   coinFlip      a coin with two faces drops in, then flips over to show its other side ("but every coin...")
//   inkTitle      a title on a splash of black ink, with a numbered badge (step 1, 2, 3 of a story)
//   evolutionCard a parchment card unrolls; its picture changes into the next one through a blueprint sketch while the
//                 title is rewritten (how a thing evolved: hand cannon → matchlock → rifle)
//   mapBanner     (map) a hanging banner on a pole planted in a place: a portrait (artwork) and a name plate, swaying

const paperImg = p => p ? spaceImg(artPath(p), 'paperfx', 'the artwork is missing: run node tools/gen_assets.mjs --story=<id>') : null;
const paperRand = (i, k) => { const v = Math.sin(i * 91.7 + k * 47.3) * 43758.5453; return v - Math.floor(v); };
// a picture fitted inside a w × h box centred on (0, 0) (contain), never stretched
function paperDrawFit(c, im, w, h, filter) {
  const s = Math.min(w / im.width, h / im.height), iw = im.width * s, ih = im.height * s;
  if (filter) c.filter = filter; c.drawImage(im.canvas || im.elt, -iw / 2, -ih / 2, iw, ih); c.filter = 'none';
}
// a ribbon banner (folded ends) with text, centred on (0, 0)
function paperRibbon(c, text, px, fill, ink) {
  c.font = fontCss({ font: 'display', weight: 800, size: px / TS() }); const tw = c.measureText(text).width, w = tw + px * 1.2, h = px * 1.35, e = px * .55;
  c.fillStyle = shadeHex(fill, -.25);
  for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * w / 2, -h / 2 + h * .25); c.lineTo(s * (w / 2 + e), -h / 2 + h * .25); c.lineTo(s * (w / 2 + e * .55), h * .2); c.lineTo(s * (w / 2 + e), h / 2 + h * .25); c.lineTo(s * w / 2, h / 2 + h * .25); c.closePath(); c.fill(); }
  c.fillStyle = fill; c.beginPath(); c.moveTo(-w / 2, -h / 2); c.quadraticCurveTo(0, -h / 2 - h * .18, w / 2, -h / 2); c.lineTo(w / 2, h / 2); c.quadraticCurveTo(0, h / 2 - h * .18, -w / 2, h / 2); c.closePath(); c.fill();
  c.fillStyle = ink; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 0, px * .02);
}
const shadeHex = (hex, k) => { const n = parseInt(hex.slice(1), 16), f = v => Math.round(clamp(k < 0 ? v * (1 + k) : v + (255 - v) * k, 0, 255)); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };

definePreset('orbitBadges', {
  label: 'Orbit Badges', about: 'round picture badges (items: [{ art, label }]: the ingredients of something, the parts of an idea) pop in one by one around a centre (x, y on screen: beside a character or a place), each with a ribbon label, drift gently, then at mergeAt they rush into the centre and burst in a flash (they combine into the thing the story is about)',
  meta: { version: '1.0.0', category: 'infographic', tags: ['ingredients', 'parts', 'combine', 'mix', 'recipe', 'badges', 'orbit', 'merge', 'collage', 'explainer'], camera: 'screen', layers: ['screen'],
    params: { radius: { min: .1, max: .5 }, size: { min: 60, max: 400 }, stagger: { min: 0, max: 2 } } },
  defaults: { items: [], x: .5, y: .45, radius: .26, size: 190, stagger: .45, start: -90, drift: 1, mergeAt: null, mergeDur: .5, flash: '#FFF4C8', disc: '#E8C9A0', ribbon: '#E79A7E', ink: '#2A1A12', out: null, outDur: .3, ease: 'backOut', dur: .45 },
  preload: o => (o.items || []).map(e => e && e.image).filter(Boolean).map(artPath),
  run(t, o) {
    const q = o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1; if (q <= 0 || t < o.at) return;
    const { g, c } = stkCtx(o, 'orbitBadges'), u = US(), n = o.items.length, cx = o.x * W, cy = o.y * H, R = o.radius * Math.min(W, H), D = o.size * u;
    const mk = o.mergeAt == null ? 0 : easeInCubic(clamp((t - o.at - o.mergeAt) / o.mergeDur));
    c.save(); c.globalAlpha = q;
    o.items.forEach((it, i) => {
      const s = stickerPop(t, { ...o, at: o.at + i * o.stagger }) * (1 - mk * .7); if (s <= .001 || mk >= 1) return;
      const an = (o.start + i * 360 / n) * Math.PI / 180 + (t - o.at) * .12 * o.drift, rr = R * (1 - mk) * (.94 + .06 * Math.sin((t - o.at) * 1.7 + i));
      const x = cx + Math.cos(an) * rr, y = cy + Math.sin(an) * rr * .9, im = paperImg(it.image);
      c.save(); c.translate(x, y); c.scale(s, s);
      c.shadowColor = 'rgba(40,20,10,.35)'; c.shadowBlur = 14 * u; c.shadowOffsetY = 5 * u;
      const gr = c.createRadialGradient(-D * .15, -D * .2, D * .05, 0, 0, D / 2); gr.addColorStop(0, shadeHex(o.disc, .35)); gr.addColorStop(1, o.disc);
      c.fillStyle = gr; c.beginPath(); c.arc(0, 0, D / 2, 0, TAU); c.fill(); c.shadowColor = 'transparent';
      c.strokeStyle = shadeHex(o.disc, -.2); c.lineWidth = 3 * u; c.stroke();
      if (im) { c.save(); c.beginPath(); c.arc(0, 0, D * .44, 0, TAU); c.clip(); paperDrawFit(c, im, D * .78, D * .78); c.restore(); }
      if (it.label) { c.translate(0, D * .5); paperRibbon(c, it.label, 30 * TS(), o.ribbon, o.ink); }
      c.restore();
    });
    if (o.mergeAt != null) {   // the burst where they combine
      const kb = clamp((t - o.at - o.mergeAt - o.mergeDur * .8) / .6); if (kb > 0 && kb < 1) {
        const rb = R * .9 * easeOut(kb); c.globalAlpha = q * (1 - kb);
        const gl = c.createRadialGradient(cx, cy, 0, cx, cy, rb); gl.addColorStop(0, o.flash); gl.addColorStop(1, 'rgba(255,240,200,0)'); c.fillStyle = gl; c.beginPath(); c.arc(cx, cy, rb, 0, TAU); c.fill();
        c.strokeStyle = o.flash; c.lineWidth = 4 * u; c.lineCap = 'round';
        for (let k = 0; k < 14; k++) { const a = k / 14 * TAU + paperRand(k, 1), r0 = rb * .5, r1 = rb * (1 + paperRand(k, 2) * .4); c.beginPath(); c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); c.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); c.stroke(); }
      }
    }
    c.restore(); stkBlit(g);
  },
  demo: { bg: '#E9DFC4', after: [['orbitBadges', { at: .1, stagger: .3, mergeAt: 2.2, items: [{ label: 'กำมะถัน' }, { label: 'ถ่าน' }, { label: 'ดินประสิว' }] }]] },
});
const easeInCubic = x => x * x * x;

definePreset('coinFlip', {
  label: 'Coin Flip', about: 'a golden coin drops in edge-on and turns to face us, showing one side (front: { art | icon | glyph | text }), then at flipAt it flips over to its other side (back): "every coin has two sides" (a celebration that turns out to have a dark side, a hope and its cost); a soft shadow under it',
  meta: { version: '1.0.0', category: 'infographic', tags: ['coin', 'flip', 'two sides', 'dark side', 'contrast', 'versus', 'pros cons', 'reveal'], camera: 'screen', layers: ['screen'],
    params: { size: { min: 80, max: 900 } } },
  defaults: { front: { text: '?' }, back: { text: '!' }, x: .5, y: .45, size: 520, flipAt: 1.4, flipDur: .55, tilt: .18, gold: '#D9B26A', ink: '#3A2A18', out: null, outDur: .3, ease: 'ease', dur: .5 },
  preload: o => [o.front, o.back].map(f => f && f.image).filter(Boolean).map(artPath),
  run(t, o) {
    const q = o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1; if (q <= 0 || t < o.at) return;
    const { g, c } = stkCtx(o, 'coinFlip'), u = US(), R = o.size * u / 2, cx = o.x * W, k = presetK(t, o);
    const fl = easeInOut(clamp((t - o.at - o.flipAt) / o.flipDur)), ang = (1 - k) * Math.PI / 2 + fl * Math.PI;   // 0 = facing us, π = the other side facing us
    const cy = o.y * H - (1 - k) * H * .12 - Math.sin(fl * Math.PI) * R * .35, cs = Math.cos(ang), sq = Math.max(.02, Math.abs(cs)), thick = R * .09;
    c.save(); c.globalAlpha = q * clamp(k * 2);
    c.fillStyle = 'rgba(30,20,10,.25)'; c.beginPath(); c.ellipse(cx, o.y * H + R * 1.08, R * .8, R * .12, 0, 0, TAU); c.fill();   // shadow
    c.translate(cx, cy); c.scale(1, 1 - o.tilt * .5);
    // the rim: the edge band seen as the coin turns
    c.fillStyle = shadeHex(o.gold, -.35); c.beginPath(); c.ellipse(0, thick * Math.sin(ang) * (cs >= 0 ? 1 : -1), R, R * sq, 0, 0, TAU); c.fill();
    c.fillRect(-R, -thick * Math.abs(Math.sin(ang)), R * 2, thick * 2 * Math.abs(Math.sin(ang)));
    c.save(); c.scale(1, sq);   // the face
    const gr = c.createRadialGradient(-R * .3, -R * .35, R * .1, 0, 0, R); gr.addColorStop(0, shadeHex(o.gold, .35)); gr.addColorStop(1, o.gold);
    c.fillStyle = gr; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
    c.strokeStyle = shadeHex(o.gold, -.25); c.lineWidth = R * .035; c.beginPath(); c.arc(0, 0, R * .9, 0, TAU); c.stroke();
    const face = cs >= 0 ? o.front : o.back, im = face?.image ? paperImg(face.image) : null;
    if (cs < 0) c.scale(-1, 1);   // the far side is read the right way round
    if (im) { c.save(); c.globalCompositeOperation = 'multiply'; paperDrawFit(c, im, R * 1.4, R * 1.4); c.restore(); }
    else if (face?.icon || face?.glyph) drawSticker(c, { icon: face.icon, glyph: face.glyph, card: false }, R * 1.1);
    else if (face?.text) { c.fillStyle = o.ink; c.font = fontCss({ font: 'display', weight: 800, size: o.size * .3 }); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(face.text, 0, 0); }
    c.restore(); c.restore(); stkBlit(g);
  },
  demo: { bg: '#3E9E8F', after: [['coinFlip', { at: .1, flipAt: 1.2, front: { text: 'สุข' }, back: { text: 'ทุกข์' } }]] },
});

definePreset('inkTitle', {
  label: 'Ink Title', about: 'a title on a splash of black ink: the ink spreads in with a ragged edge and a few drips and specks, the words appear on it, and a numbered badge pops at its corner (number: step 1, 2, 3 of a chain of inventions or events); collage documentary style',
  meta: { version: '1.0.0', category: 'type', tags: ['title', 'ink', 'splash', 'brush', 'step', 'number', 'collage', 'chapter', 'label'], camera: 'screen', layers: ['screen'],
    params: { size: { min: 24, max: 200 } } },
  defaults: { text: 'TITLE', number: null, x: .62, y: .3, size: 78, angle: -4, ink: '#141210', color: '#F3EDE0', badge: '#F3EDE0', badgeInk: '#141210', seed: 3, out: null, outDur: .3, ease: 'easeOut', dur: .45 },
  run(t, o) {
    const q = o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1, k = presetK(t, o); if (q <= 0 || k <= 0) return;
    const { g, c } = stkCtx(o, 'inkTitle'), u = US(), px = o.size * TS(), lines = String(o.text).split('\n');
    c.font = fontCss({ font: 'display', weight: 800, size: o.size }); const tw = Math.max(...lines.map(l => c.measureText(l).width)), bw = tw + px * 1.4, bh = px * (lines.length * 1.05 + .9);
    c.save(); c.globalAlpha = q; c.translate(o.x * W, o.y * H); c.rotate(o.angle * Math.PI / 180);
    // the ink: overlapping ragged blobs (a brush splash) that spread from the left, specks and a drip around them
    c.fillStyle = o.ink; c.save(); c.beginPath(); c.rect(-bw / 2 - px * 2, -bh * 2, (bw + 4 * px) * easeOut(k), bh * 4); c.clip();
    const blob = (cx, cy, rx, ry, sd) => { c.beginPath(); const N = 36; for (let i = 0; i <= N; i++) { const a = i / N * TAU, j = 1 + (paperRand(i + sd * 13, 3) - .5) * .5;
      const x = cx + Math.cos(a) * rx * j, y = cy + Math.sin(a) * ry * j; i ? c.lineTo(x, y) : c.moveTo(x, y); } c.closePath(); c.fill(); };
    for (let b = 0; b < 7; b++) blob((paperRand(b, o.seed) - .5) * bw * .7, (paperRand(b, o.seed + 1) - .5) * bh * .35, bw * (.22 + paperRand(b, o.seed + 2) * .18), bh * (.42 + paperRand(b, o.seed + 3) * .2), b + o.seed);
    for (let i = 0; i < 18; i++) { const a = paperRand(i, 5) * TAU, d = .5 + paperRand(i, 6) * .45, r = px * (.03 + paperRand(i, 7) * .1); c.beginPath(); c.arc(Math.cos(a) * bw * d * .62, Math.sin(a) * bh * d * .8, r, 0, TAU); c.fill(); }
    c.fillRect(bw * .18, bh * .3, px * .09, bh * .45); c.beginPath(); c.arc(bw * .18 + px * .045, bh * .75, px * .1, 0, TAU); c.fill();   // a drip
    c.restore();
    const kt = clamp((k - .5) / .5); c.globalAlpha = q * kt; c.fillStyle = o.color; c.textAlign = 'center'; c.textBaseline = 'middle';
    lines.forEach((l, i) => c.fillText(l, 0, (i - (lines.length - 1) / 2) * px * 1.05));
    if (o.number != null) { const s = backOut(clamp((t - o.at - o.dur * .8) / .35)); if (s > 0) {
      c.globalAlpha = q; c.translate(bw / 2 - px * .2, -bh / 2 + px * .15); c.scale(s, s); c.fillStyle = o.badge; c.strokeStyle = o.ink; c.lineWidth = 3 * u;
      c.beginPath(); c.arc(0, 0, px * .42, 0, TAU); c.fill(); c.stroke(); c.fillStyle = o.badgeInk; c.font = fontCss({ font: 'display', weight: 800, size: o.size * .45 }); c.fillText(String(o.number), 0, px * .02); } }
    c.restore(); stkBlit(g);
  },
  demo: { bg: '#E9DFC4', after: [['inkTitle', { at: .2, text: 'หอกไฟ', number: 1, x: .5, y: .45 }]] },
});

definePreset('evolutionCard', {
  label: 'Evolution Card', about: 'how a thing evolved: a parchment card unrolls (its corner curls back as it opens), shows an item picture with its title, then each next item (items: [{ art, title }]) takes its place through a blueprint sketch (the old picture turns to blue lines on a grid, the new one draws in from them) while the title is rubbed out and rewritten; for weapons, tools, phones, cars...',
  meta: { version: '1.0.0', category: 'infographic', tags: ['evolution', 'history of', 'invention', 'progress', 'versions', 'generations', 'card', 'blueprint', 'parchment', 'timeline'], camera: 'screen', layers: ['screen'],
    params: { width: { min: .3, max: .98 }, hold: { min: .4, max: 6 } } },
  defaults: { items: [], x: .5, y: .38, width: .86, ratio: .62, hold: 1.4, change: .8, paper: '#E3CFA4', ink: '#3B2A18', blueprint: '#2F6FB5', titleSize: 54, out: null, outDur: .35, ease: 'ease', dur: .6 },
  preload: o => (o.items || []).map(e => e && e.image).filter(Boolean).map(artPath),
  run(t, o) {
    const q = o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1; if (q <= 0 || t < o.at || !o.items.length) return;
    const { g, c } = stkCtx(o, 'evolutionCard'), u = US(), w = o.width * W, h = w * o.ratio, x0 = o.x * W - w / 2, y0 = o.y * H - h / 2, k = presetK(t, o);
    const lt = t - o.at - o.dur, step = o.hold + o.change, i = clamp(Math.floor(Math.max(0, lt) / step), 0, o.items.length - 1);
    const ph = Math.max(0, lt) - i * step, ch = i < o.items.length - 1 ? clamp((ph - o.hold) / o.change) : 0;   // 0..1 through the change to the next item
    c.save(); c.globalAlpha = q;
    // the card, revealed from its top-left corner along a diagonal, the curl riding on the edge
    const reach = (w + h) * easeOut(k);
    c.save(); c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + reach, y0); c.lineTo(x0, y0 + reach); c.closePath(); c.clip();
    c.shadowColor = 'rgba(30,20,10,.4)'; c.shadowBlur = 18 * u; c.shadowOffsetY = 8 * u;
    const pg = c.createLinearGradient(x0, y0, x0 + w, y0 + h); pg.addColorStop(0, shadeHex(o.paper, .12)); pg.addColorStop(1, shadeHex(o.paper, -.08));
    c.fillStyle = pg; c.beginPath(); c.roundRect(x0, y0, w, h, 6 * u); c.fill(); c.shadowColor = 'transparent';
    c.globalCompositeOperation = 'multiply'; c.globalAlpha = q * .35; c.fillStyle = c.createPattern(mapGrain(), 'repeat'); c.fillRect(x0, y0, w, h); c.globalCompositeOperation = 'source-over'; c.globalAlpha = q;
    // the title (rubbed out and rewritten through a change), a small rule under it
    const title = (j, a) => { if (a <= 0) return; const s = o.items[j].title || ''; c.font = fontCss({ font: 'display', weight: 700, size: o.titleSize });
      c.fillStyle = o.ink; c.textAlign = 'center'; c.textBaseline = 'middle'; const n = Math.ceil([...s].length * a); c.fillText([...s].slice(0, n).join(''), x0 + w / 2, y0 + h * .17); };
    if (ch < .5) title(i, 1 - ch * 2); else title(i + 1, (ch - .5) * 2);
    c.strokeStyle = o.ink; c.globalAlpha = q * .6; c.lineWidth = 1.5 * u; c.beginPath(); c.moveTo(x0 + w * .3, y0 + h * .27); c.lineTo(x0 + w * .7, y0 + h * .27); c.stroke(); c.globalAlpha = q;
    // the picture: blueprint lines on a grid between two items
    const box = [x0 + w / 2, y0 + h * .6, w * .8, h * .55], drawItem = (j, filter, alpha) => { const im = paperImg(o.items[j]?.image); if (!im || alpha <= 0) return;
      c.save(); c.globalAlpha = q * alpha; c.translate(box[0], box[1]); c.shadowColor = 'rgba(30,20,10,.35)'; c.shadowBlur = 10 * u; c.shadowOffsetY = 5 * u; paperDrawFit(c, im, box[2], box[3], filter); c.restore(); };
    const bp = `grayscale(1) contrast(2.2) brightness(1.15) sepia(1) hue-rotate(170deg) saturate(3)`;
    if (ch <= 0) drawItem(i, null, 1);
    else {
      const grid = Math.sin(Math.PI * ch); c.save(); c.globalAlpha = q * grid * .5; c.strokeStyle = o.blueprint; c.lineWidth = 1 * u;
      for (let gx = box[0] - box[2] / 2; gx <= box[0] + box[2] / 2; gx += 24 * u) { c.beginPath(); c.moveTo(gx, box[1] - box[3] / 2); c.lineTo(gx, box[1] + box[3] / 2); c.stroke(); }
      for (let gy = box[1] - box[3] / 2; gy <= box[1] + box[3] / 2; gy += 24 * u) { c.beginPath(); c.moveTo(box[0] - box[2] / 2, gy); c.lineTo(box[0] + box[2] / 2, gy); c.stroke(); }
      c.restore();
      if (ch < .5) { drawItem(i, null, 1 - ch * 2); drawItem(i, bp, ch * 2); }
      else { drawItem(i + 1, bp, (1 - ch) * 2); drawItem(i + 1, null, (ch - .5) * 2); }
    }
    c.restore();
    if (k < 1) {   // the curl: a lighter folded triangle riding on the opening edge
      const e = reach; c.fillStyle = shadeHex(o.paper, .3); c.shadowColor = 'rgba(30,20,10,.35)'; c.shadowBlur = 10 * u;
      c.beginPath(); c.moveTo(x0 + e, y0); c.lineTo(x0, y0 + e); c.lineTo(x0 + e * .82, y0 + e * .18); c.closePath(); c.fill(); c.shadowColor = 'transparent';
    }
    c.restore(); stkBlit(g);
  },
  demo: { bg: '#3E9E8F', after: [['evolutionCard', { at: .1, hold: .6, change: .7, items: [{ title: 'ปืนใหญ่มือ' }, { title: 'ปืนคาบชุด' }] }]] },
});
const easeInOut = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

definePreset('mapBanner', {
  label: 'Map Banner', about: 'a hanging banner planted in a place (a ruler, an army, a dynasty): a wooden pole grows up from the place, a crossbar with a name plate on top, and a cloth banner hangs from it with a portrait (artwork) in it and a swallowtail hem, swaying gently; map labels keep off it',
  meta: { version: '1.0.0', category: 'map', tags: ['map', 'banner', 'flag', 'ruler', 'leader', 'portrait', 'empire', 'king', 'khan', 'standard', 'army'],
    params: { height: { min: 80, max: 700 } }, assets: [{ param: 'lonlat', type: 'place' }, { param: 'image', type: 'image' }], layers: ['overlay'] },
  defaults: { lonlat: [0, 0], image: '', art: null, name: '', height: 330, cloth: '#22304A', trim: '#C9A45C', plate: '#EADBB8', ink: '#2A1A12', sway: 1, out: null, outDur: .35, ease: 'easeOut', dur: .7 },
  preload: o => o.image ? [artPath(o.image)] : [],
  run(t, o) {
    if (!mapVisible(o.lonlat)) return; const p = mapPt(o.lonlat); if (!p) return;
    const q = o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1, k = presetK(t, o); if (q <= 0 || k <= 0) return;
    const c = mapCtx(), u = US(), Hh = o.height * u, bw = Hh * .5, bh = Hh * .62, top = p[1] - Hh * k, im = paperImg(o.image), sw = Math.sin((t - o.at) * 1.8) * .025 * o.sway;
    mapObstacle(p[0] - bw * .6, p[1] - Hh - bh * .1, bw * 1.2, Hh + bh * .1);
    c.save(); c.globalAlpha = q;
    c.strokeStyle = '#4A3424'; c.lineWidth = 6 * u; c.lineCap = 'round'; c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(p[0], top); c.stroke();   // the pole
    const kc = clamp((k - .55) / .45); if (kc > 0) {
      c.translate(p[0], top + Hh * .08); c.lineWidth = 5 * u; c.beginPath(); c.moveTo(-bw * .62, 0); c.lineTo(bw * .62, 0); c.stroke();   // crossbar + finials
      for (const s of [-1, 1]) { c.fillStyle = o.trim; c.beginPath(); c.arc(s * bw * .64, 0, 6 * u, 0, TAU); c.fill(); }
      c.save(); c.rotate(sw); c.scale(1, kc);   // the cloth unrolls down, swaying from the bar
      c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 10 * u; c.shadowOffsetY = 5 * u; c.fillStyle = o.cloth;
      c.beginPath(); c.moveTo(-bw / 2, 0); c.lineTo(bw / 2, 0); c.lineTo(bw / 2, bh); c.lineTo(0, bh * .86); c.lineTo(-bw / 2, bh); c.closePath(); c.fill(); c.shadowColor = 'transparent';
      c.strokeStyle = o.trim; c.lineWidth = 3 * u; c.stroke();
      if (im) { c.save(); c.beginPath(); c.rect(-bw * .4, bh * .08, bw * .8, bh * .66); c.clip(); c.translate(0, bh * .41); paperDrawFit(c, im, bw * .8, bh * .66); c.restore(); }
      c.restore();
      if (o.name) {   // the name plate on the bar
        c.font = fontCss({ font: 'display', weight: 800, size: 30 }); const tw = c.measureText(o.name).width, pw = Math.max(bw * .9, tw + 24 * u), phh = 40 * TS();
        c.fillStyle = o.plate; c.strokeStyle = o.ink; c.lineWidth = 2 * u; c.beginPath(); c.roundRect(-pw / 2, -phh - 6 * u, pw, phh, 5 * u); c.fill(); c.stroke();
        c.fillStyle = o.ink; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(o.name, 0, -phh / 2 - 6 * u);
      }
    }
    c.restore();
  },
});
