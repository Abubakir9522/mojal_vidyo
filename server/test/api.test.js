import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 18477, B = `http://127.0.0.1:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mojal-test-'));
const start = () => spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT, DATA_DIR: dir, ADMIN_PASSWORD: 'adminpass123', NODE_NO_WARNINGS: '1' }, stdio: 'inherit' });
let srv;
const J = async (p, { method = 'GET', body, token, raw } = {}) => {
  const r = await fetch(B + p, { method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: raw ?? (body ? JSON.stringify(body) : undefined) });
  return { status: r.status, data: await r.json().catch(() => null), headers: r.headers };
};
const up = async () => { for (let i = 0; i < 50; i++) { try { await fetch(`${B}/api/health`); return; } catch { await new Promise(r => setTimeout(r, 100)); } } throw new Error('no server'); };

test.before(async () => { srv = start(); await up(); });
test.after(() => { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); });

let user, admin;
test('register validates input and rejects duplicates', async () => {
  assert.equal((await J('/api/auth/register', { method: 'POST', body: { name: 'A', phone: '12', password: 'secret1' } })).status, 400);
  assert.equal((await J('/api/auth/register', { method: 'POST', body: { name: 'A', phone: '+998901112233', password: '123' } })).status, 400);
  const r = await J('/api/auth/register', { method: 'POST', body: { name: 'Ali', phone: '+998 90 111 22 33', password: 'secret1' } });
  assert.equal(r.status, 200); assert.equal(r.data.user.phone, '+998901112233'); user = r.data.token;
  assert.ok(!('pass' in r.data.user));
  assert.equal((await J('/api/auth/register', { method: 'POST', body: { name: 'B', phone: '+998901112233', password: 'secret1' } })).status, 409);
});
test('login checks the password', async () => {
  assert.equal((await J('/api/auth/login', { method: 'POST', body: { phone: '+998901112233', password: 'wrong00' } })).status, 401);
  assert.equal((await J('/api/auth/login', { method: 'POST', body: { phone: '998901112233', password: 'secret1' } })).status, 401);
  assert.equal((await J('/api/auth/login', { method: 'POST', body: { phone: '+998901112233', password: 'secret1' } })).status, 200);
});
test('projects need a token, and one user cannot read another user\'s', async () => {
  assert.equal((await J('/api/projects')).status, 401);
  assert.equal((await J('/api/projects', { token: 'x.y' })).status, 401);
  assert.equal((await J('/api/projects/p1', { method: 'PUT', token: user, body: { name: 'L1', updatedAt: 5, data: { id: 'p1', main: [] } } })).status, 200);
  const l = await J('/api/projects', { token: user });
  assert.equal(l.data.projects[0].name, 'L1');
  assert.deepEqual((await J('/api/projects/p1', { token: user })).data.data, { id: 'p1', main: [] });
  const other = (await J('/api/auth/register', { method: 'POST', body: { name: 'Vali', phone: '+998901112244', password: 'secret2' } })).data.token;
  assert.equal((await J('/api/projects/p1', { token: other })).status, 404);
  assert.equal((await J('/api/projects', { token: other })).data.projects.length, 0);
});
test('admin routes refuse user tokens and bad passwords', async () => {
  assert.equal((await J('/api/admin/stats')).status, 401);
  assert.equal((await J('/api/admin/stats', { token: user })).status, 401);
  assert.equal((await J('/api/admin/login', { method: 'POST', body: { password: 'nope' } })).status, 401);
  const r = await J('/api/admin/login', { method: 'POST', body: { password: 'adminpass123' } });
  assert.equal(r.status, 200); admin = r.data.token;
  assert.equal((await J('/api/projects', { token: admin })).status, 401);
});
test('blocking a user stops their access at once', async () => {
  const u = (await J('/api/admin/users?q=Vali', { token: admin })).data.users[0];
  await J(`/api/admin/users/${u.id}`, { method: 'PATCH', token: admin, body: { blocked: true } });
  const l = await J('/api/auth/login', { method: 'POST', body: { phone: '+998901112244', password: 'secret2' } });
  assert.equal(l.status, 403);
  await J(`/api/admin/users/${u.id}`, { method: 'DELETE', token: admin });
  assert.equal((await J('/api/admin/users?q=Vali', { token: admin })).data.total, 0);
});
test('templates are validated, and reach the catalog', async () => {
  const good = { name: 'Server shablon', cat: 'savdo', aspect: '9:16', slots: 3, rhythm: [2], effects: [['f_atlas']], transitions: ['t_fade'], motions: ['zoomIn'], texts: [{ text: 'Salom' }] };
  assert.equal((await J('/api/admin/templates', { method: 'POST', token: admin, body: { ...good, effects: [['no_such']] } })).status, 400);
  assert.equal((await J('/api/admin/templates', { method: 'POST', token: admin, body: { ...good, slots: 0 } })).status, 400);
  assert.equal((await J('/api/admin/templates', { method: 'POST', token: admin, body: { ...good, aspect: '5:5' } })).status, 400);
  const r = await J('/api/admin/templates', { method: 'POST', token: admin, body: good });
  assert.equal(r.status, 200);
  let c = (await J('/api/catalog')).data;
  assert.equal(c.templates[0].name, 'Server shablon');
  await J(`/api/admin/templates/${r.data.id}`, { method: 'PATCH', token: admin, body: { enabled: false } });
  c = (await J('/api/catalog')).data;
  assert.equal(c.templates.length, 0);
});
test('hiding built-in content appears in the catalog', async () => {
  await J('/api/admin/override/effect/f_atlas', { method: 'PUT', token: admin, body: { hidden: true } });
  await J('/api/admin/override/template/sv_narx', { method: 'PUT', token: admin, body: { hidden: true } });
  const c = (await J('/api/catalog')).data;
  assert.deepEqual(c.hidden.effects, ['f_atlas']);
  assert.deepEqual(c.hidden.templates, ['sv_narx']);
  assert.ok(c.featured.includes('sv_chegirma'));
});
test('music upload is stored, served with ranges and listed', async () => {
  assert.equal((await J('/api/admin/music?name=x&file=a.exe', { method: 'PUT', token: admin, raw: Buffer.from('x') })).status, 400);
  const bytes = Buffer.from('0123456789');
  const r = await J('/api/admin/music?name=Kuy&mood=Sokin&file=a.mp3&duration=12.5', { method: 'PUT', token: admin, raw: bytes });
  assert.equal(r.status, 200);
  const m = (await J('/api/catalog')).data.music[0];
  assert.equal(m.name, 'Kuy');
  const f = await fetch(B + m.url, { headers: { range: 'bytes=2-5' } });
  assert.equal(f.status, 206); assert.equal(await f.text(), '2345');
});
test('file serving cannot escape its folder', async () => {
  for (const p of ['/files/..%2Fmojal.db', '/files/%2e%2e/mojal.db', '/admin/..%2Fserver.js', '/admin/%2e%2e%2fserver.js']) {
    const r = await fetch(B + p, { redirect: 'manual' });
    assert.ok([403, 404].includes(r.status), `${p} -> ${r.status}`);
  }
});
test('events count towards statistics', async () => {
  await J('/api/events', { method: 'POST', body: { device: 'd1', events: [{ id: 'e1', type: 'export', at: Date.now() }, { id: 'e2', type: 'template_use', data: { id: 'sv_narx' }, at: Date.now() }] } });
  await J('/api/events', { method: 'POST', body: { device: 'd1', events: [{ id: 'e1', type: 'export', at: Date.now() }] } });
  const s = (await J('/api/admin/stats', { token: admin })).data;
  assert.equal(s.exports, 1); assert.equal(s.devices, 1);
  assert.equal(s.topTemplates[0].name, 'Narx tushdi');
  assert.equal(s.daily.length, 30); assert.equal(s.daily[29].exports, 1);
});
test('CORS answers the app origin and not strangers', async () => {
  const a = await fetch(`${B}/api/catalog`, { headers: { origin: 'https://localhost' } });
  assert.equal(a.headers.get('access-control-allow-origin'), 'https://localhost');
  const b = await fetch(`${B}/api/catalog`, { headers: { origin: 'https://evil.example' } });
  assert.equal(b.headers.get('access-control-allow-origin'), null);
});
test('data survives a restart', async () => {
  srv.kill(); await new Promise(r => setTimeout(r, 300));
  srv = start(); await up();
  const r = await J('/api/auth/login', { method: 'POST', body: { phone: '+998901112233', password: 'secret1' } });
  assert.equal(r.status, 200);
  assert.equal((await J('/api/projects', { token: r.data.token })).data.projects.length, 1);
});
test('wrong passwords are rate limited', async () => {
  let last;
  for (let i = 0; i < 16; i++) last = await J('/api/admin/login', { method: 'POST', body: { password: 'bad' } });
  assert.equal(last.status, 429);
});
