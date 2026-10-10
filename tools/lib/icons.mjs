// tools/lib/icons.mjs: the ICON LIBRARY behind watercolor actors (src/presets/actor.js). 4,134 silhouettes from
// game-icons.net (npm @iconify-json/game-icons, CC BY 3.0: credit "game-icons.net" wherever a video uses them), one
// SVG path each on a 512 × 512 box. Nothing is loaded into pages wholesale: the compiler writes only the icons a story
// uses into its plan folder (icons.js), and src/icons/core.js carries a small committed set for demos and tests.
//   resolveIcon('woolly mammoth') → 'mammoth'      resolveIcon('รถถัง') → 'battle-tank'      (null when nothing fits)
//   iconData(['mammoth', ...]) → { mammoth: { d }, ... }
//   node tools/lib/icons.mjs search <words>        list the best matches (English or Thai)
//   node tools/lib/icons.mjs core                  rebuild src/icons/core.js from CORE_ICONS
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const ICON_CREDIT = 'Icons: game-icons.net (CC BY 3.0, https://game-icons.net, authors Lorc, Delapouite and contributors)';
let LIB = null;
export function iconLibrary() {
  if (LIB) return LIB;
  try { LIB = JSON.parse(readFileSync(createRequire(import.meta.url).resolve('@iconify-json/game-icons/icons.json'), 'utf8')); }
  catch { throw new Error('the icon library is not installed: run "npm install" (package @iconify-json/game-icons)'); }
  return LIB;
}
export const iconNames = () => Object.keys(iconLibrary().icons);

