"""prop_analyze.py: OBJECT / PROP REFERENCE → an editable prop spec (prop/1) for the Action Composer.

    python tools/action/prop_analyze.py --image=<png> [--id=<name>] [--forward=right|left|up|down] [--kind=handheld|object] [--out=<prop.json>]

Anchors (image px), each with a confidence (detected / estimated / uncertain, as in rig_analyze.py):
  origin   the prop's pivot (= the primary grip for a hand-held prop)
  grip     where the primary hand closes          grip2   an optional second grip (a fore grip), for two hands
  muzzle   where effects come out (the far end along `forward`)
  forward  the direction the prop points in its image
  hold_angle  the hand bone's angle below the prop's forward line when held (radians; .6 = a pistol grip)
handheld: grips are handles that hang below the main body (the first from the rear is the primary grip, the next one
grip2); the muzzle is the far end of the body along forward. object: grip = the top centre (a carried box), no muzzle.
Everything is editable in AutoCinematic's attachment editor; uncertain anchors are shown in red there.
"""
import json, os, sys
import numpy as np
from PIL import Image


def J(x, y, c, note=None):
    j = [round(float(x), 1), round(float(y), 1)]
    return j, {'confidence': c, **({'note': note} if note else {})}


def main():
    args = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--') and '=' in a)
    path = args['image']; pid = args.get('id') or os.path.splitext(os.path.basename(path))[0]; kind = args.get('kind', 'handheld')
    fwd = args.get('forward', 'right')
    im = Image.open(path).convert('RGBA'); A = np.array(im)[:, :, 3] > 40
    A2 = A[:, ::-1] if fwd == 'left' else A          # work with forward = +x; mirror the anchors back at the end
    H, W = A2.shape; ys, xs = np.where(A2)
    if not len(xs): sys.exit('prop_analyze: the image is fully transparent')
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max(); h = y1 - y0
    anchors, conf, warnings = {}, {}, []
    if kind == 'object':
        anchors['grip'], conf['grip'] = J((x0 + x1) / 2, y0 + .05 * h, 'estimated', 'top centre')
    else:
        bottom = np.array([ys[xs == x].max() if (xs == x).any() else -1 for x in range(W)])
        cols = bottom >= 0; body = np.median(bottom[cols][bottom[cols] < np.percentile(bottom[cols], 60)]) if cols.any() else y1
        hang = (bottom > body + .15 * h) & cols
        runs, x = [], 0
        while x < W:
            if hang[x]:
                s = x
                while x < W and hang[x]: x += 1
                if x - s > .03 * W: runs.append((s, x))
            x += 1
        if runs:
            for name, (a, b) in zip(('grip', 'grip2'), runs[:2]):
                anchors[name], conf[name] = J((a + b) / 2, body + .32 * (bottom[a:b].max() - body), 'estimated', 'a handle under the body')
        else:
            warnings.append('no handle found under the body: the grip is a guess (edit it)')
            anchors['grip'], conf['grip'] = J(x0 + .3 * (x1 - x0), (y0 + y1) / 2, 'uncertain')
        col = A2[:, x1]; my = np.where(col)[0].mean()
        anchors['muzzle'], conf['muzzle'] = J(x1, my, 'detected', 'the far end along forward')
    anchors['origin'], conf['origin'] = list(anchors['grip']), {'confidence': conf['grip']['confidence'], 'note': 'the pivot = the primary grip'}
    if fwd == 'left':
        for n, (x, y) in list(anchors.items()): anchors[n] = [round(W - 1 - x, 1), y]
    spec = {'schema': 'prop/1', 'id': pid, 'image': os.path.basename(path), 'size': [im.width, im.height], 'kind': kind, 'forward': fwd,
            'anchors': anchors, 'anchor_confidence': conf, 'hold_angle': .6 if kind == 'handheld' else 1.57, 'warnings': warnings,
            'uncertain': sorted(n for n, c in conf.items() if c['confidence'] == 'uncertain')}
    out = args.get('out') or os.path.splitext(path)[0] + '.prop.json'
    with open(out, 'w', encoding='utf-8') as f: json.dump(spec, f, indent=1)
    summary = ', '.join(n + ' ' + c['confidence'] for n, c in conf.items())
    print(f'prop_analyze: {kind}, anchors {summary} → {out}')
    for w in warnings: print('warning:', w)


if __name__ == '__main__':
    main()
