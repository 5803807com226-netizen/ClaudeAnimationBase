// @requires node_modules/d3-array/dist/d3-array.min.js
// @requires node_modules/d3-geo/dist/d3-geo.min.js
// @requires src/geo/land_50m.js
// @requires src/geo/countries_50m.js
// @requires src/geo/relief_mercator.js
// @requires src/geo/admin1_10m.js
// map.js: geographic capabilities for map-dominant documentaries. Real projections (d3-geo) over vendored Natural Earth
// land; every position is [longitude, latitude] in degrees, never screen pixels, so routes, labels and markers stay put
// while the geographic camera moves. The map is drawn crisp on a 2D layer, then composited (the look's grade, grain
// and paper still apply on top).
//   mapView   the geographic CAMERA: projection, centre and zoom from → to (or keys); draws its `inner` map layers
//   mapBase   ocean, land and coastline (and an optional graticule)
//   routeDraw a path through sourced [lon, lat] points that draws itself, with a moving head
//   mapMarker a place marker that pops in and pulses
//   mapLabel  live text (Thai-safe browser shaping) pinned to a place
//   mapRegion a whole country filled (modern Natural Earth borders), white edge, soft drop shadow; fades / grows in
//   mapSprite an icon (ship, truck, plane, walker) travelling along a sourced route, facing its direction of travel
//   mapTransfer  a territory changes hands: its colour sweeps from one owner's to another's, the sweep edge glowing
//   mapHighlight a territory singled out: glowing outline that pulses, optional light inner wash
//   mapPin    (in sticker.js: it needs the flags and icons) a sticker pinned to a place
// Territories (mapRegion, mapTransfer, mapHighlight) are one country (`name`) or a union of `units`: countries
// ("Laos") and provinces / states ("LAO/Champasak", src/geo/admin1_10m.js). A historical or partial territory is a
// union of modern provinces given by the manifest's sourced `data`, and the manifest says it is an approximation.
//   mapBase style 'satellite': the relief raster (tools/geo_raster.py) under a Mercator camera; mapView blur: motion
//   blur on fast camera moves (the documentary "whoosh"), proportional to how far the frame travels between frames
// Facts never live here: routes and places come from the shot manifest's sourced `data` (see
// docs/integration/SHOT_MANIFEST_SCHEMA.md). Between documented stops a route is schematic, and the manifest says so.
const MAP = { proj: null, view: null, g: null, ctx: null, relief: null, tmp: null };
if (window.GEO?.relief) (window.PRELOAD = window.PRELOAD || []).push(async () => {
  try { MAP.relief = await loadImage(GEO.relief.src); } catch (e) { console.error('map: relief raster missing: run python tools/geo_raster.py'); }
});
const mapCtx = () => { if (!MAP.proj) throw new Error('map layers must be drawn inside mapView'); return MAP.ctx; };
const MAP_PROJ = {
  naturalEarth: () => d3.geoNaturalEarth1(), mercator: () => d3.geoMercator(), equirectangular: () => d3.geoEquirectangular(),
  orthographic: () => d3.geoOrthographic().clipAngle(90),
};
// zoom 1 = the whole world spans the frame's SHORT side, so a plan frames the same core in 9:16 and 16:9 (16:9 shows more
// to the sides: re-framed, never cropped); orthographic: the globe fills the short side
function mapProjection(kind, center, zoom, rot = 0) {
  const p = (MAP_PROJ[kind] || MAP_PROJ.naturalEarth)(); p._kind = MAP_PROJ[kind] ? kind : 'naturalEarth';
  const S = Math.min(W, H), base = kind === 'orthographic' ? S / 2.1 : kind === 'naturalEarth' ? S / 5.47 : S / (2 * Math.PI);
  p.scale(base * zoom).translate([W / 2, H / 2]);
  if (kind === 'orthographic') return p.rotate([-center[0], -center[1], rot]);
  p.rotate([-center[0], 0, rot]).center([0, center[1]]);
  // keep the frame ON the map: a flat world never shows its edge (no empty band past a pole, in any aspect). Too short
  // → scale up; past the top or bottom → slide (the centre moves the least possible).
  const lim = kind === 'mercator' ? GEO_MERC_LAT : 89.9, top = p([center[0], lim])[1], bot = p([center[0], -lim])[1];
  if (bot - top < H) p.scale(p.scale() * H / (bot - top) * 1.001);
  return mapProjection.fit(p, center, lim);
}
const GEO_MERC_LAT = 82;   // the Mercator raster's latitude limit: the frame never shows past it
mapProjection.fit = (p, center, lim) => {
  const top = p([center[0], lim])[1], bot = p([center[0], -lim])[1], [tx, ty] = p.translate();
  if (top > 0) p.translate([tx, ty - top]); else if (bot < H) p.translate([tx, ty + H - bot]);
  return p;
};
// between two views: the centre travels the great circle, the zoom changes in log space (constant apparent speed);
// arc > 0 pulls back mid-move (a "fly-over"), so long jumps don't smear across the map
function mapLerpView(a, b, k, arc = 0) {
  const c = d3.geoInterpolate(a.center, b.center)(k), z = Math.exp(lerp(Math.log(a.zoom), Math.log(b.zoom), k)) * (1 - arc * Math.sin(Math.PI * k));
  return { center: c, zoom: Math.max(.05, z), rot: lerp(a.rot || 0, b.rot || 0, k) };
}
const MAP_IS_MERC = p => p?._kind === 'mercator';
const mapPt = ll => { const p = MAP.proj(ll); return p && Number.isFinite(p[0]) ? p : null; };
const mapVisible = ll => !MAP.proj.clipAngle || !MAP.proj.clipAngle() || d3.geoDistance(ll, [-MAP.proj.rotate()[0], -MAP.proj.rotate()[1]]) < Math.PI / 2 - .01;

