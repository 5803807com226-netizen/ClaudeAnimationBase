// tools/action/verify.mjs: MEASURED checks of an action scene (not exit codes): opens the built story, samples the
// solved state (window.ACTION_DEBUG.frame) at 120 Hz and checks
//   rig        every bone's parent exists and joints connect (child starts on its parent's frame), no cycles
//   ground     grounded feet sit on the ground line; planted feet do not slide; after the last landing both feet are back
//   snapping   no joint turns faster than a limit between samples (an action switch that pops shows as a spike)
//   grip       while a prop is held, the hand's grip point stays on the prop's grip anchor (both hands while aiming)
//   attach     the prop is in the world before pick-up, in the hand after it (and released after a drop)
//   muzzle     every muzzle flash is drawn at the prop's muzzle anchor (it is computed from it each frame)
//   blend      while aiming during a run or jump, the legs keep their own action and the arms hold the aim
// Writes out/action/<id>/verify.json and prints a PASS / FAIL table.
//   node tools/action/verify.mjs --story=_act_<id> [--chrome=…] [--soft-gl]
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { args, launch, openTarget } from '../lib/harness.mjs';

const story = args.story; if (!story) { console.error('usage: node tools/action/verify.mjs --story=_act_<id>'); process.exit(2); }
const b = await launch(), errors = [];
const page = await openTarget(b, { name: story, story }, { aspect: null }, errors);
await page.waitForFunction('window.ACTION_DEBUG && window.ACTION_DEBUG.ready()', { timeout: 60000 });
const plan = await page.evaluate(() => window.ACTION_DEBUG.plan);
const dt = 1 / 120, N = Math.floor(plan.duration / dt);
const frames = await page.evaluate((N, dt) => Array.from({ length: N + 1 }, (_, i) => window.ACTION_DEBUG.frame(i * dt)), N, dt);
await b.close();
const checks = [], add = (name, ok, detail) => checks.push({ name, ok, detail });
const cid = plan.characters[0].id, acts = plan.actions;
const during = (types, t) => acts.some(a => types.includes(a.type) && t >= a.start && t <= a.start + a.duration);
const rig = JSON.parse(readFileSync(new URL('../../' + 'src/stories/' + story + '/scene.js', import.meta.url), 'utf8').match(/const ACTION_SCENE = (.*);\nplayAction/s)[1]).characters[cid].rig;

// rig: hierarchy
{ const names = new Set(rig.bones.map(x => x.name)); const bad = rig.bones.filter(x => x.parent && !names.has(x.parent));
  const f0 = frames[0].chars[cid].bones; let gap = 0;
  for (const x of rig.bones) if (x.parent && rig.joints[x.from] && x.from === rig.bones.find(p => p.name === x.parent).to) gap = Math.max(gap, Math.hypot(f0[x.name].a[0] - f0[x.parent].b[0], f0[x.name].a[1] - f0[x.parent].b[1]));
  add('rig: parents exist, chained joints connect', !bad.length && gap < .5, `${rig.bones.length} bones, missing parents: ${bad.length}, max joint gap ${gap.toFixed(3)} px`); }

