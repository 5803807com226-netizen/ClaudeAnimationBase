// doodle_footage/scene.js: four live-action plates, each with cartoon stickers and doodle FX on top. Data only.
// Layers in `space: 'footage'` are placed in FRACTIONS OF THE PLATE (u, v) and sized as a fraction of its width, so a
// sticker sits on the same spot of the footage in every format, and follows the plate's measured camera motion (track:
// 'global', the default) or a tracked point (track: '<name>' from tools/footage.py track --point). A 9:16 frame shows
// the plate's middle (u 0.34–0.66 of a 16:9 plate); A(tall, wide) moves a few things inside it for 9:16.
const A = (tall, wide) => ({ '9:16': tall, '16:9': wide });
const ROOT = 'assets/stories/doodle_footage/';
const SH = { shadow: { dx: 4, dy: 7, blur: 8, opacity: .2, color: '#1E2A3A' } };   // the art carries its own white sticker outline
const STYLE = 'soft hand-painted 2D cartoon illustration in a cosy children\'s picture-book style, gouache and coloured-pencil texture, gentle flat shading, warm pastel colours, a clean thick white sticker outline all round, no text, no letters, no logo';
const GEN = { seed: 8800, style: STYLE, isolate: 'isolated on a plain flat solid chroma green background (#00B140), no cast shadow on the background, centered with empty margin around the object',
  negative: 'text, letters, words, numbers, logo, brand, watermark, signature, photo, realistic, 3D render, dark outline only, blurry' };
const G = {
  sun: { engine: 'zimage', size: [1024, 1024], matte: 'chroma', prompt: 'a cute round orange cartoon sun sticker with a happy smiling face and rosy cheeks, no rays' },
  cloud: { engine: 'zimage', size: [1344, 832], matte: 'chroma', prompt: 'a fluffy white cartoon cloud sticker with a sleepy smiling face' },
  flower: { engine: 'zimage', size: [1024, 1024], matte: 'chroma', prompt: 'a blue cartoon daisy flower sticker with a yellow smiling face in its centre and two green leaves' },
  blob: { engine: 'zimage', size: [1024, 1024], matte: 'chroma', prompt: 'a round soft purple cartoon jelly blob creature sticker with a happy face' },
  cat: { engine: 'zimage', size: [832, 1216], matte: 'chroma', prompt: 'a cute cartoon calico cat sitting upright, white with orange and black patches, one paw raised waving, front view' },
  boy: { engine: 'zimage', size: [832, 1216], matte: 'chroma', prompt: 'a cartoon teenage boy with messy black hair in a light blue t-shirt and cream shorts, standing in three-quarter view, eyes closed happily, his right arm missing from the shoulder' },
  arm: { engine: 'zimage', size: [832, 1216], matte: 'chroma', prompt: 'a cartoon arm in a light blue short sleeve, bent at the elbow, the hand holding a plastic cup of orange Thai iced tea with a straw, the sleeve at the top of the image' },
  couple: { engine: 'zimage', size: [1344, 832], matte: 'chroma', prompt: 'a cartoon boy and girl sitting side by side seen from behind, she with long flowing pink hair and a blue bucket hat on the left, he with black hair in a light blue t-shirt on the right' },
  tea: { engine: 'zimage', size: [832, 1216], matte: 'chroma', prompt: 'a big cartoon plastic cup of orange Thai iced tea sticker with ice, a brown straw and a cute smiling face on the cup, a plain blank paper band around it' },
};
const S = (id, file, gen, o) => ({ id, file, gen, space: 'footage', step: 2, paper: SH, ...o });   // a sticker on the plate
const D = (id, kind, o, d = {}) => ({ id, doodle: { kind, ...d }, space: 'footage', step: 2, ...o });   // a doodle FX layer
const BASE = { assets: ROOT, background: '#20242C', aspects: ['9:16', '16:9'], boil: { amp: 1, rot: .3 } };
const CAMK = d => [[0, 540, 960, 1, 'smooth'], [d, 540, 955, 1.035, 'smooth']];

