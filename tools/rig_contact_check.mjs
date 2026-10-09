// tools/rig_contact_check.mjs: numeric proof of grounded character motion. A story that exposes window.RIG_QA(t)
// (shot-local time → solved contact points and their targets) is sampled every frame of a span:
//   · IK error: how far each solved ankle / staff tip is from where the walk planted it (px; unreachable targets show here)
//   · foot slide: how far a planted foot's pivot (heel, then toe as it rolls off) moves while it pivots (px; 0 = no skating)
//   · ground: how far that contact point is from the ground line (px; >0 floating, <0 sinking)
//   · staff: tip error and slide while planted; knee angles (must keep one bend direction, no hyperextension)
//   node tools/rig_contact_check.mjs --story=the_last_smoke [--assets=<dir>] [--from=0 --to=3] [--fps=24] [--tol=2] [--json=…]
// Exit 1 when any limit is exceeded. Pure numbers: also inspect a frame strip, numbers cannot judge appeal.
import { writeFileSync } from 'node:fs';
import { args, launch, openTarget, cleanErrors } from './lib/harness.mjs';

const fps = +(args.fps || 24), a = +(args.from ?? 0), b = +(args.to ?? 3), tol = +(args.tol ?? 2);
const browser = await launch(), errors = [];
const page = await openTarget(browser, { name: 'rig', story: args.story }, { aspect: args.aspect || '9:16', assets: args.assets }, errors);
const rows = await page.evaluate((a, b, fps) => { const out = []; for (let i = Math.round(a * fps); i <= Math.round(b * fps); i++) out.push(window.RIG_QA(i / fps)); return out; }, a, b, fps);
await browser.close();
const res = { frames: rows.length, ik: {}, slide: {}, ground: {}, knees: {} }, fails = [];
for (const k of ['footL', 'footR', 'staff']) {
  res.ik[k] = Math.max(...rows.map(r => r[k].err));
  let slide = 0, ground = 0, start = null, pivot = null;
  for (const r of rows) {
    const on = k === 'staff' ? r.staff.planted : r[k].stance, p = k === 'staff' ? r.staff.tip : r[k].contact;
    if (on && r[k].pivot !== pivot) { start = null; pivot = r[k].pivot; }   // heel → toe roll: a new fixed point
    if (on) { if (!start) start = p; slide = Math.max(slide, Math.hypot(p[0] - start[0], p[1] - start[1])); ground = Math.max(ground, Math.abs(p[1] - r.ground)); }
    else start = null;
  }
  res.slide[k] = slide; res.ground[k] = ground;
  if (res.ik[k] > tol) fails.push(`${k}: IK misses its target by ${res.ik[k].toFixed(1)} px`);
  if (slide > tol) fails.push(`${k}: slides ${slide.toFixed(1)} px while planted`);
  if (ground > tol * 2) fails.push(`${k}: contact ${ground.toFixed(1)} px off the ground while planted`);
}
for (const s of ['l', 'r']) {
  const v = rows.map(r => r.knees[s]); res.knees[s] = [Math.min(...v), Math.max(...v)];
  if (Math.min(...v) * Math.max(...v) < -1e-3) fails.push(`knee ${s}: bends both ways (${res.knees[s].map(x => x.toFixed(2)).join('..')} rad)`);
}
const errs = cleanErrors(errors); if (errs.length) fails.push('page errors: ' + errs.join(' | '));
for (const k of ['footL', 'footR', 'staff']) console.log(`${k.padEnd(6)} IK err ${res.ik[k].toFixed(2)} px · slide while planted ${res.slide[k].toFixed(2)} px · off ground ${res.ground[k].toFixed(2)} px`);
console.log(`knees  l ${res.knees.l.map(x => x.toFixed(2)).join('..')} rad · r ${res.knees.r.map(x => x.toFixed(2)).join('..')} rad  (${rows.length} frames)`);
console.log(fails.length ? 'FAIL\n  ' + fails.join('\n  ') : 'PASS');
if (args.json) writeFileSync(args.json, JSON.stringify({ ...res, fails, pass: !fails.length }, null, 2));
process.exit(fails.length ? 1 : 0);
