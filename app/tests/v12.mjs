// Exercises every 1.2 engine feature with real exports, measured from the resulting files.
import { open, importFixture, OUT, saveBlob } from './helpers.mjs';
import { execSync } from 'node:child_process';
const { browser, page, errors } = await open();
await page.waitForFunction(() => window.__t);
const v = await importFixture(page, 'clip1.mp4', 'video/mp4');
const v2 = await importFixture(page, 'clip2.mp4', 'video/mp4');
const m = await importFixture(page, 'beat120.mp3', 'audio/mpeg');
const img = await importFixture(page, 'photo.jpg', 'image/jpeg');
const run = async (name, code, opts = { height: 240, fps: 12, quality: 'normal' }) => {
  const h = await page.evaluateHandle(async ({ v, v2, m, img, code, opts }) => {
    const { ty, exportProject, tl } = window.__t;
    const p = ty.newProject(opts.aspect ?? '9:16', 'a');
    await new (Object.getPrototypeOf(async function () {}).constructor)('p', 'ty', 'tl', 'v', 'v2', 'm', 'img', 'T', code)(p, ty, tl, v, v2, m, img, window.__t);
    const r = await exportProject(p, opts, () => {});
    window.__r = { size: r.size, w: r.width, h: r.height, dur: +tl.projectDuration(p).toFixed(2) };
    return r.file;
  }, { v, v2, m, img, code, opts });
  await saveBlob(page, h, `${OUT}/${name}.mp4`);
  console.log(name, JSON.stringify(await page.evaluate(() => window.__r)));
};
const music = `p.audio=[{id:'x',mediaId:m.id,name:'m',start:0,in:0.25,out:30,volume:1,fadeIn:0,fadeOut:0,loop:false,muted:false,kind:'music',beats:Array.from({length:60},(_,i)=>0.25+i*0.5)}];`;

