import { db, kv } from './db';
import type { Project } from '../engine/types';
import type { Template } from '../data/templates';

// The server this build talks to. It can be changed in the app under Hisobim, Server manzili.
export const DEFAULT_SERVER: string = (import.meta.env.VITE_SERVER_URL as string) || '';

export interface RemoteMusic { id: string; name: string; mood: string; url: string; duration: number; size: number }
export interface Announcement { id: string; title: string; body: string; createdAt: number }
export interface Catalog {
  version: number;
  templates: Template[];
  hidden: { templates: string[]; effects: string[]; transitions: string[]; scenes: string[] };
  featured: string[];
  music: RemoteMusic[];
  announcements: Announcement[];
  settings: { minAppVersion?: string; notice?: string };
}
export interface User { id: string; name: string; phone: string; plan: string; createdAt: number }

const EMPTY: Catalog = { version: 0, templates: [], hidden: { templates: [], effects: [], transitions: [], scenes: [] }, featured: [], music: [], announcements: [], settings: {} };

let serverUrl = DEFAULT_SERVER;
let token = '';
let currentUser: User | null = null;
let catalog: Catalog = EMPTY;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
export const onApiChange = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export const api = {
  get server() { return serverUrl; },
  get user() { return currentUser; },
  get catalog() { return catalog; },
  get online() { return navigator.onLine && !!serverUrl; },
};

export async function initApi() {
  serverUrl = (await kv.get<string>('server')) ?? DEFAULT_SERVER;
  token = (await kv.get<string>('token')) ?? '';
  currentUser = (await kv.get<User>('user')) ?? null;
  catalog = (await kv.get<Catalog>('catalog')) ?? EMPTY;
  emit();
  window.addEventListener('online', () => { void syncAll(); });
  void syncAll();
}

export async function setServer(url: string) {
  serverUrl = url.trim().replace(/\/+$/, '');
  await kv.set('server', serverUrl);
  emit();
  await syncAll();
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!serverUrl) throw new Error('Server manzili kiritilmagan. Hisobim bo\'limida kiriting.');
  let r: Response;
  try {
    r = await fetch(serverUrl + path, { ...init, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) } });
  } catch { throw new Error("Serverga ulanib bo'lmadi. Internetni tekshiring."); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && token) { await logout(); }
    throw new Error((data as { error?: string }).error ?? `Server xatosi: ${r.status}`);
  }
  return data as T;
}

async function saveAuth(res: { token: string; user: User }) {
  token = res.token; currentUser = res.user;
  await kv.set('token', token); await kv.set('user', currentUser);
  emit();
}

export const register = async (name: string, phone: string, password: string) => saveAuth(await call('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, phone, password }) }));
export const login = async (phone: string, password: string) => saveAuth(await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ phone, password }) }));
export async function logout() {
  token = ''; currentUser = null;
  await kv.set('token', ''); await kv.set('user', null);
  emit();
}

export async function refreshCatalog() {
  const c = await call<Catalog>('/api/catalog');
  catalog = c;
  await kv.set('catalog', c);
  emit();
  return c;
}

export const absoluteUrl = (u: string) => (u.startsWith('http') ? u : serverUrl + u);

/** Queues an anonymous usage event. It reaches the server whenever the device is next online. */
export async function track(type: string, data: Record<string, unknown> = {}) {
  await db.put('queue', { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type, data, at: Date.now() });
  if (api.online) void flushEvents();
}

async function deviceId() {
  let d = await kv.get<string>('device');
  if (!d) { d = crypto.randomUUID(); await kv.set('device', d); }
  return d;
}

let flushing = false;
export async function flushEvents() {
  if (flushing || !api.online) return;
  flushing = true;
  try {
    const items = await db.all<{ id: string; type: string; data: unknown; at: number }>('queue');
    if (!items.length) return;
    await call('/api/events', { method: 'POST', body: JSON.stringify({ device: await deviceId(), events: items.slice(0, 200) }) });
    for (const i of items.slice(0, 200)) await db.del('queue', i.id);
  } catch { /* events stay queued until the next connection */ } finally { flushing = false; }
}

export async function syncAll() {
  if (!api.online) return;
  try { await refreshCatalog(); } catch { /* the cached catalog keeps the app working */ }
  await flushEvents();
}

export interface CloudProject { id: string; name: string; updatedAt: number; size: number }
export const listCloud = () => call<{ projects: CloudProject[] }>('/api/projects');
/** Backs up the edit decisions only. Source files stay on the device. */
export const pushCloud = (p: Project) => call('/api/projects/' + encodeURIComponent(p.id), { method: 'PUT', body: JSON.stringify({ name: p.name, updatedAt: p.updatedAt, data: p }) });
export const pullCloud = (id: string) => call<{ data: Project }>('/api/projects/' + encodeURIComponent(id));
export const deleteCloud = (id: string) => call('/api/projects/' + encodeURIComponent(id), { method: 'DELETE' });
