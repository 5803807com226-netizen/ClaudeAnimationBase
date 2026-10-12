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
// the same Solar System Scope maps (CC BY 4.0) as copied to Wikimedia Commons: the site itself answers scripts with a captcha
const COMMONS = f => 'https://commons.wikimedia.org/wiki/Special:FilePath/Solarsystemscope_texture_' + f;
// local name ← remote name; hi: an 8k version exists
const MAPS = {
  'sun.jpg': ['sun.jpg', true], 'mercury.jpg': ['mercury.jpg', true], 'venus_atmosphere.jpg': ['venus_atmosphere.jpg', false], 'venus_surface.jpg': ['venus_surface.jpg', true],
  'earth.jpg': ['earth_daymap.jpg', true], 'moon.jpg': ['moon.jpg', true], 'mars.jpg': ['mars.jpg', true], 'jupiter.jpg': ['jupiter.jpg', true],
  'saturn.jpg': ['saturn.jpg', true], 'saturn_ring.png': ['saturn_ring_alpha.png', true], 'uranus.jpg': ['uranus.jpg', false], 'neptune.jpg': ['neptune.jpg', false],
  'milky_way.jpg': ['stars_milky_way.jpg', true],
};
// public-domain NASA fallbacks where one is known
const MAP_ALT = { 'moon.jpg': ['https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_poles_1k.jpg'], 'saturn_ring.png': [COMMONS('8k_saturn_ring_alpha.png'), 'https://commons.wikimedia.org/wiki/Special:FilePath/Solarsystemscope_texture_8k_saturn_ring_alpha.png?width=2048'] };
const only = args.only ? String(args.only).split(',') : null;
// deep-space pictures: { id: a pinned NASA ID (checked by eye), q: searches (fallback, and what --search lists), must: words
// the chosen result's title must contain }
const PHOTOS = {
  // the Event Horizon Telescope images are ESO releases, not in NASA's library: direct, with their credit
  blackhole_m87: { url: 'https://cdn.eso.org/images/large/eso1907a.jpg', title: 'The first image of a black hole: M87* (Event Horizon Telescope, 2019)', credit: 'EHT Collaboration (CC BY 4.0)', q: [] },
  blackhole_sgra: { url: 'https://cdn.eso.org/images/large/eso2208-eht-mwa.jpg', title: 'Sagittarius A*, the black hole at the centre of the Milky Way (Event Horizon Telescope, 2022)', credit: 'EHT Collaboration (CC BY 4.0)', q: [] },
  blackhole_sim: { id: 'GSFC_20171208_Archive_e000984', q: ['black hole illustration'], must: ['black hole'] },   // an artist's illustration: a black hole among dense stars
  andromeda: { id: 'PIA04921', q: ['Andromeda galaxy'], must: ['Andromeda'] },
  milky_way_center: { id: 'PIA12348', q: ['galactic center Chandra Hubble Spitzer'], must: ['Milky Way'] },
  whirlpool: { id: 'GSFC_20171208_Archive_e001925', q: ['Whirlpool Galaxy Hubble M51'], must: ['Whirlpool'] },
  sombrero: { id: 'PIA15426', q: ['Sombrero Galaxy'], must: ['Sombrero'] },
  deep_field: { id: 'webb_first_deep_field', q: ['SMACS 0723'], must: ['deep_field'] },
  pillars: { id: 'GSFC_20171208_Archive_e000842', q: ['Pillars of Creation Hubble'], must: ['Pillars'] },
  carina: { id: 'carina_nebula', q: ['Cosmic Cliffs Carina Nebula'], must: ['Carina'] },
  orion: { id: 'PIA04227', q: ['Orion Nebula'], must: ['Orion'] },
  crab: { id: 'PIA03606', q: ['Crab Nebula'], must: ['Crab'] },
};
const nasaSearch = async q => ((await (await fetch('https://images-api.nasa.gov/search?media_type=image&q=' + encodeURIComponent(q))).json()).collection.items || []);
// an honest, identifying User-Agent (Wikimedia asks for one)
const HEADERS = { 'User-Agent': 'ClaudeAnimationBase-space-assets/1.0 (https://github.com/5803807com226-netizen/ClaudeAnimationBase; one-time download of CC BY / public-domain space images)', Accept: 'image/png,image/jpeg,*/*' };
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
  const res = args.hi && hi ? '8k_' : '2k_', urls = [COMMONS(res + remote), ...(res === '8k_' ? [COMMONS('2k_' + remote)] : []), BASE + res + remote, ...(MAP_ALT[local] || [])];
  let ok = false, why = [];
  for (const url of urls) {
    try { const b = await getImage(url); writeFileSync(DIR + local, b); console.log(`got    ${local}  ${(b.length / 1e6).toFixed(1)} MB  ← ${url}`); done.push([local, url]); ok = true; break; }
    catch (e) { why.push(`${url}: ${e.message.slice(0, 120)}`); }
  }
  if (!ok) { console.log(`FAILED ${local}\n         ${why.join('\n         ')}`); failed.push(local); }
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
      if (P.url) {   // a direct release image
        const b = await getImage(P.url); writeFileSync(PD + name + '.jpg', b);
        console.log(`got    ${name}.jpg  ${(b.length / 1e6).toFixed(1)} MB  "${P.title}" ← ${P.url}`); credits.push(`- \`${name}.jpg\`: "${P.title}", ${P.credit} (${P.url})`); continue;
      }
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
