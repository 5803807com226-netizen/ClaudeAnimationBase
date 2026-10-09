"""tools/comfy/test_matte.py: regression test for imageops.matte on a synthetic source with the defects seen in real
Z-Image output: detached grey/green specks, green spill on a fibrous torn edge, a shadow cast on the green, and (second
case) a neutral grey shadow. Prints numbers and PASS/FAIL; writes before/after sheets to out/test/matte/.
  python tools/comfy/test_matte.py [--old <path to a previous imageops.py>]"""
import json, subprocess, sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

D = 'out/test/matte/'; os.makedirs(D, exist_ok=True); PY = sys.executable
OLD = sys.argv[sys.argv.index('--old') + 1] if '--old' in sys.argv else None
YEL = np.array([242, 193, 78.])

def source(neutral_shadow=False, seed=3, hard=False):
    rnd = np.random.default_rng(seed); n = 1024; yy, xx = np.mgrid[0:n, 0:n]
    bg = np.stack([np.zeros((n, n)), 168 + 18 * (xx / n) + rnd.normal(0, 3, (n, n)), 60 + rnd.normal(0, 3, (n, n))], -1)
    cx = cy = n / 2; r0 = 330; ang = np.arctan2(yy - cy, xx - cx); dist = np.hypot(yy - cy, xx - cx)
    edge = r0 * (1 + .018 * np.sin(ang * 23) + .012 * np.sin(ang * 61 + 1))
    # the baked shadow, under the lower right: on the green (darker green) or neutral grey
    sh = np.clip(1 - np.hypot((yy - cy - 38) / 1.0, (xx - cx - 22)) / (r0 + 20), 0, 1) ** .4 * (dist > edge - 2)
    if hard: sh = np.clip((sh - .1) * 3, 0, 1)                                    # a solid grey shadow band, no green left in it
    if neutral_shadow: bg = bg * (1 - sh[..., None]) + np.array([62, 60, 58.]) * sh[..., None]
    else: bg = bg * (1 - .55 * sh[..., None])
    paper = YEL + rnd.normal(0, 6, (n, n, 1)) * np.array([1, .9, .6])
    inside = np.clip((edge - dist) + .5, 0, 1)
    img = bg * (1 - inside[..., None]) + paper * inside[..., None]
    spill = np.clip(1 - np.abs(dist - edge) / 4, 0, 1) * (dist < edge)          # green bleeding into the paper's edge
    img[..., 1] += 40 * spill; img[..., 0] -= 25 * spill
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)); d = ImageDraw.Draw(im)
    fib = []
    for k in range(60):                                                          # white paper fibres poking out of the tear
        a = rnd.uniform(0, 2 * np.pi); r1 = r0 * (1 + .018 * np.sin(a * 23)) - 2; L = rnd.uniform(5, 12)
        p0 = (cx + np.cos(a) * r1, cy + np.sin(a) * r1); p1 = (cx + np.cos(a + .01) * (r1 + L), cy + np.sin(a + .01) * (r1 + L)); fib.append(p1)
        d.line([p0, p1], fill=(250, 244, 226), width=1)
    for k in range(260):                                                         # detached specks in the background
        x, y = rnd.uniform(0, n, 2)
        if np.hypot(x - cx, y - cy) < r0 + 40: continue
        s = rnd.uniform(.6, 2.5); c = tuple(int(v) for v in ([118, 120, 116] if k % 2 else [70, 130, 80]))
        d.ellipse([x - s, y - s, x + s, y + s], fill=c)
    return im, fib

def run(script, raw, out, extra=()):
    r = subprocess.run([PY, script, 'matte', '--in', raw, '--out', out, '--margin', '0', *extra], capture_output=True, text=True)
    if r.returncode: print(r.stderr); raise SystemExit(1)
    try: return json.loads(r.stdout.strip().splitlines()[-1])
    except Exception: return {}

