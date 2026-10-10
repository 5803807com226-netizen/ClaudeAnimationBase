// tools/action/direct.mjs: the ACTION DIRECTOR. A story sentence (Thai or English) → an editable Motion Plan
// (motion_plan/1) that only uses catalogue presets. Two directors:
//   --mode=opus   Claude Opus through Claude Code on this computer (your Claude plan; studio/director.mjs `ask`; the
//                 API instead when studio/config.local.json says provider "api"). Opus gets the live preset catalogue,
//                 the layer and mask rules and the scene; it answers with a plan, which is validated
//                 (tools/action/plan.mjs). A rejected plan goes back once with the exact errors and the alternatives.
//   --mode=rules  no AI: a deterministic keyword composer (Thai and English verbs → presets, "while / ขณะ /
//                 กลางอากาศ" → overlapping layers), for tests and offline use.
// The plan is saved (--out) and is the source of truth from then on: editing and re-rendering never call Opus again.
//   node tools/action/direct.mjs --text="..." --rig=<char.rig.json> [--prop=PROP_ID:<prop.json>] [--duration=5]
//        [--aspect=9:16] [--id=<plan id>] [--mode=opus|rules] [--out=<motion_plan.json>]
//        [--claude=<claude command>]   (default: studio/config.local.json claudeCommand, else `claude`)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTION_CATALOG, ACTION_LAYERS, ACTION_GROUPS, ACTION_EFFECTS, validatePlan, roughX } from './plan.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const FRAME = { '9:16': [1080, 1920], '16:9': [1920, 1080], '4:5': [1080, 1350] };

// ---------- the catalogue as Opus reads it ----------
export function catalogText() {
  const lines = [];
  for (const [n, c] of Object.entries(ACTION_CATALOG)) {
    const ps = Object.entries(c.params).filter(([k]) => !['strength', 'weight', 'blend_in', 'blend_out', 'ease'].includes(k))
      .map(([k, d]) => d.type === 'number' ? `${k}=${d.default} (${d.min}–${d.max})` : d.type === 'enum' ? `${k}: ${d.values.join('|')}` : `${k}: ${d.type}`).join(', ');
    lines.push(`- ${n} [${c.layer}; owns ${c.mask.join(', ')}${c.additive ? '; additive' : ''}]: ${c.about}${ps ? '. Params: ' + ps : ''}`);
  }
  return lines.join('\n');
}
export function directorSystem() {
  return `You are the ACTION DIRECTOR of a 2D character animation engine. You turn a story sentence into a Motion Plan: a timeline of PRESET actions that the engine plays procedurally (articulated rig, IK, physics). You never write animation code; you choose and time presets and set their parameters.

LAYERS (low → high priority): ${ACTION_LAYERS.join(', ')}. Each action writes only its joint groups (${ACTION_GROUPS.join(', ')}). Higher layers override lower ones only on their own groups, so actions on different layers play AT THE SAME TIME (legs run while the torso aims). On one layer, a later action interrupts an earlier one; one starting inside a longer one overrides it only while it plays.

PRESETS (the only allowed "type" values):
${catalogText()}

RULES
- Break the story into actions in order; overlap actions on different layers when the story says "while", "as", "in mid-air" (e.g. aim on upper_body during a jump on lower_body; fire during the aim).
- A prop must be picked up (pick_up) before aim, fire, hold or carry; after pick_up the character carries it automatically.
- Every jump is followed by a land at the jump's end; a fall is followed by a land. End with idle until the plan's duration.
- Times are seconds from 0; every action ends by the plan's duration. Typical durations: pick_up .8, run 1–1.5, jump 1–1.3, land .4, fire .3, aim ≥ .8.
- Coordinates are frame pixels of the given frame size; the character moves along x (facing right = +x); targets (aim, point, look) are points AHEAD of where the character will be at that time.
- effects allowed: ${ACTION_EFFECTS.join(', ')}. Fire is stylised and fictional (an energy bolt).

OUTPUT: one JSON object, nothing else: { "actions": [ { "type", "start", "duration", "layer"?, "target"?, "effects"?, ...params } ], "camera": { "follow": "<character id>", "frame_x": 0.38 } | null, "notes": "<one line, Thai>" }`;
}

