// @requires src/icons/core.js
// actor.js: WATERCOLOR ICON ACTORS. Any of the 4,134 game-icons.net silhouettes (CC BY 3.0, credit "game-icons.net";
// tools/lib/icons.mjs finds them by English or Thai words, the plan compiler ships only the ones a story uses) painted
// as a watercolor cut-out: a wash with soft bleeding edges, lighter blooms, pigment pooling at the rim, paper
// granulation and a thin ink outline over the icon's own detail lines. Three hand-painted variants boil at 8 fps.
//
// iconActor: the icon as a character that ACTS, from a list of moves played in order (each starts where the last
// left it; times are shot-local seconds). It stands on its feet at (x, y): y is the ground line.
//   moves: [{ do, at, dur, to: [x, y], ... }]
//     enter  { style: 'pop' | 'drop' | 'slide' | 'grow', from: 'left' | 'right' }     appear (hidden before the first enter)
//     walk / run   { to }       travel with a step bob and rock (run: faster, leaning, bigger bounce); turns to face its way
//     hop    { to, count, height }   travel in hops: anticipation squash, stretch in the air, squash on landing
//     jump   { to, height }     one big jump (in place without `to`)
//     fly    { to, arc }        a smooth arc, banking with its speed, gently bobbing; no ground shadow
//     swim   { to, waves, amp } travel on a wave, pitching with it
//     shake  { amp }   spin { turns }   turn {} (flips to face the other way)   wait {}
//     exit   { style: 'pop' | 'slide' | 'fade' }    leave (slide: runs off the side it faces)
//   Between moves it breathes. faces: the way the icon's drawing looks ('left' | 'right'; core icons are known).
// Object presets (popBounce, objectReveal) take `icon` too: the icon replaces their shape.
// the way an icon's drawing looks, where it is not right (nearly every game-icons.net figure faces right)
const ICON_FACES = {};
const ICON_TEX = {}, ICON_BOX = {}, ICON_WARNED = new Set();
let ICON_T = 0;   // the current preset time (set by preset()), for the boil
const iconPath = name => { const d = window.ICON_PATHS?.[name]?.d; return d ? new Path2D(d) : null; };
function shadeHex(hex, f) {   // f < 0 darker, f > 0 lighter
  const n = parseInt(String(hex).replace('#', '').padEnd(6, '0').slice(0, 6), 16), ch = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f));
  return '#' + ch.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}
