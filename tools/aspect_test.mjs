// tools/aspect_test.mjs: the multi-aspect regression test. Renders a few LOW-RES frames of each target at 9:16, 16:9
// and 4:5 in one headless Chrome, writes a side-by-side comparison sheet per target and runs automatic checks:
//   - page errors while loading or drawing                                   → FAIL
//   - the followed character's box outside the action-safe area (STAGE_INFO) → FAIL
//   - a text block outside the frame / the title-safe area (TYPE_INFO)       → FAIL
//   - a flat, light band along an edge (probably uncovered paper/canvas)    → NEEDS_REVIEW
// Every page load and frame has an explicit timeout; nothing waits without a limit.
//
//   node tools/aspect_test.mjs [--only=phase2_lumo,preset_popBounce] [--aspects=9:16,4:5] [--frames=2] [--w=180]
//                              [--frame-timeout=30 (s)] [--chrome=<path>] [--soft-gl] [--verbose]
// Output: out/aspect/<target>.jpg (columns: 9:16 · 16:9 · 4:5, rows: times) and out/aspect/report.json / report.md.
// Exit code 1 if any target FAILs.
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const ASPECTS = args.aspects ? String(args.aspects).split(',') : ['9:16', '16:9', '4:5'], CELL = +(args.w || 180), LOAD_MS = 60000, FRAME_MS = 1000 * +(args['frame-timeout'] || 30), OUT = 'out/aspect';
// Targets: story id or studio loop, and the times to check (a few per target, spread over its length).
const TARGETS = [
  { name: 'phase2_lumo', story: 'phase2_lumo', times: [.8, 2.6, 4.4, 6.4] },
  { name: 'phase1_demo', story: 'phase1_demo', times: [.8, 2.4, 4.2, 6] },
  { name: 'type_demo', story: 'type_demo', times: [.6, 1.6, 2.6, 3.6, 4.6] },
  ...['cameraMove', 'popBounce', 'shapeMorph', 'brushWipe', 'objectReveal', 'particleBurst'].map(p => ({ name: 'preset_' + p, loop: 'preset_' + p, times: [.4, 1.4, 2.6] })),
];
const only = args.only ? String(args.only).split(',') : null;
const CHROME = [args.chrome, process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => p && existsSync(p));
if (!CHROME) { console.error('Chrome not found: pass --chrome=<path> or set CHROME_PATH'); process.exit(1); }
const gpu = args['soft-gl'] ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=default'];
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, bad) => setTimeout(() => bad(new Error(`timeout after ${ms / 1000} s: ${what}`)), ms))]);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 120000,
  args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), '--allow-file-access-from-files', '--ignore-gpu-blocklist', ...gpu, '--window-size=1920,1080', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
mkdirSync(OUT, { recursive: true });

// In the page: render time t, return a small JPEG cell plus the checks' raw data.
async function probe(page, t, cell) {
  return page.evaluate(async (t, cell) => {
    T = t; await redraw(); composite(t);
    const s = cell / Math.max(W, H), cw = Math.round(W * s), ch = Math.round(H * s), c = document.createElement('canvas');
    c.width = cw; c.height = ch; c.getContext('2d').drawImage(outC, 0, 0, cw, ch);
    // one GPU readback (toDataURL) serves both the sheet cell and the pixel check; under software GL (cloud, --soft-gl)
    // each readback of a full frame takes 15–30 s, so use --frame-timeout=120 there
    const url = c.toDataURL('image/jpeg', .85), im = new Image(); im.src = url; await im.decode();
    const cpu = document.createElement('canvas'); cpu.width = cw; cpu.height = ch;
    const x = cpu.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0);
    // edge bands: per-channel standard deviation of a 3 % strip along each edge (paper grain alone gives ~2–4)
    const px = x.getImageData(0, 0, cw, ch).data, band = (x0, y0, x1, y1) => { let n = 0, m = [0, 0, 0], q = [0, 0, 0];
      for (let y = y0; y < y1; y++) for (let xx = x0; xx < x1; xx++) { const i = (y * cw + xx) * 4; n++; for (let k = 0; k < 3; k++) { m[k] += px[i + k]; q[k] += px[i + k] ** 2; } }
      return { sd: Math.max(...m.map((v, k) => Math.sqrt(Math.max(0, q[k] / n - (v / n) ** 2)))), lum: (m[0] + m[1] + m[2]) / 3 / n }; };
    const b = Math.max(2, Math.round(Math.min(cw, ch) * .03));
    const edges = { top: band(0, 0, cw, b), bottom: band(0, ch - b, cw, ch), left: band(0, 0, b, ch), right: band(cw - b, 0, cw, ch) };
    const stage = window.STAGE_INFO ? window.STAGE_INFO(t) : null, type = window.TYPE_INFO ? window.TYPE_INFO(t) : null;
    return { url, cw, ch, edges, stage, type, W, H, aspect: ASPECT() };
  }, t, cell);
}

