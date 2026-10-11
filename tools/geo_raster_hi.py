"""tools/geo_raster_hi.py: SHARP basemap tiles for close map shots (mapBase style 'satellite' or 'physical').

The overview raster (tools/geo_raster.py, 4096 px for the whole world) is soft once a shot frames one region: Europe
fills a 1080 px frame with ~600 source pixels. This builds a Mercator TILE PYRAMID level at --width px (default 16384)
that src/presets/map.js draws instead whenever the camera is close enough, loading only the tiles a frame shows.

--style satellite: the documentary "satellite" colours of the overview (Blue Marble colour, the same land/sea grade), with crisp
coastlines, lakes and terrain relief from Natural Earth II (1:10m, 21600 px, public domain). Colour comes from Blue
Marble at its own resolution, filled up to Natural Earth's coastline (land colour never bleeds into the sea, or the
reverse), and Natural Earth's shaded relief adds the fine detail on land.
--style physical: the clean reference-atlas look (no labels): Natural Earth II's land cover and shaded relief at its
full resolution, a little richer, in a clear blue sea. The sharpest and easiest to read.
Lakes come from Natural Earth 1:10m lakes (vector, rasterised at full resolution; pip install pyshp).

    python tools/geo_raster_hi.py --style satellite   # downloads Natural Earth II (325 MB), lakes and three-globe into .cache/
    python tools/geo_raster_hi.py --style physical [--width 21504] [--tile 1024] [--quality 84]
Output: src/geo/tiles_<style>/<width>/<row>_<col>.jpg (levels 8192 and --width), src/geo/tiles_<style>/overview.jpg
        (4096 px, the same look, for wide shots) and src/geo/tiles_<style>.js (window.GEO.tiles[style]: lat, overview, levels).
"""
import sys as _sys
for _s in (_sys.stdout, _sys.stderr):   # Windows: a piped stdout is cp1252 and cannot print → or Thai; always UTF-8
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass
import argparse, glob, json, math, os, urllib.request, zipfile
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys_path = os.path.join(ROOT, 'tools'); _sys.path.insert(0, sys_path)
from geo_raster import LAT, fetch_three_globe   # noqa: E402  (the overview's latitude limit and Blue Marble source)

LAKE = np.array([.07, .28, .55], np.float32)
NE_URL = 'https://naturalearth.s3.amazonaws.com/10m_raster/NE2_HR_LC_SR_W.zip'
LAKES_URL = 'https://naturalearth.s3.amazonaws.com/10m_physical/ne_10m_lakes.zip'


def lake_mask(NW, NH):   # Natural Earth 1:10m lakes rasterised on the raster's grid (255 = lake); None without pyshp
    try: import shapefile
    except ImportError: print('note: pip install pyshp for crisp lakes (falling back to Blue Marble dark water)', flush=True); return None
    from PIL import ImageDraw
    d = os.path.join(ROOT, '.cache', 'ne_raster'); shp = os.path.join(d, 'ne_10m_lakes.shp')
    if not os.path.exists(shp):
        z = os.path.join(d, 'lakes.zip'); urllib.request.urlretrieve(LAKES_URL, z)
        with zipfile.ZipFile(z) as f: f.extractall(d)
        os.remove(z)
    m = Image.new('L', (NW, NH), 0); dr = ImageDraw.Draw(m)
    px = lambda p: ((p[0] + 180) / 360 * NW, (90 - p[1]) / 180 * NH)
    for sh in shapefile.Reader(shp).shapes():
        idx = list(sh.parts) + [len(sh.points)]
        for i in range(len(idx) - 1):
            ring = sh.points[idx[i]:idx[i + 1]]
            area = sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]))
            if len(ring) > 2: dr.polygon([px(p) for p in ring], fill=255 if area < 0 else 0)   # shapefile: outer rings clockwise, holes (islands) counter-clockwise
    return m


def fetch_ne():
    d = os.path.join(ROOT, '.cache', 'ne_raster'); os.makedirs(d, exist_ok=True); tif = os.path.join(d, 'NE2_HR_LC_SR_W.tif')
    if not os.path.exists(tif):
        z = os.path.join(d, 'NE2_HR_LC_SR_W.zip'); print('downloading Natural Earth II (325 MB) …', flush=True)
        urllib.request.urlretrieve(NE_URL, z)
        with zipfile.ZipFile(z) as f: f.extractall(d)
        os.remove(z)
    return tif


def water_of(rgb):   # Natural Earth II paints every sea and lake one family of blues; ice and snow stay land
    return np.clip((rgb[..., 2] - rgb[..., 0] - 35) / 30, 0, 1)


def box(a, r, ax):   # box filter of radius r along one axis (edges clamped), by running sums
    p = [(0, 0)] * a.ndim; p[ax] = (r + 1, r); c = np.cumsum(np.pad(a, p, mode='edge'), axis=ax, dtype=np.float64)
    n = a.shape[ax]; hi = np.take(c, np.arange(2 * r + 1, n + 2 * r + 1), axis=ax); lo = np.take(c, np.arange(0, n), axis=ax)
    return ((hi - lo) / (2 * r + 1)).astype(np.float32)


