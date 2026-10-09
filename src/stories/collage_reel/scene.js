// collage_reel/scene.js: four collage scenes played as one reel, as DATA only. Every move is a reusable collage motion
// (place, pop, wipe, peel, follow + leave (a hand), roll, walk, sway, float, appear / vanish, boil) or a reel transition
// (push, slide); no scene-specific animation code. The orange tangerine is the motif that travels through every scene.
// World px on the 1080 × 1920 page; A(tall, wide) gives a value for 9:16 and one for 16:9 (16:9 sees 1920 × 1080 world
// px around the camera, so things spread sideways). Artwork: one folder for the whole reel.
const A = (tall, wide) => ({ '9:16': tall, '16:9': wide });
const DIR = 'assets/stories/collage_reel/';
const SHADOW = { dx: 8, dy: 12, blur: 12, opacity: .3, color: '#2A2A2E' };
const PAPER = { shadow: SHADOW, border: 7, borderColor: '#FBFAF6', grain: .25 };   // a printed photo cut out with scissors
const SMALL = { shadow: { ...SHADOW, dx: 5, dy: 8, blur: 8 }, border: 5, borderColor: '#FBFAF6', grain: .2 };
const GEN = {   // one look for every cut-out: grey halftone photo print with tangerine-orange and mint accents, like the reference
  seed: 7300,
  style: 'contemporary editorial photo collage element, a printed photograph cut out with scissors, mostly desaturated grey black-and-white photo print with fine halftone texture, selective accents of tangerine orange and pale aqua mint, matte paper print, soft even daylight, high detail, sharp clean outline, no text, no watermark, no logo',
  isolate: 'isolated on a plain flat solid chroma green background (#00B140), no cast shadow on the background, centered with empty margin around the object',
  negative: 'text, letters, words, numbers, digits, typography, captions, handwriting, logo, brand, trademark, watermark, signature, license plate, frame, border, drop shadow, cast shadow, 3D render, plastic, glossy, vector, flat cartoon, clip art, blurry, low resolution',
};
// the shared cut-outs (same file wherever they appear; generated once, cached by prompt)
const G = {
  tangerine: { engine: 'zimage', size: [1024, 1024], matte: 'chroma', prompt: 'a single ripe round tangerine fruit in vivid tangerine orange with one small deep teal leaf on its short stem, photographed from the side, full colour on the fruit' },
  globe: { engine: 'zimage', size: [1024, 1024], matte: 'chroma', prompt: 'a vintage desk globe on a metal stand, grey printed map with a few countries in tangerine orange, red and pale aqua mint, a wooden half meridian arc' },
  handUp: { engine: 'zimage', size: [832, 1216], matte: 'chroma', unshadow: false, prompt: 'a human hand reaching up from the bottom of the image, palm turned up and open as if carrying a small round fruit on the fingertips, grey black-and-white photo print, the wrist ends at the bottom edge of the image' },
  handDown: { engine: 'zimage', size: [832, 1216], matte: 'chroma', unshadow: false, prompt: 'a human hand reaching down from the top of the image, fingers pinching as if holding a small toy by its roof, grey black-and-white photo print, the wrist ends at the top edge of the image' },
  treeTeal: { engine: 'zimage', size: [1024, 1024], matte: 'chroma', prompt: 'a single small round tree with dense foliage in deep teal blue-green, a slim pale trunk, grey photo print with teal tint' },
  treePink: { engine: 'zimage', size: [1024, 1024], matte: 'chroma', prompt: 'a single small round tree in full pink blossom, a slim pale trunk, grey photo print with soft pink blossom' },
};
const L = (id, file, gen, o) => ({ id, file, gen, ...o });   // a layer
const ROAD_Y = A(1330, 1300);

