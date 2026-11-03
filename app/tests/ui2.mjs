import { open, FIX, OUT, saveBlob } from './helpers.mjs';
import path from 'node:path';
const { browser, page, errors } = await open('http://127.0.0.1:5199/', { dsf: 1.5 });
const shot = n => page.screenshot({ path: `${OUT}/${n}.png` });
const tid = id => page.getByTestId(id);
const choose = async (trigger, files) => { const [fc] = await Promise.all([page.waitForEvent('filechooser'), trigger()]); await fc.setFiles(files.map(f => path.join(FIX, f))); };
const external = [];
page.on('request', r => { const u = new URL(r.url()); if (!['127.0.0.1', 'localhost'].includes(u.hostname) && !['data:', 'blob:'].includes(u.protocol)) external.push(r.url()); });

// Beat detection against a click track of known tempo.
await page.waitForFunction(() => window.__t);
const beat = await page.evaluate(async () => {
  const r = await fetch('/tests/fixtures/beat120.mp3'); const b = await r.blob();
  const { bpm, beats, strong } = await window.__t.detectBeats(b);
  return { bpm, n: beats.length, first: beats.slice(0, 5), strong: strong.length };
});
console.log('beat120', beat);
const bm = await page.evaluate(async () => {
  const out = {};
  for (const [n, exp] of [['kuch', 128], ['ritm', 140], ['bayram', 110], ['quvnoq', 118]]) { const b = await (await fetch(`/music/${n}.mp3`)).blob(); out[n] = [exp, (await window.__t.detectBeats(b)).bpm]; }
  return out;
});
console.log('music tempo [expected, found]', bm);

// Auto montage through the real screen.
await tid('go-auto').click();
await page.waitForTimeout(200);
await choose(() => tid('auto-add').click(), ['clip1.mp4', 'clip2.mp4', 'photo.jpg']);
await page.waitForFunction(() => document.querySelectorAll('.media-thumb').length === 3);
await tid('style-reklama').click();
await tid('auto-title').fill('Yangi tariflar');
await tid('music-music:kuch').click();
await page.waitForFunction(() => document.querySelector('.music-row.on'), null, { timeout: 15000 });
await shot('20-auto');
await tid('auto-run').click();
await page.waitForSelector('[data-testid=editor]', { timeout: 120000 });
await page.waitForTimeout(2500);
await shot('21-auto-result');
const info = await page.evaluate(() => { const p = window.__player.project; return { clips: p.main.map(c => [c.kind, +(c.kind === 'video' ? c.out - c.in : c.duration).toFixed(2), c.transition?.id, c.effects.map(e => e.id).join('+'), c.motion, Object.values(c.adjust).some(Boolean)]), audio: p.audio.map(a => [a.name, a.start, a.in, a.beats?.length]), dur: window.__t.tl.projectDuration(p) }; });
console.log('auto', JSON.stringify(info));

// Export through the real sheet.
await tid('export-open').click();
await page.waitForTimeout(200);
await page.locator('.chip', { hasText: '480p' }).click();
await page.locator('.chip', { hasText: '24 kadr' }).click();
await shot('22-export');
console.log(await tid('export-est').textContent());
await tid('export-run').click();
await page.waitForTimeout(1500);
await shot('23-exporting');
await page.waitForSelector('[data-testid=export-done]', { timeout: 200000 });
await shot('24-done');
const h = await page.evaluateHandle(() => window.__lastExport.file);
await saveBlob(page, h, `${OUT}/auto.mp4`);
const [dl] = await Promise.all([page.waitForEvent('download'), tid('export-save').click()]);
console.log('download', dl.suggestedFilename());
await tid('export-close').click();

// Reloading keeps the project and its files.
await tid('ed-back').click();
await page.waitForSelector('.home');
await page.waitForTimeout(400);
await page.reload();
await page.waitForSelector('.home');
await page.waitForTimeout(800);
await shot('25-home-projects');
console.log('projects after reload', await tid('project').count());
await tid('project').first().click();
await page.waitForSelector('[data-testid=editor]');
await page.waitForTimeout(2500);
await page.evaluate(() => { document.querySelector('[data-testid=tl-scroll]').scrollLeft = 300; });
await page.waitForTimeout(1500);
await shot('26-reopened');
console.log('player err', await page.evaluate(() => window.__player.lastError));
console.log('external requests', external);
console.log('errors', errors.slice(0, 10));
await browser.close();