// the icon's drawn bounds inside its 512 box, as fractions (measured once)
function iconBox(name) {
  if (ICON_BOX[name]) return ICON_BOX[name];
  const P = iconPath(name), c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d', { willReadFrequently: true });   // a CPU canvas: reading a GPU one back is very slow in software rendering
  x.scale(128 / 512, 128 / 512); x.fill(P);
  const d = x.getImageData(0, 0, 128, 128).data; let x0 = 128, x1 = 0, y0 = 128, y1 = 0;
  for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) if (d[(j * 128 + i) * 4 + 3] > 20) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; }
  return (ICON_BOX[name] = x1 < x0 ? { x0: 0, y0: 0, x1: 1, y1: 1 } : { x0: x0 / 128, y0: y0 / 128, x1: (x1 + 1) / 128, y1: (y1 + 1) / 128 });
}
let ICON_GRAIN = null;
function iconGrain() {   // a tile of paper granulation: dark specks and fibres
  if (ICON_GRAIN) return ICON_GRAIN;
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), r = mulberry(7);
  for (let i = 0; i < 2600; i++) { x.fillStyle = `rgba(40,25,10,${.05 + r() * .12})`; const s = .6 + r() * 1.8; x.fillRect(r() * 256, r() * 256, s, s); }
  return (ICON_GRAIN = c);
}
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// one painted variant of an icon at R px (the 512 box), as a p5.Graphics
function iconTexture(name, color, ink, R, v) {
  const key = [name, color, ink, R, v].join('|'); if (ICON_TEX[key]) return ICON_TEX[key];
  // painted on a CPU canvas, then handed to p5 as a p5.Image (uploaded to the GPU once; a p5.Graphics would be
  // re-uploaded every frame, and reading a GPU canvas back is very slow under software rendering)
  const cv = document.createElement('canvas'); cv.width = cv.height = R;
  const P = iconPath(name), c = cv.getContext('2d', { willReadFrequently: true }), r = mulberry(v * 7919 + name.length * 31), k = R / 512, B = iconBox(name);
  const jit = () => (r() - .5) * 2;
  c.save(); c.scale(k, k);
  c.translate(256, 256); c.rotate(jit() * .006); c.translate(-256 + jit() * 1.2, -256 + jit() * 1.2);   // hand-made: each variant sits a hair differently
  c.globalAlpha = .82; c.fillStyle = color; c.fill(P);                                                       // the wash
  c.globalAlpha = .1; for (let i = 0; i < 6; i++) { c.save(); c.translate(jit() * 2.5, jit() * 2.5); c.fill(P); c.restore(); }   // soft bleeding rim
  c.strokeStyle = color; c.lineJoin = 'round'; for (const [w, a] of [[16, .05], [9, .08]]) { c.globalAlpha = a; c.lineWidth = w; c.stroke(P); }   // a faint halo where the water ran past the edge
  c.globalCompositeOperation = 'source-atop';                                                              // everything below stays inside the paint
  const bx = B.x0 * 512, by = B.y0 * 512, bw = (B.x1 - B.x0) * 512, bh = (B.y1 - B.y0) * 512;
  for (let i = 0; i < 7; i++) {   // blooms: lighter where the water pooled, a few darker pigment clouds
    const x = bx + r() * bw, y = by + r() * bh, rad = (40 + r() * 110), light = i < 5, gr = c.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, light ? shadeHex(color, .45) : shadeHex(color, -.25)); gr.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = light ? .45 : .3; c.fillStyle = gr; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  c.strokeStyle = shadeHex(color, -.38); c.lineJoin = 'round';   // pigment pools at the edges: soft layered strokes (a canvas blur is far too slow in software rendering)
  for (const [w, a] of [[22, .1], [14, .14], [8, .2], [4, .26]]) { c.globalAlpha = a; c.lineWidth = w; c.stroke(P); }
  c.globalAlpha = .55; c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = c.createPattern(iconGrain(), 'repeat'); c.fillRect(0, 0, R, R);   // granulation
  c.restore();
  if (ink) { c.save(); c.scale(k, k); c.translate(256, 256); c.rotate(jit() * .006); c.translate(-256 + jit(), -256 + jit());
    c.globalAlpha = .72; c.strokeStyle = ink; c.lineJoin = 'round'; c.lineWidth = 2.8 + jit() * .4; c.stroke(P); c.restore(); }   // ink over the icon's own detail lines
  const img = createImage(R, R); img.drawingContext.drawImage(cv, 0, 0); img.setModified?.(true);
  return (ICON_TEX[key] = img);
}
// Draw a watercolor icon. anchor 'feet' stands it on (0, 0); 'center' centres it. h = the drawn height in px.
function drawIcon(name, h, o = {}) {
  if (!iconPath(name)) { if (!ICON_WARNED.has(name)) { ICON_WARNED.add(name); console.warn(`icon "${name}" is not loaded (compile the plan, or add it to src/icons/core.js)`); } return false; }
  const B = iconBox(name), bh = B.y1 - B.y0, S = h / bh;                                   // S: the size of the whole 512 box
  const R = Math.min(1024, Math.max(128, Math.ceil(S * (o.res ?? 1.5) / 128) * 128));
  const v = o.boil === false ? 0 : Math.floor(ICON_T * (o.rate ?? 8)) % 3;
  const tex = iconTexture(name, o.color || PAL.ochre, o.ink === null ? null : o.ink || PAL.ink, R, v);
  const cx = (B.x0 + B.x1) / 2 * S, oy = o.anchor === 'center' ? (B.y0 + B.y1) / 2 * S : B.y1 * S;
  flushBrush(); image(tex, -cx, -oy, S, S);
  return true;
}

