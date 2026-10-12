// presets/mapfx2.js: size and distance explainers on top of map.js (drawn inside mapView). Every number on screen is
// computed from the geometry: distances on the sphere (great circle, mean Earth radius) and areas of the Natural Earth
// borders, so a "how big is …?" story shows measured values, never typed-in ones.
//   mapMeasure   a ruler draws itself along sourced points; its length counts up in km
//   mapTrueSize  a country's outline is lifted and carried to another place at its TRUE size (moved on the sphere, so
//                Mercator stretches or shrinks it exactly as it does the land there); its area can be shown
// and explainer kit 2 (studied from map shorts on borders, growth, size and war):
//   mapSpread    a territory fills in by spreading out from a point, with a ragged front (conquest, a language, an idea)
//   mapZone      a soft, free-form zone (sourced outline) with a feathered edge and a name (ecozone, sphere of influence)
//   mapLine      a glowing line (a boundary, a parallel, a front) that draws itself, with its name written along it
//   mapRiver     a named river (Natural Earth) lights up from source to mouth, its name along it
//   mapFlagFill  a territory filled with its flag, gently waving
//   mapInset     a round picture (artwork) beside a place, joined to it by a thin line
//   mapObjectRow copies of a thing line up between two places with a running count (scale)
//   yearRuler    (screen) a tilted year track: the marker slides to the year
//   gauge        (screen) a dial whose needle swings into a zone (risk, rank, how close to the edge)

const EARTH_KM = 6371.0088;   // mean Earth radius (IUGG)
const geoKm = (a, b) => d3.geoDistance(a, b) * EARTH_KM;
const fmtNum = (v, step = 1) => (Math.round(v / step) * step).toLocaleString('en-US');
const fillNum = (tpl, vals) => String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (k in vals ? vals[k] : m));

definePreset('mapMeasure', {
  label: 'Map Measure', about: 'a ruler draws itself along sourced points (a country\'s length, a distance between two places): ticks every step km, end caps, and a tag that counts the measured great-circle length up ({km} in text, e.g. "{km} กม.")',
  meta: { version: '1.0.0', category: 'map', tags: ['map', 'measure', 'distance', 'ruler', 'length', 'size', 'km', 'how far', 'how big', 'scale'],
    params: { width: { min: 1, max: 16 }, tick: { min: 0, max: 2000 } }, assets: [{ param: 'coords', type: 'route' }], layers: ['overlay'] },
  defaults: { coords: [[0, 0], [10, 0]], text: '{km} กม.', round: 10, tick: 100, color: '#FFE14D', ink: '#141414', width: 5, size: 50, labelAt: .5, dx: 0, dy: 0, out: null, outDur: .4, ease: 'ease', dur: 1.6 },
  run(t, o) {
    const c = mapCtx(), u = US(), q = o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1, e = presetK(t, o), a = Math.min(clamp((t - o.at) / .2), q);
    if (a <= 0) return;
    const pts = o.coords, legs = []; let total = 0;
    for (let i = 1; i < pts.length; i++) { const d = geoKm(pts[i - 1], pts[i]); legs.push(d); total += d; }
    const goal = total * e, path = [pts[0]]; let run = 0;   // the drawn part, along great circles
    for (let i = 1; i < pts.length && run < goal; i++) {
      const f = clamp((goal - run) / legs[i - 1]), ip = d3.geoInterpolate(pts[i - 1], pts[i]), n = Math.max(2, Math.ceil(legs[i - 1] / 25));
      for (let s = 1; s <= n; s++) { if (s / n > f) { path.push(ip(f)); break; } path.push(ip(s / n)); }
      run += legs[i - 1];
    }
    const xy = path.map(mapPt).filter(Boolean); if (xy.length < 2) return;
    c.save(); c.globalAlpha = a; c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = o.ink; c.lineWidth = (o.width + 4) * u; c.beginPath(); xy.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.stroke();
    c.strokeStyle = o.color; c.lineWidth = o.width * u; c.stroke();
    // ticks every `tick` km along the drawn part, and end caps across the line
    const cap = (p, r, len) => { c.save(); c.translate(...p); c.rotate(r); c.strokeStyle = o.color; c.lineWidth = o.width * .8 * u; c.beginPath(); c.moveTo(0, -len); c.lineTo(0, len); c.stroke(); c.restore(); };
    const ang = (p, q2) => Math.atan2(q2[1] - p[1], q2[0] - p[0]);
    if (o.tick > 0) {
      let acc = 0;
      for (let i = 1; i < xy.length; i++) { const seg = geoKm(path[i - 1], path[i]); for (let k = Math.ceil(acc / o.tick) * o.tick; k < acc + seg; k += o.tick) if (k > 0) { const f = (k - acc) / seg; cap([lerp(xy[i - 1][0], xy[i][0], f), lerp(xy[i - 1][1], xy[i][1], f)], ang(xy[i - 1], xy[i]), 7 * u); } acc += seg; }
    }
    cap(xy[0], ang(xy[0], xy[1]), 16 * u);
    if (e >= 1) cap(xy[xy.length - 1], ang(xy[xy.length - 2], xy[xy.length - 1]), 16 * u);
    c.restore();
    if (!o.text) return;
    // the tag: beside the point labelAt of the way along, counting up with the line
    const m = xy[Math.min(xy.length - 1, Math.round((xy.length - 1) * o.labelAt))], txt = fillNum(o.text, { km: fmtNum(goal, o.round) });
    const font = fontCss({ font: 'display', weight: 800, size: o.size }), px = o.size * TS();
    c.save(); c.font = font; const tw = c.measureText(txt).width, M = .04 * Math.min(W, H);
    const x = clamp(m[0] + o.dx * u - tw / 2, M + px * .4, W - M - tw - px * .4), y = clamp(m[1] + o.dy * u, M + px * 1.2, H - M);
    c.globalAlpha = a; c.shadowColor = 'rgba(0,0,0,.4)'; c.shadowBlur = 10 * u; c.shadowOffsetY = 3 * u; c.fillStyle = o.color;
    c.beginPath(); c.roundRect(x - px * .4, y - px * 1.05, tw + px * .8, px * 1.45, px * .3); c.fill(); c.shadowColor = 'transparent';
    c.fillStyle = o.ink; c.textBaseline = 'alphabetic'; c.fillText(txt, x, y); c.restore();
    mapObstacle(x - px * .4, y - px * 1.05, tw + px * .8, px * 1.45);
  },
});

