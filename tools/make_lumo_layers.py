# Generates Lumo's cutout layers (transparent PNGs) into assets/characters/lumo/. These are stand-in artwork made in
# code; an illustrator's layers with the same file names, sizes (in units) and anchors replace them without touching
# any animation code (see src/characters/lumo.js for the anchors).  python3 tools/make_lumo_layers.py
import os, random
from PIL import Image, ImageDraw, ImageFilter, ImageChops

S, SS = 200, 2                     # pixels per character unit, supersampling
OUT = 'assets/characters/lumo'
INK, PAPER, PAPER_LIT, RIB, SHADE, CAP, CAP_LIT, WIRE = (43, 34, 51), (244, 211, 156), (255, 240, 200), (215, 158, 92), (217, 160, 94), (168, 74, 59), (204, 104, 84), (58, 51, 64)

def canvas(wu, hu): return Image.new('RGBA', (int(wu * S * SS), int(hu * S * SS)), (0, 0, 0, 0))
def P(*v): return [int(x * S * SS) for x in v]
def box(cx, cy, rx, ry): return P(cx - rx, cy - ry, cx + rx, cy + ry)
def finish(im, name, grain=True):
    im = im.resize((im.width // SS, im.height // SS), Image.LANCZOS)
    if grain:   # paper grain inside the shape
        rnd = random.Random(name); n = Image.new('L', im.size)
        n.putdata([235 + rnd.randint(0, 20) for _ in range(im.width * im.height)])
        r, g, b, a = im.split(); r, g, b = [ImageChops.multiply(c, n) for c in (r, g, b)]; im = Image.merge('RGBA', (r, g, b, a))
    im.save(f'{OUT}/{name}.png'); print(name, im.size)
def radial(size, center, radius, color, alpha):
    m = Image.new('L', size); d = ImageDraw.Draw(m)
    for i in range(40, 0, -1): d.ellipse([center[0] - radius * i / 40, center[1] - radius * i / 40, center[0] + radius * i / 40, center[1] + radius * i / 40], fill=int(alpha * (1 - i / 40) ** .8))
    layer = Image.new('RGBA', size, color + (0,)); layer.putalpha(m); return layer

os.makedirs(OUT, exist_ok=True)
lw = lambda u: max(2, int(u * S * SS))

# body: a paper lantern, 2.0 × 2.7 units, anchor at its centre (1.0, 1.35)
im = canvas(2.0, 2.7); d = ImageDraw.Draw(im)
body = box(1.0, 1.35, .82, .95)
d.ellipse(body, fill=PAPER + (255,), outline=INK + (255,), width=lw(.035))
mask = Image.new('L', im.size); ImageDraw.Draw(mask).ellipse(body, fill=255)
glow = radial(im.size, (P(.9)[0], P(1.25)[0]), P(.8)[0], PAPER_LIT, 230); im.alpha_composite(Image.composite(glow, Image.new('RGBA', im.size), mask))
sh = Image.new('RGBA', im.size); ImageDraw.Draw(sh).ellipse(box(1.45, 1.4, .55, .95), fill=SHADE + (120,)); sh = sh.filter(ImageFilter.GaussianBlur(P(.08)[0]))
im.alpha_composite(Image.composite(sh, Image.new('RGBA', im.size), mask))
d = ImageDraw.Draw(im)
for k in (1, 2, 3): d.ellipse(box(1.0, 1.35, .82 * k / 3.6, .93), outline=RIB + (255,), width=lw(.016))   # ribs
for y in (.75, 1.35, 1.95): d.arc(box(1.0, y, .8 * (1 - abs(y - 1.35) * .35), .12), 0, 180, fill=RIB + (200,), width=lw(.012))
d.ellipse(box(1.0, 1.35, .82, .95), outline=INK + (255,), width=lw(.035))
for cy, w in ((.36, .45), (2.34, .4)):   # caps
    d.rounded_rectangle(P(1.0 - w, cy - .11, 1.0 + w, cy + .11), radius=P(.07)[0], fill=CAP + (255,), outline=INK + (255,), width=lw(.03))
    d.rounded_rectangle(P(1.0 - w + .06, cy - .07, 1.0 - w + .3, cy - .02), radius=P(.02)[0], fill=CAP_LIT + (255,))
d.ellipse(box(.62, .9, .14, .07), fill=(255, 255, 255, 120))
finish(im, 'body')

# eyes (one layer per expression), 1.0 × .5 units, anchor (.5, .25)
for name in ('open', 'wide', 'happy', 'blink'):
    im = canvas(1.0, .5); d = ImageDraw.Draw(im)
    for ex in (.3, .7):
        if name == 'open':
            d.ellipse(box(ex, .25, .085, .11), fill=INK + (255,)); d.ellipse(box(ex - .03, .2, .028, .028), fill=(255, 255, 255, 255))
        elif name == 'wide':
            d.ellipse(box(ex, .25, .13, .15), fill=(255, 252, 240, 255), outline=INK + (255,), width=lw(.022)); d.ellipse(box(ex, .27, .07, .085), fill=INK + (255,)); d.ellipse(box(ex - .025, .23, .022, .022), fill=(255, 255, 255, 255))
        elif name == 'happy':
            d.arc(box(ex, .3, .1, .09), 180, 360, fill=INK + (255,), width=lw(.03))
        else:
            d.arc(box(ex, .2, .1, .07), 20, 160, fill=INK + (255,), width=lw(.03))
    finish(im, f'eyes_{name}', grain=False)

# mouths, .5 × .35 units, anchor (.25, .12)
for name in ('smile', 'o', 'open'):
    im = canvas(.5, .35); d = ImageDraw.Draw(im)
    if name == 'smile': d.arc(box(.25, .06, .1, .08), 30, 150, fill=INK + (255,), width=lw(.025))
    elif name == 'o': d.ellipse(box(.25, .14, .05, .065), fill=(122, 53, 64, 255), outline=INK + (255,), width=lw(.02))
    else: d.chord(box(.25, .08, .12, .16), 0, 180, fill=(122, 53, 64, 255), outline=INK + (255,), width=lw(.022))
    finish(im, f'mouth_{name}', grain=False)

# leg: a wire leg with a round boot, .36 × .9 units, anchor at the hip (.18, .04)
im = canvas(.36, .9); d = ImageDraw.Draw(im)
d.line(P(.18, .04, .19, .66), fill=WIRE + (255,), width=lw(.07))
d.ellipse(box(.21, .72, .15, .1), fill=CAP + (255,), outline=INK + (255,), width=lw(.025)); d.ellipse(box(.16, .69, .05, .025), fill=CAP_LIT + (255,))
finish(im, 'leg')

# arm: a wire arm with a mitten, .62 × .24 units, anchor at the shoulder (.04, .12)
im = canvas(.62, .24); d = ImageDraw.Draw(im)
d.line(P(.04, .12, .45, .12), fill=WIRE + (255,), width=lw(.06))
d.ellipse(box(.5, .12, .085, .085), fill=CAP + (255,), outline=INK + (255,), width=lw(.022))
finish(im, 'arm')

# handle: the wire loop on top, .7 × .55 units, anchor at its base (.35, .52)
im = canvas(.7, .55); d = ImageDraw.Draw(im)
d.arc(box(.35, .5, .25, .42), 180, 360, fill=WIRE + (255,), width=lw(.035)); d.ellipse(box(.35, .09, .05, .05), outline=WIRE + (255,), width=lw(.025))
finish(im, 'handle', grain=False)
