// infographic.js: the INFOGRAPHIC KIT, clean data motion graphics in screen space (drawn after the camera, crisp, with
// live Thai text). Every preset reads its data from params, animates in like a professional explainer (things grow,
// values count up, lines draw themselves, the key item is highlighted), then holds. Positions and sizes are FRACTIONS
// of the frame (x, y = centre; w, h = box), so one spec works in every format; each may also be a per-format map
// ({ '9:16': .86, '16:9': .6 }, responsive.js av), and the defaults are. Shared options:
//   at, dur (the build), ease · x, y, w, h · title (optional heading above) · colors (palette) · text (text colour)
//   card: true (a soft white card behind) · unit (suffix on values), decimals · font: 'display' · size (label px at 1080)
//   highlight: index of the item to emphasise (accent colour, a pulse) · out: { at, dur } fades it away
const INFO_PAL = ['#E8541E', '#2E7D6B', '#3D5A99', '#F2B33D', '#B44C7A', '#6B6676', '#5BA3C9'];
const INFO_G = {};   // id → a 2D canvas the size of the frame, reused every frame
function infoCtx(o, name) {
  const key = name + '|' + (o.id ?? ''); let g = INFO_G[key];
  if (!g || g.width !== W || g.height !== H) { g = INFO_G[key] = createGraphics(W, H); g.pixelDensity(1); }
  const c = g.drawingContext; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H); return { g, c };
}
function infoBlit(g) { flushBrush(); push(); resetMatrix(); translate(-W / 2, -H / 2); image(g, 0, 0); pop(); }
// the box in px, the build's eased progress, a fade-out multiplier, label styles
function infoFrame(t, o) {
  o = { ...o, x: av(o.x), y: av(o.y), w: av(o.w), h: av(o.h) };
  const s = Math.min(W, H) / 1080, bx = (o.x - o.w / 2) * W, by = (o.y - o.h / 2) * H, bw = o.w * W, bh = o.h * H;
  const out = o.out ? 1 - clamp((t - o.out.at) / (o.out.dur ?? .35)) : 1;
  const lab = (size, weight = 600, color = o.text) => ({ font: o.font || 'display', weight, size: size * (o.size ?? 1), color });
  return { s, bx, by, bw, bh, out, lab, k: presetK(t, o), a: clamp((t - o.at) / .25) * out };
}
const INFO_NF = {};   // number formats are slow to build: one per decimals count
const infoNum = (v, o) => { const d = o.decimals ?? 0; return (INFO_NF[d] ??= new Intl.NumberFormat('th-TH', { maximumFractionDigits: d, minimumFractionDigits: d })).format(v) + (o.unit || ''); };
function infoCard(c, F, o) {
  if (!o.card) return; const p = 28 * F.s;
  c.save(); c.globalAlpha = F.a; c.shadowColor = 'rgba(20,20,30,.18)'; c.shadowBlur = 30 * F.s; c.shadowOffsetY = 10 * F.s; c.fillStyle = o.cardColor || '#FFFFFF';
  c.beginPath(); c.roundRect(F.bx - p, F.by - p - (o.title ? 70 * F.s : 0), F.bw + 2 * p, F.bh + 2 * p + (o.title ? 70 * F.s : 0), 26 * F.s); c.fill(); c.restore();
}
function infoTitle(c, F, o) { if (o.title) drawText(c, o.title, F.bx + F.bw / 2, F.by - 42 * F.s, F.lab(46, 800), { alpha: F.a, dy: (1 - easeOut(clamp((F.k) * 3))) * 14 * F.s }); }
const INFO_META = (tags) => ({ version: '1.0.0', category: 'infographic', tags: ['infographic', 'data', 'chart', ...tags], camera: 'screen', layers: ['screen'] });
// a box per format: tall frames get a wide, shallow chart; wide frames a centred block that is not a thin strip
const infoBox = (w916, h916, w169, h169, w45, h45) => ({ w: { '9:16': w916, '16:9': w169, '4:5': w45 }, h: { '9:16': h916, '16:9': h169, '4:5': h45 } });
const INFO_DEF = { x: .5, y: .5, ...infoBox(.82, .34, .6, .56, .8, .44), title: '', colors: INFO_PAL, text: '#22202A', card: true, cardColor: '#FFFFFF', unit: '', decimals: 0, size: 1, font: 'display', highlight: -1, out: null, ease: 'easeOut', dur: 1.4 };