def measure(path):
    im = np.asarray(Image.open(path).convert('RGBA')).astype(float); A = im[..., 3] / 255; rgb = im[..., :3]
    sys.path.insert(0, 'tools/comfy'); from imageops import label
    lab, areas = label(A > .04); big = areas[1:].max() if len(areas) > 1 else 0
    detached = int(((areas[1:] > 0) & (areas[1:] < big)).sum())
    vis = A > .08; edge = vis & (A < .92)
    # green tint: green is (about) the top channel AND clearly above the lowest one (catches olive-grey fringes; yellow,
    # cream, coral, skin, sky blue and lavender never match)
    green = (rgb[..., 1] >= np.maximum(rgb[..., 0], rgb[..., 2]) - 2) & (rgb[..., 1] - np.minimum(rgb[..., 0], rgb[..., 2]) > 25) & vis
    core = A > .99; ys, xs = np.nonzero(core)
    interior = np.zeros_like(core); cy, cx = ys.mean(), xs.mean(); yy, xx = np.mgrid[0:A.shape[0], 0:A.shape[1]]
    interior = core & (np.hypot(yy - cy, xx - cx) < 200)
    lower = (A > .5) & (yy > cy + 300)                                           # the band where the shadow would be
    return dict(detached=detached, green_visible=round(green.sum() / max(1, vis.sum()), 4), green_edge=round((green & edge).sum() / max(1, edge.sum()), 4),
                colour_shift=round(float(np.abs(rgb[interior].mean(0) - YEL).max()), 1), dark_lower=round(float(((rgb.mean(-1) < 120) & lower).sum() / max(1, lower.sum())), 4),
                halo=round(float(((A > .02) & (A < .6) & (rgb[..., 0] > rgb[..., 1] + 30) & (rgb[..., 2] > rgb[..., 1] + 10)).sum() / max(1, vis.sum())), 4),
                fibre_pink=round(float(((A > .5) & (np.hypot(yy - cy, xx - cx) > 336) & (rgb[..., 2] > 180) & (rgb[..., 0] - rgb[..., 1] > 25)).sum() / max(1, ((A > .5) & (np.hypot(yy - cy, xx - cx) > 336) & (rgb[..., 2] > 180)).sum())), 3),
                fibres=int(((A > .5) & (np.hypot(yy - cy, xx - cx) > 336)).sum()))   # strands beyond the torn edge (r0 330 + 2 %)

# the fibre pixels drawn beyond the edge in the source, for the 'fibres kept' check
def fibre_px():
    im, _ = source(); px = np.asarray(im).astype(int); n = px.shape[0]; yy, xx = np.mgrid[0:n, 0:n]
    return int(((px[..., 0] > 240) & (px[..., 2] > 200) & (np.hypot(yy - n / 2, xx - n / 2) > 336)).sum())
FIB = fibre_px()
ok = True
for case in ('shadow_on_green', 'neutral_shadow', 'hard_neutral_shadow'):
    raw, fib = source(neutral_shadow=case != 'shadow_on_green', hard=case.startswith('hard')); rp = f'{D}{case}_raw.png'; raw.save(rp)
    rows, labels = [], []
    if OLD:
        run(OLD, rp, f'{D}{case}_old.png'); m0 = measure(f'{D}{case}_old.png'); print(f'{case} BEFORE: {m0}'); rows.append(f'{D}{case}_old.png'); labels.append('before')
    rep = run('tools/comfy/imageops.py', rp, f'{D}{case}_new.png'); m = measure(f'{D}{case}_new.png'); print(f'{case} AFTER:  {m}  report {rep}')
    rows.append(f'{D}{case}_new.png'); labels.append('after')
    checks = [('no detached specks', m['detached'] == 0), ('no green on visible pixels (< 0.3 %)', m['green_visible'] < .003),
              ('no green fringe on the edge (< 2 %)', m['green_edge'] < .02), ('yellow paper unchanged (< 8 levels)', m['colour_shift'] < 8),
              ('torn-paper fibres kept (> 70 % of the drawn strands)', m['fibres'] > .7 * FIB), ('no dark baked shadow left', m['dark_lower'] < .03 or rep.get('shadow_suspect')),
              ('no tinted halo where the shadow was (pink / magenta)', m['halo'] < .002), ('fibres keep their colour (no pink cast)', m['fibre_pink'] < .1)]
    for name, p in checks: print(f'  {"PASS" if p else "FAIL"}  {name}'); ok &= bool(p)
    subprocess.run([PY, 'tools/comfy/imageops.py', 'compare', '--in', *rows, '--labels', ','.join(labels), '--out', f'{D}{case}_compare.jpg'], check=True)
print('all passed' if ok else 'FAILED'); sys.exit(0 if ok else 1)
