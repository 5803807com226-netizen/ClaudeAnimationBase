# Prepare a character PNG for compositing.  python3 prep_character.py in.png|webp out.png
# - Already transparent: keep its alpha. Otherwise (drawn on white): flood-fill the white connected to the border (so
#   white clothing inside the figure stays opaque) and soften that edge by how close each pixel is to white.
# - Edge pixels (partly transparent) often carry noisy colour (compression fringes): repaint them with the colour of
#   their nearest solid neighbours, so they blend cleanly onto any background.
import sys
from collections import deque
import numpy as np
from PIL import Image, ImageFilter
im = Image.open(sys.argv[1]).convert('RGBA'); w, h = im.size
px = np.asarray(im).astype(np.float32); rgb, alpha = px[..., :3], px[..., 3] / 255
if alpha[[0, 0, -1, -1], [0, -1, 0, -1]].max() > .9:          # opaque corners: a white background to remove
    near_white = rgb.min(axis=2) >= 236
    bg = np.zeros((h, w), bool); q = deque((x, y) for x in range(w) for y in (0, h - 1)); q.extend((x, y) for y in range(h) for x in (0, w - 1))
    while q:
        x, y = q.popleft()
        if bg[y, x] or not near_white[y, x]: continue
        bg[y, x] = True
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not bg[ny, nx]: q.append((nx, ny))
    band = np.asarray(Image.fromarray((bg * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))) > 0
    soft = np.clip((250 - rgb @ np.array([.299, .587, .114], np.float32)) / 70, 0, 1)
    alpha = np.where(bg, 0, np.where(band, soft, 1)).astype(np.float32)
solid = (alpha > .85).astype(np.float32)
blur = lambda a: np.asarray(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'L').filter(ImageFilter.GaussianBlur(3))).astype(np.float32)
fill = np.dstack([blur(rgb[..., c] * solid) for c in range(3)]) / np.maximum(blur(solid * 255) / 255, 1e-3)[..., None]
rgb = np.where((alpha <= .85)[..., None], fill, rgb)
alpha = np.where(alpha < .08, 0, alpha)
out = Image.fromarray(np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8), 'RGBA')
out = out.crop(out.getchannel('A').getbbox()); out.save(sys.argv[2]); print(sys.argv[2], out.size)
