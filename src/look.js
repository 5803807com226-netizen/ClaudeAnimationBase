// look.js: the shared VISUAL QUALITY system. A story picks a style; every system then adapts on its own: the colour grade,
// key light, texture (paper, grain), vignette, atmospheric depth (haze on far world layers), glow strength, contact
// shadows, letterbox, and camera / motion polish. Nothing here draws characters, worlds or props, so a style never
// changes a design, a palette choice or asset proportions; it only finishes the frame. Everything is a pure function of
// time and the format (deterministic, safe for parallel batch rendering), and an effect that is off costs nothing.
//
// Choosing (the Creative Director's call, as data):
//   PROJECT.look = 'cinematic'                                            a style by name
//   PROJECT.look = { style: 'watercolor', off: ['haze'], set: { vignette: { amt: .2 }, glow: 1.2 } }
//   PROJECT.look = { style: 'cinematic', set: { letterbox: 2.39 } }        bars only when a story asks for them explicitly
//   ?look=documentary on the page, --look=documentary on render.mjs      (overrides, e.g. for before/after sheets)
//   chooseLook({ subject: 'data' | 'product' | 'nature' | 'drama' | 'news' | 'kids' | 'abstract', characters, tone })
// Without a look a project renders exactly as before ('classic').
//
// Effects (each can be turned off by name or retuned with set):
//   grade { contrast, saturate, brightness }   tint { color, amt }   light { amt, color, shade, from: [fx, fy] }
//   paper (texture strength)   grain (strength)   vignette { amt, color }   haze { amt, color: 'auto' | colour }
//   glow (× glow() strength)   shadow (× actor contact-shadow opacity)
//   letterbox: OFF in every style; every frame renders full-bleed, edge to edge. Only an explicit
//     set: { letterbox: 2.39 } adds bars (target ratio, wide formats only). No style may turn it on by default.
//   camera { handheld (px at 1080), breathe (zoom amount), shake (× landing shake) }
const LOOK_STYLES = {
  classic: {},   // the engine's original finish: paper under the scene, grain and vignette baked together
  watercolor: { grade: { contrast: 1.02, saturate: .96 }, light: { amt: .16, color: '#FFE2B0', shade: '#5B6C9A', from: [.25, .1] },
    paper: .22, grain: .9, vignette: { amt: .28, color: '#6E5338' }, haze: { amt: .3 }, glow: 1.05 },
  collage: { grade: { contrast: 1.06, saturate: 1.1 }, paper: .45, grain: .6, vignette: { amt: .16, color: '#5A4632' },
    haze: { amt: .12 }, glow: .75, shadow: 1.4 },
  illustration: { grade: { contrast: 1.06, saturate: 1.06 }, light: { amt: .14, color: '#FFF0D0', shade: '#55607F', from: [.3, .05] },
    paper: .06, grain: .35, vignette: { amt: .14, color: '#3E3448' }, haze: { amt: .22 }, glow: 1.1 },
  cinematic: { grade: { contrast: 1.12, saturate: .92 }, tint: { color: '#1F3D5C', amt: .16 },
    light: { amt: .3, color: '#FFB46A', shade: '#18304F', from: [.22, .12] }, grain: .55, vignette: { amt: .48, color: '#120E18' },
    haze: { amt: .38 }, glow: 1.3, shadow: 1.15, camera: { handheld: 1.5, breathe: .012, shake: .8 } },
  documentary: { grade: { contrast: 1.04, saturate: .88 }, light: { amt: .08, color: '#FFF4E2', shade: '#4A4A52', from: [.5, 0] },
    grain: .8, vignette: { amt: .2, color: '#24222A' }, haze: { amt: .2 }, glow: .85, camera: { handheld: 4, shake: 1.2 } },
  infographic: { grade: { contrast: 1.03, saturate: 1.05 }, grain: 0, glow: .6, shadow: .6, camera: { shake: 0 } },
  abstract: { grade: { contrast: 1.08, saturate: 1.14 }, light: { amt: .24, color: '#FFD9F0', shade: '#2A2350', from: [.7, .15] },
    grain: .3, vignette: { amt: .3, color: '#1C1630' }, glow: 1.4, camera: { breathe: .016 } },
  product: { grade: { contrast: 1.07, saturate: 1.04 }, light: { amt: .18, color: '#FFF8EE', shade: '#2E3140', from: [.5, -.05] },
    grain: .15, vignette: { amt: .36, color: '#15161C' }, glow: 1.2, shadow: 1.3, camera: { breathe: .01, shake: .5 } },
};
for (const [k, s] of Object.entries(LOOK_STYLES)) if (s.letterbox) console.warn(`look style "${k}" turns letterbox on by default; styles must render full-frame`);
const LOOK_EFFECTS = ['grade', 'tint', 'light', 'paper', 'grain', 'vignette', 'haze', 'glow', 'shadow', 'letterbox', 'camera'];

// The Creative Director's helper: a style from a short brief. Plain rules, easy to extend; the story can still override.
function chooseLook(b = {}) {
  const s = [b.subject, b.tone, b.genre].filter(Boolean).join(' ').toLowerCase(), has = (...w) => w.some(x => s.includes(x));
  if (has('data', 'chart', 'explainer', 'infographic', 'stat')) return 'infographic';
  if (has('product', 'ad', 'commercial', 'launch', 'brand')) return 'product';
  if (has('news', 'documentary', 'interview', 'real')) return 'documentary';
  if (has('drama', 'epic', 'cinematic', 'night', 'suspense', 'trailer')) return 'cinematic';
  if (has('abstract', 'music', 'mood', 'loop')) return 'abstract';
  if (has('collage', 'craft', 'scrapbook')) return 'collage';
  if (has('kids', 'gentle', 'nature', 'fairy', 'bedtime', 'storybook')) return 'watercolor';
  return b.characters === false ? 'infographic' : 'illustration';
}

