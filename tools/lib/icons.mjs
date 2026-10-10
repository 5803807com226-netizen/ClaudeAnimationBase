// tools/lib/icons.mjs: the ICON LIBRARY behind watercolor actors (src/presets/actor.js). Only public-domain icons
// (CC0 1.0: no credit, no attribution, free for any use, commercial included): Pinhead, Temaki and Maki
// (npm @iconify-json/pinhead, /temaki, /maki), about 3,500 filled silhouettes on a 15 × 15 grid. Never add a set whose
// licence asks for credit (CC BY, CC BY-SA …) or restricts use (NC, GPL); that is a project rule.
// Nothing is loaded into pages wholesale: the compiler writes only the icons a story uses into its plan folder
// (icons.js), and src/icons/core.js carries a small committed set for demos and tests.
//   resolveIcon('running horse') → 'horse-running'      resolveIcon('ช้าง') → 'elephant'      (null when nothing fits)
//   iconData(['elephant', ...]) → { elephant: { d, s }, ... }   (s = the icon's box size)
//   node tools/lib/icons.mjs search <words>        list the best matches (English or Thai)
//   node tools/lib/icons.mjs core                  rebuild src/icons/core.js from CORE_ICONS
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const ICON_SETS = ['pinhead', 'temaki', 'maki'];   // all CC0 1.0; earlier sets win a name clash
export const ICON_SOURCE = 'Pinhead, Temaki and Maki icons (CC0 1.0, public domain: no credit needed)';
let LIB = null;
export function iconLibrary() {
  if (LIB) return LIB;
  const req = createRequire(import.meta.url), icons = {};
  for (const set of ICON_SETS) {
    let j; try { j = JSON.parse(readFileSync(req.resolve(`@iconify-json/${set}/icons.json`), 'utf8')); }
    catch { throw new Error(`the icon library is not installed: run "npm install" (package @iconify-json/${set})`); }
    if (j.info?.license?.spdx && j.info.license.spdx !== 'CC0-1.0') throw new Error(`icon set ${set} is not CC0 (${j.info.license.spdx})`);
    for (const [name, v] of Object.entries(j.icons)) {
      if (icons[name] || (/-(11|15)$/.test(name) && j.icons[name.replace(/-(11|15)$/, '')])) continue;   // Maki's small-size duplicates
      icons[name] = { body: v.body, s: v.width || j.width || 15, set };
    }
  }
  return (LIB = { icons });
}
export const iconNames = () => Object.keys(iconLibrary().icons);