// barChart: bars grow from the baseline one after another with a small overshoot, each value counting up on its bar
definePreset('barChart', {
  label: 'Bar Chart', about: 'bars grow in turn with overshoot, values count up, the highlighted bar pulses; vertical or horizontal',
  meta: { ...INFO_META(['bar', 'compare', 'ranking', 'statistics']), params: { horizontal: { type: 'boolean' } } },
  defaults: { ...INFO_DEF, items: [{ label: 'A', value: 3 }, { label: 'B', value: 5 }, { label: 'C', value: 8 }], max: null, horizontal: false, stagger: .12 },
  run(t, o) {
    if (t < o.at) return; const { g, c } = infoCtx(o, 'barChart'), F = infoFrame(t, o), n = o.items.length, max = o.max ?? Math.max(...o.items.map(i => i.value)) * 1.08;
    infoCard(c, F, o); infoTitle(c, F, o);
    o.items.forEach((it, i) => {
      const t0 = o.at + i * o.stagger, k = seg(t, t0, t0 + o.dur * .7), e = k >= 1 ? 1 : 1 + 2.4 * Math.pow(k - 1, 3) + 1.4 * Math.pow(k - 1, 2), v = it.value * Math.min(1, easeOut(k));
      const col = it.color || (o.highlight < 0 ? o.colors[i % o.colors.length] : o.highlight === i ? o.colors[0] : '#C9C3B6'), hl = o.highlight === i ? 1 + .03 * Math.sin((t - t0) * 6) * (k >= 1) : 1;
      c.save(); c.globalAlpha = F.a * clamp(k * 4);
      if (!o.horizontal) {
        const gap = F.bw / n * .28, bw = F.bw / n - gap, x = F.bx + i * (bw + gap) + gap / 2, hgt = (F.bh - 70 * F.s) * it.value / max * e * hl, base = F.by + F.bh - 52 * F.s;
        c.fillStyle = col; c.beginPath(); c.roundRect(x, base - hgt, bw, hgt, [10 * F.s, 10 * F.s, 0, 0]); c.fill();
        drawText(c, infoNum(v, o), x + bw / 2, base - hgt - 26 * F.s, F.lab(40, 800), { alpha: F.a * clamp(k * 3) });
        drawText(c, it.label, x + bw / 2, base + 30 * F.s, F.lab(32, 600), { alpha: F.a });
      } else {
        const gap = F.bh / n * .3, bh = F.bh / n - gap, y = F.by + i * (bh + gap) + gap / 2, lw = F.bw * .26, len = (F.bw - lw - 110 * F.s) * it.value / max * e * hl;
        drawText(c, it.label, F.bx + lw / 2, y + bh / 2, F.lab(32, 600), { alpha: F.a });
        c.fillStyle = col; c.beginPath(); c.roundRect(F.bx + lw, y, len, bh, [0, 10 * F.s, 10 * F.s, 0]); c.fill();
        drawText(c, infoNum(v, o), F.bx + lw + len + 56 * F.s, y + bh / 2, F.lab(38, 800), { alpha: F.a * clamp(k * 3) });
      }
      c.restore();
    });
    if (!o.horizontal) { c.save(); c.globalAlpha = F.a; c.strokeStyle = o.text; c.lineWidth = 3 * F.s; const base = F.by + F.bh - 52 * F.s; c.beginPath(); c.moveTo(F.bx, base); c.lineTo(F.bx + F.bw * easeOut(clamp(F.k * 2)), base); c.stroke(); c.restore(); }
    infoBlit(g);
  },
  demo: { bg: '#F4F1EA', after: [['barChart', { at: .3, title: 'ยอดขายรายไตรมาส', unit: ' ล้าน', items: [{ label: 'Q1', value: 12 }, { label: 'Q2', value: 18 }, { label: 'Q3', value: 15 }, { label: 'Q4', value: 27 }], highlight: 3 }]] },
});

