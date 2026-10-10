"""make_test_assets.py: the LOCAL TEST ASSETS for the Action Composer (a test fixture, not story artwork).

    python tools/action/make_test_assets.py [--out=tools/fixtures/action]

  test_kai.png   a flat, single-layer reference of a simple 2D character ("Kai"): front three-quarter view facing
                 right, A-pose (arms and legs held away from the body so a silhouette shows every limb). One flat
                 image, exactly like a user's upload: no layers, no masks, no joint data.
  blaster.png    a fictional toy-like blaster prop (no real-world weapon design), side view, muzzle to the right.

Drawn at 4x and downsampled (smooth edges), transparent background.
"""
import os, sys
from PIL import Image, ImageDraw, ImageFilter

S = 4  # supersampling


def cap(d, a, b, r, fill, outline=None, ow=0):
    """a capsule from point a to b (radius r)"""
    import math
    (x0, y0), (x1, y1) = a, b
    ang = math.atan2(y1 - y0, x1 - x0); nx, ny = -math.sin(ang) * r, math.cos(ang) * r
    poly = [(x0 + nx, y0 + ny), (x1 + nx, y1 + ny), (x1 - nx, y1 - ny), (x0 - nx, y0 - ny)]
    if outline:
        d.polygon(poly, fill=outline); d.ellipse([x0 - r - ow, y0 - r - ow, x0 + r + ow, y0 + r + ow], fill=outline); d.ellipse([x1 - r - ow, y1 - r - ow, x1 + r + ow, y1 + r + ow], fill=outline)
        cap(d, a, b, r - ow, fill)
        return
    d.polygon(poly, fill=fill); d.ellipse([x0 - r, y0 - r, x0 + r, y0 + r], fill=fill); d.ellipse([x1 - r, y1 - r, x1 + r, y1 + r], fill=fill)


def P(*xy):  # scale points
    return [v * S for v in xy]


