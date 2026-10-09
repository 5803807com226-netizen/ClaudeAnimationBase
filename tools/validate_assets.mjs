// tools/validate_assets.mjs: checks a collage scene's PNG artwork BEFORE any rendering (pure Node: no browser, seconds).
//   node tools/validate_assets.mjs --story=<id> [--scene=<scene id>] [--only=sun,cloud]
// Reads src/stories/<id>/config.js and its files (the SCENES manifest), then for every layer, in every format the scene
// declares (scene.aspects, default the project's):
//   FAIL  file missing · not a PNG · too small for the closest camera zoom (< 75 % of the pixels needed) · a speckled matte
//         a cut-out with no transparency · an empty image · a full-bleed backdrop that leaves the frame uncovered
//         detached specks outside the artwork (≥ 5) · green contamination (chroma spill; allowGreen: true for green art)
//   WARN  below 100 % of the pixels needed · a cut-out whose artwork touches the image edge (unless edgeOk)
//         1–4 small detached specks · a dark outer rim (a shadow baked into the artwork)
//         a backdrop with transparency · a file name not in lower_snake_case · a file over 15 MB
// Exit code 1 if anything FAILs. The checks live in tools/lib/manifest.mjs (shared with gen_assets.mjs).
import { loadStory, checkLayer, sceneAspects, neededSize } from './lib/manifest.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
if (!args.story) { console.error('usage: node tools/validate_assets.mjs --story=<id> [--scene=<scene id>]'); process.exit(1); }
const { root, project: P, scenes } = loadStory(args.story);
const list = Object.entries(scenes).filter(([k]) => !args.scene || k === args.scene);
if (!list.length) { console.error(`no SCENES found in ${root}`); process.exit(1); }
let fails = 0, warns = 0;
for (const [sid, S] of list) {
  console.log(`scene ${sid}: ${S.layers.length} layers, ${S.duration || 3} s, formats ${sceneAspects(S, P).join(' ')}, assets in ${S.assets || ''}`);
  for (const L of S.layers.filter(L => !args.only || String(args.only).split(',').includes(L.id))) {
    const r = checkLayer(L, S, P); fails += r.fails.length; warns += r.warns.length;
    const ns = neededSize(L, S, P), msgs = [r.info || `(needs ≥ ${ns.px} px ${ns.dim === 'h' ? 'tall' : 'wide'})`, ...r.fails.map(m => 'FAIL  ' + m), ...r.warns.map(m => 'WARN  ' + m)].filter(Boolean);
    console.log(`  ${L.id.padEnd(16)} ${msgs.join('\n' + ' '.repeat(19))}`);
  }
}
console.log(fails ? `\n${fails} FAIL, ${warns} WARN` : `\nall layers PASS${warns ? ` (${warns} WARN)` : ''}`);
process.exit(fails ? 1 : 0);
