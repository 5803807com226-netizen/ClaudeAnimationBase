// tools/comfy/test_client.mjs: tests tools/comfy/client.mjs against a MOCK ComfyUI server that speaks the same HTTP API
// (/prompt, /history/<id>, /view, /upload/image). No GPU, no model: it checks that the client binds the prompt, negative
// prompt, seed and size into typical Z-Image / Qwen-Image API workflows, queues them, waits (bounded) and downloads the
// image, and that it refuses UI-format workflows and gives up after its timeout.
//   node tools/comfy/test_client.mjs
import http from 'node:http';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { comfyGenerate, autoBind } from './client.mjs';

const dir = 'out/test/comfy'; mkdirSync(dir, { recursive: true });
execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['tools/comfy/imageops.py', 'mock', '--out', `${dir}/img.png`, '--prompt', 'circle', '--size', '64,64']);
const PNG = readFileSync(`${dir}/img.png`);
// workflows in ComfyUI API format, shaped like the stock Z-Image Turbo and Qwen-Image text-to-image templates
const zimage = { 3: { class_type: 'KSampler', inputs: { seed: 1, steps: 8, cfg: 1, positive: ['6', 0], negative: ['7', 0], latent_image: ['13', 0], model: ['16', 0] } },
  6: { class_type: 'CLIPTextEncode', inputs: { text: 'old', clip: ['18', 0] } }, 7: { class_type: 'CLIPTextEncode', inputs: { text: 'old neg', clip: ['18', 0] } },
  13: { class_type: 'EmptySD3LatentImage', inputs: { width: 1024, height: 1024, batch_size: 1 } }, 9: { class_type: 'SaveImage', inputs: { images: ['8', 0], filename_prefix: 'z' } } };
const qwen = { 3: { class_type: 'KSampler', inputs: { seed: 1, positive: ['6', 0], negative: ['20', 0], latent_image: ['58', 0] } },
  6: { class_type: 'CLIPTextEncode', inputs: { text: 'old', clip: ['38', 0] } }, 20: { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['7', 0] } },
  7: { class_type: 'CLIPTextEncode', inputs: { text: 'old neg', clip: ['38', 0] } }, 58: { class_type: 'EmptySD3LatentImage', inputs: { width: 1328, height: 1328, batch_size: 1 } },
  71: { class_type: 'LoadImage', inputs: { image: 'none.png' } }, 60: { class_type: 'SaveImage', inputs: { images: ['8', 0], filename_prefix: 'q' } } };
writeFileSync(`${dir}/zimage_api.json`, JSON.stringify(zimage)); writeFileSync(`${dir}/qwen_api.json`, JSON.stringify(qwen));
writeFileSync(`${dir}/ui.json`, JSON.stringify({ nodes: [], links: [] }));

let received = null, uploads = 0, slow = false;
const server = http.createServer((req, res) => {
  let body = []; req.on('data', c => body.push(c)); req.on('end', () => {
    const json = o => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
    if (req.url === '/prompt') { received = JSON.parse(Buffer.concat(body)).prompt; return json({ prompt_id: 'p1' }); }
    if (req.url.startsWith('/history/')) return json(slow ? {} : { p1: { status: { status_str: 'success' }, outputs: { 9: { images: [{ filename: 'z_0001.png', subfolder: '', type: 'output' }] } } } });
    if (req.url.startsWith('/view')) { res.setHeader('Content-Type', 'image/png'); return res.end(PNG); }
    if (req.url === '/upload/image') { uploads++; return json({ name: 'ref_uploaded.png' }); }
    res.statusCode = 404; res.end();
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}`, job = { positive: 'POS', negative: 'NEG', seed: 4242, width: 1344, height: 832 };
const results = [], ok = (name, pass, info = '') => results.push({ name, pass: !!pass, info });
try {
  const b = autoBind(zimage);
  ok('z-image: finds prompt, negative, seed, size', b.positive === '6.text' && b.negative === '7.text' && b.seed === '3.seed' && b.width === '13.width', JSON.stringify(b));
  const png = await comfyGenerate({ server: url, workflow: `${dir}/zimage_api.json` }, job, { timeout: 20 });
  ok('z-image: job queued with the values bound', received[6].inputs.text === 'POS' && received[7].inputs.text === 'NEG' && received[3].inputs.seed === 4242 && received[13].inputs.width === 1344 && received[13].inputs.height === 832);
  ok('z-image: the image is downloaded', png.equals(PNG));
  const bq = autoBind(qwen);
  ok('qwen: negative found through ConditioningZeroOut', bq.negative === '7.text' && bq.image === '71.image', JSON.stringify(bq));
  await comfyGenerate({ server: url, workflow: `${dir}/qwen_api.json` }, { ...job, ref: PNG }, { timeout: 20 });
  ok('qwen: reference image uploaded and bound', uploads === 1 && received[71].inputs.image === 'ref_uploaded.png');
  await comfyGenerate({ server: url, workflow: `${dir}/zimage_api.json`, bind: { positive: '7.text' } }, job, { timeout: 20 });
  ok('explicit bind overrides the automatic one', received[7].inputs.text === 'POS');
  let err = ''; try { await comfyGenerate({ server: url, workflow: `${dir}/ui.json` }, job); } catch (e) { err = e.message; }
  ok('a UI-format workflow is refused with a clear message', /Save \(API Format\)/.test(err), err);
  slow = true; err = ''; const t0 = Date.now();
  try { await comfyGenerate({ server: url, workflow: `${dir}/zimage_api.json` }, job, { timeout: 3 }); } catch (e) { err = e.message; }
  ok('a job that never finishes gives up after its timeout', /within 3 s/.test(err) && Date.now() - t0 < 6000, err);
} finally { server.close(); }
let failed = 0; for (const r of results) { if (!r.pass) failed++; console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : '  ' + r.info}`); }
console.log(failed ? `\n${failed} failed` : '\nall passed'); process.exit(failed ? 1 : 0);
