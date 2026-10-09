// tools/comfy/client.mjs: a small ComfyUI API client for tools/gen_assets.mjs. It uses YOUR workflows as they are:
// export each one from ComfyUI with "Save (API Format)" (Settings → enable dev mode options), point
// tools/comfy/engines.local.json at the file, and the client finds where to put the prompt, negative prompt, seed and
// image size by following the sampler's links. If a workflow is unusual, give explicit bindings ("<node id>.<input>").
//
//   const job = await comfyGenerate({ server, workflow, bind }, { positive, negative, seed, width, height, ref }, { timeout })
//   → Buffer (PNG) of the first image the workflow saved
import { readFileSync } from 'node:fs';

export function loadWorkflow(file) {
  const wf = JSON.parse(readFileSync(file, 'utf8'));
  if (Array.isArray(wf.nodes)) throw new Error(`${file} is a UI workflow; export it with "Save (API Format)" instead`);
  return wf;
}

// Find the nodes to write into. Returns { positive, negative, seed, width, height, image } as "<id>.<input>" paths.
export function autoBind(wf) {
  const nodes = Object.entries(wf), find = f => nodes.filter(([, n]) => f(n.class_type || '', n));
  const textInput = id => { const n = wf[id]; if (!n) return null; for (const k of ['text', 'prompt', 'text_g', 'positive']) if (typeof n.inputs[k] === 'string') return `${id}.${k}`;
    for (const v of Object.values(n.inputs)) if (Array.isArray(v)) { const r = textInput(v[0]); if (r) return r; } return null; };   // through conditioning nodes
  const b = {};
  const sampler = find(c => /KSampler|SamplerCustom/.test(c))[0];
  if (sampler) {
    const [sid, s] = sampler;
    if (Array.isArray(s.inputs.positive)) b.positive = textInput(s.inputs.positive[0]);
    if (Array.isArray(s.inputs.negative)) b.negative = textInput(s.inputs.negative[0]);
    if ('seed' in s.inputs && !Array.isArray(s.inputs.seed)) b.seed = `${sid}.seed`;
    else if ('noise_seed' in s.inputs && !Array.isArray(s.inputs.noise_seed)) b.seed = `${sid}.noise_seed`;
  }
  if (!b.seed) { const n = find(c => /RandomNoise/.test(c))[0]; if (n) b.seed = `${n[0]}.noise_seed`; }
  if (!b.positive) { const n = find(c => /TextEncode/.test(c))[0]; if (n) b.positive = textInput(n[0]); }
  const lat = find((c, n) => /EmptyLatent|EmptySD3Latent|EmptyHunyuanLatent|EmptyQwen|EmptyLTXV/i.test(c) && 'width' in n.inputs)[0];
  if (lat) { b.width = `${lat[0]}.width`; b.height = `${lat[0]}.height`; if ('length' in lat[1].inputs) b.length = `${lat[0]}.length`; }   // video latents: frame count
  if (!b.length) { const v = find((c, n) => /LTXV.*(ImgToVideo|Img2Vid)/i.test(c) && 'length' in n.inputs)[0]; if (v) { b.length = `${v[0]}.length`; b.width = b.width || `${v[0]}.width`; b.height = b.height || `${v[0]}.height`; } }
  const img = find(c => c === 'LoadImage')[0]; if (img) b.image = `${img[0]}.image`;
  return b;
}
const setPath = (wf, path, v) => { const [id, k] = path.split('.'); if (!wf[id]) throw new Error(`binding ${path}: no node ${id}`); wf[id].inputs[k] = v; };

async function uploadImage(server, buf, name) {
  const fd = new FormData(); fd.append('image', new Blob([buf], { type: 'image/png' }), name); fd.append('overwrite', 'true');
  const r = await fetch(`${server}/upload/image`, { method: 'POST', body: fd }); if (!r.ok) throw new Error(`upload failed: ${r.status}`);
  return (await r.json()).name;
}

export async function comfyGenerate(engine, job, { timeout = 600 } = {}) {
  const server = engine.server.replace(/\/$/, ''), wf = structuredClone(loadWorkflow(engine.workflow)), bind = { ...autoBind(wf), ...(engine.bind || {}) };
  if (!bind.positive) throw new Error(`${engine.workflow}: could not find the prompt input; add "bind": { "positive": "<node>.<input>" }`);
  if (bind.negative && job.negative != null && bind.negative !== bind.positive) setPath(wf, bind.negative, job.negative);
  setPath(wf, bind.positive, job.positive);   // last: an explicit positive binding always wins
  if (bind.seed) setPath(wf, bind.seed, job.seed);
  if (bind.width && job.width) { setPath(wf, bind.width, job.width); setPath(wf, bind.height, job.height); }
  if (bind.length && job.length) setPath(wf, bind.length, job.length);
  if (job.ref && bind.image) setPath(wf, bind.image, await uploadImage(server, job.ref, `ref_${job.seed}.png`));
  const q = await fetch(`${server}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: wf, client_id: 'claudeanimationbase' }) });
  if (!q.ok) throw new Error(`ComfyUI rejected the workflow: ${q.status} ${await q.text()}`);
  const { prompt_id } = await q.json(), t0 = Date.now();
  while (Date.now() - t0 < timeout * 1000) {   // bounded wait: poll the history until the job has outputs, or give up
    await new Promise(r => setTimeout(r, 1500));
    const h = await (await fetch(`${server}/history/${prompt_id}`)).json(), run = h[prompt_id];
    if (!run) continue;
    if (run.status?.status_str === 'error') throw new Error('ComfyUI job failed: ' + JSON.stringify(run.status.messages?.slice(-1)));
    // any saved file (images, or videos from SaveVideo / VideoHelperSuite 'gifs'); a video is preferred when asked for
    const files = Object.values(run.outputs || {}).flatMap(o => Object.values(o).filter(Array.isArray).flat()).filter(f => f && f.filename);
    if (files.length) {
      const pick = (job.video && files.find(f => /\.(mp4|webm|mov|mkv|gif|webp)$/i.test(f.filename))) || files[0];
      const u = `${server}/view?filename=${encodeURIComponent(pick.filename)}&subfolder=${encodeURIComponent(pick.subfolder || '')}&type=${pick.type || 'output'}`;
      return Buffer.from(await (await fetch(u)).arrayBuffer());
    }
    if (run.status?.completed) throw new Error('ComfyUI job finished without saving any file (add a Save node)');
  }
  throw new Error(`ComfyUI job ${prompt_id} produced no image within ${timeout} s`);
}
