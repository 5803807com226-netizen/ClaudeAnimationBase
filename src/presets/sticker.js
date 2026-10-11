// sticker.js: STICKERS for explainers and map documentaries, in screen space (sticker, dateCard, chapterBadge) and,
// through drawSticker(), pinned to places on a map (mapPin in map.js).
//   sticker       a sticker that pops in: a flag, an icon, a glyph (?, !, ✕, ✓) or an imported image (PNG)
//   dateCard      a tear-off calendar card: Thai month, big day, year (CE or BE); pops in
//   chapterBadge  a numbered chapter badge (number in a coloured disc + a title) that slides in
// Flags and icons are drawn as vector symbols (infographic marks, like map markers: not scene artwork). Flags are
// public-domain national symbols drawn to their official proportions; anything else is an `image` (a PNG made
// outside the code: docs/COLLAGE_PIPELINE.md). Images are preloaded by the plan player (src/plan/play.js).
// screen presets draw on a 2D layer of their own (the main canvas is WebGL), then blit it over the frame
const STK_G = {};
function stkCtx(o, name) {
  const key = name + '|' + (o.id ?? ''); let g = STK_G[key];
  if (!g || g.width !== W || g.height !== H) { g = STK_G[key] = createGraphics(W, H); g.pixelDensity(1); }
  const c = g.drawingContext; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H); return { g, c };
}
const stkBlit = g => { flushBrush(); push(); resetMatrix(); translate(-W / 2, -H / 2); image(g, 0, 0); pop(); };
const STICKER_IMG = {};   // path → loaded image (filled before the first frame)
function stickerPreload(paths) {
  const want = [...new Set(paths)].filter(p => p && !STICKER_IMG[p]); if (!want.length) return;
  (window.PRELOAD = window.PRELOAD || []).push(async () => {
    for (const p of want) try { STICKER_IMG[p] = await loadImage(p); } catch (e) { console.error(`sticker: could not load image ${p}`); }
  });
}

