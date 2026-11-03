// Renders the thumbnail for every effect, transition, 3D scene and template with the real engine, so what users see is what they get.
import { chromium } from 'playwright';
import fs from 'node:fs';
const BASE = process.env.BASE ?? 'http://127.0.0.1:5199/';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 412, height: 860 } })).newPage();
p.on('pageerror', e => console.log('pageerror', e.message));
await p.goto(BASE);
await p.waitForFunction(() => window.__t);
const save = (kind, id, url) => { const d = `public/thumbs/${kind}`; fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(`${d}/${id}.webp`, Buffer.from(url.split(',')[1], 'base64')); };

// Sample pictures are painted in code: a dusk landscape and a market-coloured still, with no outside images.
await p.evaluate(async () => {
  const paint = (fn) => { const c = document.createElement('canvas'); c.width = 720; c.height = 1280; fn(c.getContext('2d')); return c; };
  const land = paint(x => {
    const g = x.createLinearGradient(0, 0, 0, 1280); g.addColorStop(0, '#1d2b6b'); g.addColorStop(.42, '#d6246e'); g.addColorStop(.6, '#f5b301'); g.addColorStop(.61, '#3b2a4f'); g.addColorStop(1, '#10122b');
    x.fillStyle = g; x.fillRect(0, 0, 720, 1280);
    x.fillStyle = '#ffe9b0'; x.beginPath(); x.arc(470, 610, 110, 0, 7); x.fill();
    const hill = (y, a, col, s) => { x.fillStyle = col; x.beginPath(); x.moveTo(0, 1280); for (let i = 0; i <= 720; i += 12) x.lineTo(i, y + Math.sin(i * s) * a + Math.sin(i * s * 2.7) * a * .4); x.lineTo(720, 1280); x.fill(); };
    hill(760, 70, '#4a2b63', .011); hill(880, 60, '#2c2150', .016); hill(1020, 50, '#171634', .02);
    x.fillStyle = '#0a0c1c'; x.fillRect(150, 930, 90, 130); x.beginPath(); x.arc(195, 930, 45, Math.PI, 0); x.fill(); x.fillRect(120, 860, 22, 200); x.fillRect(248, 860, 22, 200);
  });
  const city = paint(x => {
    const g = x.createLinearGradient(0, 0, 720, 1280); g.addColorStop(0, '#16a9b8'); g.addColorStop(1, '#2b50c8'); x.fillStyle = g; x.fillRect(0, 0, 720, 1280);
    x.fillStyle = '#f4efe2'; x.beginPath(); x.ellipse(360, 520, 240, 300, 0, 0, 7); x.fill();
    x.fillStyle = '#d6246e'; x.beginPath(); x.ellipse(360, 440, 130, 150, 0, 0, 7); x.fill();
    x.fillStyle = '#f5b301'; x.fillRect(120, 860, 480, 300); x.fillStyle = '#11142a'; for (let i = 0; i < 6; i++) x.fillRect(150 + i * 75, 900, 40, 220);
  });
  const warm = paint(x => {
    x.fillStyle = '#f5b301'; x.fillRect(0, 0, 720, 1280);
    x.fillStyle = '#d6246e'; for (let i = 0; i < 9; i++) x.fillRect(i * 80 + Math.sin(i) * 14, 0, 40, 1280);
    x.fillStyle = '#11142a'; x.beginPath(); x.arc(360, 640, 250, 0, 7); x.fill();
    x.fillStyle = '#16a9b8'; x.beginPath(); x.arc(360, 640, 170, 0, 7); x.fill();
    x.fillStyle = '#f4efe2'; x.beginPath(); x.arc(360, 640, 60, 0, 7); x.fill();
  });
  const toBlob = c => new Promise(r => c.toBlob(r, 'image/jpeg', .9));
  window.__assets = [];
  for (const [n, c] of [['land', land], ['city', city], ['warm', warm]]) {
    window.__assets.push(await window.__t.media.importFile(new File([await toBlob(c)], `${n}.jpg`, { type: 'image/jpeg' })));
  }
  const cnv = document.createElement('canvas');
  window.__comp = new window.__t.Compositor(cnv); window.__cnv = cnv;
  window.__bmp = {};
  for (const a of window.__assets) window.__bmp[a.id] = await window.__t.media.getImage(a.id);
  window.__get = c => { const im = window.__bmp[c.mediaId]; return im ? { source: im, width: im.width, height: im.height, cacheKey: c.mediaId } : null; };
  window.__thumb = (w, h, q = 0.72) => { const o = document.createElement('canvas'); o.width = w; o.height = h; o.getContext('2d').drawImage(cnv, 0, 0, w, h); return o.toDataURL('image/webp', q); };
});