definePreset('mapView', {
  label: 'Map Camera', about: 'geographic camera: d3-geo projection travelling (great circle) and zooming between views; draws map layers inside',
  meta: { version: '1.0.0', category: 'camera', tags: ['map', 'camera', 'geography', 'travel', 'zoom', 'pan', 'globe', 'documentary'],
    params: { projection: { enum: Object.keys(MAP_PROJ) }, arc: { min: 0, max: .8 }, blur: { min: 0, max: 2 } }, camera: 'camera', layers: ['camera'] },
  defaults: { projection: 'naturalEarth', from: { center: [0, 20], zoom: 1 }, to: { center: [0, 20], zoom: 1.2 }, keys: null, arc: 0, blur: 0, dur: 4 },
  run(t, o, inner) {
    const viewAt = tt => {
      if (o.keys) {   // [[t, {center, zoom, rot?}], ...] in shot time, each segment eased
        const K = o.keys; let i = 0; while (i + 2 < K.length && tt >= K[i + 1][0]) i++;
        const [ta, va] = K[i], [tb, vb] = K[Math.min(i + 1, K.length - 1)];
        return mapLerpView(va, vb, easeBy(o.ease)(tb > ta ? clamp((tt - ta) / (tb - ta)) : 1), o.arc);
      }
      return mapLerpView(o.from, o.to, presetK(tt, o), o.arc);
    };
    const v = viewAt(t);
    MAP.proj = mapProjection(o.projection, v.center, v.zoom, v.rot); MAP.view = v;
    // motion blur: how far the frame's content travels in one frame (pan in px + zoom change at the frame edge)
    let blurPx = 0;
    if (o.blur > 0) {
      const p0 = mapProjection(o.projection, ...(w => [w.center, w.zoom, w.rot])(viewAt(t - 1 / 24)));
      const a = p0(v.center), zr = Math.abs(Math.log(MAP.proj.scale() / p0.scale()));
      blurPx = clamp((Math.hypot(a[0] - W / 2, a[1] - H / 2) + zr * Math.hypot(W, H) / 2 - 8) * .22 * o.blur, 0, 16);
    }
    if (!MAP.g) { MAP.g = createGraphics(W, H); MAP.g.pixelDensity(1); MAP.ctx = MAP.g.drawingContext; }
    MAP.ctx.setTransform(1, 0, 0, 1, 0, 0); MAP.ctx.clearRect(0, 0, W, H); MAP.ctx.globalAlpha = 1;
    if (inner) inner();
    if (blurPx > .5) {
      if (!MAP.tmp) { MAP.tmp = document.createElement('canvas'); MAP.tmp.width = W; MAP.tmp.height = H; }
      const x = MAP.tmp.getContext('2d'); x.clearRect(0, 0, W, H); x.drawImage(MAP.ctx.canvas, 0, 0);
      MAP.ctx.save(); MAP.ctx.clearRect(0, 0, W, H); MAP.ctx.filter = `blur(${blurPx.toFixed(1)}px)`; MAP.ctx.drawImage(MAP.tmp, 0, 0); MAP.ctx.restore();
    }
    flushBrush(); push(); resetMatrix(); translate(-W / 2, -H / 2); image(MAP.g, 0, 0); pop();
    MAP.proj = null;
  },
});