// lineChart: the line draws itself left to right, the area fills under it, points pop, the last value is called out
definePreset('lineChart', {
  label: 'Line Chart', about: 'line draws on (trim path), soft area fill, points pop in turn, the last point gets a value badge',
  meta: INFO_META(['line', 'trend', 'growth', 'time series']),
  defaults: { ...INFO_DEF, points: [{ label: '2019', value: 2 }, { label: '2020', value: 3 }, { label: '2021', value: 2.6 }, { label: '2022', value: 4.4 }, { label: '2023', value: 6 }], min: null, max: null, area: true, color: '#E8541E' },
  run(t, o) {
    if (t < o.at) return; const { g, c } = infoCtx(o, 'lineChart'), F = infoFrame(t, o), P = o.points, n = P.length;
    const lo = o.min ?? Math.min(0, ...P.map(p => p.value)), hi = o.max ?? Math.max(...P.map(p => p.value)) * 1.12, base = F.by + F.bh - 50 * F.s, top = F.by + 40 * F.s;
    const pts = P.map((p, i) => [F.bx + 40 * F.s + (F.bw - 80 * F.s) * (n > 1 ? i / (n - 1) : .5), base - (base - top) * (p.value - lo) / (hi - lo)]);
    const k = ease(F.k), upto = k * (n - 1), last = Math.floor(upto), f = upto - last, tip = last < n - 1 ? [lerp(pts[last][0], pts[last + 1][0], f), lerp(pts[last][1], pts[last + 1][1], f)] : pts[n - 1];
    infoCard(c, F, o); infoTitle(c, F, o);
    c.save(); c.globalAlpha = F.a * .5; c.strokeStyle = o.text; c.lineWidth = 2 * F.s; c.beginPath(); c.moveTo(F.bx, base); c.lineTo(F.bx + F.bw, base); c.stroke(); c.restore();
    const path = [...pts.slice(0, last + 1), tip];
    if (o.area) { c.save(); c.globalAlpha = F.a * .18; c.fillStyle = o.color; c.beginPath(); c.moveTo(path[0][0], base); path.forEach(p => c.lineTo(p[0], p[1])); c.lineTo(tip[0], base); c.closePath(); c.fill(); c.restore(); }
    c.save(); c.globalAlpha = F.a; c.strokeStyle = o.color; c.lineWidth = 7 * F.s; c.lineJoin = c.lineCap = 'round'; c.beginPath(); path.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke(); c.restore();
    pts.forEach((p, i) => {
      const ti = o.at + o.dur * (n > 1 ? i / (n - 1) : 0), q = clamp((t - ti) / .25); if (q <= 0) return; const r = (9 + 4 * backOut(q) - 4) * F.s * (i === n - 1 ? 1.4 : 1);
      c.save(); c.globalAlpha = F.a; c.fillStyle = '#FFFFFF'; c.strokeStyle = o.color; c.lineWidth = 4 * F.s; c.beginPath(); c.arc(p[0], p[1], r * backOut(q), 0, TAU); c.fill(); c.stroke(); c.restore();
      drawText(c, P[i].label, p[0], base + 30 * F.s, F.lab(28, 600), { alpha: F.a * q });
    });
    const q = clamp((t - o.at - o.dur) / .35);
    if (q > 0) {   // the badge sits over the last point, kept inside the chart box
      const [px, y] = pts[n - 1], label = infoNum(P[n - 1].value, o); c.save(); c.font = fontCss(F.lab(36, 800)); const bw = c.measureText(label).width + 40 * F.s; c.restore();
      const x = Math.min(Math.max(px, F.bx + bw / 2), F.bx + F.bw - bw / 2);
      c.save(); c.globalAlpha = F.a * q; c.fillStyle = o.color; c.beginPath(); c.roundRect(x - bw / 2, y - 92 * F.s, bw, 58 * F.s, 14 * F.s); c.fill(); c.restore();
      drawText(c, label, x, y - 63 * F.s, F.lab(36, 800, '#FFFFFF'), { alpha: F.a * q, s: backOut(q) }); }
    infoBlit(g);
  },
  demo: { bg: '#F4F1EA', after: [['lineChart', { at: .3, title: 'ผู้ใช้งานเพิ่มขึ้นทุกปี', unit: ' ล้านคน', decimals: 1 }]] },
});