// 1. skyline: the city wakes up: a sun pops out, a blob and a flower grow on the buildings, a boy sips iced tea on the skytrain line
SCENES.df_skyline = { ...BASE, duration: 2.25, camera: CAMK(2.25), gen: GEN,
  footage: { dir: ROOT + 'footage/skyline/', name: 'skyline' },
  layers: [
    S('sun', 'sun_face.png', G.sun, { size: [.09], at: A([.6, .13], [.57, .16]), motion: [{ kind: 'pop', at: .1 }, { kind: 'sway', amp: 4, hz: .6 }] }),
    D('sun_rays', 'rays', { size: [.14], at: A([.6, .13], [.57, .16]), motion: [{ kind: 'appear', at: .35, flutter: 1 }] }, { color: '#FFF4D6', width: 5 }),
    S('blob', 'blob_face.png', G.blob, { size: [.06], at: A([.4, .27], [.15, .3]), anchor: [.5, .9], motion: [{ kind: 'pop', at: .4 }, { kind: 'pulse', amp: .05, hz: 1.4 }] }),
    S('flower', 'flower_face.png', G.flower, { size: [.07], at: A([.4, .86], [.12, .86]), anchor: [.5, .9], motion: [{ kind: 'pop', at: .55 }, { kind: 'sway', amp: 5, hz: .7 }] }),
    S('boy', 'boy_sip.png', G.boy, { size: [null, .42], at: A([.58, .78], [.78, .7]), anchor: [.5, 1], subject: true, motion: [{ kind: 'pop', at: .25, dur: .4 }, { kind: 'float', amp: 3, hz: .7 }] }),
    S('boy_arm', 'boy_arm_cup.png', G.arm, { size: [null, .15], at: [0, 0], anchor: [.5, .08], motion: [{ kind: 'follow', target: 'boy', grip: [-.12, -.62], relative: true, release: [0, 0] }, { kind: 'pop', at: .35, dur: .3 }, { kind: 'sway', amp: 12, hz: .55 }] }),
    D('wind', 'wind', { size: [.2, .1], at: A([.45, .55], [.4, .55]) }, { count: 3, width: 5 }),
    D('birds', 'birds', { size: [.25], at: A([.5, .3], [.4, .25]) }, { count: 3, width: 4 }),
  ],
};

// 2. bus stop: a cat rides on the bus (a tracked point on it), flowers and a blob pop around the stop, sparkles
SCENES.df_bus = { ...BASE, duration: 2.0, camera: CAMK(2), gen: GEN,
  footage: { dir: ROOT + 'footage/bus/', name: 'bus' },
  layers: [
    S('cat', 'cat_wave.png', G.cat, { size: [null, .22], at: [.42, .3], anchor: [.5, 1], track: 'front', subject: true, motion: [{ kind: 'drop', at: .1, height: 400 }, { kind: 'sway', amp: 3, hz: 1.2 }] }),
    D('cat_hearts', 'hearts', { size: [.1], at: [.46, .19], track: 'front', motion: [{ kind: 'appear', at: .7, flutter: 1 }] }, { width: 4 }),
    S('flower_a', 'flower_face.png', G.flower, { size: [.06], at: A([.6, .62], [.7, .62]), anchor: [.5, .9], motion: [{ kind: 'pop', at: .3 }, { kind: 'sway', amp: 5, hz: .7 }] }),
    S('flower_b', 'flower_face.png', G.flower, { size: [.05], at: A([.64, .66], [.82, .66]), anchor: [.5, .9], motion: [{ kind: 'pop', at: .45 }, { kind: 'sway', amp: 5, hz: .8, phase: .3 }] }),
    S('blob_tree', 'blob_face.png', G.blob, { size: [.07], at: A([.55, .1], [.6, .12]), anchor: [.5, .9], motion: [{ kind: 'pop', at: .2 }, { kind: 'float', amp: 6, hz: .8 }] }),
    D('sparkle', 'sparkle', { size: [.16], at: A([.52, .2], [.6, .2]) }, { count: 4, color: '#FFFFFF' }),
  ],
};

