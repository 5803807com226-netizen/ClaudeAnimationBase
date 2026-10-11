"""make_sfx.py: synthesize a small starter pack of motion-graphics sound effects (no downloads, no samples, standard
library only), one folder per category the plan compiler cues automatically:

    assets/sfx/<category>/starter_<n>.wav      whoosh  pop  paper  tick  impact  riser  ding  type

Your own sounds go in the same folders (any .wav name): the compiler picks from every .wav in a category, so real
recorded SFX simply replace or join the starter ones. The starter files are generated, not committed (.gitignore).

    python tools/make_sfx.py [--out=assets/sfx] [--force]
"""
import sys as _sys
for _s in (_sys.stdout, _sys.stderr):   # Windows: a piped stdout is cp1252 and cannot print → or Thai; always UTF-8
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass
import math, os, random, struct, sys, wave

SR = 44100


def write(path, x):
    peak = max(1e-9, max(abs(v) for v in x))
    g = .7 / peak                                       # every file peaks at -3 dBFS: the mix sets the level
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, v * g)) * 32767)) for v in x))


def env(n, a, r, shape=2.0):
    """attack a, release r (fractions of n): a smooth hump"""
    out = []
    for i in range(n):
        p = i / n
        out.append((p / a) if p < a else max(0.0, 1 - (p - a) / max(1e-6, r)) ** shape)
    return out


def noise(n, rnd):
    return [rnd.uniform(-1, 1) for _ in range(n)]


def bandpass(x, f0_of, q=1.2):
    """a resonant state-variable band-pass whose centre follows f0_of(i) (a sweep)"""
    lo = bp = 0.0; out = []
    for i, v in enumerate(x):
        f = 2 * math.sin(math.pi * min(.45, f0_of(i) / SR))
        lo += f * bp; hi = v - lo - bp / q; bp += f * hi
        out.append(bp)
    return out


def lowpass(x, fc):
    a = 1 - math.exp(-2 * math.pi * fc / SR); y = 0.0; out = []
    for v in x:
        y += a * (v - y); out.append(y)
    return out


def whoosh(rnd, dur, f0, f1):
    n = int(SR * dur); e = env(n, .45, .55, 1.6)
    return [v * k for v, k in zip(bandpass(noise(n, rnd), lambda i: f0 * (f1 / f0) ** (i / n), 2.5), e)]


def pop(rnd, f0):
    n = int(SR * .16); out = []; ph = 0.0
    for i in range(n):
        t = i / SR; f = f0 * (1 + 1.8 * math.exp(-t * 60)); ph += 2 * math.pi * f / SR
        out.append(math.sin(ph) * math.exp(-t * 32) + .25 * rnd.uniform(-1, 1) * math.exp(-t * 400))
    return out


def paper(rnd, dur):
    n = int(SR * dur); x = noise(n, rnd); e = env(n, .08, .92, 1.2)
    crackle = [1.0 + (6.0 if rnd.random() < .004 else 0.0) for _ in range(n)]   # little crinkles
    hp = [v - u for v, u in zip(x, lowpass(x, 1800))]
    return [v * k * c for v, k, c in zip(hp, e, crackle)]


def tick(rnd, f0):
    n = int(SR * .05)
    return [math.sin(2 * math.pi * f0 * i / SR) * math.exp(-i / SR * 180) + .3 * rnd.uniform(-1, 1) * math.exp(-i / SR * 900) for i in range(n)]


def impact(rnd, f0):
    n = int(SR * .6); body = []; ph = 0.0
    for i in range(n):
        t = i / SR; f = f0 * (1 + 2.5 * math.exp(-t * 25)); ph += 2 * math.pi * f / SR
        body.append(math.sin(ph) * math.exp(-t * 7))
    thump = lowpass(noise(n, rnd), 900)
    return [b + 1.5 * h * math.exp(-i / SR * 30) for i, (b, h) in enumerate(zip(body, thump))]


def riser(rnd, dur):
    n = int(SR * dur); e = [(i / n) ** 2.2 * (1 if i < n * .96 else (n - i) / (n * .04)) for i in range(n)]
    nz = bandpass(noise(n, rnd), lambda i: 300 * (12 ** (i / n)), 3)
    tone = [math.sin(2 * math.pi * (220 * (i / SR) + 330 * (i / SR) ** 2 / dur)) * .35 for i in range(n)]
    return [(a + b) * k for a, b, k in zip(nz, tone, e)]


def ding(rnd, f0):
    n = int(SR * 1.2)
    return [sum(a * math.sin(2 * math.pi * f0 * m * i / SR) * math.exp(-i / SR * d) for m, a, d in ((1, 1, 3.2), (2.76, .45, 6), (5.4, .2, 11))) for i in range(n)]


def typekey(rnd):
    n = int(SR * .07); x = noise(n, rnd)
    hp = [v - u for v, u in zip(x, lowpass(x, 2500))]
    return [v * math.exp(-i / SR * 120) + .4 * math.sin(2 * math.pi * 1900 * i / SR) * math.exp(-i / SR * 260) for i, v in enumerate(hp)]


PACK = {
    'whoosh': [lambda r: whoosh(r, .45, 300, 4200), lambda r: whoosh(r, .6, 5000, 400), lambda r: whoosh(r, .3, 700, 6000)],
    'pop': [lambda r: pop(r, 520), lambda r: pop(r, 760), lambda r: pop(r, 380)],
    'paper': [lambda r: paper(r, .35), lambda r: paper(r, .55), lambda r: paper(r, .25)],
    'tick': [lambda r: tick(r, 2400), lambda r: tick(r, 3100)],
    'impact': [lambda r: impact(r, 62), lambda r: impact(r, 48)],
    'riser': [lambda r: riser(r, 1.4)],
    'ding': [lambda r: ding(r, 880), lambda r: ding(r, 1320)],
    'type': [lambda r: typekey(r), lambda r: typekey(r), lambda r: typekey(r)],
}


def main():
    args = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in sys.argv[1:] if a.startswith('--'))
    out = args.get('out', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'sfx'))
    made = 0
    for cat, makers in PACK.items():
        for i, mk in enumerate(makers, 1):
            p = os.path.normpath(os.path.join(out, cat, f'starter_{i}.wav'))
            if os.path.exists(p) and 'force' not in args:
                continue
            write(p, mk(random.Random(f'{cat}{i}'))); made += 1
    print(f'make_sfx: {made} file(s) written under {os.path.normpath(out)} ({sum(map(len, PACK.values()))} in the pack)')


if __name__ == '__main__':
    main()
