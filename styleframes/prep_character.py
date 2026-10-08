# Prepare a character PNG on a white background: flood-fill the white connected to the image border to transparency,
# with a soft edge, so white clothing inside the figure stays opaque.  python3 prep_character.py in.png out.png
import sys
from collections import deque
from PIL import Image, ImageFilter
im = Image.open(sys.argv[1]).convert('RGBA'); w, h = im.size; px = im.load()
white = lambda p: min(p[:3]) >= 238
bg = bytearray(w * h); q = deque()
for x in range(w):
    for y in (0, h - 1): q.append((x, y))
for y in range(h):
    for x in (0, w - 1): q.append((x, y))
while q:
    x, y = q.popleft(); i = y * w + x
    if bg[i] or not white(px[x, y]): continue
    bg[i] = 1
    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
        if 0 <= nx < w and 0 <= ny < h and not bg[ny * w + nx]: q.append((nx, ny))
mask = Image.frombytes('L', (w, h), bytes(0 if b else 255 for b in bg)).filter(ImageFilter.GaussianBlur(1.2))
im.putalpha(mask); im = im.crop(im.getbbox()); im.save(sys.argv[2]); print(sys.argv[2], im.size)
