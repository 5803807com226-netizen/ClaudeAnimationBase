"""rig_analyze.py: REFERENCE IMAGE ANALYSIS → an editable 2D rig spec (char_rig/1) for the Action Composer.

    python tools/action/rig_analyze.py --image=<png> [--template=human|quadruped|object] [--id=<name>] [--out=<rig.json>]
    python tools/action/rig_analyze.py --image=<png> --joints=<edited rig.json> [--out=<rig.json>]
        keep the joints of an edited rig (placed by hand in the rig editor) and re-measure every bone's capsule radius
        on the silhouette from THOSE joints (the radii decide which pixels move with which bone)

Reads the silhouette (alpha) of ONE flat character image and proposes joints. It does not pretend to see anatomy:
colours and pixels do not reveal where an elbow is. Every joint carries a confidence:
  detected   measured directly on the silhouette (head top, neck, the hand and foot tips, where the legs split)
  estimated  placed by proportion along a detected limb (elbows, knees, wrists, ankles, shoulders, hips)
  uncertain  a guess the user must check (templates without a detector, a limb the silhouette does not show)
The rig editor (AutoCinematic → Action Composer) shows uncertain joints in red and estimated ones in orange.

human: works on an A-pose / T-pose / relaxed standing figure (front or three-quarter view) whose arms and legs are
apart from the body. A figure with crossed or hidden limbs gets an `uncertain` rig and warnings: edit it by hand,
or provide layered parts. quadruped / object: proportional templates, every joint `uncertain`.
Also writes, per bone, a capsule radius measured on the silhouette (used to split the image into body regions).
"""
import json, math, os, sys
import numpy as np
from PIL import Image

HUMAN_BONES = [  # name, parent, from-joint, to-joint, chain, z (draw order; higher = in front)
    ('spine', None, 'hips', 'chest', 'body', 50), ('neck', 'spine', 'chest', 'neck', 'body', 50), ('head', 'neck', 'neck', 'head_top', 'body', 51),
    ('upperarm_b', 'spine', 'shoulder_b', 'elbow_b', 'arm_b', 10), ('forearm_b', 'upperarm_b', 'elbow_b', 'wrist_b', 'arm_b', 10), ('hand_b', 'forearm_b', 'wrist_b', 'hand_b_tip', 'arm_b', 10),
    ('thigh_b', None, 'hip_b', 'knee_b', 'leg_b', 20), ('shin_b', 'thigh_b', 'knee_b', 'ankle_b', 'leg_b', 20), ('foot_b', 'shin_b', 'ankle_b', 'toe_b', 'leg_b', 20),
    ('thigh_f', None, 'hip_f', 'knee_f', 'leg_f', 60), ('shin_f', 'thigh_f', 'knee_f', 'ankle_f', 'leg_f', 60), ('foot_f', 'shin_f', 'ankle_f', 'toe_f', 'leg_f', 60),
    ('upperarm_f', 'spine', 'shoulder_f', 'elbow_f', 'arm_f', 80), ('forearm_f', 'upperarm_f', 'elbow_f', 'wrist_f', 'arm_f', 80), ('hand_f', 'forearm_f', 'wrist_f', 'hand_f_tip', 'arm_f', 80),
]
QUAD_BONES = [
    ('spine', None, 'hips', 'chest', 'body', 50), ('neck', 'spine', 'chest', 'neck', 'body', 52), ('head', 'neck', 'neck', 'head_tip', 'body', 53), ('tail', None, 'hips', 'tail_tip', 'body', 49),
    ('leg_fb', 'spine', 'shoulder_b', 'paw_fb', 'leg_fb', 10), ('leg_hb', None, 'hip_b', 'paw_hb', 'leg_hb', 11),
    ('leg_ff', 'spine', 'shoulder_f', 'paw_ff', 'leg_ff', 70), ('leg_hf', None, 'hip_f', 'paw_hf', 'leg_hf', 71),
]
OBJECT_BONES = [('body', None, 'base', 'top', 'body', 50)]


