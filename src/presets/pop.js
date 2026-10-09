// popBounce: an object pops in with overshoot, wobbles to rest, then hops.
//   x, y        where it sits (y = its centre)                    size, color, shape / draw   see index.js
//   hops        how many hops after the pop      hopH  hop height in sizes      hopGap  seconds between hops
//   wobble      follow-through wobble after the pop (0 = none)     beat  true to pulse with the music's beat
definePreset('popBounce', {
  label: 'Pop & Bounce', about: 'backOut pop-in, spring wobble, then jump() hops with squash and stretch',
  meta: { version: '1.0.0', category: 'object', tags: ['pop', 'bounce', 'entrance', 'emphasis', 'hop'], params: { shape: { enum: ['star', 'circle', 'heart', 'square'] } } },
  defaults: { x: W / 2, y: ny(700 / 1080), size: 110 * US(), color: PAL.ochre, shape: 'star', hops: 2, hopH: 1.2, hopGap: .75, wobble: .12, beat: false, ease: 'backOut', dur: .55 },
  run(t, o) {
    if (t < o.at) return;
    const end = o.at + o.dur;
    let s = presetK(t, o) * (1 + o.wobble * spring(t, end, 7, 22)) * (o.beat ? 1 + .06 * pulse(t) : 1), dy = 0, sq = 0;
    for (let i = 0; i < o.hops; i++) {                       // one jump() per hop; its squash-land tail overlaps the next
      const t0 = end + .25 + i * o.hopGap, h = jump(t, t0, t0 + o.hopGap * .6, o.hopH * .9);
      dy += h.dy; sq += h.sq;
    }
    presetPlace(o.x, o.y + dy * o.size, 0, s * (1 + sq * .6), s * (1 - sq), () => presetItem(o));
  },
  demo: { bg: PAL.sky, ground: { y: ny(860 / 1080), color: PAL.sap }, layers: [['popBounce', { x: W / 2, y: ny(860 / 1080) - 160 * US(), size: 130 * US(), at: .4 }]] },
});