definePreset('mapBase', {
  label: 'Map Base', about: 'ocean, Natural Earth land with a soft shore line and coastline, optional graticule',
  meta: { version: '1.0.0', category: 'map', tags: ['map', 'land', 'ocean', 'coastline', 'world', 'geography'],
    params: { dataset: { enum: ['land50'] }, style: { enum: ['flat', 'satellite'] }, coastWidth: { min: 0, max: 8 }, saturate: { min: 0, max: 3 }, brightness: { min: .3, max: 2 }, contrast: { min: .3, max: 2 } },
    assets: [{ param: 'dataset', type: 'geo' }], layers: ['background'] },
  defaults: { dataset: 'land50', style: 'flat', ocean: '#C9D8D6', land: '#EFE5CF', coast: '#5E5446', coastWidth: 1.4, shore: '#9DB7B6', graticule: true, graticuleColor: '#B4C6C4',
    saturate: 1, brightness: 1, contrast: 1, space: '#0E2235' },
  run(t, o) {
    const c = mapCtx(), path = d3.geoPath(MAP.proj, c), land = GEO[o.dataset].geometry, u = US();
    if (o.style === 'satellite') {   // the relief raster is Mercator: one affine draw (source-cropped to the frame), wrapped in longitude
      if (!MAP.relief) throw new Error('mapBase satellite needs src/geo/relief_mercator.jpg (python tools/geo_raster.py)');
      const filt = o.saturate !== 1 || o.brightness !== 1 || o.contrast !== 1 ? `saturate(${o.saturate}) brightness(${o.brightness}) contrast(${o.contrast})` : 'none';
      if (MAP.proj.clipAngle && MAP.proj.clipAngle()) { mapGlobeRaster(c, o, filt); if (o.coastWidth > 0) { c.beginPath(); path(land); c.strokeStyle = o.coast; c.globalAlpha = .35; c.lineWidth = o.coastWidth * u; c.stroke(); c.globalAlpha = 1; } return; }
      if (!MAP_IS_MERC(MAP.proj)) throw new Error('mapBase satellite needs mapView projection "mercator" or "orthographic"');
      c.save(); c.filter = filt;
      const R = GEO.relief, [IW, IH] = R.size, ym = Math.log(Math.tan(Math.PI / 4 + R.lat * Math.PI / 360)), f = MAP.proj.scale() * 2 * Math.PI / IW;
      const lam = -MAP.proj.rotate()[0], a = MAP.proj([lam, 0]), ix = (lam + 180) / 360 * IW, iy = ym / (2 * ym) * IH;
      for (const k of [-1, 0, 1]) {
        const dx = a[0] - ix * f + k * IW * f, dy = a[1] - iy * f;
        const sx0 = Math.max(0, -dx / f), sy0 = Math.max(0, -dy / f), sx1 = Math.min(IW, (W - dx) / f), sy1 = Math.min(IH, (H - dy) / f);
        if (sx1 > sx0 && sy1 > sy0) c.drawImage(MAP.relief.canvas || MAP.relief.elt, sx0, sy0, sx1 - sx0, sy1 - sy0, dx + sx0 * f, dy + sy0 * f, (sx1 - sx0) * f, (sy1 - sy0) * f);
      }
      c.restore();
      if (o.coastWidth > 0) { c.beginPath(); path(land); c.strokeStyle = o.coast; c.globalAlpha = .35; c.lineWidth = o.coastWidth * u; c.stroke(); c.globalAlpha = 1; }
      return;
    }
    c.fillStyle = o.ocean;   // a globe fills only its sphere; flat projections fill the frame edge to edge
    if (MAP.proj.clipAngle && MAP.proj.clipAngle()) { c.beginPath(); path({ type: 'Sphere' }); c.fill(); } else c.fillRect(0, 0, W, H);
    if (o.graticule) { c.beginPath(); path(d3.geoGraticule10()); c.strokeStyle = o.graticuleColor; c.lineWidth = .8 * u; c.stroke(); }
    c.beginPath(); path(land);
    c.save(); c.strokeStyle = o.shore; c.globalAlpha = .55; c.lineWidth = 9 * u; c.lineJoin = 'round'; c.stroke(); c.restore();   // shallow-water halo
    c.fillStyle = o.land; c.fill();
    if (o.coastWidth > 0) { c.strokeStyle = o.coast; c.lineWidth = o.coastWidth * u; c.lineJoin = 'round'; c.stroke(); }
  },
});

