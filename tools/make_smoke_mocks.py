"""tools/make_smoke_mocks.py: labelled MOCK stand-ins for The Last Smoke, to test the rig, the walk and every shot's motion
BEFORE real artwork exists. Every image is stamped MOCK. Written ONLY to out/mock_assets/the_last_smoke/ (never the real
art folder). Sizes, anchors and joints come from src/stories/the_last_smoke/rig_spec.js, so a real part generated to
the same spec drops in unchanged. Character asymmetry is honoured: LEFT-cheek scar, LEFT-forearm bandage, staff in RIGHT hand.

    python tools/make_smoke_mocks.py [--out out/mock_assets/the_last_smoke]
    node render.mjs --story=the_last_smoke --assets=out/mock_assets/the_last_smoke/ --sheet=0.5,3.5,6.5,9.5,12.5
"""
import sys as _sys
for _s in (_sys.stdout, _sys.stderr):   # Windows: a piped stdout is cp1252 and cannot print → or Thai; always UTF-8
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass
import json, math, os, random, re, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else os.path.join(ROOT, 'out/mock_assets/the_last_smoke')
src = open(os.path.join(ROOT, 'src/stories/the_last_smoke/rig_spec.js'), encoding='utf-8').read()
SPEC = json.loads(src[src.index('=', src.index('window.SMOKE_RIG')) + 1:src.rindex(';')])
PX = 60   # mock resolution per u (real parts are generated at SPEC.px_per_u)

SKIN, SKIN_D = (176, 120, 86), (140, 92, 64)
TUNIC, TUNIC_D = (226, 214, 188), (186, 170, 140)
MANTLE, MANTLE_D = (122, 88, 60), (92, 64, 44)
HAIR, BEARD = (196, 196, 200), (120, 118, 122)
WRAP, BAND = (150, 128, 98), (244, 240, 228)
STAFF, STAFF_D = (118, 82, 50), (84, 56, 34)
INK = (48, 36, 30)
try:
    FONT = ImageFont.truetype('DejaVuSans-Bold.ttf', 14)
except OSError:
    FONT = ImageFont.load_default()


def canvas(w, h):
    return Image.new('RGBA', (max(4, round(w * PX)), max(4, round(h * PX))), (0, 0, 0, 0))


def P(x, y):
    return (x * PX, y * PX)


def stamp(im, text='MOCK'):
    d = ImageDraw.Draw(im)
    bb = im.getbbox() or (0, 0, im.width, im.height)
    x, y = (bb[0] + bb[2]) // 2, (bb[1] + bb[3]) // 2
    d.text((x, y), text, fill=(255, 40, 120, 230), font=FONT, anchor='mm', stroke_width=2, stroke_fill=(255, 255, 255, 200))
    return im


def save(im, rel, text='MOCK'):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    stamp(im, text).save(path)
    return path


def capsule(d, x0, y0, x1, y1, r0, r1, fill, ink=INK):
    """a tapered limb from (x0,y0) radius r0 to (x1,y1) radius r1, in u"""
    a = math.atan2(y1 - y0, x1 - x0) + math.pi / 2
    pts = [P(x0 + math.cos(a) * r0, y0 + math.sin(a) * r0), P(x1 + math.cos(a) * r1, y1 + math.sin(a) * r1),
           P(x1 - math.cos(a) * r1, y1 - math.sin(a) * r1), P(x0 - math.cos(a) * r0, y0 - math.sin(a) * r0)]
    d.polygon(pts, fill=fill, outline=ink, width=2)
    for (x, y, r) in ((x0, y0, r0), (x1, y1, r1)):
        d.ellipse([*P(x - r, y - r), *P(x + r, y + r)], fill=fill, outline=ink, width=2)