// flags: draw(c, w, h) inside a w × h box centred on (0, 0); ratio = official height / width
const STRIPES = (cols, vertical = false, weights) => (c, w, h) => {
  const ws = weights || cols.map(() => 1), tot = ws.reduce((a, b) => a + b, 0); let acc = 0;
  cols.forEach((col, i) => { c.fillStyle = col; const a = acc / tot, b = (acc += ws[i]) / tot;
    if (vertical) c.fillRect(-w / 2 + a * w, -h / 2, (b - a) * w + .5, h); else c.fillRect(-w / 2, -h / 2 + a * h, w, (b - a) * h + .5); });
};
const STAR = (c, x, y, r, rot = -Math.PI / 2) => { c.beginPath(); for (let i = 0; i < 10; i++) { const a = rot + i * Math.PI / 5, rr = i % 2 ? r * .382 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); c.fill(); };
const FLAGS = {
  th: { name: 'Thailand', ratio: 2 / 3, draw: STRIPES(['#A51931', '#F4F5F8', '#2D2A4A', '#F4F5F8', '#A51931'], false, [1, 1, 2, 1, 1]) },
  fr: { name: 'France', ratio: 2 / 3, draw: STRIPES(['#002395', '#FFFFFF', '#ED2939'], true) },
  nl: { name: 'Netherlands', ratio: 2 / 3, draw: STRIPES(['#AE1C28', '#FFFFFF', '#21468B']) },
  de: { name: 'Germany', ratio: 3 / 5, draw: STRIPES(['#000000', '#DD0000', '#FFCE00']) },
  it: { name: 'Italy', ratio: 2 / 3, draw: STRIPES(['#009246', '#FFFFFF', '#CE2B37'], true) },
  ru: { name: 'Russia', ratio: 2 / 3, draw: STRIPES(['#FFFFFF', '#0039A6', '#D52B1E']) },
  id: { name: 'Indonesia', ratio: 2 / 3, draw: STRIPES(['#CE1126', '#FFFFFF']) },
  pl: { name: 'Poland', ratio: 5 / 8, draw: STRIPES(['#FFFFFF', '#DC143C']) },
  ua: { name: 'Ukraine', ratio: 2 / 3, draw: STRIPES(['#0057B7', '#FFD700']) },
  be: { name: 'Belgium', ratio: 13 / 15, draw: STRIPES(['#000000', '#FDDA24', '#EF3340'], true) },
  ie: { name: 'Ireland', ratio: 1 / 2, draw: STRIPES(['#169B62', '#FFFFFF', '#FF883E'], true) },
  at: { name: 'Austria', ratio: 2 / 3, draw: STRIPES(['#ED2939', '#FFFFFF', '#ED2939']) },
  es: { name: 'Spain (simplified, no arms)', ratio: 2 / 3, draw: STRIPES(['#AA151B', '#F1BF00', '#AA151B'], false, [1, 2, 1]) },
  jp: { name: 'Japan', ratio: 2 / 3, draw: (c, w, h) => { c.fillStyle = '#FFFFFF'; c.fillRect(-w / 2, -h / 2, w, h); c.fillStyle = '#BC002D'; c.beginPath(); c.arc(0, 0, h * .3, 0, TAU); c.fill(); } },
  bd: { name: 'Bangladesh', ratio: 3 / 5, draw: (c, w, h) => { c.fillStyle = '#006A4E'; c.fillRect(-w / 2, -h / 2, w, h); c.fillStyle = '#F42A41'; c.beginPath(); c.arc(-w * .05, 0, h * .33, 0, TAU); c.fill(); } },
  vn: { name: 'Vietnam', ratio: 2 / 3, draw: (c, w, h) => { c.fillStyle = '#DA251D'; c.fillRect(-w / 2, -h / 2, w, h); c.fillStyle = '#FFFF00'; STAR(c, 0, h * .02, h * .3); } },
  cn: { name: 'China', ratio: 2 / 3, draw: (c, w, h) => { c.fillStyle = '#EE1C25'; c.fillRect(-w / 2, -h / 2, w, h); c.fillStyle = '#FFFF00'; const g = w / 30;
    STAR(c, -w / 2 + 5 * g, -h / 2 + 5 * g, 3 * g); for (const [x, y] of [[10, 2], [12, 4], [12, 7], [10, 9]]) STAR(c, -w / 2 + x * g, -h / 2 + y * g, g, Math.atan2(5 - y, 5 - x) + Math.PI); } },
  la: { name: 'Laos', ratio: 2 / 3, draw: (c, w, h) => { STRIPES(['#CE1126', '#002868', '#CE1126'], false, [1, 2, 1])(c, w, h); c.fillStyle = '#FFFFFF'; c.beginPath(); c.arc(0, 0, h * .2, 0, TAU); c.fill(); } },
  mm: { name: 'Myanmar', ratio: 2 / 3, draw: (c, w, h) => { STRIPES(['#FECB00', '#34B233', '#EA2839'])(c, w, h); c.fillStyle = '#FFFFFF'; STAR(c, 0, h * .04, h * .4); } },
  gb: { name: 'United Kingdom', ratio: 1 / 2, draw: (c, w, h) => {   // Union Jack, official 1:2 construction (60 × 30 units)
    const g = w / 60; c.fillStyle = '#012169'; c.fillRect(-w / 2, -h / 2, w, h);
    c.save(); c.beginPath(); c.rect(-w / 2, -h / 2, w, h); c.clip(); c.lineCap = 'butt';
    c.strokeStyle = '#FFFFFF'; c.lineWidth = 6 * g; c.beginPath(); c.moveTo(-w / 2, -h / 2); c.lineTo(w / 2, h / 2); c.moveTo(w / 2, -h / 2); c.lineTo(-w / 2, h / 2); c.stroke();
    c.strokeStyle = '#C8102E'; c.lineWidth = 2 * g;   // the red saltire, counterchanged (offset clockwise)
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const off = (sx * sy > 0 ? 1 : -1) * g; c.beginPath(); c.moveTo(0, off); c.lineTo(sx * w / 2, sy * h / 2 + off); c.stroke(); }
    c.restore(); c.fillStyle = '#FFFFFF'; c.fillRect(-5 * g, -h / 2, 10 * g, h); c.fillRect(-w / 2, -5 * g, w, 10 * g);
    c.fillStyle = '#C8102E'; c.fillRect(-3 * g, -h / 2, 6 * g, h); c.fillRect(-w / 2, -3 * g, w, 6 * g); } },
};
// icons: vector marks drawn inside a size × size box centred on (0, 0)
const STICKER_ICONS = {
  document(c, s) {   // a treaty: paper with a folded corner, text lines, a red wax seal with ribbons
    const w = s * .66, h = s * .84, f = s * .16; c.fillStyle = '#FBF7EC'; c.strokeStyle = '#3B3A44'; c.lineWidth = s * .035; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(-w / 2, -h / 2); c.lineTo(w / 2 - f, -h / 2); c.lineTo(w / 2, -h / 2 + f); c.lineTo(w / 2, h / 2); c.lineTo(-w / 2, h / 2); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(w / 2 - f, -h / 2); c.lineTo(w / 2 - f, -h / 2 + f); c.lineTo(w / 2, -h / 2 + f); c.stroke();
    c.lineWidth = s * .03; c.strokeStyle = '#9A96A6'; for (let i = 0; i < 5; i++) { const y = -h / 2 + h * (.22 + i * .13), x1 = i === 4 ? -w * .05 : w * .32; c.beginPath(); c.moveTo(-w * .32, y); c.lineTo(x1, y); c.stroke(); }
    c.fillStyle = '#B3262E'; c.beginPath(); c.moveTo(w * .14, h * .38); c.lineTo(w * .08, h * .62); c.lineTo(w * .2, h * .52); c.lineTo(w * .3, h * .62); c.lineTo(w * .26, h * .38); c.fill();
    c.beginPath(); c.arc(w * .2, h * .32, s * .11, 0, TAU); c.fill(); c.strokeStyle = '#7E1820'; c.lineWidth = s * .025; c.stroke();
  },
  cannon(c, s) {   // a muzzle-loading cannon on a wheeled carriage, facing +x
    c.lineJoin = 'round'; c.strokeStyle = '#26252C'; c.lineWidth = s * .035;
    c.save(); c.translate(-s * .05, -s * .05); c.rotate(-.28); c.fillStyle = '#4A4A55'; c.beginPath(); c.roundRect(-s * .42, -s * .1, s * .84, s * .2, s * .08); c.fill(); c.stroke();
    c.fillStyle = '#26252C'; c.beginPath(); c.arc(s * .42, 0, s * .06, 0, TAU); c.fill(); c.restore();
    c.fillStyle = '#8A5A33'; c.beginPath(); c.moveTo(-s * .35, s * .18); c.lineTo(s * .15, s * .02); c.lineTo(s * .2, s * .14); c.lineTo(-s * .3, s * .3); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#6B4325'; c.beginPath(); c.arc(-s * .02, s * .24, s * .17, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = '#26252C'; c.beginPath(); c.arc(-s * .02, s * .24, s * .05, 0, TAU); c.fill();
  },
  axe(c, s) {   // a woodcutter's axe, handle diagonal
    c.save(); c.rotate(-.5); c.lineJoin = 'round'; c.strokeStyle = '#26252C'; c.lineWidth = s * .035;
    c.fillStyle = '#9B6A3C'; c.beginPath(); c.roundRect(-s * .05, -s * .45, s * .1, s * .92, s * .04); c.fill(); c.stroke();
    c.fillStyle = '#C9CDD6'; c.beginPath(); c.moveTo(-s * .06, -s * .4); c.lineTo(s * .3, -s * .48); c.quadraticCurveTo(s * .4, -s * .28, s * .3, -s * .08); c.lineTo(-s * .06, -s * .18); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = '#FFFFFF'; c.lineWidth = s * .03; c.beginPath(); c.moveTo(s * .3, -s * .42); c.quadraticCurveTo(s * .36, -s * .28, s * .3, -s * .14); c.stroke(); c.restore();
  },
  crown(c, s) {
    c.lineJoin = 'round'; c.strokeStyle = '#7A5410'; c.lineWidth = s * .035; c.fillStyle = '#F2C23A';
    c.beginPath(); c.moveTo(-s * .4, s * .25); c.lineTo(-s * .44, -s * .2); c.lineTo(-s * .2, s * .02); c.lineTo(0, -s * .32); c.lineTo(s * .2, s * .02); c.lineTo(s * .44, -s * .2); c.lineTo(s * .4, s * .25); c.closePath(); c.fill(); c.stroke();
    c.fillRect(-s * .4, s * .22, s * .8, s * .12); c.strokeRect(-s * .4, s * .22, s * .8, s * .12);
    c.fillStyle = '#C8102E'; for (const x of [-.44, 0, .44]) { c.beginPath(); c.arc(x * s, (x ? -.2 : -.32) * s, s * .05, 0, TAU); c.fill(); }
  },
  coin(c, s) {
    c.fillStyle = '#E8B730'; c.strokeStyle = '#8A6312'; c.lineWidth = s * .04; c.beginPath(); c.arc(0, 0, s * .4, 0, TAU); c.fill(); c.stroke();
    c.beginPath(); c.arc(0, 0, s * .3, 0, TAU); c.lineWidth = s * .025; c.stroke(); c.fillStyle = '#FFF0B3'; STAR(c, 0, s * .01, s * .18);
  },
};
const GLYPH_BG = { '?': '#F2B92B', '!': '#E8541E', '✕': '#D7312E', 'x': '#D7312E', '✓': '#2E9D57' };