// the satellite raster wrapped onto the globe: every pixel of the disc is inverse-projected (orthographic) and sampled
// from the Mercator raster, at most 720 px across then scaled up; a soft limb shade gives the sphere its volume
function mapGlobeRaster(c, o, filt) {
  const R = GEO.relief, [IW, IH] = R.size, el = MAP.relief.canvas || MAP.relief.elt;
  if (!MAP.reliefPx) { const cv = document.createElement('canvas'); cv.width = IW; cv.height = IH; const x = cv.getContext('2d', { willReadFrequently: true }); x.drawImage(el, 0, 0); MAP.reliefPx = x.getImageData(0, 0, IW, IH).data; }
  const P = MAP.proj, sc = P.scale(), [tx, ty] = P.translate(), [rl, rp, rg] = P.rotate(), l0 = -rl * Math.PI / 180, p0 = -rp * Math.PI / 180, g0 = (rg || 0) * Math.PI / 180;
  const D = Math.min(720, Math.ceil(sc * 2));
  if (!MAP.globe || MAP.globe.width !== D) { MAP.globe = document.createElement('canvas'); MAP.globe.width = MAP.globe.height = D; }
  const gx = MAP.globe.getContext('2d'), img = gx.createImageData(D, D), out = img.data, src = MAP.reliefPx;
  const ym = Math.log(Math.tan(Math.PI / 4 + R.lat * Math.PI / 360)), sp = Math.sin(p0), cp = Math.cos(p0), cg = Math.cos(g0), sg = Math.sin(g0);
  for (let j = 0; j < D; j++) for (let i = 0; i < D; i++) {
    let x = (i + .5) / D * 2 - 1, y = 1 - (j + .5) / D * 2; const rho = Math.hypot(x, y); if (rho >= 1) continue;
    [x, y] = [x * cg + y * sg, -x * sg + y * cg];   // undo the view's roll
    const cc = Math.asin(rho), sc_ = Math.sin(cc), co = Math.cos(cc);
    const lat = rho ? Math.asin(co * sp + y * sc_ * cp / rho) : p0, lon = l0 + (rho ? Math.atan2(x * sc_, rho * co * cp - y * sc_ * sp) : 0);
    const u = ((lon * 180 / Math.PI + 180) / 360 % 1 + 1) % 1, my = Math.log(Math.tan(Math.PI / 4 + clamp(lat, -1.43, 1.43) / 2));
    const si = (Math.min(IH - 1, Math.max(0, Math.floor((ym - my) / (2 * ym) * IH))) * IW + Math.floor(u * IW)) * 4, di = (j * D + i) * 4, sh = .62 + .38 * co;
    out[di] = src[si] * sh; out[di + 1] = src[si + 1] * sh; out[di + 2] = src[si + 2] * sh; out[di + 3] = 255;
  }
  gx.putImageData(img, 0, 0);
  c.save(); c.filter = filt; c.imageSmoothingQuality = 'high'; c.drawImage(MAP.globe, tx - sc, ty - sc, sc * 2, sc * 2); c.restore();
}

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
  defaults: { coords: [[0, 0], [10, 10]], progress: [0, 1], color: '#B4432E', width: 5, dash: null, head: 'ship', headSize: 13, trail: '#B4432E55', glow: null, dur: 3 },
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
    if (o.glow) { c.save(); c.shadowColor = o.glow; c.shadowBlur = o.width * 4 * u; stroke(o.color, o.width * u); c.restore(); }   // a lit, glowing line
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

