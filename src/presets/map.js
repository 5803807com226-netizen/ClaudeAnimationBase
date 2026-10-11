// @requires node_modules/d3-array/dist/d3-array.min.js
// @requires node_modules/d3-geo/dist/d3-geo.min.js
// @requires src/geo/land_50m.js
// @requires src/geo/countries_50m.js
// @requires src/geo/countries_10m.js
// @requires src/geo/relief_mercator.js
// @requires src/geo/tiles_satellite.js
// @requires src/geo/tiles_physical.js
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
//   mapBase style 'satellite' (documentary colour) or 'physical' (clean atlas relief, the sharpest): Mercator rasters
//   with sharp tiles for close shots (tools/geo_raster_hi.py), also wrapped on the globe; mapView blur: motion
//   blur on fast camera moves (the documentary "whoosh"), proportional to how far the frame travels between frames
// Facts never live here: routes and places come from the shot manifest's sourced `data` (see
// docs/integration/SHOT_MANIFEST_SCHEMA.md). Between documented stops a route is schematic, and the manifest says so.
const MAP = { proj: null, view: null, g: null, ctx: null, relief: null, tmp: null };
// raster styles: 'satellite' and 'physical', each a sharp tile level (tools/geo_raster_hi.py) with its own 4096 px
// overview for wide shots; 'satellite' falls back to the overview alone (tools/geo_raster.py) when it has no tiles.
// MAP.ras[style] = { img (overview), R (its lat and size), hi (tile level or null) }
MAP.ras = {};
if (window.GEO?.relief || window.GEO?.tiles) (window.PRELOAD = window.PRELOAD || []).push(async () => {
  for (const [st, T] of Object.entries(GEO.tiles || {}))
    try { const img = await loadImage(T.overview); MAP.ras[st] = { img, R: { lat: T.lat, size: [img.width, img.height] }, hi: T }; } catch (e) { console.error(`map: ${st} tiles missing: run python tools/geo_raster_hi.py --style ${st}`); }
  if (!MAP.ras.satellite && GEO.relief) try { MAP.ras.satellite = { img: await loadImage(GEO.relief.src), R: GEO.relief, hi: null }; } catch (e) { console.error('map: relief raster missing: run python tools/geo_raster.py'); }
});
// sharp tiles load on demand: a frame that reaches one not loaded yet draws the overview there, then (core.js
// AFTER_DRAW) loads it and draws the frame again. At most MAP_TILE_MAX stay in memory (least recently used go first).
const MAP_TILE_MAX = 96, MAP_TILES = new Map(), MAP_WANT = new Set();
(window.AFTER_DRAW = window.AFTER_DRAW || []).push(async () => {
  if (!MAP_WANT.size) return false;
  const keys = [...MAP_WANT]; MAP_WANT.clear();
  await Promise.all(keys.map(k => new Promise(ok => { const im = new Image(); im.onload = () => { MAP_TILES.set(k, { im, used: 0 }); ok(); }; im.onerror = () => { MAP_TILES.set(k, { im: null, used: 0 }); console.error('map: tile missing ' + k); ok(); }; im.src = k; })));
  if (MAP_TILES.size > MAP_TILE_MAX) [...MAP_TILES].sort((a, b) => a[1].used - b[1].used).slice(0, MAP_TILES.size - MAP_TILE_MAX).forEach(([k]) => MAP_TILES.delete(k));
  return true;
});
let MAP_TICK = 0;
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
    MAP.obst = []; MAP.labels = [];
    if (inner) inner();
    mapPlaceLabels();
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
    params: { dataset: { enum: ['land50'] }, style: { enum: ['flat', 'satellite', 'physical'] }, coastWidth: { min: 0, max: 8 }, saturate: { min: 0, max: 3 }, brightness: { min: .3, max: 2 }, contrast: { min: .3, max: 2 } },
    assets: [{ param: 'dataset', type: 'geo' }], layers: ['background'] },
  defaults: { dataset: 'land50', style: 'flat', ocean: '#C9D8D6', land: '#EFE5CF', coast: '#5E5446', coastWidth: 1.4, shore: '#9DB7B6', graticule: true, graticuleColor: '#B4C6C4',
    saturate: 1, brightness: 1, contrast: 1, space: '#0E2235' },
  run(t, o) {
    const c = mapCtx(), path = d3.geoPath(MAP.proj, c), land = GEO[o.dataset].geometry, u = US();
    if (o.style === 'satellite' || o.style === 'physical') {   // a Mercator raster: one affine draw (source-cropped to the frame), wrapped in longitude
      const X = MAP.ras[o.style];
      if (!X) throw new Error(`mapBase ${o.style} needs its raster (python tools/geo_raster_hi.py --style ${o.style})`);
      const filt = o.saturate !== 1 || o.brightness !== 1 || o.contrast !== 1 ? `saturate(${o.saturate}) brightness(${o.brightness}) contrast(${o.contrast})` : 'none';
      // the raster has its own crisp coastline: a vector coast (1:50m) over it would only blur it
      if (MAP.proj.clipAngle && MAP.proj.clipAngle()) { const L = mapLevel(X); if (L) mapGlobeHi(c, X, L, filt); else mapGlobeRaster(c, X, filt); return; }
      if (!MAP_IS_MERC(MAP.proj)) throw new Error(`mapBase ${o.style} needs mapView projection "mercator" or "orthographic"`);
      c.save(); c.filter = filt;
      const L = mapLevel(X); if (L) { mapHiTiles(c, X, L); c.restore(); return; }
      const R = X.R, [IW, IH] = R.size, ym = Math.log(Math.tan(Math.PI / 4 + R.lat * Math.PI / 360)), f = MAP.proj.scale() * 2 * Math.PI / IW;
      const lam = -MAP.proj.rotate()[0], a = MAP.proj([lam, 0]), ix = (lam + 180) / 360 * IW, iy = ym / (2 * ym) * IH;
      for (const k of [-1, 0, 1]) {
        const dx = a[0] - ix * f + k * IW * f, dy = a[1] - iy * f;
        const sx0 = Math.max(0, -dx / f), sy0 = Math.max(0, -dy / f), sx1 = Math.min(IW, (W - dx) / f), sy1 = Math.min(IH, (H - dy) / f);
        if (sx1 > sx0 && sy1 > sy0) c.drawImage(X.img.canvas || X.img.elt, sx0, sy0, sx1 - sx0, sy1 - sy0, dx + sx0 * f, dy + sy0 * f, (sx1 - sx0) * f, (sy1 - sy0) * f);
      }
      c.restore();
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

// the tile level a shot needs: none (the overview) while the overview is sharp enough, else the coarsest level at least
// as fine as the frame (the camera's world width in px: 2π·scale, Mercator and globe alike)
function mapLevel(X) {
  const need = MAP.proj.scale() * 2 * Math.PI;
  if (!X.hi || need < X.R.size[0] * 1.15) return null;
  return X.hi.levels.find(l => l.size[0] >= need * .9) || X.hi.levels[X.hi.levels.length - 1];
}
// close Mercator shots: the tiles the frame shows (wrapped in longitude), each placed by the same affine map as the
// overview; a tile still loading is drawn from the overview for this frame (core.js draws the frame again)
function mapHiTiles(c, X, Hm) {
  const [HW, HH] = Hm.size, TS = Hm.tile, f = MAP.proj.scale() * 2 * Math.PI / HW;
  const lam = -MAP.proj.rotate()[0], a = MAP.proj([lam, 0]), dx = a[0] - (lam + 180) / 360 * HW * f, dy = a[1] - HH / 2 * f;
  const k = X.R.size[0] / HW, ov = X.img.canvas || X.img.elt, tick = ++MAP_TICK;
  const c0 = Math.floor(-dx / f / TS), c1 = Math.floor((W - dx) / f / TS), r0 = Math.max(0, Math.floor(-dy / f / TS)), r1 = Math.min(Hm.rows - 1, Math.floor((H - dy) / f / TS));
  c.imageSmoothingQuality = 'high';
  for (let r = r0; r <= r1; r++) for (let cc = c0; cc <= c1; cc++) {
    const col = ((cc % Hm.cols) + Hm.cols) % Hm.cols, key = `${Hm.dir}/${r}_${col}.jpg`, tw = Math.min(TS, HW - col * TS), th = Math.min(TS, HH - r * TS);
    const x = dx + cc * TS * f, y = dy + r * TS * f, e = .75;   // a hair of overlap hides seams between tiles
    const t = MAP_TILES.get(key);
    if (t?.im) { t.used = tick; c.drawImage(t.im, x, y, tw * f + e, th * f + e); continue; }
    if (!t) MAP_WANT.add(key);
    c.drawImage(ov, col * TS * k, r * TS * k, tw * k, th * k, x, y, tw * f + e, th * f + e);
  }
}
// beyond the raster's latitude limit (±82°) a globe shows a flat polar cap, the mean of the raster's edge row, blended
// in over the last 3° (sampling the clamped edge row would streak toward the pole)
function mapCaps(X) {
  if (!X.caps) {   // the edge row's most common colour (the polar sea in the north, the ice sheet in the south), not its mean
    const [IW, IH] = X.R.size, row = y => { const bins = new Map(); let best = null;
      for (let i = 0; i < IW; i++) { const j = (y * IW + i) * 4, key = (X.px[j] >> 4) << 8 | (X.px[j + 1] >> 4) << 4 | X.px[j + 2] >> 4, b = bins.get(key) || { n: 0, s: [0, 0, 0] };
        b.n++; for (let k = 0; k < 3; k++) b.s[k] += X.px[j + k]; bins.set(key, b); if (!best || b.n > best.n) best = b; }
      return best.s.map(v => v / best.n); };
    X.caps = [row(1), row(IH - 2)];
  }
  return X.caps;
}
const MAP_CAP = (lat, L) => clamp((Math.abs(lat) * 180 / Math.PI - (L - 3)) / 3, 0, 1);

// pixels of a loaded tile (read once, kept with it)
function mapTilePx(t) {
  if (!t.px) { const cv = document.createElement('canvas'); cv.width = t.im.width; cv.height = t.im.height; const x = cv.getContext('2d', { willReadFrequently: true }); x.drawImage(t.im, 0, 0); t.px = x.getImageData(0, 0, cv.width, cv.height).data; t.w = cv.width; t.h = cv.height; }
  return t;
}
// close globe shots: every frame pixel on the sphere is inverse-projected (orthographic) and sampled (bilinear) from the
// tile level, at the frame's own resolution; tiles still loading sample the overview this time
function mapGlobeHi(c, X, Hm, filt) {
  const P = MAP.proj, sc = P.scale(), [tx, ty] = P.translate(), [rl, rp, rg] = P.rotate(), l0 = -rl * Math.PI / 180, p0 = -rp * Math.PI / 180, g0 = (rg || 0) * Math.PI / 180;
  const bx0 = Math.max(0, Math.floor(tx - sc)), by0 = Math.max(0, Math.floor(ty - sc)), bx1 = Math.min(W, Math.ceil(tx + sc)), by1 = Math.min(H, Math.ceil(ty + sc)), BW = bx1 - bx0, BH = by1 - by0;
  if (BW <= 0 || BH <= 0) return;
  if (!X.px) { const [IW, IH] = X.R.size, cv = document.createElement('canvas'); cv.width = IW; cv.height = IH; const x = cv.getContext('2d', { willReadFrequently: true }); x.drawImage(X.img.canvas || X.img.elt, 0, 0); X.px = x.getImageData(0, 0, IW, IH).data; }
  if (!MAP.globeHi || MAP.globeHi.width !== BW || MAP.globeHi.height !== BH) { MAP.globeHi = document.createElement('canvas'); MAP.globeHi.width = BW; MAP.globeHi.height = BH; }
  const gx = MAP.globeHi.getContext('2d'), img = gx.createImageData(BW, BH), out = img.data, caps = mapCaps(X);
  const [HW, HH] = Hm.size, TS = Hm.tile, [IW, IH] = X.R.size, ov = X.px, k = IW / HW, tick = ++MAP_TICK, tp = new Array(Hm.rows * Hm.cols);
  const ym = Math.log(Math.tan(Math.PI / 4 + X.R.lat * Math.PI / 360)), sp = Math.sin(p0), cp = Math.cos(p0), cg = Math.cos(g0), sg = Math.sin(g0);
  const tile = (r, col) => { const i = r * Hm.cols + col; let v = tp[i]; if (v !== undefined) return v;
    const key = `${Hm.dir}/${r}_${col}.jpg`, t = MAP_TILES.get(key); if (!t) MAP_WANT.add(key);
    v = tp[i] = t?.im ? mapTilePx(t) : null; if (v) v.used = tick; return v; };
  for (let j = 0; j < BH; j++) for (let i = 0; i < BW; i++) {
    let x = (bx0 + i + .5 - tx) / sc, y = (ty - (by0 + j + .5)) / sc; const rho = Math.hypot(x, y); if (rho >= 1) continue;
    [x, y] = [x * cg + y * sg, -x * sg + y * cg];   // undo the view's roll
    const cc = Math.asin(rho), sc_ = Math.sin(cc), co = Math.cos(cc);
    const lat = rho ? Math.asin(co * sp + y * sc_ * cp / rho) : p0, lon = l0 + (rho ? Math.atan2(x * sc_, rho * co * cp - y * sc_ * sp) : 0);
    const u = ((lon * 180 / Math.PI + 180) / 360 % 1 + 1) % 1, my = Math.log(Math.tan(Math.PI / 4 + clamp(lat, -1.43, 1.43) / 2));
    const U = u * HW - .5, V = Math.min(HH - 1, Math.max(0, (ym - my) / (2 * ym) * HH - .5)), di = (j * BW + i) * 4, sh = .62 + .38 * co;
    const col = Math.min(Hm.cols - 1, Math.max(0, Math.floor((U + .5) / TS))), r = Math.min(Hm.rows - 1, Math.floor((V + .5) / TS)), t = tile(r, col);
    let R_, G_, B_;
    if (t) {   // bilinear inside the tile (clamped at its edge)
      const lx = Math.min(t.w - 1, Math.max(0, U - col * TS)), ly = Math.min(t.h - 1, Math.max(0, V - r * TS)), x0 = Math.floor(lx), y0 = Math.floor(ly), x1 = Math.min(t.w - 1, x0 + 1), y1 = Math.min(t.h - 1, y0 + 1), fx = lx - x0, fy = ly - y0, d = t.px;
      const a = (y0 * t.w + x0) * 4, b = (y0 * t.w + x1) * 4, e = (y1 * t.w + x0) * 4, g = (y1 * t.w + x1) * 4, w0 = (1 - fx) * (1 - fy), w1 = fx * (1 - fy), w2 = (1 - fx) * fy, w3 = fx * fy;
      R_ = d[a] * w0 + d[b] * w1 + d[e] * w2 + d[g] * w3; G_ = d[a + 1] * w0 + d[b + 1] * w1 + d[e + 1] * w2 + d[g + 1] * w3; B_ = d[a + 2] * w0 + d[b + 2] * w1 + d[e + 2] * w2 + d[g + 2] * w3;
    } else { const si = (Math.min(IH - 1, Math.floor(V * k)) * IW + Math.min(IW - 1, Math.floor(Math.max(0, U) * k))) * 4; R_ = ov[si]; G_ = ov[si + 1]; B_ = ov[si + 2]; }
    const q = MAP_CAP(lat, X.R.lat); if (q > 0) { const cap = caps[lat > 0 ? 0 : 1]; R_ += (cap[0] - R_) * q; G_ += (cap[1] - G_) * q; B_ += (cap[2] - B_) * q; }
    out[di] = R_ * sh; out[di + 1] = G_ * sh; out[di + 2] = B_ * sh; out[di + 3] = 255;
  }
  gx.putImageData(img, 0, 0);
  c.save(); c.filter = filt; c.drawImage(MAP.globeHi, bx0, by0); c.restore();
}

// the satellite raster wrapped onto the globe: every pixel of the disc is inverse-projected (orthographic) and sampled
// from the Mercator raster, at most 1080 px across then scaled up; a soft limb shade gives the sphere its volume
function mapGlobeRaster(c, X, filt) {
  const R = X.R, [IW, IH] = R.size, el = X.img.canvas || X.img.elt;
  if (!X.px) { const cv = document.createElement('canvas'); cv.width = IW; cv.height = IH; const x = cv.getContext('2d', { willReadFrequently: true }); x.drawImage(el, 0, 0); X.px = x.getImageData(0, 0, IW, IH).data; }
  const P = MAP.proj, sc = P.scale(), [tx, ty] = P.translate(), [rl, rp, rg] = P.rotate(), l0 = -rl * Math.PI / 180, p0 = -rp * Math.PI / 180, g0 = (rg || 0) * Math.PI / 180;
  const D = Math.min(1080, Math.ceil(sc * 2));
  if (!MAP.globe || MAP.globe.width !== D) { MAP.globe = document.createElement('canvas'); MAP.globe.width = MAP.globe.height = D; }
  const gx = MAP.globe.getContext('2d'), img = gx.createImageData(D, D), out = img.data, src = X.px, caps = mapCaps(X);
  const ym = Math.log(Math.tan(Math.PI / 4 + R.lat * Math.PI / 360)), sp = Math.sin(p0), cp = Math.cos(p0), cg = Math.cos(g0), sg = Math.sin(g0);
  for (let j = 0; j < D; j++) for (let i = 0; i < D; i++) {
    let x = (i + .5) / D * 2 - 1, y = 1 - (j + .5) / D * 2; const rho = Math.hypot(x, y); if (rho >= 1) continue;
    [x, y] = [x * cg + y * sg, -x * sg + y * cg];   // undo the view's roll
    const cc = Math.asin(rho), sc_ = Math.sin(cc), co = Math.cos(cc);
    const lat = rho ? Math.asin(co * sp + y * sc_ * cp / rho) : p0, lon = l0 + (rho ? Math.atan2(x * sc_, rho * co * cp - y * sc_ * sp) : 0);
    const u = ((lon * 180 / Math.PI + 180) / 360 % 1 + 1) % 1, my = Math.log(Math.tan(Math.PI / 4 + clamp(lat, -1.43, 1.43) / 2));
    const si = (Math.min(IH - 1, Math.max(0, Math.floor((ym - my) / (2 * ym) * IH))) * IW + Math.floor(u * IW)) * 4, di = (j * D + i) * 4, sh = .62 + .38 * co;
    let R_ = src[si], G_ = src[si + 1], B_ = src[si + 2]; const q = MAP_CAP(lat, R.lat); if (q > 0) { const cap = caps[lat > 0 ? 0 : 1]; R_ += (cap[0] - R_) * q; G_ += (cap[1] - G_) * q; B_ += (cap[2] - B_) * q; }
    out[di] = R_ * sh; out[di + 1] = G_ * sh; out[di + 2] = B_ * sh; out[di + 3] = 255;
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

// the military campaign arrow: a thick tapered arrow in a side's colour grows from where an advance starts to its
// target, along sourced waypoints (two points + bend: one smooth curve on screen); white edge and drop shadow
definePreset('mapArrow', {
  label: 'Map Attack Arrow', about: 'an advance, invasion or offensive: a thick tapered arrow in the side\'s colour grows from the start to the target (coords: sourced [lon, lat] waypoints; with two points, bend curves it), white edge and soft shadow; one arrow says "who attacks where" without any text',
  meta: { version: '1.0.0', category: 'map', tags: ['map', 'arrow', 'attack', 'invasion', 'offensive', 'advance', 'campaign', 'war', 'military', 'front', 'landing'],
    params: { width: { min: 8, max: 120 }, bend: { min: -1, max: 1 }, alpha: { min: 0, max: 1 } }, assets: [{ param: 'coords', type: 'route' }], layers: ['overlay'] },
  defaults: { coords: [[13.4, 52.5], [21, 52.2]], bend: .25, width: 34, color: '#B3302B', edge: '#FFFFFF', alpha: .95, out: null, outDur: .4, ease: 'easeInOut', dur: 1 },
  run(t, o) {
    const k = presetK(t, o), q = o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1; if (k <= 0 || q <= 0) return;
    const c = mapCtx(), u = US(), Wd = o.width * u;
    // screen polyline: two points → a quadratic curve bent sideways; more → the densified route
    let P;
    if (o.coords.length === 2) {
      const a = mapPt(o.coords[0]), b = mapPt(o.coords[1]); if (!a || !b) return;
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), cx = mx - dy / (L || 1) * L * .35 * o.bend, cy = my + dx / (L || 1) * L * .35 * o.bend;
      P = []; for (let i = 0; i <= 48; i++) { const s = i / 48; P.push([(1 - s) ** 2 * a[0] + 2 * (1 - s) * s * cx + s * s * b[0], (1 - s) ** 2 * a[1] + 2 * (1 - s) * s * cy + s * s * b[1]]); }
    } else { P = routeOf(o.coords).P.map(mapPt).filter(Boolean); if (P.length < 2) return; }
    const D = [0]; for (let i = 1; i < P.length; i++) D.push(D[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const total = D.at(-1), end = total * k, hl = Math.min(Wd * 1.9, end * .6); if (end < 2) return;
    const at = d => { let i = 1; while (i < D.length - 1 && D[i] < d) i++; const f = (d - D[i - 1]) / ((D[i] - D[i - 1]) || 1); return [lerp(P[i - 1][0], P[i][0], f), lerp(P[i - 1][1], P[i][1], f)]; };
    const dirAt = d => { const p0 = at(Math.max(0, d - 2)), p1 = at(Math.min(total, d + 2)), L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1; return [(p1[0] - p0[0]) / L, (p1[1] - p0[1]) / L]; };
    const bodyEnd = end - hl, N = 40, left = [], right = [];
    for (let i = 0; i <= N; i++) {   // the body tapers from 45% at the tail to full width at the head's shoulders
      const d = bodyEnd * i / N, p = at(d), [tx, ty] = dirAt(d), w = Wd * .5 * lerp(.45, 1, i / N);
      left.push([p[0] - ty * w, p[1] + tx * w]); right.push([p[0] + ty * w, p[1] - tx * w]);
    }
    const hb = at(bodyEnd), [tx, ty] = dirAt(bodyEnd), tip = at(end), hw = Wd * 1.05;
    c.save(); c.globalAlpha = o.alpha * q; c.lineJoin = 'round';
    c.beginPath(); left.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
    c.lineTo(hb[0] - ty * hw, hb[1] + tx * hw); c.lineTo(tip[0], tip[1]); c.lineTo(hb[0] + ty * hw, hb[1] - tx * hw);
    for (let i = right.length - 1; i >= 0; i--) c.lineTo(...right[i]); c.closePath();
    c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 14 * u; c.shadowOffsetY = 6 * u; c.fillStyle = o.color; c.fill();
    c.shadowColor = 'transparent'; c.lineWidth = 3 * u; c.strokeStyle = o.edge; c.stroke();
    // a lighter stripe down the middle gives the arrow body some volume
    c.globalAlpha = .25 * o.alpha * q; c.strokeStyle = '#FFFFFF'; c.lineWidth = Wd * .12; c.beginPath();
    for (let i = 0; i <= N; i++) { const p = at(bodyEnd * i / N); i ? c.lineTo(...p) : c.moveTo(...p); } c.stroke();
    c.restore();
    { const b = [P[0], tip]; for (const p of b) mapObstacle(p[0] - Wd, p[1] - Wd, Wd * 2, Wd * 2); }
  },
});

definePreset('mapMarker', {
  label: 'Map Marker', about: 'a place marker pinned to [lon, lat]: pops in (backOut), optional slow pulse ring',
  meta: { version: '1.0.0', category: 'map', tags: ['map', 'place', 'marker', 'city', 'port', 'location', 'pin'], params: { r: { min: 2, max: 60 } }, layers: ['overlay'] },
  defaults: { lonlat: [0, 0], color: '#2B2A3A', ring: '#B4432E', r: 12, pulse: true, ease: 'backOut', dur: .45 },
  run(t, o) {
    const c = mapCtx(), k = presetK(t, o); if (!mapVisible(o.lonlat)) return;
    const p = mapPt(o.lonlat); if (!p) return;
    { const R = (o.r + 4) * US(); mapObstacle(p[0] - R, p[1] - R, 2 * R, 2 * R); } if (k <= 0) return;
    const u = US(), r = o.r * u * Math.max(0, k);
    if (o.pulse && t > o.at + o.dur) { const q = ((t - o.at - o.dur) * .6) % 1; c.beginPath(); c.arc(p[0], p[1], r * (1 + 2.2 * q), 0, TAU); c.globalAlpha = 1 - q; c.strokeStyle = o.ring; c.lineWidth = 2 * u; c.stroke(); c.globalAlpha = 1; }
    c.beginPath(); c.arc(p[0], p[1], r, 0, TAU); c.fillStyle = o.color; c.fill(); c.lineWidth = 2.5 * u; c.strokeStyle = '#FFF8EC'; c.stroke();
  },
});

definePreset('mapLabel', {
  label: 'Map Label', about: 'live text (Thai-safe) pinned to [lon, lat] with an offset; fades and rises in, optional fade out. box: the text on a dark rounded tag (boxColor), the most readable on a busy map',
  meta: { version: '1.1.0', category: 'map', tags: ['map', 'label', 'text', 'place name', 'date', 'caption', 'thai', 'tag'],
    params: { font: { enum: ['body', 'display'] }, align: { enum: ['left', 'center', 'right'] }, size: { min: 12, max: 160 } }, layers: ['text'] },
  defaults: { text: '', lonlat: [0, 0], dx: 18, dy: -16, size: 52, weight: 600, font: 'body', color: '#2B2A3A', halo: '#F6EFE2', box: false, boxColor: 'rgba(16,16,22,.78)', align: 'left', out: null, outDur: .35, ease: 'easeOut', dur: .5 },
  run(t, o) {
    const c = mapCtx(), k = presetK(t, o), q = o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1, a = Math.min(k, q);
    if (a <= 0 || !o.text || !mapVisible(o.lonlat)) return;
    const p = mapPt(o.lonlat); if (!p) return;
    const u = US(), m = .045 * Math.min(W, H);
    c.save(); c.globalAlpha = a; c.font = fontCss({ font: o.font, weight: o.weight, size: o.size }); c.textAlign = o.align; c.textBaseline = 'alphabetic';
    // stay readable: the text box is slid inside the frame margins (never clipped by the edge), the pin stays put
    const tw = c.measureText(o.text).width, x0 = { left: 0, center: -tw / 2, right: -tw }[o.align];
    const x = clamp(p[0] + o.dx * u + x0, m, W - m - tw) - x0, y = clamp(p[1] + o.dy * u + (1 - k) * 14 * u, m + o.size * TS(), H - m);
    const font = c.font; c.restore();
    const px = o.size * TS(), padX = o.box ? px * .42 : px * .1, rect = { x: x + x0 - padX, y: y - px * 1.02, w: tw + padX * 2, h: px * 1.42 };
    MAP.labels.push({ rect, draw: (ox, oy) => {   // drawn after every other map layer (mapPlaceLabels), moved off pins
      c.save(); c.globalAlpha = a; c.font = font; c.textAlign = o.align; c.textBaseline = 'alphabetic';
      if (o.box) {   // a rounded tag behind the text, with a soft shadow
        c.save(); c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 10 * u; c.shadowOffsetY = 3 * u; c.fillStyle = o.boxColor; c.beginPath(); c.roundRect(rect.x + ox, rect.y + oy, rect.w, rect.h, rect.h * .3); c.fill(); c.restore();
      } else if (o.halo) { c.lineWidth = Math.max(3, o.size * .16) * u; c.strokeStyle = o.halo; c.lineJoin = 'round'; c.strokeText(o.text, x + ox, y + oy); }
      c.fillStyle = o.color; c.fillText(o.text, x + ox, y + oy); c.restore();
    } });
  },
});

// labels never cover a pin, a marker or another label: each label (in layer order) takes the first free spot among
// small moves around its own place, and labels are drawn last, on top of the map. Pins and markers register their
// boxes for the whole shot (not only once they have popped in), so a label does not jump when a pin appears.
const mapHit = (a, b, m) => a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;
function mapPlaceLabels() {
  const placed = [], m = 6 * US(), M = .03 * Math.min(W, H);
  for (const L of MAP.labels) {
    const r = L.rect, step = r.h * .6, cands = [[0, 0]];
    for (let i = 1; i <= 6; i++) cands.push([0, i * step], [0, -i * step], [i * step * 1.4, 0], [-i * step * 1.4, 0], [i * step, i * step], [-i * step, i * step]);
    let best = [0, 0];
    for (const [ox, oy] of cands) {
      const b = { x: r.x + ox, y: r.y + oy, w: r.w, h: r.h };
      if (b.x < M || b.y < M || b.x + b.w > W - M || b.y + b.h > H - M) continue;
      if (![...MAP.obst, ...placed].some(o => mapHit(b, o, m))) { best = [ox, oy]; break; }
    }
    placed.push({ x: r.x + best[0], y: r.y + best[1], w: r.w, h: r.h }); L.draw(best[0], best[1]);
  }
}
const mapObstacle = (x, y, w, h) => { if (MAP.obst) MAP.obst.push({ x, y, w, h }); };

// a territory's geometries: `units` (countries and "<ISO3>/<province>") or the single country `name`
function mapUnits(o, who) {
  const list = o.units?.length ? o.units : [o.name];
  return list.map(n => { const g = String(n).includes('/') ? GEO.admin1?.[n] : GEO.countries10?.[n] || GEO.countries50[n];   // 1:10m borders when present (smooth up close)
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

// a territory's colour. blend 'tint' (default): an overlay, the land's relief and texture stay visible under the owner's
// hue (a 'color' pass, then a light wash of the colour itself); 'solid': opaque paint with a drop shadow (the old look)
function mapFill(c, gs, color, alpha, blend, shadow, u) {
  if (blend === 'solid') { c.save(); mapTrace(c, gs); if (shadow) { c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 16 * u; c.shadowOffsetY = 7 * u; } c.globalAlpha = alpha; c.fillStyle = color; c.fill(); c.restore(); return; }
  c.save(); mapTrace(c, gs); c.fillStyle = color;
  c.globalCompositeOperation = 'color'; c.globalAlpha = alpha; c.fill();
  c.globalCompositeOperation = 'source-over'; c.globalAlpha = alpha * .32; c.fill(); c.restore();
}

definePreset('mapRegion', {
  label: 'Map Region', about: 'a territory coloured as a see-through overlay (blend tint; solid = opaque with drop shadow), white outer edge: one country (modern Natural Earth admin-0), or units = a union of countries and provinces (historical or partial territories); fades in, optional fade out',
  meta: { version: '1.2.0', category: 'map', tags: ['map', 'country', 'region', 'territory', 'highlight', 'border', 'fill', 'nation', 'province', 'historical', 'empire', 'colony', 'overlay'],
    params: { alpha: { min: 0, max: 1 }, edge: { min: 0, max: 10 }, blend: { enum: ['tint', 'solid'] } }, assets: [{ param: 'name', type: 'geo' }, { param: 'units', type: 'geo' }], layers: ['overlay'] },
  defaults: { name: 'Spain', units: [], color: '#D8332A', alpha: .85, blend: 'tint', edge: 2.4, edgeColor: '#FFFFFF', shadow: true, out: null, outDur: .4, ease: 'easeOut', dur: .6 },
  run(t, o) {
    const gs = mapUnits(o, 'mapRegion'), c = mapCtx(), k = presetK(t, o), q = o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1, a = Math.min(k, q); if (a <= 0) return;
    const u = US();
    mapFill(c, gs, o.color, o.alpha * a, o.blend, o.shadow, u);
    if (o.edge > 0) mapEdge(c, gs, o.edge * u, o.edgeColor, a);
  },
});

// the part of a territory's box a sweep in direction dir has covered at progress e (0..1)
const mapSweep = (B, dir, e, pad) => ({ right: [B.x0 - pad, B.y0 - pad, (B.x1 - B.x0 + 2 * pad) * e, B.y1 - B.y0 + 2 * pad], left: [B.x1 + pad - (B.x1 - B.x0 + 2 * pad) * e, B.y0 - pad, (B.x1 - B.x0 + 2 * pad) * e, B.y1 - B.y0 + 2 * pad],
  down: [B.x0 - pad, B.y0 - pad, B.x1 - B.x0 + 2 * pad, (B.y1 - B.y0 + 2 * pad) * e], up: [B.x0 - pad, B.y1 + pad - (B.y1 - B.y0 + 2 * pad) * e, B.x1 - B.x0 + 2 * pad, (B.y1 - B.y0 + 2 * pad) * e] }[dir]);

definePreset('mapTransfer', {
  label: 'Map Territory Transfer', about: 'a territory changes hands: filled in the old owner\'s colour, the new colour sweeps across it (direction dir) with a glowing front, then a white flash on its edge; for cessions, annexations, conquests',
  meta: { version: '1.1.0', category: 'map', tags: ['map', 'territory', 'cession', 'annexation', 'conquest', 'border change', 'treaty', 'history', 'colony', 'lost land', 'overlay'],
    params: { dir: { enum: ['left', 'right', 'up', 'down'] }, alpha: { min: 0, max: 1 }, edge: { min: 0, max: 10 }, blend: { enum: ['tint', 'solid'] } }, assets: [{ param: 'units', type: 'geo' }], layers: ['overlay'] },
  defaults: { name: 'Laos', units: [], from: '#E8C547', to: '#3E6FD0', dir: 'right', alpha: .9, blend: 'tint', edge: 2.4, edgeColor: '#FFFFFF', flash: true, out: null, outDur: .4, ease: 'ease', dur: 1.2 },
  run(t, o) {
    const gs = mapUnits(o, 'mapTransfer'), c = mapCtx(), u = US(), q = o.out != null ? 1 - clamp((t - o.out) / o.outDur) : 1; if (q <= 0) return;
    const k = clamp((t - o.at) / o.dur), e = k * k * (3 - 2 * k), B = mapBox(gs);
    if (o.blend === 'solid' || e < 1) {   // the old owner's colour (under a tint, only the part the sweep has not reached)
      c.save(); if (o.blend !== 'solid' && e > 0) { const pad = 40 * u, R = mapSweep(B, o.dir, e, pad); c.beginPath(); c.rect(-1e5, -1e5, 2e5, 2e5); c.rect(...R); c.clip('evenodd'); }
      mapFill(c, gs, o.from, o.alpha * q, o.blend, true, u); c.restore();
    }
    if (e > 0) {   // the new owner's colour, clipped to the sweep (a half-plane moving across the territory's box)
      const pad = 40 * u, R = mapSweep(B, o.dir, e, pad);
      c.save(); c.beginPath(); c.rect(...R); c.clip(); mapFill(c, gs, o.to, o.alpha * q, o.blend, false, u); c.restore();
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
