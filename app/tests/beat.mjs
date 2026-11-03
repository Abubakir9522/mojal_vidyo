import { open } from './helpers.mjs';
const { browser, page } = await open();
await page.waitForFunction(() => window.__t);
console.log(await page.evaluate(async () => {
  const out = {};
  for (const [n, exp] of [['kuch', 128], ['quvnoq', 118], ['sokin', 72], ['bayram', 110], ['ufq', 96], ['yengil', 104], ['kino', 64], ['ritm', 140]]) { const b = await (await fetch(`/music/${n}.mp3`)).blob(); const r = await window.__t.detectBeats(b); out[n] = `${exp} -> ${r.bpm}`; }
  const c = await window.__t.detectBeats(await (await fetch('/tests/fixtures/beat120.mp3')).blob()); out.click = `120 -> ${c.bpm}, first ${c.beats[0]}`;
  return out;
}));
await browser.close();
