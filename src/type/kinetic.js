// type/kinetic.js: KINETIC TYPOGRAPHY mode. Data-driven text animation for Thai (and any script the browser shapes),
// on its own text layer (type/text.js), timed from narration. Pure functions of time like everything else.
//
// The guide's no-text rule is for illustration scenes; a typography story declares PROJECT.mode = 'typography' and is
// exempt. Text is never baked into images: it is live text, drawn here.
//
//   playType({
//     background: '#…' (or null: nothing painted behind the text, for a future transparent overlay),
//     fonts: { role: { family, faces, fallback } },        // optional extra fonts (type/text.js registerFonts)
//     narration: [{ at, end, text }, ...],                  // timestamps from the voiceover
//     decor: [(t) => ...],                                  // optional p5 / p5.brush painters behind the text
//     items: [{ preset, text | say: i, at, end | dur, x, y (fractions of the frame), style: { font, weight, size, color,
//               stroke, shadow, highlight, ... }, maxWidth (fraction of W), out: { at, dur, kind: 'fade' | 'up' | 'scale' },
//               ...preset options }],
//     fade: { in, out, color }, duration,
//   })
// `say: i` takes the text and timing of narration[i]; at/end/dur override. Presets: TYPE_PRESETS below.
// Selective text in an illustrated story: const text = typeOverlay({ narration, items }); then text.draw(t) in your shot,
// after camEnd() (screen space). Same items, presets, fitting and safe areas (see src/stories/story_pilot_v4).
// Responsive (responsive.js): x, y, maxWidth, maxLines and any style value may be a per-aspect map
// ({ '9:16': …, '16:9': …, '4:5': … } or { tall, wide }). Text shrinks to fit its width and line limit, and every block
// is kept inside the title-safe area (safe: 'title' | 'action' | false).

// Ease names, as everywhere else (presets/index.js EASES), plus a sharp expo-out for text.
const typeEase = e => typeof e === 'function' ? e : e === 'expo' ? (x => x >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(x))) : (EASES[e] || easeOut);
const exitOf = (t, it) => {   // a generic exit, on top of any preset: { alpha, dy, s }
  const o = it.out; if (!o) return { alpha: 1, dy: 0, s: 1 };
  const k = typeEase(o.ease || 'ease')(seg(t, o.at, o.at + (o.dur ?? .35))), size = (it.style.size || 80) * TS();
  return { alpha: 1 - k, dy: o.kind === 'up' ? -k * size * .6 : 0, s: o.kind === 'scale' ? 1 - .3 * k : 1 };
};

