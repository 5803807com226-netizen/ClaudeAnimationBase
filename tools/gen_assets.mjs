// tools/gen_assets.mjs: make a collage scene's PNG layers automatically from its manifest (the `gen` blocks), through a
// local ComfyUI (your Z-Image / Qwen-Image workflows), then remove backgrounds, size, derive aligned layers, validate,
// and retry or repair ONLY what fails. Every result is cached by content, so the same prompt is never generated twice,
// across scenes and stories. Works for any story with SCENES + gen blocks; nothing here is specific to one scene.
//
//   node tools/gen_assets.mjs --story=<id> [--scene=<id>] [--only=bg,sun] [--force] [--retries=2]
//                             [--engines=tools/comfy/engines.local.json] [--python=python] [--timeout=600]
//                             [--mock [--mock-bad=sun]] [--out=<dir>] [--dry] [--preview]
// gen block: { engine: 'zimage' | 'qwen' | 'manual' | 'derive', prompt, negative, size: [w, h] (generation size), seed,
//   matte: 'chroma' | 'rembg' | 'none', unshadow (remove a baked neutral shadow; default true, false for dark-edged art), margin (clear margin, fraction of width), style (replaces the scene's) | false,
//   character (a name: the same seed family wherever it appears), ref (reference image, for workflows with LoadImage),
//   op / from / source / mirror / colors / rect / feather (derive: 'screen_glow' | 'beside' | 'region', on another layer's canvas) }
//   --dry      print the plan and the exact prompts; generate nothing
//   --offline  never call ComfyUI: reprocess cached source images only (e.g. after a matting fix); fails if one is missing
//   --mock     no image model: synthetic stand-ins, written to out/mock_assets/<story>/<scene>/ (never the real art folder)
//   --preview  after every layer passes, a low-res contact sheet of the scene with these assets (out/gen/<story>_<scene>.jpg)
// Manual import stays: a layer without `gen`, with gen.engine 'manual', or a file you put there yourself (no record in
// _generated.json) is never overwritten unless you pass --force; it is only validated.
// Layer flag opaque: true — a full opaque image the story places itself (a character reference view, a background plate):
// no matte, no transparency or frame-coverage checks, only size.
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, statSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { loadStory, checkLayer, neededWidth, neededSize } from './lib/manifest.mjs';
import { comfyGenerate } from './comfy/client.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
if (!args.story) { console.error('usage: node tools/gen_assets.mjs --story=<id> [--scene=<id>] [--mock | --engines=<file>] [--dry] [--preview]'); process.exit(1); }
const PY = args.python || (process.platform === 'win32' ? 'python' : 'python3'), CACHE = args.cache || process.env.ASSET_CACHE || '.cache/assets';
const RETRIES = +(args.retries ?? 2), only = args.only ? String(args.only).split(',') : null, mockBad = new Set(String(args['mock-bad'] || '').split(',').filter(Boolean));
const sha = (...x) => createHash('sha256').update(x.map(v => typeof v === 'string' || Buffer.isBuffer(v) ? v : JSON.stringify(v)).join('\u0000')).digest('hex').slice(0, 20);
const py = (...a) => { const r = spawnSync(PY, ['tools/comfy/imageops.py', ...a], { encoding: 'utf8' }); if (r.status) throw new Error(`imageops ${a[0]}: ${(r.stderr || r.error || '').toString().trim().split('\n').pop()}`); return r.stdout || ''; };
// the image-processing code is part of every processed-image cache key: change the matting and stale results are redone
// (generated source images stay cached: no new AI calls)
const OPS = sha(readFileSync('tools/comfy/imageops.py'));
mkdirSync(CACHE, { recursive: true });

// Words that must never be asked for, and must always be in the negative prompt (letters, numbers, logos, watermarks).
const NO_TEXT = ['text', 'letters', 'words', 'numbers', 'digits', 'typography', 'logo', 'watermark', 'signature'];
function prompts(S, g) {
  const st = S.gen || {}, isolate = g.isolate === false || g.matte === 'none' ? '' : (g.isolate || st.isolate || 'isolated on a plain flat solid chroma green background (#00B140), no cast shadow, empty margin around the object');
  const style = g.style === false ? '' : g.style || st.style;   // a layer may replace the shared style (e.g. a photograph)
  const positive = [g.prompt, style, isolate].filter(Boolean).join(', ');
  let negative = [st.negative, g.negative].filter(Boolean).join(', ');
  for (const w of NO_TEXT) if (!new RegExp(`\\b${w}\\b`, 'i').test(negative)) negative += `, ${w}`;                    // guarantee the guard
  const asks = positive.replace(/\bno [a-z ,-]+/gi, '').match(/\b(text|letters?|words?|numbers?|digits?|logo|watermark|caption|signature)\b/gi);
  if (asks) throw new Error(`prompt asks for ${asks.join(', ')}: artwork must contain no text; put text in the manifest's type items`);
  return { positive, negative: negative.replace(/^, /, '') };
}

