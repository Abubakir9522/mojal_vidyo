import { open, FIX, OUT, saveBlob, importFixture } from './helpers.mjs';
import path from 'node:path';
const { browser, page, errors } = await open('http://127.0.0.1:5199/', { dsf: 1.5 });
const tid = id => page.getByTestId(id);
const choose = async (trigger, files) => { const [fc] = await Promise.all([page.waitForEvent('filechooser'), trigger()]); await fc.setFiles(files.map(f => path.join(FIX, f))); };
const proj = () => page.evaluate(() => window.__player.project);
await page.waitForFunction(() => window.__t);

// Photo to video.
await tid('go-photo').click();
await choose(() => tid('photo-add').click(), ['photo.jpg', 'detail.jpg']);
await page.waitForFunction(() => document.querySelectorAll('.media-thumb').length === 2);
await tid('pstyle-d3').click();
await page.screenshot({ path: `${OUT}/50-photo.png` });
await tid('photo-run').click();
await page.waitForSelector('[data-testid=editor]');
await page.waitForTimeout(1500);
let p = await proj();
console.log('photo project', p.main.map(c => [c.kind, c.duration, c.motion, c.transition?.id]));

// Add a video through the sheet, then trim it by dragging its handle.
await tid('tool-add').click();
await choose(() => tid('add-media').click(), ['clip1.mp4']);
await page.waitForFunction(() => window.__player.project.main.length === 3, null, { timeout: 15000 });
await page.waitForTimeout(500);
const clip = tid('clip-main').nth(2);
await clip.scrollIntoViewIfNeeded();
await clip.click();
await page.waitForTimeout(300);
const before = (await proj()).main[2];
const h = await tid('handle-r').boundingBox();
await page.mouse.move(h.x + 5, h.y + 8);
await page.mouse.down(); await page.mouse.move(h.x - 55, h.y + 8, { steps: 5 }); await page.mouse.up();
await page.waitForTimeout(200);
const after = (await proj()).main[2];
console.log('trim right', before.out.toFixed(2), '->', after.out.toFixed(2));
const hl = await tid('handle-l').boundingBox();
await page.mouse.move(hl.x + 5, hl.y + 8);
await page.mouse.down(); await page.mouse.move(hl.x + 35, hl.y + 8, { steps: 5 }); await page.mouse.up();
await page.waitForTimeout(200);
console.log('trim left in', (await proj()).main[2].in.toFixed(2));

// Speed, volume, extract audio.
const setRange = (id, v) => page.evaluate(([id, v]) => { const e = document.querySelector(`[data-testid="${id}"]`); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, [id, v]);
await tid('tool-speed').click(); await setRange('speed', 2); await page.waitForTimeout(200); await tid('sheet-close').click();
await tid('tool-volume').click(); await setRange('volume', 0.5); await page.waitForTimeout(100);
await tid('extract').click(); await page.waitForTimeout(300); await tid('sheet-close').click();
p = await proj();
console.log('speed/vol/extract', p.main[2].speed, p.main[2].volume, p.main[2].muted, p.audio.map(a => [a.kind, +a.start.toFixed(2), +a.in.toFixed(2), +a.out.toFixed(2)]));

// Every tool sheet opens and closes without an error, for every kind of selection.
const openAll = async label => {
  const ids = await page.evaluate(() => [...document.querySelectorAll('[data-testid="tools"] .tool[data-testid]')].map(b => b.dataset.testid));
  for (const id of ids) {
    if (/split|dup|del|move|desel/.test(id)) continue;
    if (!(await tid(id).count())) continue; // Opening the text tool moves the selection to the new text.
    await tid(id).click();
    await page.waitForTimeout(120);
    const s = await tid('sheet').count();
    if (!s) { console.log('  no sheet for', label, id); continue; }
    await page.screenshot({ path: `${OUT}/sheet-${id}.png` });
    await tid('sheet-close').first().click();
    await page.waitForTimeout(60);
  }
  console.log('  sheets ok:', label, ids.length);
};
await openAll('video clip');
await tid('desel').click();
await tid('clip-main').first().click();
await openAll('image clip');
await tid('desel').click();
await openAll('root');
if (await tid('desel').count()) await tid('desel').click();
// The text sheet creates a text on open, so a text track now exists.
await tid('clip-tx').first().click();
await openAll('text');
await tid('desel').click();
await tid('clip-au').first().click();
await openAll('audio');
await tid('desel').click();

// Text animations and stickers.
await tid('tool-sticker').click();
await page.locator('.sticker-grid button').first().click();
await page.waitForTimeout(300);
await tid('desel').click();

// Format switch resizes the picture.
await tid('tool-format').click();
await tid('fmt-16x9').click();
await page.waitForTimeout(400);
console.log('canvas after 16:9', await page.evaluate(() => { const c = document.querySelector('canvas'); return [c.width, c.height]; }));
await page.screenshot({ path: `${OUT}/51-16x9.png` });
await tid('sheet-close').click();

// Auto tools.
await tid('tool-auto').click();
await tid('auto-color').click();
await page.waitForSelector('[data-testid=toast]');
console.log('auto color', await tid('toast').textContent(), (await proj()).main.filter(c => Object.values(c.adjust).some(Boolean)).length);
await tid('auto-trans').click();
await tid('sheet-close').click();

// Dragging text on the picture moves it.
await tid('clip-tx').first().click();
await page.waitForTimeout(200);
const tx0 = (await proj()).texts[0];
const cv = await tid('preview').boundingBox();
const tx = cv.x + cv.width * tx0.x, ty = cv.y + cv.height * tx0.y;
await page.mouse.move(tx, ty); await page.mouse.down(); await page.mouse.move(tx + 40, ty - 30, { steps: 4 }); await page.mouse.up();
await page.waitForTimeout(200);
const tx1 = (await proj()).texts[0];
console.log('text drag', tx0.x.toFixed(2), tx0.y.toFixed(2), '->', tx1.x.toFixed(2), tx1.y.toFixed(2));
console.log('errors', errors.slice(0, 8));
await browser.close();
