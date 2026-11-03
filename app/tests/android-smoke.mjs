// Runs inside the emulator job. Talks to the real Android WebView and tests what a browser test cannot:
// real video decoding and MP4 export on Android, the bundled AI model, the editor, and saving to the gallery.
import { _android as android } from 'playwright';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';

const OUT = 'tests/android-out';
fs.mkdirSync(OUT, { recursive: true });
const pexec = promisify(exec);
// Never blocks the event loop and never waits forever: the first run hung on a blocking adb call.
const sh = async (c, timeout = 60000) => (await pexec(c, { encoding: 'utf8', maxBuffer: 1 << 26, timeout })).stdout;
const APK = 'android/app/build/outputs/apk/debug/app-debug.apk';
const PKG = 'uz.mojal.video';
const report = {};
let failed = false;
const save = () => fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
const check = (name, ok, detail) => { report[name] = { ok, detail }; if (!ok) failed = true; save(); console.log(ok ? 'OK  ' : 'FAIL', name, detail ?? ''); };
const shot = async n => { try { await sh(`adb exec-out screencap -p > ${OUT}/${n}.png`, 30000); } catch { /* a missing picture must not end the run */ } };

/** Every step has its own time limit, so a hang is reported by name instead of stalling the job. */
async function step(name, ms, fn) {
  const began = Date.now();
  let timer;
  try {
    const r = await Promise.race([fn(), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`${ms / 1000} soniyada tugamadi`)), ms); })]);
    console.log(`  ${name}: ${((Date.now() - began) / 1000).toFixed(0)}s`);
    return r;
  } catch (e) {
    check(name, false, String(e?.message ?? e).slice(0, 700));
    return undefined;
  } finally { clearTimeout(timer); }
}

const hardStop = setTimeout(() => { check('run finished in time', false); void finish(); }, 38 * 60000);
async function finish() {
  clearTimeout(hardStop);
  save();
  try { console.log('emulator state:', (await sh('adb get-state', 10000)).trim()); } catch (e) { check('emulator stayed alive', false, String(e).slice(0, 200)); }
  try { fs.writeFileSync(`${OUT}/logcat.txt`, await sh('adb logcat -d', 45000)); } catch (e) { console.log('logcat', String(e).slice(0, 200)); }
  try {
    const fatal = (await sh('adb logcat -d -b crash', 20000)).trim();
    check('no app crashes', !fatal.includes(PKG), fatal.slice(0, 600));
  } catch { /* no crash buffer on this image */ }
  try { fs.writeFileSync(`${OUT}/webview-version.txt`, await sh('adb shell dumpsys webviewupdate', 20000)); } catch { /* informational only */ }
  save();
  process.exit(failed ? 1 : 0);
}

process.on('unhandledRejection', e => console.log('unhandled', String(e).slice(0, 300)));
const fixture = n => fs.readFileSync(`tests/fixtures/${n}`).toString('base64');