const TYPE_PRESETS = {
  // Pop & Bounce: each word (or each character, by: 'char') drops in, overshoots, and wobbles to rest; staggered
  pop(t, it, c, L, X, Y, ex) {
    const st = it.style, stag = it.stagger ?? .08, d = it.unitDur ?? .45, byChar = it.by === 'char'; let i = 0;
    for (const l of L.lines) for (const u of l.units) {
      if (u.space) continue;
      const parts = byChar ? u.g.map((g, j) => ({ s: g, x: u.x + u.gx[j], w: (u.gx[j + 1] ?? u.w) - u.gx[j] })) : [{ s: u.text, x: u.x, w: u.w }];
      for (const p of parts) {
        const s0 = it.at + i++ * stag, k = seg(t, s0, s0 + d); if (t < s0) continue;
        const sc = backOut(k) * (1 + .08 * spring(t, s0 + d, 7, 20)), r = (hash(i * 7.1 + it.at) - .5) * .16 * (1 - easeOut(k));
        drawText(c, p.s, X - l.w / 2 + p.x + p.w / 2, Y + l.y + (ex.dy || 0) - (1 - easeOut(k)) * L.size * .35, st, { s: sc * ex.s, rot: r, alpha: seg(t, s0, s0 + .08) * ex.alpha });
      }
    }
  },
  // Slide & Reveal: words slide out from behind a mask edge (from: 'below' | 'above' | 'left' | 'right'), staggered,
  // with an optional accent bar that sweeps across first (bar: colour)
  slide(t, it, c, L, X, Y, ex) {
    const st = it.style, stag = it.stagger ?? .06, d = it.unitDur ?? .5, dir = { below: [0, 1], above: [0, -1], left: [-1, 0], right: [1, 0] }[it.from || 'below'];
    if (it.bar) {   // the bar: grows from the left, then retracts to the right, uncovering the line
      const bw = Math.max(...L.lines.map(l => l.w)) + L.size * .5, k1 = easeOut(seg(t, it.at - .15, it.at + .2)), k2 = easeIn(seg(t, it.at + .2, it.at + .5));
      if (k1 > 0 && k2 < 1) { c.save(); c.fillStyle = it.bar; c.globalAlpha = ex.alpha; c.fillRect(X - bw / 2 + bw * k2, Y - L.h / 2 + (ex.dy || 0), bw * (k1 - k2), L.h); c.restore(); }
    }
    // with a bar, each word starts only once the retracting bar has uncovered it (text never slides in over the bar)
    const bw0 = Math.max(...L.lines.map(l => l.w)) + L.size * .5, uncover = x => it.at + .2 + .3 * Math.cbrt(clamp((x + bw0 / 2) / bw0));
    let i = 0;
    for (const l of L.lines) {
      c.save(); c.beginPath(); c.rect(X - l.w / 2 - L.size, Y + l.y - L.lh / 2 + (ex.dy || 0), l.w + L.size * 2, L.lh); c.clip();   // the mask: this line's box
      for (const u of l.units) {
        if (u.space) continue;
        const s0 = it.bar ? Math.max(it.at + .1 + i++ * stag, uncover(u.x + u.w - l.w / 2)) : it.at + .1 + i++ * stag, k = typeEase(it.ease || 'expo')(seg(t, s0, s0 + d)); if (t < s0) continue;
        drawText(c, u.text, X - l.w / 2 + u.x + u.w / 2 + dir[0] * (1 - k) * l.w * .5, Y + l.y + (ex.dy || 0) + dir[1] * (1 - k) * L.lh, st, { s: ex.s, alpha: ex.alpha });
      }
      c.restore();
    }
  },
  // Scale & Impact: the whole text slams in from large (from: scale) and hits: squash, shake, burst lines, a flash ring
  impact(t, it, c, L, X, Y, ex) {
    const st = it.style, d = it.dur ?? .28, hit = it.at + d; if (t < it.at) return;
    const k = easeIn(seg(t, it.at, hit)), a = t - hit, from = it.from ?? 2.8;
    const sc = lerp(from, 1, k) * (a > 0 ? 1 + .1 * Math.exp(-7 * a) * Math.cos(18 * a) : 1), sq = a > 0 ? .18 * Math.exp(-9 * a) : 0;
    const [shx, shy] = a > 0 && a < .4 ? shakeXY(t, 14 * TS() * Math.exp(-8 * a)) : [0, 0];
    if (a > 0 && a < .5) {   // burst lines and a ring, radiating from the text's box
      const q = easeOut(seg(a, 0, .45)), w = Math.max(...L.lines.map(l => l.w)) / 2 + L.size * .3, h = L.h / 2 + L.size * .2;
      c.save(); c.globalAlpha = (1 - q) * ex.alpha; c.strokeStyle = it.burst || st.color; c.lineCap = 'round'; c.lineWidth = 7 * TS();
      for (let j = 0; j < 12; j++) {
        const ang = j / 12 * TAU + .2, r0 = 1.05 + .35 * q, r1 = r0 + .25 * (1 - q) + .08;
        c.beginPath(); c.moveTo(X + Math.cos(ang) * w * r0, Y + Math.sin(ang) * h * r0); c.lineTo(X + Math.cos(ang) * w * r1, Y + Math.sin(ang) * h * r1); c.stroke();
      }
      c.lineWidth = 4 * TS(); c.beginPath(); c.ellipse(X, Y, w * (1 + .5 * q), h * (1 + .8 * q), 0, 0, TAU); c.stroke(); c.restore();
    }
    for (const l of L.lines) for (const u of l.units) if (!u.space)
      drawText(c, u.text, X + (u.x + u.w / 2 - l.w / 2) * sc + shx, Y + l.y * sc + (ex.dy || 0) + shy, st, { sx: sc * (1 + sq) * ex.s, sy: sc * (1 - sq) * ex.s, alpha: seg(t, it.at, it.at + .06) * ex.alpha });
  },
  // Word Highlight: the line is on screen; each word, at its moment, gets a marker swipe behind it and pops slightly.
  // Word moments come from wordTimes(), or it.words: [t, ...]. keep: highlights stay (default) or fade after the word.
  highlight(t, it, c, L, X, Y, ex) {
    const st = it.style, ws = wordTimes(L, it.hlAt ?? it.at + .2, it.end), inA = seg(t, it.at, it.at + .25);
    if (it.words) ws.forEach((w, i) => { w.t0 = it.words[i] ?? w.t0; w.t1 = it.words[i + 1] ?? w.t1; });
    for (const w of ws) {   // markers first, under all the text
      const k = easeOut(seg(t, w.t0, w.t0 + .22)), fade = it.keep === false ? 1 - seg(t, w.t1, w.t1 + .3) : 1; if (k <= 0) continue;
      const x0 = X - w.lw / 2 + w.x - L.size * .12, mh = L.size * .78, y0 = Y + w.ly - mh * .5 + L.size * .06 + (ex.dy || 0);
      c.save(); c.globalAlpha = ex.alpha * fade; c.fillStyle = st.highlight || '#F6C85F'; c.translate(x0, y0); c.rotate(-.025 + .05 * hash(w.t0));
      c.beginPath(); c.roundRect(0, 0, (w.w + L.size * .24) * k, mh, mh * .25); c.fill(); c.restore();
    }
    for (const w of ws) {
      const on = t >= w.t0 && (it.keep !== false || t < w.t1 + .3), pk = spring(t, w.t0, 8, 20) * (t >= w.t0 ? 1 : 0);
      drawText(c, w.text, X - w.lw / 2 + w.x + w.w / 2, Y + w.ly + (ex.dy || 0) + (1 - easeOut(inA)) * L.size * .3, st,
        { s: (1 + .1 * pk + (t >= w.t0 && t < w.t1 ? .04 : 0)) * ex.s, alpha: inA * ex.alpha, color: on ? (st.highlightText || st.color) : st.color });
    }
  },
  // Progressive Text Reveal: grapheme cluster by grapheme cluster (never splitting a vowel or tone mark from its
  // consonant), each cluster rising in softly, paced by the words' narration timing; optional cursor
  reveal(t, it, c, L, X, Y, ex) {
    const st = it.style, ws = wordTimes(L, it.at, it.end), fadeD = it.unitDur ?? .14;
    let cur = null;
    for (const w of ws) w.g.forEach((g, j) => {
      const tg = lerp(w.t0, w.t1, j / w.g.length), k = easeOut(seg(t, tg, tg + fadeD)), gw = (w.gx[j + 1] ?? w.w) - w.gx[j];
      const x = X - w.lw / 2 + w.x + w.gx[j] + gw / 2, y = Y + w.ly + (ex.dy || 0);
      if (t >= tg) { cur = [x + gw / 2, y]; drawText(c, g, x, y + (1 - k) * L.size * .25, st, { s: ex.s, alpha: k * ex.alpha }); }
    });
    if (it.cursor && cur && t < it.end + .4 && Math.floor(t * 4) % 2 === 0) { c.save(); c.globalAlpha = ex.alpha; c.fillStyle = it.cursor; c.fillRect(cur[0] + 4 * TS(), cur[1] - L.size * .45, 6 * TS(), L.size * .9); c.restore(); }
  },
  // Taped Label: each phrase (text between spaces; by: 'line' for whole lines, 'word' for every word) sits on its own strip of dark label tape (bar colour) that unrolls
  // from the left, uncovering its text; strips tilt slightly and, held on twos (rate), boil like stop-motion paper
  label(t, it, c, L, X, Y, ex) {
    const st = it.style, stag = it.stagger ?? .12, d = it.unitDur ?? .35, padX = L.size * (it.padX ?? .28), padY = L.size * (it.padY ?? .12), rate = it.rate ?? 12;
    const boil = it.boil ?? 1, n = Math.floor(t * rate), strips = [];
    for (const l of L.lines) {
      if (it.by === 'line') { strips.push({ text: l.units.map(u => u.text).join(''), x: X, y: Y + l.y, w: l.w }); continue; }
      let g = null; const flush = () => { if (g) strips.push({ text: g.text, x: X - l.w / 2 + (g.x0 + g.x1) / 2, y: Y + l.y, w: g.x1 - g.x0 }); g = null; };
      for (const u of l.units) {   // Thai has no spaces between words: phrases (space-separated) keep words whole on one strip
        if (u.space) { flush(); continue; }
        if (!g || it.by === 'word') { flush(); g = { text: '', x0: u.x, x1: u.x }; }
        g.text += u.text; g.x1 = u.x + u.w;
      }
      flush();
    }
    strips.forEach((sp, i) => {
      const s0 = it.at + i * stag, k = easeOut(seg(t, s0, s0 + d)); if (t < s0) return;
      const j = (q) => (hash(n * 3.7 + i * 11.3 + q) - .5) * 2 * boil, rot = ((hash(i * 5.1 + it.at) - .5) * 2 * (it.tilt ?? 1.6) + .35 * j(1)) * Math.PI / 180;
      const bw = sp.w + padX * 2, bh = L.size * .92 + padY * 2, x0 = -bw / 2;
      c.save(); c.globalAlpha = ex.alpha; c.translate(sp.x + j(2) * 1.2 * TS(), sp.y + (ex.dy || 0) + j(3) * 1.2 * TS()); c.rotate(rot); c.scale(ex.s, ex.s);
      if (it.shadow !== false) { c.shadowColor = 'rgba(0,0,0,.28)'; c.shadowBlur = 10 * TS(); c.shadowOffsetY = 5 * TS(); }
      c.fillStyle = it.bar || st.highlight || '#2E2E30'; c.beginPath();   // the tape: square ends with a slightly ragged cut on the right
      c.moveTo(x0, -bh / 2); c.lineTo(x0 + bw * k, -bh / 2); for (let q = 1; q <= 4; q++) c.lineTo(x0 + bw * k - (q % 2) * 5 * TS(), -bh / 2 + bh * q / 4); c.lineTo(x0, bh / 2); c.closePath(); c.fill();
      c.shadowColor = 'transparent'; c.beginPath(); c.rect(x0, -bh, bw * k, bh * 2); c.clip();
      drawText(c, sp.text, 0, L.size * .02, st, { color: st.color || '#F7F3EA' });
      c.restore();
    });
  },
  // Cut-out Words (ransom-note collage): each phrase (between spaces; by: 'word' for every word) is a scrap of paper in
  // its own colour with a ragged scissor edge and a soft shadow; scraps are laid down one by one (lifted, a small
  // overshoot, a press) at their own tilt, and boil on held frames. papers: scrap colours; inks: text colours (cycled)
  cutout(t, it, c, L, X, Y, ex) {
    const st = it.style, stag = it.stagger ?? .14, d = it.unitDur ?? .3, rate = it.rate ?? 12, n = Math.floor(t * rate), boil = it.boil ?? 1;
    const papers = it.papers || ['#F7F3EA', '#E8541E', '#9FD8CB', '#2E2E30'], inks = it.inks || ['#2E2E30', '#F7F3EA', '#2E2E30', '#F7F3EA'];
    const scraps = [];
    for (const l of L.lines) {
      let g = null; const flush = () => { if (g) scraps.push({ text: g.text, x: X - l.w / 2 + (g.x0 + g.x1) / 2, y: Y + l.y, w: g.x1 - g.x0 }); g = null; };
      for (const u of l.units) { if (u.space) { flush(); continue; } if (!g || it.by === 'word') { flush(); g = { text: '', x0: u.x, x1: u.x }; } g.text += u.text; g.x1 = u.x + u.w; }
      flush();
    }
    scraps.forEach((sp, i) => {
      const s0 = it.at + i * stag; if (t < s0) return;
      const k = seg(t, s0, s0 + d), o = 1.2, e = k >= 1 ? 1 : 1 + (o + 1) * Math.pow(k - 1, 3) + o * Math.pow(k - 1, 2), a = t - s0 - d;
      const sc = lerp(1.35, 1, e) * (a > 0 ? 1 - .03 * Math.exp(-14 * a) : 1), jit = q => (hash(n * 3.3 + i * 7.9 + q) - .5) * 2 * boil;
      const rot = ((hash(i * 6.7 + it.at) - .5) * 2 * (it.tilt ?? 4) + .4 * jit(1)) * Math.PI / 180, pw = sp.w + L.size * .36, ph = L.size * 1.18, rnd = lcg(11 + i * 17);
      const edge = []; for (let q = 0; q < 28; q++) { const f = q / 28, side = Math.floor(f * 4), u = f * 4 - side, j = () => (rnd() - .5) * L.size * .07;
        edge.push(side === 0 ? [-pw / 2 + pw * u, -ph / 2 + j()] : side === 1 ? [pw / 2 + j(), -ph / 2 + ph * u] : side === 2 ? [pw / 2 - pw * u, ph / 2 + j()] : [-pw / 2 + j(), ph / 2 - ph * u]); }
      c.save(); c.globalAlpha = ex.alpha * seg(t, s0, s0 + .05); c.translate(sp.x + jit(2) * 1.2 * TS(), sp.y + (ex.dy || 0) + jit(3) * 1.2 * TS()); c.rotate(rot); c.scale(sc * ex.s, sc * ex.s);
      c.shadowColor = 'rgba(30,20,10,.3)'; c.shadowBlur = (6 + 14 * (1 - e)) * TS(); c.shadowOffsetY = (4 + 12 * (1 - e)) * TS();
      c.fillStyle = papers[i % papers.length]; c.beginPath(); edge.forEach(([x, y], q) => q ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fill(); c.shadowColor = 'transparent';
      drawText(c, sp.text, 0, L.size * .03, { ...st, weight: it.weights ? it.weights[i % it.weights.length] : st.weight }, { color: inks[i % inks.length] });
      c.restore();
    });
  },
  // Stop-motion Stamp: big letters land one by one (each character, grapheme-safe), each dropped in from slightly larger
  // with no tween in between (on twos), a small tilt each, and a held-frame boil so the word never looks digital
  stamp(t, it, c, L, X, Y, ex) {
    const st = it.style, stag = it.stagger ?? .07, rate = it.rate ?? 12, n = Math.floor(t * rate), boil = it.boil ?? 1; let i = 0;
    for (const l of L.lines) for (const u of l.units) {
      if (u.space) continue;
      u.g.forEach((g, j) => {
        const s0 = it.at + i * stag, idx = i++; if (t < s0) return;
        const f = Math.floor((t - s0) * rate), sc = f === 0 ? 1.35 : f === 1 ? .94 : 1, gw = (u.gx[j + 1] ?? u.w) - u.gx[j];
        const jit = q => (hash(n * 2.3 + idx * 9.7 + q) - .5) * 2 * boil;
        const rot = ((hash(idx * 4.1 + it.at) - .5) * 2 * (it.tilt ?? 3) + jit(1) * .6) * Math.PI / 180;
        drawText(c, g, X - l.w / 2 + u.x + u.gx[j] + gw / 2 + jit(2) * 1.5 * TS(), Y + l.y + (ex.dy || 0) + jit(3) * 1.5 * TS(), st, { s: sc * ex.s, rot, alpha: ex.alpha });
      });
    }
  },
  // Subtitle (karaoke): the spoken line in the subtitle zone on a soft dark pill, every word lit in turn as it is said
  // (word times from it.words [t, ...] when known, else spread over at..end by grapheme count), the current word in the
  // accent colour with a small lift. Defaults: safe 'subtitle', never moved off subjects (it sits on its pill).
  subtitle(t, it, c, L, X, Y, ex) {
    if (t < it.at) return;
    const st = it.style, ws = wordTimes(L, it.at, it.end), a = (it.cont ? 1 : seg(t, it.at, it.at + .15)) * ex.alpha;   // cont: a later page, no fade-in
    if (it.words) ws.forEach((w, i) => { w.t0 = it.words[i] ?? w.t0; w.t1 = it.words[i + 1] ?? w.t1; });
    if (it.pill !== false) {
      const bw = Math.max(...L.lines.map(l => l.w)) + L.size * .9, bh = L.h + L.size * .45;
      c.save(); c.globalAlpha = a * (it.pillAlpha ?? .62); c.fillStyle = it.pill || '#15141A'; c.beginPath(); c.roundRect(X - bw / 2, Y - bh / 2 + (ex.dy || 0), bw, bh, L.size * .35); c.fill(); c.restore();
    }
    for (const w of ws) {
      const on = t >= w.t0 && t < w.t1, done = t >= w.t1, k = on ? easeOut(seg(t, w.t0, w.t0 + .12)) : 0;
      drawText(c, w.text, X - w.lw / 2 + w.x + w.w / 2, Y + w.ly + (ex.dy || 0) - k * L.size * .06, st,
        { s: (1 + .06 * k) * ex.s, alpha: a * (on || done ? 1 : (it.dim ?? .78)), color: on ? (st.highlight || '#FFD43B') : st.color || '#FFFFFF' });
    }
  },
  // Animated Number Counter: from → to with easing, locale formatting (Thai digits with digits: 'thai'), a prefix and
  // suffix (in suffixStyle), a pop as each new value lands on its final digits, and an impact when it arrives
  counter(t, it, c, L, X, Y, ex) {
    if (t < it.at) return;
    const st = it.style, d = it.dur ?? 1.2, k = typeEase(it.ease || 'expo')(seg(t, it.at, it.at + d)), v = lerp(it.from ?? 0, it.to, k);
    const num = counterText(it, v), a = t - (it.at + d), land = a > 0 ? 1 + .14 * Math.exp(-7 * a) * Math.cos(16 * a) : 1;
    const ss = { ...st, ...(it.suffixStyle || {}) }, { nw, sw } = counterWidths(it, num, st);
    const x0 = X - (nw + sw) / 2, alpha = seg(t, it.at, it.at + .1) * ex.alpha, y = Y + (ex.dy || 0);
    drawText(c, num, x0 + nw / 2, y, st, { s: land * ex.s, alpha, color: a > 0 && a < .25 ? (it.flash || st.color) : st.color });
    if (it.suffix) drawText(c, it.suffix, x0 + nw + sw / 2, y + (st.size - ss.size) * TS() * .18, ss, { s: ex.s, alpha: alpha * seg(t, it.at + d * .6, it.at + d) });
  },
};

// the counter's text at value v, and the measured widths of a number and its suffix (for drawing and for fitting)
function counterText(it, v) {
  const fmt = new Intl.NumberFormat(it.digits === 'thai' ? 'th-TH-u-nu-thai' : (it.locale || 'th-TH'), { maximumFractionDigits: it.decimals ?? 0, minimumFractionDigits: it.decimals ?? 0 });
  return (it.prefix || '') + fmt.format(v);
}
function counterWidths(it, num, st) {
  const c = typeLayer(); c.save(); c.font = fontCss(st); const nw = c.measureText(num).width;
  c.font = fontCss({ ...st, ...(it.suffixStyle || {}) }); const sw = it.suffix ? c.measureText(' ' + it.suffix).width : 0; c.restore();
  return { nw, sw };
}

// Kinetic text as a LAYER, for illustrated stories that use typography selectively: returns { items, draw(t) }; call
// draw(t) in screen space (after the camera) inside your own shot. Same item spec, presets, fitting and safe areas as
// playType (which is built on it). Sets window.TYPE_INFO for the tests.
function typeOverlay(spec) {
  registerFonts(spec.fonts);
  const N = spec.narration || [];
  const res = o => o ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, av(v)])) : o;
  // A subtitle is shown in PAGES, as broadcast captions are: the narration is split at word boundaries into pages that
  // each fit the subtitle band (the lines it has room for), timed by their share of the graphemes, and every page
  // leaves when the next arrives. Fonts may still be loading here, so a page's capacity is a conservative estimate;
  // the fit below shrinks a page that still runs long.
  const subtitlePages = it0 => {
    if (it0.preset !== 'subtitle' || it0.pages === false) return [it0];
    const n = it0.say != null ? N[it0.say] : null, text = it0.text ?? n?.text ?? '', at = it0.at ?? n?.at ?? 0, end = it0.end ?? (it0.dur != null ? at + it0.dur : n?.end ?? at + 1);
    const size = av(it0.style?.size) ?? byAspect({ '9:16': 62, '16:9': 50, '4:5': 56 }), sa = safeArea('subtitle');
    const perPage = Math.max(1, Math.min(2, Math.floor(sa.h / (size * TS() * 1.3)))), mw = Math.min((av(it0.maxWidth) ?? byAspect({ '9:16': .86, '16:9': .64, '4:5': .84 })) * W, sa.w);
    const cap = Math.max(6, Math.floor(mw / (size * TS() * .58))) * perPage;   // graphemes per page
    // fill a page word by word; when it overflows, break at its last space (Thai marks phrases with spaces) if that
    // keeps the page at least half full, else at the word
    const pages = []; let cur = [];
    const glen = a => a.reduce((n, w) => n + graphemes(w).length, 0);
    for (const w of words(text)) {
      if (!cur.length && !w.trim()) continue;
      if (glen(cur) + graphemes(w).length > cap && cur.some(x => x.trim())) {
        const sp = cur.findLastIndex(x => !x.trim()), cut = sp > 0 && glen(cur.slice(0, sp)) >= cap * .5 ? sp : cur.length;
        pages.push(cur.slice(0, cut).join('').trim()); cur = cur.slice(cut).filter((x, i) => i || x.trim());
      }
      cur.push(w);
    }
    if (cur.join('').trim()) pages.push(cur.join('').trim());
    const total = pages.reduce((a, p) => a + graphemes(p).length, 0) || 1; let acc = 0;
    return pages.map((p, k) => { const t0 = at + (end - at) * acc / total; acc += graphemes(p).length; const t1 = at + (end - at) * acc / total;
      return { ...it0, id: it0.id && pages.length > 1 ? `${it0.id}.${k}` : it0.id, say: undefined, text: p, at: +t0.toFixed(3), end: +t1.toFixed(3), maxLines: perPage,
        // pages swap instantly (a fade between them reads as a flicker): only the first fades in, only the last fades out
        words: pages.length > 1 ? undefined : it0.words, cont: k > 0, out: it0.out ?? (k < pages.length - 1 ? { at: +(t1 - .02).toFixed(3), dur: .02 } : { at: +(t1 - .1).toFixed(3), dur: .1 }) }; });
  };
  const items = spec.items.flatMap(subtitlePages).map((it0, i) => {
    const sub = it0.preset === 'subtitle' ? { safe: 'subtitle', avoid: false, maxLines: 2, y: { '9:16': .85, '16:9': .895, '4:5': .885 }, maxWidth: { '9:16': .86, '16:9': .64, '4:5': .84 }, ...it0,   // subtitle defaults: phone-legible, short lines
      style: { font: 'display', weight: 700, size: byAspect({ '9:16': 62, '16:9': 50, '4:5': 56 }), color: '#FFFFFF', highlight: '#FFD43B', ...(it0.style || {}) } } : it0;
    const it = res(sub), n = it.say != null ? N[it.say] : null, at = it.at ?? n?.at ?? 0;
    return { ...it, id: it.id || `${it.preset}#${i}`, text: it.text ?? n?.text ?? '', at, end: it.end ?? (it.dur != null ? at + it.dur : n?.end ?? at + 1),
      style: { size: 80, ...res(it.style) }, suffixStyle: res(it.suffixStyle) };
  });
  // fit once per item (the layout depends only on the text, the style and the canvas): shrink until the widest line fits
  // maxWidth and the line count fits maxLines; then the block's box, clamped into the safe area
  const fitted = it => {
    if (it._fit) return it._fit;
    const mw = Math.min((it.maxWidth ?? .86) * W, it.safe !== false ? safeArea(it.safe || 'title').w : Infinity);   // never wider than the safe area
    let st = it.style, L = layout(it.text, st, mw);
    const cw = st => { const { nw, sw } = counterWidths({ ...it, suffixStyle: it.suffixStyle && { ...it.suffixStyle, size: it.suffixStyle.size * st.size / it.style.size } }, counterText(it, it.to), st); return nw + sw; };
    const tooWide = () => it.preset === 'counter' ? cw(st) > mw + 1 : L.lines.some(l => l.w > mw + 1) || (it.maxLines && L.lines.length > it.maxLines);
    for (let k = 0; k < 10 && tooWide(); k++) { st = { ...st, size: st.size * .92 }; L = layout(it.text, st, mw); }
    if (st !== it.style) { if (it.suffixStyle?.size) it.suffixStyle = { ...it.suffixStyle, size: it.suffixStyle.size * st.size / it.style.size }; it.style = st; }
    let X = (it.x ?? .5) * W, Y = (it.y ?? .5) * H; const bw = it.preset === 'counter' ? cw(st) : Math.max(...L.lines.map(l => l.w)), bh = L.h;
    const sa = safeArea(it.safe || 'title');
    if (it.safe !== false) {
      X = clamp(X, sa.x0 + bw / 2, Math.max(sa.x0 + bw / 2, sa.x1 - bw / 2)); Y = clamp(Y, sa.y0 + bh / 2, Math.max(sa.y0 + bh / 2, sa.y1 - bh / 2));
    }
    if (it.avoid !== false) Y = avoidSubjects(it, X, Y, bw, bh, sa);   // avoid: false (subtitles) stays where it is
    placed.push({ it, box: { x0: X - bw / 2, x1: X + bw / 2, y0: Y - bh / 2, y1: Y + bh / 2 } });
    return (it._fit = { L, X, Y, box: { x0: X - bw / 2, x1: X + bw / 2, y0: Y - bh / 2, y1: Y + bh / 2 } });
  };
  // Collision-aware layout: spec.subjects(t) → [{ x0, y0, x1, y1 }] screen boxes of what text must never cover (a
  // character, the focal object). Each item is placed ONCE for its whole time on screen (no jitter): if its box would
  // touch any subject at any moment of its life, it moves to the nearest free height inside the safe area, trying the
  // item's prefer side first ('up' | 'down').
  // Text never lands on other text either: items already placed that are on screen at the same time count as subjects.
  const placed = [], lifeOf = it => [it.at - .1, it.out ? it.out.at + (it.out.dur ?? .35) : (spec.duration ?? DUR)];
  function avoidSubjects(it, X, Y, bw, bh, sa) {
    const [start, end] = lifeOf(it), pad = .012 * H, boxes = [];
    if (spec.subjects) for (let tt = start; tt <= end; tt += .1) boxes.push(...spec.subjects(tt));
    for (const p of placed) { const [s0, e0] = lifeOf(p.it); if (s0 < end && e0 > start) boxes.push(p.box); }
    if (!boxes.length) return Y;
    const hits = y => boxes.some(b => X - bw / 2 - pad < b.x1 && X + bw / 2 + pad > b.x0 && y - bh / 2 - pad < b.y1 && y + bh / 2 + pad > b.y0);
    if (!hits(Y)) return Y;
    const dirs = it.prefer === 'down' ? [1, -1] : [-1, 1];
    for (let d = 8; d < H; d += 8) for (const s of dirs) {
      const y = Y + s * d; if (y - bh / 2 >= sa.y0 && y + bh / 2 <= sa.y1 && !hits(y)) return y;
    }
    console.warn(`type: "${it.text}" cannot avoid the subjects inside the safe area`); return Y;
  }
  // place every item once, in order, before anything reads a position: frames rendered in any order (parallel workers)
  // get the same layout
  let laidOut = false; const layoutAll = () => { if (!laidOut) { laidOut = true; items.forEach(fitted); } };
  window.TYPE_INFO = t => (layoutAll(), { safe: safeArea('title'), subjects: spec.subjects ? spec.subjects(t) : [], items: items.filter(it => t >= it.at && exitOf(t, it).alpha > .003).map(it => ({ id: it.id, ...fitted(it).box, safe: it.safe === false ? null : (it.safe || 'title'), safeBox: it.safe === false ? { x0: 0, y0: 0, x1: W, y1: H } : safeArea(it.safe || 'title'), overlay: it.avoid === false })) });
  const draw = t => {
    layoutAll();
    const c = typeLayer(); c.clearRect(0, 0, W, H);
    for (const it of items) {
      if (t < it.at - .5) continue;
      const ex = exitOf(t, it); if (ex.alpha <= .003) continue;
      const f = fitted(it);
      TYPE_PRESETS[it.preset](t, it, c, f.L, f.X, f.Y, ex);
    }
    compositeType();
  };
  return { items, draw };
}

