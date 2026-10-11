"""puppet.py: 2D CUT-OUT (puppet) characters for the Action Composer, the way 2D studios rig them: one image per body
part, joined at the joints with rounded overlapping ends, moved rigidly by the skeleton (no bending of the artwork).

    python tools/action/puppet.py template --out=<dir>                 the side-view pose guide + its rig (joints known)
    python tools/action/puppet.py split --rig=<dir>/template.rig.json --sheet=<character.png> [--body=<armless.png>]
                                        --out=<dir> --id=<name>         cut the character into parts -> <id>.rig.json
    python tools/action/puppet.py mock --rig=<dir>/template.rig.json --out=<dir>   MOCK sheet + armless body (engine tests only)

How a character is made (tools/action/gen_character.mjs drives this with your local ComfyUI):
  1. `template` draws a grey MANNEQUIN in a side-view walking stride (near arm forward, far arm back, legs apart, so all
     four limbs are visible and apart) on chroma green, and writes its rig: every joint is KNOWN, nothing is guessed.
  2. An image-edit model (Qwen Image Edit) redraws the mannequin as the character, in the same pose and place.
  3. The same model removes the arms from that picture (the "body" image): the torso is complete under the arms, so a
     swinging arm never uncovers a hole or a painted-on copy of itself.
  4. `split` assigns every pixel to a bone (its capsule; the part drawn in front wins overlaps), gives each part a
     rounded cap of its own limb past the joint (so rotating never opens a gap), crops the parts and writes a
     char_rig/1 with `parts`. It checks that the picture kept the guide's pose (silhouette overlap) and that every part
     has pixels, and says what to regenerate when not.
"""
import sys as _sys
for _s in (_sys.stdout, _sys.stderr):   # Windows: a piped stdout is cp1252 and cannot print → or Thai; always UTF-8
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw

KEY = (0, 177, 64)   # chroma green #00B140
W0, H0 = 1024, 1536
# side view, facing +x, walking stride. f = the NEAR side (in front, drawn on top), b = the FAR side (behind)
JOINTS = {
    'hips': (512, 800), 'chest': (505, 432), 'neck': (518, 348), 'head_top': (548, 92),
    'shoulder_f': (512, 420), 'elbow_f': (580, 602), 'wrist_f': (676, 690), 'hand_f_tip': (742, 716),
    'shoulder_b': (494, 420), 'elbow_b': (404, 584), 'wrist_b': (336, 728), 'hand_b_tip': (306, 790),
    'hip_f': (522, 812), 'knee_f': (602, 1102), 'ankle_f': (578, 1392), 'toe_f': (684, 1426),
    'hip_b': (500, 812), 'knee_b': (432, 1108), 'ankle_b': (352, 1384), 'toe_b': (452, 1426),
}
# name, parent, from, to, chain, z, radius (template px)
BONES = [
    ('spine', None, 'hips', 'chest', 'body', 50, 80), ('neck', 'spine', 'chest', 'neck', 'body', 50, 34), ('head', 'neck', 'neck', 'head_top', 'body', 52, 122),
    ('upperarm_b', 'spine', 'shoulder_b', 'elbow_b', 'arm_b', 10, 34), ('forearm_b', 'upperarm_b', 'elbow_b', 'wrist_b', 'arm_b', 10, 28), ('hand_b', 'forearm_b', 'wrist_b', 'hand_b_tip', 'arm_b', 10, 27),
    ('thigh_b', None, 'hip_b', 'knee_b', 'leg_b', 20, 54), ('shin_b', 'thigh_b', 'knee_b', 'ankle_b', 'leg_b', 20, 42), ('foot_b', 'shin_b', 'ankle_b', 'toe_b', 'leg_b', 20, 30),
    ('thigh_f', None, 'hip_f', 'knee_f', 'leg_f', 60, 56), ('shin_f', 'thigh_f', 'knee_f', 'ankle_f', 'leg_f', 60, 43), ('foot_f', 'shin_f', 'ankle_f', 'toe_f', 'leg_f', 60, 31),
    ('upperarm_f', 'spine', 'shoulder_f', 'elbow_f', 'arm_f', 80, 36), ('forearm_f', 'upperarm_f', 'elbow_f', 'wrist_f', 'arm_f', 80, 30), ('hand_f', 'forearm_f', 'wrist_f', 'hand_f_tip', 'arm_f', 80, 28),
]
ARM_CHAINS = ('arm_f', 'arm_b')


def args_of(argv):
    return dict(a[2:].split('=', 1) if '=' in a else (a[2:], True) for a in argv if a.startswith('--'))


