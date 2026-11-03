import { open, OUT, saveBlob } from './helpers.mjs';
import fs from 'node:fs';
const { browser, page, errors } = await open();
await page.waitForFunction(() => window.__t);
const b64 = fs.readFileSync(process.argv[2]).toString('base64');
const h = await page.evaluateHandle(async b64 => {
  const { media, cutoutPerson, ty, Compositor } = window.__t;
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const a = await media.importFile(new File([bin], 'person.png', { type: 'image/png' }));
  const o = await cutoutPerson(a);
  window.__o = { kind: o.kind, w: o.width, h: o.height };
  // Drawn on a coloured background by the real compositor, to confirm transparency reaches the video.
  const cv = document.createElement('canvas'); const c = new Compositor(cv); c.setSize(360, 640);
  const bmp = await media.getImage(o.id);
  const p = ty.newProject('9:16'); p.background = '#16a9b8';
  p.main = [ty.newClip({ kind: 'image', mediaId: o.id, duration: 2, transform: { ...ty.NO_TRANSFORM, fit: 'contain' } })];
  c.render(p, 1, () => ({ source: bmp, width: bmp.width, height: bmp.height, cacheKey: 'p' }));
  const out = document.createElement('canvas'); out.width = 360; out.height = 640; out.getContext('2d').drawImage(cv, 0, 0);
  return new Promise(r => out.toBlob(r, 'image/png'));
}, b64);
console.log(await page.evaluate(() => window.__o));
await saveBlob(page, h, `${OUT}/cutout.png`);
console.log(errors.slice(0, 5));
await browser.close();
