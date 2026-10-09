// presets/gallery.js: preview every preset with its name. Reference only, so labels are fine here (like sheets.js).
//   studio.html?loop=presets             a tour: each preset's demo in turn, titled
//   studio.html?loop=preset_<name>       one preset's demo on its own (e.g. ?loop=preset_popBounce)
//   node render.mjs --loop=presets --sheet=1,3.4,4.75,6.05,8.8,10,13.4,14.4,16.4,17.6,19.8,21.4 --cols=4 --w=480 --out=docs/presets.jpg
(() => {
  const LEN = { shapeMorph: 4.5, brushWipe: 3, objectReveal: 3.5 };       // demo length per preset; default 4 s
  const title = P => {
    const s = US(), about = P.name + '  ·  ' + P.about;   // titles scale with the frame and never overflow its width
    letter(P.label, W / 2, 74 * s, Math.min(64 * s, W * .9 / (P.label.length * .55)), PAL.cream, { stroke: PAL.ink, screen: true });
    letter(about, W / 2, 136 * s, Math.min(30 * s, W * .94 / (about.length * .5)), PAL.cream, { stroke: PAL.ink, screen: true });
  };
  const tour = [];
  let start = 0;
  for (const P of Object.values(PRESETS)) {
    const shot = presetShot(P.demo), len = LEN[P.name] || 4;
    LOOPS['preset_' + P.name] = t => { shot(t, t, len); title(P); };
    LOOPS['preset_' + P.name].len = len;
    tour.push([start, (t, lt, dur) => { shot(t, lt, dur); title(P); }]);
    start += len;
  }
  LOOPS.presets = presetSequence(tour, start);
})();
