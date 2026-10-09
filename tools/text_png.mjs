// tools/text_png.mjs: one line (or a few lines) of Thai text → a transparent PNG the size of the frame, rendered by
// Chrome's own text engine with the bundled Kanit font (correct vowels and tone marks), for overlaying on video clips.
//   node tools/text_png.mjs --text="ตกลงเขาทำให้เราทุกข์|หรือใจเราเองกันแน่?" --out=out/t.png [--w=1080 --h=1920 --y=.14 --size=92
//                           --color=#2B2233 --stroke=#F6EEDF --weight=800]     ("|" separates lines; y = centre of the block)
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { args, launch } from './lib/harness.mjs';

const o = { w: 1080, h: 1920, y: .14, size: 92, color: '#2B2233', stroke: '#F6EEDF', weight: 800, ...args };
if (!o.text || !o.out) { console.error('usage: node tools/text_png.mjs --text="…" --out=file.png'); process.exit(1); }
const browser = await launch(), page = await browser.newPage();
await page.goto(pathToFileURL(resolve('story.html')).href.replace('story.html', 'tools/blank.html'), { waitUntil: 'load' }).catch(() => {});
const url = await page.evaluate(async (o, fontUrl) => {
  const face = new FontFace('Kanit', `url(${fontUrl})`, { weight: String(o.weight) }); await face.load(); document.fonts.add(face);
  const c = document.createElement('canvas'); c.width = +o.w; c.height = +o.h; const x = c.getContext('2d');
  const lines = String(o.text).split('|'), size = +o.size * Math.min(c.width, c.height) / 1080, lh = size * 1.3;
  x.font = `${o.weight} ${size}px Kanit, "Noto Sans Thai", Tahoma, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  const fit = Math.min(1, ...lines.map(l => c.width * .84 / x.measureText(l).width));            // shrink to fit the width
  x.font = `${o.weight} ${size * fit}px Kanit, "Noto Sans Thai", Tahoma, sans-serif`;
  lines.forEach((l, i) => {
    const y = +o.y * c.height + (i - (lines.length - 1) / 2) * lh * fit;
    x.lineJoin = 'round'; x.lineWidth = 9 * fit * size / 92; x.strokeStyle = o.stroke; x.strokeText(l, c.width / 2, y);
    x.fillStyle = o.color; x.fillText(l, c.width / 2, y);
  });
  return c.toDataURL('image/png');
}, o, pathToFileURL(resolve('assets/fonts/kanit-thai-800-normal.woff2')).href);
await browser.close();
mkdirSync(dirname(o.out), { recursive: true }); writeFileSync(o.out, Buffer.from(url.split(',')[1], 'base64'));
console.log(`wrote ${o.out}`);