// rotate a geometry on the sphere so that point `from` lands on `to` (shape and area kept, like sliding a cut-out
// over a globe); Mercator then draws it at the size it really has at its new latitude
function geoCarry(g, from, to) {
  const r1 = d3.geoRotation([-from[0], -from[1]]), r2 = d3.geoRotation([-to[0], -to[1]]).invert;
  const mv = p => r2(r1(p)), ring = r => r.map(mv);
  const coords = g.type === 'Polygon' ? g.coordinates.map(ring) : g.type === 'MultiPolygon' ? g.coordinates.map(pg => pg.map(ring)) : null;
  return coords ? { type: g.type, coordinates: coords } : g;
}
const TRUE_AREA = new Map();
const geoKm2 = gs => gs.reduce((s, g) => s + d3.geoArea(g), 0) * EARTH_KM * EARTH_KM;

definePreset('mapTrueSize', {
  label: 'Map True Size', about: 'a country\'s outline lifts off and slides to a sourced place (lonlat) at its TRUE size, the way the land there is drawn, so sizes compare honestly on a Mercator map (Thailand over Europe, Greenland over Africa); a tag can show its measured area ({km2} km², {rai} rai) or any text',
  meta: { version: '1.0.0', category: 'map', tags: ['map', 'true size', 'compare', 'size', 'area', 'how big', 'overlay', 'mercator', 'scale', 'country'],
    params: { alpha: { min: 0, max: 1 }, width: { min: 1, max: 12 } }, assets: [{ param: 'name', type: 'geo' }, { param: 'units', type: 'geo' }], layers: ['overlay'] },
  defaults: { name: 'Thailand', units: [], lonlat: [0, 0], color: '#FFD43B', alpha: .55, width: 4, hold: .25, text: '', size: 46, ink: '#141414', round: 1000, out: null, outDur: .5, ease: 'linear', dur: 2 },
  run(t, o) {
    const gs = mapUnits(o, 'mapTrueSize'), c = mapCtx(), u = US(), q = o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1;
    const a = Math.min(clamp((t - o.at) / .3), q); if (a <= 0) return;
    const key = JSON.stringify([o.units, o.name]);
    if (!TRUE_AREA.has(key)) TRUE_AREA.set(key, { km2: geoKm2(gs), from: d3.geoCentroid({ type: 'GeometryCollection', geometries: gs }) });
    const { km2, from } = TRUE_AREA.get(key);
    // a short lift in place (hold, as a fraction of dur), then the slide along the great circle
    const k = presetK(t, o), slide = ease(clamp((k - o.hold) / (1 - o.hold))), lift = clamp(k / Math.max(.01, o.hold));
    const at = d3.geoInterpolate(from, o.lonlat)(slide), moved = gs.map(g => geoCarry(g, from, at));
    c.save(); mapTrace(c, moved);
    c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 18 * u * lift; c.shadowOffsetY = 10 * u * lift;
    c.globalAlpha = o.alpha * a; c.fillStyle = o.color; c.fill(); c.shadowColor = 'transparent';
    c.globalAlpha = a; c.lineJoin = 'round'; c.lineWidth = o.width * u; c.strokeStyle = '#FFFFFF'; c.stroke();
    c.restore();
    if (!o.text || slide < 1) return;
    const txt = fillNum(o.text, { km2: fmtNum(km2, o.round), rai: fmtNum(km2 * 625, o.round * 1000) });
    const B = mapBox(moved), px = o.size * TS(), M = .04 * Math.min(W, H);
    c.save(); c.font = fontCss({ font: 'display', weight: 800, size: o.size }); const tw = c.measureText(txt).width;
    const x = clamp((B.x0 + B.x1) / 2 - tw / 2, M + px * .4, W - M - tw - px * .4), y = clamp(B.y1 + px * 1.6, M + px * 1.2, H - M);
    c.globalAlpha = a * clamp((t - (o.at + o.dur)) / .3); c.fillStyle = o.color; c.beginPath(); c.roundRect(x - px * .4, y - px * 1.05, tw + px * .8, px * 1.45, px * .3); c.fill();
    c.fillStyle = o.ink; c.textBaseline = 'alphabetic'; c.fillText(txt, x, y); c.restore();
    mapObstacle(x - px * .4, y - px * 1.05, tw + px * .8, px * 1.45);
  },
});

