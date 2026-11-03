// Vodiy Vidyo Edit server: accounts, cloud projects, online catalog and the admin panel.
// No third-party packages: it runs on Node 22.13 or newer with nothing to install.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(process.env.DATA_DIR ?? path.join(ROOT, 'data'));
const FILES = path.join(DATA, 'files');
fs.mkdirSync(FILES, { recursive: true });
const PORT = +(process.env.PORT ?? 8080);
const ORIGINS = new Set(['https://localhost', 'capacitor://localhost', 'http://localhost', ...(process.env.ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean)]);
const MAX_JSON = 6 * 1024 * 1024, MAX_UPLOAD = 40 * 1024 * 1024;
const SEED = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed/catalog.json'), 'utf8'));

const db = new DatabaseSync(path.join(DATA, 'mojal.db'));
db.exec(`
PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL UNIQUE, pass TEXT NOT NULL, plan TEXT NOT NULL DEFAULT 'free', blocked INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS projects(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, id TEXT NOT NULL, name TEXT NOT NULL, updated_at INTEGER NOT NULL, size INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(user_id,id));
CREATE TABLE IF NOT EXISTS templates(id TEXT PRIMARY KEY, name TEXT NOT NULL, cat TEXT NOT NULL, data TEXT NOT NULL, thumb TEXT, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS music(id TEXT PRIMARY KEY, name TEXT NOT NULL, mood TEXT NOT NULL DEFAULT '', file TEXT NOT NULL, mime TEXT NOT NULL, duration REAL NOT NULL DEFAULT 0, size INTEGER NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS overrides(kind TEXT NOT NULL, id TEXT NOT NULL, hidden INTEGER NOT NULL DEFAULT 0, featured INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(kind,id));
CREATE TABLE IF NOT EXISTS announcements(id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS devices(id TEXT PRIMARY KEY, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, device TEXT NOT NULL, user_id TEXT, type TEXT NOT NULL, data TEXT, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS events_at ON events(at);
CREATE INDEX IF NOT EXISTS events_type ON events(type);
`);
const q = sql => db.prepare(sql);
const now = () => Date.now();
const newId = () => crypto.randomBytes(9).toString('base64url');

const getSetting = k => q('SELECT value FROM settings WHERE key=?').get(k)?.value;
const setSetting = (k, v) => q('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, String(v));

function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
}
function checkPassword(pw, stored) {
  const [salt, h] = stored.split(':');
  const a = Buffer.from(h, 'hex'), b = crypto.scryptSync(pw, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// The signing secret and first admin password are created once and kept in the data folder.
let SECRET = getSetting('secret');
if (!SECRET) { SECRET = crypto.randomBytes(48).toString('hex'); setSetting('secret', SECRET); }
if (!getSetting('admin_pass')) {
  const initial = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  setSetting('admin_pass', hashPassword(initial));
  if (!process.env.ADMIN_PASSWORD) console.log(`\n  Admin panel birinchi paroli: ${initial}\n  Kirgach, Sozlamalar bo'limida o'zgartiring.\n`);
} else if (process.env.ADMIN_PASSWORD && !getSetting('admin_pass_changed')) {
  setSetting('admin_pass', hashPassword(process.env.ADMIN_PASSWORD));
}

function sign(payload, days) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: now() + days * 864e5 })).toString('base64url');
  return `${body}.${crypto.createHmac('sha256', SECRET).update(body).digest('base64url')}`;
}
function verify(token) {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const want = crypto.createHmac('sha256', SECRET).update(body).digest();
  const got = Buffer.from(sig, 'base64url');
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.exp > now() ? p : null; } catch { return null; }
}

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (s, m) => { throw new HttpError(s, m); };

// Limits password guessing per address.
const attempts = new Map();
function limitLogin(ip) {
  const t = now();
  const a = attempts.get(ip);
  if (!a || t - a.at > 300000) { attempts.set(ip, { at: t, n: 1 }); return; }
  if (++a.n > 12) fail(429, "Juda ko'p urinish. 5 daqiqadan keyin qayta urining.");
}
setInterval(() => { const t = now(); for (const [k, v] of attempts) if (t - v.at > 300000) attempts.delete(k); }, 300000).unref();