// draw a sticker centred on (0, 0), `size` px wide (flags) or across (icons, glyphs); card: white die-cut border + shadow
function drawSticker(c, o, size) {
  const u = US(), card = o.card !== false, border = size * .07;
  c.save();
  if (o.flag) {
    const F = FLAGS[o.flag]; if (!F) throw new Error(`sticker: no flag "${o.flag}" (have ${Object.keys(FLAGS).join(', ')}; use image for others)`);
    const w = size, h = size * F.ratio;
    if (card) { c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 10 * u; c.shadowOffsetY = 4 * u; c.fillStyle = '#FFFFFF'; c.beginPath(); c.roundRect(-w / 2 - border, -h / 2 - border, w + 2 * border, h + 2 * border, border * 1.4); c.fill(); c.shadowColor = 'transparent'; }
    c.save(); c.beginPath(); c.roundRect(-w / 2, -h / 2, w, h, border * .5); c.clip(); F.draw(c, w, h); c.restore();
  } else if (o.image) {
    const img = STICKER_IMG[o.image]; if (!img) throw new Error(`sticker: image ${o.image} was not preloaded (is the path right?)`);
    const ar = img.height / img.width, w = size, h = size * ar, el = img.canvas || img.elt;
    if (card) { c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 10 * u; c.shadowOffsetY = 4 * u; }
    c.drawImage(el, -w / 2, -h / 2, w, h);
  } else if (o.icon) {
    const I = STICKER_ICONS[o.icon]; if (!I) throw new Error(`sticker: no icon "${o.icon}" (have ${Object.keys(STICKER_ICONS).join(', ')})`);
    if (card) { c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 10 * u; c.shadowOffsetY = 4 * u; c.fillStyle = '#FFFFFF'; c.beginPath(); c.arc(0, 0, size * .62, 0, TAU); c.fill(); c.shadowColor = 'transparent'; }
    I(c, size);
  } else {
    const g = o.glyph || '?', bg = o.color || GLYPH_BG[g] || '#2B2A3A';
    c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 10 * u; c.shadowOffsetY = 4 * u;
    if (card) { c.fillStyle = '#FFFFFF'; c.beginPath(); c.arc(0, 0, size / 2 + border, 0, TAU); c.fill(); }
    c.fillStyle = bg; c.beginPath(); c.arc(0, 0, size / 2, 0, TAU); c.fill(); c.shadowColor = 'transparent';
    c.fillStyle = o.ink || '#FFFFFF'; c.font = fontCss({ font: 'display', weight: 800, size: size * .7 / TS() }); c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(g === 'x' ? '✕' : g, 0, size * .04);
  }
  c.restore();
}
// pop-in scale (backOut with a little spring), shared by sticker and mapPin
const stickerPop = (t, o) => { const k = seg(t, o.at, o.at + o.dur); return k <= 0 ? 0 : backOut(k) * (1 + .06 * spring(t, o.at + o.dur, 6, 18)); };
const stickerOut = (t, o) => o.out != null ? 1 - clamp((t - o.out) / (o.outDur || .3)) : 1;
const STICKER_META = (tags, extra = {}) => ({ version: '1.0.0', category: 'sticker', tags: ['sticker', 'icon', 'explainer', 'documentary', ...tags], camera: 'screen', layers: ['screen'],
  params: { flag: { enum: [null, ...Object.keys(FLAGS)] }, icon: { enum: [null, ...Object.keys(STICKER_ICONS)] }, size: { min: 20, max: 700 }, ...extra } });
