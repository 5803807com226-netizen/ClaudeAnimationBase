// caption.js: captionBar — the documentary subtitle. Bold Thai text with a dark outline near the bottom of the frame;
// words in [square brackets] take the accent colour (the narration's keyword), the brackets are not shown. Thai
// shaping is the browser's; lines wrap at Thai word boundaries (Intl.Segmenter) and the size shrinks to fit two lines.
// Screen space (drawn after the camera). Pops in (backOut), holds, fades out at `end`.
const CAP = { g: null };
(window.PRELOAD = window.PRELOAD || []).push(async () => { if (typeof registerFonts === 'function') registerFonts(); });   // the bundled Thai faces
definePreset('captionBar', {
  label: 'Caption Bar', about: 'documentary subtitle near the bottom, Kanit with a soft shadow. mode lines (default): one line at a time, in step with the narration (each line gets time by its length; break lines yourself with \\n), rising in and fading out; mode block: the whole text at once (two lines at most). [bracketed] keywords in the accent colour: mark them only in the sentences that matter',
  meta: { version: '1.1.0', category: 'type', tags: ['caption', 'subtitle', 'text', 'thai', 'keyword', 'highlight', 'narration', 'lower third', 'karaoke', 'line by line'],
    params: { mode: { enum: ['lines', 'block'] }, y: { min: 0, max: 1 }, size: { min: 20, max: 140 }, font: { enum: ['display', 'body'] }, maxWidth: { min: .3, max: 1 } }, camera: 'screen', layers: ['text'] },
  defaults: { text: '', mode: 'lines', y: .8, size: 54, maxWidth: .86, color: '#FFFFFF', accent: '#FFD43B', stroke: '#141414', font: 'display', weight: 700, end: null, outDur: .25, ease: 'backOut', dur: .35 },
  run(t, o) {
    if (!o.text || t < o.at) return;
    const q = o.end != null ? 1 - clamp((t - o.end) / o.outDur) : 1; if (q <= 0) return;
    if (!CAP.g) { CAP.g = createGraphics(W, H); CAP.g.pixelDensity(1); }
    const c = CAP.g.drawingContext; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H);
    const lines = capLines(c, o);
    if (o.mode === 'block') capBlock(c, o, lines, presetK(t, o), q);
    else {   // one line at a time: line i owns a share of [at, end] by its length
      const end = o.end != null ? o.end : o.at + Math.max(2, lines.length * 2), len = lines.map(l => l.reduce((a, b) => a + b.w.length, 0) + 4), sum = len.reduce((a, b) => a + b, 0);
      let a0 = o.at;
      for (let i = 0; i < lines.length; i++) {
        const a1 = i === lines.length - 1 ? end : a0 + (end - o.at) * len[i] / sum;
        if (t >= a0 && t < a1 + (i === lines.length - 1 ? o.outDur : 0)) {
          const kin = easeOut(clamp((t - a0) / .28)), kout = i === lines.length - 1 ? q : 1 - clamp((t - (a1 - .12)) / .12);
          capDraw(c, o, Object.assign([lines[i]], { size: lines.size }), o.y, kin, Math.min(kin, kout), true);
        }
        a0 = a1;
      }
    }
    flushBrush(); push(); resetMatrix(); translate(-W / 2, -H / 2); image(CAP.g, 0, 0); pop();
  },
});
// tokens (Thai words, plain or keyword) wrapped into lines at maxWidth; '\n' forces a break. In block mode the size
// shrinks until the text fits two lines
function capLines(c, o) {
  const out = [];
  for (const [n, para] of String(o.text).split(/\\n|\n/).entries()) {
    const toks = []; para.split(/(\[[^\]]*\])/).forEach(part => { const key = part.startsWith('['); for (const w of words(key ? part.slice(1, -1) : part)) toks.push({ w, key }); });
    out.push(toks);
  }
  let size = o.size, lines;
  for (; size > 18; size *= .92) {
    c.font = fontCss({ font: o.font, weight: o.weight, size }); lines = [];
    for (const toks of out) { lines.push([]); let x = 0;
      for (const tk of toks) { const w = c.measureText(tk.w).width; if (x + w > W * o.maxWidth && lines.at(-1).length && tk.w.trim()) { lines.push([]); x = 0; } if (!lines.at(-1).length && !tk.w.trim()) continue; lines.at(-1).push({ ...tk, wd: w }); x += w; } }
    if (o.mode !== 'block' || lines.length <= 2) break;
  }
  lines.size = size; return lines;
}
function capBlock(c, o, lines, k, q) { capDraw(c, o, lines, o.y, k, Math.min(clamp(k * 1.6), q), false); }
// draw lines centred on y: Kanit, a thin dark outline under a soft shadow (readable on any map); keywords pop a little
function capDraw(c, o, lines, y, k, alpha, rise) {
  const px = lines.size * TS(), lh = px * 1.32, y0 = H * y - (lines.length - 1) * lh / 2, u = US();
  c.save(); c.globalAlpha = alpha; c.font = fontCss({ font: o.font, weight: o.weight, size: lines.size }); c.textBaseline = 'middle'; c.lineJoin = 'round';
  if (rise) c.translate(0, (1 - k) * px * .45); else { const s = lerp(.86, 1, k); c.translate(W / 2, H * y); c.scale(s, s); c.translate(-W / 2, -H * y); }
  lines.forEach((ln, i) => {
    const tw = ln.reduce((a, b) => a + b.wd, 0); let x = (W - tw) / 2; const yy = y0 + i * lh;
    for (const tk of ln) {
      c.save(); if (tk.key) { const s = 1 + .12 * Math.sin(Math.PI * clamp(k * 1.4 - .2)); c.translate(x + tk.wd / 2, yy); c.scale(s, s); c.translate(-(x + tk.wd / 2), -yy); }
      c.shadowColor = 'rgba(0,0,0,.75)'; c.shadowBlur = px * .3; c.shadowOffsetY = px * .05; c.lineWidth = px * .13; c.strokeStyle = o.stroke; c.strokeText(tk.w, x, yy);
      c.shadowColor = 'transparent'; c.fillStyle = tk.key ? o.accent : o.color; c.fillText(tk.w, x, yy); c.restore(); x += tk.wd;
    }
  });
  c.restore();
}