function readBody(req, limit) {
  return new Promise((res, rej) => {
    const chunks = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > limit) { rej(new HttpError(413, 'Fayl juda katta')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => res(Buffer.concat(chunks)));
    req.on('error', rej);
  });
}
async function json(req) {
  const b = await readBody(req, MAX_JSON);
  if (!b.length) return {};
  try { return JSON.parse(b.toString()); } catch { fail(400, "So'rov noto'g'ri"); }
}

const publicUser = u => ({ id: u.id, name: u.name, phone: u.phone, plan: u.plan, createdAt: u.created_at });
const normPhone = p => String(p ?? '').replace(/[^\d+]/g, '');

function userAuth(req) {
  const t = verify((req.headers.authorization ?? '').replace(/^Bearer /, ''));
  if (!t || t.role !== 'user') fail(401, 'Hisobga qayta kiring');
  const u = q('SELECT * FROM users WHERE id=?').get(t.sub);
  if (!u) fail(401, 'Hisobga qayta kiring');
  if (u.blocked) fail(403, 'Hisobingiz bloklangan. Administrator bilan bog\'laning.');
  q('UPDATE users SET last_seen=? WHERE id=?').run(now(), u.id);
  return u;
}
function adminAuth(req) {
  const t = verify((req.headers.authorization ?? '').replace(/^Bearer /, ''));
  if (!t || t.role !== 'admin') fail(401, 'Admin panelga qayta kiring');
}

/** Rejects a template that the app could not render, before it reaches any phone. */
function validateTemplate(t) {
  const isStr = (x, max = 200) => typeof x === 'string' && x.length > 0 && x.length <= max;
  if (!t || typeof t !== 'object') fail(400, "Shablon ma'lumoti noto'g'ri");
  if (!isStr(t.name, 80)) fail(400, 'Shablon nomini kiriting');
  if (!isStr(t.cat, 40)) fail(400, 'Toifani tanlang');
  if (!['9:16', '16:9', '1:1', '4:5', '3:4'].includes(t.aspect)) fail(400, "O'lcham noto'g'ri");
  if (!Number.isInteger(t.slots) || t.slots < 1 || t.slots > 60) fail(400, "Slotlar soni 1 dan 60 gacha bo'lsin");
  if (!Array.isArray(t.rhythm) || !t.rhythm.length || t.rhythm.some(x => typeof x !== 'number' || x < 0.1 || x > 60)) fail(400, "Ritm soniyalarda, masalan 2 yoki 1,1,2");
  const fx = new Set(SEED.effects.map(e => e.id)), tr = new Set(SEED.transitions.map(e => e.id)), sc = new Set(SEED.scenes.map(e => e.id)), mo = new Set(SEED.motions.map(e => e.id)), mu = new Set(SEED.music.map(e => e.id));
  t.effects ??= [[]]; t.transitions ??= ['t_fade']; t.motions ??= ['none']; t.texts ??= [];
  if (!Array.isArray(t.effects) || t.effects.some(a => !Array.isArray(a) || a.some(id => !fx.has(id)))) fail(400, "Noma'lum effekt tanlangan");
  if (!Array.isArray(t.transitions) || !t.transitions.length || t.transitions.some(id => !tr.has(id))) fail(400, "Noma'lum o'tish tanlangan");
  if (!Array.isArray(t.motions) || !t.motions.length || t.motions.some(id => !mo.has(id))) fail(400, "Noma'lum harakat tanlangan");
  for (const k of ['intro', 'outro']) if (t[k] && !sc.has(t[k].scene)) fail(400, "Noma'lum 3D sahna tanlangan");
  if (t.music && !mu.has(t.music)) fail(400, "Noma'lum musiqa tanlangan");
  if (t.dance) {
    const da = new Set((SEED.dances ?? []).map(e => e.id));
    if (!da.has(t.dance.style) || ![1, 2, 4, 8].includes(t.dance.step)) fail(400, "Noma'lum harakat uslubi tanlangan");
    if (!t.music) fail(400, "Musiqaga o'ynash uchun musiqa tanlang");
  }
  if (!Array.isArray(t.texts) || t.texts.some(x => !x || typeof x.text !== 'string' || x.text.length > 300)) fail(400, "Matn noto'g'ri");
  return t;
}