const list = async (fn) => p.evaluate(fn);
for (const e of await list(() => window.__t.EFFECTS.map(e => e.id))) {
  save('fx', e, await p.evaluate(id => {
    const { ty } = window.__t;
    window.__comp.setSize(144, 144);
    const pr = ty.newProject('1:1'); pr.main = [ty.newClip({ kind: 'image', mediaId: window.__assets[0].id, duration: 4, effects: [{ id, amount: 1 }] })];
    window.__comp.render(pr, 1.37, window.__get);
    return window.__thumb(120, 120);
  }, e));
}
console.log('fx done');
for (const e of await list(() => window.__t.TRANSITIONS.map(e => e.id))) {
  save('tr', e, await p.evaluate(id => {
    const { ty } = window.__t;
    window.__comp.setSize(144, 144);
    const pr = ty.newProject('1:1'); pr.main = [ty.newClip({ kind: 'image', mediaId: window.__assets[0].id, duration: 3, transition: { id, duration: 1 } }), ty.newClip({ kind: 'image', mediaId: window.__assets[1].id, duration: 3 })];
    // Black and white pass through flat colour at the middle, so these frames sit slightly off centre.
    window.__comp.render(pr, 2.36, window.__get);
    return window.__thumb(120, 120);
  }, e));
}
console.log('tr done');
for (const e of await list(() => window.__t.SCENES.map(e => e.id))) {
  save('scene', e, await p.evaluate(async id => {
    const { ty, Scene3DRenderer, media } = window.__t;
    window.__sr ??= new Scene3DRenderer(media.getImage);
    const c = ty.newClip({ kind: 'scene3d', scene: id, duration: 4, sceneParams: { mediaIds: window.__assets.map(a => a.id) } });
    await window.__sr.prepare(c, 180, 320);
    const cv = window.__sr.render(c, 2.6, 4, 180, 320);
    const o = document.createElement('canvas'); o.width = 180; o.height = 320; o.getContext('2d').drawImage(cv, 0, 0);
    return o.toDataURL('image/webp', 0.72);
  }, e));
}
console.log('scene done');
for (const t of await list(() => window.__TEMPLATES ?? [])) void t;
const ids = await p.evaluate(async () => { const m = await import('/src/data/templates.ts'); window.__tm = m; return m.TEMPLATES.map(t => t.id); });
let bad = [];
for (const id of ids) {
  const r = await p.evaluate(async id => {
    const { ty, tl, media, Scene3DRenderer } = window.__t;
    const { TEMPLATES, applyTemplate } = window.__tm;
    const tpl = TEMPLATES.find(t => t.id === id);
    const pr = applyTemplate(tpl, window.__assets);
    const a = ty.ASPECTS[pr.aspect];
    const k = 320 / Math.max(a.w, a.h);
    window.__comp.setSize(a.w * k, a.h * k);
    const W = window.__comp.W, H = window.__comp.H;
    const dur = tl.projectDuration(pr);
    // A moment where the template's titles and look are on show.
    const scn = pr.main[0].kind === 'scene3d' ? 2.2 : Math.min(dur * 0.5, 1.2);
    const t = Math.min(dur - 0.05, scn);
    window.__sr ??= new Scene3DRenderer(media.getImage);
    for (const c of pr.main) if (c.kind === 'scene3d') await window.__sr.prepare(c, W, H);
    const layout = tl.layoutMain(pr);
    window.__comp.render(pr, t, c => {
      if (c.kind === 'scene3d') { const l = layout.find(x => x.clip.id === c.id); const cv = window.__sr.render(c, t - l.start, l.end - l.start, W, H); return { source: cv, width: W, height: H }; }
      return window.__get(c);
    });
    const tw = a.w >= a.h ? 192 : Math.round((a.w / a.h) * 240), th = a.w >= a.h ? Math.round((a.h / a.w) * 192) : 240;
    return { url: window.__thumb(tw, th), dur, clips: pr.main.length, texts: pr.texts.length };
  }, id);
  save('tpl', id, r.url);
  if (!(r.dur > 0)) bad.push(id);
}
console.log('templates', ids.length, 'bad', bad);
console.log('thumb bytes', (await import('node:child_process')).execSync('du -sh public/thumbs').toString().trim());
await b.close();
