// the_last_smoke: "The Last Smoke / ควันไฟสุดท้าย", a 15 s, 9:16, 24 fps painted-cartoon character pilot: five 3 s shots of ONE
// rigged elderly traveller (cutout rig from src/rig/cutout.js, PNG parts from one locked master; see rig_spec.js).
// Artwork: assets/stories/the_last_smoke/ (generate: node tools/gen_assets.mjs --story=the_last_smoke; see assets.js).
// Motion test with labelled MOCK stand-ins (no artwork needed):
//   python tools/make_smoke_mocks.py
//   node render.mjs --story=the_last_smoke --assets=out/mock_assets/the_last_smoke/ --sheet=0.5,3.5,6.5,9.5,12.5
const PROJECT = { width: 1080, height: 1920, aspect: '9:16', duration: 15, bpm: 120, offset: 0, audio: '',
  look: { style: 'illustration', set: { paper: 0 } }, files: ['rig_spec.js', 'assets.js', 'story.js'] };
