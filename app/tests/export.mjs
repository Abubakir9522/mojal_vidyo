import { open, importFixture, OUT, saveBlob } from './helpers.mjs';
const { browser, page, errors } = await open();
await page.waitForFunction(() => window.__t);
const v1 = await importFixture(page, 'clip1.mp4', 'video/mp4');
const v2 = await importFixture(page, 'clip2.mp4', 'video/mp4');
const rot = await importFixture(page, 'rot90.mp4', 'video/mp4');
const img = await importFixture(page, 'photo.jpg', 'image/jpeg');
const mus = await importFixture(page, 'beat120.mp3', 'audio/mpeg');
console.log('assets', [v1, v2, rot, img, mus].map(a => [a.name, a.kind, a.duration?.toFixed(2), a.width, a.height, a.hasAudio, !!a.thumb, a.peaks?.length]));
const r = await page.evaluateHandle(async ({ v1, v2, rot, img, mus }) => {
  const { ty, exportProject, tl } = window.__t;
  const p = ty.newProject('9:16', 'test');
  p.main = [
    ty.newClip({ kind: 'scene3d', scene: 'logoSpin', duration: 1.5, transition: { id: 't_cubeL', duration: 0.5 } }),
    ty.newClip({ kind: 'video', mediaId: v1.id, in: 1, out: 3.5, speed: 1, effects: [{ id: 'f_atlas', amount: 1 }], transition: { id: 't_fade', duration: 0.4 } }),
    ty.newClip({ kind: 'image', mediaId: img.id, duration: 2, motion: 'zoomIn', transition: { id: 't_flipY', duration: 0.5 } }),
    ty.newClip({ kind: 'video', mediaId: v2.id, in: 0, out: 4, speed: 2, volume: 0.5 }),
    ty.newClip({ kind: 'video', mediaId: rot.id, in: 0, out: 1, muted: true }),
  ];
  p.overlays = [Object.assign(ty.newClip({ kind: 'video', mediaId: v1.id, in: 0, out: 1 }), { start: 2, blend: 'normal', transform: { ...ty.NO_TRANSFORM, scale: 0.35, x: 0.25, y: 0.3, fit: 'contain' } })];
  p.texts = [ty.newText({ text: "Salom O'zbekiston\nТест кириллица", start: 1.5, duration: 3, y: 0.8, animIn: 'pop' })];
  p.audio = [{ id: 'a1', mediaId: mus.id, name: 'beat', start: 0, in: 0, out: 3, volume: 0.6, fadeIn: 0.2, fadeOut: 0.5, loop: true, muted: false, kind: 'music' }];
  const dur = tl.projectDuration(p);
  const res = await exportProject(p, { height: 360, fps: 24, quality: 'high' }, () => {});
  window.__res = { dur, size: res.size, w: res.width, h: res.height, codec: res.codec, secs: res.seconds };
  return res.file;
}, { v1, v2, rot, img, mus });
console.log(await page.evaluate(() => window.__res));
await saveBlob(page, r, `${OUT}/export.mp4`);
console.log('errors', errors.slice(0, 8));
await browser.close();
