import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
export const FIX = path.resolve('tests/fixtures');
export const OUT = path.resolve('tests/out');
export async function open(url = 'http://127.0.0.1:5199/', opts = {}) {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: opts.viewport ?? { width: 412, height: 860 }, deviceScaleFactor: opts.dsf ?? 1, hasTouch: !!opts.touch, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(url);
  return { browser, ctx, page, errors };
}
/** Puts a local fixture into the page as a File, then imports it through the real media store. */
export async function importFixture(page, name, type) {
  const b64 = fs.readFileSync(path.join(FIX, name)).toString('base64');
  return page.evaluate(async ({ b64, name, type }) => {
    const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return window.__t.media.importFile(new File([bin], name, { type }));
  }, { b64, name, type });
}
export async function saveBlob(page, handle, file) {
  const b64 = await page.evaluate(async b => { const buf = new Uint8Array(await b.arrayBuffer()); let s = ''; const cs = 0x8000; for (let i = 0; i < buf.length; i += cs) s += String.fromCharCode.apply(null, buf.subarray(i, i + cs)); return btoa(s); }, handle);
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
}