const STICKER_DEF = { flag: null, icon: null, glyph: null, image: null, color: null, ink: '#FFFFFF', card: true };

definePreset('sticker', {
  label: 'Sticker', about: 'a die-cut sticker that pops in on screen: a national flag, an icon (document/treaty, cannon, axe, crown, coin), a glyph (? ! ✕ ✓) or an imported PNG (a character, an object); optional bob and exit',
  meta: STICKER_META(['flag', 'country', 'treaty', 'question', 'cross', 'character', 'image', 'emoji'], { rot: { min: -1, max: 1 } }),
  defaults: { x: .5, y: .45, size: 160, rot: 0, bob: 0, ...STICKER_DEF, out: null, outDur: .3, ease: 'backOut', dur: .45 },
  run(t, o) {
    const s = stickerPop(t, o) * stickerOut(t, o); if (s <= .001) return;
    const { g, c } = stkCtx(o, 'sticker'), u = US();
    c.save(); c.translate(o.x * W, o.y * H + Math.sin((t - o.at) * 3.2) * 5 * o.bob * u); c.rotate(o.rot + (1 - clamp((t - o.at) / o.dur)) * .25); c.scale(s, s);
    drawSticker(c, o, o.size * u); c.restore(); stkBlit(g);
  },
  demo: { bg: '#2E5E7E', after: [['sticker', { at: .3, x: .32, y: .45, flag: 'gb', size: 240 }], ['sticker', { at: .6, x: .68, y: .45, icon: 'document', size: 200 }], ['sticker', { at: .9, x: .5, y: .66, glyph: '?', size: 130 }]] },
});

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const TH_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
definePreset('dateCard', {
  label: 'Date Card', about: 'a date in history. style ticker (default): an accent bar grows, the year rolls in like an odometer (from the previous date\'s year with `from`), the day and full Thai month slide out beside it; style calendar: a tear-off calendar card (Thai month in a red header, the day large). era ce = ค.ศ., be = พ.ศ., none',
  meta: { version: '1.1.0', category: 'sticker', tags: ['date', 'calendar', 'day', 'year', 'history', 'timeline', 'event', 'documentary', 'odometer', 'counter'], camera: 'screen', layers: ['screen'],
    params: { style: { enum: ['ticker', 'calendar'] }, day: { min: 0, max: 31 }, month: { min: 0, max: 12 }, era: { enum: ['ce', 'be', 'none'] }, size: { min: 60, max: 600 }, align: { enum: ['right', 'left'] } } },
  defaults: { style: 'ticker', x: .93, y: .1, size: 150, day: 18, month: 4, year: 1855, from: null, era: 'none', align: 'right', header: '#D7312E', accent: '#F2C14E', color: '#FFFFFF', out: null, outDur: .3, ease: 'backOut', dur: .45 },
  run(t, o) {
    if (o.style !== 'calendar') return dateTicker(t, o);
    const s = stickerPop(t, o) * stickerOut(t, o); if (s <= .001) return;
    const { g, c } = stkCtx(o, 'dateCard'), u = US(), w = o.size * u, h = w * 1.12, hh = h * .3, r = w * .1;
    c.save(); c.translate(o.x * W, o.y * H); c.rotate((1 - clamp((t - o.at) / o.dur)) * .2); c.scale(s, s);
    c.shadowColor = 'rgba(0,0,0,.4)'; c.shadowBlur = 12 * u; c.shadowOffsetY = 5 * u; c.fillStyle = '#FFFFFF'; c.beginPath(); c.roundRect(-w / 2, -h / 2, w, h, r); c.fill(); c.shadowColor = 'transparent';
    c.save(); c.beginPath(); c.roundRect(-w / 2, -h / 2, w, h, r); c.clip(); c.fillStyle = o.header; c.fillRect(-w / 2, -h / 2, w, hh); c.restore();
    c.fillStyle = '#2B2A3A'; for (const x of [-.25, .25]) { c.beginPath(); c.roundRect(x * w - w * .035, -h / 2 - w * .06, w * .07, w * .16, w * .035); c.fill(); }   // rings
    const T = (txt, y, sz, col, wt = 800) => { c.fillStyle = col; c.font = fontCss({ font: 'display', weight: wt, size: sz / TS() }); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, 0, y); };
    T(TH_MONTHS[(o.month - 1 + 12) % 12], -h / 2 + hh * .56, w * .2, '#FFFFFF', 700);
    T(String(o.day), -h / 2 + hh + (h - hh) * .4, w * .44, '#22202A');
    const yr = o.era === 'be' ? o.year + 543 : o.year, eraTxt = { ce: 'ค.ศ. ', be: 'พ.ศ. ', none: '' }[o.era];
    T(eraTxt + yr, h / 2 - (h - hh) * .17, w * .14, '#6F6A78', 700);
    c.restore(); stkBlit(g);
  },
  demo: { bg: '#2E5E7E', after: [['dateCard', { at: .3, x: .9, y: .3, size: 200, day: 13, month: 7, year: 1893, from: 1855, era: 'ce' }], ['dateCard', { at: .3, style: 'calendar', x: .5, y: .62, size: 260, day: 13, month: 7, year: 1893, era: 'ce' }]] },
});