def body_parts():
    B = {p['name']: p for p in SPEC['body']['parts']}
    made = []
    for name, p in B.items():
        im = canvas(p['w'], p['h']); d = ImageDraw.Draw(im); ax, ay = p['anchor']; w, h = p['w'], p['h']
        far = name.endswith('_l')
        tone = (lambda c: tuple(int(v * .78) for v in c)) if far else (lambda c: c)
        if name == 'pelvis':
            d.rounded_rectangle([*P(.05, .05), *P(w - .05, h - .05)], radius=.3 * PX, fill=TUNIC_D, outline=INK, width=2)
            d.line([*P(.1, .35), *P(w - .1, .35)], fill=WRAP, width=6)                      # rope belt
        elif name == 'torso':
            d.polygon([P(ax - .5, ay), P(ax + .55, ay), P(ax + .7, .55), P(ax - .55, .35)], fill=TUNIC, outline=INK)
            d.polygon([P(ax - .62, .3), P(ax + .78, .5), P(ax + .65, 1.55), P(ax - .6, 1.4)], fill=MANTLE, outline=INK)  # mantle
            d.line([*P(ax + .5, .6), *P(ax - .45, 2.2)], fill=STAFF_D, width=5)              # satchel strap (crossbody)
        elif name == 'head':   # RIGHT profile, facing +x; the scar is on the far (LEFT) cheek: not drawn here
            d.ellipse([*P(.05, .15), *P(1.05, 1.25)], fill=SKIN, outline=INK, width=2)
            d.polygon([P(.95, .55), P(1.25, .78), P(.98, .86)], fill=SKIN, outline=INK)        # long, slightly hooked nose
            d.pieslice([*P(.35, .7), *P(1.1, 1.45)], 0, 180, fill=BEARD, outline=INK)          # short beard
            d.ellipse([*P(.78, .55), *P(.88, .63)], fill=INK)                                  # eye
            d.ellipse([*P(.32, .6), *P(.5, .85)], fill=SKIN_D, outline=INK)                    # ear
            d.rectangle([*P(ax - .2, 1.15), *P(ax + .15, h)], fill=SKIN_D)                     # neck stub
        elif name in ('hair_back', 'hair_front'):
            if name == 'hair_back':
                d.ellipse([*P(.25, .05), *P(.85, .55)], fill=HAIR, outline=INK, width=2)        # half-up knot
                for i in range(5):
                    d.line([*P(.55, .4), *P(.1 + i * .1, .95)], fill=HAIR, width=4)            # loose strands
            else:
                d.chord([*P(.05, .05), *P(.9, .5)], 180, 360, fill=HAIR, outline=INK)
        elif name == 'scarf_back':   # torn tail trailing behind (to -x)
            d.polygon([P(ax, .05), P(ax + .1, .3), P(.35, h - .25), P(.05, h - .05), P(.22, h - .5), P(.12, h - .7)], fill=(96, 90, 80), outline=INK)
        elif name == 'scarf_front':
            d.polygon([P(.1, .05), P(.65, .05), P(.55, h - .1), P(.35, h - .25), P(.2, h - .05)], fill=(110, 102, 90), outline=INK)
        elif name == 'satchel':
            d.rounded_rectangle([*P(.08, .2), *P(w - .08, h - .05)], radius=.12 * PX, fill=(132, 96, 62), outline=INK, width=2)
            d.polygon([P(.08, .2), P(w - .08, .2), P(w - .2, .55), P(.2, .55)], fill=(112, 80, 52), outline=INK)
        elif name == 'robe_hem':
            pts = [P(.25, .05), P(w - .25, .05), P(w - .05, h - .2)]
            for i in range(7):
                pts.append(P(w - .05 - i * (w - .1) / 6, h - (.05 if i % 2 else .3)))
            d.polygon(pts, fill=TUNIC, outline=INK)
        elif name.startswith('thigh'):
            capsule(d, ax, ay, ax, h - .12, .26, .2, tone(TUNIC_D))
        elif name.startswith('calf'):
            capsule(d, ax, ay, ax, h - .12, .2, .14, tone(SKIN))
            for i in range(5):
                y = .9 + i * .18; d.line([*P(ax - .19, y), *P(ax + .19, y + .07)], fill=tone(WRAP), width=4)   # shin wraps
        elif name.startswith('foot'):
            d.polygon([P(.05, .3), P(.2, .05), P(.45, .1), P(1.0, .32), P(.98, .44), P(.05, .44)], fill=tone(SKIN_D), outline=INK)
            d.line([*P(.05, .43), *P(1.0, .43)], fill=tone(WRAP), width=5)                      # sole
        elif name.startswith('upper_arm'):
            capsule(d, ax, ay, ax, h - .14, .22, .18, tone(MANTLE))
        elif name == 'forearm_l':   # the LEFT forearm carries the linen bandage
            capsule(d, ax, ay, ax, h - .14, .18, .14, tone(SKIN))
            for i in range(4):
                y = .45 + i * .16; d.rectangle([*P(ax - .19, y), *P(ax + .19, y + .1)], fill=BAND, outline=INK)
        elif name == 'forearm_r':
            capsule(d, ax, ay, ax, h - .14, .18, .14, tone(SKIN))
        elif name.startswith('hand'):
            d.rounded_rectangle([*P(ax - .2, .02), *P(ax + .22, h - .05)], radius=.14 * PX, fill=tone(SKIN), outline=INK, width=2)
            if name == 'hand_r':
                for i in range(4):   # curled fingers around the staff
                    y = .2 + i * .09; d.line([*P(ax - .2, y), *P(ax + .2, y)], fill=INK, width=2)
        elif name == 'staff':        # knotted cedar staff with a Y-knob; the grip sits at the anchor
            d.line([*P(ax, .45), *P(ax, h - .05)], fill=STAFF, width=int(.14 * PX))
            d.line([*P(ax, .5), *P(ax - .14, .05)], fill=STAFF, width=int(.1 * PX))
            d.line([*P(ax, .5), *P(ax + .15, .08)], fill=STAFF, width=int(.1 * PX))
            for y in (1.6, 2.7, 3.9, 4.8):
                d.ellipse([*P(ax - .1, y), *P(ax + .1, y + .14)], fill=STAFF_D)
        made.append(save(im, SPEC['body']['dir'] + p['file']))
    return made