// Thai words (and a few English synonyms) → icon names. The Director writes English nouns; this map lets Thai story
// text (the no-AI test layout, or a Director that answers in Thai) find icons too. First match wins, longest word first.
export const THAI_ICONS = {
  'ช้างแมมมอธ': 'mammoth', 'แมมมอธ': 'mammoth', 'มนุษย์ถ้ำ': 'caveman', 'คนป่า': 'caveman', 'คนโบราณ': 'caveman', 'มนุษย์ยุคหิน': 'caveman',
  'รถถัง': 'battle-tank', 'เรือใบ': 'sailboat', 'เรือประมง': 'fishing-boat', 'เรือกระดาษ': 'paper-boat', 'เรือ': 'sailboat',
  'ช้าง': 'elephant', 'ไดโนเสาร์': 'dinosaur-rex', 'หอก': 'spears', 'กองไฟ': 'campfire', 'ไฟ': 'campfire', 'ไวกิ้ง': 'viking-helmet',
  'ม้า': 'horse-head', 'สุนัข': 'sitting-dog', 'หมา': 'sitting-dog', 'แมว': 'cat', 'นก': 'dove', 'ปลา': 'clownfish', 'วาฬ': 'sperm-whale',
  'เครื่องบิน': 'airplane', 'จรวด': 'rocket', 'รถยนต์': 'city-car', 'รถ': 'city-car', 'รถไฟ': 'steam-locomotive', 'จักรยาน': 'dutch-bike',
  'บ้าน': 'house', 'ปราสาท': 'castle', 'วัด': 'temple-gate', 'ต้นไม้': 'oak', 'ภูเขา': 'mountains', 'พระอาทิตย์': 'sun', 'ดวงจันทร์': 'moon',
  'ดาว': 'star-formation', 'หัวใจ': 'heart-organ', 'เงิน': 'money-stack', 'ทอง': 'gold-bar', 'หนังสือ': 'book-cover', 'นาฬิกา': 'alarm-clock',
  'ดาบ': 'broadsword', 'โล่': 'checked-shield', 'มงกุฎ': 'crown', 'กษัตริย์': 'crown', 'ทหาร': 'brodie-helmet', 'อัศวิน': 'black-knight-helm',
  'ส้ม': 'orange', 'แอปเปิล': 'shiny-apple', 'กล้วย': 'banana', 'กาแฟ': 'coffee-cup', 'ข้าว': 'bowl-of-rice', 'โทรศัพท์': 'smartphone',
  'คอมพิวเตอร์': 'laptop', 'หลอดไฟ': 'light-bulb', 'ไอเดีย': 'light-bulb', 'ลูกโลก': 'world', 'โลก': 'world', 'แผนที่': 'treasure-map',
  'ปืน': 'pistol-gun', 'ระเบิด': 'falling-bomb', 'เต่า': 'turtle', 'กระต่าย': 'rabbit', 'งู': 'snake', 'ลิง': 'monkey', 'หมี': 'bear-head', 'สิงโต': 'lion',
  'เสือ': 'tiger-head', 'วัว': 'cow', 'หมู': 'pig', 'ไก่': 'chicken', 'ผึ้ง': 'bee', 'ผีเสื้อ': 'butterfly', 'ดอกไม้': 'flower-emblem',
  'ฝน': 'raining', 'เมฆ': 'fluffy-cloud', 'ฟ้าผ่า': 'lightning-storm', 'หิมะ': 'snowflake-1', 'คลื่น': 'big-wave', 'ทะเล': 'big-wave',
  'คน': 'person', 'ผู้ชาย': 'person', 'ผู้หญิง': 'woman-elf-face', 'เด็ก': 'person', 'นักบิน': 'plane-pilot', 'หุ่นยนต์': 'robot-golem',
  boat: 'sailboat', ship: 'sailboat', tank: 'battle-tank', car: 'city-car', dog: 'sitting-dog', bird: 'dove', whale: 'sperm-whale',
  caveman: 'caveman', 'cave man': 'caveman', 'woolly mammoth': 'mammoth', plane: 'airplane', train: 'steam-locomotive', tree: 'oak', idea: 'light-bulb',
};
const norm = s => String(s || '').toLowerCase().trim();
// best icon for a word or phrase (English or Thai); null if nothing is close
export function resolveIcon(q) {
  const icons = iconLibrary().icons, s = norm(q); if (!s) return null;
  if (icons[s]) return s;
  const slug = s.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); if (icons[slug]) return slug;
  // Thai: the longest known word inside the phrase (Thai has no spaces between words)
  for (const k of Object.keys(THAI_ICONS).filter(k => /[\u0E00-\u0E7F]/.test(k)).sort((a, b) => b.length - a.length)) if (s.includes(k) && icons[THAI_ICONS[k]]) return THAI_ICONS[k];
  const words = s.split(/[^a-z0-9]+/).filter(w => w.length > 2 && !['the', 'and', 'with', 'small', 'big', 'large', 'little', 'old', 'new'].includes(w));
  if (!words.length) return null;
  const synKeys = Object.keys(THAI_ICONS).filter(k => !/[฀-๿]/.test(k)).sort((a, b) => b.length - a.length);
  if (words.length === 1 && THAI_ICONS[words[0]]) return THAI_ICONS[words[0]];   // "dog" means the dog, not "balloon-dog"
  // the head noun (the last word) must be in the name; the other words only rank the candidates
  const head = words[words.length - 1]; let best = null, score = 0;
  for (const name of Object.keys(icons)) {
    const parts = name.split('-'); if (!parts.includes(head) && !parts.some(p => p.length > 3 && (p.startsWith(head) || head.startsWith(p)))) continue;
    let sc = parts.includes(head) ? 4 : 2;
    for (const w of words.slice(0, -1)) if (parts.includes(w)) sc += 2;
    sc -= parts.length * .3;   // prefer the plain name ("mammoth") over "mammoth-tusk-carving"
    if (sc > score) { score = sc; best = name; }
  }
  if (best) return best;
  for (const k of synKeys) if (new RegExp(`\\b${k}\\b`).test(s)) return THAI_ICONS[k];
  return null;
}
export function searchIcons(q, n = 12) {
  const s = norm(q), words = s.split(/[^a-z0-9]+/).filter(Boolean), out = [];
  for (const name of iconNames()) if (words.some(w => name.includes(w))) out.push(name);
  const r = resolveIcon(q); return [...new Set([...(r ? [r] : []), ...out])].slice(0, n);
}
export function iconData(names) {
  const icons = iconLibrary().icons, out = {};
  for (const n of names) { const b = icons[n]?.body; if (!b) continue; const m = b.match(/\sd="([^"]+)"/); if (m) out[n] = { d: m[1] }; }
  return out;
}
export const iconsJs = (data, note) => `// GENERATED by tools/lib/icons.mjs${note ? ` (${note})` : ''}. ${ICON_CREDIT}\n` +
  `Object.assign(window.ICON_PATHS = window.ICON_PATHS || {}, ${JSON.stringify(data)});\n`;

// the committed demo set: common subjects for the gallery, tests and the no-AI layout
export const CORE_ICONS = ['mammoth', 'caveman', 'battle-tank', 'sailboat', 'fishing-boat', 'elephant', 'dinosaur-rex', 'campfire', 'spears',
  'sitting-dog', 'cat', 'dove', 'clownfish', 'airplane', 'rocket', 'city-car', 'steam-locomotive', 'house', 'oak', 'orange', 'world', 'light-bulb', 'crown', 'person'];

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'search') console.log(searchIcons(rest.join(' ')).join('\n') || '(nothing)');
  else if (cmd === 'core') { mkdirSync(ROOT + 'src/icons', { recursive: true }); const d = iconData(CORE_ICONS);
    writeFileSync(ROOT + 'src/icons/core.js', iconsJs(d, 'core set: node tools/lib/icons.mjs core')); console.log(`src/icons/core.js: ${Object.keys(d).length} icons (missing: ${CORE_ICONS.filter(n => !d[n]).join(', ') || 'none'})`); }
  else console.log('usage: node tools/lib/icons.mjs search <words> | core');
}