// ---------- 1. the hook: a hand offers a tangerine; it peels apart into a globe (0–3.6 s) ----------
SCENES.reel_hook = {
  assets: DIR, duration: 3.6, background: '#F3F1EC', aspects: ['9:16', '16:9'], boil: { amp: 1.2, rot: .35 }, gen: GEN,
  camera: A([[0, 540, 960, 1, 'ease'], [3.6, 540, 930, 1.1, 'ease']], [[0, 540, 960, 1, 'ease'], [3.6, 540, 940, 1.08, 'ease']]),
  layers: [
    L('tape_a', 'tape_mint.png', { engine: 'zimage', size: [1344, 768], matte: 'chroma', prompt: 'a long torn strip of pale aqua mint masking tape with faint printed map lines, slightly translucent paper, torn ends' },
      { size: [900], at: A([330, 560], [-80, 620]), rot: -5, step: 2, paper: SMALL, motion: [{ kind: 'wipe', at: .05, dur: .5, dir: 'right' }] }),
    L('tape_b', 'tape_mint.png', null, { size: [760], at: A([760, 1440], [1180, 1330]), rot: 4, step: 2, paper: SMALL, motion: [{ kind: 'wipe', at: .2, dur: .5, dir: 'left' }] }),
    L('globe', 'globe.png', G.globe, { size: [560], at: [540, 980], step: 2, subject: true, paper: PAPER, motion: [{ kind: 'appear', at: 1.25, flutter: 0 }, { kind: 'sway', amp: 1.5, hz: .5 }] }),
    L('fruit', 'tangerine.png', G.tangerine, { size: [470], at: [540, 990], step: 2, subject: true, paper: PAPER,
      motion: [{ kind: 'place', at: .15, dur: .6, from: 'bottom', dist: 1100, rot: -10 }, { kind: 'peel', at: 1.3, dur: 1.2, pieces: 7 }] }),
    L('hand', 'hand_up.png', G.handUp, { size: [null, 760], at: [560, 1190], anchor: [.5, .08], step: 2, boil: false, edgeOk: true, paper: { shadow: SHADOW, grain: .2 },
      motion: [{ kind: 'follow', target: 'fruit', grip: [30, 200], until: .9, release: [10, 45] }, { kind: 'leave', at: 1.05, dur: .45, to: 'bottom', dist: 1200, rot: -6 }] }),
  ],
  narration: [{ at: .3, end: 3.4, text: 'ยินดีต้อนรับสู่เชียงใหม่' }],
  type: [
    { text: 'ยินดีต้อนรับสู่', preset: 'label', at: .45, x: A(.5, .19), y: A(.13, .3), maxWidth: A(.8, .34), maxLines: 1, prefer: 'up', out: { at: 3.3, dur: .2 },
      style: { font: 'display', weight: 700, size: 70, color: '#F7F3EA' } },
    { text: 'เชียงใหม่', preset: 'stamp', at: .8, stagger: .08, x: A(.5, .19), y: A(.22, .48), maxWidth: A(.86, .3), maxLines: 1, prefer: 'up', out: { at: 3.3, dur: .2 },
      style: { font: 'display', weight: 800, size: A(190, 150), color: '#3A3A3C' } },
  ],
};