// ---------- the no-AI director ----------
const VERBS = [   // [regex (Thai / English), preset, default duration]
  [/หยิบ|เก็บ|pick(?:s|ed)?\s*up|grab/i, 'pick_up', .8], [/วิ่งเร็ว|sprint|dash/i, 'sprint', 1.1], [/วิ่ง|run/i, 'run', 1.2], [/เดิน|walk/i, 'walk', 1.4],
  [/กระโดด|กระโจน|jump|leap|hop/i, 'jump', 1.2], [/เล็ง|aim/i, 'aim', 1.0], [/ยิง|fire|shoot/i, 'fire', .3], [/ลงพื้น|ลงสู่พื้น|land/i, 'land', .4],
  [/โบก|wave/i, 'wave', 1.0], [/ชี้|point/i, 'point', .8], [/มอง|look/i, 'look', .8], [/หลบ|dodge/i, 'dodge', .5], [/ย่อ|หมอบ|crouch|squat/i, 'crouch', .7],
  [/หันหลัง|หันกลับ|turn/i, 'turn', .4], [/ปล่อย|วาง|ทิ้ง|drop|release|throw/i, 'drop', .6], [/ตก|fall/i, 'fall', .6], [/สะดุ้ง|ตกใจ|react|flinch/i, 'react', .6],
  [/ยืน|พัก|หายใจ|idle|rest|recover|stand/i, 'idle', 1.0],
];
const AT_ONCE = /ขณะ|พร้อม|กลางอากาศ|while|as he|as she|as they|in mid-?air|airborne|at the same time/i;
export function ruleDirect(text, { charId = 'CHAR_001', props = [], duration = 5, aspect = '9:16', x0 = .2 } = {}) {
  const [Wf, Hf] = FRAME[aspect];
  const clauses = String(text).split(/(?:,|;|\.|แล้ว(?:ก็)?|จากนั้น|ต่อมา|then|and then|after that)/i).map(s => s.trim()).filter(Boolean);
  const acts = []; let t = 0, x = x0 * Wf, lastJump = null;
  for (const cl of clauses) {
    // every verb in the clause, in the order they appear ("aims and fires")
    const found = []; for (const [re, type, d] of VERBS) { const m = cl.match(re); if (m && !found.some(f => f.type === type || (type === 'run' && f.type === 'sprint'))) found.push({ type, d, at: m.index }); }
    found.sort((a, b) => a.at - b.at);
    const together = AT_ONCE.test(cl);
    for (const f of found) {
      const a = { type: f.type, start: +t.toFixed(2), duration: f.d };
      if (['pick_up', 'drop', 'hold', 'carry'].includes(f.type)) { if (!props.length) continue; a.target = props[0]; }
      if (['aim', 'point', 'look'].includes(f.type)) a.target = [Math.round(Math.min(x + .75 * Wf, x + 900)), Math.round(Hf * .5)];
      if ((f.type === 'aim' || f.type === 'fire') && lastJump && (together || acts.at(-1)?.type === 'jump' || acts.at(-1)?.type === 'aim')) {
        // in the air: overlap the jump on the upper body
        if (f.type === 'aim') { a.start = +(lastJump.start + .15).toFixed(2); a.duration = +(lastJump.duration - .05).toFixed(2); }
        else { const aim = acts.filter(b => b.type === 'aim').at(-1); a.start = +((aim ? aim.start : lastJump.start) + .45).toFixed(2); }
        if (f.type === 'fire') a.effects = ['muzzle_flash', 'bolt', 'recoil'];
        acts.push(a); continue;
      }
      if (f.type === 'fire') { const aim = acts.filter(b => b.type === 'aim').at(-1); if (aim) a.start = +(aim.start + Math.min(.45, aim.duration / 2)).toFixed(2); a.effects = ['muzzle_flash', 'bolt', 'recoil']; acts.push(a); continue; }
      if (f.type === 'land' && lastJump && Math.abs(lastJump.start + lastJump.duration - t) < .05 && acts.some(b => b.type === 'land' && b.start === +t.toFixed(2))) continue;
      acts.push(a);
      if (['run', 'walk', 'sprint'].includes(f.type)) x += (ACTION_CATALOG[f.type].params.speed.default) * f.d * .6;
      if (f.type === 'jump') { lastJump = a; t += f.d; acts.push({ type: 'land', start: +t.toFixed(2), duration: .4, effects: ['dust'] }); t += .4; continue; }
      if (f.type === 'land' && acts.filter(b => b.type === 'land').length > 1 && acts.at(-2)?.type === 'land') { acts.pop(); continue; }
      t += f.d;
    }
  }
  // an explicit "lands" after a jump is already there: drop duplicates; fit the plan's length; finish standing
  const out = []; for (const a of acts) if (!(a.type === 'land' && out.some(b => b.type === 'land' && Math.abs(b.start - a.start) < .45))) out.push(a);
  const end = Math.max(...out.map(a => a.start + a.duration), 0), scale = end > duration - .6 ? (duration - .6) / end : 1;
  for (const a of out) { a.start = +(a.start * scale).toFixed(2); a.duration = +(a.duration * scale).toFixed(2); }
  const last = Math.max(...out.map(a => a.start + a.duration), 0);
  if (duration - last > .05) out.push({ type: 'idle', start: +last.toFixed(2), duration: +(duration - last).toFixed(2) });
  return { actions: out, camera: { follow: charId, frame_x: .38, amount: .9 }, notes: 'rule-based plan (no AI)' };
}

