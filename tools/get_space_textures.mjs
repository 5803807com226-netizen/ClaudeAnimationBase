// tools/get_space_textures.mjs: download the real surface maps the `planet` preset wraps onto its spheres
// (equirectangular maps from NASA mission data) into assets/space/textures/, check each file is a real image, and
// write assets/space/textures/CREDITS.md. Run it on a machine with internet access (the cloud blocks these hosts):
//   node tools/get_space_textures.mjs            2k maps (enough for a planet up to ~900 px across)
//   node tools/get_space_textures.mjs --hi       8k maps where they exist (close-ups)
//   node tools/get_space_textures.mjs --only=mars,saturn [--force]
//   node tools/get_space_textures.mjs --photos   also the deep-space pictures (black holes, galaxies, nebulae) for
//                                               spacePhoto, from the NASA Image and Video Library (images-api.nasa.gov),
//                                               (a pinned NASA ID, else found by search: check each printed title);
//                                               --photos-only skips the maps
//   node tools/get_space_textures.mjs --search   list the top NASA results (ID, title) for every picture's searches
// Source: Solar System Scope (https://www.solarsystemscope.com/textures/), maps made from NASA mission data
// (Messenger, Magellan, LRO, Viking/MGS, Cassini, Voyager...), license CC BY 4.0: credit it in the video description.
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const DIR = 'assets/space/textures/', BASE = 'https://www.solarsystemscope.com/textures/download/';
// local name ← remote name; hi: an 8k version exists
const MAPS = {
  'sun.jpg': ['sun.jpg', true], 'mercury.jpg': ['mercury.jpg', true], 'venus_atmosphere.jpg': ['venus_atmosphere.jpg', false], 'venus_surface.jpg': ['venus_surface.jpg', true],
  'earth.jpg': ['earth_daymap.jpg', true], 'moon.jpg': ['moon.jpg', true], 'mars.jpg': ['mars.jpg', true], 'jupiter.jpg': ['jupiter.jpg', true],
  'saturn.jpg': ['saturn.jpg', true], 'saturn_ring.png': ['saturn_ring_alpha.png', true], 'uranus.jpg': ['uranus.jpg', false], 'neptune.jpg': ['neptune.jpg', false],
  'milky_way.jpg': ['stars_milky_way.jpg', true],
};
const only = args.only ? String(args.only).split(',') : null;
// deep-space pictures: { id: a pinned NASA ID (checked by eye), q: searches (fallback, and what --search lists), must: words
// the chosen result's title must contain }
const PHOTOS = {
  blackhole_m87: { q: ['M87 black hole Event Horizon Telescope', 'first image of a black hole', 'black hole M87 shadow'], must: ['black hole'] },
  blackhole_sgra: { q: ['Sagittarius A* black hole', 'Sgr A* Event Horizon Telescope', 'black hole Milky Way center image'], must: ['black hole'] },
  blackhole_sim: { q: ['black hole accretion disk visualization', 'black hole illustration accretion disk', 'simulated black hole'], must: ['black hole'] },
  andromeda: { id: 'PIA04921', q: ['Andromeda galaxy'], must: ['Andromeda'] },
  milky_way_center: { q: ['galactic center Chandra Hubble Spitzer', 'Milky Way galactic center infrared', 'center of the Milky Way'], must: ['center'] },
  whirlpool: { q: ['Whirlpool Galaxy Hubble M51', 'M51 Hubble', 'Whirlpool Galaxy'], must: ['Whirlpool'] },
  sombrero: { id: 'PIA15426', q: ['Sombrero Galaxy Hubble', 'Sombrero Galaxy'], must: ['Sombrero'] },
  deep_field: { q: ['Webb First Deep Field SMACS 0723', 'SMACS 0723', 'Hubble Ultra Deep Field'], must: ['Field'] },
  pillars: { q: ['Pillars of Creation Webb', 'Pillars of Creation Hubble', 'Eagle Nebula pillars'], must: ['Pillars'] },
  carina: { id: 'carina_nebula', q: ['Cosmic Cliffs Carina Nebula'], must: ['Carina'] },
  orion: { q: ['Orion Nebula Hubble mosaic', 'Orion Nebula'], must: ['Orion'] },
  crab: { id: 'PIA03606', q: ['Crab Nebula'], must: ['Crab'] },
};
const nasaSearch = async q => ((await (await fetch('https://images-api.nasa.gov/search?media_type=image&q=' + encodeURIComponent(q))).json()).collection.items || []);
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', Referer: 'https://www.solarsystemscope.com/textures/', Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*' };
const wait = ms => new Promise(r => setTimeout(r, ms));
// one image, politely: a pause before each request, three tries with a growing pause, and the server's own words when
// what comes back is not an image (a rate limit or an error page)
async function getImage(url) {
  let why = '';
  for (let k = 0; k < 3; k++) {
    await wait(1500 * (k + 1));
    const r = await fetch(url, { headers: HEADERS }); const b = Buffer.from(await r.arrayBuffer());
    if (r.ok && b.length >= 20000 && isImage(b)) return b;
    why = `HTTP ${r.status}, ${b.length} bytes: ${b.toString('utf8', 0, 160).replace(/\s+/g, ' ')}`;
  }
  throw new Error(why);
}
const isImage = b => (b[0] === 0xFF && b[1] === 0xD8) || (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47);
if (!args['photos-only']) mkdirSync(DIR, { recursive: true });
const done = [], failed = [];
for (const [local, [remote, hi]] of Object.entries(args['photos-only'] ? {} : MAPS)) {
  if (only && !only.some(n => local.startsWith(n))) continue;
  if (existsSync(DIR + local) && !args.force) { console.log(`have   ${local}`); done.push([local, '(kept)']); continue; }
  const url = BASE + (args.hi && hi ? '8k_' : '2k_') + remote;
  try { const b = await getImage(url); writeFileSync(DIR + local, b); console.log(`got    ${local}  ${(b.length / 1e6).toFixed(1)} MB  ← ${url}`); done.push([local, url]); }
  catch (e) { console.log(`FAILED ${local}  ${url}: ${e.message}`); failed.push(local); }
}
if (args.search) {   // list candidates to choose a NASA ID by eye
  for (const [name, P] of Object.entries(PHOTOS)) for (const q of P.q) {
    console.log(`\n### ${name}  q="${q}"`);
    try { for (const i of (await nasaSearch(q)).slice(0, 12)) { const d = i.data?.[0] || {}; console.log(`  ${d.nasa_id}  |  ${d.title}  |  ${d.center || ''} ${d.secondary_creator || d.photographer || ''}`); } }
    catch (e) { console.log('  search failed: ' + e.message); }
  }
  process.exit(0);
}
if (args.photos || args['photos-only']) {
  const PD = 'assets/space/photos/', credits = []; mkdirSync(PD, { recursive: true });
  for (const [name, P] of Object.entries(PHOTOS)) {
    if (only && !only.includes(name)) continue;
    if (existsSync(PD + name + '.jpg') && !args.force) { console.log(`have   ${name}.jpg`); continue; }
    try {
      let it = null;
      if (P.id) it = (await nasaSearch(P.id)).find(i => i.data?.[0]?.nasa_id === P.id);
      for (const q of P.q) { if (it) break; it = (await nasaSearch(q)).find(i => P.must.every(w => (i.data?.[0]?.title || '').toLowerCase().includes(w.toLowerCase()))); }
      if (!it) throw new Error('no result' + (P.id ? ` for ID ${P.id}` : ''));
      const files = await (await fetch(encodeURI(it.href))).json(), want = args.hi ? ['~orig.jpg', '~large.jpg'] : ['~large.jpg', '~orig.jpg', '~medium.jpg'];
      const url = want.map(w => files.find(f => f.toLowerCase().endsWith(w))).find(Boolean); if (!url) throw new Error('no jpg in ' + it.href);
      const b = await getImage(encodeURI(url).replace(/^http:/, 'https:'));
      writeFileSync(PD + name + '.jpg', b); const d = it.data[0];
      console.log(`got    ${name}.jpg  ${(b.length / 1e6).toFixed(1)} MB  "${d.title}" (${d.nasa_id})`);
      credits.push(`- \`${name}.jpg\`: "${d.title}", NASA ID ${d.nasa_id}${d.center ? ', ' + d.center : ''}${d.secondary_creator || d.photographer ? ', ' + (d.secondary_creator || d.photographer) : ''} (${url})`);
    } catch (e) { console.log(`FAILED ${name}: ${e.message}`); failed.push(name); }
  }
  const po = existsSync(PD + 'CREDITS.md') ? readFileSync(PD + 'CREDITS.md', 'utf8') : `# Space photos\n\nNASA Image and Video Library (https://images.nasa.gov). NASA media is generally free of copyright, but some pictures include partners' work (ESA, CSA, STScI, the Event Horizon Telescope Collaboration, CC BY 4.0): credit them as their NASA page says, e.g. "Image: NASA, ESA, CSA, STScI" or "EHT Collaboration".\n\n`;
  writeFileSync(PD + 'CREDITS.md', po + (credits.length ? credits.join('\n') + '\n' : ''));
  console.log(`photos: check each title above is the picture you expect; credits in ${PD}CREDITS.md`);
}
if (!args['photos-only']) {
const old = existsSync(DIR + 'CREDITS.md') ? readFileSync(DIR + 'CREDITS.md', 'utf8') : '';
const lines = done.filter(([, u]) => u !== '(kept)').map(([l, u]) => `- \`${l}\`: ${u}`);
writeFileSync(DIR + 'CREDITS.md', (old || `# Space textures\n\nSolar System Scope (https://www.solarsystemscope.com/textures/), made from NASA mission data. License: CC BY 4.0.\nCredit in the video description: "Planet textures: Solar System Scope (CC BY 4.0), based on NASA data".\n\n`) + (lines.length ? lines.join('\n') + '\n' : ''));
}
console.log(`\n${done.length} ready, ${failed.length} failed${failed.length ? ': ' + failed.join(', ') : ''}. Credits: ${DIR}CREDITS.md`);
process.exit(failed.length ? 1 : 0);
