// presets/mapfx2.js: size and distance explainers on top of map.js (drawn inside mapView). Every number on screen is
// computed from the geometry: distances on the sphere (great circle, mean Earth radius) and areas of the Natural Earth
// borders, so a "how big is …?" story shows measured values, never typed-in ones.
//   mapMeasure   a ruler draws itself along sourced points; its length counts up in km
//   mapTrueSize  a country's outline is lifted and carried to another place at its TRUE size (moved on the sphere, so
//                Mercator stretches or shrinks it exactly as it does the land there); its area can be shown

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
