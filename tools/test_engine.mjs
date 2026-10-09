// tools/test_engine.mjs: fast headless checks of shared engine helpers (no frame readback, so it runs in seconds even
// under software GL). Exit code 1 if any check fails.
//   node tools/test_engine.mjs [--chrome=<path>] [--soft-gl]
// Covers: typeOverlay collision-aware layout (subjects), objectTransition / objectTransitionAt (path, morph, draw).
import { launch, openTarget, cleanErrors } from './lib/harness.mjs';

const browser = await launch(), errors = [];
const page = await openTarget(browser, { name: 'type_demo', story: 'type_demo' }, { aspect: '9:16' }, errors);
const results = await page.evaluate(async () => {
  const out = [], ok = (name, pass, info = '') => out.push({ name, pass: !!pass, info });
  const hit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  const item = (y, prefer) => ({ text: 'ทดสอบข้อความ', preset: 'pop', at: 0, y, prefer, maxLines: 1, style: { font: 'display', weight: 800, size: 90 } });
  const subject = { x0: W * .2, x1: W * .8, y0: H * .45, y1: H * .55 };   // a subject across the middle of the frame

  // 1. no subjects: placement is exactly what it was before (y requested)
  let L = typeOverlay({ items: [item(.5)] }), b = TYPE_INFO(.5).items[0];
  ok('layout: without subjects the text stays where asked', Math.abs((b.y0 + b.y1) / 2 - H * .5) < 1, `centre ${((b.y0 + b.y1) / 2).toFixed(0)}`);
  // 2. a subject in the way: the text moves off it, inside the safe area, toward the preferred side
  for (const prefer of ['up', 'down']) {
    L = typeOverlay({ items: [item(.5, prefer)], subjects: () => [subject], duration: 2 }); b = TYPE_INFO(.5).items[0];
    const sa = safeArea('title'), c = (b.y0 + b.y1) / 2;
    ok(`layout: prefer ${prefer} avoids the subject`, !hit(b, subject), `box ${b.y0.toFixed(0)}–${b.y1.toFixed(0)}`);
    ok(`layout: prefer ${prefer} moves ${prefer}`, prefer === 'up' ? c < H * .45 : c > H * .55, `centre ${c.toFixed(0)}`);
    ok(`layout: prefer ${prefer} stays in the title-safe area`, b.y0 >= sa.y0 - 1 && b.y1 <= sa.y1 + 1);
    ok('layout: TYPE_INFO reports the subjects', TYPE_INFO(.5).subjects.length === 1);
  }
  // 3. a subject that only arrives late in the text's life still counts (placed once, for its whole life)
  L = typeOverlay({ items: [{ ...item(.5), out: { at: 1.5 } }], subjects: t => t > 1.2 ? [subject] : [], duration: 2 }); b = TYPE_INFO(.2).items[0];
  ok('layout: a subject arriving later is avoided from the start', !hit(b, subject));

  // 4. objectTransitionAt: starts at from, ends at to, passes the via point region, size follows the morph
  const o = { at: 1, dur: 1, via: [[700, 900]], from: { x: 540, y: 1200, size: 80, shape: 'circle', color: '#E2735A' }, to: { x: 540, y: 700, size: 100, shape: 'star', color: '#EDBE6E' } };
  const p0 = objectTransitionAt(.5, o), p1 = objectTransitionAt(2.5, o), pm = objectTransitionAt(1.5, o);
  ok('transition: before it starts it is at the source', Math.hypot(p0.x - 540, p0.y - 1200) < 1 && p0.size === 80);
  ok('transition: after it ends it is at the target', Math.hypot(p1.x - 540, p1.y - 700) < 1 && Math.abs(p1.size - 100) < 1e-6 && p1.mk === 1);
  ok('transition: the path bends through the via side', pm.x > 560, `mid x ${pm.x.toFixed(0)}`);
  let maxStep = 0, prev = objectTransitionAt(1, o);
  for (let t = 1; t <= 2; t += 1 / 24) { const p = objectTransitionAt(t, o); maxStep = Math.max(maxStep, Math.hypot(p.x - prev.x, p.y - prev.y)); prev = p; }
  ok('transition: continuous motion (no jumps between frames)', maxStep < 60, `max step ${maxStep.toFixed(1)} px/frame`);
  // 5. objectTransition draws without errors and returns the same pose
  let drawn = null, err = '';
  try { push(); drawn = objectTransition(1.5, { ...o, inside: () => {} }); pop(); } catch (e) { err = e.message; }
  ok('transition: draws without errors', drawn && !err && Math.abs(drawn.x - pm.x) < 1e-6, err);
  return out;
});
await browser.close();
let failed = 0;
for (const r of results) { if (!r.pass) failed++; console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.info ? '  (' + r.info + ')' : ''}`); }
const errs = cleanErrors(errors); if (errs.length) { failed++; console.log('page errors:', errs.join(' | ')); }
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