def runs(row):
    """[(start, end_exclusive)] of True runs in a 1-D bool array"""
    d = np.diff(np.concatenate([[0], row.astype(np.int8), [0]]))
    return list(zip(np.where(d == 1)[0], np.where(d == -1)[0]))


def J(x, y, c, note=None):
    j = {'x': round(float(x), 1), 'y': round(float(y), 1), 'confidence': c}
    if note: j['note'] = note
    return j


def components(mask):
    """connected regions (4-neighbour) of a bool image: list of (ys, xs) arrays, largest first. Run-based labelling."""
    H, W = mask.shape; parent = []
    def find(i):
        while parent[i] != i: parent[i] = parent[parent[i]]; i = parent[i]
        return i
    prev, all_runs = [], []
    for y in range(H):
        cur = []
        for a, b in runs(mask[y]):
            lab = len(parent); parent.append(lab)
            for (pa, pb, pl) in prev:
                if pa < b and a < pb: ra, rb = find(lab), find(pl); parent[max(ra, rb)] = min(ra, rb)
            cur.append((a, b, lab)); all_runs.append((y, a, b, lab))
        prev = cur
    groups = {}
    for y, a, b, lab in all_runs: groups.setdefault(find(lab), []).append((y, a, b))
    out = []
    for rs in groups.values():
        ys = np.concatenate([np.full(b - a, y) for y, a, b in rs]); xs = np.concatenate([np.arange(a, b) for y, a, b in rs]); out.append((ys, xs))
    return sorted(out, key=lambda c: -len(c[0]))


def axis(ys, xs):
    """principal axis of a pixel set: centre, unit direction"""
    c = np.array([xs.mean(), ys.mean()]); P = np.stack([xs - c[0], ys - c[1]]); w, v = np.linalg.eigh(P @ P.T)
    d = v[:, np.argmax(w)]; return c, d / np.linalg.norm(d)


