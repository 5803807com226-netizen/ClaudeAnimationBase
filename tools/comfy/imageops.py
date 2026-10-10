"""tools/comfy/imageops.py: image steps for tools/gen_assets.mjs (PIL + NumPy; both ship with ComfyUI's Python).

  matte   --in raw.png --out cut.png [--mode chroma|rembg] [--key #00B140] [--tol 1.0] [--margin .04] [--no-unshadow]
          remove a chroma background: keyed on the green RATIO (shadows cast on the green go too), detached specks
          removed (connected components; fibres attached to the object stay), edge colours un-mixed from the background
          and despilled (only where green dominates: yellow, cream, coral and skin are untouched), an optional neutral
          baked shadow removed; prints a JSON report (specks, shadow, dark_rim_fraction, shadow_suspect)
  fit     --in a.png --out b.png --width W | --height H [--cover W:H]   upscale (Lanczos) to at least W wide / H tall; --cover crops
  screen_glow --base hand.png --out glow.png [--colors #FFF4DE,#F4E6CC]
          find the phone's dark screen inside the cut-out and paint a soft lit screen ON THE SAME CANVAS (so it aligns)
  beside  --base hand.png --source ticks.png --out buzz.png [--mirror]
          place the source beside the phone (and a mirrored copy on the other side) on the base's canvas
  compare --in a.png [b.png ...] [--labels a,b] --out sheet.jpg   cut-outs on checker / white / dark + a zoom of the lower edge
  mock    --out raw.png --prompt "..." --size W,H --seed N [--bad]
          a synthetic stand-in image for TESTING the pipeline without an image model (never story artwork)
Exit code 0 on success; errors go to stderr.
"""
import argparse, hashlib, json, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter


def hexrgb(h):
    h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def crop_pad(img, margin):
    a = np.asarray(img)[:, :, 3]; ys, xs = np.nonzero(a > 8)
    if not len(xs): return img
    img = img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    p = int(round(img.width * margin)) + 2   # margin as a fraction of the artwork's width (room for derived layers)
    out = Image.new('RGBA', (img.width + 2 * p, img.height + 2 * p), (0, 0, 0, 0)); out.paste(img, (p, p)); return out


def label(mask):
    """Connected components (8-neighbour) of a boolean mask → (labels int32, areas). SciPy when available (ComfyUI ships
    it); otherwise a run-length union-find in NumPy + Python, fast enough for a few megapixels."""
    try:
        from scipy import ndimage
        lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
        return lab, np.bincount(lab.ravel(), minlength=n + 1)
    except ImportError:
        pass
    h, w = mask.shape; parent = [0]; runs = []; prev = []
    def find(x):
        while parent[x] != x: parent[x] = parent[parent[x]]; x = parent[x]
        return x
    for y in range(h):
        row = mask[y]; d = np.diff(np.concatenate(([0], row.view(np.int8), [0])))
        starts, ends = np.nonzero(d == 1)[0], np.nonzero(d == -1)[0]; cur = []
        for s0, e0 in zip(starts, ends):
            lab = None
            for ps, pe, pl in prev:                      # 8-connected: runs overlap when extended by one pixel
                if ps <= e0 and pe >= s0:                  # runs [s, e): touching diagonally counts
                    r = find(pl)
                    if lab is None: lab = r
                    elif r != lab: parent[max(r, lab)] = min(r, lab); lab = min(r, lab)
            if lab is None: lab = len(parent); parent.append(lab)
            cur.append((s0, e0, lab)); runs.append((y, s0, e0, lab))
        prev = cur
    lab = np.zeros((h, w), np.int32); roots = {}
    for y, s0, e0, l in runs:
        r = find(l); lab[y, s0:e0] = roots.setdefault(r, len(roots) + 1)
    return lab, np.bincount(lab.ravel(), minlength=len(roots) + 1)


def box(a, r):
    """Box filter (mean over a (2r+1)² window) by cumulative sums: fast at any radius."""
    p = np.pad(a, r + 1, mode='edge').astype(np.float64); c = p.cumsum(0).cumsum(1); k = 2 * r + 1
    return ((c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k))[:a.shape[0], :a.shape[1]]


def keep_attached(alpha, core_t=.5, soft_t=.04, keep_frac=.01):
    """Remove detached background noise: keep the solid components that are at least keep_frac of the largest one, and
    every soft pixel (fibres, antialiasing) connected to them. Returns (alpha, components removed, pixels removed)."""
    lab, areas = label(alpha > core_t)
    if len(areas) <= 1: return alpha, 0, 0
    big = areas[1:].max(); keep = np.zeros(len(areas), bool); keep[1:] = areas[1:] >= max(1, big * keep_frac)
    core = keep[lab]
    soft, _ = label(alpha > soft_t)                       # soft regions that touch a kept core survive whole
    ok = np.zeros(soft.max() + 1, bool); ok[np.unique(soft[core])] = True; ok[0] = False
    out = np.where(ok[soft], alpha, 0.0)
    removed = int(((alpha > soft_t) & ~ok[soft]).sum()); ncomp = int((~keep[1:]).sum())
    return out, ncomp, removed


