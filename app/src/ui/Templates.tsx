import { useMemo, useState } from 'preact/hooks';
import type { Nav } from './App';
import { Chips, Tile, Top, importAll, useUi } from './kit';
import { Icon } from './icons';
import { pickFiles } from './native';
import { allTemplates, templateThumb } from '../data/catalog';
import { CATEGORIES, MUSIC_TRACKS, Template, addMusic, applyTemplate } from '../data/templates';
import { ensureUrlAsset } from '../store/media';
import type { Project } from '../engine/types';
import { track } from '../store/api';

export function builtinMusicAsset(id: string) {
  const t = MUSIC_TRACKS.find(x => x.id === id);
  if (!t) return null;
  return ensureUrlAsset(`music:${id}`, new URL(`music/${id}.mp3`, document.baseURI).href, t.name, 'audio');
}

export function Templates({ open, cat }: { nav: Nav; open: (p: Project) => void; cat?: string }) {
  const ui = useUi();
  const [active, setActive] = useState<string>(cat ?? 'all');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Template | null>(null);
  const all = useMemo(() => allTemplates(), []);
  const list = all.filter(t => (active === 'all' ? true : active === 'top' ? t.featured : t.cat === active) && (!q || t.name.toLowerCase().includes(q.toLowerCase())));
  const cats = [{ id: 'all', name: `Barchasi (${all.length})` }, { id: 'top', name: 'Tavsiya' }, ...CATEGORIES.map(c => ({ id: c.id as string, name: c.name }))];

  const use = async (tpl: Template, withFiles: boolean) => {
    try {
      const files = withFiles ? await pickFiles('video/*,image/*') : [];
      if (withFiles && !files.length) return;
      const assets = await importAll(files, ui);
      const p = applyTemplate(tpl, assets);
      if (tpl.music) { const m = await builtinMusicAsset(tpl.music); if (m) addMusic(p, m, MUSIC_TRACKS.find(x => x.id === tpl.music)!.name); }
      void track('template_use', { id: tpl.id });
      await open(p);
    } catch (e) { ui.done(); ui.toast((e as Error).message, true); }
  };

  return (
    <>
      <Top title="Shablonlar" />
      <div class="pad"><input class="search" type="search" placeholder="Shablon qidirish" aria-label="Shablon qidirish" value={q} onInput={e => setQ((e.target as HTMLInputElement).value)} /></div>
      <Chips items={cats} value={active} onChange={setActive} label="Shablon turlari" />
      {list.length === 0 && <p class="empty">Bu nomda shablon topilmadi. Boshqa so'z bilan qidiring.</p>}
      <div class="tpl-grid" data-testid="tpl-grid">
        {list.map(t => <Tile key={t.id} tall id={`tpl-${t.id}`} img={templateThumb(t)} name={t.name} badge={t.remote ? 'Yangi' : t.intro ? '3D' : t.aspect !== '9:16' ? t.aspect : undefined} color="#262b52" onClick={() => setPicked(t)} />)}
      </div>
      {picked && (
        <div class="modal" role="dialog" aria-label={picked.name} data-testid="tpl-modal" onClick={e => { if (e.target === e.currentTarget) setPicked(null); }}>
          <div class="modal-card">
            <img src={templateThumb(picked)} alt="" />
            <div>
              <h3>{picked.name}</h3>
              <p>{picked.slots === 1 && picked.intro ? 'Matnni o\'zgartirib ishlatasiz.' : `${picked.slots} ta rasm yoki vidyo uchun.`} O'lcham: {picked.aspect}.</p>
              <button class="btn primary" data-testid="tpl-files" onClick={() => { const t = picked; setPicked(null); void use(t, true); }}><Icon n="image" />Rasm va vidyo tanlash</button>
              <button class="btn" data-testid="tpl-empty" onClick={() => { const t = picked; setPicked(null); void use(t, false); }}>Namuna bilan ochish</button>
              <button class="btn ghost" onClick={() => setPicked(null)}>Bekor qilish</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
