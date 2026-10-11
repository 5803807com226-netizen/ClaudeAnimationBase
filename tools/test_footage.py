"""tools/test_footage.py: checks for tools/footage.py tracking on synthetic plates (no video needed).
    python tools/test_footage.py"""
import sys as _sys
for _s in (_sys.stdout, _sys.stderr):   # Windows: a piped stdout is cp1252 and cannot print → or Thai; always UTF-8
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass
import os, sys, tempfile, json
import numpy as np
from PIL import Image, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import footage as F

ok = True
def check(name, cond, info=''):
    global ok; ok &= bool(cond); print(('PASS' if cond else 'FAIL') + '  ' + name + (f'  ({info})' if info else ''))

rng = np.random.default_rng(3)
world = np.asarray(Image.fromarray((rng.random((700, 1100)) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.5)), np.float32)
a = world[100:460, 100:740]; b = world[100 - 6:460 - 6, 100 + 9:740 + 9]   # the content moved 9 px left, 6 px down
dx, dy = F.phase_shift(a, b)
check('phase correlation measures a camera move (direction and size, sub-pixel)', abs(dx + 9) < .2 and abs(dy - 6) < .2, f'{dx:.2f}, {dy:.2f}')

# a plate where the camera pans 4 px/frame right while a bright square moves 10 px/frame across it
d = tempfile.mkdtemp(); n = 12
for i in range(n):
    fr = world[150:150 + 270, 80 + 4 * i: 80 + 4 * i + 480].copy()
    x0 = 60 + 10 * i; fr[120:150, x0:x0 + 30] = 255 - fr[120:150, x0:x0 + 30] * .2
    Image.fromarray(fr.astype(np.uint8)).convert('RGB').save(f'{d}/f{i + 1:05d}.jpg', quality=95)
json.dump({'fps': 24, 'size': [480, 270], 'frames': n, 'duration': n / 24}, open(f'{d}/meta.json', 'w'))
class A: pass
args = A(); args.dir = d + '/'; args.work = 480; args.point = [f'sq:0:{75 / 480}:{135 / 270}:{36 / 480}']
F.track(args); T = json.load(open(f'{d}/track.json'))
gx = T['global'][-1][0] * 480
check('global track follows the background, not the moving object: drifts left 4 px per frame', abs(gx + 4 * (n - 1)) < 1.5, f'{gx:.1f} px over {n - 1} frames')
p = T['points']['sq'][-1]
check('point track follows a moving object (10 px per frame in the frame)', abs(p[0] * 480 - (75 + 10 * (n - 1))) < 3 and p[2] > .6, f'x {p[0] * 480:.1f}, conf {p[2]}')
check('footage.js is written for the page', os.path.exists(f'{d}/footage.js') and 'FOOTAGE_DATA' in open(f'{d}/footage.js').read())
print('all passed' if ok else 'FAILED'); sys.exit(0 if ok else 1)