// The engines (your ComfyUI workflows); --mock needs none.
let ENGINES = null;
if (!args.mock && !args.dry) {
  const f = args.engines || 'tools/comfy/engines.local.json';
  if (!existsSync(f)) { console.error(`no engine config: copy tools/comfy/engines.example.json to ${f} and point it at your exported API workflows (or use --mock / --dry)`); process.exit(1); }
  ENGINES = JSON.parse(readFileSync(f, 'utf8'));
}
// the cache identity of a generated source image (same prompt, workflow, seed and size = same image)
function rawKeyFor(g, S, L, attempt) {
  const { positive, negative } = prompts(S, g), seedBase = g.seed ?? ((S.gen?.seed ?? 0) + parseInt(sha(g.character || L.id).slice(0, 6), 16) % 100000);
  const seed = seedBase + attempt * 1009, [w, h] = g.size || [1024, 1024];
  const eng = args.mock ? { workflow: 'mock' } : ENGINES?.engines[g.engine];
  if (!eng) throw new Error(`no engine "${g.engine}" in the engine config`);
  const wfHash = args.mock ? 'mock/5' : sha(readFileSync(eng.workflow)), bad = args.mock && mockBad.has(L.id) && attempt === 0;
  const key = sha('raw', g.engine, wfHash, positive, negative, seed, w, h, g.ref || '', bad ? 'bad' : '');
  return { key, seed, w, h, eng, bad, positive, negative, out: `${CACHE}/${key}.raw.png` };
}
// was this layer's file made by this pipeline? A run interrupted before writing its record must not turn generated
// files into "manual" ones
// → only when the file is byte-for-byte one of this pipeline's processed outputs in the cache; a file made by hand never
// matches, so it is never overwritten
function generatedBefore(L, g, rec, file) {
  if (rec[L.id]) return true;
  if (!existsSync(file)) return false;
  const size = statSync(file).size, mine = sha(readFileSync(file));
  for (const n of readdirSync(CACHE)) if (n.endsWith('.png') && !/\.(raw|matte)\.png$/.test(n) && statSync(`${CACHE}/${n}`).size === size && sha(readFileSync(`${CACHE}/${n}`)) === mine) return true;
  return false;
}
async function generateRaw(g, S, L, attempt, label) {   // → path of the raw image in the cache (generated at most once per key)
  const { key, seed, w, h, eng, bad, positive, negative, out } = rawKeyFor(g, S, L, attempt);
  const meta = { key, engine: g.engine, seed, size: [w, h], positive, negative, mock: !!args.mock };
  if (existsSync(out)) return { ...meta, path: out, cached: true };
  if (args.dry) return { ...meta, path: out, dry: true };
  if (args.offline) throw new Error(`--offline: no cached source image for this prompt and seed (key ${key}); run without --offline to generate it`);
  console.log(`    ${label}: generating (${args.mock ? 'mock' : g.engine}, seed ${seed}, ${w}×${h})`);
  if (args.mock) py('mock', '--out', out, '--prompt', g.prompt, '--size', `${w},${h}`, '--seed', String(seed), '--label', L.id, ...(bad ? ['--bad'] : []));
  else writeFileSync(out, await comfyGenerate({ server: ENGINES.server, ...eng }, { positive, negative, seed, width: w, height: h, ref: g.ref ? readFileSync(g.ref) : null }, { timeout: +(args.timeout || 600) }));
  return { ...meta, path: out, cached: false };
}
// raw → finished layer: remove the background (or not), crop with a margin, size to what the closest shot needs
function finish(raw, g, L, S, P, tol) {
  const ns = (!L._src && SHARED_NEED[(S.assets || '') + L.file]) || neededSize(L, S, P), need = Math.ceil(ns.px * 1.04), dimArg = ns.dim === 'h' ? '--height' : '--width', key = sha('fin', OPS, raw.key, g.matte || 'chroma', g.margin ?? .04, tol, g.unshadow ?? true, ns.dim, need, L.fill ? g.size : '');
  const out = `${CACHE}/${key}.png`, repFile = `${CACHE}/${key}.report.json`;
  if (existsSync(out)) return { path: out, report: existsSync(repFile) ? JSON.parse(readFileSync(repFile, 'utf8')) : {} };
  let report = {};
  if (g.matte === 'none' || L.fill) py('fit', '--in', raw.path, '--out', out, dimArg, String(need), ...(L.fill && g.size ? ['--cover', `${g.size[0]}:${g.size[1]}`] : []));
  else {
    const m = `${CACHE}/${key}.matte.png`, o = py('matte', '--in', raw.path, '--out', m, '--mode', g.matte || 'chroma', '--tol', String(tol), '--margin', String(g.margin ?? .04), ...(g.unshadow === false ? ['--no-unshadow'] : []));
    report = JSON.parse(o.trim().split('\n').pop() || '{}'); writeFileSync(repFile, JSON.stringify(report)); py('fit', '--in', m, '--out', out, dimArg, String(need));
  }
  return { path: out, report };
}

