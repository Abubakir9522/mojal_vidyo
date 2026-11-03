import { open, FIX, OUT } from './helpers.mjs';
import path from 'node:path';
const { browser, page, errors } = await open('http://127.0.0.1:5199/', { dsf: 1.5 });
const shot = n => page.screenshot({ path: `${OUT}/${n}.png` });
const tid = id => page.getByTestId(id);
const choose = async (trigger, files) => { const [fc] = await Promise.all([page.waitForEvent('filechooser'), trigger()]); await fc.setFiles(files.map(f => path.join(FIX, f))); };
await page.waitForSelector('.home');
await page.waitForTimeout(600);
await shot('01-home');
await tid('tab-templates').click();
await page.waitForTimeout(800);
await shot('02-templates');
console.log('templates shown', await page.locator('[data-testid^=tpl-sv], [data-testid^=tpl-]').count());
await tid('tab-home').click();
await tid('new-project').click();
await page.waitForTimeout(100);
await shot('03-aspect');
await choose(() => tid('aspect-9x16').click(), ['clip1.mp4', 'photo.jpg', 'clip2.mp4']);
await page.waitForSelector('[data-testid=editor]', { timeout: 30000 });
await page.waitForTimeout(2000);
await shot('04-editor');
console.log('main clips', await tid('clip-main').count(), 'time', await tid('time').textContent());
// Select first clip, open effects.
await tid('clip-main').first().click();
await page.waitForTimeout(200);
await shot('05-selected');
await tid('tool-effects').click();
await page.waitForTimeout(600);
await tid('fx-x_cube').click();
await page.waitForTimeout(700);
await shot('06-effects');
await tid('sheet-close').click();
// Add transition.
await tid('tr-btn').first().click();
await page.waitForTimeout(500);
await tid('tr-t_cubeL').click();
await page.waitForTimeout(300);
await shot('07-transition');
await tid('sheet-close').click();
await tid('desel').click();
// Text.
await tid('tool-textnew').click();
await page.waitForTimeout(300);
await tid('text-input').fill("Salom, do'stlar!");
await page.waitForTimeout(400);
await shot('08-text');
await tid('sheet-close').click();
await tid('desel').click();
// Music.
await tid('tool-audio').click();
await page.waitForTimeout(300);
await shot('09-audio');
await tid('music-music:kuch').click();
await page.waitForSelector('[data-testid=clip-au]');
await page.waitForTimeout(800);
await tid('desel').click();
await page.waitForTimeout(300);
await shot('10-timeline-full');
// Split.
const before = await tid('clip-main').count();
await page.evaluate(() => { document.querySelector('[data-testid=tl-scroll]').scrollLeft = 120; });
await page.waitForTimeout(500);
await tid('tool-split').click();
await page.waitForTimeout(300);
console.log('split', before, '->', await tid('clip-main').count(), 'time', await tid('time').textContent());
// Undo / redo.
await tid('undo').click(); await page.waitForTimeout(200);
console.log('undo ->', await tid('clip-main').count());
await tid('redo').click(); await page.waitForTimeout(200);
console.log('redo ->', await tid('clip-main').count());
// Playback really advances.
await tid('play').click();
await page.waitForTimeout(2500);
const t1 = await tid('time').textContent();
await tid('play').click();
console.log('after play', t1, 'player err', await page.evaluate(() => window.__player.lastError));
await page.waitForTimeout(400);
await shot('11-playing');
// Scene.
await tid('tool-scene3d').click(); await page.waitForTimeout(500);
await shot('12-scenes');
await tid('scene-phone').click(); await page.waitForTimeout(300);
await tid('scene-text').fill('CHIROYLI RAQAMLAR');
await page.waitForTimeout(2000);
await shot('13-scene-edit');
await tid('sheet-close').click();
console.log('errors', errors.slice(0, 10));
await browser.close();
