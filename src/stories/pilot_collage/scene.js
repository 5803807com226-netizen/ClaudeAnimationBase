// pilot_collage/scene.js: Scene 1 (0–3 s), the hook, as DATA. The artwork is never drawn in code; every layer is an
// imported PNG (ART_BRIEF.md says what each one is). Plain JSON-safe values only, so another tool (e.g. AutoCinematic)
// can write the same manifest. Times are video seconds; positions are world px on the page (centre 540, 960); sizes are
// display widths in world px (heights follow each image's own aspect). Values may be per format: { '9:16', '16:9', '4:5' }.
// `gen` blocks tell tools/gen_assets.mjs how to make each layer (ignored when playing); a layer without one, or with
// engine 'manual', is imported by hand.
SCENES.s1_hook = {
  assets: 'assets/stories/pilot_collage/s1/', duration: 3, background: '#E9DCC6', aspects: ['9:16', '16:9', '4:5'],
  // a slow settle into the scene, then a push toward the message as it lands; holds on the message for scene 2
  camera: {
    '9:16': [[0, 540, 990, 1, 'ease'], [.9, 540, 960, 1.06, 'easeOut'], [2.4, 540, 900, 1.3, 'ease'], [3, 540, 895, 1.33, 'ease']],
    '16:9': [[0, 560, 1010, 1, 'ease'], [.9, 570, 1000, 1.04, 'easeOut'], [2.4, 640, 980, 1.2, 'ease'], [3, 645, 978, 1.22, 'ease']],
    '4:5': [[0, 540, 1080, 1, 'ease'], [.9, 540, 1060, 1.05, 'easeOut'], [2.4, 540, 1000, 1.26, 'ease'], [3, 540, 995, 1.29, 'ease']],
  },
  narration: [{ at: .2, end: 2.8, text: 'ข้อความเดียวจากเขา ทำเราหงุดหงิดได้ทั้งวัน' }],   // provisional: retime to the real voice
  // shared generation style: one paper language, one light, one seed family, for every layer of every scene that uses it
  gen: {
    seed: 4101,
    style: 'editorial paper collage element, handmade, real paper texture with visible fibres, torn edges with white fibrous core where torn, soft natural window light from the top left, matte, high detail, photographed flat from directly above',
    isolate: 'isolated on a plain flat solid chroma green background (#00B140), no cast shadow on the background, centered with empty margin around the object',
    negative: 'text, letters, words, numbers, digits, typography, captions, handwriting, calligraphy, logo, brand, trademark, watermark, signature, stamp, UI, icons, app interface, emoji, frame, border, drop shadow, cast shadow, 3D render, plastic, glossy, vector, flat cartoon, clip art, lens flare, bokeh, blurry, low resolution',
  },
  layers: [
    // ---- the morning (back) ----
    { id: 'bg', file: 's1_bg_kraft.png', size: [2200], at: [540, 960], depth: .85, fill: true,
      gen: { engine: 'zimage', size: [1536, 1536], matte: 'none', isolate: false,
        prompt: 'a sheet of warm kraft paper and cream paper overlapping, full frame, fine fibre texture, a few soft creases, subtle warm vignette, top-down flat lay, full-bleed texture filling the entire image, no object, evenly lit' } },
    { id: 'sky', file: 's1_sky_strip.png', size: { '9:16': [1400], '16:9': [2100], '4:5': [1400] }, at: { '9:16': [540, 330], '16:9': [560, 560], '4:5': [540, 480] }, depth: .7,
      paper: { shadow: { dx: 6, dy: 10, blur: 12, opacity: .28 }, grain: .25 },
      gen: { engine: 'zimage', size: [1792, 768], matte: 'chroma',
        prompt: 'a long horizontal strip of pale sky-blue sugar paper, torn along the bottom edge showing white fibres, slightly uneven straight top edge, subtle paper tooth, very soft lighter area near the top' } },
    { id: 'sun', file: 's1_sun.png', size: [360], at: { '9:16': [770, 300], '16:9': [1170, 540], '4:5': [770, 450] }, depth: .62, step: 2,
      paper: { shadow: { dx: 6, dy: 9, blur: 10, opacity: .3 } },
      keys: { '9:16': [[0, { rot: 0 }], [1.6, { rot: -8, y: 300 }], [2.6, { rot: -10, y: 330 }, 'ease']],
              '16:9': [[0, { rot: 0 }], [1.6, { rot: -8, y: 540 }], [2.6, { rot: -10, y: 570 }, 'ease']],
              '4:5': [[0, { rot: 0 }], [1.6, { rot: -8, y: 450 }], [2.6, { rot: -10, y: 480 }, 'ease']] },   // the morning sinks a little
      gen: { engine: 'zimage', size: [1024, 1024], matte: 'chroma',
        prompt: 'a hand-cut circle of warm yellow paper, slightly irregular scissor-cut edge, subtle paper tooth, a faint lighter area at the top left, no rays, no face' } },
    { id: 'cloud', file: 's1_cloud.png', size: [620], at: { '9:16': [1300, 330], '16:9': [1800, 560], '4:5': [1300, 480] }, depth: .66, step: 2,
      paper: { shadow: { dx: 8, dy: 12, blur: 14, opacity: .32 } },
      keys: { '9:16': [[0, { x: 1300 }], [.95, { x: 1300 }], [2.1, { x: 840 }, 'easeOut']],
              '16:9': [[0, { x: 1800 }], [.95, { x: 1800 }], [2.1, { x: 1240 }, 'easeOut']],
              '4:5': [[0, { x: 1300 }], [.95, { x: 1300 }], [2.1, { x: 840 }, 'easeOut']] },              // a grey cloud slides over the sun
      gen: { engine: 'zimage', size: [1344, 832], matte: 'chroma',
        prompt: 'a torn paper cloud made of two overlapping layers of grey-lavender paper, soft bumpy torn outline with white fibres, gentle shading' } },
    // ---- the event (middle) ----
    { id: 'hand', file: 's1_hand_phone.png', size: { '9:16': [null, 1100], '16:9': [null, 820], '4:5': [null, 900] }, at: { '9:16': [540, 1460], '16:9': [330, 1330], '4:5': [540, 1500] },
      rot: -6, subject: true, step: 2, edgeOk: true,
      paper: { shadow: { dx: 14, dy: 22, blur: 22, opacity: .34 }, border: 6, grain: .15 },
      keys: [[0, { rot: -6 }], [.12, { rot: -4.8 }], [.2, { rot: -7.2 }], [.28, { rot: -5.1 }], [.36, { rot: -6.6 }], [.46, { rot: -6 }]],   // the buzz, on twos
      // the canvas keeps clear room either side of the phone (margin) for the vibration marks, which share it
      gen: { engine: 'qwen', size: [1024, 1472], matte: 'chroma', character: 'hand_v1', margin: .3,
        style: 'a printed photograph cut out with scissors, matte print texture, soft natural window light from the top left, high detail, true-to-life colour',
        prompt: 'a photograph of a young Asian woman\'s hand holding a modern black smartphone upright, front view, phone screen completely dark and blank, natural matte skin, short neat nails, relaxed grip, slight tilt, cut out like a printed photograph, wrist ending at the bottom of the image',
        negative: 'brand logo, camera bump, notification, wallpaper, reflections of text, extra fingers, deformed hand' } },
    { id: 'screen', file: 's1_screen_glow.png', size: { '9:16': [null, 1100], '16:9': [null, 820], '4:5': [null, 900] }, at: { '9:16': [540, 1460], '16:9': [330, 1330], '4:5': [540, 1500] }, rot: -6, step: 2,
      keys: [[0, { opacity: 0, rot: -6 }], [.12, { opacity: 1, rot: -4.8 }], [.2, { rot: -7.2 }], [.28, { rot: -5.1 }], [.36, { rot: -6.6 }], [.46, { rot: -6 }]],
      gen: { engine: 'derive', op: 'screen_glow', from: 'hand', colors: ['#FFF4DE', '#F4E6CC'] } },
    { id: 'buzz', file: 's1_buzz.png', size: { '9:16': [null, 1100], '16:9': [null, 820], '4:5': [null, 900] }, at: { '9:16': [540, 1460], '16:9': [330, 1330], '4:5': [540, 1500] }, rot: -6, step: 2,
      keys: [[0, { opacity: 0 }], [.12, { opacity: 1 }], [.4, { opacity: 1 }], [.55, { opacity: 0 }]],
      gen: { engine: 'derive', op: 'beside', from: 'hand', mirror: true,
        source: { engine: 'zimage', size: [768, 1024], matte: 'chroma', prompt: 'two short curved strips of cream paper cut with scissors, arranged one above the other like a vibration mark, simple and elegant' } } },
    { id: 'message', file: 's1_message.png', size: { '9:16': [560], '16:9': [520], '4:5': [520] }, at: { '9:16': [560, 930], '16:9': [860, 960], '4:5': [560, 1030] }, rot: -3, subject: true,
      paper: { shadow: { dx: 10, dy: 16, blur: 16, opacity: .38 }, border: 8, grain: .3 },
      reveal: { '9:16': { kind: 'place', at: .42, dur: .55, from: 'bottom', dist: 520, rot: -12, lift: 1.2 },
                '16:9': { kind: 'place', at: .42, dur: .55, from: 'left', dist: 520, rot: -12, lift: 1.2 },
                '4:5': { kind: 'place', at: .42, dur: .55, from: 'bottom', dist: 480, rot: -12, lift: 1.2 } },
      gen: { engine: 'zimage', size: [1344, 832], matte: 'chroma',
        prompt: 'a torn piece of coral-red paper shaped like a rounded speech bubble with a small torn tail at the bottom left, two hand-drawn wavy cream lines across it like abstract brush strokes, subtle paper fibres, soft shading' } },
    // ---- the frame (front) ----
    { id: 'fg', file: 's1_fg_edge.png', size: [2200], at: { '9:16': [540, 1900], '16:9': [560, 1560], '4:5': [540, 1770] }, depth: 1.15, edgeOk: true,
      paper: { shadow: { dx: 0, dy: -8, blur: 16, opacity: .25 }, grain: .2 },
      gen: { engine: 'zimage', size: [1920, 512], matte: 'chroma',
        prompt: 'a long strip of cream paper lying horizontally, torn along its top edge with white fibres, slightly crumpled, soft shading' } },
  ],
  type: [
    { say: 0, text: 'ข้อความเดียวจากเขา', preset: 'pop', at: .3, stagger: .05, y: .12, prefer: 'up', maxLines: 1,
      style: { font: 'display', weight: 800, size: 104, color: '#2B2233', stroke: { color: '#F6EEDF', width: 8 } } },
    { text: 'ทำเราหงุดหงิดได้ทั้งวัน', preset: 'highlight', at: 1.25, y: .19, prefer: 'up', maxLines: 1,
      style: { font: 'display', weight: 600, size: 80, color: '#2B2233', highlight: '#F2C14E' } },
  ],
};
playCollage(SCENES.s1_hook);
