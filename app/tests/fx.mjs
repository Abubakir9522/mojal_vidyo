import { open, importFixture, OUT } from './helpers.mjs';
const { browser, page, errors } = await open();
await page.waitForFunction(() => window.__t);
const asset = await importFixture(page, 'detail.jpg', 'image/jpeg');
const asset2 = await importFixture(page, 'photo.jpg', 'image/jpeg');
const r = await page.evaluate(async ([assetId, asset2Id]) => {
  const { Compositor, EFFECTS, TRANSITIONS, MOTIONS, ty } = window.__t;
  const cnv = document.createElement('canvas');
  const comp = new Compositor(cnv);
  comp.setSize(144, 256);
  const bmp = await window.__t.media.getImage(assetId);
  const bmp2 = await window.__t.media.getImage(asset2Id);
  const gl = comp.gl;
  const px = new Uint8Array(144 * 256 * 4);
  const read = () => { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, 144, 256, gl.RGBA, gl.UNSIGNED_BYTE, px); return px.slice(); };
  const getFrame = () => ({ source: bmp, width: bmp.width, height: bmp.height, cacheKey: 'x' });
  const proj = (over) => { const p = ty.newProject('9:16'); p.main = over; return p; };
  const base = (() => { comp.render(proj([ty.newClip({ kind: 'image', duration: 4 })]), 1.3, getFrame); return read(); })();
  const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 16) s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return s / (a.length / 16) / 3; };
  const res = { effects: {}, transitions: {}, motions: {}, compileErrors: [], fxPix: {} };
  for (const e of EFFECTS) {
    try {
      const c = ty.newClip({ kind: 'image', duration: 4, effects: [{ id: e.id, amount: 1 }] });
      // Sampled at two moments, because time-driven effects can be quiet at one instant.
      const sig = []; let mx = 0;
      for (const tt of [0.52, 1.33, 2.71, 0.13, 1.91, 3.37, 2.23, 0.97]) {
        comp.render(proj([c]), tt, getFrame); const f = read();
        mx = Math.max(mx, diff(f, base));
        for (let i = 0; i < f.length; i += 4 * 37) sig.push(f[i], f[i + 1], f[i + 2]);
        comp.render(proj([c]), tt, () => ({ source: bmp2, width: bmp2.width, height: bmp2.height, cacheKey: 'y' })); const f2 = read();
        for (let i = 0; i < f2.length; i += 4 * 37) sig.push(f2[i], f2[i + 1], f2[i + 2]);
      }
      res.effects[e.id] = mx;
      res.fxPix[e.id] = sig;
    } catch (err) { res.compileErrors.push(e.id + ': ' + err.message.slice(0, 400)); }
  }
  const getFrameTr = (clip) => clip === clips[0]
    ? { source: bmp, width: bmp.width, height: bmp.height, cacheKey: 'x' }
    : null;
  let clips;
  for (const t of TRANSITIONS) {
    try {
      clips = [ty.newClip({ kind: 'image', duration: 3, transition: { id: t.id, duration: 1 } }), ty.newClip({ kind: 'color', color: '#22c', duration: 3 })];
      const p = proj(clips);
      const mid = (pr) => { comp.render(p, 2 + pr, getFrameTr); return read(); };
      const a0 = (() => { comp.render(p, 1.9, getFrameTr); return read(); })();
      const a1 = mid(0.5), a2 = mid(0.25);
      const b0 = (() => { comp.render(p, 3.05, getFrameTr); return read(); })();
      res.transitions[t.id] = { startDiff: diff(a0, a1), endDiff: diff(b0, a1), between: diff(a1, a2) };
    } catch (err) { res.compileErrors.push(t.id + ': ' + err.message.slice(0, 400)); }
  }
  for (const m of MOTIONS) {
    const c = ty.newClip({ kind: 'image', duration: 4, motion: m.id });
    comp.render(proj([c]), 0.3, getFrame); const a = read();
    comp.render(proj([c]), 3.3, getFrame); const b = read();
    res.motions[m.id] = diff(a, b);
  }
  // Groups pairs of effects whose output is effectively the same picture.
  const ids = Object.keys(res.fxPix);
  const dupes = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = res.fxPix[ids[i]], b = res.fxPix[ids[j]];
    let s = 0; for (let k = 0; k < a.length; k++) s += Math.abs(a[k] - b[k]);
    if (s / a.length < 1.0) dupes.push([ids[i], ids[j], +(s / a.length).toFixed(2)]);
  }
  delete res.fxPix;
  res.dupes = dupes;
  res.counts = { effects: EFFECTS.length, transitions: TRANSITIONS.length, motions: MOTIONS.length };
  return res;
}, [asset.id, asset2.id]);
console.log('counts', r.counts);
console.log('compile errors', r.compileErrors.length); r.compileErrors.forEach(e => console.log(' ', e));
const weak = Object.entries(r.effects).filter(([, v]) => v < 2).map(([k, v]) => `${k}=${v.toFixed(2)}`);
console.log('all weak count', weak.length);console.log('effects with almost no visible change:', weak);
console.log('duplicates:', r.dupes.length, JSON.stringify(r.dupes.slice(0,40)));
const badT = Object.entries(r.transitions).filter(([, v]) => v.startDiff < 1 && v.endDiff < 1);
console.log('transitions flat:', badT.map(x => x[0]));
console.log('motions flat:', Object.entries(r.motions).filter(([k, v]) => k !== 'none' && v < 0.5).map(x => x[0]));
console.log('errors', errors.slice(0, 5));
await browser.close();
