// tools/lib/timeline.mjs: AUDIO-DRIVEN TIMELINE. Narration timing → beats → how long each visual must last, and when
// sound cues land. Sources (first found): job.narration.beats [{ id, at, end, text }] · an SRT file · a Whisper-style
// JSON ({ segments: [{ start, end, text }] }). Without real narration the beats in the job are the provisional timing.
import { existsSync, readFileSync } from 'node:fs';

const srtTime = s => { const [h, m, r] = s.trim().replace(',', '.').split(':'); return +h * 3600 + +m * 60 + +r; };
export function loadBeats(job) {
  const N = job.narration || {}, ids = (job.beats || []).map(b => b.id);
  let src = null;
  if (N.srt && existsSync(N.srt)) src = readFileSync(N.srt, 'utf8').split(/\r?\n\r?\n/).map(b => b.split(/\r?\n/)).filter(l => l.length >= 3)
    .map(l => { const [a, b] = l[1].split('-->'); return { at: srtTime(a), end: srtTime(b), text: l.slice(2).join(' ') }; });
  else if (N.whisper && existsSync(N.whisper)) src = JSON.parse(readFileSync(N.whisper, 'utf8')).segments.map(s => ({ at: s.start, end: s.end, text: s.text.trim() }));
  // measured timing replaces the provisional one beat by beat, in order; anything extra is ignored
  const beats = (job.beats || []).map((b, i) => ({ ...b, ...(src && src[i] ? { at: src[i].at, end: src[i].end, measured: true } : {}) }));
  return { beats, measured: !!src, ids };
}
// the window a beat owns on screen: from its start to the next beat's start (its pause included); the last one gets a tail
export function windows(beats, tail = 1.2) {
  return beats.map((b, i) => ({ id: b.id, start: b.at, end: i + 1 < beats.length ? beats[i + 1].at : b.end + (b.tail ?? tail) }));
}
// fit a piece of natural length `len` into `target` seconds: play it a little faster or slower (never past ±25 %), then
// hold its last frame for the rest (a real pause, not a stretch)
export function fit(len, target, maxStretch = .25) {
  const speed = Math.min(1 + maxStretch, Math.max(1 - maxStretch, len / target)), played = len / speed;
  return { speed: +speed.toFixed(4), hold: +Math.max(0, target - played).toFixed(3) };
}
// sound cues in absolute seconds: { beat, offset } or { at }
export function cueTimes(cues, wins) {
  const byId = Object.fromEntries(wins.map(w => [w.id, w]));
  return (cues || []).map(c => ({ ...c, at: c.at ?? ((byId[c.beat]?.start ?? 0) + (c.offset || 0)) }));
}
