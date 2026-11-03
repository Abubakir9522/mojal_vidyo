// The production build talking to a real server, with the admin panel used through its real screens.
import { open, FIX, OUT } from './helpers.mjs';
import path from 'node:path';
const APP = process.env.APP, SRV = process.env.SRV;
const { browser, page, errors, ctx } = await open(APP, { dsf: 1.5 });
const tid = id => page.getByTestId(id);
const log = (...a) => console.log(...a);

// Without the test hooks the production bundle must not expose them.
await page.waitForSelector('.home');
log('test api in production:', await page.evaluate(() => typeof window.__t));

// Admin panel in its own window.
const admin = await ctx.newPage();
admin.setViewportSize({ width: 1280, height: 860 });
const adminErrors = [];
admin.on('pageerror', e => adminErrors.push(e.message));
admin.on('console', m => { if (m.type() === 'error') adminErrors.push(m.text()); });
admin.on('dialog', d => d.accept());
await admin.goto(`${SRV}/admin/`);
await admin.fill('#pw', 'wrong-password');
await admin.click('button[type=submit]');
await admin.waitForSelector('.err:not(:empty)');
log('wrong admin password:', await admin.textContent('.err'));
await admin.fill('#pw', 'adminpass123');
await admin.click('button[type=submit]');
await admin.waitForSelector('.kpis');

// Connect the app and open an account.
await tid('tab-account').click();
await tid('server-url').fill(SRV);
await tid('server-save').click();
await page.waitForSelector('[data-testid=toast]');
log('app connect:', await tid('toast').textContent());
await tid('auth-switch').click();
await tid('reg-name').fill('Sinov Foydalanuvchi');
await tid('reg-phone').fill('+998901234567');
await tid('reg-pass').fill('parol123');
await tid('auth-submit').click();
await page.waitForSelector('[data-testid=profile]');
await page.screenshot({ path: `${OUT}/30-account.png` });

// Admin adds a template, a track, an announcement, and hides an effect.
const nav = n => admin.locator('nav button', { hasText: n }).first().click();
await nav('Shablonlar');
await admin.waitForSelector('#tpl-new');
await admin.click('#tpl-new');
await admin.fill('#tpl-name', 'Hayit aksiyasi');
await admin.selectOption('#tpl-cat', 'savdo');
await admin.fill('#tpl-slots', '2');
await admin.fill('#tpl-rhythm', '1.5');
await admin.fill('#tpl-title', 'Hayit muborak');
await admin.selectOption('#tpl-intro', 'coins');
await admin.fill('#tpl-intro-text', 'HAYIT');
await admin.selectOption('#tpl-music', 'bayram');
await admin.click('.pick[data-id=f_gold]');
await admin.click('.pick[data-id=t_cubeL]');
await admin.screenshot({ path: `${OUT}/40-admin-template-form.png` });
await admin.click('#tpl-save');
await admin.waitForSelector('[data-tpl="Hayit aksiyasi"]');
await admin.locator('[data-builtin=sv_narx] input[type=checkbox]').first().check();
await admin.waitForTimeout(300);
await admin.screenshot({ path: `${OUT}/41-admin-templates.png` });

await nav('Musiqa');
await admin.waitForSelector('#mu-file');
await admin.setInputFiles('#mu-file', path.join(FIX, 'beat120.mp3'));
await admin.fill('#mu-name', 'Doira ritmi');
await admin.fill('#mu-mood', 'Raqs');
await admin.click('#mu-save');
await admin.waitForSelector('[data-music="Doira ritmi"]');
await admin.screenshot({ path: `${OUT}/42-admin-music.png` });

await nav("E'lonlar");
await admin.waitForSelector('#an-title');
await admin.fill('#an-title', 'Yangi shablonlar');
await admin.fill('#an-body', "Hayit uchun yangi shablon qo'shildi.");
await admin.click('#an-save');
await admin.waitForSelector('td:has-text("Yangi shablonlar")');

await nav('Effektlar');
await admin.waitForSelector('[data-hide=f_atlas]');
await admin.locator('[data-hide=f_atlas]').check();
await admin.waitForTimeout(300);
await admin.screenshot({ path: `${OUT}/43-admin-effects.png` });

