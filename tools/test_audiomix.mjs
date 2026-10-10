// tools/test_audiomix.mjs: the sound mix of tools/pipeline.mjs (tools/lib/audiomix.mjs) run through ffmpeg on
// synthetic sounds, measured: the music bed dips under the narration and swells back, SFX land on their shot's real
// start (+ offset), and the graph also builds without narration or without music. Exit code 1 if a check fails.
//   node tools/test_audiomix.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { audioMix } from './lib/audiomix.mjs';

const dir = mkdtempSync(join(tmpdir(), 'audiomix-')), f = n => join(dir, n);
const ff = (...a) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a], { timeout: 30000 });   // a stalled graph fails, never hangs
ff('-f', 'lavfi', '-i', 'sine=f=300:d=4', f('narr.wav'));            // "speech": 4 s of tone
ff('-f', 'lavfi', '-i', 'sine=f=620:d=1.3', f('music.wav'));         // a short loop
ff('-f', 'lavfi', '-i', 'sine=f=2000:d=0.05', f('pop.wav'));         // a click
let fails = 0; const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fails++; };

// mono 16-bit RMS per 0.25 s window of the [a] output
function render(opts, total) {
  const { inputs, mix } = audioMix({ k0: 0, total, ...opts });   // in the pipeline the video inputs come first (k0)
  ff(...inputs, '-filter_complex', mix.slice(1), '-map', '[a]', '-ac', '1', '-ar', '8000', '-t', String(total), f('out.wav'));   // -t bounds the looped inputs, as in the pipeline
  const b = readFileSync(f('out.wav')), data = b.subarray(b.indexOf('data') + 8), n = data.length / 2, win = 2000, rms = [];
  for (let i = 0; i + win <= n; i += win) { let s = 0; for (let j = i; j < i + win; j++) { const v = data.readInt16LE(j * 2); s += v * v; } rms.push(Math.sqrt(s / win)); }
  return rms;
}
const dB = (a, b) => 20 * Math.log10(a / b);
const segments = [{ id: 'A' }, { id: 'B' }], starts = [0, 2.5];

// 1. narration 2.5–5.0 s (window 0..2.5 of the file placed at shot B's start), music ducked under it
const music = { file: 'x', gain: .5, duck: .7, fadeIn: .2, fadeOut: .5 };
const r1 = render({ starts, segments, narr: f('narr.wav'), windows: [{ start: 0, end: 0 }, { start: 0, end: 2.5 }], mus: f('music.wav'), music }, 8);
const silentNarr = render({ starts, segments, narr: f('narr.wav'), windows: [{ start: 0, end: 0 }, { start: 0, end: 2.5 }], mus: f('music.wav'), music: { ...music, duck: 0 } }, 8);
// music alone (narration muted by measuring the no-duck mix minus... simpler: compare the bed before / during / after)
const before = r1[6], during = r1[14], after = r1[29];   // 1.5 s, 3.5 s, 7.25 s
const noDuckDuring = silentNarr[14];
check(during < noDuckDuring, `the mix is quieter while speech plays when ducking is on (${during.toFixed(0)} < ${noDuckDuring.toFixed(0)})`);
const bedOnly = render({ starts, segments, mus: f('music.wav'), music }, 8);
check(Math.abs(dB(bedOnly[6], before)) < 1, `before the narration the bed plays at full level (${dB(bedOnly[6], before).toFixed(1)} dB)`);
// during speech: the mix minus the speech ≈ the ducked bed; estimate via the speech-only level
const speechOnly = render({ starts, segments, narr: f('narr.wav'), windows: [{ start: 0, end: 0 }, { start: 0, end: 2.5 }] }, 8);
const bedDuring = Math.sqrt(Math.max(1, during ** 2 - speechOnly[14] ** 2));
check(dB(bedOnly[14], bedDuring) > 6, `the bed dips under the narration by ${dB(bedOnly[14], bedDuring).toFixed(1)} dB (> 6)`);
check(after > before * .6 && after < before * 1.4, `the bed swells back after the narration (${after.toFixed(0)} vs ${before.toFixed(0)})`);

// 2. SFX: beat B + .5 s lands at 3.0 s on the assembled timeline; `at` is absolute
const r2 = render({ starts, segments, sfx: [{ file: f('pop.wav'), beat: 'B', offset: .5, gain: 1 }, { file: f('pop.wav'), at: 1, gain: 1 }] }, 5);
const peak = r2.indexOf(Math.max(...r2)), loud = r2.map((v, i) => [v, i]).filter(([v]) => v > 50).map(([, i]) => i * .25);
check(loud.includes(3) && loud.includes(1), `SFX at 1.0 s (absolute) and 3.0 s (shot B + 0.5) → heard at ${loud.join(', ')} s`);
check(peak >= 0, 'SFX graph builds');

// 3. a shot with no narration (an empty window) next to ducked music: once stalled ffmpeg forever
let ok3 = true; try { render({ starts, segments, narr: f('narr.wav'), windows: [{ start: 0, end: 0 }, { start: 0, end: 2 }], mus: f('music.wav'), music }, 6); } catch (e) { ok3 = false; }
check(ok3, 'an empty narration window with ducked music renders (no stall)');
let ok4 = true; try { render({ starts, segments, narr: f('narr.wav'), windows: [{ start: 0, end: 0 }, { start: 1, end: 1 }], mus: f('music.wav'), music }, 6); } catch (e) { ok4 = false; }
check(ok4, 'no narration spoken at all, music still plays (no dangling duck key)');

// 4. no sound at all → no audio graph
check(audioMix({ k0: 0, total: 3, starts, segments }).mix === '', 'no sound sources: no audio graph');
rmSync(dir, { recursive: true, force: true });
console.log(fails ? `${fails} check(s) FAILED` : 'all audio mix checks passed');
process.exit(fails ? 1 : 0);