def analyze_human(M, warnings):
    H, W = M.shape
    ys, xs = np.where(M)
    y0, y1 = ys.min(), ys.max(); h = y1 - y0
    cx = float(np.median(xs[ys < y0 + .15 * h]))                      # the head's centre column
    width = lambda y: next(((b - a, a, b) for a, b in runs(M[y]) if a <= cx < b), (0, int(cx), int(cx)))
    # the neck: going down, the head widens, narrows into the neck, then the body widens again
    best, neck_y, m, narrowing = 0, None, None, False
    for y in range(int(y0), int(y0 + .6 * h)):
        w = width(y)[0]
        if not narrowing: best = max(best, w); narrowing = w < .85 * best
        else:
            if m is None or w < m[0]: m = (w, y)
            if w > 1.15 * m[0]: neck_y = m[1]; break
    if neck_y is None: neck_y = int(y0 + .22 * h); warnings.append('no neck found in the silhouette: the neck is a guess')
    _, na, nb = width(neck_y); cxn = (na + nb) / 2
    # the trunk's columns: the run through the centre, a little below the shoulders where the arms are still apart
    rows = range(neck_y, int(y0 + .8 * h))
    split = next((y for y in rows if len([r for r in runs(M[y]) if r[1] - r[0] > 3]) >= 3), None)   # [arm][trunk][arm]
    ty = split + int(.04 * h) if split else int(neck_y + .15 * h)
    _, ta, tb = width(ty)
    # the crotch: where the trunk's columns split into two legs
    crotch = next((y for y in range(int(y0 + .4 * h), int(y1)) if len([r for r in runs(M[y, ta:tb]) if r[1] - r[0] > .02 * W]) >= 2), None)
    if crotch is None: crotch = int(y0 + .6 * h); warnings.append('the legs are not separated in the silhouette: leg joints are guesses (edit them)')
    # limbs = what is left when the trunk (its columns, from the neck to the crotch) is taken away
    rest = M.copy(); rest[:neck_y + 1, :] = False; rest[neck_y:crotch, ta:tb] = False
    comps = [c for c in components(rest) if len(c[0]) > .002 * M.sum()]
    arms = [c for c in comps if c[0].min() < crotch - .05 * h]              # starts above the hips
    legs = [c for c in components(np.where(np.arange(H)[:, None] >= crotch, M, False)) if len(c[0]) > .01 * M.sum()]
    joints = {'head_top': J(cx, y0, 'detected'), 'neck': J(cxn, neck_y, 'detected', 'narrowest row under the head'),
              'chest': J(cxn, neck_y + .05 * h, 'estimated')}
    sh_y = neck_y + .045 * h
    def limb_joints(c, root_y, kind):
        cy, cxs = c; ctr, d = axis(cy, cxs)
        if d[1] < 0: d = -d                                                 # point down the limb
        t = (cy - ctr[1]) * d[1] + (cxs - ctr[0]) * d[0]; far = np.argmax(t)
        tip = np.array([cxs[far], cy[far]], float)
        root = ctr + d * ((root_y - ctr[1]) / d[1])                        # the axis extended up to the root's height
        return root, tip, d
    out = {}
    for side, comp in (('L', min(arms, key=lambda c: c[1].mean()) if arms else None), ('R', max(arms, key=lambda c: c[1].mean()) if len(arms) > 1 else None)):
        if comp is None or (side == 'R' and len(arms) < 2):
            warnings.append(f'the screen-{"left" if side == "L" else "right"} arm is not separated from the body: its joints are guesses (edit them)')
            sx = ta - .02 * W if side == 'L' else tb + .02 * W
            out['arm' + side] = {'shoulder': J(sx, sh_y, 'uncertain'), 'elbow': J(sx, sh_y + .12 * h, 'uncertain'), 'wrist': J(sx, sh_y + .23 * h, 'uncertain'), 'tip': J(sx, sh_y + .27 * h, 'uncertain')}
            continue
        root, tip, d = limb_joints(comp, sh_y, 'arm')
        # the shoulder pivot lies on the UPPER arm's own axis (the forearm's angle would pull it off the shoulder cap)
        cy, cxs = comp; tt = (cy - cy.mean()) * d[1] + (cxs - cxs.mean()) * d[0]; up = tt < np.percentile(tt, 40)
        if up.sum() > 30:
            c2, d2 = axis(cy[up], cxs[up])
            if d2[1] < 0: d2 = -d2
            if abs(d2[1]) > .3: root = c2 + d2 * ((sh_y - c2[1]) / d2[1])
        # anatomy: the shoulder joint sits inside the trunk's edge by about the arm's radius (the arm's cap covers it)
        widths = [(cxs[cy == y].max() - cxs[cy == y].min() + 1) for y in range(int(np.percentile(cy, 50)), int(np.percentile(cy, 80)))]
        ra = float(np.median(widths)) / 2 if widths else .03 * W
        root = np.array([max(root[0], ta + .8 * ra) if side == 'L' else min(root[0], tb - .8 * ra), root[1]])
        P = lambda f: root + (tip - root) * f
        out['arm' + side] = {'shoulder': J(*root, 'estimated', 'arm axis at shoulder height, inside the trunk edge by the arm radius'), 'elbow': J(*P(.47), 'estimated', 'proportion along the arm'),
                             'wrist': J(*P(.84), 'estimated', 'proportion along the arm'), 'tip': J(*tip, 'detected', 'far end of the arm')}
    legs = sorted(legs, key=lambda c: c[1].mean())[:2] if len(legs) >= 2 else legs
    facing_votes = 0
    for side, comp in zip(('L', 'R'), legs if len(legs) == 2 else [None, None]):
        if comp is None: continue
        cy, cxs = comp; body = cy < y1 - .1 * h                             # the leg without its foot
        root, _, d = limb_joints((cy[body], cxs[body]), crotch - .025 * h, 'leg')
        ank_y = y1 - .045 * h; ank = root + d * ((ank_y - root[1]) / d[1])
        foot = cy > y1 - .07 * h; fx = cxs[foot]; facing_votes += np.sign(fx.mean() - ank[0])
        out['leg' + side] = {'hip': J(*root, 'estimated', 'leg axis at the crotch'), 'knee': J(*(root + (ank - root) * .52), 'estimated', 'proportion along the leg'),
                             'ankle': J(*ank, 'estimated', 'just above the sole'), 'toe_x': (fx.max(), fx.min()), 'toe_y': float(cy[foot].mean())}
    facing = 'right' if facing_votes >= 0 else 'left'
    for side in ('L', 'R'):
        if 'leg' + side not in out:
            warnings.append(f'the screen-{"left" if side == "L" else "right"} leg could not be traced: its joints are guesses (edit them)')
            lx = ta + (tb - ta) * (.3 if side == 'L' else .7)
            out['leg' + side] = {'hip': J(lx, crotch - .02 * h, 'uncertain'), 'knee': J(lx, crotch + .2 * h, 'uncertain'), 'ankle': J(lx, y1 - .04 * h, 'uncertain'), 'toe_x': (lx + .04 * W, lx - .04 * W), 'toe_y': y1}
        L = out['leg' + side]; L['toe'] = J(L['toe_x'][0] if facing == 'right' else L['toe_x'][1], L['toe_y'], 'detected' if L['ankle']['confidence'] != 'uncertain' else 'uncertain', 'far end of the foot')
    # front / back: a figure turned toward screen-right shows its screen-left limbs nearer the viewer
    near = 'L' if facing == 'right' else 'R'; far = 'R' if near == 'L' else 'L'
    for tag, s_ in (('f', near), ('b', far)):
        a, l = out['arm' + s_], out['leg' + s_]
        joints.update({f'shoulder_{tag}': a['shoulder'], f'elbow_{tag}': a['elbow'], f'wrist_{tag}': a['wrist'], f'hand_{tag}_tip': a['tip'],
                       f'hip_{tag}': l['hip'], f'knee_{tag}': l['knee'], f'ankle_{tag}': l['ankle'], f'toe_{tag}': l['toe']})
    joints['hips'] = J((joints['hip_f']['x'] + joints['hip_b']['x']) / 2, crotch - .06 * h, 'estimated', 'between the hip joints')
    return joints, facing, {'front_side': 'screen-left' if near == 'L' else 'screen-right', 'front_confidence': 'uncertain'}


