// tools/lib/harness.mjs: shared pieces of the visual test tools (aspect_test.mjs, look_test.mjs): argument parsing, one
// headless Chrome, explicit timeouts, opening a story / studio loop with page options, a low-res probe of one frame
// (cell image + pixel statistics + the page's layout info) and comparison sheets.
import puppeteer from 'puppeteer-core';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
export const LOAD_MS = 60000, FRAME_MS = 1000 * +(args['frame-timeout'] || 30), CELL = +(args.w || 180);
export const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, bad) => setTimeout(() => bad(new Error(`timeout after ${ms / 1000} s: ${what}`)), ms))]);

export async function launch() {
  const CHROME = [args.chrome, process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => p && existsSync(p));
  if (!CHROME) { console.error('Chrome not found: pass --chrome=<path> or set CHROME_PATH'); process.exit(1); }
  const gpu = args['soft-gl'] ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=default'];
  return puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 120000,
    args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), '--allow-file-access-from-files', '--ignore-gpu-blocklist', ...gpu, '--window-size=1920,1080', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
}

// Open a target ({ story } or { loop }) with page options ({ aspect, look }); page errors are collected into `errors`.
export async function openTarget(browser, T, opts, errors) {
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const q = Object.entries(opts).filter(([, v]) => v).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('');
  await withTimeout(page.goto(pathToFileURL(resolve(T.story ? 'story.html' : 'studio.html')).href + '?render' + (T.story ? '&story=' + T.story : '') + q, { waitUntil: 'load', timeout: LOAD_MS }), LOAD_MS, 'load ' + T.name);
  await page.waitForFunction('window.ready === true', { timeout: LOAD_MS });
  if (T.loop && !(await page.evaluate(n => { if (!LOOPS[n]) return false; window.LOOP = LOOPS[n]; return true; }, T.loop))) throw new Error('no loop ' + T.loop);
  return page;
}
export const cleanErrors = e => [...new Set(e)].filter(m => !/INVALID/.test(m));

// Render time t and return a small JPEG cell plus raw data for checks: edge bands, whole-frame statistics and the
// followed character's box statistics (from STAGE_INFO), and the page's layout info.
export function probe(page, t, cell = CELL) {
  return withTimeout(page.evaluate(async (t, cell) => {
    T = t; await redraw(); composite(t);
    const s = cell / Math.max(W, H), cw = Math.round(W * s), ch = Math.round(H * s), c = document.createElement('canvas');
    c.width = cw; c.height = ch; c.getContext('2d').drawImage(outC, 0, 0, cw, ch);
    // one GPU readback (toDataURL) serves both the cell and the pixel checks; under software GL (cloud, --soft-gl) each
    // readback of a full frame takes 15–30 s, so use --frame-timeout=90 there
    const url = c.toDataURL('image/jpeg', .85), im = new Image(); im.src = url; await im.decode();
    const cpu = document.createElement('canvas'); cpu.width = cw; cpu.height = ch;
    const x = cpu.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0);
    const px = x.getImageData(0, 0, cw, ch).data;
    const stats = (x0, y0, x1, y1) => {   // mean colour, luma mean / sd, clipped fractions, saturation
      x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(cw, Math.ceil(x1)); y1 = Math.min(ch, Math.ceil(y1));
      let n = 0, m = [0, 0, 0], q = [0, 0, 0], L = 0, L2 = 0, lo = 0, hi = 0, sat = 0;
      for (let y = y0; y < y1; y++) for (let xx = x0; xx < x1; xx++) {
        const i = (y * cw + xx) * 4, r = px[i], g = px[i + 1], b = px[i + 2], l = .2126 * r + .7152 * g + .0722 * b, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        n++; m[0] += r; m[1] += g; m[2] += b; q[0] += r * r; q[1] += g * g; q[2] += b * b; L += l; L2 += l * l; if (l < 6) lo++; if (l > 250) hi++; sat += mx ? (mx - mn) / mx : 0;
      }
      if (!n) return null;
      return { mean: m.map(v => v / n), sd: Math.max(...m.map((v, k) => Math.sqrt(Math.max(0, q[k] / n - (v / n) ** 2)))), lum: L / n, lsd: Math.sqrt(Math.max(0, L2 / n - (L / n) ** 2)), lo: lo / n, hi: hi / n, sat: sat / n };
    };
    const b = Math.max(2, Math.round(Math.min(cw, ch) * .03));
    const edges = { top: stats(0, 0, cw, b), bottom: stats(0, ch - b, cw, ch), left: stats(0, 0, b, ch), right: stats(cw - b, 0, cw, ch) };
    const stage = window.STAGE_INFO ? window.STAGE_INFO(t) : null, type = window.TYPE_INFO ? window.TYPE_INFO(t) : null;
    let subject = null;
    if (stage && stage.actors[0]) {   // the hero and a ring around it, for separation and identity checks
      const a = stage.actors[0], k = cw / W, w = (a.x1 - a.x0) * k, h = (a.y1 - a.y0) * k, X0 = a.x0 * k, Y0 = a.y0 * k;
      subject = { inner: stats(X0 + w * .2, Y0 + h * .2, X0 + w * .8, Y0 + h * .8), ring: stats(X0 - w * .6, Y0 - h * .3, X0 + w * 1.6, Y0 + h * 1.1) };
    }
    return { url, cw, ch, edges, frame: stats(0, 0, cw, ch), subject, stage, type, W, H, aspect: ASPECT(), look: typeof LOOK !== 'undefined' ? LOOK.name : null, clean: typeof LOOK !== 'undefined' && !LOOK.grain && !LOOK.paper };
  }, t, cell), FRAME_MS, `frame ${t}s`);
}

// A comparison sheet: one column per label, one row per frame, cells letterboxed into CELL × CELL squares.
export async function writeSheet(browser, file, columns, cell = CELL) {
  const page = await browser.newPage();
  const labels = Object.keys(columns), rows = Math.max(1, ...Object.values(columns).map(v => v.length));
  const url = await page.evaluate(async (cols, labels, n, S) => {
    const c = document.createElement('canvas'), pad = 6, head = 22; c.width = labels.length * (S + pad) + pad; c.height = head + n * (S + pad) + pad;
    const x = c.getContext('2d'); x.fillStyle = '#26222b'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#eee'; x.font = '14px sans-serif'; x.textAlign = 'center';
    for (let j = 0; j < labels.length; j++) {
      x.fillText(labels[j], pad + j * (S + pad) + S / 2, 16);
      for (let i = 0; i < cols[labels[j]].length; i++) {
        const r = cols[labels[j]][i], im = new Image(); im.src = r.url; await im.decode();
        x.drawImage(im, pad + j * (S + pad) + (S - r.cw) / 2, head + i * (S + pad) + (S - r.ch) / 2);
      }
    }
    return c.toDataURL('image/jpeg', .88);
  }, Object.fromEntries(labels.map(k => [k, columns[k].map(r => ({ url: r.url, cw: r.cw, ch: r.ch }))])), labels, rows, cell);
  await page.close();
  writeFileSync(file, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
}