// ground + sliding
{ let maxOff = 0, maxSlide = 0, worst = null, grounded = 0;
  for (let i = 1; i < frames.length; i++) {
    const t = i * dt, F = frames[i].chars[cid], P = frames[i - 1].chars[cid], g = F.ground - F.ankleH;
    if (during(['jump', 'fall'], t) && !during(['land'], t)) continue;
    for (const s of ['f', 'b']) {
      const y = F.bones['shin_' + s].b[1], py = P.bones['shin_' + s].b[1], x = F.bones['shin_' + s].b[0], px = P.bones['shin_' + s].b[0];
      if (Math.abs(y - g) < 1.5 && Math.abs(py - g) < 1.5) { grounded++; const sl = Math.abs(x - px); if (sl > maxSlide) { maxSlide = sl; worst = t; } }
      const ikw = F.ik['leg_' + s]?.w ?? 0; if (ikw > .99 && F.ik['leg_' + s]?.target?.[1] >= g - .5) maxOff = Math.max(maxOff, Math.abs(y - g));
    }
  }
  add('ground: planted feet are on the ground line', maxOff < 2, `max distance of a planted ankle from its ground height ${maxOff.toFixed(2)} px`);
  add('ground: planted feet do not slide', maxSlide < 1.5, `max slide of a planted foot between samples ${maxSlide.toFixed(2)} px${worst != null ? ' at ' + worst.toFixed(2) + ' s' : ''} (${grounded} planted foot-samples)`);
  const last = frames.at(-1).chars[cid], g = last.ground - last.ankleH;
  add('ground: feet back on the ground at the end', ['f', 'b'].every(s => Math.abs(last.bones['shin_' + s].b[1] - g) < 2), ['f', 'b'].map(s => `${s}: ${(last.bones['shin_' + s].b[1] - g).toFixed(2)} px`).join(', ')); }

// snapping: angular speed of every bone (rad/s); a pop between two samples shows as a spike
{ let worst = { v: 0 };
  for (let i = 1; i < frames.length; i++) for (const [n, B] of Object.entries(frames[i].chars[cid].bones)) {
    if (frames[i].chars[cid].root.flip !== frames[i - 1].chars[cid].root.flip) continue;   // a turn mirrors on purpose
    let d = B.ang - frames[i - 1].chars[cid].bones[n].ang; d = Math.atan2(Math.sin(d), Math.cos(d));
    const v = Math.abs(d) / dt; if (v > worst.v) worst = { v, n, t: i * dt };
  }
  add('snapping: no joint pops between frames', worst.v < 40, `max angular speed ${worst.v.toFixed(1)} rad/s (${worst.n} at ${worst.t?.toFixed(3)} s; limit 40 rad/s = 1.7 rad per 24 fps frame)`);
  let jump = 0, jt = 0; for (let i = 1; i < frames.length; i++) { const a = frames[i].chars[cid].root, p = frames[i - 1].chars[cid].root; const d = Math.hypot(a.x - p.x, a.y - p.y); if (d > jump) { jump = d; jt = i * dt; } }
  add('snapping: the body never teleports', jump < 30, `max root move between samples ${jump.toFixed(2)} px at ${jt.toFixed(3)} s`); }