// ---- explainer kit 2 (studied from map shorts on borders, growth, size and war) ----
// text along a screen polyline, centred at fraction `at` of its length, kept upright (Thai-safe: whole graphemes)
function textAlongPath(c, pts, text, at = .5, lift = 0, stroke = false) {
  if (pts.length < 2) return;
  const D = [0]; for (let i = 1; i < pts.length; i++) D.push(D[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = D.at(-1), gs = graphemes(text), ws = gs.map(g => c.measureText(g).width), tw = ws.reduce((a, b) => a + b, 0); if (tw > total * .95) return;
  const pos = d => { d = clamp(d, 0, total); let i = 1; while (i < D.length - 1 && D[i] < d) i++; const f = (d - D[i - 1]) / ((D[i] - D[i - 1]) || 1); return [lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f), Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0])]; };
  const mid = pos(total * at), e0 = pos(total * at - tw / 2), e1 = pos(total * at + tw / 2);
  if (Math.abs(Math.sin(Math.atan2(e1[1] - e0[1], e1[0] - e0[0]))) > .6) {   // a steep stretch: a level label beside it reads better than stacked letters
    c.save(); c.textAlign = 'left'; c.textBaseline = 'middle'; if (stroke) c.strokeText(text, mid[0] + lift * .5, mid[1]); c.fillText(text, mid[0] + lift * .5, mid[1]); c.restore(); return;
  }
  const flip = Math.cos(mid[2]) < 0;   // a path running leftwards is read from its other end
  let d = total * at + (flip ? tw / 2 : -tw / 2);
  c.save(); c.textAlign = 'center'; c.textBaseline = 'middle';
  gs.forEach((g, i) => { const w = ws[i], p = pos(flip ? d - w / 2 : d + w / 2), ang = p[2] + (flip ? Math.PI : 0);
    c.save(); c.translate(p[0], p[1]); c.rotate(ang); c.translate(0, -lift); if (stroke) c.strokeText(g, 0, 0); c.fillText(g, 0, 0); c.restore(); d += flip ? -w : w; });
  c.restore();
}
const mapScreenLine = coords => routeOf(coords).P.map(ll => mapVisible(ll) ? mapPt(ll) : null);
const splitRuns = pts => { const runs = [[]]; for (const p of pts) { if (p) runs.at(-1).push(p); else if (runs.at(-1).length) runs.push([]); } return runs.filter(r => r.length > 1); };