// donutChart: segments sweep in around the ring one by one; the centre shows the total (or centerText); a legend lists
// the items. A single item with max is a progress ring ("68 %").
definePreset('donutChart', {
  label: 'Donut / Progress Ring', about: 'segments sweep in around a ring, the centre counts up the total or a percentage, legend fades in; one item + max = progress ring',
  meta: INFO_META(['donut', 'pie', 'share', 'percent', 'progress']),
  defaults: { ...INFO_DEF, ...infoBox(.84, .28, .58, .56, .8, .4), items: [{ label: 'ออนไลน์', value: 58 }, { label: 'หน้าร้าน', value: 30 }, { label: 'อื่น ๆ', value: 12 }], max: null, thickness: .26, centerText: null, legend: true },
  run(t, o) {
    if (t < o.at) return; const { g, c } = infoCtx(o, 'donutChart'), F = infoFrame(t, o), sum = o.max ?? o.items.reduce((a, i) => a + i.value, 0);
    const legend = o.legend && o.items.length > 1, R = Math.min(F.bh, legend ? F.bw * .5 : F.bw) / 2 * .92, cx = legend ? F.bx + R + 10 * F.s : F.bx + F.bw / 2, cy = F.by + F.bh / 2, th = R * o.thickness;
    infoCard(c, F, o); infoTitle(c, F, o);
    c.save(); c.globalAlpha = F.a * .14; c.strokeStyle = o.text; c.lineWidth = th; c.beginPath(); c.arc(cx, cy, R - th / 2, 0, TAU); c.stroke(); c.restore();
    let a0 = -Math.PI / 2; const k = ease(F.k);
    o.items.forEach((it, i) => {
      const frac = it.value / sum, a1 = a0 + TAU * frac, end = -Math.PI / 2 + TAU * k * o.items.slice(0, i + 1).reduce((a, j) => a + j.value / sum, 0), shown = Math.min(a1, Math.max(a0, end));
      if (shown > a0) { c.save(); c.globalAlpha = F.a; c.strokeStyle = it.color || o.colors[i % o.colors.length]; c.lineWidth = th * (o.highlight === i ? 1.18 : 1); c.lineCap = o.items.length === 1 ? 'round' : 'butt';
        c.beginPath(); c.arc(cx, cy, R - th / 2, a0 + .012, shown - (o.items.length > 1 ? .012 : 0)); c.stroke(); c.restore(); }
      a0 = a1;
    });
    const center = o.centerText ?? (o.items.length === 1 ? infoNum(o.items[0].value * k, { ...o, unit: o.unit || ' %' }) : infoNum(o.items.reduce((a, i) => a + i.value, 0) * k, o));
    drawText(c, center, cx, cy, F.lab(Math.max(30, R / F.s * .32), 800), { alpha: F.a });
    if (legend) o.items.forEach((it, i) => {
      const q = clamp((t - o.at - .3 - i * .12) / .3), y = cy + (i - (o.items.length - 1) / 2) * 70 * F.s, x = cx + R + 60 * F.s;
      c.save(); c.globalAlpha = F.a * q; c.fillStyle = it.color || o.colors[i % o.colors.length]; c.beginPath(); c.roundRect(x, y - 14 * F.s, 28 * F.s, 28 * F.s, 7 * F.s); c.fill(); c.restore();
      c.save(); c.globalAlpha = F.a * q; c.font = fontCss(F.lab(36, 600)); c.fillStyle = o.text; c.textBaseline = 'middle'; c.fillText(`${it.label}  ${infoNum(it.value, o)}`, x + 44 * F.s, y); c.restore();
    });
    infoBlit(g);
  },
  demo: { bg: '#F4F1EA', after: [['donutChart', { at: .3, title: 'คนไทยซื้อของทางไหน', unit: ' %' }]] },
});