// the ticker date: [day month] over [YEAR] beside an accent bar, right (or left) aligned on x. The year's digits roll up
// like an odometer and lock in from left to right; with `from` (the last date's year) only the changed digits roll.
function dateTicker(t, o) {
  const q = stickerOut(t, o), k = clamp((t - o.at) / .9); if (k <= 0 || q <= 0) return;
  const { g, c } = stkCtx(o, 'dateCard'), u = US(), S = o.size / 150, yr = o.era === 'be' ? o.year + 543 : o.year, era = { ce: 'ค.ศ.', be: 'พ.ศ.', none: '' }[o.era];
  const big = 96 * S, small = 36 * S, bar = 7 * S * u, gap = 18 * S * u, R = o.align !== 'left', X = o.x * W, Y = o.y * H;
  c.save(); c.globalAlpha = q; c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = 14 * u; c.shadowOffsetY = 3 * u;
  // the accent bar grows downward
  const bh = (big + small * 1.25) * TS() * easeOut(clamp(k / .35)); c.fillStyle = o.accent; c.fillRect(R ? X - bar : X, Y, bar, bh);
  const tx = R ? X - bar - gap : X + bar + gap; c.textAlign = R ? 'right' : 'left'; c.textBaseline = 'alphabetic';
  // year: each digit a reel. The odometer runs from `from` (or 10 years before) to the year; digit i settles last-first
  const ys = String(yr), fy = String(o.from != null ? (o.era === 'be' ? o.from + 543 : o.from) : yr - 10).padStart(ys.length, '0').slice(-ys.length);
  c.font = fontCss({ font: 'display', weight: 800, size: big }); const dw = c.measureText('0').width, yh = big * TS(), base = Y + small * 1.25 * TS() + yh * .86;
  const yw = dw * ys.length, x0 = R ? tx - yw : tx;
  c.save(); c.beginPath(); c.rect(x0 - 4 * u, base - yh * .95, yw + 8 * u, yh * 1.12); c.clip(); c.textAlign = 'center'; c.fillStyle = o.color;
  for (let i = 0; i < ys.length; i++) {
    const a = +fy[i], b = +ys[i], steps = (b - a + 10) % 10, kk = easeOut(clamp((k - .15 - i * .07) / .55)), pos = steps * kk;
    const d0 = Math.floor(pos), f = pos - d0;
    for (const [dd, off] of [[d0, 0], [d0 + 1, 1]]) { const ch = String((a + dd) % 10); c.globalAlpha = q * (off ? f : 1 - f * .3); c.fillText(ch, x0 + dw * (i + .5), base + (off - f) * yh * .9); }
  }
  c.restore();
  if (era) { c.font = fontCss({ font: 'display', weight: 600, size: small * .8 }); c.fillStyle = o.color; c.globalAlpha = q * .8 * clamp((k - .5) / .3); c.fillText(era, R ? x0 - 10 * u : x0 + yw + 10 * u, base); c.textAlign = R ? 'right' : 'left'; }
  // day and month slide out from behind the bar
  if (o.day || o.month) {
    const txt = [o.day || '', o.month ? TH_MONTHS_FULL[(o.month - 1 + 12) % 12] : ''].filter(Boolean).join(' '), m = easeOut(clamp((k - .25) / .45));
    c.save(); c.beginPath(); R ? c.rect(0, Y - small, tx + 2 * u, small * 2.2 * TS()) : c.rect(tx - 2 * u, Y - small, W, small * 2.2 * TS()); c.clip();
    c.globalAlpha = q * m; c.fillStyle = o.accent; c.font = fontCss({ font: 'display', weight: 700, size: small }); c.textAlign = R ? 'right' : 'left';
    c.fillText(txt, tx + (R ? 1 : -1) * (1 - m) * 80 * u, Y + small * TS() * .95); c.restore();
  }
  c.restore(); stkBlit(g);
}