// ---------- 2. the road: a ribbon road draws itself, the town pops up, a hand sets down a red songthaew (3.6–7.6 s) ----------
const TREES2 = { '9:16': [[150, 1060], [930, 1090], [250, 1560], [990, 1660]], '16:9': [[-240, 1040], [1300, 1060], [80, 1380], [1430, 1420]] };
SCENES.reel_road = {
  assets: DIR, duration: 4, background: '#F3F1EC', aspects: ['9:16', '16:9'], boil: { amp: 1.2, rot: .35 }, gen: GEN,
  transition: { kind: 'push', dur: .8, focus: [540, 980], zoom: 6 },
  camera: A([[0, 540, 1010, 1, 'ease'], [4, 540, 1060, 1.1, 'ease']], [[0, 540, 1030, 1, 'ease'], [4, 560, 1060, 1.07, 'ease']]),
  layers: [
    L('sky', 'tape_mint.png', null, { size: [2600], at: A([540, 820], [540, 760]), rot: -1, step: 2, paper: SMALL, motion: [{ kind: 'wipe', at: 0, dur: .6, dir: 'right' }] }),
    L('hill', 'hill.png', { engine: 'zimage', size: [1344, 768], matte: 'chroma', prompt: 'a broad gently rounded hill made of off-white textured paper with a soft grey shaded edge, simple shape, like a cut paper landscape' },
      { size: [2700], at: A([540, 930], [540, 900]), anchor: [.5, 0], paper: { shadow: { ...SHADOW, dy: -6, opacity: .18 }, grain: .3 }, edgeOk: true }),
    L('road', 'road_ribbon.png', { engine: 'zimage', size: [768, 1344], matte: 'chroma', prompt: 'a winding road ribbon of tangerine orange paper seen in perspective, wide at the bottom and narrowing as it curves up toward the horizon, clean cut paper edges' },
      { size: A([null, 1050], [null, 720]), at: A([580, 1930], [640, 1540]), anchor: [.5, 1], paper: { shadow: { ...SHADOW, opacity: .2 } }, edgeOk: true, motion: [{ kind: 'wipe', at: 0, dur: 1.1, path: [[.5, 1.05], [.42, .72], [.6, .38], [.5, -.05]], width: .95 }] }),
    ...[0, 1, 2, 3].map(i => L(`tree${i}`, 'tree_teal.png', i ? null : G.treeTeal, { size: [i > 1 ? 380 : 300], anchor: [.5, .95], step: 2, paper: SMALL,
      at: { '9:16': TREES2['9:16'][i], '16:9': TREES2['16:9'][i] }, motion: [{ kind: 'pop', at: .2 + i * .12, dur: .45 }, { kind: 'sway', amp: 1.5, hz: .45, phase: i * .3 }] })),
    L('temple', 'temple.png', { engine: 'zimage', size: [1024, 1024], matte: 'chroma', prompt: 'a northern Thai Lanna temple hall with layered sweeping roofs and gold trim, grey photo print with the roof in tangerine orange' },
      { size: [560], at: A([350, 1040], [140, 1000]), anchor: [.5, .95], step: 2, subject: true, paper: PAPER, motion: [{ kind: 'pop', at: .95, dur: .5 }] }),
    L('sign', 'road_sign.png', { engine: 'zimage', size: [832, 1216], matte: 'chroma', prompt: 'a blank highway direction sign board in deep teal on a single grey metal post, the board completely empty with no writing' },
      { size: [240], at: A([870, 1330], [1250, 1250]), anchor: [.5, .95], step: 2, paper: SMALL, motion: [{ kind: 'pop', at: 1.4, dur: .45 }, { kind: 'sway', amp: 1, hz: .5 }] }),
    L('truck', 'songthaew.png', { engine: 'zimage', size: [1344, 768], matte: 'chroma', prompt: 'a red Thai songthaew shared taxi pickup truck with a covered passenger bed, three quarter side view, toy-like proportions, grey photo print with the truck body in vivid red' },
      { size: [430], at: A([600, 1430], [720, 1260]), step: 2, subject: true, paper: PAPER,
        keys: A([[2.35, { x: 600, y: 1430, scale: 1 }], [3.9, { x: 470, y: 1180, scale: .72 }, 'easeIn']], [[2.35, { x: 720, y: 1260, scale: 1 }], [3.9, { x: 560, y: 1080, scale: .74 }, 'easeIn']]),
        motion: [{ kind: 'place', at: 1.6, dur: .6, from: 'top', dist: 1000, rot: 8 }] }),
    L('hand2', 'hand_down.png', G.handDown, { size: [null, 760], at: [600, 1300], anchor: [.5, .93], step: 2, boil: false, edgeOk: true, paper: { shadow: SHADOW, grain: .2 },
      motion: [{ kind: 'follow', target: 'truck', grip: [10, -70], until: 2.25, release: [0, -45] }, { kind: 'leave', at: 2.4, dur: .45, to: 'top', dist: 1200, rot: 5 }] }),
    L('plane', 'airplane.png', { engine: 'zimage', size: [1344, 768], matte: 'chroma', prompt: 'a small passenger airplane in side view flying to the right, grey photo print with a tangerine orange tail fin' },
      { size: [240], at: [0, 0], step: 2, paper: SMALL,
        keys: A([[.3, { x: -200, y: 700, rot: -8 }], [3.9, { x: 1300, y: 520, rot: -10 }, 'linear']], [[.3, { x: -560, y: 640, rot: -8 }], [3.9, { x: 1640, y: 520, rot: -10 }, 'linear']]),
        motion: [{ kind: 'float', amp: 8, hz: .7 }] }),
  ],
  narration: [{ at: 1.8, end: 3.8, text: 'ทุกเส้นทาง' }],
  type: [{ text: 'ทุกเส้นทาง', preset: 'label', at: 1.9, x: A(.5, .78), y: A(.1, .14), maxWidth: A(.8, .36), maxLines: 1, prefer: 'up', out: { at: 3.75, dur: .2 },
    style: { font: 'display', weight: 700, size: 72, color: '#F7F3EA' } }],
};

