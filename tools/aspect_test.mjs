// tools/aspect_test.mjs: the multi-aspect regression test. Renders a few LOW-RES frames of each target at 9:16, 16:9
// and 4:5 in one headless Chrome, writes a side-by-side comparison sheet per target and runs automatic checks:
//   - page errors while loading or drawing                                   → FAIL
//   - the followed character's box outside the action-safe area (STAGE_INFO) → FAIL
//   - a text block outside the frame / the title-safe area (TYPE_INFO)       → FAIL
//   - a text block overlapping a declared subject (typeOverlay subjects)     → FAIL
//   - a flat, light band along an edge (probably uncovered paper/canvas)    → NEEDS_REVIEW
//   - letterbox / black bars (the frame must fill edge to edge)              → FAIL (unless --letterbox)
// Every page load and frame has an explicit timeout; nothing waits without a limit.
//
//   node tools/aspect_test.mjs [--only=phase2_lumo,preset_popBounce] [--aspects=9:16,4:5] [--frames=2] [--w=180]
//                              [--look=<style>] [--assets=<dir> (collage scenes: artwork from another folder)] [--footage=<dir with {name}> (footage plates from another folder)] [--frame-timeout=30 (s)] [--chrome=<path>] [--soft-gl] [--verbose]
// Output: out/aspect/<target>.jpg (columns: 9:16 · 16:9 · 4:5, rows: times) and out/aspect/report.json / report.md.
// Exit code 1 if any target FAILs.
import { mkdirSync, writeFileSync } from 'node:fs';
import { args, launch, openTarget, probe, writeSheet, cleanErrors, barCheck } from './lib/harness.mjs';

const ASPECTS = args.aspects ? String(args.aspects).split(',') : ['9:16', '16:9', '4:5'], OUT = 'out/aspect';
// Targets: story id or studio loop, and the times to check (a few per target, spread over its length).
const TARGETS = [
  { name: 'phase2_lumo', story: 'phase2_lumo', times: [.8, 2.6, 4.4, 6.4] },
  { name: 'phase1_demo', story: 'phase1_demo', times: [.8, 2.4, 4.2, 6] },
  { name: 'type_demo', story: 'type_demo', times: [.6, 1.6, 2.6, 3.6, 4.6] },
  // karaoke subtitles (type preset 'subtitle'): one short line, one long line that wraps
  { name: 'subtitle_demo', story: 'subtitle_demo', times: [1.0, 3.2] },
  { name: 'look_infographic', story: 'look_infographic', times: [2.4, .6, 3.6] },
  { name: 'collage_test', story: 'collage_test', times: [1.8, .5, 2.95] },
  { name: 'pilot_collage', story: 'pilot_collage', times: [2.4, .6, 1.3, 2.95] },
  // collage motion kit (COLLAGE_MOTIONS, reel transitions, type label / stamp): the collage_reel story is its fixture
  // (artwork: --assets=out/mock_assets/collage_reel/ after gen_assets --mock --out=… in the cloud; the real art locally)
  { name: 'collage_reel', story: 'collage_reel', times: [1.9, 3.5, 5.6, 7.75, 9.8, 13.6] },
  // the rest of the kit (drop, slam, shake, swing, pulse, fly, orbit, flutter, cycle, spin; tear, iris, whip, fade, cut; cutout)
  { name: 'collage_kit', story: 'collage_kit', times: [1.5, 2.8, 4.2, 5.4, 6.6, 7.85, 9.2, 10.4, 12.3, 13.0, 14.4] },
  // a compiled collage plan (collage.layer + motions, transition_in, type layers): compile first, for each format:
  // node tools/compile_plan.mjs --manifest=tools/fixtures/plans/collage_demo.json [--aspect=16:9]
  { name: 'plan_collage', story: '_plan_collage_demo', byAspect: { '16:9': '_plan_collage_demo_16x9' }, times: [1.6, 3.2, 4.6, 6.2, 8.6] },
  // mixed media: cartoon stickers + doodle FX over live-action plates (footage space, tracking). Cloud: test plates via
  // --footage=out/plates/{name}/ and mock art via --assets=out/mock_assets/doodle_footage/
  { name: 'doodle_footage', story: 'doodle_footage', times: [.6, 1.5, 3.4, 4.5, 6.9, 8.5, 10.5] },
  { name: 'story_pilot_v4', story: 'story_pilot_v4', times: [0, 1.5, 2.8, 4.9, 8.6, 9.6, 12, 14.96] },
  // map capabilities (mapView, mapBase, routeDraw, mapMarker, mapLabel): the compiled Magellan prototype plan is their
  // fixture. Compile first: node tools/compile_plan.mjs --manifest=tools/fixtures/plans/magellan_proto.json --allow-experimental
  { name: 'map_proto', story: '_plan_magellan_proto', times: [.2, 3, 7, 10] },
  // mapRegion, mapSprite, captionBar, mapBase 'satellite', mapView blur, routeDraw glow: the style-test plan is their fixture
  // (compile: node tools/compile_plan.mjs --manifest=tools/fixtures/plans/magellan_style.json --allow-experimental)
  { name: 'map_style', story: '_plan_magellan_style', times: [1.5, 7.2, 12] },
  ...['cameraMove', 'popBounce', 'shapeMorph', 'brushWipe', 'objectReveal', 'particleBurst'].map(p => ({ name: 'preset_' + p, loop: 'preset_' + p, times: [.4, 1.4, 2.6] })),
  // infographic kit: the final frame of the build (values counted up, labels placed) is the one that must fit
  ...['barChart', 'lineChart', 'donutChart', 'timeline', 'iconGrid', 'callout'].map(p => ({ name: 'preset_' + p, loop: 'preset_' + p, times: [.9, 2.6] })),
];
const only = args.only ? String(args.only).split(',') : null;
const browser = await launch();
mkdirSync(OUT, { recursive: true });

