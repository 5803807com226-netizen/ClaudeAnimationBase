// brushWipe (preset): the existing brushWipe() transition, timed and configured as a preset. Draw it last, in screen
// space (presetShot's `after` list does).
//   part   'cover'  strokes sweep in and HOLD the frame covered (put at the end of a shot)
//          'reveal' starts covered and drags off (put at the start of the next shot)
//          'full'   cover then reveal in one go
//   colors [c1, c2] stroke colours (use the same pair on both sides of a cut)
definePreset('brushWipe', {
  label: 'Brush Wipe Transition', about: 'brushWipe(p, colors) with p mapped from time: cover, reveal or full',
  meta: { version: '1.0.0', category: 'transition', tags: ['transition', 'wipe', 'brush', 'cover', 'reveal'], params: { part: { enum: ['cover', 'reveal', 'full'] } }, camera: 'screen', layers: ['transition'] },
  defaults: { part: 'full', colors: [PAL.clayDk, PAL.clay], ease: 'linear', dur: .8 },
  run(t, o) {
    const [a, b] = { cover: [0, .5], reveal: [.5, 1], full: [0, 1] }[o.part];
    if ((o.part === 'full' || o.part === 'cover') && t < o.at) return;
    if ((o.part === 'full' || o.part === 'reveal') && t > o.at + o.dur) return;
    brushWipe(lerp(a, b, presetK(t, o)), o.colors);
  },
  demo: {
    layers: [(lt) => { background(lt < 1.3 ? PAL.sky : PAL.cream); clawd(W / 2, ny(860 / 1080), 26 * US(), feel(lt < 1.3 ? 'neutral' : 'happy', lt)); }],
    after: [['brushWipe', { part: 'full', at: .6, dur: 1.4 }]],
  },
});
