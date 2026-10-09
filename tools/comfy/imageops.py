"""tools/comfy/imageops.py: image steps for tools/gen_assets.mjs (PIL + NumPy; both ship with ComfyUI's Python).

  matte   --in raw.png --out cut.png [--mode chroma|rembg] [--key #00B140] [--tol 1.0] [--margin .04]
          remove a flat chroma background (soft alpha, green spill removed), crop to the artwork, pad a clear margin
  fit     --in a.png --out b.png --width W | --height H [--cover W:H]   upscale (Lanczos) to at least W wide / H tall; --cover crops
  screen_glow --base hand.png --out glow.png [--colors #FFF4DE,#F4E6CC]
          find the phone's dark screen inside the cut-out and paint a soft lit screen ON THE SAME CANVAS (so it aligns)
  beside  --base hand.png --source ticks.png --out buzz.png [--mirror]
          place the source beside the phone (and a mirrored copy on the other side) on the base's canvas
  mock    --out raw.png --prompt "..." --size W,H --seed N [--bad]
          a synthetic stand-in image for TESTING the pipeline without an image model (never story artwork)
Exit code 0 on success; errors go to stderr.
"""
import argparse, hashlib, sys
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


def matte(a):
    img = Image.open(a.inp).convert('RGB')
    if a.mode == 'rembg':
        from rembg import remove   # optional: pip install rembg
        cut = remove(img).convert('RGBA')
    else:
        px = np.asarray(img).astype(np.float32)
        # how green-dominant each pixel is: the chroma background is strongly so (#00B140 → 113); paper, skin, coral,
        # sky blue and grey are not (≤ ~15). Keep the key colour for documentation; dominance is what separates them.
        g_dom = px[:, :, 1] - np.maximum(px[:, :, 0], px[:, :, 2])
        t0, t1 = 30 * a.tol, 75 * a.tol
        alpha = 1 - np.clip((g_dom - t0) / (t1 - t0), 0, 1)
        # despill: edge pixels keep no more green than their other channels allow
        px[:, :, 1] = np.where(g_dom > 0, np.minimum(px[:, :, 1], np.maximum(px[:, :, 0], px[:, :, 2]) + 4), px[:, :, 1])
        if (alpha < .5).mean() < .03:   # nothing to key out: the model ignored the chroma background (white, grey, a scene...)
            raise SystemExit('no chroma background found in the generated image (the model ignored the green background); regenerate it')
        al = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(.8))
        cut = Image.fromarray(np.clip(px, 0, 255).astype(np.uint8)).convert('RGBA'); cut.putalpha(al)
    crop_pad(cut, a.margin).save(a.out)


def fit(a):
    img = Image.open(a.inp)
    if a.cover:
        rw, rh = map(float, a.cover.split(':')); r = rw / rh
        if img.width / img.height > r: w = int(img.height * r); x = (img.width - w) // 2; img = img.crop((x, 0, x + w, img.height))
        else: h = int(img.width / r); y = (img.height - h) // 2; img = img.crop((0, y, img.width, y + h))
    if a.width and img.width < a.width:
        img = img.resize((a.width, round(img.height * a.width / img.width)), Image.LANCZOS)
    if a.height and img.height < a.height:
        img = img.resize((round(img.width * a.height / img.height), a.height), Image.LANCZOS)
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


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); sub = ap.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('matte'); s.add_argument('--in', dest='inp', required=True); s.add_argument('--out', required=True)
    s.add_argument('--mode', default='chroma'); s.add_argument('--key', default='#00B140'); s.add_argument('--tol', type=float, default=1.0); s.add_argument('--margin', type=float, default=.04)
    s = sub.add_parser('fit'); s.add_argument('--in', dest='inp', required=True); s.add_argument('--out', required=True); s.add_argument('--width', type=int); s.add_argument('--height', type=int); s.add_argument('--cover')
    s = sub.add_parser('screen_glow'); s.add_argument('--base', required=True); s.add_argument('--out', required=True); s.add_argument('--colors', default='#FFF4DE,#F4E6CC')
    s = sub.add_parser('beside'); s.add_argument('--base', required=True); s.add_argument('--source', required=True); s.add_argument('--out', required=True); s.add_argument('--mirror', action='store_true')
    s = sub.add_parser('mock'); s.add_argument('--out', required=True); s.add_argument('--prompt', required=True); s.add_argument('--size', required=True); s.add_argument('--seed', type=int, default=0); s.add_argument('--bad', action='store_true')
    a = ap.parse_args(); {'matte': matte, 'fit': fit, 'screen_glow': screen_glow, 'beside': beside, 'mock': mock}[a.cmd](a)
