// preset_example.js: a 9-second story built ONLY from presets and data, as a template for cheap story scenes.
// Preview it at studio.html?loop=example. It is a loop, so the demo video stays as it is; to make it the video,
// replace demo.js's script tag with this file and change the last line to shots([[0, gift], [4.5, joy]]).
//   Shot A (0–4.5 s): Clawd waits in a meadow; a gift drops from the sky; Clawd gasps. Camera pushes in. Brush wipe.
//   Shot B (4.5–9 s): at dusk the gift melts into a heart, which bursts into hearts; Clawd is in love. Wipe out.
(() => {
  const WIPE = [PAL.violet, PAL.rose];      // the same wipe colours on both sides of the cut

  const gift = presetShot({
    bg: PAL.sky, ground: { y: 860, color: PAL.sap },
    camera: { from: [960, 540, 1], to: [1060, 600, 1.25], dur: 4.5, drift: 8 },
    layers: [
      (lt) => clawd(780, 860, 26, { ...emotions(lt, [[0, 'bored'], [2.2, 'surprised', { lookX: 1, lookY: -.2 }]]), view: lt > 2.2 ? 'q' : 'front' }),
      ['objectReveal', { x: 1260, y: 760, size: 90, shape: 'square', color: PAL.clay, from: 'above', dist: 900, arc: 0, glow: null, at: 1.2, dur: .8 }],
      ['popBounce', { x: 1260, y: 640, size: 34, shape: 'star', at: 2.4, hops: 0 }],   // a sparkle on the lid
    ],
    after: [['brushWipe', d => ({ part: 'cover', at: d - .5, dur: .5, colors: WIPE })]],
  });

  const joy = presetShot({
    bg: PAL.night, ground: { y: 860, color: PAL.indigo },
    camera: { from: [1060, 600, 1.25], to: [1000, 560, 1.1], dur: 4.5, drift: 8 },
    layers: [
      (lt) => clawd(780, 860, 26, { ...emotions(lt, [[0, 'surprised'], [2.6, 'love']]), view: 'q' }),
      ['shapeMorph', { x: 1260, y: 740, size: 100, shapes: ['square', 'circle', 'heart'], colors: [PAL.clay, PAL.ochre, PAL.rose], at: .6, dur: .7, hold: .3 }],
      ['particleBurst', { x: 1260, y: 700, shape: 'heart', colors: [PAL.rose, PAL.clayLt, PAL.cream], glow: PAL.rose, at: 2.4, dur: 1.6 }],
    ],
    after: [['brushWipe', { part: 'reveal', at: 0, dur: .5, colors: WIPE }], ['brushWipe', d => ({ part: 'cover', at: d - .6, dur: .6, colors: WIPE })]],
  });

  LOOPS.example = presetSequence([[0, gift], [4.5, joy]], 9);
})();