try {
  await sh(`adb install -r ${APK}`, 180000);
  await sh('adb logcat -c', 20000);
  await sh(`adb shell am start -n ${PKG}/.MainActivity`, 30000);
  const limit = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what}: ${ms / 1000} soniyada tugamadi`)), ms))]);
  const [device] = await limit(android.devices(), 120000, 'adb devices');
  console.log('device found');
  const webview = await limit(device.webView({ pkg: PKG }, { timeout: 150000 }), 170000, 'webview');
  console.log('webview found');
  // A restarted activity leaves a dead page behind with no size, so only a page with a real size counts.
  let page = await limit(webview.page(), 120000, 'page');
  for (let i = 0; i < 20; i++) {
    let found = false;
    for (const wv of device.webViews()) {
      if (wv.pkg() !== PKG) continue;
      const p = await limit(wv.page(), 30000, 'page').catch(() => null);
      const w = p ? await limit(p.evaluate(() => innerWidth), 10000, 'width').catch(() => 0) : 0;
      if (w > 0) { page = p; found = true; break; }
    }
    if (found) break;
    await new Promise(r => setTimeout(r, 3000));
  }
  console.log('page attached', page.url(), 'webviews', device.webViews().length);
  const errors = [];
  const con = [];
  page.on('pageerror', e => { errors.push(e.message); con.push('pageerror: ' + e.message); });
  page.on('console', m => con.push(`${m.type()}: ${m.text()}`.slice(0, 400)));
  page.on('response', r => { if (r.status() >= 400) con.push(`status ${r.status()}: ${r.url().slice(0, 160)}`); });
  page.on('requestfailed', r => con.push(`failed: ${r.url().slice(0, 160)} ${r.failure()?.errorText}`));
  const diag = async () => {
    try {
      const d = await page.evaluate(() => ({ href: location.href, title: document.title, ready: document.readyState, app: document.getElementById('app')?.innerHTML.slice(0, 300), hasHome: !!document.querySelector('.home'), ua: navigator.userAgent, w: innerWidth, h: innerHeight }));
      fs.writeFileSync(`${OUT}/diag.json`, JSON.stringify({ url: page.url(), d, con }, null, 1));
      console.log('DIAG', JSON.stringify(d));
    } catch (e) { fs.writeFileSync(`${OUT}/diag.json`, JSON.stringify({ url: page.url(), err: String(e), con }, null, 1)); }
    console.log(con.slice(0, 30).join('\n'));
  };

  await step('app opens', 120000, async () => {
    await new Promise(r => setTimeout(r, 12000));
    await shot('0-after-start');
    await diag();
    await page.waitForSelector('.home', { timeout: 90000 });
    await page.waitForFunction(() => window.__t, null, { timeout: 30000 });
    check('app opens', true);
  });
  await new Promise(r => setTimeout(r, 2000));
  await shot('1-home');
  await diag();
  if (!report['app opens']?.ok) { check('stopped early', false, 'app did not open'); await finish(); }
  check('app name', (await page.textContent('.hero-text h1')) === 'Vodiy Vidyo Edit');

  const f = await step('device features', 60000, () => page.evaluate(async () => {
    const r = { ua: navigator.userAgent, webcodecs: typeof VideoEncoder === 'function', webgl2: !!document.createElement('canvas').getContext('webgl2') };
    try { r.h264 = (await VideoEncoder.isConfigSupported({ codec: 'avc1.42001f', width: 720, height: 1280, bitrate: 3e6, framerate: 30 })).supported; } catch (e) { r.h264 = String(e); }
    try { r.aacNative = (await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 })).supported; } catch (e) { r.aacNative = String(e); }
    try { const d = await navigator.storage.getDirectory(); const h = await d.getFileHandle('probe', { create: true }); const w = await h.createWritable(); await w.write('x'); await w.close(); r.opfs = (await h.getFile()).size === 1; await d.removeEntry('probe'); } catch (e) { r.opfs = String(e); }
    return r;
  }));
  if (f) {
    fs.writeFileSync(`${OUT}/features.json`, JSON.stringify(f, null, 1));
    console.log(f);
    check('WebGL2', f.webgl2 === true); check('WebCodecs', f.webcodecs === true); check('H.264 encoder', f.h264 === true, String(f.h264)); check('private file storage', f.opfs === true, String(f.opfs));
  }

  // Every sixth shader: the same validator runs in desktop tests, this checks this platform's driver.
  const fx = await step('sample of effects', 300000, () => page.evaluate(async () => {
    const { Compositor, EFFECTS, TRANSITIONS, ty } = window.__t;
    const comp = new Compositor(document.createElement('canvas')); comp.setSize(48, 80);
    const bad = []; let n = 0;
    const go = () => null;
    for (let i = 0; i < EFFECTS.length; i += 6) { const e = EFFECTS[i]; n++; try { const p = ty.newProject('9:16'); p.main = [ty.newClip({ kind: 'color', color: '#884422', effects: [{ id: e.id, amount: 1 }] })]; comp.render(p, 1, go); } catch (x) { bad.push(`${e.id}: ${String(x.message).slice(0, 160)}`); } }
    for (let i = 0; i < TRANSITIONS.length; i += 6) { const t = TRANSITIONS[i]; n++; try { const p = ty.newProject('9:16'); p.main = [ty.newClip({ kind: 'color', color: '#884422', transition: { id: t.id, duration: 1 } }), ty.newClip({ kind: 'color', color: '#224488' })]; comp.render(p, 2.5, go); } catch (x) { bad.push(`${t.id}: ${String(x.message).slice(0, 160)}`); } }
    comp.dispose();
    return { n, bad };
  }));
  if (fx) check('effects work on this driver', fx.bad.length === 0, `${fx.n - fx.bad.length}/${fx.n} ${fx.bad.slice(0, 4).join(' | ')}`);

  const imported = await step('import real files', 120000, async () => {
    const out = {};
    for (const [key, name, type] of [['v', 'clip1.mp4', 'video/mp4'], ['img', 'photo.jpg', 'image/jpeg'], ['m', 'beat120.mp3', 'audio/mpeg']]) {
      out[key] = await page.evaluate(async ({ b, name, type }) => {
        const u8 = Uint8Array.from(atob(b), c => c.charCodeAt(0));
        const a = await window.__t.media.importFile(new File([u8], name, { type }));
        return { id: a.id, d: a.duration, w: a.width, h: a.height, audio: a.hasAudio, thumb: !!a.thumb };
      }, { b: fixture(name), name, type });
    }
    return out;
  });
  if (imported) {
    check('video read on Android', imported.v.w === 640 && imported.v.audio && imported.v.thumb, JSON.stringify(imported.v));
    check('photo read on Android', imported.img.w === 1600, JSON.stringify(imported.img));
    check('song read on Android', imported.m.d > 29, JSON.stringify(imported.m));

    const beats = await step('beat detection', 120000, () => page.evaluate(async id => { const { media, detectBeats } = window.__t; return (await detectBeats(await media.getBlob(await media.getAsset(id)))).bpm; }, imported.m.id));
    if (beats !== undefined) check('tempo found', beats === 120, String(beats));

    // Shared by export and the editor: a video, a dancing photo, a 3D scene, a title, a visualizer and a song.
    const buildProject = `const p=ty.newProject('9:16','Sinov');
      p.main=[ty.newClip({kind:'scene3d',scene:'logoSpin',duration:1.5,transition:{id:'t_cubeL',duration:0.4}}),
        ty.newClip({kind:'video',mediaId:ids.v,in:1,out:3,muted:true,effects:[{id:'f_atlas',amount:1}],transition:{id:'t_fade',duration:0.3}}),
        ty.newClip({kind:'image',mediaId:ids.img,duration:2,dance:{style:'sakrash',amount:1,flash:true,fxOnBeat:true}})];
      p.texts=[ty.newText({text:"Salom O'zbekiston",start:0.5,duration:2}),T.dance.vizLayer('bars',4)];
      p.audio=[{id:'a',mediaId:ids.m,name:'Beat',start:0,in:0,out:10,volume:0.8,fadeIn:0,fadeOut:0.5,loop:false,muted:false,kind:'music',beats:Array.from({length:20},(_,i)=>0.25+i*0.5)}];return p;`;
    const ids = { v: imported.v.id, img: imported.img.id, m: imported.m.id };

    const ex = await step('MP4 export', 600000, () => page.evaluate(async ({ code, ids }) => {
      const T = window.__t, ty = T.ty;
      const p = new Function('ty', 'T', 'ids', code)(ty, T, ids);
      const r = await T.exportProject(p, { height: 240, fps: 12, quality: 'normal' }, () => {});
      window.__smoke = r;
      return { size: r.size, codec: r.codec, secs: +r.seconds.toFixed(1), w: r.width, h: r.height };
    }, { code: buildProject, ids }));
    if (ex) check('MP4 export in the WebView', ex.size > 5000 && ex.codec === 'avc', JSON.stringify(ex));

    if (ex) {
      const saved = await step('save to gallery', 120000, () => page.evaluate(async () => {
        const P = window.Capacitor.Plugins.MojalMedia;
        const blob = window.__smoke.file;
        const { id } = await P.begin({ name: 'smoke.mp4', mime: 'video/mp4' });
        const CHUNK = 3 * 1024 * 1024;
        for (let off = 0; off < blob.size; off += CHUNK) {
          const u8 = new Uint8Array(await blob.slice(off, off + CHUNK).arrayBuffer());
          let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
          await P.append({ id, data: btoa(s) });
        }
        return P.finish({ id });
      }));
      if (saved) {
        check('saved to gallery', /^content:/.test(saved.uri), saved.uri);
        await new Promise(r => setTimeout(r, 1500));
        try {
          await sh(`adb pull "/sdcard/Movies/Vodiy Vidyo Edit/smoke.mp4" ${OUT}/smoke.mp4`);
          const probe = (await sh(`ffprobe -v error -show_entries stream=codec_name,width,height,duration -of csv=p=0 ${OUT}/smoke.mp4`)).trim().replace(/\n/g, ' | ');
          check('saved video is valid', /h264/.test(probe) && /aac|opus/.test(probe) && fs.statSync(`${OUT}/smoke.mp4`).size === ex.size, probe);
        } catch (e) { check('saved video is valid', false, String(e).slice(0, 300)); }
      }
    }

    // Runs after saving, because each export clears the previous result file.
    const big = await step('720p export', 300000, () => page.evaluate(async () => {
      const T = window.__t, ty = T.ty;
      const p = ty.newProject('9:16', 'katta');
      p.main = [ty.newClip({ kind: 'color', color: '#d6246e', duration: 1, effects: [{ id: 'l_bokeh', amount: 1 }] })];
      p.texts = [ty.newText({ text: '720p', start: 0, duration: 1 })];
      const r = await T.exportProject(p, { height: 720, fps: 30, quality: 'high' }, () => {});
      return { size: r.size, codec: r.codec, w: r.width, h: r.height, secs: +r.seconds.toFixed(1) };
    }));
    if (big) check('720p export', big.size > 1000 && big.w === 720 && big.codec === 'avc', JSON.stringify(big));

    const rev = await step('reverse clip', 300000, () => page.evaluate(async id => {
      const { tools, media } = window.__t;
      const o = await tools.reverseVideo(await media.getAsset(id), 1, 2, () => {});
      return { d: o.duration, audio: o.hasAudio };
    }, ids.v));
    if (rev) check('reverse clip', rev.d > 0.9 && rev.d < 1.2, JSON.stringify(rev));

    const fr = await step('freeze frame', 60000, () => page.evaluate(async id => { const { tools, media } = window.__t; const o = await tools.grabFrame(await media.getAsset(id), 2); return o.width; }, ids.v));
    if (fr !== undefined) check('freeze frame', fr === 640, String(fr));

    // The photo has no person, so the expected answer proves the bundled model loaded and ran.
    const cut = await step('background removal model', 240000, () => page.evaluate(async id => {
      const { cutoutPerson, media } = window.__t;
      try { await cutoutPerson(await media.getAsset(id)); return 'ran, kept something'; } catch (e) { return String(e.message); }
    }, ids.img));
    if (cut !== undefined) check('background removal model', /odam topilmadi|kept something/.test(cut), cut);

    // The real editor screen with a saved project.
    await step('editor', 240000, async () => {
      await page.evaluate(async ({ code, ids }) => {
        const T = window.__t;
        const p = new Function('ty', 'T', 'ids', code)(T.ty, T, ids);
        await T.db.put('projects', p);
      }, { code: buildProject, ids });
      await page.reload();
      await page.waitForSelector('.home', { timeout: 60000 });
      await page.waitForFunction(() => window.__t, null, { timeout: 60000 });
      await page.click('[data-testid=project]');
      await page.waitForSelector('[data-testid=editor]', { timeout: 60000 });
      await new Promise(r => setTimeout(r, 6000));
      await shot('2-editor');
      await page.click('[data-testid=play]');
      await new Promise(r => setTimeout(r, 5000));
      await shot('3-playing');
      const t = await page.evaluate(() => ({ t: window.__player.t, playing: window.__player.playing, err: window.__player.lastError }));
      check('preview plays', t.t > 0.5 && !t.err, JSON.stringify(t));
      await page.evaluate(() => window.__player.pause());
      const painted = await page.evaluate(() => { const c = document.querySelector('[data-testid=preview]'); const o = document.createElement('canvas'); o.width = 32; o.height = 32; const x = o.getContext('2d'); x.drawImage(c, 0, 0, 32, 32); const d = x.getImageData(0, 0, 32, 32).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / 4); });
      check('preview shows a picture', painted > 8, String(painted));
    });
  }
  // The real phone flow: Android's own file chooser, then a finger drag on the timeline.
  await step('file chooser and touch', 240000, async () => {
    await sh('adb push tests/fixtures/clip1.mp4 /sdcard/Download/sinov_klip.mp4', 60000);
    await sh('adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Download/sinov_klip.mp4', 20000);
    await new Promise(r => setTimeout(r, 2000));
    await page.click('[data-testid=ed-back]');
    await page.waitForSelector('.home', { timeout: 30000 });
    await page.click('[data-testid=new-project]');
    await page.click('[data-testid=aspect-9x16]');
    let tapped = false;
    for (let i = 0; i < 12 && !tapped; i++) {
      await new Promise(r => setTimeout(r, 3000));
      await shot(`5-chooser-${i}`);
      const xml = await sh('adb exec-out uiautomator dump /dev/tty', 30000).catch(() => '');
      if (i === 0) fs.writeFileSync(`${OUT}/chooser.xml`, xml);
      // Android 13 and newer open the system photo picker, where a video is labelled by its length.
      const m = /text="(?:sinov_klip[^"]*|00:06)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(xml);
      if (m) {
        await sh(`adb shell input tap ${(+m[1] + +m[3]) >> 1} ${(+m[2] + +m[4]) >> 1}`, 15000);
        tapped = true;
        await new Promise(r => setTimeout(r, 2500));
        await shot('5-selected');
        const after = await sh('adb exec-out uiautomator dump /dev/tty', 30000).catch(() => '');
        const add = /text="(?:Add|Select|Done|OK)[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(after);
        if (add) await sh(`adb shell input tap ${(+add[1] + +add[3]) >> 1} ${(+add[2] + +add[4]) >> 1}`, 15000);
      }
    }
    check('Android file chooser shows the video', tapped);
    if (!tapped) { await sh('adb shell input keyevent 4', 10000).catch(() => {}); return; }
    await page.waitForSelector('[data-testid=clip-main]', { timeout: 60000 });
    await new Promise(r => setTimeout(r, 3000));
    await shot('6-picked');
    const a = await page.evaluate(() => ({ clips: window.__player.project.main.length, kind: window.__player.project.main[0]?.kind, out: window.__player.project.main[0]?.out }));
    check('picked video opens in the editor', a.clips === 1 && a.kind === 'video' && a.out > 5, JSON.stringify(a));
    const box = await page.evaluate(() => { const r = document.querySelector('[data-testid=tl-scroll]').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, d: devicePixelRatio }; });
    const y = Math.round((box.y + box.h * 0.35) * box.d), x1 = Math.round((box.x + box.w * 0.8) * box.d), x2 = Math.round((box.x + box.w * 0.25) * box.d);
    await sh(`adb shell input swipe ${x1} ${y} ${x2} ${y} 500`, 15000);
    await new Promise(r => setTimeout(r, 1500));
    const t = await page.evaluate(() => window.__player.t);
    check('finger drag moves through the timeline', t > 0.3, String(t));
    await shot('7-dragged');
  });
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await shot('4-end');
  await diag();
} catch (e) {
  check('smoke run finished', false, String(e?.stack ?? e).slice(0, 800));
}
await finish();