// a territory's geometries: `units` (countries and "<ISO3>/<province>") or the single country `name`
function mapUnits(o, who) {
  const list = o.units?.length ? o.units : [o.name];
  return list.map(n => { const g = String(n).includes('/') ? GEO.admin1?.[n] : GEO.countries50[n];
    if (!g) throw new Error(`${who}: no area "${n}" (countries: Natural Earth English names, e.g. "Vietnam"; provinces: "<ISO3>/<name>" from src/geo/admin1_10m.js, rebuild with tools/geo_build.mjs --admin1=… --countries=…)`);
    return g; });
}
const mapTrace = (c, gs) => { const path = d3.geoPath(MAP.proj, c); c.beginPath(); for (const g of gs) path(g); };
// the OUTER edge of a union of areas (no lines between the provinces inside it): stroke every area at twice the width
// on a scratch layer, then cut the union's interior away, which removes the inner half of the edge and every
// internal border; `glow` adds a coloured blur around it
function mapEdge(c, gs, width, color, alpha = 1, glow = 0) {
  if (!MAP.tmp2) { MAP.tmp2 = document.createElement('canvas'); MAP.tmp2.width = W; MAP.tmp2.height = H; }
  const x = MAP.tmp2.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H);
  mapTrace(x, gs); x.lineJoin = 'round'; x.lineWidth = width * 2; x.strokeStyle = color; x.stroke();
  x.globalCompositeOperation = 'destination-out'; mapTrace(x, gs); x.fill(); x.globalCompositeOperation = 'source-over';
  c.save(); c.globalAlpha = alpha; if (glow > 0) { c.shadowColor = color; c.shadowBlur = glow; } c.drawImage(MAP.tmp2, 0, 0); c.restore();
}
// screen box of a territory (for sweeps)
const mapBox = gs => { const b = d3.geoPath(MAP.proj).bounds({ type: 'GeometryCollection', geometries: gs }); return { x0: b[0][0], y0: b[0][1], x1: b[1][0], y1: b[1][1] }; };

definePreset('mapRegion', {
  label: 'Map Region', about: 'a territory filled with a colour, white outer edge and soft drop shadow: one country (modern Natural Earth admin-0), or units = a union of countries and provinces (historical or partial territories); fades in, optional fade out',
  meta: { version: '1.1.0', category: 'map', tags: ['map', 'country', 'region', 'territory', 'highlight', 'border', 'fill', 'nation', 'province', 'historical', 'empire', 'colony'],
    params: { alpha: { min: 0, max: 1 }, edge: { min: 0, max: 10 } }, assets: [{ param: 'name', type: 'geo' }, { param: 'units', type: 'geo' }], layers: ['overlay'] },
  defaults: { name: 'Spain', units: [], color: '#D8332A', alpha: .85, edge: 2.4, edgeColor: '#FFFFFF', shadow: true, out: null, outDur: .4, ease: 'easeOut', dur: .6 },
  run(t, o) {
    const gs = mapUnits(o, 'mapRegion'), c = mapCtx(), k = presetK(t, o), q = o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1, a = Math.min(k, q); if (a <= 0) return;
    const u = US();
    c.save(); mapTrace(c, gs);
    if (o.shadow) { c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 16 * u; c.shadowOffsetY = 7 * u; }
    c.globalAlpha = o.alpha * a; c.fillStyle = o.color; c.fill(); c.restore();
    if (o.edge > 0) mapEdge(c, gs, o.edge * u, o.edgeColor, a);
  },
});

