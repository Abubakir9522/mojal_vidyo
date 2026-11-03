import { open, importFixture, OUT, saveBlob } from './helpers.mjs';
const { browser, page, errors } = await open();
await page.waitForFunction(() => window.__t);
const a = await importFixture(page, 'photo.jpg', 'image/jpeg');
const h = await page.evaluateHandle(async ({ a }) => {
  const { Scene3DRenderer, SCENES, ty, media } = window.__t;
  const r = new Scene3DRenderer(media.getImage);
  const cols = 7, cw = 180, ch = 340, rows = Math.ceil(SCENES.length * 1 / cols);
  const sheet = document.createElement('canvas'); sheet.width = cols * cw; sheet.height = rows * ch;
  const x = sheet.getContext('2d'); x.fillStyle = '#222'; x.fillRect(0, 0, sheet.width, sheet.height); x.font = '12px sans-serif';
  let i = 0;
  for (const s of SCENES) {
    const clip = ty.newClip({ kind: 'scene3d', scene: s.id, duration: 4, sceneParams: s.images ? { mediaIds: [a] } : {} });
    await r.prepare(clip, 180, 320);
    const c = r.render(clip, 2.4, 4, 180, 320);
    x.drawImage(c, (i % cols) * cw, Math.floor(i / cols) * ch);
    x.fillStyle = '#fff'; x.fillText(s.id, (i % cols) * cw + 3, Math.floor(i / cols) * ch + 334);
    i++;
  }
  return new Promise(res => sheet.toBlob(res, 'image/png'));
}, { a: a.id });
await saveBlob(page, h, `${OUT}/sheet-scenes.png`);
console.log(errors.slice(0, 8));
await browser.close();
