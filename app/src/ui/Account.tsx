import { useEffect, useState } from 'preact/hooks';
import type { Nav } from './App';
import { Top, useUi } from './kit';
import { Icon } from './icons';
import { api, CloudProject, deleteCloud, listCloud, login, logout, pullCloud, pushCloud, refreshCatalog, register, setServer } from '../store/api';
import { listProjects, saveProject } from '../store/projects';
import type { Project } from '../engine/types';
import { COUNTS } from '../data/catalog';

export function Account({ open }: { nav: Nav; open: (p: Project) => void }) {
  const ui = useUi();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServerInput] = useState(api.server);
  const [cloud, setCloud] = useState<CloudProject[] | null>(null);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener('online', on); window.addEventListener('offline', on);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', on); };
  }, []);
  const loadCloud = () => (navigator.onLine ? listCloud() : Promise.resolve({ projects: [] as CloudProject[] })).then(r => setCloud(r.projects)).catch(e => ui.toast(e.message, true));
  useEffect(() => { if (api.user) void loadCloud(); }, [api.user?.id]);

  const submit = async (e: Event) => {
    e.preventDefault();
    try {
      ui.busy(mode === 'login' ? 'Kirilmoqda' : 'Hisob ochilmoqda');
      if (mode === 'login') await login(phone, password); else await register(name, phone, password);
      setPassword('');
      ui.toast('Hisobga kirdingiz');
    } catch (err) { ui.toast((err as Error).message, true); } finally { ui.done(); }
  };

  const backupAll = async () => {
    try {
      const all = await listProjects();
      for (let i = 0; i < all.length; i++) { ui.busy(`Saqlanmoqda: ${all[i].name}`, i / all.length); await pushCloud(all[i]); }
      ui.toast(`${all.length} ta loyiha serverga saqlandi`);
      await loadCloud();
    } catch (err) { ui.toast((err as Error).message, true); } finally { ui.done(); }
  };

  return (
    <>
      <Top title="Hisobim" />
      <div class="pad form">
        <div class={online && api.server ? 'status on' : 'status'} data-testid="net-status">
          <i /><div>
            <b>{!api.server ? 'Faqat qurilmada' : online ? 'Internetga ulangan' : 'Internet yo\'q'}</b>
            <span>{online && api.server ? 'Yangi shablon va musiqalar serverdan keladi.' : 'Tahrirlash va eksport internetsiz ham ishlaydi.'}</span>
          </div>
        </div>

        {api.user ? (
          <>
            <div class="profile" data-testid="profile"><Icon n="user" /><div><b>{api.user.name}</b><span>{api.user.phone}</span></div><button class="btn small" data-testid="logout" onClick={() => logout()}>Chiqish</button></div>
            <h4>Serverdagi loyihalar</h4>
            <p class="hint">Serverda tahrir qarorlari saqlanadi. Vidyo fayllarning o'zi telefonda qoladi.</p>
            <button class="btn" data-testid="backup" onClick={backupAll}><Icon n="cloud" />Barcha loyihalarni saqlash</button>
            {cloud?.length === 0 && <p class="empty">Serverda hali loyiha yo'q.</p>}
            {cloud?.map(c => (
              <div class="music-row" key={c.id} data-testid="cloud-row">
                <div><b>{c.name}</b><span>{new Date(c.updatedAt).toLocaleString()}</span></div>
                <button class="btn small" onClick={async () => { try { const { data } = await pullCloud(c.id); await saveProject(data); await open(data); } catch (e) { ui.toast((e as Error).message, true); } }}>Ochish</button>
                <button class="icon-btn" aria-label={`${c.name} ni serverdan o'chirish`} onClick={async () => { await deleteCloud(c.id); void loadCloud(); }}><Icon n="trash" s={18} /></button>
              </div>
            ))}
          </>
        ) : (
          <form onSubmit={submit} class="login">
            <h4>{mode === 'login' ? 'Hisobga kirish' : 'Hisob ochish'}</h4>
            <p class="hint">Hisob loyihalarni serverga saqlash uchun kerak. Ilovaning qolgan qismi hisobsiz ishlaydi.</p>
            {mode === 'register' && <label class="field"><span>Ism</span><input data-testid="reg-name" required value={name} onInput={e => setName((e.target as HTMLInputElement).value)} /></label>}
            <label class="field"><span>Telefon raqam</span><input data-testid="reg-phone" required type="tel" inputMode="tel" placeholder="+998" value={phone} onInput={e => setPhone((e.target as HTMLInputElement).value)} /></label>
            <label class="field"><span>Parol</span><input data-testid="reg-pass" required type="password" minLength={6} value={password} onInput={e => setPassword((e.target as HTMLInputElement).value)} /></label>
            <button class="btn primary" data-testid="auth-submit" type="submit">{mode === 'login' ? 'Kirish' : 'Hisob ochish'}</button>
            <button class="btn ghost" type="button" data-testid="auth-switch" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Hisobim yo\'q, ochaman' : 'Hisobim bor, kiraman'}</button>
          </form>
        )}

        <h4>Server manzili</h4>
        <label class="field"><span>Server</span><input data-testid="server-url" type="url" placeholder="https://..." value={server} onInput={e => setServerInput((e.target as HTMLInputElement).value)} /></label>
        <button class="btn" data-testid="server-save" onClick={async () => { try { await setServer(server); if (server) { await refreshCatalog(); ui.toast('Serverga ulandi'); } } catch (e) { ui.toast((e as Error).message, true); } }}>Ulanish</button>

        <h4>Ilova haqida</h4>
        <p class="hint">Vodiy Vidyo Edit 1.2. {COUNTS.templates} ta shablon, {COUNTS.effects} ta effekt, {COUNTS.transitions} ta o'tish, {COUNTS.scenes} ta 3D sahna, {COUNTS.motions} ta kamera harakati, {COUNTS.dances} ta musiqaga o'ynash uslubi.</p>
      </div>
    </>
  );
}
