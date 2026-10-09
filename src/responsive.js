// responsive.js: the shared aspect-ratio layer. EVERY preset, system and story uses it instead of assuming 1920 × 1080.
// Loaded after the page's config (src/config.js or a story's config.js) and before core.js, so it can set the canvas.
//
//   Formats: '9:16' 1080 × 1920 (Shorts, Reels, TikTok) · '16:9' 1920 × 1080 · '4:5' 1080 × 1350 (feed).
//   Choosing one: ?aspect=4:5 on the page, --aspect=4:5 on render.mjs, or PROJECT.aspect in a config. Without any,
//   a project keeps the size its config gives (existing projects keep their original format).
//
//   ASPECT()            the current format name ('9:16' | '16:9' | '4:5', or 'custom')
//   byAspect(map, dflt) pick a value per format: { '9:16': a, '16:9': b, '4:5': c } or { tall, wide } (4:5 and 9:16 are tall)
//   av(v)               a value that may be such a map, resolved (plain values pass through)
//   nx(f), ny(f)        normalized → px (fractions of the frame's width / height)
//   US()                unit scale: 1 at a 1080 px short side; multiply px sizes by it
//   safeArea(kind)      { x0, y0, x1, y1, w, h, cx, cy } in px: 'action' (keep characters in), 'title' (keep text in),
//                       'subtitle' (the band kept free for subtitles); platform UI margins differ per format
//   fitZoom(w, h, mode) the zoom that fits a w × h (world px) rectangle into the frame: 'contain' | 'cover' | 'width' | 'height'
const ASPECTS = { '9:16': { width: 1080, height: 1920 }, '16:9': { width: 1920, height: 1080 }, '4:5': { width: 1080, height: 1350 } };
const PARALLAX_REF = [960, 540];   // the world point parallax layers are anchored to (fixed, so layers line up in every format)
(() => {
  const q = new URLSearchParams(location.search).get('aspect') || PROJECT.aspect;
  if (q && ASPECTS[q]) Object.assign(PROJECT, ASPECTS[q], { aspect: q });
  else if (q) console.warn(`aspect "${q}" is not one of ${Object.keys(ASPECTS).join(', ')}; keeping ${PROJECT.width || 1920} × ${PROJECT.height || 1080}`);
})();

function ASPECT() {
  const w = PROJECT.width || 1920, h = PROJECT.height || 1080;
  for (const [k, v] of Object.entries(ASPECTS)) if (v.width === w && v.height === h) return k;
  return 'custom';
}
const isAspectMap = v => v && typeof v === 'object' && !Array.isArray(v) && ['9:16', '16:9', '4:5', 'tall', 'wide'].some(k => k in v);
function byAspect(map, dflt) {
  const a = ASPECT(); if (a in map) return map[a];
  const tall = (PROJECT.height || 1080) > (PROJECT.width || 1920);
  return (tall ? map.tall : map.wide) ?? map.default ?? dflt;
}
const av = v => isAspectMap(v) ? byAspect(v) : v;
const nx = f => f * W, ny = f => f * H;
const US = () => Math.min(W, H) / 1080;

// Safe areas as fractions [x0, y0, x1, y1]. 9:16 keeps clear of the platform UI (top bar, right-side buttons, caption).
const SAFE = {
  '9:16': { action: [.05, .07, .95, .86], title: [.07, .1, .86, .78], subtitle: [.08, .8, .92, .9] },
  '16:9': { action: [.04, .05, .96, .95], title: [.06, .08, .94, .84], subtitle: [.1, .85, .9, .94] },
  '4:5': { action: [.04, .05, .96, .93], title: [.06, .07, .94, .83], subtitle: [.08, .84, .92, .93] },
};
function safeArea(kind = 'action') {
  const f = (SAFE[ASPECT()] || SAFE[W > H ? '16:9' : '9:16'])[kind], bar = typeof lookBars === 'function' ? lookBars() : 0;   // keep clear of letterbox bars
  const [x0, y0, x1, y1] = [f[0] * W, Math.max(f[1] * H, bar + .03 * H * !!bar), f[2] * W, Math.min(f[3] * H, H - bar - .03 * H * !!bar)];
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}
function fitZoom(w, h, mode = 'contain') {
  const zx = W / w, zy = H / h;
  return mode === 'cover' ? Math.max(zx, zy) : mode === 'width' ? zx : mode === 'height' ? zy : Math.min(zx, zy);
}
