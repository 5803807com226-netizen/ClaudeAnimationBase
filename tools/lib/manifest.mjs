// tools/lib/manifest.mjs: loading a story's collage manifest (SCENES) in Node, reading PNGs, and checking one layer
// against it. Shared by validate_assets.mjs (checks) and gen_assets.mjs (generation, retry only what fails).
import { readFileSync, existsSync, statSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import vm from 'node:vm';

export const ASPECTS = { '9:16': [1080, 1920], '16:9': [1920, 1080], '4:5': [1080, 1350] };
const PARALLAX_REF = [960, 540];
// a value may be a per-format map ({ '9:16': a, '16:9': b, '4:5': c } or { tall, wide }), as in responsive.js
export const isAspectMap = v => v && typeof v === 'object' && !Array.isArray(v) && ['9:16', '16:9', '4:5', 'tall', 'wide'].some(k => k in v);
export const av = (v, a) => !isAspectMap(v) ? v : a in v ? v[a] : (ASPECTS[a][1] > ASPECTS[a][0] ? v.tall : v.wide) ?? v.default;

// Run the story's config.js and its own files in a sandbox: they only assign data (PROJECT, SCENES).
export function loadStory(story) {
  const root = `src/stories/${story}/`;
  const ctx = { window: {}, console, Math, playCollage: () => {}, playPlan: () => {}, SCENES: {} }; ctx.window.SCENES = ctx.SCENES; vm.createContext(ctx);
  vm.runInContext(readFileSync(root + 'config.js', 'utf8') + '\nwindow.PROJECT = PROJECT;', ctx);
  for (const f of ctx.window.PROJECT.files || []) if (!f.startsWith('src/')) vm.runInContext(readFileSync(root + f, 'utf8'), ctx);
  return { root, project: ctx.window.PROJECT, scenes: ctx.SCENES };
}
// The formats a scene must work in: scene.aspects, else the project's own.
export const sceneAspects = (S, P) => S.aspects || [P.aspect || '9:16'];

// ---- a small PNG reader: header, and pixels for 8-bit non-interlaced images (what image tools export) ----
export function readPng(file) {
  const b = readFileSync(file);
  if (b.readUInt32BE(0) !== 0x89504e47) return { error: 'not a PNG file' };
  let o = 8, ihdr = null, trns = false; const idat = [];
  while (o < b.length) {
    const len = b.readUInt32BE(o), type = b.toString('ascii', o + 4, o + 8), d = b.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') ihdr = { w: d.readUInt32BE(0), h: d.readUInt32BE(4), depth: d[8], color: d[9], interlace: d[12] };
    else if (type === 'tRNS') trns = true; else if (type === 'IDAT') idat.push(d); else if (type === 'IEND') break;
    o += 12 + len;
  }
  const hasAlpha = ihdr.color === 6 || ihdr.color === 4 || trns, ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ihdr.color];
  const out = { ...ihdr, hasAlpha };
  if (ihdr.depth !== 8 || ihdr.interlace || !ch) return { ...out, note: 'pixel checks skipped (not 8-bit non-interlaced RGB/RGBA/grey)' };
  const raw = inflateSync(Buffer.concat(idat)), stride = ihdr.w * ch, px = Buffer.alloc(stride * ihdr.h);
  for (let y = 0; y < ihdr.h; y++) {   // undo the per-row filters
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), row = px.subarray(y * stride, (y + 1) * stride), up = y ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? row[i - ch] : 0, u = up ? up[i] : 0, c = up && i >= ch ? up[i - ch] : 0;
      let v = src[i];
      if (f === 1) v += a; else if (f === 2) v += u; else if (f === 3) v += (a + u) >> 1;
      else if (f === 4) { const p = a + u - c, pa = Math.abs(p - a), pb = Math.abs(p - u), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? u : c; }
      row[i] = v & 255;
    }
  }
  // alpha statistics: transparent / opaque fractions, the artwork's bounding box, whether it touches the edge
  let clear = 0, solid = 0, partial = 0, x0 = ihdr.w, y0 = ihdr.h, x1 = -1, y1 = -1;
  const A = (x, y) => ch === 4 ? px[(y * ihdr.w + x) * 4 + 3] : ch === 2 ? px[(y * ihdr.w + x) * 2 + 1] : 255;
  for (let y = 0; y < ihdr.h; y++) for (let x = 0; x < ihdr.w; x++) {
    const a = A(x, y); if (a < 8) clear++; else { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } if (a > 247) solid++; else if (a >= 8) partial++;
  }
  const n = ihdr.w * ihdr.h;
  // matte quality: detached specks (connected components of visible pixels), green tint on the edge and inside, and a dark
  // outer rim (a baked shadow). Green tint = green is (about) the top channel and clearly above the lowest one.
  const quality = ch === 4 ? matteQuality(px, ihdr.w, ihdr.h) : null;
  return { ...out, quality, clear: clear / n, solid: solid / n, partial: partial / n, bbox: x1 < 0 ? null : [x0, y0, x1, y1], edge: x1 >= 0 && (x0 <= 1 || y0 <= 1 || x1 >= ihdr.w - 2 || y1 >= ihdr.h - 2) };
}