definePreset('chapterBadge', {
  label: 'Chapter Badge', about: 'a chapter title (left aligned). With a number: the number in a coloured disc pops, the title slides in beside it ("reason 1, 2, 3"). number null: no number, a coloured bar grows and the title is revealed from behind it, underlined by a thin line (parts of a story)',
  meta: { version: '1.1.0', category: 'sticker', tags: ['chapter', 'number', 'list', 'step', 'reason', 'part', 'title', 'explainer'], camera: 'screen', layers: ['screen'],
    params: { size: { min: 20, max: 160 } } },
  defaults: { x: .07, y: .12, number: 1, text: '', size: 54, color: '#FFD43B', ink: '#22202A', textColor: '#FFFFFF', stroke: '#1A1A1A', highlight: '#FFD43B', out: null, outDur: .3, ease: 'backOut', dur: .45 },
  run(t, o) {
    if (o.number == null || o.number === '') return chapterLine(t, o);
    const q = stickerOut(t, o), s = stickerPop(t, o) * q; if (s <= .001) return;
    const { g, c } = stkCtx(o, 'chapterBadge'), u = US(), d = o.size * u * 1.25, X = o.x * W + d / 2, Y = o.y * H;
    c.save(); c.translate(X, Y); c.scale(s, s); c.shadowColor = 'rgba(0,0,0,.4)'; c.shadowBlur = 10 * u; c.shadowOffsetY = 4 * u;
    c.fillStyle = '#FFFFFF'; c.beginPath(); c.arc(0, 0, d / 2 + 4 * u, 0, TAU); c.fill(); c.fillStyle = o.color; c.beginPath(); c.arc(0, 0, d / 2, 0, TAU); c.fill();
    c.shadowColor = 'transparent'; c.fillStyle = o.ink; c.font = fontCss({ font: 'display', weight: 800, size: o.size * .95 }); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(o.number), 0, d * .04); c.restore();
    const k = o.text ? easeOut(clamp((t - o.at - .12) / .4)) * q : 0; if (k <= 0) return stkBlit(g);   // the title slides out from behind the disc
    const parts = String(o.text).split(/(\[[^\]]*\])/).filter(Boolean), st = { font: 'display', weight: 800, size: o.size * .9 };
    c.save(); c.font = fontCss(st); c.textBaseline = 'middle'; c.textAlign = 'left'; c.globalAlpha = k; c.beginPath(); c.rect(X + d / 2, Y - d, W, d * 2); c.clip();
    let x = X + d / 2 + 14 * u - (1 - k) * 60 * u;
    for (const p of parts) { const hl = p[0] === '[' && p.at(-1) === ']', txt = hl ? p.slice(1, -1) : p;
      c.lineJoin = 'round'; c.lineWidth = 9 * u; c.strokeStyle = o.stroke; c.strokeText(txt, x, Y + d * .04); c.fillStyle = hl ? o.highlight : o.textColor; c.fillText(txt, x, Y + d * .04); x += c.measureText(txt).width; }
    c.restore(); stkBlit(g);
  },
  demo: { bg: '#2E5E7E', after: [['chapterBadge', { at: .3, x: .08, y: .3, number: 1, text: 'ยอม[เปิดการค้า]' }], ['chapterBadge', { at: .6, x: .08, y: .5, number: null, text: 'ปฏิรูป[ประเทศ]', color: '#D7312E' }]] },
});

