import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage();
p.on('requestfailed', r => console.log('FAIL', r.url().slice(0,150), r.failure()?.errorText));
p.on('pageerror', e => console.log('ERR', e.message));
p.on('console', m => console.log('LOG', m.text().slice(0,300)));
await p.goto('http://127.0.0.1:5199/'); await p.waitForTimeout(15000);
console.log(await p.evaluate(() => typeof window.__t));
await b.close();