const { project: P, scenes } = loadStory(args.story);
const list = Object.entries(scenes).filter(([k]) => !args.scene || k === args.scene);
const dirOf = (sid, S0) => (args.out || (args.mock ? `out/mock_assets/${args.story}/${sid}/` : S0.assets)).replace(/\/?$/, '/');
// A file used by several layers (in any scene of the story, e.g. one tree planted five times) is made ONCE, by the first
// layer that has a gen block, at the size its most demanding use needs; the other uses are only validated.
const SHARED_NEED = {}, made = {};
for (const [sid, S0] of Object.entries(scenes)) for (const L of S0.layers.filter(L => !L.doodle)) {
  const f = dirOf(sid, S0) + L.file, n = neededSize(L, { ...S0, assets: dirOf(sid, S0) }, P), cur = SHARED_NEED[f];
  if (!cur || (cur.dim === n.dim && n.px > cur.px)) SHARED_NEED[f] = cur && cur.dim !== n.dim ? cur : n;
}
let failed = 0;
for (const [sid, S0] of list) {
  const dir = dirOf(sid, S0), S = { ...S0, assets: dir };
  mkdirSync(dir, { recursive: true });
  const recFile = dir + '_generated.json', rec = existsSync(recFile) ? JSON.parse(readFileSync(recFile, 'utf8')) : {};
  console.log(`scene ${sid} → ${dir}${args.mock ? '  (MOCK stand-ins, not artwork)' : ''}${args.dry ? '  (dry run)' : ''}`);
  const byId = Object.fromEntries(S.layers.map(L => [L.id, L])), order = [...S.layers].sort((a, b) => (a.gen?.engine === 'derive') - (b.gen?.engine === 'derive') || !a.gen - !b.gen);
  const rows = [];
  for (const L of order) {
    if (only && !only.includes(L.id)) continue;
    if (L.doodle) continue;   // doodle FX are drawn, not generated
    const g = L.gen, f = dir + L.file, row = { id: L.id, file: L.file, status: '', how: '' }; rows.push(row);
    if (made[f] && args.dry) { row.how = `shared (made for ${made[f]})`; row.status = 'PLAN'; continue; }
    if (made[f]) { const c = checkLayer(L, S, P); row.how = `shared (made for ${made[f]})`; row.status = c.fails.length ? 'FAIL' : 'PASS'; row.msg = c.fails[0]; if (c.fails.length) failed++; continue; }
    if (g && g.engine !== 'derive') made[f] = L.id;
    const manual = !g || g.engine === 'manual' || (existsSync(f) && !args.force && !generatedBefore(L, g, rec, f));
    if (!manual && existsSync(f) && !rec[L.id]) console.log(`    ${L.id}: adopting the generated file (it matches a cached pipeline output; its record was missing)`);
    if (manual) { const c = checkLayer(L, S, P); row.how = existsSync(f) ? 'manual file' : 'manual (missing)'; row.status = c.fails.length ? 'FAIL' : 'PASS'; row.msg = c.fails[0]; continue; }
    if (args.dry) {
      const src = g.engine === 'derive' ? g.source : g;
      if (src) { const p = prompts(S, src); console.log(`\n  ${L.id} (${src.engine}${g.engine === 'derive' ? `, then ${g.op} from ${g.from}` : ''}, ${(src.size || []).join('×')}, matte ${src.matte || 'chroma'}, needs ≥ ${neededWidth(L, S, P)} px)\n    + ${p.positive}\n    − ${p.negative}`); }
      else console.log(`\n  ${L.id} (derive: ${g.op} from ${g.from})`);
      row.status = 'PLAN'; continue;
    }
    let ok = false, last = null;
    // start from the attempt that last succeeded for this exact prompt (its output is cached), not from a known-bad one
    const prev = rec[L.id], src0 = g.engine === 'derive' ? g.source : g, first = prev?.status === 'PASS' && src0 && prev.positive === prompts(S, src0).positive ? prev.attempt || 0 : 0;
    for (let attempt = first; attempt <= (args.offline ? RETRIES + 3 : first + RETRIES) && !ok; attempt++) {
      try {
        if (g.engine === 'derive') {   // layers made from another layer, on its canvas (so they align exactly)
          const base = dir + byId[g.from].file; if (!existsSync(base)) throw new Error(`base layer ${g.from} is not ready`);
          const srcRaw = g.source ? await generateRaw(g.source, S, { id: L.id + '_src' }, attempt, L.id) : null;
          const src = srcRaw ? (g.op === 'region' ? srcRaw.path   // region: the raw edit itself, on the same framing as the base
            : finish(srcRaw, g.source, { ...L, _src: true, size: [neededWidth(L, S, P) * .3], keys: null, scale: 1, fill: false }, S, { ...P }, 1).path) : null;
          const key = sha('derive', g.op, readFileSync(base), src ? readFileSync(src) : '', g.colors || '', g.mirror || '', g.rect || '', g.feather ?? ''), out = `${CACHE}/${key}.png`;
          if (!existsSync(out)) {
            if (g.op === 'screen_glow') py('screen_glow', '--base', base, '--out', out, ...(g.colors ? ['--colors', g.colors.join(',')] : []));
            else if (g.op === 'beside') py('beside', '--base', base, '--source', src, '--out', out, ...(g.mirror ? ['--mirror'] : []));
            else if (g.op === 'region') py('region', '--base', base, '--source', src || base, '--out', out, '--rect', g.rect.join(','), '--feather', String(g.feather ?? .03));
            else throw new Error(`unknown derive op "${g.op}"`);
          }
          copyFileSync(out, f); rec[L.id] = { key, attempt, op: g.op, from: g.from, positive: srcRaw?.positive, source: srcRaw && { seed: srcRaw.seed }, mock: !!args.mock };
        } else {
          const raw = await generateRaw(g, S, L, attempt, L.id);
          let fin = null, c = null;
          for (const tol of [1, .8, 1.25]) {   // cheap repair first: re-matte with a tighter / looser key before regenerating
            fin = finish(raw, g, L, S, P, tol); copyFileSync(fin.path, f); c = checkLayer(L, S, P);
            if (fin.report.shadow_suspect) c.fails.push('a shadow is baked into the generated image and could not be separated: needs regeneration');
            if (!c.fails.length || g.matte === 'none' || L.fill) break;
          }
          rec[L.id] = { key: raw.key, attempt, matte: fin.report, engine: g.engine, seed: raw.seed, size: raw.size, positive: raw.positive, negative: raw.negative, mock: raw.mock, cached: raw.cached };
          row.how = `${raw.cached ? 'cache' : args.mock ? 'mock' : g.engine} seed ${raw.seed}${attempt ? ` (retry ${attempt})` : ''}`;
        }
        const c = checkLayer(L, S, P); if (rec[L.id]?.matte?.shadow_suspect) c.fails.push('a shadow is baked into the generated image and could not be separated: needs regeneration'); last = c.fails[0];
        ok = !c.fails.length; if (!ok) console.log(`    ${L.id}: attempt ${attempt + 1} invalid: ${last}`);
        if (g.engine === 'derive') row.how = `derived (${g.op} from ${g.from})`;
        rec[L.id].status = ok ? 'PASS' : 'FAIL'; rec[L.id].warns = c.warns;
      } catch (e) { const miss = /--offline/.test(e.message); if (!(miss && last)) last = e.message; if (!miss || args.verbose) console.log(`    ${L.id}: ${e.message}`); if (/not ready|unknown derive|asks for|no engine/.test(e.message)) break; }
    }
    row.status = ok ? 'PASS' : 'FAIL'; row.msg = ok ? '' : last; if (!ok) failed++;
    if (!args.dry) writeFileSync(recFile, JSON.stringify(rec, null, 1));   // after every layer: an interrupted run keeps its records
  }
  if (!args.dry) writeFileSync(recFile, JSON.stringify(rec, null, 1));
  console.log('\n' + rows.map(r => `  ${r.status.padEnd(5)} ${r.id.padEnd(10)} ${r.file.padEnd(22)} ${r.how}${r.msg ? '  · ' + r.msg : ''}`).join('\n'));
  if (args.preview && !args.dry && !rows.some(r => r.status === 'FAIL')) {
    mkdirSync('out/gen', { recursive: true });
    const sheet = `out/gen/${args.story}_${sid}${args.mock ? '_MOCK' : ''}.jpg`;
    console.log(`\npreview → ${sheet}`);
    execFileSync('node', ['render.mjs', `--story=${args.story}`, `--assets=${dir}`, '--sheet=0,0.5,1.0,1.6,2.4,2.95', '--cols=6', '--w=200', `--out=${sheet}`,
      ...(args.chrome ? [`--chrome=${args.chrome}`] : []), ...(args['soft-gl'] ? ['--soft-gl'] : [])], { stdio: 'inherit' });
  }
}
console.log(failed ? `\n${failed} layer(s) FAIL` : '\ndone');
process.exit(failed ? 1 : 0);
