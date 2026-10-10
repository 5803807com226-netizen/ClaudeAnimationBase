// tools/lib/audiomix.mjs: the sound of a finished video as one ffmpeg filter graph (used by tools/pipeline.mjs, tested
// on its own by tools/test_audiomix.mjs). Layers, all placed on the assembled timeline (`starts`: where each shot really
// starts after transitions):
//   narration   cut per plan window and placed at its shot's start (or used whole)
//   sfx         [{ file, at | beat (a shot id) + offset, gain }]
//   ambience    { file, gain } looped, faded in and out
//   music       { file, gain = .22, duck = .7, fadeIn = 1.2, fadeOut = 2 } looped, faded, and DUCKED under the narration
//               with a sidechain compressor (duck 0 = never dips, 1 = dips hard; .7 ≈ 10–14 dB under speech, swelling
//               back between lines)
// Returns the extra ffmpeg inputs and `mix` (";…[a]", appended to the video graph), or mix '' when there is no sound.
const clamp01 = x => Math.max(0, Math.min(1, +x || 0));
const num = x => (+x).toFixed(3);   // ffmpeg durations reject ".5": always a leading digit

export function audioMix({ k0, total, starts, segments, narr, windows, sfx = [], amb, ambience = {}, mus, music = {} }) {
  const inputs = [], A = [], outs = []; let k = k0, keyed = false; const ms = x => Math.max(0, Math.round(x * 1000));
  const duck = clamp01(music.duck ?? .7), ducking = !!(narr && mus && duck > 0);
  if (narr) {
    inputs.push('-i', narr); const n = k++, nl = [];
    // an empty window (a shot with no narration) is skipped: a zero-length stream stalls the ducking graph forever
    if (windows) windows.forEach((w, i) => { if (!(w.end > w.start)) return; A.push(`[${n}:a]atrim=${w.start}:${w.end},asetpts=PTS-STARTPTS,adelay=${ms(starts[i])}:all=1[n${i}]`); nl.push(`n${i}`); });
    if (!windows) { A.push(`[${n}:a]anull[n0]`); nl.push('n0'); }
    // ducking: the narration as one stream, one copy into the mix and one as the key that ducks the music
    if (!nl.length) { /* nothing spoken */ } else if (ducking) { A.push(`${nl.map(l => `[${l}]`).join('')}amix=inputs=${nl.length}:normalize=0,apad,atrim=0:${num(total)},asplit=2[narr][key]`); outs.push('narr'); keyed = true; }
    else outs.push(...nl);
  }
  const byBeat = Object.fromEntries(segments.map((S, i) => [S.beat || S.id, starts[i]]));
  sfx.forEach((c, i) => { inputs.push('-i', c.file); const at = c.at ?? ((byBeat[c.beat] ?? 0) + (c.offset || 0));
    A.push(`[${k++}:a]volume=${c.gain ?? 1},adelay=${ms(at)}:all=1[s${i}]`); outs.push(`s${i}`); });
  if (amb) { inputs.push('-stream_loop', '-1', '-i', amb); A.push(`[${k++}:a]volume=${ambience.gain ?? .12},afade=t=in:d=1,afade=t=out:st=${num(Math.max(0, total - 1.5))}:d=1.5,atrim=0:${num(total)}[amb]`); outs.push('amb'); }
  if (mus) {
    inputs.push('-stream_loop', '-1', '-i', mus); const m = k++, fo = music.fadeOut ?? 2;
    const bed = `[${m}:a]volume=${music.gain ?? .22},afade=t=in:d=${num(music.fadeIn ?? 1.2)},afade=t=out:st=${num(Math.max(0, total - fo))}:d=${num(fo)},atrim=0:${num(total)}`;
    if (keyed) A.push(`${bed}[mbed];[mbed][key]sidechaincompress=threshold=0.02:ratio=${(2 + duck * 18).toFixed(1)}:attack=60:release=600:makeup=1[mus]`);
    else A.push(`${bed}[mus]`);
    outs.push('mus');
  }
  const mix = outs.length ? `;${A.join(';')};${outs.map(l => `[${l}]`).join('')}amix=inputs=${outs.length}:normalize=0,apad,atrim=0:${num(total)}[a]` : '';
  return { inputs, mix };
}