definePreset('mapSpread', {
  label: 'Map Spread', about: 'a territory fills in by spreading out from a point (from: a sourced place) with a ragged, living front, then its rim appears; for a conquest, a kingdom growing, a language or an idea spreading',
  meta: { version: '1.0.0', category: 'map', tags: ['map', 'spread', 'growth', 'expansion', 'conquest', 'empire', 'territory', 'fill', 'grow', 'invasion'],
    params: { alpha: { min: 0, max: 1 }, rough: { min: 0, max: 1 } }, assets: [{ param: 'units', type: 'geo' }, { param: 'from', type: 'place' }], layers: ['overlay'] },
  defaults: { name: 'Thailand', units: [], from: [100.5, 13.75], color: '#B3302B', alpha: .8, rough: .5, edge: 2, edgeColor: '#FFFFFF', out: null, outDur: .4, ease: 'ease', dur: 1.6 },
  run(t, o) {
    const gs = mapUnits(o, 'mapSpread'), c = mapCtx(), u = US(), q = o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1, k = presetK(t, o); if (k <= 0 || q <= 0) return;
    const s = mapPt(o.from) || [W / 2, H / 2], B = mapBox(gs), R = Math.max(...[[B.x0, B.y0], [B.x1, B.y0], [B.x0, B.y1], [B.x1, B.y1]].map(p => Math.hypot(p[0] - s[0], p[1] - s[1]))) * 1.05;
    c.save();
    if (k < 1) {   // the front: a circle with a ragged, slowly changing edge
      c.beginPath(); for (let i = 0; i <= 72; i++) { const a = i / 72 * TAU, n = Math.sin(a * 5 + t * 1.3) * .5 + Math.sin(a * 11 - t * .9) * .3 + Math.sin(a * 23) * .2, r = R * k * (1 + o.rough * .14 * n);
        i ? c.lineTo(s[0] + Math.cos(a) * r, s[1] + Math.sin(a) * r) : c.moveTo(s[0] + Math.cos(a) * r, s[1] + Math.sin(a) * r); }
      c.clip();
    }
    mapTrace(c, gs); c.globalAlpha = o.alpha * q; c.fillStyle = o.color; c.fill(); c.restore();
    if (o.edge > 0 && k > .7) mapEdge(c, gs, o.edge * u, o.edgeColor, clamp((k - .7) / .3) * q);
  },
});

definePreset('mapZone', {
  label: 'Map Zone', about: 'a soft free-form zone from a sourced outline (coords: [lon, lat] points around it): a rounded blob with a feathered edge in one colour that grows in from its centre, with an optional name; for an ecozone, a sphere of influence, a climate belt, a cultural area',
  meta: { version: '1.0.0', category: 'map', tags: ['map', 'zone', 'area', 'region', 'sphere of influence', 'ecozone', 'belt', 'influence', 'blob', 'soft'],
    params: { alpha: { min: 0, max: 1 }, feather: { min: 0, max: 80 }, size: { min: 12, max: 140 } }, assets: [{ param: 'coords', type: 'route' }], layers: ['overlay'] },
  defaults: { coords: [[95, 20], [105, 22], [108, 12], [98, 8]], color: '#3FD17A', alpha: .45, feather: 24, text: '', size: 46, textColor: '#FFFFFF', out: null, outDur: .5, ease: 'easeOut', dur: .8 },
  run(t, o) {
    const q = o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1, k = Math.min(presetK(t, o), q); if (k <= 0) return;
    const pts = o.coords.map(ll => mapVisible(ll) ? mapPt(ll) : null).filter(Boolean); if (pts.length < 3) return;
    const c = mapCtx(), u = US(), cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length, sc = .6 + .4 * k;
    const P = pts.map(p => [cx + (p[0] - cx) * sc, cy + (p[1] - cy) * sc]), n = P.length;
    c.save(); c.globalAlpha = o.alpha * k; c.fillStyle = o.color; c.filter = o.feather > 0 ? `blur(${(o.feather * u).toFixed(1)}px)` : 'none';
    c.beginPath();   // a closed Catmull-Rom curve through the outline points
    for (let i = 0; i < n; i++) { const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
      if (!i) c.moveTo(p1[0], p1[1]); c.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]); }
    c.closePath(); c.fill(); c.restore();
    if (o.text) { c.save(); c.globalAlpha = k; c.font = fontCss({ font: 'display', weight: 800, size: o.size }); c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = o.size * TS() * .14; c.lineJoin = 'round'; c.strokeStyle = 'rgba(0,0,0,.45)'; c.strokeText(o.text, cx, cy); c.fillStyle = o.textColor; c.fillText(o.text, cx, cy); c.restore(); }
  },
});