// The phone picks all of it up on its next sync.
await page.reload();
await page.waitForSelector('.home');
await page.waitForSelector('[data-testid=notice]', { timeout: 10000 });
log('announcement on phone:', await tid('notice').textContent());
await page.screenshot({ path: `${OUT}/31-home-online.png` });
await tid('tab-templates').click();
await page.waitForTimeout(500);
log('server template visible:', await page.locator('.tile-name', { hasText: 'Hayit aksiyasi' }).count(), 'hidden one visible:', await page.locator('.tile-name', { hasText: 'Narx tushdi' }).count());
await page.screenshot({ path: `${OUT}/32-templates-online.png` });
await page.locator('.tile', { hasText: 'Hayit aksiyasi' }).click();
await tid('tpl-empty').click();
await page.waitForSelector('[data-testid=editor]', { timeout: 30000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/33-server-template-open.png` });
log('clips from server template:', await tid('clip-main').count(), 'audio', await tid('clip-au').count());

// Hidden effect is gone from the picker.
await tid('tool-filters').click();
await page.waitForTimeout(400);
log('hidden effect in picker:', await tid('fx-f_atlas').count(), 'other effect:', await tid('fx-f_rishton').count());
await tid('sheet-close').click();

// Online music reaches the library and can be used.
await tid('tool-audio').click();
await page.waitForSelector('.music-list');
const netRow = page.locator('.music-row', { hasText: 'Doira ritmi' });
log('online track listed:', await netRow.count());
await netRow.locator('button.btn').click();
await page.waitForFunction(() => document.querySelectorAll('[data-testid=clip-au]').length >= 2, null, { timeout: 15000 });
await tid('desel').click();

// Export produces a usage event; the dashboard counts it.
await tid('export-open').click();
await page.locator('.chip', { hasText: '480p' }).click();
await tid('export-run').click();
await page.waitForSelector('[data-testid=export-done]', { timeout: 200000 });
log('export:', await page.locator('.export-done .hint').textContent());
await tid('export-close').click();

// Backup and restore.
await tid('ed-back').click();
await page.waitForSelector('.home');
await tid('tab-account').click();
await tid('backup').click();
await page.waitForSelector('[data-testid=cloud-row]', { timeout: 15000 });
log('cloud projects:', await tid('cloud-row').count());
await page.screenshot({ path: `${OUT}/34-cloud.png` });

await page.waitForTimeout(500);
await nav('Bosh sahifa');
await admin.waitForSelector('.kpis');
await admin.waitForTimeout(300);
log('dashboard:', (await admin.locator('.kpi').allTextContents()).join(' | '));
await admin.screenshot({ path: `${OUT}/44-admin-dashboard.png` });
await nav('Foydalanuvchilar');
await admin.waitForSelector('[data-user="+998901234567"]');
await admin.screenshot({ path: `${OUT}/45-admin-users.png` });

// With no network, the app still opens and edits, the catalog stays cached.
await page.reload();
await page.waitForSelector('.home');
await page.waitForTimeout(600);
await ctx.setOffline(true);
await page.waitForTimeout(300);
await tid('tab-account').click();
log('offline status:', await tid('net-status').textContent());
await page.screenshot({ path: `${OUT}/35-offline.png` });
await tid('tab-templates').click();
log('offline templates include server one:', await page.locator('.tile-name', { hasText: 'Hayit aksiyasi' }).count());
await tid('tab-home').click();
await tid('project').first().click();
await page.waitForSelector('[data-testid=editor]');
await page.waitForTimeout(2000);
await tid('tool-textnew').click();
await page.waitForTimeout(300);
await tid('text-input').fill('Internetsiz');
await tid('sheet-close').click();
await tid('desel').click();
await tid('export-open').click();
await page.locator('.chip', { hasText: '480p' }).click();
await tid('export-run').click();
await page.waitForSelector('[data-testid=export-done],[data-testid=export-error]', { timeout: 200000 });
log('offline export:', await page.locator('.export-done .hint, [data-testid=export-error]').first().textContent());
await ctx.setOffline(false);
log('errors', errors.filter(e => !/ERR_INTERNET|Failed to fetch/.test(e)).slice(0, 8));
log('admin errors', adminErrors.slice(0, 8));
await browser.close();
