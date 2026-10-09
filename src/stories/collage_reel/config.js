// collage_reel: a 15 s EDITORIAL PHOTO-COLLAGE reel (Chiang Mai welcome), built only from the reusable collage motions
// (src/collage/collage.js COLLAGE_MOTIONS, reel transitions) and the label / stamp type presets. Style reference:
// docs/COLLAGE_MOTION_KIT.md. Artwork: assets/stories/collage_reel/ (Z-Image on your ComfyUI: tools/gen_assets.mjs).
//   node tools/validate_assets.mjs --story=collage_reel
const PROJECT = { width: 1080, height: 1920, aspect: '9:16', duration: 15, bpm: 120, offset: 0, audio: '',
  look: { style: 'collage', off: ['vignette'], set: { paper: .3 } }, files: ['scene.js'] };
