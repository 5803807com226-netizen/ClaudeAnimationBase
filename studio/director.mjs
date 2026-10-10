// studio/director.mjs: the OPUS DIRECTOR of Motion Studio. One Opus call turns a story into a film: the visual
// language, the Thai narration and every shot as a shot_manifest/1 (checked by tools/compile_plan.mjs). Two more
// optional calls: repair (fix what the compiler blocked) and review (Opus looks at a rendered contact sheet and revises).
// The playbook (studio/playbook.md) and the live capability catalog form the instructions.
// HOW CLAUDE IS CALLED (studio/config.local.json "provider"):
//   "claude-code" (default): Claude Code on this computer, headless (`claude -p`), on the Claude plan you are logged in
//      with (Pro / Max): no API key, no per-call charge; it counts against the plan's usage limits. It may only Read
//      the image files we point it at (no commands, no edits). "claudeCommand" overrides the program name.
//   "api": the Claude API with an API key ("anthropicApiKey" or ANTHROPIC_API_KEY), billed per token.
import Anthropic from '@anthropic-ai/sdk';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { compact } from '../tools/capabilities.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const MODEL = 'claude-opus-5-5';
const PRICE = { input: 4, output: 20, cacheRead: .2, cacheWrite: 5 };   // $ per million tokens (Claude Opus 5.5)

// the caller: { provider, api } (API client only for the api provider)
export function client(cfg = {}) {
  const provider = cfg.provider || 'claude-code';
  return { provider, cfg, api: provider === 'api' ? new Anthropic(cfg.anthropicApiKey ? { apiKey: cfg.anthropicApiKey } : {}) : null };
}

// the system prompt: playbook + a worked collage example + the verified capability catalog (stable bytes → cached)
export function systemPrompt(catalog) {
  const verified = { ...catalog, capabilities: catalog.capabilities.filter(c => c.status === 'verified') };
  const example = JSON.parse(readFileSync('tools/fixtures/plans/collage_demo.json', 'utf8')).shots.slice(0, 2);
  return readFileSync('studio/playbook.md', 'utf8') +
    '\n\n# EXAMPLE: two well-directed collage shots (shape and density to aim for)\n' + JSON.stringify(example) +
    '\n\n# CAPABILITY CATALOG ' + catalog.hash + ' (verified only)\n' + JSON.stringify(compact(verified).capabilities);
}

// one Opus call: streamed (long outputs), adaptive thinking, server-side refusal fallback, cached system prompt
export async function ask(C, system, content, opts = {}) { return C.provider === 'api' ? askApi(C.api, system, content, opts) : askClaudeCode(C.cfg, system, content, opts); }