function check(r, t) {
  const fails = [], review = [], tol = 4 * Math.min(r.W, r.H) / 1080;
  const out = (b, s) => b.x0 < s.x0 - tol || b.y0 < s.y0 - tol || b.x1 > s.x1 + tol || b.y1 > s.y1 + tol;
  for (const a of r.stage?.actors || []) if (out(a, r.stage.safe)) fails.push(`${t}s: character box ${fmt(a)} leaves the action-safe area ${fmt(r.stage.safe)}`);
  for (const it of r.type?.items || []) {
    if (out(it, { x0: 0, y0: 0, x1: r.W, y1: r.H })) fails.push(`${t}s: text "${it.id}" ${fmt(it)} overflows the frame`);
    else if (out(it, it.safeBox || r.type.safe)) fails.push(`${t}s: text "${it.id}" ${fmt(it)} leaves the ${it.safe || 'title'}-safe area ${fmt(it.safeBox || r.type.safe)}`);
    if (!it.overlay) for (const s of r.type.subjects || []) if (it.x0 < s.x1 && it.x1 > s.x0 && it.y0 < s.y1 && it.y1 > s.y0) fails.push(`${t}s: text "${it.id}" ${fmt(it)} overlaps a subject ${fmt(s)}`);
  }
  const items = r.type?.items || [];   // text never overlaps other text on screen at the same moment
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) { const a = items[i], b = items[j];
    if (a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0) fails.push(`${t}s: text "${a.id}" overlaps text "${b.id}"`); }
  // a flat AND light band looks like bare paper / an empty canvas; smooth dark skies are fine
  // (a look with no texture, e.g. infographic, is meant to be flat)
  if (!r.clean) for (const [e, { sd, lum }] of Object.entries(r.edges)) if (sd < 1.2 && lum > 200) review.push(`${t}s: flat light ${e} edge (σ ${sd.toFixed(1)}, lum ${lum.toFixed(0)}): uncovered background?`);
  fails.push(...barCheck(r, t, !!args.letterbox));   // every frame full-bleed unless --letterbox says bars are intended
  return { fails, review };
}
const fmt = b => `[${[b.x0, b.y0, b.x1, b.y1].map(v => Math.round(v)).join(',')}]`;

const report = [];
for (const T of TARGETS.filter(x => !only || only.includes(x.name))) {
  const row = { name: T.name, aspects: {} }, cells = {};
  for (const A of ASPECTS) {
    const res = { status: 'PASS', fails: [], review: [], errors: [] };
    let page = null;
    try {
      page = await openTarget(browser, T, { aspect: A, look: args.look, assets: args.assets, footage: args.footage }, res.errors);
      cells[A] = [];
      for (const t of T.times.slice(0, +(args.frames || 99))) {
        const t0 = Date.now(), r = await probe(page, t);
        if (args.verbose) console.log(`  ${T.name} ${A} ${t}s  ${Date.now() - t0} ms`);
        if (r.aspect !== A) res.fails.push(`page reports aspect ${r.aspect}, expected ${A}`);
        const c = check(r, t); res.fails.push(...c.fails); res.review.push(...c.review); cells[A].push(r);
      }
    } catch (e) { res.errors.push(e.message); }
    if (page) await page.close();
    res.errors = cleanErrors(res.errors);
    if (res.errors.length || res.fails.length) res.status = 'FAIL'; else if (res.review.length) res.status = 'NEEDS_REVIEW';
    row.aspects[A] = res;
    console.log(`${T.name.padEnd(22)} ${A.padEnd(5)} ${res.status}${[...res.errors, ...res.fails, ...res.review].slice(0, 3).map(m => '\n    ' + m).join('')}`);
  }
  await writeSheet(browser, `${OUT}/${T.name}.jpg`, cells);
  report.push(row);
}
await browser.close();
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
const md = ['| target | ' + ASPECTS.join(' | ') + ' |', '|---|' + ASPECTS.map(() => '---').join('|') + '|',
  ...report.map(r => `| ${r.name} | ${ASPECTS.map(a => r.aspects[a].status).join(' | ')} |`)];
writeFileSync(`${OUT}/report.md`, md.join('\n') + '\n');
console.log('\n' + md.join('\n') + `\nsheets and report: ${OUT}/`);
process.exit(report.some(r => ASPECTS.some(a => r.aspects[a].status === 'FAIL')) ? 1 : 0);
