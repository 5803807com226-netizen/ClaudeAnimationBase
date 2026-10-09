// tools/look_test.mjs: the visual-quality regression test for src/look.js. For each target it renders a few LOW-RES
// frames with the original finish ('classic', the BEFORE column) and with each style under test (AFTER columns), writes
// a before/after contact sheet and checks every frame:
//   - page errors                                                                  → FAIL
//   - more than 4 % of the frame crushed to black or blown to white (and worse than before) → FAIL
//   - the character's colours shift too far from the original (identity)           → FAIL > 60, NEEDS_REVIEW > 38 (RGB distance)
//   - the character or text leaves the safe area (e.g. under letterbox bars)       → FAIL
//   - flat, low-contrast frame (luma σ < 12)                                       → NEEDS_REVIEW
//   - the character separates from its surroundings much less than before         → NEEDS_REVIEW
// Every load and frame has a time limit. Output: out/look/<target>_<aspect>.jpg, out/look/report.md / report.json.
//
//   node tools/look_test.mjs [--only=phase2_lumo] [--looks=classic,cinematic] [--aspect=9:16] [--frames=2] [--w=200]
//                            [--frame-timeout=30 (s)] [--chrome=<path>] [--soft-gl] [--verbose]
import { mkdirSync, writeFileSync } from 'node:fs';
import { args, launch, openTarget, probe, writeSheet, cleanErrors } from './lib/harness.mjs';

const OUT = 'out/look', CELL = +(args.w || 200);
const TARGETS = [
  { name: 'phase2_lumo', story: 'phase2_lumo', times: [2.6, 4.4, 6.4], looks: ['classic', 'watercolor', 'cinematic'] },
  { name: 'phase1_demo', story: 'phase1_demo', times: [2.4, 4.2, 6], looks: ['classic', 'illustration', 'documentary'] },
  { name: 'look_infographic', story: 'look_infographic', times: [2.4, 3.6], looks: ['classic', 'infographic', 'abstract'] },
  { name: 'type_demo', story: 'type_demo', times: [3.6, 4.6], looks: ['classic', 'infographic', 'collage'] },
];
const only = args.only ? String(args.only).split(',') : null;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const sep = s => s && s.inner && s.ring ? Math.abs(s.inner.lum - s.ring.lum) + .5 * dist(s.inner.mean, s.ring.mean) : null;
const fmt = b => `[${[b.x0, b.y0, b.x1, b.y1].map(v => Math.round(v)).join(',')}]`;

function check(r, base, t) {
  const fails = [], review = [], f = r.frame, clip = f.lo + f.hi, clip0 = base ? base.frame.lo + base.frame.hi : 0;
  if (clip > .04 && clip > clip0 + .01) fails.push(`${t}s: ${(clip * 100).toFixed(1)} % of the frame crushed or blown (before: ${(clip0 * 100).toFixed(1)} %)`);
  if (f.lsd < 12) review.push(`${t}s: flat frame (luma σ ${f.lsd.toFixed(1)})`);
  if (base && r.subject?.inner && base.subject?.inner) {
    const d = dist(r.subject.inner.mean, base.subject.inner.mean);
    if (d > 60) fails.push(`${t}s: character colours shift by ${d.toFixed(0)} (identity)`); else if (d > 38) review.push(`${t}s: character colours shift by ${d.toFixed(0)}`);
    const s0 = sep(base.subject), s1 = sep(r.subject);
    if (s0 > 10 && s1 < s0 * .7) review.push(`${t}s: character separation ${s1.toFixed(0)} vs ${s0.toFixed(0)} before`);
  }
  const tol = 4 * Math.min(r.W, r.H) / 1080, out = (b, s) => b.x0 < s.x0 - tol || b.y0 < s.y0 - tol || b.x1 > s.x1 + tol || b.y1 > s.y1 + tol;
  for (const a of r.stage?.actors || []) if (out(a, r.stage.safe)) fails.push(`${t}s: character ${fmt(a)} outside the safe area ${fmt(r.stage.safe)}`);
  for (const it of r.type?.items || []) if (out(it, r.type.safe)) fails.push(`${t}s: text "${it.id}" outside the safe area`);
  return { fails, review, metrics: { lum: +f.lum.toFixed(1), contrast: +f.lsd.toFixed(1), sat: +f.sat.toFixed(3), clip: +(clip * 100).toFixed(2), separation: r.subject ? +(sep(r.subject) ?? 0).toFixed(1) : null } };
}

const browser = await launch(); mkdirSync(OUT, { recursive: true });
const report = [];
for (const T of TARGETS.filter(x => !only || only.includes(x.name))) {
  const looks = args.looks ? String(args.looks).split(',') : T.looks, cols = {}, base = [];
  if (looks[0] !== 'classic') looks.unshift('classic');   // the BEFORE column is always the original finish
  for (const L of looks) {
    const res = { target: T.name, look: L, aspect: args.aspect || 'own', status: 'PASS', fails: [], review: [], errors: [], metrics: [] };
    let page = null;
    try {
      page = await openTarget(browser, T, { aspect: args.aspect, look: L }, res.errors);
      cols[L === 'classic' ? 'before (classic)' : L] = [];
      for (const [i, t] of T.times.slice(0, +(args.frames || 99)).entries()) {
        const t0 = Date.now(), r = await probe(page, t, CELL);
        if (args.verbose) console.log(`  ${T.name} ${L} ${t}s  ${Date.now() - t0} ms`);
        if (r.look !== L) res.fails.push(`page reports look ${r.look}, expected ${L}`);
        if (L === 'classic') base[i] = r;
        const c = check(r, L === 'classic' ? null : base[i], t);
        res.fails.push(...c.fails); res.review.push(...c.review); res.metrics.push({ t, ...c.metrics });
        cols[L === 'classic' ? 'before (classic)' : L].push(r);
      }
    } catch (e) { res.errors.push(e.message); }
    if (page) await page.close();
    res.errors = cleanErrors(res.errors);
    if (res.errors.length || res.fails.length) res.status = 'FAIL'; else if (res.review.length) res.status = 'NEEDS_REVIEW';
    report.push(res);
    const m = res.metrics[0] || {};
    console.log(`${T.name.padEnd(18)} ${L.padEnd(13)} ${res.status.padEnd(12)} contrast ${m.contrast}  sat ${m.sat}  clip ${m.clip}%${m.separation != null ? '  sep ' + m.separation : ''}${[...res.errors, ...res.fails, ...res.review].slice(0, 3).map(x => '\n    ' + x).join('')}`);
  }
  await writeSheet(browser, `${OUT}/${T.name}_${(args.aspect || 'own').replace(':', 'x')}.jpg`, cols, CELL);
}
await browser.close();
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
const md = ['| target | look | status | contrast | saturation | clipped % | separation |', '|---|---|---|---|---|---|---|',
  ...report.map(r => { const m = r.metrics[0] || {}; return `| ${r.target} | ${r.look} | ${r.status} | ${m.contrast ?? ''} | ${m.sat ?? ''} | ${m.clip ?? ''} | ${m.separation ?? ''} |`; })];
writeFileSync(`${OUT}/report.md`, md.join('\n') + '\n');
console.log('\n' + md.join('\n') + `\nsheets and report: ${OUT}/`);
process.exit(report.some(r => r.status === 'FAIL') ? 1 : 0);