def overlay_rigs():
    made = []
    # S01 hero 3/4 (facing the viewer, turned slightly): his RIGHT hand (viewer's left) holds the staff, LEFT forearm bandage
    C = SPEC['hero3q']['canvas']; w, h = C
    body = canvas(w, h); d = ImageDraw.Draw(body)
    capsule(d, 1.05, 4.6, 1.0, 8.6, .26, .16, TUNIC_D); capsule(d, 1.55, 4.6, 1.6, 8.6, .26, .16, TUNIC_D)
    d.polygon([P(.55, 2.2), P(2.05, 2.2), P(2.2, 5.6), P(.4, 5.6)], fill=TUNIC, outline=INK)
    d.polygon([P(.45, 2.05), P(2.15, 2.05), P(2.05, 3.3), P(.55, 3.2)], fill=MANTLE, outline=INK)
    capsule(d, .5, 2.4, .35, 4.6, .2, .15, MANTLE)                                          # his RIGHT arm (viewer left)
    capsule(d, 2.1, 2.4, 2.25, 4.5, .2, .15, SKIN)                                         # his LEFT arm, bandaged
    for i in range(3):
        y = 3.6 + i * .2; d.rectangle([*P(2.05, y), *P(2.42, y + .12)], fill=BAND, outline=INK)
    d.line([*P(.3, 1.4), *P(.25, 8.75)], fill=STAFF, width=int(.13 * PX))                  # staff in his RIGHT hand
    d.ellipse([*P(.18, 4.4), *P(.48, 4.8)], fill=SKIN, outline=INK)
    d.rounded_rectangle([*P(1.75, 4.3), *P(2.35, 4.95)], radius=8, fill=(132, 96, 62), outline=INK)   # satchel, right hip/back
    made.append(save(body, 'rig/hero3q_body.png'))
    head = canvas(w, h); d = ImageDraw.Draw(head)
    d.ellipse([*P(.85, .75), *P(1.85, 1.95)], fill=SKIN, outline=INK, width=2)
    d.pieslice([*P(.95, 1.45), *P(1.75, 2.2)], 0, 180, fill=BEARD, outline=INK)
    d.ellipse([*P(.9, .55), *P(1.75, 1.1)], fill=HAIR, outline=INK)
    d.line([*P(1.62, 1.35), *P(1.7, 1.6)], fill=(150, 40, 40), width=3)                   # LEFT-cheek scar (viewer right)
    d.rectangle([*P(1.25, 1.9), *P(1.55, 2.15)], fill=SKIN_D)
    made.append(save(head, 'rig/hero3q_head.png', 'MOCK'))
    scarf = canvas(w, h); d = ImageDraw.Draw(scarf)
    d.polygon([P(.95, 2.6), P(1.1, 2.7), P(.45, 4.0), P(.25, 4.3), P(.35, 3.9), P(.2, 3.8)], fill=(96, 90, 80), outline=INK)
    made.append(save(scarf, 'rig/hero3q_scarf_tail.png', 'M'))
    hem = canvas(w, h); d = ImageDraw.Draw(hem)
    d.polygon([P(.5, 5.5), P(2.1, 5.5), P(2.3, 6.5), P(1.9, 6.3), P(1.6, 6.6), P(1.2, 6.35), P(.85, 6.6), P(.4, 6.4)], fill=TUNIC_D, outline=INK)
    made.append(save(hem, 'rig/hero3q_cloak_tip.png', 'M'))
    # S03 face close-up: turned slightly to his right so his LEFT cheek (viewer right) and its scar read clearly
    w, h = SPEC['face']['canvas']
    face = canvas(w, h); d = ImageDraw.Draw(face)
    d.rectangle([*P(2.1, 5.2), *P(3.9, 7.2)], fill=SKIN_D)
    d.ellipse([*P(.9, .9), *P(5.0, 6.2)], fill=SKIN, outline=INK, width=3)
    d.chord([*P(.8, .5), *P(5.1, 3.0)], 180, 360, fill=HAIR, outline=INK)
    d.pieslice([*P(1.4, 3.6), *P(4.6, 6.6)], 0, 180, fill=BEARD, outline=INK)
    d.polygon([P(2.9, 2.7), P(2.6, 4.1), P(3.15, 4.15)], fill=SKIN_D, outline=INK)          # long nose
    d.line([*P(4.05, 3.35), *P(4.25, 4.35)], fill=(150, 40, 40), width=6)                   # LEFT-cheek scar
    d.text(P(4.35, 3.9), 'L scar', fill=(150, 40, 40, 255), font=FONT)
    made.append(save(face, 'character/face_close.png'))
    for state in ('open', 'closed'):
        e = canvas(w, h); d = ImageDraw.Draw(e)
        for cx in (2.05, 3.75):
            if state == 'open':
                d.ellipse([*P(cx - .42, 2.75), *P(cx + .42, 3.2)], fill=(238, 232, 220), outline=INK, width=2)
                d.ellipse([*P(cx - .14, 2.82), *P(cx + .14, 3.14)], fill=(120, 76, 40), outline=INK)
            else:
                d.ellipse([*P(cx - .45, 2.7), *P(cx + .45, 3.22)], fill=SKIN, outline=SKIN)
                d.arc([*P(cx - .42, 2.7), *P(cx + .42, 3.2)], 10, 170, fill=INK, width=4)
        made.append(save(e, f'character/face_eyes_{state}.png', 'M'))
    wis = canvas(w, h); d = ImageDraw.Draw(wis)
    for i in range(6):
        d.line([*P(2.6, 1.0), *P(1.2 + i * .25, 2.3 + (i % 2) * .3)], fill=HAIR, width=4)
    made.append(save(wis, 'character/face_hair_wisps.png', 'M'))
    # S05 over-shoulder back view: facing away, his RIGHT side is on the viewer's right (staff there)
    w, h = SPEC['back']['canvas']
    back = canvas(w, h); d = ImageDraw.Draw(back)
    d.polygon([P(.6, 7.5), P(.9, 3.0), P(4.1, 3.0), P(4.4, 7.5)], fill=MANTLE, outline=INK)
    d.rounded_rectangle([*P(3.3, 5.0), *P(4.3, 6.2)], radius=10, fill=(132, 96, 62), outline=INK)   # satchel (his right)
    d.line([*P(4.5, 1.6), *P(4.6, 7.5)], fill=STAFF, width=int(.16 * PX))                    # staff, his RIGHT hand
    made.append(save(back, 'details/s05_hero_back_over_shoulder.png'))
    bh = canvas(w, h); d = ImageDraw.Draw(bh)
    d.ellipse([*P(1.75, .9), *P(3.55, 2.9)], fill=HAIR, outline=INK, width=2)
    d.ellipse([*P(2.35, .55), *P(2.95, 1.1)], fill=HAIR, outline=INK)                        # knot
    made.append(save(bh, 'details/s05_hero_back_head.png', 'M'))
    bs = canvas(w, h); d = ImageDraw.Draw(bs)
    d.polygon([P(1.9, 2.6), P(2.2, 2.7), P(1.3, 4.4), P(1.0, 4.7), P(1.15, 4.2), P(.9, 4.1)], fill=(96, 90, 80), outline=INK)
    made.append(save(bs, 'details/s05_hero_back_scarf_tail.png', 'M'))
    return made