def matte(a):
    img = Image.open(a.inp).convert('RGB'); report = {}
    if a.mode == 'rembg':
        from rembg import remove   # optional: pip install rembg
        cut = remove(img).convert('RGBA'); px = np.asarray(cut).astype(np.float32); alpha = px[:, :, 3] / 255; px = px[:, :, :3]; bg = None
    else:
        px = np.asarray(img).astype(np.float32); h, w, _ = px.shape
        mx, mn = px.max(-1), px.min(-1)
        gr = (px[:, :, 1] - np.maximum(px[:, :, 0], px[:, :, 2])) / np.maximum(px[:, :, 1], 1)   # green ratio: brightness-free
        # the background colour as rendered: the median of green-dominant pixels in a ring along the image border
        ring = np.zeros((h, w), bool); b = max(4, int(min(h, w) * .04)); ring[:b] = ring[-b:] = True; ring[:, :b] = ring[:, -b:] = True
        g_ring = ring & (gr > .25); bg = np.median(px[g_ring], axis=0) if g_ring.sum() > 50 else hexrgb(a.key)
        # key on the green RATIO, not the green difference: a shadow cast on the green (darker green) is still background
        lo, hi = .10 * a.tol, .30 * a.tol
        alpha = 1 - np.clip((gr - lo) / (hi - lo), 0, 1)
        alpha = np.where((mx < 28) & (gr > .04), 0, alpha)                                          # near-black greenish noise
        if (alpha < .5).mean() < .03:   # nothing to key out: the model ignored the chroma background (white, grey, a scene...)
            raise SystemExit('no chroma background found in the generated image (the model ignored the green background); regenerate it')
        alpha = np.where(alpha < .06, 0, alpha)
    # 1. detached specks: anything not connected to the object goes
    alpha, n_specks, px_specks = keep_attached(alpha)
    report.update(specks_removed=n_specks, speck_pixels=px_specks)
    # 2. a neutral baked shadow: dark, desaturated pixels on the outside of the object, much darker than the object itself
    if a.unshadow:
        lum = px.mean(-1); sat = (px.max(-1) - px.min(-1)) / np.maximum(px.max(-1), 1); solid = alpha > .9
        if solid.sum() > 100:
            Lm = np.median(lum[solid]); cand = (alpha > 0) & (lum < .55 * Lm) & (sat < .25)
            lab, _ = label(cand); outside = alpha < .5          # half-keyed pixels count as outside (a shadow fades into the green)
            edge = box(outside.astype(np.float32), 3) > 0       # within 3 px of the outside
            touching = np.unique(lab[cand & edge]); touching = touching[touching > 0]
            shadow = np.isin(lab, touching)
            report['shadow_pixels_removed'] = int(shadow.sum()); report['shadow_fraction'] = round(float(shadow.sum() / max(1, (alpha > .5).sum())), 4)
            alpha = np.where(shadow, 0, alpha)                  # a shadow is not the object: fully clear (the renderer adds its own)
            fringe = (box(shadow.astype(np.float32), 4) > 0) & (lum < .55 * Lm)   # its half-keyed outer edge (grey into green) too
            alpha = np.where(fringe, 0, alpha)
            alpha, _, _ = keep_attached(alpha)
    # 3. edges, solved against the object's OWN nearby colour F (the mean of its clean interior close by) and the rendered
    # background B. The edge band scales with the image (spill reaches further on large strips).
    h, w = alpha.shape; e = max(6, int(round(min(h, w) * .006)))
    solid = alpha > .99; inner = box(solid.astype(np.float32), e) > .999            # solid pixels at least e px from the edge
    band = (alpha > 0) & ~inner
    if band.any() and inner.any():
        den = box(inner.astype(np.float32), 10); F = np.stack([box(px[:, :, c] * inner, 10) for c in range(3)], -1)
        for r in (24, 60, 150):                                                       # widen until every edge pixel has a reference
            if (den[band] > 1e-6).all(): break
            d2 = box(inner.astype(np.float32), r); F2 = np.stack([box(px[:, :, c] * inner, r) for c in range(3)], -1)
            F = np.where((den > 1e-6)[..., None], F, F2); den = np.where(den > 1e-6, den, d2)
        F = F / np.maximum(den, 1e-6)[..., None]; has = den > 1e-6
        gr = lambda c: (c[..., 1] - np.maximum(c[..., 0], c[..., 2])) / np.maximum(c[..., 1], 1)
        if bg is not None:
            # a half-covered pixel greener than its paper is paper + background: its coverage is its position on the line
            # B → F, and its colour is un-mixed with that coverage (blue + green = teal fringes become the blue paper again)
            d = F - bg[None, None, :]; dd = (d * d).sum(-1)
            a_p = np.clip(((px - bg[None, None, :]) * d).sum(-1) / np.maximum(dd, 1), 0, 1)
            resid = np.linalg.norm(px - (bg[None, None, :] + a_p[..., None] * d), axis=-1)
            # greener than its paper AND lying between paper and background (darker paper texture is neither)
            greener = band & has & (gr(px) > gr(F) + .01) & (a_p < .985) & (dd > 40 ** 2) & (resid < .35 * np.sqrt(dd))
            mixed = greener & (alpha < .98)
            spilled = greener & (alpha >= .98) & (a_p > .3)                           # opaque paper tinted by spill: keep it opaque
            alpha = np.where(mixed, a_p, alpha)
            A = np.maximum(alpha, .02)[..., None]; un = np.clip((px - (1 - A) * bg[None, None, :]) / A, 0, 255)
            soft = (alpha > .02) & (alpha < .98)
            plausible = ((px - (1 - A) * bg[None, None, :]) / A).min(-1) > -24
            S = np.maximum(a_p, .3)[..., None]; unspill = np.clip((px - (1 - S) * bg[None, None, :]) / S, 0, 255)   # its colour, un-mixed
            px = np.where(((soft & plausible) | mixed)[..., None], un, np.where(spilled[..., None], unspill, px))
            # what is still greener than its paper after un-mixing takes the paper's own hue at its own brightness: spill
            # that does not follow a clean paper↔green mix would otherwise stay as a cyan / olive rim on coloured paper
            still = (greener & (gr(px) > gr(F) + .01)) | mixed   # mixed edge pixels: their true colour IS the paper's (no overshoot)
            lum = px.mean(-1, keepdims=True); Fl = np.maximum(F.mean(-1, keepdims=True), 1)
            px = np.where(still[..., None], np.clip(F * np.clip(lum / Fl, .6, 1.4), 0, 255), px)
        # despill: near the edge, no pixel may carry more green, relative to its red/blue, than its paper (+ a little);
        # only real green tints are touched, so white / cream fibres, yellow, coral and skin stay as they are
        hi_rb = np.maximum(px[:, :, 0], px[:, :, 2])
        ref = np.where(has, F[..., 1] / np.maximum(np.maximum(F[..., 0], F[..., 2]), 1), 1.0)
        allowed = ref * hi_rb + 6
        tinted = (px[:, :, 1] >= hi_rb - 4) & (px[:, :, 1] - np.minimum(px[:, :, 0], px[:, :, 2]) > 25)
        px[:, :, 1] = np.where(band & tinted, np.minimum(px[:, :, 1], np.maximum(allowed, 0)), px[:, :, 1])
    alpha, n2, p2 = keep_attached(np.where(alpha < .04, 0, alpha))                # the edge solve can free tiny fragments
    report['specks_removed'] = report.get('specks_removed', 0) + n2
    al = Image.fromarray(np.clip(alpha * 255, 0, 255).astype(np.uint8))
    cut = Image.fromarray(np.clip(px, 0, 255).astype(np.uint8)).convert('RGBA'); cut.putalpha(al)
    # remaining dark rim on the outer edge (a baked shadow that could not be separated): suggest regenerating
    A = np.asarray(al) / 255; lum = px.mean(-1); solid = A > .9
    if solid.sum() > 100:
        rim = (A > .5) & ~(np.roll(A > .5, 3, 0) & np.roll(A > .5, -3, 0) & np.roll(A > .5, 3, 1) & np.roll(A > .5, -3, 1))
        dark = rim & (lum < .5 * np.median(lum[solid]))
        report['dark_rim_fraction'] = round(float(dark.sum() / max(1, rim.sum())), 4)
        report['shadow_suspect'] = bool(dark.sum() / max(1, rim.sum()) > .12)
    crop_pad(cut, a.margin).save(a.out)
    print(json.dumps(report))