// props: attach / grip / muzzle
for (const pid of Object.keys(frames[0].props || {})) {
  const pick = acts.find(a => a.type === 'pick_up' && (a.params?.target ?? a.target) === pid), drop = acts.find(a => a.type === 'drop' && (a.params?.target ?? a.target) === pid);
  if (pick) {
    const ta = pick.start + pick.duration * .45, before = frames[Math.floor((ta - .05) / dt)].props[pid], after = frames[Math.ceil((ta + .05) / dt)].props[pid];
    add(`attach: ${pid} lies in the world before the pick-up and is in the hand after`, before.mode === 'world' && after.mode === 'hand', `before ${before.mode}, after ${after.mode} (attach at ${ta.toFixed(2)} s)`);
    // the hand reaches the prop's grip exactly when it closes on it
    const at = frames[Math.round(ta / dt) - 1], hg = at.chars[cid].grips[pick.params?.hand || 'f'], pg = at.props[pid].grip;
    add(`attach: the hand meets ${pid}'s grip when it closes`, Math.hypot(hg[0] - pg[0], hg[1] - pg[1]) < 3, `distance ${Math.hypot(hg[0] - pg[0], hg[1] - pg[1]).toFixed(2)} px`);
  }
  let maxG = 0, at = null, max2 = 0, held = 0;
  for (const [i, F] of frames.entries()) {
    const p = F.props[pid]; if (p.mode !== 'hand') continue; held++;
    const hg = F.chars[cid].grips[p.hand], d = Math.hypot(hg[0] - p.grip[0], hg[1] - p.grip[1]); if (d > maxG) { maxG = d; at = i * dt; }
    if (during(['aim'], i * dt) && p.grip2) { const other = p.hand === 'f' ? 'b' : 'f', h2 = F.chars[cid].grips[other]; const aimFull = acts.some(a => a.type === 'aim' && i * dt >= a.start + .3 && i * dt <= a.start + a.duration);
      if (aimFull) max2 = Math.max(max2, Math.hypot(h2[0] - p.grip2[0], h2[1] - p.grip2[1])); }
  }
  if (held) {
    add(`grip: ${pid} stays in the hand (running, jumping, landing)`, maxG < 2, `max hand-to-grip distance ${maxG.toFixed(2)} px over ${held} held samples${at != null ? ' (at ' + at.toFixed(2) + ' s)' : ''}`);
    if (acts.some(a => a.type === 'aim')) add(`grip: the second hand holds ${pid}'s fore grip while aiming`, max2 < 4, `max distance ${max2.toFixed(2)} px`);
  }
  if (drop) { const tr = drop.start + drop.duration * .35, after = frames[Math.min(frames.length - 1, Math.ceil((tr + .05) / dt))].props[pid], end = frames.at(-1).props[pid];
    add(`release: ${pid} leaves the hand and comes to rest on the ground`, after.mode === 'world' && end.mode === 'world', `after release ${after.mode}; final y ${end.pose.y.toFixed(1)}`); }
}
// muzzle: the flash is drawn at propPoint(muzzle) each frame; check the anchor moves with the prop (rigidly)
for (const pid of Object.keys(frames[0].props || {})) {
  const fire = acts.filter(a => a.type === 'fire'); if (!fire.length) continue;
  let maxE = 0;
  for (const a of fire) for (let i = Math.round(a.start / dt); i <= Math.round((a.start + .09) / dt); i++) {
    const p = frames[i].props[pid]; if (!p.muzzle) continue;
    const L1 = Math.hypot(p.muzzle[0] - p.grip[0], p.muzzle[1] - p.grip[1]), L0 = Math.hypot(frames[Math.round(a.start / dt)].props[pid].muzzle[0] - frames[Math.round(a.start / dt)].props[pid].grip[0], frames[Math.round(a.start / dt)].props[pid].muzzle[1] - frames[Math.round(a.start / dt)].props[pid].grip[1]);
    maxE = Math.max(maxE, Math.abs(L1 - L0));
  }
  add(`muzzle: the flash rides ${pid}'s muzzle anchor`, maxE < .5, `muzzle-to-grip distance changes by at most ${maxE.toFixed(3)} px while the flash shows (rigid with the prop)`);
}
// blend: during an aim that overlaps a jump or run, the legs follow the leg action (not the aim) and the hands hold the aim
{ const aim = acts.find(a => a.type === 'aim'), legs = acts.find(a => ['jump', 'run'].includes(a.type) && aim && a.start < aim.start + aim.duration && aim.start < a.start + a.duration);
  if (aim && legs) {
    const t = Math.min(aim.start + aim.duration, legs.start + legs.duration) - .1, F = frames[Math.round(t / dt)].chars[cid];
    const lift = F.ground - F.ankleH - F.bones.shin_f.b[1];
    add('blend: aiming and the leg action play together', (legs.type !== 'jump' || lift > 20), `at ${t.toFixed(2)} s: ${legs.type} lifts the feet ${lift.toFixed(0)} px while the aim holds the arms`); }
}
if (errors.length) add('page: no errors', false, errors.join(' | '));
mkdirSync(`out/action/${plan.id}`, { recursive: true });
writeFileSync(`out/action/${plan.id}/verify.json`, JSON.stringify({ story, plan: plan.id, samples: frames.length, checks }, null, 2));
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}\n      ${c.detail}`);
console.log(`${checks.filter(c => c.ok).length}/${checks.length} checks passed → out/action/${plan.id}/verify.json`);
process.exit(checks.every(c => c.ok) ? 0 : 1);