// timeline: the axis draws across, each event's dot pops and its label rises in, in order; the current one is lit
definePreset('timeline', {
  label: 'Timeline', about: 'axis draws on, events pop in order with year and text, the highlighted event is lit (history, steps, process)',
  meta: INFO_META(['timeline', 'history', 'steps', 'process', 'dates']),
  defaults: { ...INFO_DEF, ...infoBox(.84, .22, .74, .3, .84, .3), events: [{ label: '1782', text: 'ก่อตั้งกรุงเทพฯ' }, { label: '1932', text: 'เปลี่ยนแปลงการปกครอง' }, { label: '1999', text: 'รถไฟฟ้า BTS' }], stagger: null, color: '#E8541E' },
  run(t, o) {
    if (t < o.at) return; const { g, c } = infoCtx(o, 'timeline'), F = infoFrame(t, o), E = o.events, n = E.length, y = F.by + F.bh * .42, st = o.stagger ?? o.dur / Math.max(1, n);
    infoCard(c, F, o); infoTitle(c, F, o);
    const x0 = F.bx + 30 * F.s, x1 = F.bx + F.bw - 30 * F.s;
    c.save(); c.globalAlpha = F.a; c.strokeStyle = o.text; c.lineWidth = 4 * F.s; c.lineCap = 'round'; c.beginPath(); c.moveTo(x0, y); c.lineTo(lerp(x0, x1, ease(clamp((t - o.at) / (o.dur * .8)))), y); c.stroke(); c.restore();
    E.forEach((ev, i) => {
      // each event owns an equal slot: its labels stay inside it
      const slot = (x1 - x0) / n, x = x0 + slot * (i + .5), t0 = o.at + i * st * .8, q = clamp((t - t0) / .35), lit = o.highlight === i || (o.highlight < 0 && i === n - 1);
      if (q <= 0) return;
      c.save(); c.globalAlpha = F.a; c.fillStyle = lit ? o.color : '#FFFFFF'; c.strokeStyle = o.color; c.lineWidth = 5 * F.s; c.beginPath(); c.arc(x, y, 16 * F.s * backOut(q) * (lit ? 1.25 : 1), 0, TAU); c.fill(); c.stroke(); c.restore();
      drawText(c, ev.label, x, y - 52 * F.s, F.lab(40, 800, lit ? o.color : o.text), { alpha: F.a * q, dy: (1 - easeOut(q)) * 16 * F.s });
      if (ev.text) {   // shrink a long label to its slot so neighbours never collide in a narrow frame
        const room = slot * .94; c.save(); c.font = fontCss(F.lab(28, 600)); const fit = Math.min(1, room / Math.max(1, c.measureText(ev.text).width)); c.restore();
        drawText(c, ev.text, x, y + 56 * F.s, F.lab(28, 600), { alpha: F.a * q, dy: (1 - easeOut(q)) * 16 * F.s, s: fit });
      }
    });
    infoBlit(g);
  },
  demo: { bg: '#F4F1EA', after: [['timeline', { at: .3, title: 'เส้นเวลา' }]] },
});

