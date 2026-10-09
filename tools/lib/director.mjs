// tools/lib/director.mjs: STORY MOTION DIRECTOR. Narrative beats (with an intent) → the segment list the pipeline renders.
// The rules are DATA, genre-agnostic, and every choice can be overridden per beat. A beat may have no text at all.
//   beat: { id, intent, at, end, text (narration), visual: { type: 'story' | 'ltx', story, range, prompt, image, … },
//           show: 'none' | 'key' | 'line' (on-screen text policy), key: 'the phrase to show', transition, hold, camera }
import { loadBeats, windows, fit } from './timeline.mjs';

// intent → how to cut INTO the beat, on-screen text policy, a camera hint for still / AI shots, and an extra pause
export const INTENTS = {
  hook:    { transition: 'cut',   show: 'key',  camera: 'push',  pause: 0 },     // start on action, no slow fade-in
  setup:   { transition: 'fade',  show: 'none', camera: 'drift', pause: 0 },
  build:   { transition: 'slide', show: 'key',  camera: 'push',  pause: 0 },     // momentum: directional move
  turn:    { transition: 'dip',   show: 'key',  camera: 'hold',  pause: .4 },    // a breath before the turn
  reflect: { transition: 'fade',  show: 'none', camera: 'pull',  pause: .6 },
  end:     { transition: 'fade',  show: 'line', camera: 'hold',  pause: 1.5 },   // let the last line be read
};
export const TRANSITIONS = { cut: ['fade', .04], match: ['fade', .04], fade: ['fade', .35], dip: ['fadewhite', .5], slide: ['slideup', .35], wipe: ['wipeleft', .4] };   // → ffmpeg xfade [name, seconds]

export function direct(job) {
  const { beats, measured } = loadBeats(job), wins = windows(beats);
  const segments = beats.map((b, i) => {
    const R = { ...INTENTS[b.intent] || INTENTS.setup, ...b }, w = wins[i], target = w.end - w.start + (R.pause || 0), V = b.visual || {};
    const text = R.show === 'none' ? null : R.show === 'line' ? (b.key || b.text) : (b.key || null);
    const seg = { id: b.id, beat: b.id, intent: b.intent, transition: R.transition, seconds: +target.toFixed(3) };
    if (V.type === 'ltx') Object.assign(seg, V, { type: 'ltx', seconds: +target.toFixed(3), camera: R.camera, text });
    else { const [a, z] = V.range, f = fit(z - a, target); Object.assign(seg, V, { type: 'story', speed: f.speed, hold: f.hold }); }
    return seg;
  });
  return { segments, windows: wins, measured };
}