def rig_spec(joints, scale=1.0, image='guide.png', size=(W0, H0), **extra):
    J = {k: {'x': round(x * scale, 1), 'y': round(y * scale, 1), 'confidence': 'detected', 'note': 'from the pose guide'} for k, (x, y) in joints.items()}
    xs, ys = [v['x'] for v in J.values()], [v['y'] for v in J.values()]
    return {'schema': 'char_rig/1', 'id': extra.pop('id', 'template'), 'image': image, 'size': list(size), 'template': 'human_side', 'facing': 'right',
            'bbox': [min(xs) - 130 * scale, min(ys), max(xs) + 130 * scale, max(ys) + 12 * scale],
            'joints': J, 'bones': [{'name': n, 'parent': p, 'from': a, 'to': b, 'chain': c, 'z': z, 'radius': round(r * scale, 1)} for n, p, a, b, c, z, r in BONES],
            'front_side': 'near', 'uncertain': [], 'estimated': [], 'warnings': [], **extra}


# ---------------------------------------------------------------------------------------------- 1. the pose guide
def draw_figure(joints, scale, palette, arms=True, outline=(58, 61, 69), bg=KEY, ss=2, label=False):
    """A mannequin (or, with a palette per part, a flat MOCK character) in the guide's pose."""
    W, H = int(W0 * scale), int(H0 * scale)
    im = Image.new('RGBA', (W * ss, H * ss), bg + (255,) if bg else (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    P = lambda k: (joints[k][0] * scale * ss, joints[k][1] * scale * ss)
    ow = 6 * scale * ss

    def capsule(a, b, r, fill):
        for rr, col in ((r + ow, outline), (r, fill)):
            d.line([P(a), P(b)], fill=col, width=int(2 * rr))
            for q in (P(a), P(b)):
                d.ellipse([q[0] - rr, q[1] - rr, q[0] + rr, q[1] + rr], fill=col)

    def head(fill):
        n, t = P('neck'), P('head_top')
        cx, cy, r = n[0] + (t[0] - n[0]) * .55, n[1] + (t[1] - n[1]) * .55, 122 * scale * ss
        for rr, col in ((r + ow, outline), (r, fill)):
            d.ellipse([cx - rr * .92, cy - rr, cx + rr * .92, cy + rr], fill=col)
            d.polygon([(cx + rr * .78, cy - rr * .05), (cx + rr * 1.08, cy + rr * .22), (cx + rr * .74, cy + rr * .32)], fill=col)   # the nose: faces +x
        e = (cx + r * .48, cy - r * .02, 9 * scale * ss)
        d.ellipse([e[0] - e[2], e[1] - e[2] * 1.4, e[0] + e[2], e[1] + e[2] * 1.4], fill=outline)

    def limb(chain):
        for n, p, a, b, c, z, r in BONES:
            if c != chain:
                continue
            if n.startswith('hand'):
                q = P(b)
                capsule(a, b, r * scale * ss, palette.get(n, palette[chain]))
            elif n.startswith('foot'):
                capsule(a, b, r * scale * ss, palette.get(n, palette[chain]))
            else:
                capsule(a, b, r * scale * ss, palette.get(n, palette[chain]))

    if arms:
        limb('arm_b')
    limb('leg_b')
    capsule('hips', 'chest', 80 * scale * ss, palette.get('spine', palette['body']))
    capsule('chest', 'neck', 34 * scale * ss, palette.get('neck', palette['body']))
    head(palette.get('head', palette['body']))
    limb('leg_f')
    if arms:
        limb('arm_f')
    return im.resize((W, H), Image.LANCZOS)


def cmd_template(a):
    out = a['out']
    os.makedirs(out, exist_ok=True)
    grey = {'arm_b': (125, 127, 134), 'leg_b': (134, 136, 144), 'body': (185, 188, 196), 'leg_f': (207, 210, 217), 'arm_f': (223, 226, 232)}
    draw_figure(JOINTS, 1.0, grey).convert('RGB').save(f'{out}/guide.png')
    sil = draw_figure(JOINTS, 1.0, grey, bg=None)
    sil.save(f'{out}/guide_silhouette.png')
    spec = rig_spec(JOINTS, image='guide.png', limits=['side view only (the model sheet pose); turning around is a mirror'])
    with open(f'{out}/template.rig.json', 'w', encoding='utf-8') as f:
        json.dump(spec, f, indent=1)
    print(f'puppet template: guide.png ({W0}x{H0}), guide_silhouette.png, template.rig.json -> {out}')


# ---------------------------------------------------------------------------------------------- 2. split into parts
def rgba(path):
    im = Image.open(path)
    a = np.array(im.convert('RGBA'))
    if im.mode == 'RGBA' and (a[:, :, 3] < 250).mean() > .05:
        return a
    # no transparency: key out the chroma green (soft edge, green spill pulled back to neutral)
    rgb = a[:, :, :3].astype(np.float32)
    dist = np.sqrt(((rgb - np.array(KEY, np.float32)) ** 2).sum(-1))
    g_dom = rgb[:, :, 1] - np.maximum(rgb[:, :, 0], rgb[:, :, 2])
    alpha = np.clip((dist - 60) / 70, 0, 1) * np.clip(1 - (g_dom - 70) / 60, 0, 1)
    spill = np.clip(g_dom, 0, None) * (alpha < .999)
    rgb[:, :, 1] -= spill * .8
    a[:, :, :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    a[:, :, 3] = (alpha * 255).astype(np.uint8)
    return a


def capsule_dist(X, Y, a, b):
    vx, vy = b[0] - a[0], b[1] - a[1]
    L2 = vx * vx + vy * vy or 1
    t = np.clip(((X - a[0]) * vx + (Y - a[1]) * vy) / L2, 0, 1)
    return np.hypot(X - a[0] - vx * t, Y - a[1] - vy * t), t


def labels(alpha, bones, J, allowed):
    """Each opaque pixel -> the bone (index into bones) whose capsule claims it; among claimants the front one wins."""
    H, W = alpha.shape
    Y, X = np.mgrid[0:H, 0:W].astype(np.float32)
    best = np.full((H, W), -1, np.int16)
    bz = np.full((H, W), -1e9, np.float32)
    near = np.full((H, W), -1, np.int16)
    nd = np.full((H, W), 1e9, np.float32)
    for i, b in enumerate(bones):
        if b['name'] not in allowed:
            continue
        d, t = capsule_dist(X, Y, J[b['from']], J[b['to']])
        dn = d / max(4, b['radius'])
        if b['parent'] is None and b['chain'] == 'body':
            dn = np.where(t <= 0, dn * 2.2, dn)   # the spine does not claim pixels below the hips (the legs' own)
        closer = dn < nd
        near[closer], nd[closer] = i, dn[closer]
        claim = (dn <= 1.15) & (b['z'] > bz)
        best[claim], bz[claim] = i, b['z']
    lab = np.where(best >= 0, best, near)
    lab[alpha < 24] = -1
    return lab, X, Y


def cmd_split(a):
    T = json.load(open(a['rig'], encoding='utf-8'))
    sheet = rgba(a['sheet'])
    body = rgba(a['body']) if a.get('body') else None
    H, W = sheet.shape[:2]
    s = W / T['size'][0]
    if abs(H / T['size'][1] - s) > .02:
        sys.exit(f'split: the sheet is {W}x{H}, the guide {T["size"][0]}x{T["size"][1]}: generate at the guide\'s proportions')
    J = {k: (v['x'] * s, v['y'] * s) for k, v in T['joints'].items()}
    bones = [{**b, 'radius': b['radius'] * s} for b in T['bones']]
    names = [b['name'] for b in bones]
    arm = {b['name'] for b in bones if b['chain'] in ARM_CHAINS}
    out, pid = a['out'], a.get('id', 'character')
    os.makedirs(out, exist_ok=True)
    warnings = []
    # pose check: the picture must keep the guide's silhouette (the joints are the guide's)
    guide = os.path.join(os.path.dirname(a['rig']), 'guide_silhouette.png')
    iou = None
    if os.path.exists(guide):
        g = np.array(Image.open(guide).convert('RGBA').resize((W, H)))[:, :, 3] > 128
        m = sheet[:, :, 3] > 128
        iou = float((g & m).sum() / max(1, (g | m).sum()))
        if iou < .55:
            warnings.append(f'the character does not follow the pose guide (silhouette overlap {iou:.2f}): regenerate the sheet')
    lab_s, X, Y = labels(sheet[:, :, 3], bones, J, set(names))
    src_body = body if body is not None else sheet
    if body is None:
        warnings.append('no armless body image: the torso keeps what the arms covered (a swinging arm uncovers a painted copy of itself)')
    lab_b, _, _ = labels(src_body[:, :, 3], bones, J, set(names) - arm)
    if body is None:
        lab_b[np.isin(lab_s, [names.index(n) for n in arm])] = -1
    parts, empty = [], []
    for i, b in enumerate(bones):
        src, lab = (sheet, lab_s) if b['name'] in arm else (src_body, lab_b)
        own = lab == i
        # the rounded cap: this bone's own capsule past its start joint, over pixels of the same limb (its parent's),
        # so the part overlaps its neighbour at the joint and rotating never opens a gap
        d, t = capsule_dist(X, Y, J[b['from']], J[b['to']])
        same = np.isin(lab, [k for k, c in enumerate(bones) if c['chain'] == b['chain']]) if b['chain'] != 'body' else np.isin(lab, [i, names.index(b['parent'])] if b['parent'] else [i])
        cap = (d <= b['radius'] * 1.0) & same & (src[:, :, 3] > 0)
        m = own | cap
        if m.sum() < 40:
            if b['name'] != 'neck':   # a short neck hidden by the head and the collar has no part of its own: fine
                empty.append(b['name'])
            continue
        ys, xs = np.where(m)
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        part = src[y0:y1, x0:x1].copy()
        part[:, :, 3] = np.where(m[y0:y1, x0:x1], part[:, :, 3], 0)
        fn = f'{pid}_{b["name"]}.png'
        Image.fromarray(part).save(os.path.join(out, fn))
        parts.append({'bone': b['name'], 'image': fn, 'at': [int(x0), int(y0)], 'z': b['z'], 'pixels': int(m.sum())})
    if empty:
        warnings.append('parts without pixels (the picture is missing them, or they are out of place): ' + ', '.join(empty))
    covered = np.zeros((H, W), bool)
    for p in parts:
        im = np.array(Image.open(os.path.join(out, p['image'])))[:, :, 3] > 0
        covered[p['at'][1]:p['at'][1] + im.shape[0], p['at'][0]:p['at'][0] + im.shape[1]] |= im
    whole = (sheet[:, :, 3] > 24) | (src_body[:, :, 3] > 24)
    coverage = float((covered & whole).sum() / max(1, whole.sum()))
    if coverage < .97:
        warnings.append(f'the parts cover {coverage:.0%} of the picture (missing pixels would vanish): check the rig')
    Image.fromarray(sheet).save(os.path.join(out, f'{pid}.png'))
    spec = rig_spec({k: (v[0] / s, v[1] / s) for k, v in J.items()}, scale=s, image=f'{pid}.png', size=(W, H), id=pid,
                    style='cutout', parts=[{k: v for k, v in p.items() if k != 'pixels'} for p in parts],
                    check={'pose_overlap': iou, 'coverage': round(coverage, 4), 'armless_body': body is not None, 'parts': len(parts)},
                    limits=['side view only (the model sheet pose); turning around is a mirror'])
    spec['warnings'] = warnings
    with open(os.path.join(out, f'{pid}.rig.json'), 'w', encoding='utf-8') as f:
        json.dump(spec, f, indent=1)
    # an exploded preview of the parts, for a quick look
    prev = Image.new('RGBA', (W, H), (240, 240, 236, 255))
    for p in sorted(parts, key=lambda p: p['z']):
        im = Image.open(os.path.join(out, p['image']))
        bi = names.index(p['bone'])
        mid = ((J[bones[bi]['from']][0] + J[bones[bi]['to']][0]) / 2 - W / 2, (J[bones[bi]['from']][1] + J[bones[bi]['to']][1]) / 2 - H / 2)
        off = (int(p['at'][0] + mid[0] * .18), int(p['at'][1] + mid[1] * .12))
        prev.alpha_composite(im, off)
    prev.convert('RGB').save(os.path.join(out, f'{pid}_parts_preview.jpg'), quality=88)
    print(f'puppet split: {len(parts)} parts, coverage {coverage:.1%}, pose overlap {iou if iou is None else round(iou, 2)} -> {out}/{pid}.rig.json')
    for w in warnings:
        print('warning:', w)
    return 0 if not empty and coverage >= .97 and (iou is None or iou >= .55) else 1


# ---------------------------------------------------------------------------------------------- 3. mock (tests only)
def cmd_mock(a):
    """A flat-coloured MOCK character in the guide's pose (sheet + armless body). For engine tests only: it is not
    artwork and must never be shown as such."""
    out = a['out']
    os.makedirs(out, exist_ok=True)
    pal = {'arm_b': (214, 120, 70), 'arm_f': (240, 140, 82), 'hand_b': (226, 186, 150), 'hand_f': (246, 206, 170),
           'leg_b': (52, 66, 120), 'leg_f': (66, 82, 146), 'foot_b': (90, 60, 40), 'foot_f': (110, 74, 50),
           'body': (240, 140, 82), 'neck': (246, 206, 170), 'head': (246, 206, 170)}
    draw_figure(JOINTS, 1.0, pal, bg=KEY).convert('RGB').save(f'{out}/mock_sheet.png')
    draw_figure(JOINTS, 1.0, pal, bg=KEY, arms=False).convert('RGB').save(f'{out}/mock_body.png')
    print(f'puppet mock: mock_sheet.png, mock_body.png -> {out} (MOCK: engine tests only, not artwork)')


if __name__ == '__main__':
    if len(sys.argv) < 2 or sys.argv[1] not in ('template', 'split', 'mock'):
        sys.exit(__doc__)
    sys.exit({'template': cmd_template, 'split': cmd_split, 'mock': cmd_mock}[sys.argv[1]](args_of(sys.argv[2:])) or 0)