// Claude Code, headless, on the logged-in plan. Everything goes in on stdin (no command-line length limits); images
// are written to files that it may Read. The answer comes back as Claude Code's JSON result.
const claudeCmd = cfg => cfg.claudeCommand || 'claude';
export function claudeCodeAvailable(cfg = {}) { const r = spawnSync(claudeCmd(cfg), ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' }); return r.status === 0 ? (r.stdout || '').trim() : null; }
async function askClaudeCode(cfg, system, content, { effort = 'high', log = () => {}, workdir = join(tmpdir(), 'motion-studio-director') } = {}) {   // a neutral folder: no repository CLAUDE.md is picked up
  mkdirSync(workdir, { recursive: true }); let n = 0;
  const parts = content.map(b => {
    if (b.type === 'text') return b.text;
    const f = join(workdir, `image_${Date.now()}_${n++}.jpg`); writeFileSync(f, Buffer.from(b.source.data, 'base64'));
    return `[IMAGE: read the file ${f} with the Read tool and look at it]`;
  });
  const prompt = '<instructions>\n' + system + '\n</instructions>\n\n<task>\n' + parts.join('\n') + '\n</task>\n\nAnswer with the JSON object only.';
  const argv = ['-p', '--output-format', 'json', '--model', cfg.claudeModel || 'opus', '--effort', effort, '--tools', 'Read', '--allowedTools', 'Read', '--no-session-persistence'];
  log(`Claude Code (${cfg.claudeModel || 'opus'}, your plan) is working… this can take a few minutes`);
  const out = await new Promise((res, rej) => {
    const p = spawn(claudeCmd(cfg), argv, { cwd: workdir, shell: process.platform === 'win32' }); let o = '', e = '';
    const timer = setInterval(() => log('  … still working'), 30000);
    p.stdout.on('data', d => o += d); p.stderr.on('data', d => e += d);
    p.on('error', err => { clearInterval(timer); rej(new Error(`could not start Claude Code ("${claudeCmd(cfg)}"): install it and log in with your plan (claude, then /login). ${err.message}`)); });
    p.on('close', code => { clearInterval(timer); code === 0 ? res(o) : rej(new Error(`Claude Code exited with ${code}: ${(e || o).slice(-600)}`)); });
    p.stdin.end(prompt);
  });
  let r; try { r = JSON.parse(out); } catch (err) { throw new Error('Claude Code did not return its JSON result: ' + out.slice(0, 300)); }
  if (r.is_error) throw new Error('Claude Code: ' + (r.result || r.subtype || 'error'));
  const u = r.usage || {};
  return { json: parseJson(r.result || ''), usage: { input: u.input_tokens || 0, output: u.output_tokens || 0, cacheRead: u.cache_read_input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0, cost: 0, plan: true, model: cfg.claudeModel || 'opus' } };
}

async function askApi(api, system, content, { effort = 'high', log = () => {} } = {}) {
  const stream = api.beta.messages.stream({
    model: MODEL, max_tokens: 64000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    thinking: { type: 'adaptive' }, output_config: { effort },
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content }],
  });
  let chars = 0; stream.on('text', d => { chars += d.length; if (chars % 2000 < d.length) log(`  … ${chars} characters`); });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error('Opus declined this request' + (msg.stop_details?.explanation ? ': ' + msg.stop_details.explanation : ''));
  if (msg.stop_reason === 'max_tokens') throw new Error('the answer was cut off (max_tokens): shorten the story or the target length');
  const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const u = msg.usage, cost = ((u.input_tokens || 0) * PRICE.input + (u.output_tokens || 0) * PRICE.output + (u.cache_read_input_tokens || 0) * PRICE.cacheRead + (u.cache_creation_input_tokens || 0) * PRICE.cacheWrite) / 1e6;
  return { json: parseJson(text), usage: { input: u.input_tokens, output: u.output_tokens, cacheRead: u.cache_read_input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0, cost: +cost.toFixed(4), model: msg.model } };
}
export function parseJson(text) {   // the first { … last } of the answer (tolerates a ```json fence or a sentence around it)
  const a = text.indexOf('{'), b = text.lastIndexOf('}'); if (a < 0 || b < a) throw new Error('Opus did not return JSON');
  return JSON.parse(text.slice(a, b + 1));
}

const settingsText = (p) => `PROJECT: ${p.id}\nASPECT: ${p.aspect}\nTARGET LENGTH: about ${p.seconds} seconds\nSTYLE WISH: ${p.style && p.style !== 'auto' ? p.style : 'decide yourself'}\n` +
  (p.notes ? `DIRECTOR NOTES FROM THE USER: ${p.notes}\n` : '');
const footageText = (clips = []) => clips.length ? '\nFOOTAGE available: ' + clips.map(c => `"${c.name}" (${c.description || ''}) at collage.footage { "dir": "${c.dir}", "name": "${c.name}" }`).join('; ') + '\n' : '';
const footageBlocks = (clips = []) => clips.flatMap(c => [
  { type: 'text', text: `FOOTAGE "${c.name}": ${c.description || '(no description)'}; ${c.duration?.toFixed?.(1) ?? '?'} s, ${c.size?.join('×') || ''}. Use it with collage.footage { "dir": "${c.dir}", "name": "${c.name}" }. Its middle frame:` },
  ...(c.thumb ? [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: c.thumb } }] : []),
]);

// story → { title, logline, style, manifest }
export async function direct(api, catalog, project, { log } = {}) {
  const content = [...footageBlocks(project.footage), { type: 'text', text: settingsText(project) + '\nSTORY:\n' + project.story }];
  const r = await ask(api, systemPrompt(catalog), content, { effort: 'high', log });
  return { ...normalise(r.json, project), usage: r.usage };
}
// the compiler blocked some shots: fix exactly those problems, keep everything else
export async function repair(api, catalog, project, manifest, report, { log } = {}) {
  const errs = report.shots.filter(s => s.errors.length).map(s => `${s.id}: ${s.errors.join(' | ')}`).join('\n');
  const content = [{ type: 'text', text: settingsText(project) + footageText(project.footage) + '\nThe compiler blocked these shots:\n' + errs +
    '\n\nReturn the same JSON object shape ({ title, logline, style, manifest }) with ONLY those problems fixed. Current manifest:\n' + JSON.stringify(manifest) }];
  const r = await ask(api, systemPrompt(catalog), content, { effort: 'medium', log });
  return { ...normalise(r.json, project), usage: r.usage };
}
// look at the rendered contact sheet (one frame per shot) and improve the direction
export async function review(api, catalog, project, manifest, sheetJpg, { log } = {}) {
  const content = [
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: sheetJpg } },
    { type: 'text', text: settingsText(project) + footageText(project.footage) + '\nAbove: a contact sheet of the rendered film, frames in shot order (labelled with their times). Artwork may be labelled MOCK stand-ins: judge composition, ' +
      'framing, readability, pacing, text placement, empty or cluttered frames and continuity, not the artwork itself. Return { "notes": ["<Thai: what you changed and why>", ...], "title", "logline", "style", "manifest" } with an improved manifest (same shot ids and timing).\nCurrent manifest:\n' + JSON.stringify(manifest) },
  ];
  const r = await ask(api, systemPrompt(catalog), content, { effort: 'high', log });
  return { ...normalise(r.json, project), notes: r.json.notes || [], usage: r.usage };
}