definePreset('mapLine', {
  label: 'Map Line', about: 'a glowing line along sourced coords (a boundary nobody can see, a parallel, a front line, a sea route) draws itself, solid or dashed, with its name written along it; style neon glows, style plain is a clean line',
  meta: { version: '1.0.0', category: 'map', tags: ['map', 'line', 'boundary', 'border', 'parallel', 'latitude', 'front', 'divide', 'neon', 'dashed', 'label along'],
    params: { width: { min: .5, max: 20 }, style: { enum: ['neon', 'plain'] }, size: { min: 12, max: 120 } }, assets: [{ param: 'coords', type: 'route' }], layers: ['overlay'] },
  defaults: { coords: [[100, 0], [140, 0]], color: '#FF5A8A', width: 5, dash: [18, 14], style: 'neon', text: '', size: 40, textColor: '#FFFFFF', labelAt: .5, out: null, outDur: .4, ease: 'ease', dur: 1.2 },
  run(t, o) {
    const q = o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1, k = presetK(t, o); if (k <= 0 || q <= 0) return;
    const c = mapCtx(), u = US(), all = mapScreenLine(o.coords), n = Math.max(2, Math.round(all.length * k)), runs = splitRuns(all.slice(0, n));
    c.save(); c.globalAlpha = q; c.lineCap = c.lineJoin = 'round'; c.setLineDash(o.dash ? o.dash.map(v => v * u) : []); c.lineDashOffset = -t * 30 * u;
    for (const pass of o.style === 'neon' ? [[o.width * 3, .25, 24], [o.width * 1.6, .55, 10], [o.width * .7, 1, 0]] : [[o.width, 1, 0]]) {
      c.lineWidth = pass[0] * u; c.globalAlpha = q * pass[1]; c.strokeStyle = o.style === 'neon' && pass[2] === 0 ? '#FFFFFF' : o.color; c.shadowColor = o.color; c.shadowBlur = pass[2] * u;
      for (const r of runs) { c.beginPath(); r.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke(); }
    }
    c.restore();
    if (o.text && k > .6) { const longest = splitRuns(all).sort((a, b) => b.length - a.length)[0]; if (longest) {
      c.save(); c.globalAlpha = q * clamp((k - .6) / .3); c.font = fontCss({ font: 'display', weight: 800, size: o.size }); c.fillStyle = o.textColor; c.shadowColor = o.color; c.shadowBlur = 10 * u;
      textAlongPath(c, longest, o.text, o.labelAt, o.size * TS() * .75); c.restore(); } }
  },
});

definePreset('mapRiver', {
  label: 'Map River', about: 'a named river (Natural Earth 1:10m, English name: "Mekong", "Chao Phraya", "Mississippi") lights up from end to end with a soft glow, its name written along it',
  meta: { version: '1.0.0', category: 'map', tags: ['map', 'river', 'water', 'glow', 'highlight', 'label along', 'geography'],
    params: { width: { min: 1, max: 20 }, size: { min: 12, max: 120 } }, layers: ['overlay'] },
  defaults: { river: 'Mekong', color: '#7FE3FF', width: 5, text: '', size: 38, textColor: '#FFFFFF', labelAt: .5, out: null, outDur: .4, ease: 'ease', dur: 1.4 },
  run(t, o) {
    const q = o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1, k = presetK(t, o); if (k <= 0 || q <= 0) return;
    const parts = (GEO.rivers10 || []).filter(r => r.n === o.river); if (!parts.length) throw new Error(`mapRiver: no river named "${o.river}" in src/geo/rivers_10m.js (English Natural Earth names)`);
    const c = mapCtx(), u = US(), lines = parts.flatMap(r => r.c).map(l => l.map(ll => mapVisible(ll) ? mapPt(ll) : null));
    c.save(); c.globalAlpha = q; c.lineCap = c.lineJoin = 'round';
    for (const [w, a, b, col] of [[o.width * 2.6, .3, 18, o.color], [o.width, 1, 6, o.color], [o.width * .4, 1, 0, '#FFFFFF']]) {
      c.lineWidth = w * u; c.globalAlpha = q * a; c.strokeStyle = col; c.shadowColor = o.color; c.shadowBlur = b * u;
      for (const l of lines) for (const r of splitRuns(l.slice(0, Math.max(2, Math.round(l.length * k))))) { c.beginPath(); r.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke(); }
    }
    c.restore();
    if (o.text && k > .5) { const longest = lines.flatMap(splitRuns).sort((a, b) => b.length - a.length)[0]; if (longest) {
      c.save(); c.globalAlpha = q * clamp((k - .5) / .3); c.font = fontCss({ font: 'display', weight: 700, size: o.size }); c.fillStyle = o.textColor; c.lineWidth = o.size * TS() * .12; c.strokeStyle = 'rgba(10,40,70,.7)'; c.lineJoin = 'round';
      textAlongPath(c, longest, o.text, o.labelAt, o.size * TS() * .8, true); c.restore(); } }
  },
});