// Dance: frames differ on the beat, and the file has sound.
for (const d of await page.evaluate(() => window.__t.DANCES.map(x => x.id))) {
  const r = await page.evaluate(async ({ img, d }) => {
    const { Compositor, ty, media } = window.__t;
    const c = new Compositor(document.createElement('canvas')); c.setSize(72, 128);
    const bmp = await media.getImage(img.id);
    const p = ty.newProject('9:16'); p.main = [ty.newClip({ kind: 'image', mediaId: img.id, duration: 8, dance: { style: d, amount: 1, flash: false, fxOnBeat: true } })];
    const gl = c.gl, px = () => { const a = new Uint8Array(72 * 128 * 4); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, 72, 128, gl.RGBA, gl.UNSIGNED_BYTE, a); return a; };
    const f = () => ({ source: bmp, width: bmp.width, height: bmp.height, cacheKey: 'i' });
    let max = 0, prev = null;
    for (const t of [0.51, 1.01, 2.26, 3.51, 4.13, 6.03]) { c.render(p, t, f); const a = px(); if (prev) { let s = 0; for (let i = 0; i < a.length; i += 16) s += Math.abs(a[i] - prev[i]); max = Math.max(max, s / (a.length / 16)); } prev = a; }
    c.dispose();
    return +max.toFixed(1);
  }, { img, d });
  if (r < 1) console.log('  DANCE LOOKS STILL', d, r);
}
console.log('all dances checked');
await run('v-dance', `p.main=[ty.newClip({kind:'image',mediaId:img.id,duration:4,dance:{style:'burilish3d',amount:1,flash:true,fxOnBeat:true},effects:[{id:'g_rgb',amount:1}]})];${music}await T.loadSpectrum(m.id,async()=>T.media.getBlob(await T.media.getAsset(m.id)));p.texts=[T.dance.vizLayer('bars',4)];`);
// Keyframes move the picture; ramp changes frames but not length; mask, crop, blur fill.
await run('v-kf', `p.main=[ty.newClip({kind:'image',mediaId:img.id,duration:3,keyframes:[{t:0,x:-0.4,y:0,scale:0.5,rotation:0,opacity:1},{t:3,x:0.4,y:0,scale:1.5,rotation:1,opacity:1}]})];p.texts=[ty.newText({text:'Kalit',start:0,duration:3,keyframes:[{t:0,x:0.1,y:0.1,scale:1,rotation:0,opacity:1},{t:3,x:0.9,y:0.9,scale:2,rotation:0,opacity:1}]})];`);
await run('v-ramp', `p.main=[ty.newClip({kind:'video',mediaId:v.id,in:0,out:6,speed:1,ramp:'qahramon'})];`);
await run('v-mask', `p.background='#224466';p.main=[ty.newClip({kind:'image',mediaId:img.id,duration:1,mask:{shape:'heart',size:.9,feather:.01}})];`);
await run('v-crop', `p.main=[ty.newClip({kind:'image',mediaId:img.id,duration:1,crop:{l:0,t:0,r:.5,b:.5}})];`);
await run('v-blur', `p.main=[ty.newClip({kind:'image',mediaId:img.id,duration:1,canvas:'blur',transform:{...ty.NO_TRANSFORM,fit:'contain'}})];`);
// Audio: pitch stays at 440 with double speed unless turned off.
await run('v-keep', `p.main=[ty.newClip({kind:'video',mediaId:v.id,in:0,out:4,speed:2})];`);
await run('v-nokeep', `p.main=[ty.newClip({kind:'video',mediaId:v.id,in:0,out:4,speed:2,keepPitch:false})];`);
await run('v-high', `p.main=[ty.newClip({kind:'video',mediaId:v.id,in:0,out:4,voice:'ingichka'})];`);
await run('v-low', `p.main=[ty.newClip({kind:'video',mediaId:v.id,in:0,out:4,voice:'yogon'})];`);
await run('v-robot', `p.main=[ty.newClip({kind:'video',mediaId:v.id,in:0,out:4,voice:'robot'})];`);
// Reverse: the first frame of the reversed clip is the last frame of the source.
const rv = await page.evaluate(async ({ v }) => { const { tools, media } = window.__t; const a = await media.getAsset(v.id); const out = await tools.reverseVideo(a, 1, 4, () => {}); window.__rv = out; return { id: out.id, d: out.duration, w: out.width, h: out.height, a: out.hasAudio }; }, { v });
console.log('reverse', rv);
await saveBlob(page, await page.evaluateHandle(async () => window.__t.media.getBlob(window.__rv)), `${OUT}/v-reversed.mp4`);
const fr = await page.evaluate(async ({ v }) => { const { tools, media } = window.__t; const a = await media.getAsset(v.id); const o = await tools.grabFrame(a, 2.5); return { kind: o.kind, w: o.width, h: o.height }; }, { v });
console.log('freeze', fr);
// Speech spans on a sine clip, then subtitle placement and SRT parsing.
const sb = await page.evaluate(async ({ v }) => {
  const { ty, tools, media } = window.__t;
  const a = await media.getAsset(v.id);
  const p = ty.newProject('9:16'); p.main = [ty.newClip({ kind: 'video', mediaId: v.id, in: 0, out: 6 })];
  const spans = await tools.speechSpans(p, id => (id === a.id ? a : undefined));
  const lines = tools.toLines("Salom do'stlar. Bugun yangi tariflar haqida gaplashamiz! Bizga keling.");
  const placed = tools.placeLines(p, lines, spans);
  const srt = tools.parseSrt('1\n00:00:01,000 --> 00:00:02,500\nBirinchi\n\n2\n00:00:03,000 --> 00:00:04,000\n<i>Ikkinchi</i> qator\n');
  return { spans: spans.map(s => [+s.start.toFixed(2), +s.end.toFixed(2)]), lines, placed: placed.map(x => [x.text, +x.start.toFixed(2), +x.duration.toFixed(2)]), srt: srt.map(x => [x.text, x.start, x.duration]) };
}, { v });
console.log('subtitles', JSON.stringify(sb));
// Denoise on a tone buried in noise.
const dn = await page.evaluate(() => {
  const { dsp } = window.__t; const sr = 48000, n = sr * 4; const x = new Float32Array(n);
  let seed = 1; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
  for (let i = 0; i < n; i++) x[i] = 0.2 * r() + (i > sr && i < sr * 3 ? 0.4 * Math.sin(2 * Math.PI * 440 * i / sr) : 0);
  const y = dsp.denoise(x);
  const rms = (a, s, e) => { let t = 0; for (let i = s; i < e; i++) t += a[i] * a[i]; return Math.sqrt(t / (e - s)); };
  return { noiseBefore: +rms(x, 0, sr / 2).toFixed(4), noiseAfter: +rms(y, 2048, sr / 2).toFixed(4), toneBefore: +rms(x, sr * 1.5, sr * 2.5).toFixed(4), toneAfter: +rms(y, sr * 1.5, sr * 2.5).toFixed(4) };
});
console.log('denoise', dn);
// Dance montage cuts land on beats of a song with a known tempo.
const dm = await page.evaluate(async ({ img, m }) => {
  const { dance, media, tl } = window.__t;
  const p = await dance.danceMontage({ media: [await media.getAsset(img.id)], music: await media.getAsset(m.id), aspect: '9:16', style: 'sakrash', amount: 1, beatsPerCut: 2, length: 8, flash: true, viz: 'bars' });
  const l = tl.layoutMain(p);
  return { cuts: l.slice(0, 6).map(x => +x.start.toFixed(2)), dur: +tl.projectDuration(p).toFixed(2), audioIn: +p.audio[0].in.toFixed(3), viz: p.texts.map(t => t.viz), beats: p.audio[0].beats.length };
}, { img, m });
console.log('dance montage', JSON.stringify(dm));
console.log('errors', errors.slice(0, 6));
await browser.close();
