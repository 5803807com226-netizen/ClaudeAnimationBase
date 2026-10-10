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

  // 6. collage motions (pure state functions)
  const M = (kind, m, t, s0 = {}, L = { id: 'x' }, X = { pts: (L, P) => P }) => { const s = { x: 0, y: 0, rot: 0, scale: 1, opacity: 1, lift: 0, ...s0 }; COLLAGE_MOTIONS[kind].apply(s, t, { ...COLLAGE_MOTIONS[kind].defaults, ...m }, L, X); return s; };
  ok('collage: place starts off the page and lands exactly', M('place', { at: 0, dur: .6, from: 'bottom', dist: 900 }, 0).y === 900 && M('place', { at: 0, dur: .6 }, 2).y === 0);
  ok('collage: pop is hidden before, at full size after', M('pop', { at: 1 }, .5).opacity === 0 && Math.abs(M('pop', { at: 1, dur: .4 }, 2).scale - 1) < 1e-9);
  ok('collage: wipe crops while running, whole after', M('wipe', { at: 0, dur: 1 }, .5).crop?.k > 0 && !M('wipe', { at: 0, dur: 1 }, 1.5).crop);
  const fl = [0, 1, 2, 3, 4, 5].map(i => M('appear', { at: 1, flutter: 2, rate: 12 }, 1 + i / 12 + .01).opacity);
  ok('collage: appear flickers on, off, on, off, then stays', M('appear', { at: 1 }, .9).opacity === 0 && fl.join('') === '101011', fl.join(''));
  const vn = [0, 1, 2, 3, 4].map(i => M('vanish', { at: 1, flutter: 2, rate: 12 }, 1 + i / 12 + .01).opacity);
  ok('collage: vanish is the reverse of appear', M('vanish', { at: 1 }, .9).opacity === 1 && vn.join('') === '01010', vn.join(''));
  const X = { sizeOf: () => [100, 100], pts: (L, P) => P }, path = [[0, 0], [300, 0], [300, 400]];
  const r0 = M('roll', { at: 0, dur: 2, path, ease: 'linear' }, 0, {}, { id: 'r' }, X), r1 = M('roll', { at: 0, dur: 2, path, ease: 'linear' }, 2, {}, { id: 'r' }, X), rh = M('roll', { at: 0, dur: 2, path, ease: 'linear' }, 1, {}, { id: 'r' }, X);
  ok('collage: roll runs the whole path, spinning by distance', r0.x === 0 && r1.x === 300 && r1.y === 400 && Math.abs(rh.rot - 350 / 50 * 180 / Math.PI) < 1e-6, `end ${r1.x},${r1.y} rot@1s ${rh.rot.toFixed(1)}`);
  const tgt = { x: 500, y: 600, rot: 0, opacity: 1, lift: 0 }, F = { stateById: () => tgt, layerById: () => ({ rot: 0 }) };
  const f = M('follow', { target: 't', grip: [10, -20] }, 1, {}, { id: 'h' }, F);
  ok('collage: follow rides on its target with the grip offset', f.x === 510 && f.y === 580);
  ok('collage: leave is gone after its exit', M('leave', { at: 0, dur: .5 }, 1).opacity === 0 && M('leave', { at: 1 }, .5).y === 0);
  ok('collage: walk advances at its speed', Math.abs(M('walk', { at: 0, speed: 100 }, 2).x - 200) < 1e-9);
  ok('collage: drop falls from its height, lands and bounces lower each time', (() => {
    const y = tt => M('drop', { at: 0, height: 900, gravity: 5200, bounce: .32, bounces: 2 }, tt).y, t1 = Math.sqrt(2 * 900 / 5200);
    const peak1 = Math.min(...[...Array(40)].map((_, i) => y(t1 + i * .005)));
    return Math.abs(y(0) + 900) < 1e-6 && Math.abs(y(t1)) < 1 && peak1 < -10 && peak1 > -900 * .32 * .32 - 1 && Math.abs(y(3)) < 1e-6;
  })());
  ok('collage: swing settles to rest', Math.abs(M('swing', { at: 0, amp: 30 }, 0).rot - 30) < 1e-6 && Math.abs(M('swing', { at: 0, amp: 30 }, 4).rot) < .01);
  const cyc = t => [0, 1, 2].map(i => M('cycle', { index: i, count: 3, fps: 6, pingpong: true }, t).opacity).join('');
  ok('collage: cycle shows exactly one frame at a time, ping-pong', ['100', '010', '001', '010', '100'].every((f, i) => cyc(i / 6 + .01) === f), [0, 1, 2, 3, 4].map(i => cyc(i / 6 + .01)).join(' '));
  const fl0 = M('fly', { at: 1, dur: 1, path: [[0, 0], [100, 0], [200, 100]], orient: true, scaleTo: .5 }, .5, { x: 7, y: 8 });
  const fl1 = M('fly', { at: 1, dur: 1, path: [[0, 0], [100, 0], [200, 100]], orient: true, scaleTo: .5 }, 2.5);
  ok('collage: fly keeps its pose before it sets off, ends on the path end at scaleTo', fl0.x === 7 && fl0.rot === 0 && Math.hypot(fl1.x - 200, fl1.y - 100) < 1e-6 && Math.abs(fl1.scale - .5) < 1e-9);
  const sp = smoothPath([[0, 0], [100, 50], [200, 0], [300, 80]]);
  ok('collage: a smoothed path passes through every given point', [[0, 0], [100, 50], [200, 0], [300, 80]].every(p => sp.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-6)));
  ok('collage: slam is hidden before, at size after its shake', M('slam', { at: 1 }, .5).opacity === 0 && Math.abs(M('slam', { at: 1, dur: .16 }, 2).scale - 1) < 1e-9 && M('slam', { at: 1 }, 2).x === 0);
  const camS = cameraKeys([[0, 0, 0, 1], [1, 100, 0, 1, 'smooth'], [2, 300, 0, 1, 'smooth']]), vx = (a, b) => (camS(b)[0] - camS(a)[0]) / (b - a);
  ok('camera: smooth keys carry the velocity through a key (no jerk)', Math.abs(vx(.999, 1) - vx(1, 1.001)) < 1 && Math.abs(camS(1)[0] - 100) < 1e-6 && Math.abs(vx(1.999, 2)) < 2, `${vx(.999, 1).toFixed(1)} vs ${vx(1, 1.001).toFixed(1)}`);
  ok('collage: every motion is in the capability catalog', Object.keys(COLLAGE_MOTIONS).every(n => CAPABILITY_CATALOG().some(c => c.id === 'collage.' + n)));
  return out;
});
await browser.close();
let failed = 0;
for (const r of results) { if (!r.pass) failed++; console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.info ? '  (' + r.info + ')' : ''}`); }
const errs = cleanErrors(errors); if (errs.length) { failed++; console.log('page errors:', errs.join(' | ')); }
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