// ---------- 3. the town: the camera pans along the old city, people walk, the trees blossom, the tangerine rolls through (7.6–11.6 s) ----------
const TREES3 = [[520, 1], [1130, 1], [1760, 1]];
SCENES.reel_city = {
  assets: DIR, duration: 4, background: '#F3F1EC', aspects: ['9:16', '16:9'], boil: { amp: 1.2, rot: .35 }, gen: GEN,
  transition: { kind: 'slide', dur: .6, from: 'right' },
  camera: A([[0, 420, 1100, 1.22, 'smooth'], [2, 900, 1090, 1.25, 'smooth'], [4, 1420, 1100, 1.22, 'smooth']], [[0, 620, 1020, 1, 'smooth'], [2, 960, 1010, 1.03, 'smooth'], [4, 1320, 1020, 1, 'smooth']]),
  layers: [
    L('ground', 'ground_mint.png', { engine: 'zimage', size: [1344, 768], matte: 'chroma', prompt: 'a long flat strip of pale aqua mint paper lying horizontally, the top edge torn with white fibres, plain' },
      { size: [4200], at: A([900, 1330], [900, 1300]), anchor: [.5, .2], paper: { shadow: { ...SHADOW, dy: -5, opacity: .15 }, grain: .3 }, edgeOk: true }),
    L('gate', 'city_gate.png', { engine: 'zimage', size: [1344, 768], matte: 'chroma', prompt: 'an old red-brick city gate with crenellated walls and a wooden door, northern Thailand, grey photo print with the bricks in muted tangerine orange' },
      { size: [620], at: [160, 1345], anchor: [.5, .96], step: 2, subject: true, paper: PAPER, motion: [{ kind: 'pop', at: .1, dur: .5 }] }),
    L('chedi', 'chedi.png', { engine: 'zimage', size: [768, 1344], matte: 'chroma', prompt: 'a tall golden Lanna chedi stupa with a pointed spire on a square base, grey photo print with the gold in warm tangerine orange' },
      { size: [null, 680], at: [820, 1345], anchor: [.5, .97], step: 2, subject: true, paper: PAPER, motion: [{ kind: 'pop', at: 1.0, dur: .55 }] }),
    L('house', 'lanna_house.png', { engine: 'zimage', size: [1344, 768], matte: 'chroma', prompt: 'a traditional northern Thai teak wooden house on stilts with crossed roof gable ornaments, grey photo print with the roof in tangerine orange' },
      { size: [600], at: [1460, 1345], anchor: [.5, .96], step: 2, subject: true, paper: PAPER, motion: [{ kind: 'pop', at: 2.0, dur: .5 }] }),
    ...TREES3.flatMap(([x], i) => [
      L(`teal${i}`, 'tree_teal.png', null, { size: [300], at: [x, 1350], anchor: [.5, .95], step: 2, paper: SMALL,
        motion: [{ kind: 'pop', at: .3 + i * .8, dur: .45 }, { kind: 'vanish', at: 2.3 + i * .15, flutter: 2 }, { kind: 'sway', amp: 1.5, hz: .45, phase: i * .4 }] }),
      L(`pink${i}`, 'tree_pink.png', i ? null : G.treePink, { size: [300], at: [x, 1350], anchor: [.5, .95], step: 2, paper: SMALL,
        motion: [{ kind: 'appear', at: 2.3 + i * .15, flutter: 2 }, { kind: 'sway', amp: 1.5, hz: .45, phase: i * .4 }] }),
    ]),
    ...[['walker_a', 'person_a.png', 'a young woman walking to the right in an orange top and jeans, full body side view, grey photo print with her top in tangerine orange', 0, 70, 1440],
        ['walker_b', 'person_b.png', 'an old man walking to the left carrying a cloth bag, full body side view, grey black-and-white photo print', 1200, -60, 1450],
        ['walker_c', 'person_c.png', 'a student walking to the right with a backpack, full body side view, grey photo print with the backpack in tangerine orange', 900, 55, 1470]]
      .map(([id, file, prompt, x, speed, y]) => L(id, file, { engine: 'zimage', size: [768, 1344], matte: 'chroma', prompt },
        { size: [null, 230], at: [x, y], anchor: [.5, 1], step: 2, paper: SMALL, motion: [{ kind: 'walk', speed, bob: 6, steps: 1.8 }] })),
    L('fruit3', 'tangerine.png', G.tangerine, { size: [120], at: [-120, 1480], step: 2, paper: SMALL,
      motion: [{ kind: 'roll', at: .4, dur: 3.3, ease: 'easeOut', path: [[-120, 1490], [700, 1490], [1200, 1500], [1560, 1490]], hops: 4, hop: 110, trail: { color: '#E8541E', len: 520, dy: 52 } }] }),
  ],
  narration: [{ at: 1, end: 3.8, text: 'ทุกฤดู มีเรื่องเล่า' }],
  type: [{ text: 'ทุกฤดู มีเรื่องเล่า', preset: 'label', at: 1.1, stagger: .25, x: A(.5, .5), y: A(.11, .13), maxWidth: A(.84, .6), maxLines: 1, prefer: 'up', out: { at: 3.75, dur: .2 },
    style: { font: 'display', weight: 700, size: A(66, 74), color: '#F7F3EA' } }],
};