function matteQuality(px, w, h) {
  const A = i => px[i * 4 + 3], vis = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) vis[i] = A(i) > 10 ? 1 : 0;
  // connected components by row runs + union-find (8-neighbour)
  const parent = [0], find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  let prev = [], runs = [];
  for (let y = 0; y < h; y++) {
    const cur = []; let x = 0;
    while (x < w) { if (!vis[y * w + x]) { x++; continue; } const s = x; while (x < w && vis[y * w + x]) x++;
      let lab = 0; for (const [ps, pe, pl] of prev) if (ps <= x && pe >= s) { const r = find(pl); if (!lab) lab = r; else if (r !== lab) { const lo = Math.min(r, lab); parent[Math.max(r, lab)] = lo; lab = lo; } }
      if (!lab) { lab = parent.length; parent.push(lab); } cur.push([s, x, lab]); runs.push([s, x, lab]); }
    prev = cur;
  }
  const area = new Map(); for (const [s, e, l] of runs) { const r = find(l); area.set(r, (area.get(r) || 0) + e - s); }
  const sizes = [...area.values()].sort((a, b) => b - a), big = sizes[0] || 0, specks = sizes.filter(a => a < big * .01);
  // contamination is green BEYOND the artwork's own colour: the solid interior's 99th percentile of green excess
  // (G - max(R, B)) is the paper's natural ceiling (a pale cyan-blue paper may sit near 0; yellow paper far below)
  const ex = []; for (let i = 0; i < w * h; i += 7) if (A(i) > 245) ex.push(px[i * 4 + 1] - Math.max(px[i * 4], px[i * 4 + 2]));
  ex.sort((a, b) => a - b); const ceil = ex.length ? ex[Math.floor(ex.length * .99)] : 0;
  // …and its green SHARE (g / (r + g + b)): catches cyan / teal rims on blue or lavender paper, where blue stays on top
  const gs = []; for (let i = 0; i < w * h; i += 7) if (A(i) > 245) gs.push(px[i * 4 + 1] / Math.max(1, px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]));
  gs.sort((a, b) => a - b); const gceil = gs.length ? gs[Math.floor(gs.length * .99)] : 1;
  let visN = 0, edgeN = 0, gVis = 0, gEdge = 0, lumSum = [], rimN = 0, rimDark = 0;
  const isVis = (x, y) => x >= 0 && y >= 0 && x < w && y < h && vis[y * w + x];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!vis[i]) continue;
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2], a = px[i * 4 + 3], tint = (g >= Math.max(r, b) - 2 && g - Math.min(r, b) > 25 && g - Math.max(r, b) > ceil + 6) || (g - Math.min(r, b) > 20 && g / Math.max(1, r + g + b) > gceil + .02);
    visN++; if (tint) gVis++;
    if (a < 235) { edgeN++; if (tint) gEdge++; }
    if (a > 245 && (y * 7 + x * 13) % 9 === 0) lumSum.push((r + g + b) / 3);
  }
  lumSum.sort((a, b) => a - b); const Lm = lumSum[lumSum.length >> 1] || 0;
  for (let y = 3; y < h - 3; y++) for (let x = 3; x < w - 3; x++) {   // the outer rim: solid pixels with a clear pixel 3 px away
    const i = y * w + x; if (A(i) < 128) continue;
    if (isVis(x + 3, y) && isVis(x - 3, y) && isVis(x, y + 3) && isVis(x, y - 3)) continue;
    rimN++; if ((px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]) / 3 < .5 * Lm) rimDark++;
  }
  return { specks: specks.length, speckArea: specks.reduce((s, a) => s + a, 0) / Math.max(1, big), greenEdge: gEdge / Math.max(1, edgeN), greenVisible: gVis / Math.max(1, visN), darkRim: rimDark / Math.max(1, rimN) };
}