def template(name, M, warnings):
    ys, xs = np.where(M); y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max(); w, h = x1 - x0, y1 - y0
    F = lambda fx, fy: J(x0 + fx * w, y0 + fy * h, 'uncertain', 'template position: drag it onto the image')
    warnings.append(f'{name}: no automatic detector; every joint is a template guess (edit them in the rig editor)')
    if name == 'quadruped':
        return {'hips': F(.3, .4), 'chest': F(.68, .4), 'neck': F(.8, .3), 'head_tip': F(.98, .25), 'tail_tip': F(0, .3),
                'shoulder_f': F(.68, .5), 'paw_ff': F(.7, 1), 'shoulder_b': F(.62, .5), 'paw_fb': F(.6, 1), 'hip_f': F(.3, .5), 'paw_hf': F(.32, 1), 'hip_b': F(.24, .5), 'paw_hb': F(.22, 1)}, 'right', {}
    return {'base': F(.5, 1), 'top': F(.5, 0)}, 'right', {}


def radius_at(M, a, b, f=.5, side_min=False):
    """half the silhouette's width across the segment a→b at fraction f along it (px)"""
    H, W = M.shape; mx, my = a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f; dx, dy = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dy) or 1
    nx, ny = -dy / L, dx / L; out = []
    for s in (1, -1):
        r = 0
        while r < max(H, W) * .2:
            x, y = int(round(mx + s * nx * r)), int(round(my + s * ny * r))
            if not (0 <= x < W and 0 <= y < H) or not M[y, x]: break
            r += 1
        out.append(r)
    return max(4.0, float(min(out) if side_min else np.mean(out)))   # side_min: a limb lying against the body is measured on its free side