def character(path):
    W, H = 640, 1024
    im = Image.new('RGBA', (W * S, H * S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    INK, SKIN, SKIN2, JACKET, JACKET2, SCARF, PANTS, BOOT, HAIR = (43, 34, 51), (242, 198, 160), (226, 172, 132), (232, 112, 58), (196, 84, 40), (88, 196, 170), (52, 72, 120), (110, 70, 44), (58, 40, 52)
    o = 5 * S
    def limb(segs):
        # one continuous outline for the whole limb, then the fills: no ball joints
        for (a, b, r, _) in segs: cap(d, P(*a), P(*b), (r + 5) * S, INK)
        for (a, b, r, fill) in segs: cap(d, P(*a), P(*b), r * S, fill)
    # back (screen-right) limbs first, they sit behind the body
    limb([((392, 330), (452, 450), 30, JACKET2), ((452, 450), (488, 560), 24, SKIN2), ((488, 560), (498, 598), 23, SKIN2)])
    limb([((360, 600), (390, 790), 37, PANTS), ((390, 790), (404, 925), 32, PANTS), ((404, 935), (452, 958), 28, BOOT)])
    # torso (jacket), belt, scarf
    d.rounded_rectangle(P(228, 300, 410, 560), radius=60 * S, fill=INK)
    d.rounded_rectangle(P(233, 305, 405, 555), radius=56 * S, fill=JACKET)
    d.polygon(P(250, 540, 390, 540, 400, 625, 240, 625), fill=INK); d.polygon(P(254, 545, 386, 545, 394, 619, 246, 619), fill=PANTS)
    d.rectangle(P(240, 528, 400, 552), fill=INK); d.rectangle(P(244, 532, 396, 548), fill=(80, 56, 40))
    d.rectangle(P(326, 532, 346, 548), fill=(230, 200, 90))
    d.line(P(318, 312, 318, 528), fill=JACKET2, width=6 * S)   # zip
    # front (screen-left) leg
    limb([((280, 600), (250, 790), 39, PANTS), ((250, 790), (240, 925), 33, PANTS), ((240, 935), (296, 962), 30, BOOT)])
    # neck, head, hair, face
    cap(d, P(318, 300), P(318, 255), 34 * S, SKIN2)
    d.ellipse(P(222, 92, 422, 300), fill=INK); d.ellipse(P(227, 97, 417, 295), fill=SKIN)
    d.polygon(P(218, 170, 240, 92, 300, 60, 380, 70, 430, 120, 428, 180, 400, 140, 340, 150, 300, 128, 270, 150), fill=HAIR)
    d.ellipse(P(316, 178, 344, 214), fill=INK); d.ellipse(P(374, 178, 398, 212), fill=INK)        # eyes (looking right)
    d.ellipse(P(326, 184, 336, 196), fill=(255, 255, 255)); d.ellipse(P(382, 184, 390, 194), fill=(255, 255, 255))
    d.arc(P(340, 228, 392, 262), 20, 150, fill=INK, width=5 * S)                                       # smile
    d.ellipse(P(300, 230, 326, 248), fill=(240, 150, 140)); d.ellipse(P(398, 228, 414, 244), fill=(240, 150, 140))   # cheeks
    d.ellipse(P(226, 186, 258, 230), fill=INK); d.ellipse(P(231, 191, 253, 225), fill=SKIN2)       # ear
    # scarf over the neck
    d.rounded_rectangle(P(262, 282, 386, 326), radius=20 * S, fill=INK); d.rounded_rectangle(P(266, 286, 382, 322), radius=17 * S, fill=SCARF)
    d.polygon(P(268, 310, 300, 312, 286, 380, 254, 372), fill=INK); d.polygon(P(272, 314, 296, 316, 284, 372, 259, 366), fill=SCARF)
    # front (screen-left) arm on top
    limb([((254, 330), (196, 450), 31, JACKET), ((196, 450), (162, 560), 25, SKIN), ((162, 560), (152, 600), 24, SKIN)])
    d.line(P(214, 446, 180, 456), fill=INK, width=4 * S)        # sleeve cuff
    im = im.resize((W, H), Image.LANCZOS); im.save(path)


def blaster(path):
    W, H = 360, 200
    im = Image.new('RGBA', (W * S, H * S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    INK, BODY, BODY2, ACC, GLOW = (43, 34, 51), (238, 236, 244), (176, 172, 196), (90, 120, 230), (120, 230, 255)
    d.rounded_rectangle(P(40, 50, 300, 112), radius=28 * S, fill=INK); d.rounded_rectangle(P(46, 56, 294, 106), radius=24 * S, fill=BODY)   # body
    d.rounded_rectangle(P(280, 66, 344, 96), radius=12 * S, fill=INK); d.rounded_rectangle(P(285, 71, 339, 91), radius=9 * S, fill=BODY2)   # barrel
    d.ellipse(P(326, 68, 352, 94), fill=INK); d.ellipse(P(331, 73, 347, 89), fill=GLOW)                                                   # muzzle ring
    d.polygon(P(92, 100, 150, 100, 132, 186, 76, 186), fill=INK); d.polygon(P(98, 106, 144, 106, 128, 180, 82, 180), fill=ACC)           # grip
    d.polygon(P(196, 100, 236, 100, 230, 150, 192, 150), fill=INK); d.polygon(P(201, 105, 231, 105, 226, 145, 197, 145), fill=BODY2)     # fore grip
    d.ellipse(P(150, 64, 200, 98), fill=INK); d.ellipse(P(155, 69, 195, 93), fill=GLOW)                                                   # energy cell
    d.rounded_rectangle(P(70, 30, 170, 56), radius=10 * S, fill=INK); d.rounded_rectangle(P(75, 35, 165, 52), radius=8 * S, fill=ACC)    # top fin
    im = im.resize((W, H), Image.LANCZOS); im.save(path)


if __name__ == '__main__':
    args = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--') and '=' in a)
    out = args.get('out', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'fixtures', 'action'))
    os.makedirs(out, exist_ok=True)
    character(os.path.join(out, 'test_kai.png')); blaster(os.path.join(out, 'blaster.png'))
    print('test assets →', os.path.normpath(out))