definePreset('mapTransfer', {
  label: 'Map Territory Transfer', about: 'a territory changes hands: filled in the old owner\'s colour, the new colour sweeps across it (direction dir) with a glowing front, then a white flash on its edge; for cessions, annexations, conquests',
  meta: { version: '1.0.0', category: 'map', tags: ['map', 'territory', 'cession', 'annexation', 'conquest', 'border change', 'treaty', 'history', 'colony', 'lost land'],
    params: { dir: { enum: ['left', 'right', 'up', 'down'] }, alpha: { min: 0, max: 1 }, edge: { min: 0, max: 10 } }, assets: [{ param: 'units', type: 'geo' }], layers: ['overlay'] },
  defaults: { name: 'Laos', units: [], from: '#E8C547', to: '#3E6FD0', dir: 'right', alpha: .9, edge: 2.4, edgeColor: '#FFFFFF', flash: true, out: null, outDur: .4, ease: 'ease', dur: 1.2 },
  run(t, o) {
    const gs = mapUnits(o, 'mapTransfer'), c = mapCtx(), u = US(), q = o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1; if (q <= 0) return;
    const k = clamp((t - o.at) / o.dur), e = k * k * (3 - 2 * k), B = mapBox(gs);
    c.save(); c.globalAlpha = o.alpha * q; mapTrace(c, gs); c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 16 * u; c.shadowOffsetY = 7 * u;
    c.fillStyle = o.from; c.fill(); c.restore();
    if (e > 0) {   // the new owner's colour, clipped to the sweep (a half-plane moving across the territory's box)
      const pad = 40 * u, R = { right: [B.x0 - pad, B.y0 - pad, (B.x1 - B.x0 + 2 * pad) * e, B.y1 - B.y0 + 2 * pad], left: [B.x1 + pad - (B.x1 - B.x0 + 2 * pad) * e, B.y0 - pad, (B.x1 - B.x0 + 2 * pad) * e, B.y1 - B.y0 + 2 * pad],
        down: [B.x0 - pad, B.y0 - pad, B.x1 - B.x0 + 2 * pad, (B.y1 - B.y0 + 2 * pad) * e], up: [B.x0 - pad, B.y1 + pad - (B.y1 - B.y0 + 2 * pad) * e, B.x1 - B.x0 + 2 * pad, (B.y1 - B.y0 + 2 * pad) * e] }[o.dir];
      c.save(); c.beginPath(); c.rect(...R); c.clip(); mapTrace(c, gs); c.globalAlpha = o.alpha * q; c.fillStyle = o.to; c.fill(); c.restore();
      if (e < 1) {   // the glowing front, inside the territory
        const fx = { right: R[0] + R[2], left: R[0], down: null, up: null }[o.dir], fy = { down: R[1] + R[3], up: R[1] }[o.dir];
        c.save(); mapTrace(c, gs); c.clip(); c.strokeStyle = '#FFFFFF'; c.lineWidth = 6 * u; c.shadowColor = '#FFFFFF'; c.shadowBlur = 18 * u; c.globalAlpha = .9 * q; c.beginPath();
        if (fx != null) { c.moveTo(fx, B.y0 - pad); c.lineTo(fx, B.y1 + pad); } else { c.moveTo(B.x0 - pad, fy); c.lineTo(B.x1 + pad, fy); } c.stroke(); c.restore();
      }
    }
    if (o.edge > 0) mapEdge(c, gs, o.edge * u, o.edgeColor, q);
    if (o.flash && k >= 1) { const f = clamp(1 - (t - o.at - o.dur) / .5); if (f > 0) mapEdge(c, gs, 5 * u, '#FFFFFF', f * q, 22 * u); }
  },
});

definePreset('mapHighlight', {
  label: 'Map Highlight', about: 'singles out a territory (country or union of provinces): a glowing outline that pulses and an optional light wash inside; "the important part", "the heartland", a battle zone',
  meta: { version: '1.0.0', category: 'map', tags: ['map', 'highlight', 'focus', 'territory', 'emphasis', 'glow', 'outline', 'pulse', 'core', 'zone'],
    params: { width: { min: 1, max: 14 }, wash: { min: 0, max: 1 }, pulse: { min: 0, max: 3 } }, assets: [{ param: 'units', type: 'geo' }], layers: ['overlay'] },
  defaults: { name: 'Thailand', units: [], color: '#FFF3A6', width: 4, wash: .35, pulse: 1, out: null, outDur: .4, ease: 'easeOut', dur: .5 },
  run(t, o) {
    const gs = mapUnits(o, 'mapHighlight'), c = mapCtx(), u = US(), k = presetK(t, o), q = o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1, a = Math.min(k, q); if (a <= 0) return;
    const p = o.pulse > 0 ? .5 + .5 * Math.sin((t - o.at) * Math.PI * 2 * .8 * o.pulse) : 1;
    if (o.wash > 0) { c.save(); mapTrace(c, gs); c.globalAlpha = o.wash * a * (.75 + .25 * p); c.fillStyle = o.color; c.fill(); c.restore(); }
    mapEdge(c, gs, o.width * u, o.color, a, (10 + 16 * p) * u);
  },
});