// fill in what the studio owns (ids, format, folders) and make shot times contiguous
export function normalise(out, project) {
  const M = out.manifest || out; M.schema = 'shot_manifest/1'; M.project_id = project.id; M.aspect = project.aspect; M.fps = 24; M.mode = 'motion_only';
  M.tolerance_seconds = M.tolerance_seconds ?? 2; M.target_seconds = M.target_seconds ?? project.seconds;
  let t = 0;
  for (const s of M.shots || []) {
    const d = Math.max(1.5, +(s.end - s.start) || 3); s.start = +t.toFixed(3); s.end = +(t + d).toFixed(3); t = s.end;
    s.backend = 'javascript_motion';
    if (s.collage) s.collage.assets = `assets/stories/${project.id}/`;
  }
  if (project.narration?.file) M.audio = { narration: { file: project.narration.file, measured: false } };
  return { title: out.title || project.title || project.id, logline: out.logline || '', style: out.style || {}, manifest: M };
}

// no AI: a plain kinetic-typography film from the story's sentences, for testing the pipeline without any cost
// the accent of a no-AI shot: a painted shape that pops and hops
function accent(txt, i, d, fw, fh) {
  return { id: 'accent', cap: 'popBounce', params: { at: .5, x: fw / 2, y: fh * .7, size: 110, shape: ['star', 'heart', 'circle'][i % 3], hops: 1 } };
}
export function testDirect(project) {
  const sents = project.story.split(/(?<=[.!?。])\s+|\n+|(?<=\S)\s{2,}/).map(s => s.trim()).filter(Boolean).slice(0, 8);
  const pieces = sents.length ? sents : [project.story.slice(0, 60)];
  const [fw, fh] = project.aspect === '16:9' ? [1920, 1080] : [1080, 1920], cx = fw / 2, cy = fh / 2;   // frame pixels of this format
  const moves = [[[cx, cy, 1], [cx, cy - 30, 1.12]], [[cx - 20, cy + 20, 1.1], [cx + 20, cy - 10, 1]], [[cx, cy - 20, 1], [cx, cy + 20, 1.08]]];
  const shots = pieces.map((txt, i) => {
    const d = Math.min(6, Math.max(2.2, txt.length / 13 + .4)), [from, to] = moves[i % 3];
    return { id: `S${String(i + 1).padStart(2, '0')}`, start: 0, end: d, narration: txt, treatment: 'kinetic_typography', purpose: 'no-AI test layout',
      camera: { cap: 'cameraMove', params: { from, to, dur: d, drift: 6 } },
      layers: [{ id: 'title', cap: ['type.pop', 'type.slide', 'type.impact'][i % 3], params: { text: txt.slice(0, 40), at: .2, y: .42, maxLines: 3, style: { font: 'display', weight: 800, size: 84, color: '#2B2233' } } },
        accent(txt, i, d, fw, fh)],
      transition_in: 'cut', expected_motion: { min_changed_frac: .01 } };
  });
  return normalise({ title: project.title || 'test', logline: 'no-AI test layout', style: { treatment: 'kinetic_typography', look: 'classic', rationale: 'pipeline test (no AI)' },
    manifest: { strategy: { name: 'test', look: 'classic', background: '#F3EBDD' }, shots } }, project);
}

export function loadConfig() { try { return JSON.parse(readFileSync('studio/config.local.json', 'utf8')); } catch (e) { return {}; } }
export const hasCredentials = cfg => (cfg.provider || 'claude-code') === 'claude-code' ? !!claudeCodeAvailable(cfg)
  : !!(cfg.anthropicApiKey || process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || existsSync((process.env.HOME || process.env.USERPROFILE || '') + '/.config/anthropic'));
