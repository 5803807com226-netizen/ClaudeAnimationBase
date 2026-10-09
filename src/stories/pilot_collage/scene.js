// pilot_collage/scene.js: Scene 1 (0–3 s), the hook, as DATA. The artwork is never drawn in code; every layer is an
// imported PNG (see ART_BRIEF.md for what each one is and how to make it). Plain JSON-safe values only, so another tool
// (e.g. AutoCinematic) can write the same manifest. Times are video seconds; positions are world px on the 1080 × 1920
// page (centre 540, 960); sizes are display widths in world px (heights follow each image's own aspect).
SCENES.s1_hook = {
  assets: 'assets/stories/pilot_collage/s1/', duration: 3, background: '#E9DCC6',
  // a slow settle into the scene, then a push toward the message as it lands; holds on the message to hand over to scene 2
  camera: [[0, 540, 990, 1, 'ease'], [.9, 540, 960, 1.06, 'easeOut'], [2.4, 540, 900, 1.3, 'ease'], [3, 540, 895, 1.33, 'ease']],
  narration: [{ at: .2, end: 2.8, text: 'ข้อความเดียวจากเขา ทำเราหงุดหงิดได้ทั้งวัน' }],   // provisional: retime to the real voice
  layers: [
    // ---- the morning (back) ----
    { id: 'bg', file: 's1_bg_kraft.png', size: [1300], at: [540, 960], depth: .85, fill: true },
    { id: 'sky', file: 's1_sky_strip.png', size: [1400], at: [540, 330], anchor: [.5, .5], depth: .7,
      paper: { shadow: { dx: 6, dy: 10, blur: 12, opacity: .28 }, grain: .25 } },
    { id: 'sun', file: 's1_sun.png', size: [360], at: [770, 300], depth: .62, step: 2,
      paper: { shadow: { dx: 6, dy: 9, blur: 10, opacity: .3 } },
      keys: [[0, { rot: 0 }], [1.6, { rot: -8, y: 300 }], [2.6, { rot: -10, y: 330 }, 'ease']] },   // the morning sinks a little
    { id: 'cloud', file: 's1_cloud.png', size: [620], at: [1300, 330], depth: .66, step: 2,
      paper: { shadow: { dx: 8, dy: 12, blur: 14, opacity: .32 } },
      keys: [[0, { x: 1300 }], [.95, { x: 1300 }], [2.1, { x: 840 }, 'easeOut']] },              // a grey cloud slides over the sun
    // ---- the event (middle) ----
    { id: 'hand', file: 's1_hand_phone.png', size: [760], at: [540, 1430], anchor: [.5, .5], rot: -6, subject: true, step: 2,
      paper: { shadow: { dx: 14, dy: 22, blur: 22, opacity: .34 }, border: 6, grain: .15 },
      keys: [[0, { rot: -6 }], [.12, { rot: -4.8 }], [.2, { rot: -7.2 }], [.28, { rot: -5.1 }], [.36, { rot: -6.6 }], [.46, { rot: -6 }]] },   // the buzz, on twos
    { id: 'screen', file: 's1_screen_glow.png', size: [760], at: [540, 1430], rot: -6, step: 2,
      keys: [[0, { opacity: 0, rot: -6 }], [.12, { opacity: 1, rot: -4.8 }], [.2, { rot: -7.2 }], [.28, { rot: -5.1 }], [.36, { rot: -6.6 }], [.46, { rot: -6 }]] },
    { id: 'buzz', file: 's1_buzz.png', size: [760], at: [540, 1430], rot: -6, step: 2,
      keys: [[0, { opacity: 0 }], [.12, { opacity: 1 }], [.4, { opacity: 1 }], [.55, { opacity: 0 }]] },
    { id: 'message', file: 's1_message.png', size: [560], at: [560, 930], anchor: [.5, .5], rot: -3, subject: true,
      paper: { shadow: { dx: 10, dy: 16, blur: 16, opacity: .38 }, border: 8, grain: .3 },
      reveal: { kind: 'place', at: .42, dur: .55, from: 'bottom', dist: 520, rot: -12, lift: 1.2 } },
    // ---- the frame (front) ----
    { id: 'fg', file: 's1_fg_edge.png', size: [1500], at: [540, 1900], depth: 1.15,
      paper: { shadow: { dx: 0, dy: -8, blur: 16, opacity: .25 }, grain: .2 } },
  ],
  type: [
    { say: 0, text: 'ข้อความเดียวจากเขา', preset: 'pop', at: .3, stagger: .05, y: .12, prefer: 'up', maxLines: 1,
      style: { font: 'display', weight: 800, size: 104, color: '#2B2233', stroke: { color: '#F6EEDF', width: 8 } } },
    { text: 'ทำเราหงุดหงิดได้ทั้งวัน', preset: 'highlight', at: 1.25, y: .19, prefer: 'up', maxLines: 1,
      style: { font: 'display', weight: 600, size: 80, color: '#2B2233', highlight: '#F2C14E' } },
  ],
};
playCollage(SCENES.s1_hook);