def resize_rgba(img, size):
    """Resize with premultiplied alpha (transparent pixels cannot bleed their colour into the edge), then drop the
    resampling ringing: faint alpha and fragments no longer attached to the artwork."""
    if img.mode != 'RGBA' or np.asarray(img)[:, :, 3].min() == 255: return img.convert(img.mode).resize(size, Image.LANCZOS)
    a = np.asarray(img).astype(np.float32) / 255; al = a[:, :, 3]
    ch = [Image.fromarray((a[:, :, c] * al).astype(np.float32), 'F').resize(size, Image.LANCZOS) for c in range(3)]
    A = np.clip(np.asarray(Image.fromarray(al.astype(np.float32), 'F').resize(size, Image.LANCZOS)), 0, 1)
    A, _, _ = keep_attached(np.where(A < 10 / 255, 0, A), soft_t=10 / 255)         # ringing below the visible threshold, and islands
    rgb = np.stack([np.asarray(c) for c in ch], -1) / np.maximum(A, 1e-4)[..., None]
    out = np.dstack([np.clip(rgb, 0, 1), A]); out[A <= 0] = 0
    return Image.fromarray((out * 255 + .5).astype(np.uint8), 'RGBA')


def fit(a):
    img = Image.open(a.inp)
    if a.cover:
        rw, rh = map(float, a.cover.split(':')); r = rw / rh
        if img.width / img.height > r: w = int(img.height * r); x = (img.width - w) // 2; img = img.crop((x, 0, x + w, img.height))
        else: h = int(img.width / r); y = (img.height - h) // 2; img = img.crop((0, y, img.width, y + h))
    if a.width and img.width < a.width:
        img = resize_rgba(img, (a.width, round(img.height * a.width / img.width)))
    if a.height and img.height < a.height:
        img = resize_rgba(img, (round(img.width * a.height / img.height), a.height))
    img.save(a.out)