// icons painted as small vector symbols (infographic marks, like markers: not scene artwork); facing +x, centred
const MAP_ICONS = {
  ship(c, s, col, ink) {   // a carrack: hull, mast, two square sails
    c.fillStyle = col; c.strokeStyle = ink; c.lineWidth = s * .06; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(-.55 * s, -.05 * s); c.lineTo(.6 * s, -.05 * s); c.lineTo(.4 * s, .22 * s); c.lineTo(-.42 * s, .22 * s); c.closePath(); c.fillStyle = '#7A4E2D'; c.fill(); c.stroke();
    c.beginPath(); c.moveTo(0, -.05 * s); c.lineTo(0, -.75 * s); c.stroke();
    for (const [y, w] of [[-.68, .28], [-.36, .36]]) { c.beginPath(); c.rect(-w * s, y * s, w * 2 * s, .28 * s); c.fillStyle = col; c.fill(); c.stroke(); }
  },
  truck(c, s, col, ink) { c.fillStyle = col; c.strokeStyle = ink; c.lineWidth = s * .06; c.beginPath(); c.rect(-.55 * s, -.35 * s, .7 * s, .45 * s); c.rect(.18 * s, -.2 * s, .32 * s, .3 * s); c.fill(); c.stroke();
    for (const x of [-.35, .3]) { c.beginPath(); c.arc(x * s, .14 * s, .12 * s, 0, TAU); c.fillStyle = ink; c.fill(); } },
  plane(c, s, col, ink) { c.fillStyle = col; c.strokeStyle = ink; c.lineWidth = s * .05; c.beginPath();
    c.moveTo(.6 * s, 0); c.lineTo(-.5 * s, -.08 * s); c.lineTo(-.5 * s, .08 * s); c.closePath(); c.moveTo(.1 * s, 0); c.lineTo(-.15 * s, -.55 * s); c.lineTo(-.25 * s, -.55 * s); c.lineTo(-.15 * s, 0);
    c.lineTo(-.25 * s, .55 * s); c.lineTo(-.15 * s, .55 * s); c.closePath(); c.fill(); c.stroke(); },
  walker(c, s, col, ink) { c.fillStyle = col; c.strokeStyle = ink; c.lineWidth = s * .06; c.beginPath(); c.arc(0, -.45 * s, .16 * s, 0, TAU); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(0, -.28 * s); c.lineTo(0, .1 * s); c.moveTo(0, .1 * s); c.lineTo(-.15 * s, .45 * s); c.moveTo(0, .1 * s); c.lineTo(.15 * s, .45 * s); c.moveTo(-.2 * s, -.1 * s); c.lineTo(.2 * s, -.1 * s); c.stroke(); },
};
definePreset('mapSprite', {
  label: 'Map Sprite', about: 'an icon (ship, truck, plane, walker) travelling along a sourced route at constant geographic speed, facing its heading, with a gentle bob',
  meta: { version: '1.0.0', category: 'map', tags: ['map', 'icon', 'ship', 'vehicle', 'plane', 'troops', 'travel', 'journey', 'voyage', 'move'],
    params: { icon: { enum: Object.keys(MAP_ICONS) }, size: { min: 8, max: 220 }, bob: { min: 0, max: 3 } }, assets: [{ param: 'coords', type: 'route' }], layers: ['overlay'] },
  defaults: { coords: [[0, 0], [10, 10]], progress: [0, 1], icon: 'ship', size: 56, color: '#F4EDE0', ink: '#2B2A3A', bob: 1, ease: 'linear', dur: 3 },
  run(t, o) {
    const c = mapCtx(), R = routeOf(o.coords), at = g => { let i = 1; while (i < R.P.length - 1 && R.d[i] < g) i++;
      const f = R.d[i] > R.d[i - 1] ? clamp((g - R.d[i - 1]) / (R.d[i] - R.d[i - 1])) : 0; return [lerp(R.P[i - 1][0], R.P[i][0], f), lerp(R.P[i - 1][1], R.P[i][1], f)]; };
    const g = lerp(o.progress[0], o.progress[1], presetK(t, o)) * R.total, ll = at(g), ahead = at(Math.min(R.total, g + .4)), back = at(Math.max(0, g - .4));
    if (!mapVisible(ll)) return; const p = mapPt(ll), p1 = mapPt(ahead), p0 = mapPt(back); if (!p || !p1 || !p0) return;
    const hd = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]), left = Math.cos(hd) < 0, u = US(), s = o.size * u;
    c.save(); c.translate(p[0], p[1] - s * .35 + Math.sin(t * 5.5) * 2.5 * o.bob * u);
    c.rotate(o.icon === 'plane' ? hd : clamp(left ? hd - Math.PI : hd, -.35, .35)); if (left && o.icon !== 'plane') c.scale(-1, 1);   // never upside down
    c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 8 * u; c.shadowOffsetY = 4 * u;
    MAP_ICONS[o.icon](c, s, o.color, o.ink); c.restore();
  },
});