// Resolve the active look once (style + the director's off / set), with every effect present and neutral by default.
const LOOK = (() => {
  const q = new URLSearchParams(location.search).get('look'), cfg = q ? { style: q } : typeof PROJECT.look === 'string' ? { style: PROJECT.look } : (PROJECT.look || {});
  const name = LOOK_STYLES[cfg.style] ? cfg.style : 'classic';
  if (cfg.style && !LOOK_STYLES[cfg.style]) console.warn(`look "${cfg.style}" is not one of ${Object.keys(LOOK_STYLES).join(', ')}; using classic`);
  const st = { ...LOOK_STYLES[name] };
  for (const [k, v] of Object.entries(cfg.set || {})) st[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...(st[k] || {}), ...v } : v;
  for (const k of cfg.off || []) delete st[k];
  return { name, classic: name === 'classic', grade: { contrast: 1, saturate: 1, brightness: 1, ...st.grade }, tint: st.tint || null, light: st.light || null,
    paper: st.paper || 0, grain: st.grain ?? (name === 'classic' ? 1 : 0), vignette: st.vignette || null, haze: st.haze || null,
    glow: st.glow ?? 1, shadow: st.shadow ?? 1, letterbox: st.letterbox || 0, camera: { handheld: 0, breathe: 0, shake: 1, ...st.camera } };
})();

// Letterbox bar height (px), 0 unless the story explicitly set letterbox: only on frames wider than tall that are less
// wide than the target ratio. Tall formats never
// get bars (they would waste a phone screen); safeArea() in responsive.js keeps characters and text clear of the bars.
const lookBars = () => LOOK.letterbox && W > H && W / H < LOOK.letterbox ? Math.round((H - W / LOOK.letterbox) / 2) : 0;

// Camera polish, used by camBegin(): a slow handheld drift (smooth, incommensurate sines: no jitter, no randomness) and
// a gentle breathing push. Returns [dx, dy, zoom multiplier] at time t.
function lookCamera(t) {
  const c = LOOK.camera; if (!c.handheld && !c.breathe) return [0, 0, 1];
  const a = c.handheld * US(), n = (f, p) => Math.sin(t * f + p) * .6 + Math.sin(t * f * 2.31 + p * 1.7) * .4;
  return [a * n(.9, .3), a * .7 * n(.73, 2.1), 1 + c.breathe * (.5 - .5 * Math.cos(t * .5))];
}

// Atmospheric depth, used by drawLayers() after each far layer (depth < 1): a thin veil of the sky colour over what is
// already painted, so each farther layer ends up paler and closer to the sky. Screen-space, cheap, deterministic.
function lookHaze(depth, color) {
  if (!LOOK.haze || depth >= 1) return;
  const col = LOOK.haze.color && LOOK.haze.color !== 'auto' ? LOOK.haze.color : color; if (!col) return;
  flushBrush(); const c = window.color(col);
  push(); resetMatrix(); translate(-W / 2, -H / 2); noStroke(); fill(red(c), green(c), blue(c), 255 * clamp(LOOK.haze.amt * (1 - depth) * .45)); rect(-10, -10, W + 20, H + 20); pop();
}

// The finish, used by composite(): grade the painted frame as it is copied out, then light, texture, vignette, bars.
let LOOK_TEX = null;
function lookDrawFrame(c, src) {
  const g = LOOK.grade;
  c.filter = g.contrast !== 1 || g.saturate !== 1 || g.brightness !== 1 ? `contrast(${g.contrast}) saturate(${g.saturate}) brightness(${g.brightness})` : 'none';
  c.drawImage(src, 0, 0, W, H); c.filter = 'none';
}
function lookFinish(c, t) {
  if (LOOK.classic) { c.globalCompositeOperation = 'multiply'; c.drawImage(grainC, 0, 0); c.globalCompositeOperation = 'source-over'; return; }
  const X = (op, a, f) => { if (a <= 0) return; c.save(); c.globalCompositeOperation = op; c.globalAlpha = clamp(a); f(); c.restore(); };
  if (LOOK.tint) X('soft-light', LOOK.tint.amt, () => { c.fillStyle = LOOK.tint.color; c.fillRect(0, 0, W, H); });
  if (LOOK.light) X('soft-light', LOOK.light.amt, () => {   // key light from one side, falling into a cool shade
    const [fx, fy] = LOOK.light.from || [.3, .1], R = Math.hypot(W, H), gr = c.createRadialGradient(fx * W, fy * H, 0, fx * W, fy * H, R);
    gr.addColorStop(0, LOOK.light.color || '#FFE6C0'); gr.addColorStop(.55, 'rgba(128,128,128,0)'); gr.addColorStop(1, LOOK.light.shade || '#404860');
    c.fillStyle = gr; c.fillRect(0, 0, W, H);
  });
  if (LOOK.paper || LOOK.grain) {
    if (!LOOK_TEX) LOOK_TEX = { noise: makeGrain(false) };
    X('multiply', LOOK.paper, () => c.drawImage(paperG.elt || paperG.canvas, 0, 0, W, H));
    X('multiply', LOOK.grain, () => c.drawImage(LOOK_TEX.noise, 0, 0));
  }
  if (LOOK.vignette) X('multiply', LOOK.vignette.amt, () => {
    const gr = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .32, W / 2, H / 2, Math.hypot(W, H) * .56);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, LOOK.vignette.color || '#3A2E28');
    c.fillStyle = gr; c.fillRect(0, 0, W, H);
  });
  const b = lookBars(); if (b) { c.fillStyle = '#0F0D13'; c.fillRect(0, 0, W, b); c.fillRect(0, H - b, W, b); }
}
