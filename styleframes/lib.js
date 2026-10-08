// styleframes/lib.js: shared helpers for the style-frame studies. Canvas 2D, 1080 × 1920, deterministic (seeded).
const W = 1080, H = 1920, TAU = Math.PI * 2;
const lerp = (a, b, k) => a + (b - a) * k, clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
function rng(seed) { return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function makeNoise(seed) {           // 2D Perlin noise, about -1..1
  const r = rng(seed), perm = [...Array(256).keys()], p = new Uint8Array(512);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10), grad = (h, x, y) => { const g = h & 7, u = g < 4 ? x : y, v = g < 4 ? y : x; return ((g & 1) ? -u : u) + ((g & 2) ? -v : v); };
  return (x, y) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255; x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y), a = p[X] + Y, b = p[X + 1] + Y;
    return lerp(lerp(grad(p[a], x, y), grad(p[b], x - 1, y), u), lerp(grad(p[a + 1], x, y - 1), grad(p[b + 1], x - 1, y - 1), u), v);
  };
}
const fbm = (n, x, y, oct = 4) => { let s = 0, a = .5, f = 1; for (let i = 0; i < oct; i++) { s += a * n(x * f, y * f); a *= .5; f *= 2.03; } return s; };
function layer() { const c = document.createElement('canvas'); c.width = W; c.height = H; return [c, c.getContext('2d')]; }
function blurInto(ctx, src, px, op = 'source-over', alpha = 1) {
  ctx.save(); ctx.globalCompositeOperation = op; ctx.globalAlpha = alpha; ctx.filter = px > 0 ? `blur(${px}px)` : 'none'; ctx.drawImage(src, 0, 0); ctx.restore();
}
function radial(ctx, x, y, r, stops, op = 'source-over') {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r); stops.forEach(([s, c]) => g.addColorStop(s, c));
  ctx.save(); ctx.globalCompositeOperation = op; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
}
function grain(ctx, amt, seed = 7) {
  const id = ctx.getImageData(0, 0, W, H), d = id.data, r = rng(seed);
  for (let i = 0; i < d.length; i += 4) { const n = (r() - .5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  ctx.putImageData(id, 0, 0);
}
function vignette(ctx, a, rgb = '0,0,0', cx = W / 2, cy = H * .46) {
  const g = ctx.createRadialGradient(cx, cy, H * .22, cx, cy, H * .78); g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(1, `rgba(${rgb},${a})`);
  ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
}
// A message bubble: rounded body centred on (x, y) with a tail at the bottom left.
function bubblePath(ctx, x, y, w, h, r, tail = .24, ts = .32) {
  const x0 = x - w / 2, y0 = y - h / 2, x1 = x + w / 2, y1 = y + h / 2, tx = x0 + w * tail, s = h * ts;
  ctx.beginPath(); ctx.moveTo(x0 + r, y0); ctx.lineTo(x1 - r, y0); ctx.quadraticCurveTo(x1, y0, x1, y0 + r); ctx.lineTo(x1, y1 - r); ctx.quadraticCurveTo(x1, y1, x1 - r, y1);
  ctx.lineTo(tx + s * .7, y1); ctx.quadraticCurveTo(tx + s * .1, y1 + s * .55, tx - s * .45, y1 + s * .95); ctx.quadraticCurveTo(tx + s * .05, y1 + s * .45, tx - s * .05, y1);
  ctx.lineTo(x0 + r, y1); ctx.quadraticCurveTo(x0, y1, x0, y1 - r); ctx.lineTo(x0, y0 + r); ctx.quadraticCurveTo(x0, y0, x0 + r, y0); ctx.closePath();
}
const pill = (ctx, x, y, w, h) => { ctx.beginPath(); ctx.roundRect(x, y - h / 2, w, h, h / 2); };

// ---------- the character: an imported PNG with transparency, never drawn in code ----------
// assets/characters/bun_girl/full.png (white background removed by prep_character.py). Until it exists, a dashed slot
// marks its place. slot: { x, y (bottom centre), h (height on canvas), crop: [top, bottom] as fractions of the image }.
const CHAR_SRC = '../assets/characters/bun_girl/full.png';
const loadImg = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
async function characterLayer(slot, o = {}) {
  const [c, x] = layer(), im = await loadImg(CHAR_SRC);
  if (!im) {
    const w = slot.h * (slot.aspect || .5);
    x.setLineDash([16, 12]); x.lineWidth = 3; x.strokeStyle = o.slotColor || 'rgba(255,255,255,.5)';
    x.beginPath(); x.roundRect(slot.x - w / 2, slot.y - slot.h, w, slot.h, 24); x.stroke();
    return { c, x, ok: false };
  }
  const [t, b] = slot.crop || [0, 1], sh = im.height * (b - t), w = im.width * slot.h / sh;
  x.drawImage(im, 0, im.height * t, im.width, sh, slot.x - w / 2, slot.y - slot.h, w, slot.h);
  return { c, x, ok: true };
}
// Re-light a character layer: tint it (multiply), then re-mask to its own alpha.
function grade(L, rgb, op = 'multiply') {
  const [m, mx] = layer(); mx.drawImage(L.c, 0, 0);
  L.x.save(); L.x.globalCompositeOperation = op; L.x.fillStyle = rgb; L.x.fillRect(0, 0, W, H);
  L.x.globalCompositeOperation = 'destination-in'; L.x.drawImage(m, 0, 0); L.x.restore();
}
// Paint light onto a character layer only (source-atop): a radial light at (x, y).
function lightOn(L, x, y, r, rgba) {
  const g = L.x.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba); g.addColorStop(1, 'rgba(0,0,0,0)');
  L.x.save(); L.x.globalCompositeOperation = 'source-atop'; L.x.fillStyle = g; L.x.fillRect(0, 0, W, H); L.x.restore();
}