// ---------- the actor ----------
const ACTOR_MOVES = ['enter', 'walk', 'run', 'hop', 'jump', 'fly', 'swim', 'shake', 'spin', 'turn', 'wait', 'exit'];
const travelEase = k => k < .5 ? 2 * k * k * (1.5 - k) : 1 - 2 * (1 - k) * (1 - k) * (.5 + k);   // gentle start and stop, steady middle
function actorState(t, o) {
  const size = o.size, moves = [...(o.moves || [])].sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  const S = { x: o.x, y: o.y, face: o.dir === 'left' ? -1 : 1, vis: moves.some(m => m.do === 'enter') ? 0 : 1, flying: false };
  const F = { x: S.x, y: S.y, lift: 0, sx: 1, sy: 1, rot: 0, face: S.face, scale: S.vis, alpha: 1, shadow: 1, busy: false };
  let lastLand = -9;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i], at = m.at ?? 0, dur = m.dur ?? ({ enter: .6, exit: .5, jump: .9, hop: 1.2, turn: .35, shake: .5, spin: .8, wait: .5 }[m.do] ?? 1.6);
    if (t < at) {   // anticipation for a jump or hop: crouch just before take-off
      if ((m.do === 'jump' || m.do === 'hop') && t > at - .14 && S.vis) { const q = ease(seg(t, at - .14, at)); F.sx = 1 + .1 * q; F.sy = 1 - .16 * q; }
      break;
    }
    const k = clamp((t - at) / dur), to = m.to || (m.by ? [S.x + m.by[0], S.y + m.by[1]] : [S.x, S.y]), dx = to[0] - S.x, done = t >= at + dur;
    const face = Math.abs(dx) > 1 ? Math.sign(dx) : S.face;
    const E = { ...S };
    const side = m.from === 'left' ? -1 : m.from === 'right' ? 1 : -S.face;   // the side a slide-in comes from
    if (m.do === 'enter') { E.vis = 1; if (m.style === 'slide') E.face = -side; }
    else if (m.do === 'exit') E.vis = 0;
    else if (m.do === 'turn') E.face = -S.face;
    else if (['walk', 'run', 'hop', 'jump', 'fly', 'swim'].includes(m.do)) { E.x = to[0]; E.y = to[1]; E.face = face; E.flying = m.do === 'fly' ? m.land !== true : false; }
    if (done) { Object.assign(S, E); if (m.do === 'jump' || m.do === 'hop' || (m.do === 'enter' && m.style === 'drop')) lastLand = at + dur; continue; }
    // in progress
    F.busy = true; F.face = S.face; F.x = S.x; F.y = S.y; F.scale = S.vis; F.shadow = S.flying ? 0 : 1;
    if (m.do === 'enter') {
      const st = m.style || 'pop';
      if (st === 'pop') { const b = backOut(k); F.scale = b; F.sy = 1 + .12 * Math.sin(k * Math.PI); F.sx = 1 - .08 * Math.sin(k * Math.PI); }
      else if (st === 'grow') F.scale = ease(k);
      else if (st === 'drop') { F.scale = 1; F.lift = (H * .9) * (1 - k * k); F.sy = 1 + .14 * k; F.sx = 1 - .08 * k; F.shadow = k; }
      else if (st === 'slide') { const x0 = side < 0 ? -size : W + size; F.scale = 1; F.face = -side;
        const p = travelEase(k); F.x = lerp(x0, S.x, p); const ph = p * Math.abs(S.x - x0) / (size * .35) * Math.PI; F.lift = Math.abs(Math.sin(ph)) * size * .06; F.rot = F.face * .08 * (1 - k); }
    } else if (m.do === 'exit') {
      const st = m.style || 'pop';
      if (st === 'pop') F.scale = k < .25 ? 1 + .1 * Math.sin(k / .25 * Math.PI / 2) : 1.1 * (1 - ease((k - .25) / .75));   // a little swell, then gone
      else if (st === 'fade') F.alpha = 1 - k;
      else { const side = S.face, x1 = side > 0 ? W + size * 1.5 : -size * 1.5, p = k * k; F.x = lerp(S.x, x1, p); F.lift = Math.abs(Math.sin(k * 9)) * size * .08; F.rot = side * .12; }
    } else if (m.do === 'walk' || m.do === 'run') {
      const run = m.do === 'run', p = travelEase(k), dist = Math.hypot(dx, to[1] - S.y), stride = size * (run ? .7 : .42);
      const ph = p * Math.max(2, Math.round(dist / stride)) * Math.PI, step = Math.abs(Math.sin(ph));
      F.face = face; F.x = lerp(S.x, to[0], p); F.y = lerp(S.y, to[1], p);
      F.lift = step * size * (run ? .09 : .05); F.rot = Math.sin(ph) * (run ? .05 : .06) + (run ? face * .1 * Math.sin(Math.PI * k) : 0);
      F.sy = 1 - (1 - step) * (run ? .07 : .045); F.sx = 1 + (1 - step) * (run ? .05 : .03);
    } else if (m.do === 'hop' || m.do === 'jump') {
      const n = m.do === 'jump' ? 1 : Math.max(1, m.count ?? (Math.round(Math.abs(dx) / (size * .8)) || 2)), h = m.height ?? size * (m.do === 'jump' ? 1.1 : .45);
      const hk = k * n, idx = Math.min(n - 1, Math.floor(hk)), u = hk - idx, p = (idx + ease(u)) / n;
      F.face = face; F.x = lerp(S.x, to[0], p); F.y = lerp(S.y, to[1], p); F.lift = 4 * h * u * (1 - u);
      F.sy = 1 + .14 * Math.sin(u * Math.PI) - (u > .9 ? .18 * (u - .9) / .1 : 0); F.sx = 2 - F.sy; F.rot = face * .1 * (1 - 2 * u) * (m.do === 'jump' ? 1.5 : 1);
      F.shadow = 1 - .6 * F.lift / Math.max(1, h);
    } else if (m.do === 'fly') {
      const p = ease(k), arc = m.arc ?? size * .8, lift0 = S.flying ? 0 : 0;
      F.face = face; F.x = lerp(S.x, to[0], p); F.y = lerp(S.y, to[1], p) - Math.sin(Math.PI * p) * arc + lift0 + Math.sin(t * 5) * size * .02;
      const vx = (to[0] - S.x) * (Math.PI / 2) * Math.sin(Math.PI * k) / dur, vy = -arc * Math.PI * Math.cos(Math.PI * p);
      F.rot = clamp(Math.atan2(vy, Math.abs(vx) + 1e-3) * .35 * face, -.4, .4); F.shadow = 0;
    } else if (m.do === 'swim') {
      const p = ease(k), waves = m.waves ?? 2, amp = m.amp ?? size * .12, w = Math.sin(p * waves * 2 * Math.PI);
      F.face = face; F.x = lerp(S.x, to[0], p); F.y = lerp(S.y, to[1], p) + w * amp; F.rot = Math.cos(p * waves * 2 * Math.PI) * .18 * face; F.shadow = 0;
    } else if (m.do === 'shake') { F.x += Math.sin(t * 70) * size * (m.amp ?? .05) * (1 - k); F.rot = Math.sin(t * 55) * .05 * (1 - k); }
    else if (m.do === 'spin') F.rot = (m.turns ?? 1) * 2 * Math.PI * ease(k);
    else if (m.do === 'turn') { F.sx = Math.cos(Math.PI * ease(k)); F.sy = 1 + .05 * Math.sin(Math.PI * k); }
    break;
  }
  if (!F.busy) { F.x = S.x; F.y = S.y; F.face = S.face; F.scale = S.vis;
    if (F.sy === 1) { const a = t - lastLand; if (a >= 0 && a < 1) { const q = .2 * Math.exp(-8 * a) * Math.cos(20 * a); F.sy = 1 - q; F.sx = 1 + q * .7; }   // landing squash
      else { F.sy = 1 + .018 * Math.sin(t * Math.PI * 1.1 + (o.id ? o.id.length : 0)); F.sx = 2 - F.sy; } }   // breathing
    if (S.flying) { F.y += Math.sin(t * 5) * size * .02; F.shadow = 0; } }
  return F;
}
definePreset('iconActor', {
  label: 'Watercolor Icon Actor', about: 'any game-icons.net silhouette (by name: mammoth, caveman, battle-tank, sailboat … 4,134 icons) painted as watercolor, acting from a list of moves: enter, walk, run, hop, jump, fly, swim, shake, spin, turn, wait, exit',
  meta: { version: '1.0.0', category: 'object', tags: ['icon', 'watercolor', 'character', 'walk', 'jump', 'fly', 'actor', 'silhouette'],
    params: { icon: { type: 'string', about: 'an icon name or English/Thai noun, resolved by the compiler' }, faces: { enum: ['left', 'right', 'auto'] }, dir: { enum: ['left', 'right'] },
      moves: { type: 'array', items: { do: { enum: ACTOR_MOVES } } } }, assets: [{ param: 'icon', type: 'icon (game-icons.net, CC BY 3.0)' }] },
  defaults: { icon: 'mammoth', color: PAL.ochre, ink: PAL.ink, x: W / 2, y: ny(.78), size: 300 * US(), faces: 'auto', dir: 'right', moves: [], shadow: true, boil: true },
  run(t, o) {
    const F = actorState(t, o); if (F.scale <= .001 || F.alpha <= .003) return;
    const native = (o.faces === 'auto' ? ICON_FACES[o.icon] : o.faces) === 'left' ? -1 : 1, flip = F.face * native;
    if (o.shadow && F.shadow > .01) { flushBrush(); push(); noStroke(); fill(30, 20, 15, 38 * F.shadow * F.scale * F.alpha); ellipse(F.x, F.y + o.size * .02, o.size * .8 * F.scale * (1 - .3 * clamp(F.lift / o.size)), o.size * .1 * F.scale); pop(); }
    push(); translate(F.x, F.y - F.lift); rotate(F.rot); scale(flip * F.sx * F.scale, F.sy * F.scale);
    if (F.alpha < 1) tint(255, 255 * F.alpha);
    drawIcon(o.icon, o.size, { color: o.color, ink: o.ink, boil: o.boil, anchor: 'feet' });
    pop();
  },
  demo: { bg: PAL.cream, ground: { y: ny(.8), color: '#E4D6BC' }, layers: [
    ['iconActor', { id: 'mm', icon: 'mammoth', color: '#B07A4E', x: nx(.62), y: ny(.8), size: 300 * US(), moves: [{ do: 'enter', at: .1, style: 'slide', from: 'right' }, { do: 'walk', at: .9, dur: 1.6, to: [nx(.4), ny(.8)] }, { do: 'turn', at: 2.6 }] }],
    ['iconActor', { id: 'cm', icon: 'caveman', color: '#C9603A', x: nx(.2), y: ny(.8), size: 220 * US(), moves: [{ do: 'enter', at: .5, style: 'pop' }, { do: 'jump', at: 1.4, height: 160 * US() }, { do: 'hop', at: 2.5, dur: 1, count: 2, to: [nx(.12), ny(.8)] }] }],
    ['iconActor', { id: 'bd', icon: 'dove', color: '#3A9C98', x: nx(.15), y: ny(.3), size: 90 * US(), moves: [{ do: 'enter', at: .2, style: 'grow' }, { do: 'fly', at: .5, dur: 3, to: [nx(.85), ny(.25)], arc: 120 * US() }] }],
  ] },
});

// the object presets' painted shape can be an icon: popBounce / objectReveal { icon: 'sailboat' }
const presetItemShape = presetItem;
presetItem = function (o) { if (o.icon && drawIcon(o.icon, o.size * 2, { color: o.color, anchor: 'center', boil: o.boil })) return; return presetItemShape(o); };
