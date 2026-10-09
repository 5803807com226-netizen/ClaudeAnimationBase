// collage_test/scene.js: exercises every collage feature with synthetic fixtures. 'broken' is never played; it exists
// so tools/validate_assets.mjs can prove it FAILs what it should (missing file, too small, no transparency).
SCENES.collage_test = {
  assets: 'tools/fixtures/collage/', duration: 3, background: '#EFE6D6',
  camera: [[0, 540, 960, 1, 'ease'], [1.2, 540, 900, 1.12, 'easeOut'], [3, 540, 880, 1.15, 'ease']],
  layers: [
    { id: 'backdrop', file: 'test_backdrop.png', size: [1300], at: [540, 900], depth: .8, fill: true },
    { id: 'round', file: 'test_round.png', size: [300], at: [250, 620], depth: .9, paper: { shadow: { dx: 6, dy: 10, blur: 10, opacity: .3 }, border: 8 },
      keys: [[0, { rot: -4 }], [3, { rot: 6 }, 'ease']], step: 2 },
    { id: 'piece', file: 'test_piece.png', size: [640], at: [540, 1050], subject: true,
      paper: { shadow: { dx: 10, dy: 16, blur: 14, opacity: .38 }, border: 12, grain: .5 },
      reveal: { kind: 'place', at: .3, dur: .6, from: 'bottom', dist: 1100, rot: 8 } },
  ],
  narration: [{ at: .9, end: 2.6, text: 'ทดสอบข้อความเดียว' }],
  type: [{ say: 0, preset: 'pop', stagger: .05, y: .55, prefer: 'up', maxLines: 1, style: { font: 'display', weight: 800, size: 96, color: '#2B2233' } }],
};
SCENES.broken = { assets: 'tools/fixtures/collage/', duration: 1, camera: [[0, 540, 960, 2, 'ease'], [1, 540, 960, 2, 'ease']], layers: [
  { id: 'missing', file: 'nope.png', size: [300], at: [540, 960] },
  { id: 'tiny', file: 'test_round.png', size: [900], at: [540, 960] },
  { id: 'opaque', file: 'test_opaque.png', size: [200], at: [540, 960] },
  { id: 'badname', file: 'Test Opaque.png', size: [200], at: [540, 960] },
] };
playCollage(SCENES.collage_test);