def blur(a, s):   # ~gaussian blur (three box passes per axis) of a float image
    r = max(1, int(round(s)))
    for ax in (0, 1):
        for _ in range(3): a = box(a, r, ax)
    return a


def grade(rgb, w):   # the overview's grade (tools/geo_raster.py): lusher land, deeper teal sea
    lw = w[..., None]; g = rgb.mean(axis=2, keepdims=True)
    land = g + (rgb - g) * 1.25; land[..., 1] *= 1.05
    sea = rgb * np.array([.35, .75, .72], np.float32) + np.array([.04, .2, .24], np.float32)
    return np.clip(land * (1 - lw) + sea * lw, 0, 1)


def physical(ne, w):   # Natural Earth II, a little richer: deeper greens and browns, a clear mid blue sea with its depth
    lw = w[..., None]; g = ne.mean(axis=2, keepdims=True)
    land = np.clip(g + (ne - g) * 1.45, 0, 1) ** 1.12
    sea = np.clip(ne * np.array([.62, .82, .95], np.float32) + np.array([-.02, .0, .04], np.float32), 0, 1)
    return np.clip(land * (1 - lw) + sea * lw, 0, 1)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--style', choices=['satellite', 'physical'], default='satellite')
    ap.add_argument('--width', type=int); ap.add_argument('--tile', type=int, default=1024)
    ap.add_argument('--quality', type=int, default=84); ap.add_argument('--detail', type=float, default=1.0)
    a = ap.parse_args(); TS, ST = a.tile, a.style; OW = a.width or (16384 if ST == 'satellite' else 21504)
    bm_path, _, _ = fetch_three_globe(); ne_path = fetch_ne()
    print('loading …', flush=True)
    NE = Image.open(ne_path).convert('RGB'); NW, NH = NE.size; LK = lake_mask(NW, NH)
    BM = np.asarray(Image.open(bm_path).convert('RGB'), np.float32) / 255; BH, BW = BM.shape[:2]
    # Blue Marble's colour, each class filled up to Natural Earth's coastline: land pixels average only land, sea only sea
    wlo = water_of(np.asarray(NE.resize((BW, BH), Image.BOX), np.float32))
    fills = []
    for wt in (1 - wlo, wlo):
        k = wt ** 4; num = blur(BM * k[..., None], 3); den = blur(k, 3)[..., None]
        f = np.where(den > 1e-3, num / np.maximum(den, 1e-6), BM); fills.append(np.where(wt[..., None] > .95, BM, f))
    land_fill, sea_fill = fills

    ymax = math.log(math.tan(math.pi / 4 + math.radians(LAT) / 2)); OH = int(round(OW * 2 * ymax / (2 * math.pi)))
    rows, cols = math.ceil(OH / TS), math.ceil(OW / TS)
    rel = f'src/geo/tiles_{ST}'; out_dir = os.path.join(ROOT, *rel.split('/'))
    import shutil; shutil.rmtree(out_dir, ignore_errors=True); os.makedirs(os.path.join(out_dir, str(OW)))
    overview = Image.new('RGB', (4096, int(round(4096 * OH / OW))))
    MW = 8192 if OW > 8192 else 0   # a middle level, so no shot samples a level more than ~2x finer than the frame
    mid = Image.new('RGB', (MW, int(round(MW * OH / OW)))) if MW else None
    sig = OW / BW   # Blue Marble px → output px
    for r in range(rows):
        y0, y1 = r * TS, min(OH, (r + 1) * TS)
        ys = ymax - (np.arange(y0, y1) + .5) / OH * 2 * ymax
        lat = np.degrees(np.arctan(np.sinh(ys)))
        # source rows (Natural Earth) this strip needs, with a margin for the blur
        nr = (90 - lat) / 180 * NH - .5; m = 8
        s0, s1 = max(0, int(math.floor(nr.min())) - m), min(NH, int(math.ceil(nr.max())) + m + 1)
        ne = np.asarray(NE.crop((0, s0, NW, s1)).resize((OW, s1 - s0), Image.LANCZOS), np.float32) / 255
        w = water_of(ne * 255)
        if LK is not None:   # lakes: water, painted the colour of Natural Earth's shallow sea
            lm = np.asarray(LK.crop((0, s0, NW, s1)).resize((OW, s1 - s0), Image.BOX), np.float32)[..., None] / 255
            w = np.maximum(w, lm[..., 0]); ne = ne * (1 - lm) + np.array([118, 176, 214], np.float32) / 255 * lm
        if ST == 'physical': rgb = physical(ne, w)
        else:
            lum = ne.mean(axis=2); hp = lambda r: (lum + .03) / (blur(lum, r) + .03)   # Natural Earth's relief: fine ridges and whole ranges
            detail = np.clip(hp(3) ** a.detail * hp(14) ** (a.detail * .8), .45, 1.8)
            # Blue Marble fills for the same source rows, up to output width
            br = lambda q: q / NH * BH
            b0, b1 = br(s0), br(s1)
            cb0, cb1 = max(0, int(math.floor(b0)) - 2), min(BH, int(math.ceil(b1)) + 2)
            def up(img):
                im = Image.fromarray((np.clip(img[cb0:cb1], 0, 1) * 255).astype(np.uint8)).resize((OW, cb1 - cb0), Image.BICUBIC)
                arr = np.asarray(im, np.float32) / 255   # rows of arr span BM rows cb0..cb1; resample to NE rows s0..s1
                src = ((np.arange(s0, s1) + .5) / NH * BH - .5 - cb0) / (cb1 - cb0) * (cb1 - cb0)
                src = np.clip(src, 0, cb1 - cb0 - 1); i0 = np.floor(src).astype(int); i1 = np.minimum(i0 + 1, cb1 - cb0 - 1); t = (src - i0)[:, None, None]
                return arr[i0] * (1 - t) + arr[i1] * t
            lf, sf = up(land_fill), up(sea_fill)
            dark = np.clip((.07 - sf[..., 2:3]) / .035, 0, 1); sf = sf * (1 - dark) + LAKE * dark   # inland water Blue Marble paints near black
            # lakes: Natural Earth II paints them as land, Blue Marble near black: they become water (colour and grade)
            lk = np.clip((.06 - lf.max(axis=2)) / .03, 0, 1) * (LK is None); w = np.maximum(w, lk); sf = sf * (1 - lk[..., None]) + LAKE * lk[..., None]
            rgb = lf * detail[..., None] * (1 - w[..., None]) + sf * w[..., None]
            rgb = grade(np.clip(rgb, 0, 1), w)
        # equirectangular source rows → this strip's Mercator rows
        q = np.clip(nr - s0, 0, s1 - s0 - 1); q0 = np.floor(q).astype(int); q1 = np.minimum(q0 + 1, s1 - s0 - 1); t = (q - q0)[:, None, None]
        merc = Image.fromarray((np.clip(rgb[q0] * (1 - t) + rgb[q1] * t, 0, 1) * 255).astype(np.uint8))
        for c in range(cols):
            merc.crop((c * TS, 0, min(OW, (c + 1) * TS), y1 - y0)).save(os.path.join(out_dir, str(OW), f'{r}_{c}.jpg'), quality=a.quality, optimize=True)
        oy0, oy1 = round(y0 / OH * overview.height), round(y1 / OH * overview.height)
        if oy1 > oy0: overview.paste(merc.resize((4096, oy1 - oy0), Image.LANCZOS), (0, oy0))
        if mid:
            my0, my1 = round(y0 / OH * mid.height), round(y1 / OH * mid.height)
            if my1 > my0: mid.paste(merc.resize((MW, my1 - my0), Image.LANCZOS), (0, my0))
        print(f'row {r + 1}/{rows}', flush=True)
    overview.save(os.path.join(out_dir, 'overview.jpg'), quality=88, optimize=True)
    note = ('Blue Marble colour (three-globe example image) + ' if ST == 'satellite' else '') + 'Natural Earth II 1:10m land cover, coastlines and shaded relief, Natural Earth 1:10m lakes (public domain)'
    levels = [{'dir': f'{rel}/{OW}', 'size': [OW, OH], 'tile': TS, 'rows': rows, 'cols': cols}]
    if mid:
        os.makedirs(os.path.join(out_dir, str(MW))); mr, mc = math.ceil(mid.height / TS), math.ceil(MW / TS)
        for r in range(mr):
            for c in range(mc): mid.crop((c * TS, r * TS, min(MW, (c + 1) * TS), min(mid.height, (r + 1) * TS))).save(os.path.join(out_dir, str(MW), f'{r}_{c}.jpg'), quality=a.quality, optimize=True)
        levels.insert(0, {'dir': f'{rel}/{MW}', 'size': [MW, mid.height], 'tile': TS, 'rows': mr, 'cols': mc})
    meta = {'lat': LAT, 'overview': f'{rel}/overview.jpg', 'levels': levels, 'source': note}
    open(os.path.join(ROOT, 'src', 'geo', f'tiles_{ST}.js'), 'w').write(
        '// GENERATED by tools/geo_raster_hi.py. Do not edit.\n'
        f'((window.GEO = window.GEO || {{}}).tiles = GEO.tiles || {{}}).{ST} = {json.dumps(meta)};\n')
    mb = sum(os.path.getsize(f) for f in glob.glob(os.path.join(out_dir, '**', '*.jpg'), recursive=True)) / 1e6
    print(json.dumps({**meta, 'MB': round(mb, 1)}))


if __name__ == '__main__':
    main()