// 3. the boat: a couple sits on the bow from behind, hair in the wind; a cat on the bow post; sun, a cloud with a face, birds
SCENES.df_boat = { ...BASE, duration: 3.2, camera: CAMK(3.2), gen: GEN,
  footage: { dir: ROOT + 'footage/boat/', name: 'boat' },
  layers: [
    S('sun_b', 'sun_face.png', G.sun, { size: [.08], at: A([.4, .14], [.16, .17]), motion: [{ kind: 'pop', at: .1 }, { kind: 'sway', amp: 4, hz: .5 }] }),
    D('rays_b', 'rays', { size: [.13], at: A([.4, .14], [.16, .17]) }, { color: '#FFF4D6', width: 5 }),
    S('cloud', 'cloud_face.png', G.cloud, { size: [.1], at: A([.6, .22], [.72, .2]), motion: [{ kind: 'pop', at: .3 }, { kind: 'float', amp: 8, hz: .4, x: 10 }] }),
    D('birds_b', 'birds', { size: [.22], at: A([.52, .28], [.55, .3]) }, { count: 4, width: 4 }),
    S('cat_post', 'cat_wave.png', G.cat, { size: [null, .12], at: [.468, .34], anchor: [.5, 1], motion: [{ kind: 'pop', at: .5 }, { kind: 'sway', amp: 3, hz: 1.1 }] }),
    S('couple', 'couple_back.png', G.couple, { size: [.24], at: [.47, 1.0], anchor: [.5, 1], subject: true, motion: [{ kind: 'place', at: 0, from: 'bottom', dist: 500, rot: 3 }, { kind: 'float', amp: 3, hz: .9 }] }),
    D('wind_b', 'wind', { size: [.22, .1], at: A([.4, .62], [.3, .62]) }, { count: 3, width: 5, speed: .9 }),
    D('splash', 'splash', { size: [.14], at: A([.62, .9], [.8, .88]) }, { width: 4 }),
  ],
};

// 4. sunset: the couple watches the city; a giant smiling Thai iced tea slams into the sky, sparkles; the title
SCENES.df_sunset = { ...BASE, duration: 3.95, camera: CAMK(3.95), gen: GEN,
  footage: { dir: ROOT + 'footage/sunset/', name: 'sunset' },
  layers: [
    S('cloud_s', 'cloud_face.png', G.cloud, { size: [.09], at: A([.42, .14], [.2, .16]), motion: [{ kind: 'pop', at: .2 }, { kind: 'float', amp: 6, hz: .35, x: 12 }] }),
    S('tea', 'tea_cup.png', G.tea, { size: [null, .42], at: A([.58, .45], [.74, .45]), subject: true, motion: [{ kind: 'slam', at: .9 }, { kind: 'pulse', at: 1.3, amp: .03, hz: 1 }] }),
    D('tea_sparkle', 'sparkle', { size: [.2], at: A([.58, .42], [.74, .42]), motion: [{ kind: 'appear', at: 1.1, flutter: 1 }] }, { count: 5 }),
    D('tea_lines', 'lines', { size: [.24], at: A([.58, .45], [.74, .45]), motion: [{ kind: 'appear', at: 1.05, flutter: 0 }, { kind: 'vanish', at: 1.7, flutter: 1 }] }, { width: 5 }),
    S('couple_s', 'couple_back.png', G.couple, { size: [.2], at: A([.47, 1.0], [.4, 1.0]), anchor: [.5, 1], subject: true, motion: [{ kind: 'place', at: .1, from: 'bottom', dist: 400, rot: 2 }] }),
    D('hearts_s', 'hearts', { size: [.12], at: A([.47, .72], [.4, .72]), motion: [{ kind: 'appear', at: 1.6, flutter: 0 }] }, { width: 4 }),
  ],
  type: [{ text: 'ชิลล์ เดย์ ชาไทย', preset: 'cutout', at: 1.8, x: A(.5, .3), y: A(.14, .2), maxWidth: A(.84, .44), maxLines: 1, prefer: 'up',
    papers: ['#FFFFFF', '#F28C38', '#9FD8CB'], inks: ['#2E2E30', '#FFFFFF', '#2E2E30'], style: { font: 'display', weight: 800, size: A(84, 70), color: '#2E2E30' } }],
};

playCollage([SCENES.df_skyline, SCENES.df_bus, SCENES.df_boat, SCENES.df_sunset]);