// ---------- assemble a full plan around the director's actions ----------
export function assemblePlan({ id, title, aspect = '9:16', duration = 5, rig, charId = 'CHAR_001', props = [], x = .2, height = .34 }, dir, base) {
  const rel = p => relative(base, p).split('\\').join('/');
  return { schema: 'motion_plan/1', id, title, duration, fps: 24, aspect, ground_y: .8,
    camera: dir.camera === null ? undefined : (dir.camera || { follow: charId, frame_x: .38, amount: .9 }),
    characters: [{ id: charId, rig: rel(rig), x, height, facing: 'right' }],
    props: props.map((p, i) => ({ id: p.id, spec: rel(p.spec), x: +(x + .11 + i * .05).toFixed(3), scale: .72 })),
    actions: dir.actions, notes: dir.notes };
}

export async function directPlan(o, { mode = 'rules', log = console.log } = {}) {
  const base = dirname(resolve(o.out));
  if (mode === 'rules') {
    const dir = ruleDirect(o.text, { charId: o.charId, props: o.props.map(p => p.id), duration: o.duration, aspect: o.aspect, x0: o.x });
    const plan = assemblePlan(o, dir, base);
    // aim / point / look ahead of where the character will be when the action ends (the camera follows; off-frame is fine)
    for (const a of plan.actions) if (['aim', 'point', 'look'].includes(a.type)) { const [x, f] = roughX(plan, plan.characters[0].id, a.start + a.duration); a.target = [Math.round(x + f * 700), a.target[1]]; }
    const r = validatePlan(plan, { base, substitute: true });
    return { plan: r.ok ? r.plan : plan, report: r, director: 'rules' };
  }
  const D = await import('../../studio/director.mjs'), cfg = { ...D.loadConfig(), ...(o.claude ? { provider: 'claude-code', claudeCommand: o.claude } : {}) }, C = D.client(cfg);
  const scene = `STORY: ${o.text}\nFRAME: ${FRAME[o.aspect].join(' × ')} px (${o.aspect}); ground at y ${Math.round(.8 * FRAME[o.aspect][1])}\nDURATION: ${o.duration} s\nCHARACTER: ${o.charId} starts at x ${Math.round(o.x * FRAME[o.aspect][0])}, facing right, about ${Math.round(o.height * FRAME[o.aspect][1])} px tall\nPROPS: ${o.props.map(p => `${p.id} lying on the ground at x ${Math.round((o.x + .11) * FRAME[o.aspect][0])}`).join('; ') || 'none'}`;
  log('Opus is directing the action…');
  let ans = await D.ask(C, directorSystem(), [{ type: 'text', text: scene }], { log, effort: 'high' });
  let plan = assemblePlan(o, ans.json, base), r = validatePlan(plan, { base });
  if (!r.ok) {
    log(`the plan has ${r.errors.length} problem(s); asking Opus to fix them once…`);
    const fix = r.errors.join('\n');   // unsupported presets already name their closest alternatives
    ans = await D.ask(C, directorSystem(), [{ type: 'text', text: scene + `\n\nYOUR PREVIOUS PLAN:\n${JSON.stringify(ans.json)}\n\nTHE VALIDATOR REJECTED IT:\n${fix}\n\nReturn the corrected JSON object only (same shape).` }], { log, effort: 'high' });
    plan = assemblePlan(o, ans.json, base); r = validatePlan(plan, { base });
  }
  return { plan: r.ok ? r.plan : plan, report: r, director: 'opus', usage: ans.usage };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
  if (!args.text || !args.rig) { console.error('usage: node tools/action/direct.mjs --text="…" --rig=<char.rig.json> [--prop=ID:<prop.json>] [--duration=5] [--mode=opus|rules] [--out=…]'); process.exit(2); }
  const id = args.id || 'act_' + Date.now().toString(36), out = resolve(args.out || `out/action/${id}/motion_plan.json`);
  const props = (Array.isArray(args.prop) ? args.prop : args.prop ? [args.prop] : []).map(s => { const [pid, ...p] = String(s).split(':'); return { id: pid, spec: resolve(p.join(':')) }; });
  const o = { id, title: args.title || args.text.slice(0, 60), text: args.text, aspect: args.aspect || '9:16', duration: +(args.duration || 5), rig: resolve(args.rig), charId: args['char-id'] || 'CHAR_001', props, x: +(args.x || .2), height: +(args.height || .34), out, claude: args.claude };
  const res = await directPlan(o, { mode: args.mode || 'rules' });
  mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(res.plan, null, 2));
  for (const e of res.report.errors) console.log('ERROR   ' + e);
  for (const w of res.report.warnings) console.log('warning ' + w);
  console.log(`${res.director}: ${res.plan.actions.length} actions → ${out} (${res.report.ok ? 'valid' : 'INVALID'})`);
  for (const a of res.plan.actions) console.log(`  ${String(a.start).padStart(5)}–${(a.start + a.duration).toFixed(2).padStart(5)} s  ${a.type}${a.target ? ' → ' + JSON.stringify(a.target) : ''}`);
  process.exit(res.report.ok ? 0 : 1);
}
