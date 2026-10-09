// @requires node_modules/d3-array/dist/d3-array.min.js
// @requires node_modules/d3-geo/dist/d3-geo.min.js
// @requires src/geo/land_50m.js
// map.js: geographic capabilities for map-dominant documentaries. Real projections (d3-geo) over vendored Natural Earth
// land; every position is [longitude, latitude] in degrees, never screen pixels, so routes, labels and markers stay put
// while the geographic camera moves. The map is drawn crisp on a 2D layer, then composited (the look's grade, grain
// and paper still apply on top).
//   mapView   the geographic CAMERA: projection, centre and zoom from → to (or keys); draws its `inner` map layers
//   mapBase   ocean, land and coastline (and an optional graticule)
//   routeDraw a path through sourced [lon, lat] points that draws itself, with a moving head
//   mapMarker a place marker that pops in and pulses
//   mapLabel  live text (Thai-safe browser shaping) pinned to a place
// Facts never live here: routes and places come from the shot manifest's sourced `data` (see
// docs/integration/SHOT_MANIFEST_SCHEMA.md). Between documented stops a route is schematic, and the manifest says so.
const MAP = { proj: null, view: null, g: null, ctx: null };
const mapCtx = () => { if (!MAP.proj) throw new Error('map layers must be drawn inside mapView'); return MAP.ctx; };
const MAP_PROJ = {
  naturalEarth: () => d3.geoNaturalEarth1(), mercator: () => d3.geoMercator(), equirectangular: () => d3.geoEquirectangular(),
  orthographic: () => d3.geoOrthographic().clipAngle(90),
};
// zoom 1 = the whole world spans the frame's SHORT side, so a plan frames the same core in 9:16 and 16:9 (16:9 shows more
// to the sides: re-framed, never cropped); orthographic: the globe fills the short side
function mapProjection(kind, center, zoom, rot = 0) {
  const p = (MAP_PROJ[kind] || MAP_PROJ.naturalEarth)();
  const S = Math.min(W, H), base = kind === 'orthographic' ? S / 2.1 : kind === 'naturalEarth' ? S / 5.47 : S / (2 * Math.PI);
  p.scale(base * zoom).translate([W / 2, H / 2]);
  if (kind === 'orthographic') return p.rotate([-center[0], -center[1], rot]);
  p.rotate([-center[0], 0, rot]).center([0, center[1]]);
  // keep the frame ON the map: a flat world never shows its edge (no empty band past a pole, in any aspect). Too short
  // → scale up; past the top or bottom → slide (the centre moves the least possible).
  const top = p([center[0], 89.9])[1], bot = p([center[0], -89.9])[1];
  if (bot - top < H) { p.scale(p.scale() * H / (bot - top) * 1.001); return mapProjection.fit(p, center); }
  return mapProjection.fit(p, center);
}
mapProjection.fit = (p, center) => {
  const top = p([center[0], 89.9])[1], bot = p([center[0], -89.9])[1], [tx, ty] = p.translate();
  if (top > 0) p.translate([tx, ty - top]); else if (bot < H) p.translate([tx, ty + H - bot]);
  return p;
};
// between two views: the centre travels the great circle, the zoom changes in log space (constant apparent speed);
// arc > 0 pulls back mid-move (a "fly-over"), so long jumps don't smear across the map
function mapLerpView(a, b, k, arc = 0) {
  const c = d3.geoInterpolate(a.center, b.center)(k), z = Math.exp(lerp(Math.log(a.zoom), Math.log(b.zoom), k)) * (1 - arc * Math.sin(Math.PI * k));
  return { center: c, zoom: Math.max(.05, z), rot: lerp(a.rot || 0, b.rot || 0, k) };
}
const mapPt = ll => { const p = MAP.proj(ll); return p && Number.isFinite(p[0]) ? p : null; };
const mapVisible = ll => !MAP.proj.clipAngle || !MAP.proj.clipAngle() || d3.geoDistance(ll, [-MAP.proj.rotate()[0], -MAP.proj.rotate()[1]]) < Math.PI / 2 - .01;

definePreset('mapView', {
  label: 'Map Camera', about: 'geographic camera: d3-geo projection travelling (great circle) and zooming between views; draws map layers inside',
  meta: { version: '1.0.0', category: 'camera', tags: ['map', 'camera', 'geography', 'travel', 'zoom', 'pan', 'globe', 'documentary'],
    params: { projection: { enum: Object.keys(MAP_PROJ) }, arc: { min: 0, max: .8 } }, camera: 'camera', layers: ['camera'] },
  defaults: { projection: 'naturalEarth', from: { center: [0, 20], zoom: 1 }, to: { center: [0, 20], zoom: 1.2 }, keys: null, arc: 0, dur: 4 },
  run(t, o, inner) {
    let v;
    if (o.keys) {   // [[t, {center, zoom, rot?}], ...] in shot time, each segment eased
      const K = o.keys; let i = 0; while (i + 2 < K.length && t >= K[i + 1][0]) i++;
      const [ta, va] = K[i], [tb, vb] = K[Math.min(i + 1, K.length - 1)];
      v = mapLerpView(va, vb, easeBy(o.ease)(tb > ta ? clamp((t - ta) / (tb - ta)) : 1), o.arc);
    } else v = mapLerpView(o.from, o.to, presetK(t, o), o.arc);
    MAP.proj = mapProjection(o.projection, v.center, v.zoom, v.rot); MAP.view = v;
    if (!MAP.g) { MAP.g = createGraphics(W, H); MAP.g.pixelDensity(1); MAP.ctx = MAP.g.drawingContext; }
    MAP.ctx.setTransform(1, 0, 0, 1, 0, 0); MAP.ctx.clearRect(0, 0, W, H); MAP.ctx.globalAlpha = 1;
    if (inner) inner();
    flushBrush(); push(); resetMatrix(); translate(-W / 2, -H / 2); image(MAP.g, 0, 0); pop();
    MAP.proj = null;
  },
});