// Thai words (and a few English synonyms) → icon names. The Director writes English nouns; this map lets Thai story
// text (the no-AI test layout, or a Director that answers in Thai) find icons too. Longest Thai word first.
export const THAI_ICONS = {
  'ช้าง': 'elephant', 'ม้าวิ่ง': 'horse-running', 'ม้า': 'horse', 'สุนัข': 'dog', 'หมา': 'dog', 'แมว': 'cat-sitting', 'นก': 'bird-flying', 'ปลา': 'fish',
  'สิงโต': 'lion', 'หมี': 'bear', 'ยีราฟ': 'giraffe', 'เป็ด': 'duck', 'ผีเสื้อ': 'butterfly', 'ผึ้ง': 'bee', 'ฉลาม': 'shark-dorsal-fin-in-water', 'วาฬ': 'whale-tail',
  'คนวิ่ง': 'person-running', 'คนเดิน': 'person-walking', 'คน': 'person-walking', 'ผู้คน': 'people-running', 'นักธนู': 'person-aiming-archery-bow', 'หมอ': 'doctor', 'ตำรวจ': 'police',
  'เรือใบ': 'sailing-ship', 'เรือสำเภา': 'sailing-ship', 'เรือแคนู': 'canoe', 'เรือข้ามฟาก': 'ferry', 'เรือ': 'sailing-ship',
  'รถยนต์': 'car', 'รถบัส': 'bus', 'รถเมล์': 'bus', 'รถบรรทุก': 'truck', 'รถไฟ': 'diesel-train', 'รถไฟความเร็วสูง': 'bullet-train', 'จักรยานยนต์': 'motorcycle', 'มอเตอร์ไซค์': 'motorcycle',
  'จักรยาน': 'bicycle', 'สกูตเตอร์': 'scooter', 'รถ': 'car', 'เครื่องบินรบ': 'fighter-jet-plane', 'เครื่องบิน': 'plane-ascending', 'เฮลิคอปเตอร์': 'helicopter', 'จรวด': 'rocket',
  'ปราสาท': 'castle', 'บ้าน': 'house-with-chimney', 'โรงพยาบาล': 'hospital', 'โรงเรียน': 'school', 'สะพาน': 'bridge', 'หอคอย': 'tower', 'เต็นท์': 'a-frame-tent', 'ถ้ำ': 'cave',
  'ต้นมะพร้าว': 'coconut-palm-tree', 'ต้นปาล์ม': 'palm-tree', 'ต้นไม้': 'broadleaved-tree', 'ภูเขาไฟ': 'volcano', 'ภูเขา': 'mountain', 'ดอกบัว': 'lotus-flower', 'ดอกไม้': 'potted-flower',
  'กองไฟ': 'campfire', 'ไฟ': 'fire', 'พระอาทิตย์': 'sun', 'ดวงอาทิตย์': 'sun', 'ดาว': 'star', 'หิมะ': 'snow', 'ลูกโลก': 'globe', 'โลก': 'globe', 'แผนที่': 'treasure-map',
  'มงกุฎ': 'crown', 'โล่': 'shield', 'ธนู': 'bow-and-arrow', 'ระเบิด': 'cartoon-bomb', 'กะโหลก': 'skull', 'ผี': 'spooky-ghost', 'หัวใจ': 'heart',
  'แอปเปิล': 'apple', 'กล้วย': 'banana', 'กาแฟ': 'coffee', 'ขนมปัง': 'bread', 'ก๋วยเตี๋ยว': 'noodle-bowl-with-steam', 'หนังสือ': 'book', 'โทรศัพท์': 'mobile-phone',
  'หลอดไฟ': 'bulb', 'ไอเดีย': 'bulb', 'เงิน': 'money-hand', 'เหรียญ': 'flat-coin',
  boat: 'sailing-ship', ship: 'sailing-ship', bird: 'bird-flying', man: 'person-walking', woman: 'person-walking', people: 'people-running', plane: 'plane-ascending',
  airplane: 'plane-ascending', train: 'diesel-train', tree: 'broadleaved-tree', idea: 'bulb', fire: 'fire', house: 'house-with-chimney', cat: 'cat-sitting',
};
// subjects the CC0 sets do not have, where a near name would mislead ("tank" → a propane tank, "รถถัง" → a car): no icon
export const NO_ICON = ['รถถัง', 'แมมมอธ', 'มนุษย์ถ้ำ', 'คนป่า', 'คนโบราณ', 'ไดโนเสาร์', 'ทหาร', 'ดาบ', 'หอก', 'ปืน', 'ลิง', 'วัว', 'หมู', 'ไก่', 'งู', 'เสือ', 'จระเข้', 'วัด',
  'tank', 'mammoth', 'caveman', 'cave man', 'dinosaur', 't-rex', 'soldier', 'sword', 'spear', 'gun', 'monkey', 'cow', 'pig', 'chicken', 'snake', 'tiger', 'crocodile', 'temple'];
