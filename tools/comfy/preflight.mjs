// tools/comfy/preflight.mjs: check BEFORE spending GPU time that gen_assets can drive your ComfyUI.
//   node tools/comfy/preflight.mjs [--engines=tools/comfy/engines.local.json]
// For each engine: the workflow file is API format; how it binds (prompt / negative / seed / size / reference image);
// ComfyUI answers; every node type in the workflow is installed; every model file it names exists on the server.
// Exit 1 on any problem. Generates nothing.
import { readFileSync, existsSync } from 'node:fs';
import { loadWorkflow, autoBind } from './client.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
const file = args.engines || 'tools/comfy/engines.local.json', problems = [];
if (!existsSync(file)) { console.error(`no ${file}: copy tools/comfy/engines.example.json to it and point zimage / qwen at your API-format workflows`); process.exit(1); }
const E = JSON.parse(readFileSync(file, 'utf8')), server = (E.server || 'http://127.0.0.1:8188').replace(/\/$/, '');
let info = null;
try { const r = await fetch(`${server}/object_info`); if (!r.ok) throw new Error('HTTP ' + r.status); info = await r.json(); console.log(`ComfyUI ${server}: reachable, ${Object.keys(info).length} node types`); }
catch (e) { problems.push(`ComfyUI not reachable at ${server} (${e.message}): start ComfyUI first`); }
for (const name of ['zimage', 'qwen']) {
  const eng = E.engines?.[name]; if (!eng) { problems.push(`engine "${name}" missing in ${file}`); continue; }
  let wf; try { wf = loadWorkflow(eng.workflow); } catch (e) { problems.push(`${name}: ${e.message}`); continue; }
  const b = { ...autoBind(wf), ...(eng.bind || {}) };
  console.log(`\n${name}: ${eng.workflow}\n  binds ${JSON.stringify(b)}`);
  if (!b.positive) problems.push(`${name}: no prompt input found; add "bind": { "positive": "<node>.<input>" }`);
  if (name === 'qwen' && !b.image) problems.push('qwen: no LoadImage wired into the workflow: the master reference could not be passed (identity would not be anchored)');
  if (!info) continue;
  for (const [id, n] of Object.entries(wf)) {
    const spec = info[n.class_type]; if (!spec) { problems.push(`${name}: node ${id} "${n.class_type}" is not installed in ComfyUI`); continue; }
    for (const [k, v] of Object.entries(n.inputs)) {   // model files: a string input whose spec is a list of choices
      const opt = spec.input?.required?.[k] || spec.input?.optional?.[k];
      if (typeof v === 'string' && Array.isArray(opt?.[0]) && /\.(safetensors|ckpt|pt|pth|bin|gguf)$/i.test(v) && !opt[0].includes(v)) problems.push(`${name}: node ${id} ${n.class_type}.${k} = "${v}" is not in ComfyUI's model list`);
    }
  }
}
console.log(problems.length ? `\nFAIL\n  ${problems.join('\n  ')}` : '\nPASS: gen_assets can drive this ComfyUI');
process.exit(problems.length ? 1 : 0);
