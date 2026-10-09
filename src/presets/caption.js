// caption.js: captionBar — the documentary subtitle. Bold Thai text with a dark outline near the bottom of the frame;
// words in [square brackets] take the accent colour (the narration's keyword), the brackets are not shown. Thai
// shaping is the browser's; lines wrap at Thai word boundaries (Intl.Segmenter) and the size shrinks to fit two lines.
// Screen space (drawn after the camera). Pops in (backOut), holds, fades out at `end`.
const CAP = { g: null };
(window.PRELOAD = window.PRELOAD || []).push(async () => { if (typeof registerFonts === 'function') registerFonts(); });   // the bundled Thai faces
definePreset('captionBar', {
  label: 'Caption Bar', about: 'documentary subtitle: bold Thai text with a dark outline near the bottom, [bracketed] keywords in the accent colour; pops in, fades out',
  meta: { version: '1.0.0', category: 'type', tags: ['caption', 'subtitle', 'text', 'thai', 'keyword', 'highlight', 'narration', 'lower third'],
    params: { y: { min: 0, max: 1 }, size: { min: 20, max: 140 }, font: { enum: ['display', 'body'] }, maxWidth: { min: .3, max: 1 } }, camera: 'screen', layers: ['text'] },
  defaults: { text: '', y: .8, size: 54, maxWidth: .86, color: '#FFFFFF', accent: '#FFD43B', stroke: '#141414', font: 'display', weight: 700, end: null, outDur: .25, ease: 'backOut', dur: .35 },
  run(t, o) {
    if (!o.text || t < o.at) return;
    const k = presetK(t, o), q = o.end != null ? 1 - clamp((t - o.end) / o.outDur) : 1; if (q <= 0) return;
    if (!CAP.g) { CAP.g = createGraphics(W, H); CAP.g.pixelDensity(1); }
    const c = CAP.g.drawingContext; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H);
    // tokens: Thai words, each tagged plain / keyword
    const toks = []; o.text.split(/(\[[^\]]*\])/).forEach(part => { const key = part.startsWith('['); for (const w of words(key ? part.slice(1, -1) : part)) toks.push({ w, key }); });
    let size = o.size, lines;
    for (; size > 18; size *= .92) {   // greedy wrap; shrink until it fits in two lines
      c.font = fontCss({ font: o.font, weight: o.weight, size }); lines = [[]]; let x = 0;
      for (const tk of toks) { const w = c.measureText(tk.w).width; if (x + w > W * o.maxWidth && lines.at(-1).length && tk.w.trim()) { lines.push([]); x = 0; } if (!lines.at(-1).length && !tk.w.trim()) continue; lines.at(-1).push({ ...tk, wd: w }); x += w; }
      if (lines.length <= 2) break;
    }
    const px = size * TS(), lh = px * 1.3, s = lerp(.86, 1, k), y0 = H * o.y - (lines.length - 1) * lh / 2;
    c.save(); c.globalAlpha = Math.min(clamp(k * 1.6), q); c.translate(W / 2, H * o.y); c.scale(s, s); c.translate(-W / 2, -H * o.y);
    c.textBaseline = 'middle'; c.lineJoin = 'round'; c.lineWidth = px * .2;
    lines.forEach((ln, i) => {
      const tw = ln.reduce((a, b) => a + b.wd, 0); let x = (W - tw) / 2; const y = y0 + i * lh;
      for (const tk of ln) { c.strokeStyle = o.stroke; c.strokeText(tk.w, x, y); c.fillStyle = tk.key ? o.accent : o.color; c.fillText(tk.w, x, y); x += tk.wd; }
    });
    c.restore();
    flushBrush(); push(); resetMatrix(); translate(-W / 2, -H / 2); image(CAP.g, 0, 0); pop();
  },
});