// ---- camera sampling (same maths as collage.js cameraKeys; linear k bounds the view) ----
export const camAt = (keys, t) => {
  let i = 1; while (i < keys.length - 1 && t > keys[i][0]) i++;
  const [t0, x0, y0, z0] = keys[i - 1], [t1, x1, y1, z1] = keys[i], k = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
  return [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, Math.exp(Math.log(z0) + (Math.log(z1) - Math.log(z0)) * k)];
};
const camOf = (S, a) => av(S.camera, a) || [[0, ASPECTS[a][0] / 2, ASPECTS[a][1] / 2, 1], [S.duration || 3, ASPECTS[a][0] / 2, ASPECTS[a][1] / 2, 1]];
// The pixels a layer needs to stay sharp at the closest zoom, over every format the scene supports, in its driving
// dimension: { dim: 'w' | 'h', px }. A layer is sized by width (size: [w]) or by height (size: [null, h]).
// a footage-space layer's sizes are fractions of the plate: its world size in format a (the plate is cover-fitted)
const plateWorld = (S, a) => {
  const F = S.footage && av(S.footage, a); let fw = 16, fh = 9;
  try { [fw, fh] = JSON.parse(readFileSync((F.dir || '').replace(/\/?$/, '/') + 'meta.json', 'utf8')).size; } catch (e) { /* no plate yet: assume 16:9 */ }
  const [Wa, Ha] = ASPECTS[a], k = F?.fit === 'width' ? Wa / fw : F?.fit === 'height' ? Ha / fh : Math.max(Wa / fw, Ha / fh); return [fw * k, fh * k];
};
export function neededSize(L, S, P) {
  const byH = av(L.size, sceneAspects(S, P)[0])[0] == null;
  return { dim: byH ? 'h' : 'w', px: Math.ceil(Math.max(...sceneAspects(S, P).map(a => {
    const zmax = Math.max(...camOf(S, a).map(k => k[3])), scaleMax = Math.max(av(L.scale, a) ?? 1, ...(av(L.keys, a) || []).map(k => k[1].scale ?? 0));
    const unit = L.space === 'footage' ? plateWorld(S, a)[byH ? 1 : 0] : 1;
    return av(L.size, a)[byH ? 1 : 0] * unit * zmax * scaleMax;
  }))) };
}
export const neededWidth = (L, S, P) => neededSize(L, S, P).px;   // (kept for callers that only show a number)