definePreset('mapBase', {
  label: 'Map Base', about: 'ocean, Natural Earth land with a soft shore line and coastline, optional graticule',
  meta: { version: '1.0.0', category: 'map', tags: ['map', 'land', 'ocean', 'coastline', 'world', 'geography'],
    params: { dataset: { enum: ['land50'] }, coastWidth: { min: 0, max: 8 } }, assets: [{ param: 'dataset', type: 'geo' }], layers: ['background'] },
  defaults: { dataset: 'land50', ocean: '#C9D8D6', land: '#EFE5CF', coast: '#5E5446', coastWidth: 1.4, shore: '#9DB7B6', graticule: true, graticuleColor: '#B4C6C4' },
  run(t, o) {
    const c = mapCtx(), path = d3.geoPath(MAP.proj, c), land = GEO[o.dataset].geometry, u = US();
    c.fillStyle = o.ocean;   // a globe fills only its sphere; flat projections fill the frame edge to edge
    if (MAP.proj.clipAngle && MAP.proj.clipAngle()) { c.beginPath(); path({ type: 'Sphere' }); c.fill(); } else c.fillRect(0, 0, W, H);
    if (o.graticule) { c.beginPath(); path(d3.geoGraticule10()); c.strokeStyle = o.graticuleColor; c.lineWidth = .8 * u; c.stroke(); }
    c.beginPath(); path(land);
    c.save(); c.strokeStyle = o.shore; c.globalAlpha = .55; c.lineWidth = 9 * u; c.lineJoin = 'round'; c.stroke(); c.restore();   // shallow-water halo
    c.fillStyle = o.land; c.fill();
    if (o.coastWidth > 0) { c.strokeStyle = o.coast; c.lineWidth = o.coastWidth * u; c.lineJoin = 'round'; c.stroke(); }
  },
});

// densify [lon, lat] waypoints (straight in lon/lat between stops, longitudes unwrapped across the antimeridian) and
// measure along them, cached per route
const ROUTES = new Map();
function routeOf(coords) {
  const key = JSON.stringify(coords); if (ROUTES.has(key)) return ROUTES.get(key);
  const P = [], d = [0]; let lon0 = coords[0][0];
  coords.forEach(([lon, lat], i) => {
    while (lon - lon0 > 180) lon -= 360; while (lon - lon0 < -180) lon += 360;
    if (i) { const [a, b] = P[P.length - 1], n = Math.max(1, Math.ceil(Math.hypot(lon - a, lat - b) / .5));
      for (let j = 1; j <= n; j++) { const q = [lerp(a, lon, j / n), lerp(b, lat, j / n)], p = P[P.length - 1];
        d.push(d[d.length - 1] + Math.hypot((q[0] - p[0]) * Math.cos(q[1] * Math.PI / 180), q[1] - p[1])); P.push(q); } }
    else P.push([lon, lat]);
    lon0 = lon;
  });
  const r = { P, d, total: d[d.length - 1] }; ROUTES.set(key, r); return r;
}
definePreset('routeDraw', {
  label: 'Route Draw', about: 'a route through sourced waypoints draws itself at constant geographic speed, with a moving head',
  meta: { version: '1.0.0', category: 'map', tags: ['map', 'route', 'path', 'journey', 'voyage', 'expedition', 'migration', 'trade', 'travel'],
    params: { head: { enum: ['ship', 'dot', 'none'] }, width: { min: .5, max: 20 } }, assets: [{ param: 'coords', type: 'route' }], layers: ['overlay'] },
  defaults: { coords: [[0, 0], [10, 10]], progress: [0, 1], color: '#B4432E', width: 5, dash: null, head: 'ship', headSize: 13, trail: '#B4432E55', dur: 3 },
  run(t, o) {
    const c = mapCtx(), R = routeOf(o.coords), u = US(), k = lerp(o.progress[0], o.progress[1], presetK(t, o)), goal = k * R.total;
    if (goal <= 0) return;
    let i = 1; while (i < R.P.length && R.d[i] < goal) i++;
    const pts = R.P.slice(0, i), a = R.P[i - 1], b = R.P[Math.min(i, R.P.length - 1)], f = R.d[i] > R.d[i - 1] ? (goal - R.d[i - 1]) / (R.d[i] - R.d[i - 1]) : 0;
    const end = i < R.P.length ? [lerp(a[0], b[0], clamp(f)), lerp(a[1], b[1], clamp(f))] : R.P[R.P.length - 1]; pts.push(end);
    const stroke = (col, w) => {
      c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round'; c.setLineDash(o.dash ? o.dash.map(v => v * u) : []);
      c.beginPath(); let prev = null;
      for (const ll of pts) { const p = mapVisible(ll) ? mapPt(ll) : null;
        if (p && prev && Math.abs(p[0] - prev[0]) < W / 2) c.lineTo(p[0], p[1]); else if (p) c.moveTo(p[0], p[1]); prev = p; }
      c.stroke(); c.setLineDash([]);
    };
    if (o.trail) stroke(o.trail, o.width * 2.6 * u);
    stroke(o.color, o.width * u);
    const h = mapVisible(end) && mapPt(end);
    if (h && o.head !== 'none' && k < o.progress[1] + 1e-6) {
      const s = o.headSize * u;
      if (o.head === 'ship') { c.beginPath(); c.arc(h[0], h[1], s * (1.6 + .25 * Math.sin(t * 5)), 0, TAU); c.strokeStyle = o.color + '88'; c.lineWidth = 2 * u; c.stroke(); }
      c.beginPath(); c.arc(h[0], h[1], s * (o.head === 'ship' ? .75 : .55), 0, TAU); c.fillStyle = o.color; c.fill();
      c.lineWidth = 2 * u; c.strokeStyle = '#FFF8EC'; c.stroke();
    }
  },
});

