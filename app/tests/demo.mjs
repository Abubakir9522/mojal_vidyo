// Makes a real sample video with the app's own engine and template, to show actual output.
import { open, OUT, saveBlob } from './helpers.mjs';
const { browser, page, errors } = await open();
await page.waitForFunction(() => window.__t);
const h = await page.evaluateHandle(async () => {
  const { media, exportProject, ty } = window.__t;
  const { TEMPLATES, applyTemplate, addMusic } = await import('/src/data/templates.ts');
  const paint = fn => { const c = document.createElement('canvas'); c.width = 1080; c.height = 1920; fn(c.getContext('2d')); return c; };
  const land = paint(x => { const g = x.createLinearGradient(0, 0, 0, 1920); g.addColorStop(0, '#1d2b6b'); g.addColorStop(.42, '#d6246e'); g.addColorStop(.6, '#f5b301'); g.addColorStop(.61, '#3b2a4f'); g.addColorStop(1, '#10122b'); x.fillStyle = g; x.fillRect(0, 0, 1080, 1920); x.fillStyle = '#ffe9b0'; x.beginPath(); x.arc(700, 920, 165, 0, 7); x.fill(); const hill = (y, a, col, s) => { x.fillStyle = col; x.beginPath(); x.moveTo(0, 1920); for (let i = 0; i <= 1080; i += 12) x.lineTo(i, y + Math.sin(i * s) * a + Math.sin(i * s * 2.7) * a * .4); x.lineTo(1080, 1920); x.fill(); }; hill(1140, 100, '#4a2b63', .008); hill(1320, 90, '#2c2150', .011); hill(1530, 70, '#171634', .014); });
  const tile = paint(x => { const g = x.createLinearGradient(0, 0, 1080, 1920); g.addColorStop(0, '#16a9b8'); g.addColorStop(1, '#2b50c8'); x.fillStyle = g; x.fillRect(0, 0, 1080, 1920); for (let r = 0; r < 9; r++) for (let k = 0; k < 6; k++) { x.save(); x.translate(90 + k * 180, 110 + r * 210); x.rotate(.785); x.fillStyle = (r + k) % 2 ? '#f4efe2' : '#f5b301'; x.fillRect(-48, -48, 96, 96); x.fillStyle = '#11142a'; x.fillRect(-20, -20, 40, 40); x.restore(); } });
  const weave = paint(x => { const c = ['#d6246e', '#f5b301', '#1b2a7a', '#16a9b8', '#f4efe2']; for (let r = 0; r < 120; r++) { let px = -60 + Math.sin(r * .3) * 50; let k = 0; while (px < 1100) { const w = 110 + (k * 37) % 90; x.fillStyle = c[k % 5]; x.fillRect(px, r * 16, w + 2, 17); px += w; k++; } } });
  const blob = c => new Promise(r => c.toBlob(r, 'image/jpeg', .92));
  const assets = [];
  for (const [n, c] of [['a', land], ['b', tile], ['c', weave]]) assets.push(await media.importFile(new File([await blob(c)], `${n}.jpg`, { type: 'image/jpeg' })));
  const m = await media.ensureUrlAsset('music:ritm', new URL('music/ritm.mp3', document.baseURI).href, 'Ritm', 'audio');
  const p = await window.__t.dance.danceMontage({ media: assets, music: m, aspect: '9:16', style: 'aralash', amount: 1, beatsPerCut: 2, length: 12, flash: true, viz: 'bars', title: "Musiqaga o'ynash" });
  const r = await exportProject(p, { height: 720, fps: 30, quality: 'high' }, () => {});
  window.__r = { w: r.width, h: r.height, dur: r.duration, size: r.size, secs: r.seconds };
  return r.file;
});
console.log(await page.evaluate(() => window.__r));
await saveBlob(page, h, `${OUT}/namuna-musiqa.mp4`);
console.log(errors.slice(0, 5));
await browser.close();
