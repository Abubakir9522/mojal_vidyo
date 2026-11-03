import { open, FIX, OUT } from './helpers.mjs';
import path from 'node:path';
const { browser, page, errors } = await open('http://127.0.0.1:5199/', { dsf: 1.5 });
const shot = n => page.screenshot({ path: `${OUT}/${n}.png` });
const tid = id => page.getByTestId(id);
const choose = async (trigger, files) => { const [fc] = await Promise.all([page.waitForEvent('filechooser'), trigger()]); await fc.setFiles(files.map(f => path.join(FIX, f))); };
const proj = () => page.evaluate(() => window.__player.project);
const setRange = (id, v) => page.evaluate(([id, v]) => { const e = document.querySelector(`[data-testid="${id}"]`); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, [id, v]);
await page.waitForSelector('.home');
await page.waitForTimeout(500);
await shot('60-home');

// Musiqaga o'ynatish screen, from photos to a playing editor.
await tid('go-dance').click();
await choose(() => tid('dance-add').click(), ['photo.jpg', 'detail.jpg']);
await page.waitForFunction(() => document.querySelectorAll('.media-thumb').length === 2);
await tid('dance-burilish3d').click();
await page.locator('.chip', { hasText: 'Ustunlar' }).click();
await tid('dance-title').fill('Bizning oila');
await tid('music-music:ritm').click();
await page.waitForFunction(() => document.querySelector('.music-row.on'));
await shot('61-dance-screen');
await tid('dance-run').click();
await page.waitForSelector('[data-testid=editor]', { timeout: 60000 });
await page.waitForTimeout(2500);
await shot('62-dance-editor');
let p = await proj();
console.log('dance project', p.main.length, 'clips', p.main[0].dance, 'beats', p.audio[0].beats.length, 'viz', p.texts.filter(t => t.viz).length, 'cut', +p.main[0].duration.toFixed(3));
await tid('play').click(); await page.waitForTimeout(2000); await tid('play').click();
await page.waitForTimeout(300);
await shot('63-dance-playing');
console.log('time', await tid('time').textContent(), 'err', await page.evaluate(() => window.__player.lastError));

// Dance sheet on a selected clip, keyframes, crop, mask, cutout message.
await tid('clip-main').first().click();
await page.waitForTimeout(200);
await tid('tool-dance').click(); await page.waitForTimeout(200);
await tid('dance-sakrab').click(); await shot('64-dance-sheet'); await tid('sheet-close').click();
p = await proj(); console.log('clip dance now', p.main[0].dance.style, 'other', p.main[1].dance.style);
await tid('tool-transform').click(); await page.waitForTimeout(150);
await tid('kf-add').click(); await page.waitForTimeout(100);
await setRange('tr-scale', 0.5); await page.waitForTimeout(100);
await shot('65-keyframes'); await tid('sheet-close').click();
p = await proj(); console.log('keyframes', JSON.stringify(p.main[0].keyframes));
await tid('tool-crop').click(); await page.waitForTimeout(100); await tid('crop-1x1').click(); await page.waitForTimeout(200); await shot('66-crop'); await tid('sheet-close').click();
await tid('tool-mask').click(); await page.waitForTimeout(100); await tid('mask-heart').click(); await page.waitForTimeout(200); await shot('67-mask'); await tid('sheet-close').click();
p = await proj(); console.log('crop', JSON.stringify(p.main[0].crop), 'mask', JSON.stringify(p.main[0].mask));
await tid('tool-cutout').click();
await page.waitForSelector('[data-testid=toast]', { timeout: 90000 });
console.log('cutout on non-person photo:', await tid('toast').textContent());
await tid('desel').click();
await page.waitForTimeout(300);

// Back home; ad builder.
await tid('ed-back').click();
await page.waitForSelector('.home');
await tid('go-ad').click();
await tid('ad-raqam').click();
await tid('ad-title').fill('Chiroyli raqamlar');
await tid('ad-items').fill('90 777 XX XX\n91 555 XX XX');
await tid('ad-price').fill("100 000 so'mdan");
await tid('ad-name').fill("Vodiy do'koni");
await tid('ad-phone').fill('+998 90 000 00 00');
await tid('ad-address').fill("Bog'dod tumani");
await shot('68-ad-screen');
await tid('ad-run').click();
await page.waitForSelector('[data-testid=editor]', { timeout: 60000 });
await page.waitForTimeout(2500);
await shot('69-ad-editor');
p = await proj();
console.log('ad', p.main.map(c => c.kind + (c.scene ? ':' + c.scene : '')).join(','), 'texts', p.texts.map(t => t.text).join(' | '), 'audio', p.audio.length);
await page.evaluate(() => { document.querySelector('[data-testid=tl-scroll]').scrollLeft = 300; });
await page.waitForTimeout(1200);
await shot('70-ad-mid');

// Subtitles tool, text presets, visualizer sheet, brand button.
await tid('tool-subtitle').click(); await page.waitForTimeout(150);
await tid('sub-text').fill("Bugun chiroyli raqamlar bor. Do'konimizga keling!");
await tid('sub-place').click();
await page.waitForSelector('[data-testid=sub-list]', { timeout: 30000 });
await shot('71-subtitle');
console.log('subtitle rows', await page.locator('.sub-row').count());
await tid('sheet-close').click();
await tid('tool-brand').click(); await page.waitForTimeout(300);
console.log('brand', await tid('toast').textContent());
await tid('tool-textnew').click(); await page.waitForTimeout(200);
await page.locator('.chip', { hasText: 'Tayyor uslub' }).click(); await page.waitForTimeout(200);
await shot('72-text-presets');
await tid('preset-Oltin').click(); await page.waitForTimeout(200);
await tid('sheet-close').click();
await tid('desel').click();
await tid('tool-viz').click(); await page.waitForTimeout(150);
await tid('viz-circle').click(); await page.waitForTimeout(1500);
await shot('73-viz');
await tid('sheet-close').click();
await page.waitForTimeout(100);
if (await tid('desel').count()) await tid('desel').click();

// A short full export of the ad, through the screen.
await tid('export-open').click();
await page.locator('.chip', { hasText: '480p' }).click();
await page.locator('.chip', { hasText: '24 kadr' }).click();
await tid('export-run').click();
await page.waitForSelector('[data-testid=export-done],[data-testid=export-error]', { timeout: 240000 });
console.log('ad export', await page.locator('.export-done .hint, [data-testid=export-error]').first().textContent());
await tid('export-close').click();
await tid('ed-back').click();
await page.waitForSelector('.home');

// A dance template with no files, to its beat-timed result.
await tid('tab-templates').click();
await page.locator('.chip', { hasText: "Musiqaga o'ynash" }).click();
await page.waitForTimeout(600);
await shot('74-dance-templates');
console.log('dance templates', await page.locator('.tile').count());
await tid('tpl-rq_ekvalayzer').click();
await tid('tpl-empty').click();
await page.waitForSelector('[data-testid=editor]', { timeout: 60000 });
await page.waitForTimeout(2500);
p = await proj();
console.log('dance template clips', p.main.slice(0, 3).map(c => +c.duration.toFixed(3)), 'beats', p.audio[0]?.beats?.length, 'viz', p.texts.filter(t => t.viz).length);
await shot('75-dance-template');
console.log('errors', errors.slice(0, 8));
await browser.close();