// a chapter title without a number: a bar in the chapter colour grows, the title is wiped in from behind it, a thin
// line underlines it; leaves by wiping back
function chapterLine(t, o) {
  const q = stickerOut(t, o), k = clamp((t - o.at) / .8); if (k <= 0 || q <= 0) return;
  const { g, c } = stkCtx(o, 'chapterBadge'), u = US(), px = o.size * .82 * TS(), X = o.x * W, Y = o.y * H, bar = .16 * px;
  const parts = String(o.text).split(/(\[[^\]]*\])/).filter(Boolean);
  c.save(); c.font = fontCss({ font: 'display', weight: 700, size: o.size * .82 }); c.textBaseline = 'middle'; c.textAlign = 'left';
  const tw = parts.reduce((a, p) => a + c.measureText(p[0] === '[' ? p.slice(1, -1) : p).width, 0);
  const kb = easeOut(clamp(k / .3)) * q, kt = easeOut(clamp((k - .18) / .5)) * q, kl = easeOut(clamp((k - .35) / .5)) * q;
  c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = 12 * u; c.shadowOffsetY = 3 * u;
  c.fillStyle = o.color; c.fillRect(X, Y - px * .62 * kb, bar, px * 1.24 * kb);   // the bar grows from its middle
  const x0 = X + bar + .35 * px;
  c.save(); c.beginPath(); c.rect(X + bar, Y - px, (tw + .5 * px) * kt, px * 2); c.clip();
  let x = x0 - (1 - kt) * .6 * px;
  for (const p of parts) { const hl = p[0] === '[' && p.at(-1) === ']', txt = hl ? p.slice(1, -1) : p; c.fillStyle = hl ? o.highlight : o.textColor; c.fillText(txt, x, Y + px * .04); x += c.measureText(txt).width; }
  c.restore();
  c.globalAlpha = .85; c.fillStyle = o.textColor; c.fillRect(x0, Y + px * .62, tw * kl, Math.max(2, .045 * px));   // the underline
  c.restore(); stkBlit(g);
}