const norm = s => String(s || '').toLowerCase().trim();
// best icon for a word or phrase (English or Thai); null if nothing is close (never a look-alike stand-in)
export function resolveIcon(q) {
  const icons = iconLibrary().icons, s = norm(q); if (!s) return null;
  if (icons[s]) return s;
  const slug = s.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); if (icons[slug]) return slug;
  for (const k of [...NO_ICON].sort((a, b) => b.length - a.length)) if (/[\u0E00-\u0E7F]/.test(k) ? s.includes(k) : new RegExp(`(^|[^a-z])${k}([^a-z]|$)`).test(s)) return null;
  // Thai: the longest known word inside the phrase (Thai has no spaces between words)
  for (const k of Object.keys(THAI_ICONS).filter(k => /[฀-๿]/.test(k)).sort((a, b) => b.length - a.length)) if (s.includes(k) && icons[THAI_ICONS[k]]) return THAI_ICONS[k];
  const words = s.split(/[^a-z0-9]+/).filter(w => w.length > 2 && !['the', 'and', 'with', 'small', 'big', 'large', 'little', 'old', 'new'].includes(w));
  if (!words.length) return null;
  if (words.length === 1 && THAI_ICONS[words[0]]) return THAI_ICONS[words[0]];   // "bird" means the flying bird, not "bird-and-question-mark"
  // the head noun (the last word) must be in the name; the other words only rank the candidates
  const head = words[words.length - 1]; let best = null, score = 0;
  for (const name of Object.keys(icons)) {
    const parts = name.split('-'); if (!parts.includes(head) && !parts.some(p => head.length > 3 && p.startsWith(head) && p.length - head.length <= 3)) continue;   // "horse" ~ "horses", never "cave" for "caveman"
    let sc = parts.includes(head) ? 4 : 2;
    for (const w of words.slice(0, -1)) if (parts.some(p => p === w || (w.length > 3 && p.startsWith(w.slice(0, -1))))) sc += 2;   // "running" ~ "running", "runs"
    sc -= parts.length * .3;   // prefer the plain name ("horse") over "horse-head-wearing-bridle"
    if (sc > score) { score = sc; best = name; }
  }
  if (best) return best;
  for (const k of Object.keys(THAI_ICONS).filter(k => !/[฀-๿]/.test(k))) if (new RegExp(`\\b${k}\\b`).test(s)) return THAI_ICONS[k];
  return null;
}
export function searchIcons(q, n = 12) {
  const s = norm(q), words = s.split(/[^a-z0-9]+/).filter(w => w.length > 2), out = [];
  for (const name of iconNames()) if (words.some(w => name.split('-').includes(w))) out.push(name);
  const r = resolveIcon(q); return [...new Set([...(r ? [r] : []), ...out.sort((a, b) => a.length - b.length)])].slice(0, n);
}
export function iconData(names) {
  const icons = iconLibrary().icons, out = {};
  for (const n of names) { const I = icons[n]; if (!I) continue; const m = I.body.match(/\sd="([^"]+)"/); if (m) out[n] = { d: m[1], s: I.s }; }
  return out;
}
export const iconsJs = (data, note) => `// GENERATED by tools/lib/icons.mjs${note ? ` (${note})` : ''}. ${ICON_SOURCE}.\n` +
  `Object.assign(window.ICON_PATHS = window.ICON_PATHS || {}, ${JSON.stringify(data)});\n`;

// the committed demo set: common subjects for the gallery, tests and the no-AI layout
export const CORE_ICONS = ['elephant', 'horse-running', 'dog', 'cat-sitting', 'bird-flying', 'fish', 'lion', 'bear', 'person-walking', 'person-running',
  'sailing-ship', 'car', 'bus', 'diesel-train', 'fighter-jet-plane', 'plane-ascending', 'castle', 'house-with-chimney', 'broadleaved-tree', 'campfire', 'globe', 'bulb', 'crown'];

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'search') console.log(searchIcons(rest.join(' ')).join('\n') || '(nothing)');
  else if (cmd === 'core') { mkdirSync(ROOT + 'src/icons', { recursive: true }); const d = iconData(CORE_ICONS);
    writeFileSync(ROOT + 'src/icons/core.js', iconsJs(d, 'core set: node tools/lib/icons.mjs core')); console.log(`src/icons/core.js: ${Object.keys(d).length} icons (missing: ${CORE_ICONS.filter(n => !d[n]).join(', ') || 'none'})`); }
  else console.log('usage: node tools/lib/icons.mjs search <words> | core');
}