function catalog() {
  const o = q('SELECT * FROM overrides').all();
  const hidden = { templates: [], effects: [], transitions: [], scenes: [] };
  const featured = [];
  for (const r of o) {
    if (r.hidden && hidden[r.kind + 's']) hidden[r.kind + 's'].push(r.id);
    if (r.featured && r.kind === 'template') featured.push(r.id);
  }
  const defaults = SEED.templates.filter(t => t.featured).map(t => t.id);
  return {
    version: +(getSetting('catalog_version') ?? 1),
    templates: q('SELECT id,data,thumb FROM templates WHERE enabled=1 ORDER BY created_at DESC').all().map(r => ({ ...JSON.parse(r.data), id: r.id, thumb: r.thumb ? `/files/${r.thumb}` : undefined })),
    hidden,
    featured: getSetting('featured_edited') ? featured : defaults,
    music: q('SELECT * FROM music WHERE enabled=1 ORDER BY created_at DESC').all().map(m => ({ id: m.id, name: m.name, mood: m.mood, url: `/files/${m.file}`, duration: m.duration, size: m.size })),
    announcements: q('SELECT id,title,body,created_at AS createdAt FROM announcements WHERE active=1 ORDER BY created_at DESC LIMIT 5').all(),
    settings: { notice: getSetting('notice') ?? '', minAppVersion: getSetting('min_version') ?? '' },
  };
}
const bump = () => setSetting('catalog_version', +(getSetting('catalog_version') ?? 1) + 1);