def screen_mask(base):
    """The phone's screen: the largest dark, low-saturation region inside the cut-out, near its middle."""
    px = np.asarray(base).astype(np.float32); al = px[:, :, 3] > 200
    lum = px[:, :, :3].mean(-1); sat = px[:, :, :3].max(-1) - px[:, :, :3].min(-1)
    m = al & (lum < 70) & (sat < 40)
    s = 4; small = m[::s, ::s].copy(); h, w = small.shape; seen = np.zeros_like(small); best = None
    for y0 in range(h):   # largest connected component (4-neighbour flood fill on a quarter-size mask)
        for x0 in range(w):
            if small[y0, x0] and not seen[y0, x0]:
                stack, comp = [(y0, x0)], []; seen[y0, x0] = True
                while stack:
                    y, x = stack.pop(); comp.append((y, x))
                    for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                        if 0 <= yy < h and 0 <= xx < w and small[yy, xx] and not seen[yy, xx]: seen[yy, xx] = True; stack.append((yy, xx))
                if best is None or len(comp) > len(best): best = comp
    if not best or len(best) < 50: raise SystemExit('screen_glow: no dark screen found in the base image')
    comp = np.zeros_like(small); ys, xs = zip(*best); comp[list(ys), list(xs)] = True
    big = np.kron(comp, np.ones((s, s), dtype=bool))[:m.shape[0], :m.shape[1]] & m
    return big


def screen_glow(a):
    base = Image.open(a.base).convert('RGBA'); m = screen_mask(base)
    ys0, xs0 = np.nonzero(m); e = max(3, int(np.ptp(xs0) * .035)) | 1   # shrink inside the bezel, in proportion to the phone
    mi = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(e)).filter(ImageFilter.GaussianBlur(2))
    c0, c1 = (hexrgb(c) for c in a.colors.split(','))
    ys, xs = np.nonzero(m); cy, cx = ys.mean(), xs.mean(); R = max(np.ptp(ys), np.ptp(xs)) / 1.6 + 1
    yy, xx = np.mgrid[0:base.height, 0:base.width]; k = np.clip(np.hypot(yy - cy, xx - cx) / R, 0, 1)[..., None]
    rgb = (c0 * (1 - k) + c1 * k).astype(np.uint8); out = Image.fromarray(rgb).convert('RGBA'); out.putalpha(mi); out.save(a.out)


def beside(a):
    base = Image.open(a.base).convert('RGBA'); src = Image.open(a.source).convert('RGBA'); m = screen_mask(base)
    ys, xs = np.nonzero(m); x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max(); ph = y1 - y0
    h = int(ph * .32); src = src.resize((max(1, round(src.width * h / src.height)), h), Image.LANCZOS)
    out = Image.new('RGBA', base.size, (0, 0, 0, 0)); gap = int((x1 - x0) * .22); cy = int(y0 + ph * .42 - h / 2)
    out.alpha_composite(src, (int(x1 + gap), cy))
    if a.mirror: out.alpha_composite(src.transpose(Image.FLIP_LEFT_RIGHT), (int(x0 - gap - src.width), cy))
    out.save(a.out)