// ---------- 4. the end: the tangerine rolls home to a tree that grows; the name lands (11.6–15 s) ----------
SCENES.reel_end = {
  assets: DIR, duration: 3.4, background: '#F3F1EC', aspects: ['9:16', '16:9'], boil: { amp: 1.2, rot: .35 }, gen: GEN,
  transition: { kind: 'push', dur: .6, focus: [1560, 1480], zoom: 5 },
  camera: A([[0, 540, 1000, 1.06, 'ease'], [3.4, 540, 980, 1.12, 'ease']], [[0, 700, 1020, 1, 'ease'], [3.4, 700, 1000, 1.05, 'ease']]),
  layers: [
    L('ground4', 'ground_mint.png', null, { size: [3200], at: A([540, 1330], [700, 1290]), anchor: [.5, .2], paper: { shadow: { ...SHADOW, dy: -5, opacity: .15 }, grain: .3 }, edgeOk: true }),
    L('bigtree', 'tangerine_tree.png', { engine: 'zimage', size: [1024, 1024], matte: 'chroma', prompt: 'a single tangerine tree with a broad round crown of deep teal blue-green leaves full of small ripe tangerine orange fruits, a pale slim trunk, grey photo print' },
      { size: A([700], [640]), at: A([540, 1345], [360, 1305]), anchor: [.5, .97], step: 2, subject: true, paper: PAPER, motion: [{ kind: 'pop', at: .25, dur: .8, overshoot: 2.4 }, { kind: 'sway', amp: 1.2, hz: .4 }] }),
    L('fruit4', 'tangerine.png', G.tangerine, { size: [120], at: [0, 0], step: 2, paper: SMALL,
      motion: [{ kind: 'roll', at: 0, dur: 1.6, ease: 'easeOut', path: A([[-200, 1440], [700, 1440]], [[-400, 1400], [620, 1400]]), hops: 2, hop: 90, trail: { color: '#E8541E', len: 420, dy: 52 } }] }),
  ],
  narration: [{ at: 1.2, end: 3.3, text: 'เชียงใหม่ ยินดีต้อนรับกลับบ้าน' }],
  type: [
    { text: 'เชียงใหม่', preset: 'stamp', at: 1.0, stagger: .08, x: A(.5, .72), y: A(.2, .38), maxWidth: A(.86, .44), maxLines: 1, prefer: 'up',
      style: { font: 'display', weight: 800, size: 210, color: '#3A3A3C' } },
    { text: 'ยินดีต้อนรับกลับบ้าน', preset: 'label', at: 1.8, x: A(.5, .72), y: A(.29, .55), maxWidth: A(.8, .44), maxLines: 1, prefer: 'up',
      style: { font: 'display', weight: 700, size: 64, color: '#F7F3EA' } },
  ],
};

playCollage([SCENES.reel_hook, SCENES.reel_road, SCENES.reel_city, SCENES.reel_end]);
