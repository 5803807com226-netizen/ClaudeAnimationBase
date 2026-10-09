// tools/validate_assets.mjs: checks a collage scene's PNG artwork BEFORE any rendering (pure Node: no browser, seconds).
//   node tools/validate_assets.mjs --story=<id> [--scene=<scene id>]
// Reads src/stories/<id>/config.js and its files (the SCENES manifest), then for every layer:
//   FAIL  file missing · not a PNG · too small for the closest camera zoom (< 75 % of the pixels needed)
//         a cut-out with no transparency · an empty image · a full-bleed backdrop that leaves the frame uncovered
//   WARN  below 100 % of the pixels needed · a cut-out whose artwork touches the image edge (cut off, no margin)
//         a backdrop with transparency · a file name not in lower_snake_case · a file over 15 MB
// Exit code 1 if anything FAILs.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import vm from 'node:vm';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
if (!args.story) { console.error('usage: node tools/validate_assets.mjs --story=<id> [--scene=<scene id>]'); process.exit(1); }
const root = `src/stories/${args.story}/`;
const ctx = { window: {}, console, Math, playCollage: () => {}, SCENES: {} }; ctx.window.SCENES = ctx.SCENES; vm.createContext(ctx);
vm.runInContext(readFileSync(root + 'config.js', 'utf8') + '\nwindow.PROJECT = PROJECT;', ctx);
for (const f of ctx.window.PROJECT.files || []) if (!f.startsWith('src/')) vm.runInContext(readFileSync(root + f, 'utf8'), ctx);
const P = ctx.window.PROJECT, W = P.width || 1080, H = P.height || 1920, PARALLAX_REF = [960, 540];
const scenes = Object.entries(ctx.SCENES).filter(([k]) => !args.scene || k === args.scene);
if (!scenes.length) { console.error(`no SCENES found in ${root}`); process.exit(1); }

// ---- a small PNG reader: header, and pixels for 8-bit non-interlaced images (what image tools export) ----
function readPng(file) {
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
  let clear = 0, solid = 0, x0 = ihdr.w, y0 = ihdr.h, x1 = -1, y1 = -1;
  const A = (x, y) => ch === 4 ? px[(y * ihdr.w + x) * 4 + 3] : ch === 2 ? px[(y * ihdr.w + x) * 2 + 1] : 255;
  for (let y = 0; y < ihdr.h; y++) for (let x = 0; x < ihdr.w; x++) {
    const a = A(x, y); if (a < 8) clear++; else { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } if (a > 247) solid++;
  }
  const n = ihdr.w * ihdr.h;
  return { ...out, clear: clear / n, solid: solid / n, bbox: x1 < 0 ? null : [x0, y0, x1, y1], edge: x1 >= 0 && (x0 <= 1 || y0 <= 1 || x1 >= ihdr.w - 2 || y1 >= ihdr.h - 2) };
}

// ---- camera sampling (same maths as collage.js cameraKeys) ----
const camAt = (keys, t) => {
  let i = 1; while (i < keys.length - 1 && t > keys[i][0]) i++;
  const [t0, x0, y0, z0] = keys[i - 1], [t1, x1, y1, z1] = keys[i], k = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
  return [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, Math.exp(Math.log(z0) + (Math.log(z1) - Math.log(z0)) * k)];   // linear k is enough to bound the view
};

let fails = 0, warns = 0;
for (const [sid, S] of scenes) {
  const dir = S.assets || '', keys = S.camera || [[0, W / 2, H / 2, 1], [S.duration || 3, W / 2, H / 2, 1]], dur = S.duration || keys[keys.length - 1][0];
  const zmax = Math.max(...keys.map(k => k[3]));
  console.log(`scene ${sid}: ${S.layers.length} layers, ${dur} s, closest zoom ${zmax}, assets in ${dir}`);
  for (const L of S.layers) {
    const msgs = [], fail = m => { msgs.push('FAIL  ' + m); fails++; }, warn = m => { msgs.push('WARN  ' + m); warns++; }, f = dir + L.file;
    if (!/^[a-z0-9]+(_[a-z0-9]+)*\.png$/.test(L.file)) warn(`file name "${L.file}" is not lower_snake_case.png`);
    if (!existsSync(f)) { fail(`missing: ${f}`); console.log(`  ${L.id.padEnd(16)} ${msgs.join('\n' + ' '.repeat(19))}`); continue; }
    if (statSync(f).size > 15e6) warn(`${(statSync(f).size / 1e6).toFixed(1)} MB: large for a layer`);
    const im = readPng(f);
    if (im.error) fail(im.error);
    else {
      const scaleMax = Math.max(L.scale ?? 1, ...(L.keys || []).map(k => k[1].scale ?? 0)), need = L.size[0] * zmax * scaleMax;
      if (im.w < need * .75) fail(`${im.w}×${im.h} px is too small: the closest shot needs about ${Math.ceil(need)} px wide`);
      else if (im.w < need) warn(`${im.w}×${im.h} px is a little small: the closest shot needs about ${Math.ceil(need)} px wide`);
      if (im.note) warn(im.note);
      else if (im.bbox === null) fail('the image is empty (fully transparent)');
      else if (L.fill) {
        if (im.clear > .001) warn(`backdrop has ${(im.clear * 100).toFixed(1)} % transparent pixels`);
        const h = L.size[1] ?? L.size[0] * im.h / im.w, ax = (L.anchor || [.5, .5])[0], ay = (L.anchor || [.5, .5])[1], d = L.depth ?? 1;
        for (let t = 0; t <= dur + 1e-6; t += .1) {   // under every camera, the backdrop must cover the whole frame
          const [cx, cy, z] = camAt(keys, t), sx = (cx - PARALLAX_REF[0]) * (1 - d), sy = (cy - PARALLAX_REF[1]) * (1 - d);
          const lx0 = L.at[0] - ax * L.size[0] + sx, ly0 = L.at[1] - ay * h + sy;
          const vx0 = cx - W / 2 / z, vy0 = cy - H / 2 / z, vx1 = cx + W / 2 / z, vy1 = cy + H / 2 / z;
          if (lx0 > vx0 + .5 || ly0 > vy0 + .5 || lx0 + L.size[0] < vx1 - .5 || ly0 + h < vy1 - .5) { fail(`at ${t.toFixed(1)} s the backdrop leaves part of the frame uncovered`); break; }
        }
      } else {
        if (!im.hasAlpha || im.clear < .01) fail('a cut-out needs transparency around the artwork (export RGBA PNG with the background removed)');
        else if (im.edge) warn('the artwork touches the image edge: leave a margin, or it looks cut off (and the paper border is clipped)');
      }
      msgs.unshift(`${im.w}×${im.h}${im.hasAlpha ? ' RGBA' : ' RGB'}${im.clear != null ? `, ${(im.clear * 100).toFixed(0)} % clear` : ''}`);
    }
    console.log(`  ${L.id.padEnd(16)} ${msgs.join('\n' + ' '.repeat(19))}`);
  }
}
console.log(fails ? `\n${fails} FAIL, ${warns} WARN` : `\nall layers PASS${warns ? ` (${warns} WARN)` : ''}`);
process.exit(fails ? 1 : 0);