definePreset('mapMarker', {
  label: 'Map Marker', about: 'a place marker pinned to [lon, lat]: pops in (backOut), optional slow pulse ring',
  meta: { version: '1.0.0', category: 'map', tags: ['map', 'place', 'marker', 'city', 'port', 'location', 'pin'], params: { r: { min: 2, max: 60 } }, layers: ['overlay'] },
  defaults: { lonlat: [0, 0], color: '#2B2A3A', ring: '#B4432E', r: 12, pulse: true, ease: 'backOut', dur: .45 },
  run(t, o) {
    const c = mapCtx(), k = presetK(t, o); if (k <= 0 || !mapVisible(o.lonlat)) return;
    const p = mapPt(o.lonlat); if (!p) return;
    const u = US(), r = o.r * u * Math.max(0, k);
    if (o.pulse && t > o.at + o.dur) { const q = ((t - o.at - o.dur) * .6) % 1; c.beginPath(); c.arc(p[0], p[1], r * (1 + 2.2 * q), 0, TAU); c.globalAlpha = 1 - q; c.strokeStyle = o.ring; c.lineWidth = 2 * u; c.stroke(); c.globalAlpha = 1; }
    c.beginPath(); c.arc(p[0], p[1], r, 0, TAU); c.fillStyle = o.color; c.fill(); c.lineWidth = 2.5 * u; c.strokeStyle = '#FFF8EC'; c.stroke();
  },
});

definePreset('mapLabel', {
  label: 'Map Label', about: 'live text (Thai-safe) pinned to [lon, lat] with an offset; fades and rises in, optional fade out',
  meta: { version: '1.0.0', category: 'map', tags: ['map', 'label', 'text', 'place name', 'date', 'caption', 'thai'],
    params: { font: { enum: ['body', 'display'] }, align: { enum: ['left', 'center', 'right'] }, size: { min: 12, max: 160 } }, layers: ['text'] },
  defaults: { text: '', lonlat: [0, 0], dx: 18, dy: -16, size: 52, weight: 600, font: 'body', color: '#2B2A3A', halo: '#F6EFE2', align: 'left', out: null, outDur: .35, ease: 'easeOut', dur: .5 },
  run(t, o) {
    const c = mapCtx(), k = presetK(t, o), q = o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1, a = Math.min(k, q);
    if (a <= 0 || !o.text || !mapVisible(o.lonlat)) return;
    const p = mapPt(o.lonlat); if (!p) return;
    const u = US(), m = .045 * Math.min(W, H);
    c.save(); c.globalAlpha = a; c.font = fontCss({ font: o.font, weight: o.weight, size: o.size }); c.textAlign = o.align; c.textBaseline = 'alphabetic';
    // stay readable: the text box is slid inside the frame margins (never clipped by the edge), the pin stays put
    const tw = c.measureText(o.text).width, x0 = { left: 0, center: -tw / 2, right: -tw }[o.align];
    const x = clamp(p[0] + o.dx * u + x0, m, W - m - tw) - x0, y = clamp(p[1] + o.dy * u + (1 - k) * 14 * u, m + o.size * TS(), H - m);
    if (o.halo) { c.lineWidth = Math.max(3, o.size * .16) * u; c.strokeStyle = o.halo; c.lineJoin = 'round'; c.strokeText(o.text, x, y); }
    c.fillStyle = o.color; c.fillText(o.text, x, y); c.restore();
  },
});
