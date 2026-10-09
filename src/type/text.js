// type/text.js: text for TYPOGRAPHY MODE (src/type/kinetic.js). Thai needs real shaping (vowels and tone marks stacked
// on their consonants, Sara Am, ascending/descending marks), which p5.brush cannot do, so text is drawn with the
// browser's own text engine on a 2D canvas layer and composited over the frame. Units are always whole grapheme
// clusters (Intl.Segmenter), so a progressive reveal never shows a tone mark without its consonant.
//
//   registerFonts({ display: { family, faces: [{ src, weight, range }], fallback: [...] }, body: {...} })
//   graphemes(s) · words(s) (Thai word segmentation, keeps spaces) · fontCss(style)
//   layout(text, style, maxWidth)  → { lines: [{ units: [{ text, x, w, gx (grapheme offsets) }], w, y }], h }
//   wordTimes(units, at, end)      → each word's start/end inside [at, end], weighted by its graphemes
//   typeLayer()                    → the 2D canvas text is drawn on; compositeType() puts it into the frame
// Sizes are px for a 1080 short side, so the same data reads right at 1080 × 1920 and 1920 × 1080.

const FONTS = {
  display: { family: 'Kanit', fallback: ['Leelawadee UI', 'Noto Sans Thai', 'Tahoma', 'Loma', 'sans-serif'] },
  body: { family: 'Sarabun', fallback: ['Leelawadee UI', 'Noto Sans Thai', 'Tahoma', 'Loma', 'sans-serif'] },
};
const THAI_RANGE = 'U+0E01-0E5B, U+200C-200D, U+25CC', LATIN_RANGE = 'U+0000-00FF, U+2000-206F, U+20AC, U+2122, U+2212';
// The bundled open-licence fonts (assets/fonts, SIL OFL): Kanit for display, Sarabun for body text.
const BUNDLED_FACES = {
  Kanit: [500, 700, 800].flatMap(w => [{ src: `assets/fonts/kanit-thai-${w}-normal.woff2`, weight: w, range: THAI_RANGE }, { src: `assets/fonts/kanit-latin-${w}-normal.woff2`, weight: w, range: LATIN_RANGE }]),
  Sarabun: [400, 600].flatMap(w => [{ src: `assets/fonts/sarabun-thai-${w}-normal.woff2`, weight: w, range: THAI_RANGE }, { src: `assets/fonts/sarabun-latin-${w}-normal.woff2`, weight: w, range: LATIN_RANGE }]),
};

// Add or replace font roles: { role: { family, faces?: [{ src, weight, range }], fallback?: [...] } }. Faces load before
// the first frame; a face that fails to load falls back to the next family in the list (with a console warning).
function registerFonts(roles = {}) {
  Object.assign(FONTS, roles);
  const faces = [];
  for (const r of Object.values(FONTS)) for (const f of r.faces || BUNDLED_FACES[r.family] || []) faces.push([r.family, f]);
  (window.PRELOAD = window.PRELOAD || []).push(async () => {
    for (const [family, f] of faces) {
      try { const face = new FontFace(family, `url(${f.src})`, { weight: String(f.weight || 400), unicodeRange: f.range || 'U+0000-FFFF' }); await face.load(); document.fonts.add(face); }
      catch (e) { console.warn(`type: could not load ${family} ${f.weight} from ${f.src}; using the fallback fonts`); }
    }
  });
}

const SEG_G = new Intl.Segmenter('th', { granularity: 'grapheme' }), SEG_W = new Intl.Segmenter('th', { granularity: 'word' });
const graphemes = s => [...SEG_G.segment(s)].map(x => x.segment);
const words = s => [...SEG_W.segment(s)].map(x => x.segment);   // Thai dictionary segmentation; spaces come back as their own pieces
const TS = () => Math.min(W, H) / 1080;                       // type scale for this canvas
function fontCss(st) {
  const role = FONTS[st.font || 'display'] || FONTS.display;
  return `${st.weight || 700} ${(st.size || 80) * TS()}px "${role.family}", ${role.fallback.map(f => f.includes(' ') ? `"${f}"` : f).join(', ')}`;
}

let TYPE_G = null;
const typeLayer = () => { if (!TYPE_G) { TYPE_G = createGraphics(W, H); TYPE_G.pixelDensity(1); } return TYPE_G.drawingContext; };
function compositeType() {
  if (!TYPE_G) return;
  flushBrush(); push(); resetMatrix(); translate(-W / 2, -H / 2); image(TYPE_G, 0, 0); pop();
}

// Lay text out in lines no wider than maxWidth (px), breaking only between words (or at explicit \n).
function layout(text, st, maxWidth = W * .86) {
  const c = typeLayer(); c.save(); c.font = fontCss(st);
  const size = (st.size || 80) * TS(), lh = size * (st.lineHeight || 1.3), lines = [];
  for (const para of text.split('\n')) {
    let line = [], lw = 0;
    const flush = () => { while (line.length && !line[line.length - 1].text.trim()) lw -= line.pop().w; lines.push({ units: line, w: lw }); line = []; lw = 0; };
    for (const wd of words(para)) {
      const w = c.measureText(wd).width;
      if (lw + w > maxWidth && line.length && wd.trim()) flush();
      if (!line.length && !wd.trim()) continue;   // no space at the start of a line
      const g = graphemes(wd), gx = []; let acc = '';
      for (const ch of g) { gx.push(c.measureText(acc).width); acc += ch; }
      line.push({ text: wd, x: lw, w, g, gx, space: !wd.trim() }); lw += w;
    }
    flush();
  }
  c.restore();
  lines.forEach((l, i) => { l.y = (i - (lines.length - 1) / 2) * lh; });
  return { lines, h: lines.length * lh, size, lh };
}

// The words of a layout (spaces dropped), each with its time inside [at, end], proportional to its grapheme count.
function wordTimes(L, at, end) {
  const ws = L.lines.flatMap((l, li) => l.units.filter(u => !u.space).map(u => ({ ...u, line: li, ly: l.y, lw: l.w })));
  const n = ws.reduce((s, w) => s + w.g.length, 0) || 1; let acc = 0;
  for (const w of ws) { w.t0 = at + (end - at) * acc / n; acc += w.g.length; w.t1 = at + (end - at) * acc / n; }
  return ws;
}

// Draw one string with a style, centred on (x, y) (its middle), with a transform: { sx, sy, rot, alpha, dx, dy }.
function drawText(c, s, x, y, st, tf = {}) {
  if ((tf.alpha ?? 1) <= .003) return;
  c.save(); c.translate(x + (tf.dx || 0), y + (tf.dy || 0)); c.rotate(tf.rot || 0); c.scale(tf.sx ?? tf.s ?? 1, tf.sy ?? tf.s ?? 1);
  c.globalAlpha = clamp(tf.alpha ?? 1); c.font = fontCss(st); c.textAlign = 'center'; c.textBaseline = 'middle';
  if (st.shadow) { c.shadowColor = st.shadow.color || 'rgba(0,0,0,.25)'; c.shadowBlur = (st.shadow.blur ?? 0) * TS(); c.shadowOffsetX = (st.shadow.dx ?? 0) * TS(); c.shadowOffsetY = (st.shadow.dy ?? 6) * TS(); }
  if (st.stroke) { c.lineJoin = 'round'; c.lineWidth = st.stroke.width * TS(); c.strokeStyle = st.stroke.color; c.strokeText(s, 0, 0); c.shadowColor = 'transparent'; }
  c.fillStyle = tf.color || st.color || '#2B2233'; c.fillText(s, 0, 0);
  c.restore();
}