// pinned to a place on the map (drawn by mapView with the other map layers, so it stays on the place)
definePreset('mapPin', {
  label: 'Map Pin Sticker', about: 'a sticker pinned to a place: a national flag (on a card or a pole), an icon (treaty document, cannon, axe, crown, coin), a glyph (? ! ✕ ✓) or an imported PNG; pops in and bobs gently, stays on the place while the camera moves',
  meta: { version: '1.0.0', category: 'map', tags: ['map', 'flag', 'country', 'colonial power', 'pin', 'sticker', 'icon', 'treaty', 'question', 'cross', 'battle', 'image'],
    params: { flag: { enum: [null, ...Object.keys(FLAGS)] }, icon: { enum: [null, ...Object.keys(STICKER_ICONS)] }, style: { enum: ['card', 'pole'] }, size: { min: 12, max: 400 }, bob: { min: 0, max: 3 } },
    assets: [{ param: 'lonlat', type: 'place' }], layers: ['overlay'] },
  defaults: { lonlat: [0, 0], dx: 0, dy: 0, style: 'card', size: 90, bob: 1, flag: null, icon: null, glyph: null, image: null, color: null, ink: '#FFFFFF', card: true, out: null, outDur: .3, ease: 'backOut', dur: .45 },
  run(t, o) {
    if (!mapVisible(o.lonlat)) return; const p = mapPt(o.lonlat); if (!p) return;
    const s = stickerPop(t, o) * stickerOut(t, o); if (s <= .001) return;
    const c = mapCtx(), u = US(), size = o.size * u, x = p[0] + o.dx * u, y = p[1] + o.dy * u + Math.sin((t - o.at) * 3.2) * 3 * o.bob * u;
    c.save();
    if (o.style === 'pole' && o.flag) {   // a flag on a pole planted in the place
      const h = size * 1.15, F = FLAGS[o.flag], fh = size * (F?.ratio || .66) * .8;
      c.strokeStyle = '#3A3A44'; c.lineWidth = 4 * u; c.lineCap = 'round'; c.globalAlpha = Math.min(1, s);
      c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(p[0], p[1] - h * s); c.stroke();
      c.fillStyle = '#3A3A44'; c.beginPath(); c.ellipse(p[0], p[1], 7 * u, 3 * u, 0, 0, TAU); c.fill();
      c.translate(p[0] + size * .4 * s, p[1] - h * s + fh / 2); c.rotate(Math.sin(t * 2.4) * .04); c.scale(s * .8, s * .8); drawSticker(c, { ...o, card: false }, size);
    } else { c.translate(x, y); c.scale(s, s); drawSticker(c, o, size); }
    c.restore();
  },
});