definePreset('mapFlagFill', {
  label: 'Map Flag Fill', about: 'a territory filled with its national flag (flag: a code from the sticker flags), gently waving (soft light and shade bands travel across it), white rim; only a flag the state really flew at that time',
  meta: { version: '1.0.0', category: 'map', tags: ['map', 'flag', 'country', 'nation', 'independence', 'national', 'fill', 'patriotic'],
    params: { alpha: { min: 0, max: 1 }, wave: { min: 0, max: 2 } }, assets: [{ param: 'name', type: 'geo' }, { param: 'units', type: 'geo' }], layers: ['overlay'] },
  defaults: { name: 'Thailand', units: [], flag: 'th', alpha: .92, wave: 1, edge: 2.4, out: null, outDur: .4, ease: 'easeOut', dur: .7 },
  run(t, o) {
    const F = FLAGS[o.flag]; if (!F) throw new Error(`mapFlagFill: no flag "${o.flag}" (have: ${Object.keys(FLAGS).join(', ')})`);
    const gs = mapUnits(o, 'mapFlagFill'), c = mapCtx(), u = US(), q = o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1, a = Math.min(presetK(t, o), q); if (a <= 0) return;
    const B = mapBox(gs), bw = B.x1 - B.x0, bh = B.y1 - B.y0, fw = Math.max(bw, bh / F.ratio) * 1.05, fh = fw * F.ratio;
    c.save(); mapTrace(c, gs); c.clip(); c.globalAlpha = o.alpha * a;
    c.save(); c.translate((B.x0 + B.x1) / 2, (B.y0 + B.y1) / 2); F.draw(c, fw, fh); c.restore();
    if (o.wave > 0) for (let i = 0; i < 6; i++) {   // travelling light / shade bands: the cloth's ripple
      const x = B.x0 + ((i / 6 + t * .12 * o.wave) % 1) * (bw + 200 * u) - 100 * u, g = c.createLinearGradient(x - 60 * u, 0, x + 60 * u, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(.5, i % 2 ? 'rgba(0,0,0,.16)' : 'rgba(255,255,255,.16)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - 60 * u, B.y0, 120 * u, bh);
    }
    c.restore();
    if (o.edge > 0) mapEdge(c, gs, o.edge * u, '#FFFFFF', a);
  },
});

definePreset('mapInset', {
  label: 'Map Inset', about: 'a round picture (an opaque artwork item: what the place looks like) beside a sourced place, white ring and soft shadow, joined to the place by a thin line with a dot; pops in',
  meta: { version: '1.0.0', category: 'map', tags: ['map', 'inset', 'picture', 'photo', 'bubble', 'portrait', 'place', 'circle', 'example'],
    params: { radius: { min: 30, max: 400 } }, assets: [{ param: 'lonlat', type: 'place' }, { param: 'image', type: 'image' }], layers: ['overlay'] },
  defaults: { lonlat: [0, 0], image: '', art: null, dx: 170, dy: -170, radius: 120, ring: '#FFFFFF', out: null, outDur: .3, ease: 'backOut', dur: .45 },
  run(t, o) {
    const im = STICKER_IMG[artPath(o.image)]; if (!im || !mapVisible(o.lonlat)) return;
    const p = mapPt(o.lonlat); if (!p) return;
    const u = US(), r = o.radius * u, x = p[0] + o.dx * u, y = p[1] + o.dy * u; mapObstacle(x - r - 6 * u, y - r - 6 * u, 2 * r + 12 * u, 2 * r + 12 * u);
    const s = stickerPop(t, o) * stickerOut(t, o); if (s <= .001) return;
    const c = mapCtx(); c.save(); c.globalAlpha = Math.min(1, s);
    c.strokeStyle = o.ring; c.lineWidth = 2.5 * u; c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(lerp(p[0], x, Math.min(1, s)), lerp(p[1], y, Math.min(1, s))); c.stroke();
    c.fillStyle = o.ring; c.beginPath(); c.arc(p[0], p[1], 5 * u, 0, TAU); c.fill();
    c.translate(x, y); c.scale(s, s); c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 16 * u; c.shadowOffsetY = 6 * u; c.beginPath(); c.arc(0, 0, r + 6 * u, 0, TAU); c.fill(); c.shadowColor = 'transparent';
    c.save(); c.beginPath(); c.arc(0, 0, r, 0, TAU); c.clip(); const sc = Math.max(2 * r / im.width, 2 * r / im.height); c.drawImage(im.canvas || im.elt, -im.width * sc / 2, -im.height * sc / 2, im.width * sc, im.height * sc); c.restore();
    c.restore();
  },
});

// ---- screen ----
definePreset('yearRuler', {
  label: 'Year Ruler', about: 'a tilted year track across the frame (years: [first, last]): ticks along it, a marker slides from the last year (from) to this one (year), the year above it; for a story told through several dates',
  meta: { version: '1.0.0', category: 'sticker', tags: ['timeline', 'year', 'date', 'history', 'chronology', 'track', 'era', 'progress'], camera: 'screen', layers: ['screen'],
    params: { angle: { min: -20, max: 20 }, y: { min: 0, max: 1 }, size: { min: 20, max: 140 } } },
  defaults: { years: [1700, 1900], year: 1803, from: null, y: .8, angle: -6, size: 56, color: '#FFFFFF', accent: '#FFD84D', out: null, outDur: .4, ease: 'ease', dur: .9 },
  run(t, o) {
    const q = o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1, k = presetK(t, o), a = Math.min(clamp((t - o.at) / .3), q); if (a <= 0) return;
    const { g, c } = stkCtx(o, 'yearRuler'), u = US(), [y0, y1] = o.years, f = v => clamp((v - y0) / (y1 - y0)), yr = lerp(o.from ?? o.year, o.year, k);
    const A = o.angle * Math.PI / 180, L = Math.hypot(W, H), X = W / 2, Y = o.y * H, xAt = s => (s - .5) * W * 1.1;
    c.save(); c.globalAlpha = a; c.translate(X, Y); c.rotate(A); c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 8 * u;
    c.strokeStyle = o.color; c.lineWidth = 3 * u; c.beginPath(); c.moveTo(-L / 2, 0); c.lineTo(L / 2, 0); c.stroke();
    for (let v = Math.ceil(y0 / 10) * 10; v <= y1; v += 10) { const x = xAt(f(v)), big = v % 50 === 0; c.lineWidth = (big ? 2.5 : 1.5) * u; c.beginPath(); c.moveTo(x, -(big ? 12 : 7) * u); c.lineTo(x, (big ? 12 : 7) * u); c.stroke(); }
    const x = xAt(f(yr)); c.fillStyle = o.accent; c.beginPath(); c.arc(x, 0, 9 * u, 0, TAU); c.fill(); c.strokeStyle = '#FFFFFF'; c.lineWidth = 2.5 * u; c.stroke();
    c.font = fontCss({ font: 'display', weight: 800, size: o.size }); c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillStyle = o.color; c.fillText(String(Math.round(yr)), x, -22 * u);
    c.restore(); stkBlit(g);
  },
  demo: { bg: '#2E5E7E', after: [['yearRuler', { at: .2, years: [1750, 1900], from: 1783, year: 1867, y: .55 }]] },
});

definePreset('gauge', {
  label: 'Gauge', about: 'a dial (zones from safe to danger) whose needle swings with a little overshoot to value (0 to 1), a label under it; for risk, a ranking, how close to the edge (bankruptcy, collapse, a record)',
  meta: { version: '1.0.0', category: 'infographic', tags: ['gauge', 'dial', 'meter', 'needle', 'risk', 'danger', 'level', 'rank', 'speedometer'], camera: 'screen', layers: ['screen'],
    params: { value: { min: 0, max: 1 }, x: { min: 0, max: 1 }, y: { min: 0, max: 1 }, size: { min: 80, max: 800 } } },
  defaults: { value: .85, from: 0, x: .5, y: .45, size: 360, text: '', zones: ['#3FB56B', '#F2C14E', '#E0473D'], out: null, outDur: .35, ease: 'backOut', dur: 1.1 },
  run(t, o) {
    const q = o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1, a = Math.min(clamp((t - o.at) / .25), q); if (a <= 0) return;
    const { g, c } = stkCtx(o, 'gauge'), u = US(), R = o.size * u / 2, X = o.x * W, Y = o.y * H, v = lerp(o.from, o.value, presetK(t, o)), ang = v2 => Math.PI + v2 * Math.PI;
    c.save(); c.globalAlpha = a; c.translate(X, Y); c.shadowColor = 'rgba(0,0,0,.4)'; c.shadowBlur = 14 * u;
    c.fillStyle = '#FBFAF6'; c.beginPath(); c.arc(0, 0, R * 1.08, Math.PI, 0); c.lineTo(R * 1.08, R * .12); c.lineTo(-R * 1.08, R * .12); c.closePath(); c.fill(); c.shadowColor = 'transparent';
    o.zones.forEach((col, i) => { c.strokeStyle = col; c.lineWidth = R * .2; c.beginPath(); c.arc(0, 0, R * .82, ang(i / o.zones.length) + .01, ang((i + 1) / o.zones.length) - .01); c.stroke(); });
    c.save(); c.rotate(ang(v)); c.fillStyle = '#22202A'; c.beginPath(); c.moveTo(0, -R * .05); c.lineTo(R * .9, 0); c.lineTo(0, R * .05); c.closePath(); c.fill(); c.restore();
    c.fillStyle = '#22202A'; c.beginPath(); c.arc(0, 0, R * .09, 0, TAU); c.fill();
    if (o.text) { c.font = fontCss({ font: 'display', weight: 800, size: o.size * .14 }); c.textAlign = 'center'; c.textBaseline = 'top'; c.fillStyle = '#FFFFFF'; c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 6 * u; c.lineJoin = 'round'; c.strokeText(o.text, 0, R * .22); c.fillText(o.text, 0, R * .22); }
    c.restore(); stkBlit(g);
  },
  demo: { bg: '#2E5E7E', after: [['gauge', { at: .2, value: .9, text: 'เสี่ยงล้มละลาย' }]] },
});

definePreset('mapObjectRow', {
  label: 'Map Object Row', about: 'how many of something fit between two sourced places: copies of an artwork item (a ship, a tower, a person) or a sticker icon line up evenly along the great circle from one place to the other, popping in one after another, with an optional running count (e.g. "× 12") at the end; for a sense of scale',
  meta: { version: '1.0.0', category: 'map', tags: ['map', 'scale', 'how many', 'count', 'row', 'line up', 'compare', 'distance', 'fit', 'objects', 'image'],
    params: { count: { min: 2, max: 40 }, size: { min: 16, max: 240 } }, assets: [{ param: 'from', type: 'place' }, { param: 'to', type: 'place' }, { param: 'image', type: 'image' }], layers: ['overlay'] },
  defaults: { from: [100, 20], to: [101, 6], count: 8, image: '', art: null, icon: null, glyph: null, size: 70, label: true, unit: '×', color: '#FFFFFF', out: null, outDur: .35, ease: 'ease', dur: 1.6 },
  run(t, o) {
    const q = o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1; if (q <= 0 || t < o.at) return;
    const im = o.image ? STICKER_IMG[artPath(o.image)] : null, c = mapCtx(), u = US(), h = o.size * u, ip = d3.geoInterpolate(o.from, o.to), n = Math.round(o.count);
    let last = null, shown = 0; c.save(); c.globalAlpha = q;
    for (let i = 0; i < n; i++) {
      const s = stickerPop(t, { ...o, at: o.at + i / n * o.dur, dur: .35, ease: 'backOut' }); if (s <= .001) continue;
      const ll = ip(n === 1 ? .5 : i / (n - 1)); if (!mapVisible(ll)) continue; const p = mapPt(ll); if (!p) continue;
      shown = i + 1; last = p;
      if (im) mapTokenImg(c, im, p[0], p[1] + h * .5, h * s, 1);
      else if (o.icon || o.glyph) { c.save(); c.translate(p[0], p[1]); c.scale(s, s); drawSticker(c, { icon: o.icon, glyph: o.glyph, card: false }, h); c.restore(); }
      else { c.fillStyle = o.color; c.strokeStyle = 'rgba(16,16,22,.75)'; c.lineWidth = 2.5 * u; c.beginPath(); c.arc(p[0], p[1], h * .2 * s, 0, TAU); c.fill(); c.stroke(); }
    }
    if (o.label && last && shown) { const txt = `${o.unit} ${shown}`; c.font = fontCss({ font: 'display', weight: 800, size: o.size * .75 }); const px = o.size * .75 * TS(), tw = c.measureText(txt).width, x = clamp(last[0] + h * .7, W * .05, W * .95 - tw - px * .7), y = clamp(last[1] - h * .8, H * .12, H * .8);   // kept in frame
      c.fillStyle = 'rgba(16,16,22,.82)'; c.beginPath(); c.roundRect(x - px * .35, y - px * .7, tw + px * .7, px * 1.4, px * .4); c.fill();
      c.fillStyle = o.color; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(txt, x, y + px * .04); mapObstacle(x - px * .35, y - px * .7, tw + px * .7, px * 1.4); }
    c.restore();
  },
});