function check(r, t) {
  const fails = [], review = [], tol = 4 * Math.min(r.W, r.H) / 1080;
  const out = (b, s) => b.x0 < s.x0 - tol || b.y0 < s.y0 - tol || b.x1 > s.x1 + tol || b.y1 > s.y1 + tol;
  for (const a of r.stage?.actors || []) if (out(a, r.stage.safe)) fails.push(`${t}s: character box ${fmt(a)} leaves the action-safe area ${fmt(r.stage.safe)}`);
  for (const it of r.type?.items || []) {
    if (out(it, { x0: 0, y0: 0, x1: r.W, y1: r.H })) fails.push(`${t}s: text "${it.id}" ${fmt(it)} overflows the frame`);
    else if (out(it, r.type.safe)) fails.push(`${t}s: text "${it.id}" ${fmt(it)} leaves the title-safe area ${fmt(r.type.safe)}`);
  }
  // a flat AND light band looks like bare paper / an empty canvas; smooth dark skies are fine
  for (const [e, { sd, lum }] of Object.entries(r.edges)) if (sd < 1.2 && lum > 200) review.push(`${t}s: flat light ${e} edge (σ ${sd.toFixed(1)}, lum ${lum.toFixed(0)}): uncovered background?`);
  return { fails, review };
}
const fmt = b => `[${[b.x0, b.y0, b.x1, b.y1].map(v => Math.round(v)).join(',')}]`;

const report = [];
for (const T of TARGETS.filter(x => !only || only.includes(x.name))) {
  const row = { name: T.name, aspects: {} };
  const cells = {};
  for (const A of ASPECTS) {
    const res = { status: 'PASS', fails: [], review: [], errors: [] };
    const page = await browser.newPage();
    page.on('pageerror', e => res.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') res.errors.push(m.text()); });
    try {
      const url = pathToFileURL(resolve(T.story ? 'story.html' : 'studio.html')).href + '?render' + (T.story ? '&story=' + T.story : '') + '&aspect=' + A;
      await withTimeout(page.goto(url, { waitUntil: 'load', timeout: LOAD_MS }), LOAD_MS, 'load ' + T.name);
      await page.waitForFunction('window.ready === true', { timeout: LOAD_MS });
      if (T.loop && !(await page.evaluate(n => { if (!LOOPS[n]) return false; window.LOOP = LOOPS[n]; return true; }, T.loop))) throw new Error('no loop ' + T.loop);
      cells[A] = [];
      for (const t of T.times.slice(0, +(args.frames || 99))) {
        const t0 = Date.now(), r = await withTimeout(probe(page, t, CELL), FRAME_MS, `${T.name} ${A} ${t}s`);
        if (args.verbose) console.log(`  ${T.name} ${A} ${t}s  ${Date.now() - t0} ms`);
        if (r.aspect !== A) res.fails.push(`page reports aspect ${r.aspect}, expected ${A}`);
        const c = check(r, t); res.fails.push(...c.fails); res.review.push(...c.review); cells[A].push(r);
      }
    } catch (e) { res.errors.push(e.message); }
    await page.close();
    res.errors = [...new Set(res.errors)].filter(m => !/INVALID/.test(m));
    if (res.errors.length || res.fails.length) res.status = 'FAIL'; else if (res.review.length) res.status = 'NEEDS_REVIEW';
    row.aspects[A] = res;
    console.log(`${T.name.padEnd(22)} ${A.padEnd(5)} ${res.status}${[...res.errors, ...res.fails, ...res.review].slice(0, 3).map(m => '\n    ' + m).join('')}`);
  }
  // comparison sheet: one column per aspect, one row per time, cells letterboxed into a CELL × CELL square
  const page = await browser.newPage();
  const url = await page.evaluate(async (cells, aspects, n, S) => {
    const c = document.createElement('canvas'), pad = 6, head = 22; c.width = aspects.length * (S + pad) + pad; c.height = head + n * (S + pad) + pad;
    const x = c.getContext('2d'); x.fillStyle = '#26222b'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#eee'; x.font = '14px sans-serif';
    for (let j = 0; j < aspects.length; j++) {
      x.fillText(aspects[j], pad + j * (S + pad) + S / 2 - 14, 16);
      for (let i = 0; i < (cells[aspects[j]] || []).length; i++) {
        const r = cells[aspects[j]][i], im = new Image(); im.src = r.url; await im.decode();
        x.drawImage(im, pad + j * (S + pad) + (S - r.cw) / 2, head + i * (S + pad) + (S - r.ch) / 2);
      }
    }
    return c.toDataURL('image/jpeg', .88);
  }, Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, v.map(r => ({ url: r.url, cw: r.cw, ch: r.ch }))])), ASPECTS, Math.max(1, ...Object.values(cells).map(v => v.length)), CELL);
  await page.close();
  writeFileSync(`${OUT}/${T.name}.jpg`, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
  report.push(row);
}
await browser.close();
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
const md = ['| target | ' + ASPECTS.join(' | ') + ' |', '|---|' + ASPECTS.map(() => '---').join('|') + '|',
  ...report.map(r => `| ${r.name} | ${ASPECTS.map(a => r.aspects[a].status).join(' | ')} |`)];
writeFileSync(`${OUT}/report.md`, md.join('\n') + '\n');
console.log('\n' + md.join('\n') + `\nsheets and report: ${OUT}/`);
process.exit(report.some(r => ASPECTS.some(a => r.aspects[a].status === 'FAIL')) ? 1 : 0);