// Check one layer. Returns { fails: [], warns: [], info, png }.
export function checkLayer(L, S, P) {
  if (L.doodle) return { fails: [], warns: [], info: `doodle ${L.doodle.kind} (drawn)` };   // doodle FX: no artwork file
  const fails = [], warns = [], f = (S.assets || '') + L.file;
  if (!/^[a-z0-9]+(_[a-z0-9]+)*\.png$/.test(L.file)) warns.push(`file name "${L.file}" is not lower_snake_case.png`);
  if (!existsSync(f)) return { fails: [`missing: ${f}`], warns, info: '' };
  if (statSync(f).size > 15e6) warns.push(`${(statSync(f).size / 1e6).toFixed(1)} MB: large for a layer`);
  const im = readPng(f);
  if (im.error) return { fails: [im.error], warns, info: '' };
  const { dim, px: need } = neededSize(L, S, P), have = dim === 'h' ? im.h : im.w, side = dim === 'h' ? 'tall' : 'wide';
  if (have < need * .75) fails.push(`${im.w}×${im.h} px is too small: the closest shot needs about ${need} px ${side}`);
  else if (have < need) warns.push(`${im.w}×${im.h} px is a little small: the closest shot needs about ${need} px ${side}`);
  if (im.note) warns.push(im.note);
  else if (im.bbox === null) fails.push('the image is empty (fully transparent)');
  else if (L.opaque) { /* a full opaque image placed by story code (a reference view, a plate): only size and readability count */ }
  else if (L.fill) {
    if (im.clear > .001) warns.push(`backdrop has ${(im.clear * 100).toFixed(1)} % transparent pixels`);
    const dur = S.duration || 3;
    for (const a of sceneAspects(S, P)) {   // under every camera, in every format, the backdrop must cover the whole frame
      const [Wa, Ha] = ASPECTS[a], keys = camOf(S, a), size = av(L.size, a), at = av(L.at, a), anc = av(L.anchor, a) || [.5, .5], d = av(L.depth, a) ?? 1;
      const w = size[0] ?? size[1] * im.w / im.h, h = size[1] ?? size[0] * im.h / im.w;
      for (let t = 0; t <= dur + 1e-6; t += .1) {
        const [cx, cy, z] = camAt(keys, t), sx = (cx - PARALLAX_REF[0]) * (1 - d), sy = (cy - PARALLAX_REF[1]) * (1 - d);
        const lx0 = at[0] - anc[0] * w + sx, ly0 = at[1] - anc[1] * h + sy;
        if (lx0 > cx - Wa / 2 / z + .5 || ly0 > cy - Ha / 2 / z + .5 || lx0 + w < cx + Wa / 2 / z - .5 || ly0 + h < cy + Ha / 2 / z - .5) {
          fails.push(`${a}: at ${t.toFixed(1)} s the backdrop leaves part of the frame uncovered`); break;
        }
      }
    }
  } else {
    if (!im.hasAlpha || im.clear < .01) fails.push('a cut-out needs transparency around the artwork (export RGBA PNG with the background removed)');
    else if (im.partial > .15) fails.push(`${(im.partial * 100).toFixed(0)} % of pixels are half-transparent: the background was not removed cleanly (speckled matte)`);
    const q = im.quality;
    if (q) {
      if (q.specks >= 5 || q.speckArea > .001) fails.push(`${q.specks} detached specks outside the artwork: background noise left by the matte`);
      else if (q.specks) warns.push(`${q.specks} small detached speck(s) outside the artwork`);
      if (!L.allowGreen && (q.greenEdge > .05 || q.greenVisible > .01)) fails.push(`green contamination: ${(q.greenEdge * 100).toFixed(1)} % of edge pixels, ${(q.greenVisible * 100).toFixed(1)} % of the artwork (chroma spill)`);
      if (q.darkRim > .06) warns.push(`${(q.darkRim * 100).toFixed(0)} % of the outer edge is dark: a shadow may be baked into the artwork (the renderer adds shadows; regenerate if it shows)`);
    }
    else if (im.edge && !L.edgeOk) warns.push('the artwork touches the image edge: leave a margin, or it looks cut off (and the paper border is clipped)');
  }
  return { fails, warns, png: im, info: `${im.w}×${im.h}${im.hasAlpha ? ' RGBA' : ' RGB'}${im.clear != null ? `, ${(im.clear * 100).toFixed(0)} % clear` : ''}` };
}
