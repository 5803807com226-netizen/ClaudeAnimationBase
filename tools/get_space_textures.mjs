// tools/get_space_textures.mjs: download the real surface maps the `planet` preset wraps onto its spheres
// (equirectangular maps from NASA mission data) into assets/space/textures/, check each file is a real image, and
// write assets/space/textures/CREDITS.md. Run it on a machine with internet access (the cloud blocks these hosts):
//   node tools/get_space_textures.mjs            2k maps (enough for a planet up to ~900 px across)
//   node tools/get_space_textures.mjs --hi       8k maps where they exist (close-ups)
//   node tools/get_space_textures.mjs --only=mars,saturn [--force]
//   node tools/get_space_textures.mjs --photos   also the deep-space pictures (black holes, galaxies, nebulae) for
//                                               spacePhoto, from the NASA Image and Video Library (images-api.nasa.gov),
//                                               found by search: check each printed title; --photos-only skips the maps
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
// deep-space pictures: a search, and words the chosen result's title must contain (the first match is taken)
const PHOTOS = {
  blackhole_m87: ['M87 black hole Event Horizon Telescope', ['M87']], blackhole_sgra: ['Sagittarius A* black hole Event Horizon Telescope', ['Sagittarius']],
  blackhole_sim: ['black hole accretion disk visualization', ['black hole']], andromeda: ['Andromeda galaxy', ['Andromeda']],
  milky_way_center: ['Milky Way galactic center', ['center']], whirlpool: ['Whirlpool Galaxy M51', ['Whirlpool']], sombrero: ['Sombrero Galaxy', ['Sombrero']],
  deep_field: ['Webb First Deep Field', ['Deep Field']], pillars: ['Pillars of Creation', ['Pillars']], carina: ['Cosmic Cliffs Carina Nebula', ['Carina']],
  orion: ['Orion Nebula', ['Orion']], crab: ['Crab Nebula', ['Crab']],
};
const isImage = b => (b[0] === 0xFF && b[1] === 0xD8) || (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47);
if (!args['photos-only']) mkdirSync(DIR, { recursive: true });
const done = [], failed = [];
for (const [local, [remote, hi]] of Object.entries(args['photos-only'] ? {} : MAPS)) {
  if (only && !only.some(n => local.startsWith(n))) continue;
  if (existsSync(DIR + local) && !args.force) { console.log(`have   ${local}`); done.push([local, '(kept)']); continue; }
  const url = BASE + (args.hi && hi ? '8k_' : '2k_') + remote;
  try {
    const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const b = Buffer.from(await r.arrayBuffer()); if (b.length < 20000 || !isImage(b)) throw new Error(`not an image (${b.length} bytes)`);
    writeFileSync(DIR + local, b); console.log(`got    ${local}  ${(b.length / 1e6).toFixed(1)} MB  ← ${url}`); done.push([local, url]);
  } catch (e) { console.log(`FAILED ${local}  ${url}: ${e.message}`); failed.push(local); }
}
if (args.photos || args['photos-only']) {
  const PD = 'assets/space/photos/', credits = []; mkdirSync(PD, { recursive: true });
  for (const [name, [query, must]] of Object.entries(PHOTOS)) {
    if (only && !only.includes(name)) continue;
    if (existsSync(PD + name + '.jpg') && !args.force) { console.log(`have   ${name}.jpg`); continue; }
    try {
      const r = await fetch('https://images-api.nasa.gov/search?media_type=image&q=' + encodeURIComponent(query)); if (!r.ok) throw new Error(`search HTTP ${r.status}`);
      const items = (await r.json()).collection.items || [], it = items.find(i => must.every(w => (i.data?.[0]?.title || '').toLowerCase().includes(w.toLowerCase()))) || items[0];
      if (!it) throw new Error('no result');
      const files = await (await fetch(encodeURI(it.href))).json(), want = args.hi ? ['~orig.jpg', '~large.jpg'] : ['~large.jpg', '~orig.jpg', '~medium.jpg'];
      const url = want.map(w => files.find(f => f.toLowerCase().endsWith(w))).find(Boolean); if (!url) throw new Error('no jpg in ' + it.href);
      const b = Buffer.from(await (await fetch(encodeURI(url).replace(/^http:/, 'https:'))).arrayBuffer()); if (b.length < 20000 || !isImage(b)) throw new Error(`not an image (${b.length} bytes)`);
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
