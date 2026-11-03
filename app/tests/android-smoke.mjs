// Runs inside the emulator job. Talks to the real Android WebView and tests what a browser test cannot:
// codec support on this Android build, MP4 export in the WebView, and saving through the native plugin.
import { _android as android } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const OUT = 'tests/android-out';
fs.mkdirSync(OUT, { recursive: true });
const sh = c => execSync(c, { encoding: 'utf8', maxBuffer: 1 << 26 });
const APK = 'android/app/build/outputs/apk/debug/app-debug.apk';
const report = {};
let failed = false;
const check = (name, ok, detail) => { report[name] = { ok, detail }; if (!ok) failed = true; console.log(ok ? 'OK  ' : 'FAIL', name, detail ?? ''); };

try {
  sh(`adb install -r ${APK}`);
  sh('adb logcat -c');
  sh('adb shell am start -n uz.mojal.video/.MainActivity');
  const [device] = await android.devices();
  const webview = await device.webView({ pkg: 'uz.mojal.video' }, { timeout: 90000 });
  const page = await webview.page();
  page.setDefaultTimeout(240000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.waitForSelector('.home', { timeout: 60000 });
  await page.waitForFunction(() => window.__t, null, { timeout: 60000 });
  await new Promise(r => setTimeout(r, 2000));
  sh(`adb exec-out screencap -p > ${OUT}/home.png`);

  const f = await page.evaluate(async () => {
    const r = { ua: navigator.userAgent, webcodecs: typeof VideoEncoder === 'function', webgl2: !!document.createElement('canvas').getContext('webgl2') };
    try { r.h264 = (await VideoEncoder.isConfigSupported({ codec: 'avc1.42001f', width: 720, height: 1280, bitrate: 3e6, framerate: 30 })).supported; } catch (e) { r.h264 = String(e); }
    try { r.aacNative = (await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 })).supported; } catch (e) { r.aacNative = String(e); }
    try { const d = await navigator.storage.getDirectory(); const h = await d.getFileHandle('probe', { create: true }); const w = await h.createWritable(); await w.write('x'); await w.close(); r.opfs = (await h.getFile()).size === 1; await d.removeEntry('probe'); } catch (e) { r.opfs = String(e); }
    return r;
  });
  fs.writeFileSync(`${OUT}/features.json`, JSON.stringify(f, null, 1));
  check('WebGL2', f.webgl2 === true); check('WebCodecs', f.webcodecs === true); check('H.264 encoder', f.h264 === true, String(f.h264)); check('private file storage', f.opfs === true, String(f.opfs));
  console.log(f);

  const fx = await page.evaluate(async () => {
    const { Compositor, EFFECTS, TRANSITIONS, ty } = window.__t;
    const comp = new Compositor(document.createElement('canvas')); comp.setSize(64, 96);
    const bad = [];
    const go = () => null;
    for (const e of EFFECTS) { try { const p = ty.newProject('9:16'); p.main = [ty.newClip({ kind: 'color', color: '#884422', effects: [{ id: e.id, amount: 1 }] })]; comp.render(p, 1, go); } catch (x) { bad.push(`${e.id}: ${String(x.message).slice(0, 200)}`); } }
    for (const t of TRANSITIONS) { try { const p = ty.newProject('9:16'); p.main = [ty.newClip({ kind: 'color', color: '#884422', transition: { id: t.id, duration: 1 } }), ty.newClip({ kind: 'color', color: '#224488' })]; comp.render(p, 2.5, go); } catch (x) { bad.push(`${t.id}: ${String(x.message).slice(0, 200)}`); } }
    comp.dispose();
    return { total: EFFECTS.length + TRANSITIONS.length, bad };
  });
  check('all shaders compile on this GPU driver', fx.bad.length === 0, `${fx.total - fx.bad.length}/${fx.total} ${fx.bad.slice(0, 5).join(' | ')}`);

  const ex = await page.evaluate(async () => {
    const { ty, exportProject, media } = window.__t;
    const music = await media.ensureUrlAsset('music:kuch', new URL('music/kuch.mp3', document.baseURI).href, 'Kuch', 'audio');
    const p = ty.newProject('9:16', 'smoke');
    p.main = [
      ty.newClip({ kind: 'scene3d', scene: 'logoSpin', duration: 2, transition: { id: 't_cubeL', duration: 0.5 } }),
      ty.newClip({ kind: 'color', color: '#d6246e', duration: 2, effects: [{ id: 'g_rgb', amount: 1 }] }),
    ];
    p.texts = [ty.newText({ text: "Salom O'zbekiston", start: 0.5, duration: 2 })];
    p.audio = [{ id: 'a', mediaId: music.id, name: 'Kuch', start: 0, in: 0, out: 10, volume: 0.8, fadeIn: 0, fadeOut: 0.5, loop: false, muted: false, kind: 'music' }];
    const r = await exportProject(p, { height: 360, fps: 24, quality: 'normal' }, () => {});
    window.__smoke = r;
    return { size: r.size, codec: r.codec, secs: r.seconds, w: r.width, h: r.height };
  });
  check('MP4 export in the WebView', ex.size > 10000, JSON.stringify(ex));

  const saved = await page.evaluate(async () => {
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
  });
  check('saved to gallery', /^content:/.test(saved.uri), saved.uri);
  await new Promise(r => setTimeout(r, 1500));
  try {
    sh(`adb pull "/sdcard/Movies/Mojal Video/smoke.mp4" ${OUT}/smoke.mp4`);
    check('file pulled from the gallery folder', fs.statSync(`${OUT}/smoke.mp4`).size === ex.size, `${fs.statSync(`${OUT}/smoke.mp4`).size} bytes`);
  } catch (e) { check('file pulled from the gallery folder', false, String(e).slice(0, 200)); }

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  sh(`adb exec-out screencap -p > ${OUT}/after.png`);
} catch (e) {
  check('smoke run finished', false, String(e?.stack ?? e).slice(0, 800));
} finally {
  try { fs.writeFileSync(`${OUT}/logcat.txt`, sh('adb logcat -d -t 3000')); } catch { /* the emulator may already be gone */ }
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
}
process.exit(failed ? 1 : 0);
