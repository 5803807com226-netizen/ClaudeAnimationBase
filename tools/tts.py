"""tts.py: THAI NARRATION from text, one cue per line (or per shot of a shot manifest), with MEASURED timing.

    python tools/tts.py --manifest=<shot manifest.json> --out=<dir>/narration [--engine=auto|edge|sapi] [--voice=...]
    python tools/tts.py --text=<lines.txt> --out=<dir>/narration ...
    Output: <out>.wav (44.1 kHz mono), <out>.srt (cue i = line / shot i, real start and end of each spoken line),
            and one JSON line on stdout: {"file": ..., "timing": ..., "cues": n, "seconds": ..., "engine": ...}

Each line is synthesised on its own, then joined with a short pause (--gap, s), so every cue's start and end are
exact (no forced alignment needed). In a manifest, shot i gets cue i: compile with audio.narration
{ file, timing, measured: true } and each shot's "say": [i, i] (Motion Studio does both), and the voice drives the cuts.

Engines:
  edge   Microsoft Edge neural voices (pip install edge-tts; needs internet): th-TH-PremwadeeNeural (female, default),
         th-TH-NiwatNeural (male). Natural sounding. Check the service's terms before commercial use.
  sapi   Windows' built-in speech (offline). Needs a Thai voice installed: Settings > Time & language > Speech >
         Add voices > Thai. Sounds robotic, but free and offline.
  auto   edge if it is installed and reachable, else sapi.
  silence  TEST ONLY: silent cues sized by text length (plumbing tests in the cloud; never a real narration).
"""
import sys as _sys
for _s in (_sys.stdout, _sys.stderr):   # Windows: a piped stdout is cp1252 and cannot print → or Thai; always UTF-8
    try: _s.reconfigure(encoding='utf-8', errors='replace')
    except Exception: pass
import json, os, subprocess, sys, tempfile

args = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--') and '=' in a)
OUT = args.get('out') or sys.exit('usage: python tools/tts.py --manifest=<m.json> | --text=<lines.txt> --out=<dir>/narration')
GAP, ENGINE = float(args.get('gap', .35)), args.get('engine', 'auto')
VOICE, RATE = args.get('voice', 'th-TH-PremwadeeNeural'), args.get('rate', '+0%')

if 'manifest' in args:
    M = json.load(open(args['manifest'], encoding='utf-8')); lines = [(s.get('narration') or '').strip() for s in M['shots']]
else:
    lines = [l.strip() for l in open(args['text'], encoding='utf-8').read().splitlines()]
    lines = [l for l in lines if l]
if not any(lines): sys.exit('tts: no narration text (shots need "narration", or give --text with one line per cue)')

def ff(*a): r = subprocess.run(['ffmpeg', '-v', 'error', '-y', *a], capture_output=True, text=True); r.returncode and sys.exit('ffmpeg: ' + r.stderr.strip())
def dur(f): return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], capture_output=True, text=True).stdout.strip() or 0)

def edge(text, path):
    import asyncio, time, edge_tts
    for attempt in range(8):   # the service often answers a line with no audio; a retry gets it
        try: return asyncio.run(edge_tts.Communicate(text, VOICE, rate=RATE).save(path))
        except edge_tts.exceptions.NoAudioReceived:
            if attempt == 7: raise
            time.sleep(min(1 + attempt, 4))

def sapi(text, path):
    if os.name != 'nt': raise RuntimeError('sapi needs Windows')
    tf = path + '.txt'; open(tf, 'w', encoding='utf-8').write(text)
    ps = ("Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
          "$v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq 'th-TH' } | Select-Object -First 1; "
          "if (-not $v) { exit 3 }; $s.SelectVoice($v.VoiceInfo.Name); "
          f"$s.SetOutputToWaveFile('{path}'); $s.Speak([IO.File]::ReadAllText('{tf}', [Text.Encoding]::UTF8)); $s.Dispose()")
    r = subprocess.run(['powershell', '-NoProfile', '-Command', ps], capture_output=True, text=True); os.remove(tf)
    if r.returncode == 3: raise RuntimeError('no Thai voice installed in Windows (Settings > Time & language > Speech > Add voices > Thai)')
    if r.returncode: raise RuntimeError('Windows speech failed: ' + (r.stderr or r.stdout).strip()[:300])

def silence(text, path): ff('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', f'{max(.8, len(text) * .085):.2f}', path)

def pick():
    if ENGINE == 'silence': return 'silence', silence
    if ENGINE in ('auto', 'edge'):
        try:
            import edge_tts  # noqa: F401
            return 'edge', edge
        except ImportError:
            if ENGINE == 'edge': sys.exit('tts: edge-tts is not installed: pip install edge-tts')
    return 'sapi', sapi

name, synth = pick()
tmp = tempfile.mkdtemp(prefix='tts_'); os.makedirs(os.path.dirname(os.path.abspath(OUT)) or '.', exist_ok=True)
parts, cues, t = [], [], 0.0
for i, text in enumerate(lines):
    seg = os.path.join(tmp, f'{i:03d}.wav')
    if text:
        raw = os.path.join(tmp, f'{i:03d}.src' + ('.mp3' if name == 'edge' else '.wav'))
        try: synth(text, raw)
        except Exception as e:
            if name == 'edge' and ENGINE == 'auto':   # offline or blocked: fall back to Windows speech once
                print(f'tts: edge failed ({e}); trying Windows speech', file=sys.stderr); name, synth = 'sapi', sapi; synth(text, raw)
            else: sys.exit(f'tts: {name} failed on line {i + 1}: {e}')
        ff('-i', raw, '-ar', '44100', '-ac', '1', seg)
    else: ff('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '0.4', seg)   # a shot without words: a short pause
    d = dur(seg); cues.append((i + 1, t, t + d, text)); parts.append(seg); t += d
    if i < len(lines) - 1:
        g = os.path.join(tmp, f'{i:03d}_gap.wav'); ff('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', f'{GAP}', g); parts.append(g); t += GAP
lst = os.path.join(tmp, 'list.txt'); open(lst, 'w', encoding='utf-8').write(''.join(f"file '{p}'\n" for p in parts))
ff('-f', 'concat', '-safe', '0', '-i', lst, '-ar', '44100', '-ac', '1', OUT + '.wav')
ts = lambda s: f'{int(s // 3600):02d}:{int(s % 3600 // 60):02d}:{int(s % 60):02d},{int(round(s % 1 * 1000)) % 1000:03d}'
with open(OUT + '.srt', 'w', encoding='utf-8') as f:
    for i, a, b, text in cues: f.write(f'{i}\n{ts(a)} --> {ts(b)}\n{text or "…"}\n\n')
print(json.dumps({'file': os.path.abspath(OUT + '.wav'), 'timing': os.path.abspath(OUT + '.srt'), 'cues': len(cues), 'seconds': round(t, 2), 'engine': name,
                  **({'test_only': 'silent stand-in, not a narration'} if name == 'silence' else {})}, ensure_ascii=False))