def details():
    made = []
    W_, H_ = 9.0, 16.0   # S04 macro plates share one 9:16 canvas (registered)
    for state, curl in (('relaxed', 0), ('tense', 1)):
        im = canvas(W_, H_); d = ImageDraw.Draw(im)
        d.rounded_rectangle([*P(3.0, 6.0), *P(6.3, 9.6)], radius=.8 * PX, fill=SKIN, outline=INK, width=3)
        for i in range(4):   # fingers wrap tighter when tense (shorter gaps, knuckles whiter)
            y = 6.5 + i * .75; x1 = 6.3 + (.0 if curl else .45)
            d.rounded_rectangle([*P(3.0 - (.1 if curl else 0), y), *P(x1, y + .6)], radius=.25 * PX,
                                fill=(214, 170, 140) if curl else SKIN, outline=INK, width=3)
        made.append(save(im, f'details/s04_right_hand_{state}.png'))
    st = canvas(W_, H_); d = ImageDraw.Draw(st)
    d.rectangle([*P(4.15, 0), *P(5.05, H_)], fill=STAFF, outline=INK)
    for y in (2.5, 11.5): d.ellipse([*P(4.0, y), *P(5.2, y + .6)], fill=STAFF_D)
    made.append(save(st, 'details/s04_staff_close.png'))
    fa = canvas(W_, H_); d = ImageDraw.Draw(fa)
    capsule(d, -.5, 15.5, 4.0, 11.6, 1.0, .8, SKIN)
    for i in range(4):
        x = .4 + i * .8; d.polygon([P(x, 15.2 - i * .65), P(x + .55, 14.75 - i * .65), P(x + 1.0, 15.3 - i * .65), P(x + .4, 15.7 - i * .65)], fill=BAND, outline=INK)
    d.text(P(1.0, 12.6), 'LEFT forearm', fill=(150, 40, 40, 255), font=FONT)
    made.append(save(fa, 'details/s04_left_bandaged_forearm.png'))
    return made