def main():
    args = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--') and '=' in a)
    path = args['image']; tpl = args.get('template', 'human'); cid = args.get('id') or os.path.splitext(os.path.basename(path))[0]
    im = Image.open(path).convert('RGBA'); A = np.array(im)[:, :, 3]; M = A > 40
    if not M.any(): sys.exit('rig_analyze: the image is fully transparent (a cut-out with a transparent background is required)')
    if (A > 0).mean() > .97: print('warning: the image has no transparent background; the silhouette is the whole frame (cut the character out first)')
    warnings = []
    if args.get('joints'):   # re-measure an edited rig: its joints are kept as they are, nothing is detected again
        with open(args['joints'], encoding='utf-8') as f: old = json.load(f)
        tpl = old.get('template', tpl); joints, facing = old['joints'], old.get('facing', 'right')
        extra = {k: old[k] for k in old if k not in ('schema', 'id', 'image', 'size', 'template', 'facing', 'bbox', 'joints', 'bones', 'uncertain', 'estimated', 'warnings', 'limits')}
        cid = args.get('id') or old.get('id') or cid
        warnings = [w for w in old.get('warnings', []) if 'could not be traced' not in w and 'not separated' not in w] if not any(j['confidence'] == 'uncertain' for j in joints.values()) else old.get('warnings', [])
    elif tpl == 'human': joints, facing, extra = analyze_human(M, warnings)
    else: joints, facing, extra = template(tpl, M, warnings)
    bones = HUMAN_BONES if tpl == 'human' else QUAD_BONES if tpl == 'quadruped' else OBJECT_BONES
    out_bones = []
    for name, parent, a, b, chain, z in bones:
        pa, pb = (joints[a]['x'], joints[a]['y']), (joints[b]['x'], joints[b]['y'])
        # a limb's width is read toward its outer end: near the body it overlaps the trunk (a shoulder over the chest)
        if name == 'spine': r = min(radius_at(M, pa, pb, f, True) for f in (.12, .25, .4))   # near the hips: the arms are apart from the trunk there
        elif name == 'neck': r = radius_at(M, pa, pb, .9, True)   # at the neck joint itself, not across the head or the shoulders
        elif chain == 'body': r = radius_at(M, pa, pb)
        else: r = min(radius_at(M, pa, pb, f, True) for f in (.55, .7, .85))
        out_bones.append({'name': name, 'parent': parent, 'from': a, 'to': b, 'chain': chain, 'z': z, 'radius': round(r, 1)})
    ys, xs = np.where(M)
    rig = {'schema': 'char_rig/1', 'id': cid, 'image': os.path.basename(path), 'size': [im.width, im.height], 'template': tpl, 'facing': facing,
           'bbox': [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())], 'joints': joints, 'bones': out_bones, **extra,
           'uncertain': sorted(k for k, j in joints.items() if j['confidence'] == 'uncertain'),
           'estimated': sorted(k for k, j in joints.items() if j['confidence'] == 'estimated'), 'warnings': warnings,
           'limits': ['one flat image: hidden sides, the far limbs behind the body and turning around are not in the artwork; turning is a mirror (labelled fallback)']}
    out = args.get('out') or os.path.splitext(path)[0] + '.rig.json'
    with open(out, 'w', encoding='utf-8') as f: json.dump(rig, f, indent=1, ensure_ascii=False)
    print(f'rig_analyze: {tpl}, facing {facing}, {len(joints)} joints ({len(rig["uncertain"])} uncertain, {len(rig["estimated"])} estimated) → {out}')
    for w in warnings: print('warning:', w)


if __name__ == '__main__':
    main()
