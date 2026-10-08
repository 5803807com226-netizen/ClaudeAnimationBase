// node styleframes/render.mjs [a b c] → styleframes/out/style_<s>.png (headless Chrome, same flags as render.mjs).
import { createRequire } from 'node:module'; import { writeFileSync, existsSync } from 'node:fs'; import { resolve } from 'node:path'; import { pathToFileURL } from 'node:url';
const puppeteer = createRequire(import.meta.url)('puppeteer-core');
const chrome = [process.env.CHROME_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find(p => p && existsSync(p));
const b = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--allow-file-access-from-files'] });
for (const s of process.argv.slice(2).length ? process.argv.slice(2) : ['a', 'b', 'c']) {
  const p = await b.newPage(); p.on('pageerror', e => console.log('ERR', s, e.message));
  const t0 = Date.now();
  await p.goto(pathToFileURL(resolve('styleframes/frame.html')).href + '?s=' + s); await p.waitForFunction('window.done === true', { timeout: 300000 });
  const url = await p.evaluate(() => document.getElementById('c').toDataURL('image/png'));
  writeFileSync(`styleframes/out/style_${s}.png`, Buffer.from(url.split(',')[1], 'base64')); console.log(`style_${s}.png  ${Date.now() - t0} ms`);
}
await b.close();