def mountains(w, h, n, col, seed, base, amp):
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im); rnd = random.Random(seed)
    pts, x = [(0, h)], 0
    while x <= w:
        pts.append((x, int(h * base - rnd.random() * h * amp))); x += w // n
    pts += [(w, h)]
    d.polygon(pts, fill=col); return im


def ridge(w, h):
    """a stony ridge whose standing top is flat at 12 % of the image height between 25 % and 60 % of its width (the
    story's S01_STAND contract: real ridge art is placed by the same numbers)"""
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.polygon([(0, h), (0, int(h * .45)), (int(w * .18), int(h * .2)), (int(w * .25), int(h * .12)), (int(w * .6), int(h * .12)),
               (int(w * .72), int(h * .3)), (w, int(h * .5)), (w, h)], fill=(92, 74, 62, 255))
    return im


def environments():
    made = []
    def grad(w, h, top, bot):
        im = Image.new('RGBA', (w, h)); d = ImageDraw.Draw(im)
        for y in range(h):
            k = y / h; d.line([(0, y), (w, y)], fill=tuple(int(top[i] + (bot[i] - top[i]) * k) for i in range(3)) + (255,))
        return im
    dawn = ((58, 72, 104), (214, 170, 142))
    for name, im in [
        ('environments/s01_sky.png', grad(1500, 2400, *dawn)),
        ('environments/s01_far_mountains.png', mountains(1700, 900, 9, (78, 92, 126, 255), 1, .95, .55)),
        ('environments/s01_mid_mountains.png', mountains(1700, 900, 6, (64, 70, 92, 255), 2, .95, .5)),
        ('environments/s01_ridge.png', ridge(1600, 700)),
        ('environments/s01_foreground.png', mountains(1800, 600, 5, (52, 42, 38, 255), 4, .95, .5)),
        ('environments/s02_sky.png', grad(2200, 2400, *dawn)),
        ('environments/s02_far_mountains.png', mountains(2600, 900, 10, (84, 96, 128, 255), 5, .95, .55)),
        ('environments/s02_walkable_path.png', grad(2600, 700, (122, 104, 88), (92, 76, 64))),
        ('environments/s02_foreground_gravel.png', mountains(2600, 260, 22, (58, 48, 42, 255), 6, .98, .5)),
        ('environments/s03_soft_valley.png', grad(1400, 2300, (96, 110, 140), (210, 176, 150)).filter(ImageFilter.GaussianBlur(8))),
        ('environments/s04_soft_stone.png', grad(1400, 2300, (110, 96, 86), (170, 150, 128)).filter(ImageFilter.GaussianBlur(10))),
        ('environments/s05_sky.png', grad(1500, 2400, (70, 86, 120), (240, 190, 130))),
        ('environments/s05_far_valley.png', mountains(1700, 1100, 8, (96, 110, 140, 255), 7, .95, .45)),
        ('environments/s05_mid_valley.png', mountains(1700, 1000, 6, (80, 84, 104, 255), 8, .95, .4)),
        ('environments/s05_cliff.png', mountains(1500, 900, 3, (60, 48, 42, 255), 9, .98, .6)),
    ]:
        made.append(save(im, name))
    def blob(w, h, seed, col, n, r, a):
        im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im); rnd = random.Random(seed)
        for _ in range(n):
            x, y, rr = rnd.random() * w, h * (.3 + .4 * rnd.random()), r * (.6 + .8 * rnd.random())
            d.ellipse([x - rr, y - rr * .45, x + rr, y + rr * .45], fill=col + (a,))
        return im.filter(ImageFilter.GaussianBlur(r * .35))
    for name, im in [
        ('fx/s01_fog_back.png', blob(1800, 500, 11, (214, 220, 230), 28, 120, 90)),
        ('fx/s01_fog_front.png', blob(1800, 500, 12, (236, 236, 240), 22, 150, 110)),
        ('fx/s02_dust.png', blob(200, 120, 13, (176, 156, 128), 8, 30, 160)),
        ('fx/s05_smoke_puff.png', blob(260, 260, 14, (196, 198, 204), 10, 60, 170)),
        ('fx/s05_campfire.png', blob(160, 160, 15, (255, 170, 70), 6, 30, 230)),
        ('fx/s04_dust_mote.png', blob(48, 48, 16, (240, 230, 210), 2, 10, 200)),
    ]:
        made.append(save(im, name, 'M'))
    return made


if __name__ == '__main__':
    files = body_parts() + overlay_rigs() + details() + environments()
    open(os.path.join(OUT, 'MOCK_README.txt'), 'w').write(
        'MOCK stand-ins made by tools/make_smoke_mocks.py: NOT artwork. Each image is stamped MOCK.\n'
        'They exist to test the rig and every shot\'s motion before the real Z-Image/Qwen assets exist.\n')
    print(f'{len(files)} mock images -> {OUT}')