// iconGrid: a pictogram, `value` of `total` icons fill in one by one ("7 in 10 people"); a big label states it
definePreset('iconGrid', {
  label: 'Icon Grid (pictogram)', about: 'a grid of icons fills in one by one up to value of total, with a counting label ("7 ใน 10 คน")',
  meta: { ...INFO_META(['pictogram', 'ratio', 'people', 'share', 'icons']), params: { shape: { enum: ['person', 'circle', 'square', 'heart', 'star'] } } },
  defaults: { ...INFO_DEF, ...infoBox(.8, .3, .5, .5, .74, .42), total: 10, value: 7, cols: 5, shape: 'person', color: '#E8541E', offColor: '#D8D2C5', label: null },
  run(t, o) {
    if (t < o.at) return; const { g, c } = infoCtx(o, 'iconGrid'), F = infoFrame(t, o), rows = Math.ceil(o.total / o.cols), gridH = F.bh * (o.label === '' ? 1 : .72);
    const cell = Math.min(F.bw / o.cols, gridH / rows), gx = F.bx + (F.bw - cell * o.cols) / 2, gy = F.by + (gridH - cell * rows) / 2;
    infoCard(c, F, o); infoTitle(c, F, o);
    for (let i = 0; i < o.total; i++) {
      const x = gx + (i % o.cols + .5) * cell, y = gy + (Math.floor(i / o.cols) + .5) * cell, t0 = o.at + i * o.dur / o.total, q = clamp((t - t0) / .3), on = i < o.value, r = cell * .36;
      c.save(); c.globalAlpha = F.a * clamp(q * 2 + (on ? 0 : .5)); c.fillStyle = on && q > 0 ? o.color : o.offColor; c.translate(x, y); c.scale(on ? .7 + .3 * backOut(q) : 1, on ? .7 + .3 * backOut(q) : 1);
      c.beginPath();
      if (o.shape === 'person') { c.arc(0, -r * .55, r * .38, 0, TAU); c.fill(); c.beginPath(); c.roundRect(-r * .55, -r * .1, r * 1.1, r * 1.05, [r * .5, r * .5, r * .15, r * .15]); }
      else if (o.shape === 'square') c.roundRect(-r * .8, -r * .8, r * 1.6, r * 1.6, r * .25);
      else if (o.shape === 'heart') { c.moveTo(0, r * .8); c.bezierCurveTo(-r * 1.4, -r * .1, -r * .6, -r * 1.1, 0, -r * .35); c.bezierCurveTo(r * .6, -r * 1.1, r * 1.4, -r * .1, 0, r * .8); }
      else if (o.shape === 'star') for (let j = 0; j < 10; j++) { const a = j / 10 * TAU - Math.PI / 2, rr = j % 2 ? r * .45 : r; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      else c.arc(0, 0, r * .8, 0, TAU);
      c.fill(); c.restore();
    }
    const shown = Math.min(o.value, Math.floor(clamp((t - o.at) / o.dur) * o.total + 1e-6));
    if (o.label !== '') drawText(c, o.label ?? `${shown} ใน ${o.total}`, F.bx + F.bw / 2, F.by + F.bh * .88, F.lab(54, 800, o.color), { alpha: F.a });
    infoBlit(g);
  },
  demo: { bg: '#F4F1EA', after: [['iconGrid', { at: .3, title: 'คนไทยใช้มือถือซื้อของ', value: 7, total: 10 }]] },
});

// callout: a point on the picture pulses, a leader line draws out from it, a label box pops at its end (annotate a
// map, a product, a person in footage). point / labelAt are frame fractions.
definePreset('callout', {
  label: 'Callout', about: 'a pulsing point, a leader line that draws itself, and a label box that pops at its end (annotations on pictures, footage or maps)',
  meta: INFO_META(['callout', 'annotation', 'label', 'pointer', 'leader line']),
  defaults: { ...INFO_DEF, card: false, point: [.4, .5], labelAt: [.62, .36], label: 'ตรงนี้', sub: '', color: '#E8541E', textColor: '#FFFFFF', dur: .8 },
  run(t, o) {
    if (t < o.at) return; const { g, c } = infoCtx(o, 'callout'), F = infoFrame(t, o), [px, py] = [o.point[0] * W, o.point[1] * H], [lx, ly] = [o.labelAt[0] * W, o.labelAt[1] * H];
    const k1 = easeOut(clamp((t - o.at) / (o.dur * .5))), k2 = ease(clamp((t - o.at - o.dur * .3) / (o.dur * .5))), k3 = clamp((t - o.at - o.dur * .75) / .3), pulse = (t - o.at) % 1.2 / 1.2;
    c.save(); c.globalAlpha = F.out * (1 - pulse) * .6; c.strokeStyle = o.color; c.lineWidth = 4 * F.s; c.beginPath(); c.arc(px, py, (14 + 40 * pulse) * F.s, 0, TAU); c.stroke(); c.restore();
    c.save(); c.globalAlpha = F.out; c.fillStyle = o.color; c.strokeStyle = '#FFFFFF'; c.lineWidth = 4 * F.s; c.beginPath(); c.arc(px, py, 13 * F.s * backOut(k1), 0, TAU); c.fill(); c.stroke(); c.restore();
    const ex = [lerp(px, lx, k2), lerp(py, ly, k2)];
    c.save(); c.globalAlpha = F.out; c.strokeStyle = o.color; c.lineWidth = 5 * F.s; c.lineCap = 'round'; c.beginPath(); c.moveTo(px, py); c.lineTo(ex[0], ex[1]); c.stroke(); c.restore();
    if (k3 > 0) {
      c.save(); c.font = fontCss(F.lab(50, 800)); const tw = Math.max(c.measureText(o.label).width, o.sub ? (c.font = fontCss(F.lab(34, 600)), c.measureText(o.sub).width) : 0); c.restore();
      const bw = tw + 56 * F.s, bh = (o.sub ? 122 : 80) * F.s, s = backOut(k3), right = lx >= px, x0 = right ? lx : lx - bw * s;
      c.save(); c.globalAlpha = F.out; c.shadowColor = 'rgba(20,20,30,.25)'; c.shadowBlur = 16 * F.s; c.fillStyle = o.color; c.beginPath(); c.roundRect(x0, ly - bh / 2 * s, bw * s, bh * s, 14 * F.s); c.fill(); c.restore();
      drawText(c, o.label, x0 + bw * s / 2, ly - (o.sub ? 20 : 0) * F.s, F.lab(50, 800, o.textColor), { alpha: F.out * clamp(k3 * 2), s });
      if (o.sub) drawText(c, o.sub, x0 + bw * s / 2, ly + 30 * F.s, F.lab(34, 600, o.textColor), { alpha: F.out * clamp(k3 * 2), s });
    }
    infoBlit(g);
  },
  demo: { bg: '#2E3440', after: [['callout', { at: .3, point: [.38, .56], labelAt: [.6, .4], label: 'วัดพระแก้ว', sub: 'สร้างปี 2325' }]] },
});
