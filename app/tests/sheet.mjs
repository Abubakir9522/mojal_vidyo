// Draws every effect and transition into one image, so they can be checked by eye.
import { open, importFixture, OUT, saveBlob } from './helpers.mjs';
const { browser, page, errors } = await open();
await page.waitForFunction(() => window.__t);
const a = await importFixture(page, 'photo.jpg', 'image/jpeg');
const b = await importFixture(page, 'detail.jpg', 'image/jpeg');
for (const kind of ['effects', 'transitions', 'motions']) {
  const h = await page.evaluateHandle(async ({ a, b, kind }) => {
    const { Compositor, EFFECTS, TRANSITIONS, MOTIONS, ty } = window.__t;
    const cnv = document.createElement('canvas'); const comp = new Compositor(cnv); comp.setSize(108, 192);
    const A = await window.__t.media.getImage(a), B = await window.__t.media.getImage(b);
    const list = kind === 'effects' ? EFFECTS : kind === 'transitions' ? TRANSITIONS : MOTIONS;
    const cols = 14, cw = 108, ch = 206, rows = Math.ceil(list.length / cols);
    const sheet = document.createElement('canvas'); sheet.width = cols * cw; sheet.height = rows * ch;
    const x = sheet.getContext('2d'); x.fillStyle = '#222'; x.fillRect(0, 0, sheet.width, sheet.height); x.font = '10px sans-serif'; x.fillStyle = '#fff';
    list.forEach((d, i) => {
      const clips = kind === 'transitions'
        ? [ty.newClip({ kind: 'image', mediaId: 'a', duration: 3, transition: { id: d.id, duration: 1 } }), ty.newClip({ kind: 'image', mediaId: 'b', duration: 3 })]
        : [ty.newClip({ kind: 'image', mediaId: 'a', duration: 4, effects: kind === 'effects' ? [{ id: d.id, amount: 1 }] : [], motion: kind === 'motions' ? d.id : 'none' })];
      const p = ty.newProject('9:16'); p.main = clips;
      comp.render(p, kind === 'transitions' ? 2.5 : kind === 'motions' ? 0.6 : 1.37, c => { const im = c.mediaId === 'a' ? A : B; return { source: im, width: im.width, height: im.height, cacheKey: c.mediaId }; });
      const col = i % cols, row = Math.floor(i / cols);
      x.drawImage(cnv, col * cw, row * ch);
      x.fillStyle = '#fff'; x.fillText(d.id, col * cw + 2, row * ch + 203);
    });
    return new Promise(r => sheet.toBlob(r, 'image/png'));
  }, { a: a.id, b: b.id, kind });
  await saveBlob(page, h, `${OUT}/sheet-${kind}.png`);
}
console.log(errors.slice(0, 5));
await browser.close();