def region(a):
    """An overlay cut from SOURCE onto BASE's canvas: the source resized to the base canvas, kept only inside a feathered
    rectangle (fractions x0,y0,x1,y1 of the canvas), alpha elsewhere. Overlays made this way (closed eyes over an open-eye
    face, a head over its own body) are registered to the pixel, so swapping or turning them never pops."""
    base = Image.open(a.base).convert('RGBA'); src = Image.open(a.source).convert('RGBA').resize(base.size, Image.LANCZOS)
    w, h = base.size; x0, y0, x1, y1 = [float(v) for v in a.rect.split(',')]; f = max(1, int(a.feather * min(w, h)))
    m = Image.new('L', base.size, 0); ImageDraw.Draw(m).rectangle([x0 * w + f, y0 * h + f, x1 * w - f, y1 * h - f], fill=255)
    m = m.filter(ImageFilter.GaussianBlur(f / 2))
    alpha = np.minimum(np.asarray(m, np.float32), np.asarray(src.getchannel('A'), np.float32)).astype(np.uint8)
    src.putalpha(Image.fromarray(alpha)); src.save(a.out)


def mock(a):
    """Deterministic stand-in images shaped by the prompt's keywords, on a chroma green background (or a full-bleed
    texture for backdrops), so the whole pipeline can be tested without an image model. Clearly not artwork."""
    w, h = map(int, a.size.split(',')); rnd = np.random.default_rng(int(hashlib.sha1(f'{a.prompt}{a.seed}'.encode()).hexdigest()[:8], 16))
    p = a.prompt.lower()
    if 'full-bleed' in p or 'full frame' in p:
        base = np.ones((h, w, 3), np.float32) * hexrgb('#D9C6A6'); base += rnd.normal(0, 6, (h, w, 1))
        Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1)).save(a.out); return
    # --bad: the realistic failure, a model ignoring the chroma request and returning a plain white background
    img = Image.new('RGB', (w, h), (246, 244, 240) if a.bad else (0, 177, 64)); d = ImageDraw.Draw(img); cx, cy = w / 2, h / 2
    def blob(rx, ry, col, n=90, j=.03):
        pts = []
        for i in range(n):
            t = i / n * 2 * np.pi; r = 1 + rnd.uniform(-j, j); pts.append((cx + np.cos(t) * rx * r, cy + np.sin(t) * ry * r))
        d.polygon(pts, fill=col)
    p0, p = p, p.split(',')[0]   # the subject: the first clause (style words such as 'tangerine orange accents' come later)
    def tri(pts, col): d.polygon([(cx + x * w, cy + y * h) for x, y in pts], fill=col)
    def box(x0, y0, x1, y1, col, r=0): d.rounded_rectangle([cx + x0 * w, cy + y0 * h, cx + x1 * w, cy + y1 * h], int(r * min(w, h)), fill=col)
    def face(fx, fy, r):   # a sticker face: two eyes and a smile
        e = r * .12; d.ellipse([fx - r * .35 - e, fy - e, fx - r * .35 + e, fy + e], fill=(40, 30, 40)); d.ellipse([fx + r * .35 - e, fy - e, fx + r * .35 + e, fy + e], fill=(40, 30, 40))
        d.arc([fx - r * .3, fy - r * .1, fx + r * .3, fy + r * .4], 20, 160, fill=(40, 30, 40), width=max(2, int(r * .08)))
    def outlined(draw_fn):   # white sticker outline: the shape a little bigger in white, then the shape
        draw_fn(1.08, (255, 255, 255)); draw_fn(1.0, None)
    sticker = 'cartoon' in p or 'sticker' in p or 'iced tea' in p
    if sticker and ('sun' in p or 'blob' in p or 'cloud' in p or 'flower' in p):
        col = (240, 130, 60) if 'sun' in p else (150, 120, 220) if 'blob' in p else (245, 245, 250) if 'cloud' in p else (90, 140, 230)
        ry = .26 if 'cloud' in p else .34
        outlined(lambda k, c: blob(w * .36 * k, h * ry * k, c or col, j=.06 if 'cloud' in p else .02)); face(cx, cy, w * .3)
    elif sticker and 'iced tea' in p:
        outlined(lambda k, c: d.polygon([(cx - w * .26 * k, cy - h * .3 * k), (cx + w * .26 * k, cy - h * .3 * k), (cx + w * .19 * k, cy + h * .42 * k), (cx - w * .19 * k, cy + h * .42 * k)], fill=c or (232, 120, 40)))
        d.line([(cx + w * .05, cy - h * .3), (cx + w * .15, cy - h * .48)], fill=(110, 70, 40), width=max(4, w // 40)); face(cx, cy + h * .05, w * .25)
    elif sticker and ('cat' in p or 'boy' in p or 'girl' in p or 'couple' in p or 'arm' in p):
        col = (250, 236, 220) if 'cat' in p else (110, 160, 230)
        if 'arm' in p:
            outlined(lambda k, c: d.rounded_rectangle([cx - w * .08 * k, cy - h * .4 * k, cx + w * .08 * k, cy + h * .3 * k], int(w * .06), fill=c or col)); d.rectangle([cx - w * .12, cy - h * .48, cx + w * .12, cy - h * .3], fill=(232, 120, 40))
        else:
            n = 2 if 'couple' in p else 1
            for i in range(n):
                hx = cx + (i - (n - 1) / 2) * w * .36; sw = 1.4 / n
                hair = (240, 150, 190) if ('girl' in p or 'couple' in p) and i == 0 else (40, 40, 50)
                outlined(lambda k, c, hx=hx: d.rounded_rectangle([hx - w * .16 * k * sw, cy - h * .05 * k, hx + w * .16 * k * sw, cy + h * .45 * k], int(w * .08 * sw), fill=c or col))
                outlined(lambda k, c, hx=hx: d.ellipse([hx - w * .13 * k * sw, cy - h * .38 * k, hx + w * .13 * k * sw, cy - h * .02 * k], fill=c or ((250, 220, 200) if 'cat' not in p else col)))
                if 'cat' in p:
                    d.polygon([(hx - w * .12, cy - h * .3), (hx - w * .06, cy - h * .44), (hx - w * .01, cy - h * .32)], fill=col); d.polygon([(hx + w * .12, cy - h * .3), (hx + w * .06, cy - h * .44), (hx + w * .01, cy - h * .32)], fill=col)
                if 'behind' in p or 'back' in p: d.ellipse([hx - w * .13 * sw, cy - h * .38, hx + w * .13 * sw, cy - h * .05], fill=hair)
                else: face(hx, cy - h * .2, w * .12)
    if sticker and any(k in p for k in ('sun', 'blob', 'cloud', 'flower', 'iced tea', 'cat', 'boy', 'girl', 'couple', 'arm')):
        from PIL import ImageFont
        lab = f'MOCK {a.label}' if a.label else 'MOCK'; f = ImageFont.load_default(size=max(14, min(w, h) // 14)); tb = d.textbbox((0, 0), lab, font=f)
        d.rectangle([cx - (tb[2] - tb[0]) / 2 - 8, h * .86 - 4, cx + (tb[2] - tb[0]) / 2 + 8, h * .86 + tb[3] - tb[1] + 12], fill=(30, 30, 30)); d.text((cx - (tb[2] - tb[0]) / 2, h * .86), lab, font=f, fill=(255, 255, 255))
        img.save(a.out); return
    if 'smartphone' in p:
        d.rounded_rectangle([cx - w * .22, h * .18, cx + w * .26, h * .99], 60, fill=(222, 178, 150))           # the hand
        d.rounded_rectangle([cx - w * .2, h * .08, cx + w * .2, h * .74], 46, fill=(28, 28, 32))               # the phone
        d.rounded_rectangle([cx - w * .17, h * .11, cx + w * .17, h * .71], 30, fill=(18, 19, 24))             # its dark screen
    elif 'tangerine tree' in p or 'fruit tree' in p:
        box(-.03, 0, .03, .45, (120, 100, 85)); blob(w * .42, h * .3, (30, 84, 96), j=.12); cy0 = cy
        for k in range(14): x, y = rnd.uniform(-.33, .33) * w, rnd.uniform(-.24, .2) * h; d.ellipse([cx + x - w * .03, cy0 + y - w * .03, cx + x + w * .03, cy0 + y + w * .03], fill=(236, 110, 30))
    elif 'tangerine fruit' in p:
        blob(w * .36, h * .36, (236, 110, 30), j=.015); tri([(.0, -.36), (.18, -.46), (.06, -.33)], (30, 88, 100))
    elif 'globe' in p:
        box(-.2, .36, .2, .42, (120, 120, 125), .02); box(-.02, .26, .02, .38, (120, 120, 125))
        blob(w * .3, h * .3, (205, 214, 214), j=.0); cyy = cy
        for k in range(5): x, y = rnd.uniform(-.18, .18) * w, rnd.uniform(-.18, .14) * h; r = rnd.uniform(.04, .09) * w; d.ellipse([cx + x - r, cyy + y - r * .7, cx + x + r, cyy + y + r * .7], fill=[(222, 80, 40), (110, 190, 170), (232, 130, 50)][k % 3])
    elif 'human hand' in p:
        box(-.16, -.05, .16, .5, (200, 200, 196), .08)
        for k in range(4): box(-.15 + k * .08, -.42 + abs(k - 1.5) * .04, -.09 + k * .08, .0, (200, 200, 196), .03)
        box(.12, -.12, .3, -.02, (200, 200, 196), .04)
    elif 'tree' in p:
        box(-.03, .05, .03, .48, (110, 96, 84)); blob(w * .38, h * .3, (236, 160, 186) if 'blossom' in p else (30, 84, 96), j=.14)
    elif 'truck' in p or 'car ' in p or 'vehicle' in p:
        box(-.4, -.2, .38, .18, (200, 46, 40), .06); box(-.3, -.32, .2, -.18, (210, 70, 60), .04)
        for x in (-.24, .22): d.ellipse([cx + (x - .08) * w, cy + .1 * h, cx + (x + .08) * w, cy + .1 * h + .16 * w], fill=(40, 40, 44))
    elif 'airplane' in p:
        box(-.42, -.06, .42, .06, (225, 225, 225), .06); tri([(-.08, 0), (.08, 0), (-.18, .32)], (200, 200, 205)); tri([(-.08, 0), (.08, 0), (-.18, -.32)], (200, 200, 205)); tri([(.3, 0), (.42, 0), (.42, -.2)], (232, 110, 40))
    elif 'road sign' in p or 'sign board' in p:
        box(-.03, -.05, .03, .48, (130, 130, 130)); box(-.4, -.42, .4, -.02, (30, 110, 130), .03)
    elif 'gate' in p or 'pagoda' in p or 'chedi' in p or 'temple' in p or 'house' in p or 'building' in p:
        col = (196, 120, 90) if 'brick' in p else (215, 205, 190); box(-.38, -.1, .38, .44, col, .01)
        tri([(-.44, -.08), (.44, -.08), (0, -.46)], (150, 60, 50) if 'temple' in p or 'house' in p else (200, 170, 90))
        for k in range(3): box(-.26 + k * .2, .12, -.16 + k * .2, .44, (90, 80, 76))
    elif 'person' in p or 'people' in p or 'walking' in p:
        d.ellipse([cx - w * .1, h * .06, cx + w * .1, h * .06 + w * .2], fill=(60, 60, 64)); box(-.17, -.3, .17, .12, (232, 110, 40) if 'orange' in p else (70, 70, 76), .06); box(-.13, .1, -.02, .46, (50, 50, 56)); box(.02, .1, .13, .46, (50, 50, 56))
    elif 'ribbon' in p or 'winding road' in p:
        for k in range(26): u = k / 25; x = .25 * np.sin(u * 3.2) * w; y = (.44 - .88 * u) * h; r = (.16 - .1 * u) * w; d.ellipse([cx + x - r, cy + y - r * .5, cx + x + r, cy + y + r * .5], fill=(232, 84, 30))
    elif 'hill' in p or 'ground' in p:
        d.ellipse([-w * .2, h * .18, w * 1.2, h * 1.6], fill=(176, 218, 214) if 'mint' in p else (242, 240, 234))
    elif 'tape' in p or 'mint paper' in p:
        box(-.46, -.16, .46, .16, (156, 214, 200), .01)
    if any(k in p for k in ('tangerine fruit', 'tangerine tree', 'globe', 'human hand', 'tree', 'truck', 'car ', 'vehicle', 'airplane', 'road sign', 'sign board', 'gate', 'pagoda', 'chedi', 'temple', 'house', 'building', 'person', 'people', 'walking', 'ribbon', 'winding road', 'hill', 'ground', 'tape', 'mint paper')):
        from PIL import ImageFont   # a clear label: this is a stand-in, never artwork
        lab = f'MOCK {a.label}' if a.label else 'MOCK'; f = ImageFont.load_default(size=max(14, min(w, h) // 12)); tb = d.textbbox((0, 0), lab, font=f)
        d.rectangle([cx - (tb[2] - tb[0]) / 2 - 8, cy - 4, cx + (tb[2] - tb[0]) / 2 + 8, cy + tb[3] - tb[1] + 12], fill=(30, 30, 30)); d.text((cx - (tb[2] - tb[0]) / 2, cy), lab, font=f, fill=(255, 255, 255))
        img.save(a.out); return
    p = p0
    if 'smartphone' in p:
        d.rounded_rectangle([cx - w * .22, h * .18, cx + w * .26, h * .99], 60, fill=(222, 178, 150))           # the hand
        d.rounded_rectangle([cx - w * .2, h * .08, cx + w * .2, h * .74], 46, fill=(28, 28, 32))               # the phone
        d.rounded_rectangle([cx - w * .17, h * .11, cx + w * .17, h * .71], 30, fill=(18, 19, 24))             # its dark screen
    elif 'circle' in p: blob(w * .38, h * .38, (242, 193, 78))
    elif 'cloud' in p: blob(w * .4, h * .3, (156, 151, 168), j=.08)
    elif 'speech bubble' in p:
        blob(w * .4, h * .32, (226, 115, 90))
        for k in range(2): d.line([(w * .25, h * (.42 + .14 * k)), (w * .5, h * (.4 + .14 * k)), (w * .72 - .1 * w * k, h * (.43 + .14 * k))], fill=(255, 245, 226), width=max(4, w // 70))
    elif 'curved strips' in p:
        for k in range(2): d.arc([w * .25, h * (.15 + .35 * k), w * .75, h * (.45 + .35 * k)], 300, 60, fill=(243, 235, 220), width=max(6, w // 18))
    elif 'strip' in p: d.rectangle([w * .04, h * .2, w * .96, h * .8], fill=(191, 217, 230) if 'blue' in p else (243, 235, 220))
    else: blob(w * .35, h * .35, (200, 160, 120))
    img.save(a.out)


def compare(a):
    """One row per cut-out: on a transparency checker, on white, on dark, and a 3x zoom of its lower edge on dark (where a
    baked shadow or a green fringe shows). For checking a matte by eye: compare --in before.png after.png --labels a,b."""
    from PIL import ImageFont
    ims = [Image.open(f).convert('RGBA') for f in a.inp]; labels = (a.labels or ','.join(f'#{i}' for i in range(len(ims)))).split(',')
    S = a.cell; rows = []
    for im, lab in zip(ims, labels):
        t = im.copy(); t.thumbnail((S, S)); cells = []
        chk = Image.new('RGBA', (S, S)); d = ImageDraw.Draw(chk)
        for y in range(0, S, 16):
            for x in range(0, S, 16): d.rectangle([x, y, x + 15, y + 15], fill=(200, 200, 200, 255) if (x + y) // 16 % 2 else (245, 245, 245, 255))
        for bg in (chk, Image.new('RGBA', (S, S), (255, 255, 255, 255)), Image.new('RGBA', (S, S), (24, 22, 28, 255))):
            c = bg.copy(); c.alpha_composite(t, ((S - t.width) // 2, (S - t.height) // 2)); cells.append(c)
        al = np.asarray(im)[:, :, 3]; ys, xs = np.nonzero(al > 8)
        if len(xs):   # the lower edge of the artwork, magnified
            cy, cx = ys.max(), int(np.median(xs[ys > ys.max() - 6])); r = S // 6
            crop = im.crop((cx - r, cy - r, cx + r, cy + r // 2)).resize((S, int(S * .75)), Image.NEAREST)
            z = Image.new('RGBA', (S, S), (24, 22, 28, 255)); z.alpha_composite(crop, (0, (S - crop.height) // 2)); cells.append(z)
        row = Image.new('RGBA', (S * len(cells) + 8 * len(cells), S + 22), (40, 36, 46, 255))
        for i, c in enumerate(cells): row.paste(c, (i * (S + 8), 22))
        ImageDraw.Draw(row).text((6, 4), lab, fill=(240, 240, 240, 255)); rows.append(row)
    out = Image.new('RGBA', (max(r.width for r in rows), sum(r.height for r in rows)), (40, 36, 46, 255)); y = 0
    for r in rows: out.paste(r, (0, y)); y += r.height
    out.convert('RGB').save(a.out, quality=90)


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); sub = ap.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('matte'); s.add_argument('--in', dest='inp', required=True); s.add_argument('--out', required=True)
    s.add_argument('--mode', default='chroma'); s.add_argument('--key', default='#00B140'); s.add_argument('--tol', type=float, default=1.0); s.add_argument('--margin', type=float, default=.04)
    s.add_argument('--no-unshadow', dest='unshadow', action='store_false')
    s = sub.add_parser('fit'); s.add_argument('--in', dest='inp', required=True); s.add_argument('--out', required=True); s.add_argument('--width', type=int); s.add_argument('--height', type=int); s.add_argument('--cover')
    s = sub.add_parser('screen_glow'); s.add_argument('--base', required=True); s.add_argument('--out', required=True); s.add_argument('--colors', default='#FFF4DE,#F4E6CC')
    s = sub.add_parser('beside'); s.add_argument('--base', required=True); s.add_argument('--source', required=True); s.add_argument('--out', required=True); s.add_argument('--mirror', action='store_true')
    s = sub.add_parser('region'); s.add_argument('--base', required=True); s.add_argument('--source', required=True); s.add_argument('--out', required=True); s.add_argument('--rect', required=True); s.add_argument('--feather', type=float, default=.03)
    s = sub.add_parser('mock'); s.add_argument('--out', required=True); s.add_argument('--prompt', required=True); s.add_argument('--size', required=True); s.add_argument('--seed', type=int, default=0); s.add_argument('--bad', action='store_true'); s.add_argument('--label', default='')
    s = sub.add_parser('compare'); s.add_argument('--in', dest='inp', nargs='+', required=True); s.add_argument('--labels'); s.add_argument('--out', required=True); s.add_argument('--cell', type=int, default=300)
    a = ap.parse_args(); {'compare': compare, 'matte': matte, 'fit': fit, 'screen_glow': screen_glow, 'beside': beside, 'region': region, 'mock': mock}[a.cmd](a)