function stats() {
  const day = 864e5, t0 = now();
  const dayStart = t => t - (t % day);
  const days = Array.from({ length: 30 }, (_, i) => dayStart(t0) - (29 - i) * day);
  const counts = new Map(days.map(d => [d, { day: d, devices: new Set(), exports: 0, templates: 0, autos: 0 }]));
  for (const e of q('SELECT device,type,at FROM events WHERE at>=?').all(days[0])) {
    const r = counts.get(dayStart(e.at));
    if (!r) continue;
    r.devices.add(e.device);
    if (e.type === 'export') r.exports++;
    if (e.type === 'template_use') r.templates++;
    if (e.type === 'auto_montage') r.autos++;
  }
  const c = sql => q(sql).get().n;
  const topT = q(`SELECT json_extract(data,'$.id') AS id, COUNT(*) AS n FROM events WHERE type='template_use' GROUP BY id ORDER BY n DESC LIMIT 8`).all();
  const nameOf = id => SEED.templates.find(t => t.id === id)?.name ?? q('SELECT name FROM templates WHERE id=?').get(id)?.name ?? id;
  return {
    users: c('SELECT COUNT(*) n FROM users'), devices: c('SELECT COUNT(*) n FROM devices'),
    active7: q('SELECT COUNT(*) n FROM devices WHERE last_seen>=?').get(t0 - 7 * day).n,
    exports: c("SELECT COUNT(*) n FROM events WHERE type='export'"), projects: c('SELECT COUNT(*) n FROM projects'),
    customTemplates: c('SELECT COUNT(*) n FROM templates'), music: c('SELECT COUNT(*) n FROM music'),
    builtin: { templates: SEED.templates.length, effects: SEED.effects.length, transitions: SEED.transitions.length, scenes: SEED.scenes.length },
    daily: days.map(d => { const r = counts.get(d); return { day: d, devices: r.devices.size, exports: r.exports, templates: r.templates, autos: r.autos }; }),
    topTemplates: topT.map(t => ({ id: t.id, name: nameOf(t.id), n: t.n })),
  };
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.aac': 'audio/aac', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const AUDIO_EXT = new Set(['.mp3', '.m4a', '.wav', '.ogg', '.aac']), IMAGE_EXT = new Set(['.webp', '.png', '.jpg', '.jpeg']);

/** Serves a file from inside one folder. Any path that climbs out of the folder is refused. */
function sendFile(req, res, baseDir, rel, cache) {
  const p = path.resolve(baseDir, rel);
  if (p !== baseDir && !p.startsWith(baseDir + path.sep)) fail(403, 'Ruxsat yo\'q');
  let st;
  try { st = fs.statSync(p); } catch { fail(404, 'Topilmadi'); }
  if (!st.isFile()) fail(404, 'Topilmadi');
  const type = MIME[path.extname(p).toLowerCase()] ?? 'application/octet-stream';
  const headers = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': cache };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (range && (range[1] || range[2])) {
    const start = range[1] ? +range[1] : Math.max(0, st.size - +range[2]);
    const end = range[1] && range[2] ? Math.min(+range[2], st.size - 1) : st.size - 1;
    if (start >= st.size || start > end) { res.writeHead(416, { 'content-range': `bytes */${st.size}` }); return res.end(); }
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${st.size}`, 'content-length': end - start + 1 });
    return fs.createReadStream(p, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, 'content-length': st.size });
  fs.createReadStream(p).pipe(res);
}

const routes = [];
const route = (method, pattern, fn) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, fn });
};

route('GET', '/api/health', () => ({ ok: true, time: now() }));
route('GET', '/api/catalog', () => catalog());

route('POST', '/api/auth/register', async (req, ctx) => {
  limitLogin(ctx.ip);
  const b = await json(req);
  const name = String(b.name ?? '').trim().slice(0, 60), phone = normPhone(b.phone), pw = String(b.password ?? '');
  if (!name) fail(400, 'Ismingizni kiriting');
  if (phone.replace('+', '').length < 9) fail(400, "Telefon raqamni to'liq kiriting");
  if (pw.length < 6) fail(400, "Parol kamida 6 ta belgidan iborat bo'lsin");
  if (q('SELECT 1 FROM users WHERE phone=?').get(phone)) fail(409, "Bu raqam bilan hisob bor. Hisobga kiring.");
  const u = { id: newId(), t: now() };
  q('INSERT INTO users(id,name,phone,pass,created_at,last_seen) VALUES(?,?,?,?,?,?)').run(u.id, name, phone, hashPassword(pw), u.t, u.t);
  return { token: sign({ role: 'user', sub: u.id }, 90), user: publicUser(q('SELECT * FROM users WHERE id=?').get(u.id)) };
});
route('POST', '/api/auth/login', async (req, ctx) => {
  limitLogin(ctx.ip);
  const b = await json(req);
  const u = q('SELECT * FROM users WHERE phone=?').get(normPhone(b.phone));
  if (!u || !checkPassword(String(b.password ?? ''), u.pass)) fail(401, "Telefon raqam yoki parol noto'g'ri");
  if (u.blocked) fail(403, "Hisobingiz bloklangan. Administrator bilan bog'laning.");
  q('UPDATE users SET last_seen=? WHERE id=?').run(now(), u.id);
  return { token: sign({ role: 'user', sub: u.id }, 90), user: publicUser(u) };
});

route('GET', '/api/projects', req => {
  const u = userAuth(req);
  return { projects: q('SELECT id,name,updated_at AS updatedAt,size FROM projects WHERE user_id=? ORDER BY updated_at DESC').all(u.id) };
});
route('GET', '/api/projects/:id', (req, ctx) => {
  const u = userAuth(req);
  const r = q('SELECT data FROM projects WHERE user_id=? AND id=?').get(u.id, ctx.id);
  if (!r) fail(404, 'Loyiha topilmadi');
  return { data: JSON.parse(r.data) };
});
route('PUT', '/api/projects/:id', async (req, ctx) => {
  const u = userAuth(req);
  const b = await json(req);
  if (!b.data || typeof b.data !== 'object') fail(400, "Loyiha ma'lumoti yo'q");
  const data = JSON.stringify(b.data);
  q(`INSERT INTO projects(user_id,id,name,updated_at,size,data) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET name=excluded.name,updated_at=excluded.updated_at,size=excluded.size,data=excluded.data`)
    .run(u.id, ctx.id, String(b.name ?? 'Loyiha').slice(0, 120), +b.updatedAt || now(), data.length, data);
  return { ok: true };
});
route('DELETE', '/api/projects/:id', (req, ctx) => {
  const u = userAuth(req);
  q('DELETE FROM projects WHERE user_id=? AND id=?').run(u.id, ctx.id);
  return { ok: true };
});

route('POST', '/api/events', async req => {
  const b = await json(req);
  const device = String(b.device ?? '').slice(0, 64);
  if (!device || !Array.isArray(b.events)) fail(400, "So'rov noto'g'ri");
  const t = now();
  q('INSERT INTO devices(id,first_seen,last_seen) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen').run(device, t, t);
  const ins = q('INSERT OR IGNORE INTO events(id,device,user_id,type,data,at) VALUES(?,?,?,?,?,?)');
  for (const e of b.events.slice(0, 200)) {
    if (typeof e?.type !== 'string') continue;
    ins.run(`${device}:${String(e.id).slice(0, 40)}`, device, null, e.type.slice(0, 40), JSON.stringify(e.data ?? {}).slice(0, 2000), Math.min(t, +e.at || t));
  }
  return { ok: true };
});

route('POST', '/api/admin/login', async (req, ctx) => {
  limitLogin(ctx.ip);
  const b = await json(req);
  if (!checkPassword(String(b.password ?? ''), getSetting('admin_pass'))) fail(401, "Parol noto'g'ri");
  return { token: sign({ role: 'admin' }, 7) };
});
route('POST', '/api/admin/password', async req => {
  adminAuth(req);
  const b = await json(req);
  if (!checkPassword(String(b.current ?? ''), getSetting('admin_pass'))) fail(400, "Joriy parol noto'g'ri");
  if (String(b.next ?? '').length < 8) fail(400, "Yangi parol kamida 8 ta belgidan iborat bo'lsin");
  setSetting('admin_pass', hashPassword(String(b.next)));
  setSetting('admin_pass_changed', '1');
  return { ok: true };
});
route('GET', '/api/admin/stats', req => { adminAuth(req); return stats(); });
route('GET', '/api/admin/users', (req, ctx) => {
  adminAuth(req);
  const s = `%${(ctx.url.searchParams.get('q') ?? '').trim()}%`;
  const page = Math.max(0, +(ctx.url.searchParams.get('page') ?? 0));
  const rows = q(`SELECT u.id,u.name,u.phone,u.plan,u.blocked,u.created_at AS createdAt,u.last_seen AS lastSeen,(SELECT COUNT(*) FROM projects p WHERE p.user_id=u.id) AS projects FROM users u WHERE u.name LIKE ? OR u.phone LIKE ? ORDER BY u.created_at DESC LIMIT 50 OFFSET ?`).all(s, s, page * 50);
  return { users: rows, total: q('SELECT COUNT(*) n FROM users WHERE name LIKE ? OR phone LIKE ?').get(s, s).n };
});
route('PATCH', '/api/admin/users/:id', async (req, ctx) => {
  adminAuth(req);
  const b = await json(req);
  if (b.blocked !== undefined) q('UPDATE users SET blocked=? WHERE id=?').run(b.blocked ? 1 : 0, ctx.id);
  if (b.plan !== undefined) q('UPDATE users SET plan=? WHERE id=?').run(String(b.plan).slice(0, 20), ctx.id);
  if (b.password !== undefined) {
    if (String(b.password).length < 6) fail(400, "Parol kamida 6 ta belgidan iborat bo'lsin");
    q('UPDATE users SET pass=? WHERE id=?').run(hashPassword(String(b.password)), ctx.id);
  }
  return { ok: true };
});
route('DELETE', '/api/admin/users/:id', (req, ctx) => { adminAuth(req); q('DELETE FROM users WHERE id=?').run(ctx.id); return { ok: true }; });

route('GET', '/api/admin/catalog', req => {
  adminAuth(req);
  const o = new Map(q('SELECT * FROM overrides').all().map(r => [`${r.kind}:${r.id}`, r]));
  const edited = !!getSetting('featured_edited');
  const withFlags = (kind, list) => list.map(x => ({ ...x, hidden: !!o.get(`${kind}:${x.id}`)?.hidden, featured: edited ? !!o.get(`${kind}:${x.id}`)?.featured : !!x.featured }));
  return {
    templates: withFlags('template', SEED.templates), effects: withFlags('effect', SEED.effects), transitions: withFlags('transition', SEED.transitions), scenes: withFlags('scene', SEED.scenes),
    motions: SEED.motions, music: SEED.music, categories: SEED.categories, dances: SEED.dances,
  };
});
route('PUT', '/api/admin/override/:kind/:id', async (req, ctx) => {
  adminAuth(req);
  if (!['template', 'effect', 'transition', 'scene'].includes(ctx.kind)) fail(400, "Tur noto'g'ri");
  const b = await json(req);
  const cur = q('SELECT * FROM overrides WHERE kind=? AND id=?').get(ctx.kind, ctx.id) ?? { hidden: 0, featured: 0 };
  if (b.featured !== undefined && !getSetting('featured_edited')) {
    // The first manual edit starts from the built-in recommendations, so they are not lost.
    for (const t of SEED.templates.filter(x => x.featured)) q('INSERT INTO overrides(kind,id,hidden,featured) VALUES(?,?,0,1) ON CONFLICT(kind,id) DO UPDATE SET featured=1').run('template', t.id);
    setSetting('featured_edited', '1');
    cur.featured = q('SELECT featured FROM overrides WHERE kind=? AND id=?').get(ctx.kind, ctx.id)?.featured ?? 0;
  }
  q('INSERT INTO overrides(kind,id,hidden,featured) VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET hidden=excluded.hidden,featured=excluded.featured')
    .run(ctx.kind, ctx.id, b.hidden !== undefined ? (b.hidden ? 1 : 0) : cur.hidden, b.featured !== undefined ? (b.featured ? 1 : 0) : cur.featured);
  bump();
  return { ok: true };
});

route('GET', '/api/admin/templates', req => { adminAuth(req); return { templates: q('SELECT id,name,cat,data,thumb,enabled,updated_at AS updatedAt FROM templates ORDER BY created_at DESC').all().map(t => ({ ...t, data: JSON.parse(t.data) })) }; });
route('POST', '/api/admin/templates', async req => {
  adminAuth(req);
  const t = validateTemplate(await json(req));
  const id = `srv_${newId()}`, ts = now();
  q('INSERT INTO templates(id,name,cat,data,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id, t.name, t.cat, JSON.stringify({ ...t, id }), ts, ts);
  bump();
  return { id };
});
route('PUT', '/api/admin/templates/:id', async (req, ctx) => {
  adminAuth(req);
  const t = validateTemplate(await json(req));
  const r = q('UPDATE templates SET name=?,cat=?,data=?,updated_at=? WHERE id=?').run(t.name, t.cat, JSON.stringify({ ...t, id: ctx.id }), now(), ctx.id);
  if (!r.changes) fail(404, 'Shablon topilmadi');
  bump();
  return { ok: true };
});
route('PATCH', '/api/admin/templates/:id', async (req, ctx) => { adminAuth(req); const b = await json(req); q('UPDATE templates SET enabled=? WHERE id=?').run(b.enabled ? 1 : 0, ctx.id); bump(); return { ok: true }; });
route('DELETE', '/api/admin/templates/:id', (req, ctx) => {
  adminAuth(req);
  const r = q('SELECT thumb FROM templates WHERE id=?').get(ctx.id);
  if (r?.thumb) fs.rm(path.join(FILES, r.thumb), { force: true }, () => {});
  q('DELETE FROM templates WHERE id=?').run(ctx.id);
  bump();
  return { ok: true };
});
route('PUT', '/api/admin/templates/:id/thumb', async (req, ctx) => {
  adminAuth(req);
  const ext = path.extname(ctx.url.searchParams.get('name') ?? '').toLowerCase();
  if (!IMAGE_EXT.has(ext)) fail(400, 'Rasm fayli tanlang: webp, png yoki jpg');
  const body = await readBody(req, 4 * 1024 * 1024);
  const file = `thumb_${newId()}${ext}`;
  fs.writeFileSync(path.join(FILES, file), body);
  const old = q('SELECT thumb FROM templates WHERE id=?').get(ctx.id);
  if (!old) { fs.rmSync(path.join(FILES, file), { force: true }); fail(404, 'Shablon topilmadi'); }
  if (old.thumb) fs.rm(path.join(FILES, old.thumb), { force: true }, () => {});
  q('UPDATE templates SET thumb=? WHERE id=?').run(file, ctx.id);
  bump();
  return { thumb: `/files/${file}` };
});

route('GET', '/api/admin/music', req => { adminAuth(req); return { music: q('SELECT * FROM music ORDER BY created_at DESC').all().map(m => ({ ...m, url: `/files/${m.file}` })) }; });
route('PUT', '/api/admin/music', async (req, ctx) => {
  adminAuth(req);
  const sp = ctx.url.searchParams;
  const name = (sp.get('name') ?? '').trim().slice(0, 80);
  const ext = path.extname(sp.get('file') ?? '').toLowerCase();
  if (!name) fail(400, 'Musiqa nomini kiriting');
  if (!AUDIO_EXT.has(ext)) fail(400, 'Ovoz fayli tanlang: mp3, m4a, wav, ogg yoki aac');
  const body = await readBody(req, MAX_UPLOAD);
  if (!body.length) fail(400, "Fayl bo'sh");
  const id = newId(), file = `music_${id}${ext}`;
  fs.writeFileSync(path.join(FILES, file), body);
  q('INSERT INTO music(id,name,mood,file,mime,duration,size,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id, name, (sp.get('mood') ?? '').slice(0, 40), file, MIME[ext], +(sp.get('duration') ?? 0) || 0, body.length, now());
  bump();
  return { id };
});
route('PATCH', '/api/admin/music/:id', async (req, ctx) => { adminAuth(req); const b = await json(req); q('UPDATE music SET enabled=? WHERE id=?').run(b.enabled ? 1 : 0, ctx.id); bump(); return { ok: true }; });
route('DELETE', '/api/admin/music/:id', (req, ctx) => {
  adminAuth(req);
  const m = q('SELECT file FROM music WHERE id=?').get(ctx.id);
  if (m) fs.rm(path.join(FILES, m.file), { force: true }, () => {});
  q('DELETE FROM music WHERE id=?').run(ctx.id);
  bump();
  return { ok: true };
});

route('GET', '/api/admin/announcements', req => { adminAuth(req); return { announcements: q('SELECT * FROM announcements ORDER BY created_at DESC').all() }; });
route('POST', '/api/admin/announcements', async req => {
  adminAuth(req);
  const b = await json(req);
  const title = String(b.title ?? '').trim().slice(0, 100), body = String(b.body ?? '').trim().slice(0, 500);
  if (!title || !body) fail(400, 'Sarlavha va matnni kiriting');
  const id = newId();
  q('INSERT INTO announcements(id,title,body,created_at) VALUES(?,?,?,?)').run(id, title, body, now());
  bump();
  return { id };
});
route('PATCH', '/api/admin/announcements/:id', async (req, ctx) => { adminAuth(req); const b = await json(req); q('UPDATE announcements SET active=? WHERE id=?').run(b.active ? 1 : 0, ctx.id); bump(); return { ok: true }; });
route('DELETE', '/api/admin/announcements/:id', (req, ctx) => { adminAuth(req); q('DELETE FROM announcements WHERE id=?').run(ctx.id); bump(); return { ok: true }; });

route('GET', '/api/admin/settings', req => { adminAuth(req); return { notice: getSetting('notice') ?? '', minVersion: getSetting('min_version') ?? '' }; });
route('PUT', '/api/admin/settings', async req => {
  adminAuth(req);
  const b = await json(req);
  if (b.notice !== undefined) setSetting('notice', String(b.notice).slice(0, 300));
  if (b.minVersion !== undefined) setSetting('min_version', String(b.minVersion).slice(0, 20));
  bump();
  return { ok: true };
});
route('GET', '/api/admin/projects', req => {
  adminAuth(req);
  return { projects: q(`SELECT p.id,p.name,p.updated_at AS updatedAt,p.size,u.name AS userName,u.phone FROM projects p JOIN users u ON u.id=p.user_id ORDER BY p.updated_at DESC LIMIT 100`).all() };
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const origin = req.headers.origin;
  if (origin && ORIGINS.has(origin)) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('vary', 'origin');
    res.setHeader('access-control-allow-headers', 'content-type,authorization,range');
    res.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('access-control-expose-headers', 'content-range,content-length');
  }
  res.setHeader('x-content-type-options', 'nosniff');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const send = (status, obj) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };
  try {
    const p = url.pathname;
    if (req.method === 'GET' && p.startsWith('/files/')) return sendFile(req, res, FILES, decodeURIComponent(p.slice(7)), 'public, max-age=604800');
    if (req.method === 'GET' && (p === '/' || p === '/admin')) { res.writeHead(302, { location: '/admin/' }); return res.end(); }
    if (req.method === 'GET' && p.startsWith('/admin/')) return sendFile(req, res, path.join(ROOT, 'public'), p === '/admin/' ? 'index.html' : decodeURIComponent(p.slice(7)), 'no-cache');
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = r.re.exec(p);
      if (!m) continue;
      const ctx = { url, ip: (process.env.TRUST_PROXY ? req.headers['x-forwarded-for']?.split(',')[0]?.trim() : '') || req.socket.remoteAddress };
      r.keys.forEach((k, i) => { ctx[k] = decodeURIComponent(m[i + 1]); });
      return send(200, await r.fn(req, ctx));
    }
    fail(404, 'Topilmadi');
  } catch (e) {
    if (e instanceof HttpError) { if (!res.headersSent) send(e.status, { error: e.message }); else res.end(); return; }
    console.error(e);
    if (!res.headersSent) send(500, { error: 'Serverda xatolik yuz berdi' }); else res.end();
  }
});
server.listen(PORT, () => console.log(`Vodiy Vidyo Edit server: http://localhost:${PORT}  admin: http://localhost:${PORT}/admin/`));
const stop = () => { server.close(); db.close(); process.exit(0); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
