// Exports projects with known sound, so timing and speed can be measured from the resulting files.
import { open, importFixture, OUT, saveBlob, FIX } from './helpers.mjs';
const { browser, page, errors } = await open();
await page.waitForFunction(() => window.__t);
const v = await importFixture(page, 'clip1.mp4', 'video/mp4');
const m = await importFixture(page, 'beat120.mp3', 'audio/mpeg');
const run = async (name, build, opts = { height: 240, fps: 12, quality: 'normal' }) => {
  const h = await page.evaluateHandle(async ({ v, m, code, opts }) => {
    const { ty, exportProject } = window.__t;
    const p = ty.newProject(opts.aspect ?? '9:16', 'a'); new Function('p', 'ty', 'v', 'm', code)(p, ty, v, m);
    const r = await exportProject(p, opts, () => {});
    window.__r = { size: r.size, w: r.width, h: r.height, secs: +r.seconds.toFixed(1) };
    return r.file;
  }, { v, m, code: build, opts });
  await saveBlob(page, h, `${OUT}/${name}.mp4`);
  console.log(name, await page.evaluate(() => window.__r));
};
// Normal speed: the 440 Hz test tone stays 440.
await run('a-normal', `p.main=[ty.newClip({kind:'video',mediaId:v.id,in:0,out:3})];`);
// Double speed: same clip must last half as long, at 880 Hz.
await run('a-fast', `p.main=[ty.newClip({kind:'video',mediaId:v.id,in:0,out:4,speed:2})];`);
// Muted clip with music starting at 2 s: first two seconds silent.
await run('a-late', `p.main=[ty.newClip({kind:'video',mediaId:v.id,in:0,out:4,muted:true})];p.audio=[{id:'x',mediaId:m.id,name:'m',start:2,in:0,out:30,volume:1,fadeIn:0,fadeOut:0,loop:false,muted:false,kind:'music'}];`);
// Short looped music fills a long project across the mixer's window boundaries.
await run('a-loop', `p.main=[ty.newClip({kind:'color',color:'#333',duration:10})];p.audio=[{id:'x',mediaId:m.id,name:'m',start:0,in:0.2,out:1.2,volume:1,fadeIn:0,fadeOut:0,loop:true,muted:false,kind:'music'}];`);
// No sound at all must still give a valid video.
await run('a-silent', `p.main=[ty.newClip({kind:'color',color:'#a33',duration:2})];`);
// Full-size output.
await run('big-1080', `p.main=[ty.newClip({kind:'video',mediaId:v.id,in:0,out:2,motion:'zoomIn',effects:[{id:'f_atlas',amount:1}]})];p.texts=[ty.newText({text:'1080p',start:0,duration:2})];`, { height: 1080, fps: 30, quality: 'high' });
await run('big-16x9', `p.main=[ty.newClip({kind:'scene3d',scene:'logoSpin',duration:2})];`, { height: 720, fps: 30, quality: 'normal', aspect: '16:9' });
console.log('errors', errors.slice(0, 5));
await browser.close();
