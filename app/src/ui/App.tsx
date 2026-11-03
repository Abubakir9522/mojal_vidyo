import { useEffect, useRef, useState } from 'preact/hooks';
import { App as CapApp } from '@capacitor/app';
import { UiProvider, useUi } from './kit';
import { Home } from './Home';
import { Templates } from './Templates';
import { AutoScreen } from './AutoScreen';
import { PhotoScreen } from './PhotoScreen';
import { Account } from './Account';
import { Editor } from './Editor';
import { initApi, onApiChange } from '../store/api';
import { getProject, saveProject } from '../store/projects';
import type { Project } from '../engine/types';
import { Icon } from './icons';
import { isNative } from './native';

export type Route = { name: 'home' } | { name: 'templates'; cat?: string } | { name: 'auto' } | { name: 'photo' } | { name: 'account' } | { name: 'editor'; id: string };
export type Nav = (r: Route) => void;

function Shell() {
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [, force] = useState(0);
  const [editing, setEditing] = useState<Project | null>(null);
  const ui = useUi();
  const backRef = useRef<() => boolean>(() => false);

  useEffect(() => { void initApi(); return onApiChange(() => force(x => x + 1)); }, []);

  const nav: Nav = r => {
    if (r.name === 'editor') {
      void getProject(r.id).then(p => { if (p) { setEditing(p); setRoute(r); } else ui.toast('Loyiha topilmadi', true); });
    } else { setEditing(null); setRoute(r); }
  };
  const openProject = async (p: Project) => { await saveProject(p); nav({ name: 'editor', id: p.id }); };

  useEffect(() => {
    if (!isNative()) return;
    const h = CapApp.addListener('backButton', () => {
      if (backRef.current()) return;
      if (route.name === 'home') void CapApp.exitApp(); else nav({ name: 'home' });
    });
    return () => { void h.then(x => x.remove()); };
  }, [route]);

  if (route.name === 'editor' && editing) return <Editor key={editing.id} initial={editing} nav={nav} backRef={backRef} />;

  return (
    <div class="screen">
      <main class="scroll">
        {route.name === 'home' && <Home nav={nav} open={openProject} />}
        {route.name === 'templates' && <Templates nav={nav} open={openProject} cat={route.cat} />}
        {route.name === 'auto' && <AutoScreen nav={nav} open={openProject} />}
        {route.name === 'photo' && <PhotoScreen nav={nav} open={openProject} />}
        {route.name === 'account' && <Account nav={nav} open={openProject} />}
      </main>
      <nav class="tabbar" aria-label="Asosiy bo'limlar">
        {([['home', 'Bosh sahifa', 'home'], ['templates', 'Shablonlar', 'grid'], ['auto', 'Avto montaj', 'wand'], ['account', 'Hisobim', 'user']] as const).map(([n, label, icon]) => (
          <button key={n} data-testid={`tab-${n}`} class={route.name === n ? 'on' : ''} onClick={() => nav({ name: n })}><Icon n={icon} /><span>{label}</span></button>
        ))}
      </nav>
    </div>
  );
}

export function App() { return <UiProvider><Shell /></UiProvider>; }