function playType(spec) {
  const dur = spec.duration || DUR, { items, draw } = typeOverlay(spec);
  const fade = { in: .3, out: .3, color: spec.background || '#F4ECDF', ...spec.fade };
  shots([[0, (t) => {
    if (spec.background) background(spec.background);
    (spec.decor || []).forEach(f => f(t));
    draw(t);
    if (fade.in && t < fade.in) flash(1 - t / fade.in, fade.color);
    if (fade.out && t > dur - fade.out) flash((t - (dur - fade.out)) / fade.out, fade.color);
  }]]);
  return { items };
}

// Verified aspect support per typography preset (tools/aspect_test.mjs; never list a ratio that has not passed).
const TYPE_PRESET_ASPECTS = { pop: ['9:16', '16:9', '4:5'], slide: ['9:16', '16:9', '4:5'], impact: ['9:16', '16:9', '4:5'], highlight: ['9:16', '16:9', '4:5'], reveal: ['9:16', '16:9', '4:5'], counter: ['9:16', '16:9', '4:5'],
  label: ['9:16', '16:9'], stamp: ['9:16', '16:9'], cutout: ['9:16', '16:9'], subtitle: ['9:16', '16:9', '4:5'] };   // label, stamp, cutout: fixtures collage_reel, collage_kit; subtitle: subtitle_demo
