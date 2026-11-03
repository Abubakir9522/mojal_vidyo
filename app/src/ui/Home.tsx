import { useEffect, useState } from 'preact/hooks';
import type { Nav } from './App';
import { Icon } from './icons';
import { importAll, useUi } from './kit';
import { pickFiles } from './native';
import { deleteProject, listProjects } from '../store/projects';
import { ASPECTS, AspectId, Project, newClip, newProject } from '../engine/types';
import { projectDuration } from '../engine/timeline';
import { api, track } from '../store/api';
import { COUNTS } from '../data/catalog';

/** The atlas band: rows of jagged colour, like threads dyed before weaving. Rows are fixed so the art never shifts. */
function AtlasBand() {
  const rows = 40, cols = [
    { c: '#d6246e', w: 58 }, { c: '#f5b301', w: 34 }, { c: '#1b2a7a', w: 40 }, { c: '#16a9b8', w: 30 }, { c: '#f4efe2', w: 16 }, { c: '#d6246e', w: 46 }, { c: '#11142a', w: 24 }, { c: '#f5b301', w: 50 }, { c: '#16a9b8', w: 42 }, { c: '#1b2a7a', w: 36 }, { c: '#d6246e', w: 30 },
  ];
  const total = cols.reduce((s, c) => s + c.w, 0);
  const rh = 180 / rows;
  const out = [];
  let x0 = 0;
  for (let k = 0; k < cols.length; k++) {
    const c = cols[k];
    let d = '';
    for (let r = 0; r < rows; r++) {
      const j1 = Math.sin(r * 0.55 + k * 1.7) * 7 + ((r * 7 + k * 13) % 5) - 2;
      const j2 = Math.sin((r + 1) * 0.55 + (k + 1) * 1.7) * 7 + (((r + 1) * 7 + (k + 1) * 13) % 5) - 2;
      d += `M${x0 + j1} ${r * rh}H${x0 + c.w + j2 + 7}V${(r + 1) * rh + 0.3}H${x0 + j1}Z`;
    }
    out.push(<path key={k} d={d} fill={c.c} />);
    x0 += c.w;
  }
  return <svg class="atlas" viewBox={`0 0 ${total} 180`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">{out}</svg>;
}

export function Home({ nav, open }: { nav: Nav; open: (p: Project) => void }) {
  const ui = useUi();
  const [projects, setProjects] = useState<Project[]>([]);
  const [asking, setAsking] = useState(false);
  const refresh = () => listProjects().then(setProjects);
  useEffect(() => { void refresh(); void track('app_open'); }, []);

  const start = async (aspect: AspectId) => {
    setAsking(false);
    const files = await pickFiles('video/*,image/*');
    const assets = await importAll(files, ui);
    const p = newProject(aspect);
    for (const a of assets) {
      p.main.push(a.kind === 'video'
        ? newClip({ kind: 'video', mediaId: a.id, in: 0, out: a.duration })
        : newClip({ kind: 'image', mediaId: a.id, duration: 4, motion: 'zoomIn' }));
    }
    await open(p);
  };

  const notice = api.catalog.settings.notice;
  const ann = api.catalog.announcements[0];

  return (
    <div class="home">
      <div class="hero">
        <AtlasBand />
        <div class="hero-text">
          <h1>Vodiy Vidyo Edit</h1>
          <p>Telefoningizda vidyo yarating va tahrirlang</p>
        </div>
      </div>
      {(notice || ann) && <aside class="notice" data-testid="notice"><b>{ann?.title ?? 'Xabar'}</b><span>{ann?.body ?? notice}</span></aside>}

      <button class="cta" data-testid="new-project" onClick={() => setAsking(true)}><Icon n="plus" s={26} /><span>Yangi loyiha</span></button>

      {asking && (
        <div class="aspect-pick" data-testid="aspect-pick">
          <p>Vidyo qaysi o'lchamda bo'lsin?</p>
          <div>
            {(Object.keys(ASPECTS) as AspectId[]).map(a => (
              <button key={a} data-testid={`aspect-${a.replace(':', 'x')}`} onClick={() => start(a)}>
                <i style={{ aspectRatio: a.replace(':', '/') }} />
                <b>{a}</b><span>{ASPECTS[a].label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div class="quick">
        <button data-testid="go-auto" onClick={() => nav({ name: 'auto' })}><Icon n="wand" /><b>Avto montaj</b><span>Fayllarni tanlang, ilova o'zi yig'adi</span></button>
        <button data-testid="go-dance" onClick={() => nav({ name: 'dance' })}><Icon n="beat" /><b>Musiqaga o'ynatish</b><span>Rasmlar qo'shiq ritmiga harakatlanadi</span></button>
        <button data-testid="go-ad" onClick={() => nav({ name: 'ad' })}><Icon n="bolt" /><b>Reklama ustasi</b><span>Ma'lumot yozing, reklama tayyor</span></button>
        <button data-testid="go-photo" onClick={() => nav({ name: 'photo' })}><Icon n="image" /><b>Rasmdan vidyo</b><span>Rasmlarni jonlantiring</span></button>
        <button data-testid="go-3d" onClick={() => nav({ name: 'templates', cat: 'intro' })}><Icon n="cube" /><b>3D vidyo</b><span>{COUNTS.scenes} ta 3D sahna</span></button>
        <button data-testid="go-tpl" onClick={() => nav({ name: 'templates' })}><Icon n="grid" /><b>Shablonlar</b><span>{COUNTS.templates} ta tayyor uslub</span></button>
      </div>

      <h2>Loyihalarim</h2>
      {projects.length === 0 && <p class="empty">Hali loyiha yo'q. Yangi loyiha yarating yoki shablon tanlang.</p>}
      <div class="projects">
        {projects.map(p => {
          const d = projectDuration(p);
          return (
            <article key={p.id} class="project">
              <button class="project-open" data-testid="project" onClick={() => nav({ name: 'editor', id: p.id })}>
                <span class="project-thumb" style={p.thumb ? { backgroundImage: `url(${p.thumb})` } : undefined} />
                <b>{p.name}</b>
                <span>{p.aspect}, {Math.round(d)} soniya</span>
              </button>
              <button class="icon-btn" aria-label={`${p.name} loyihasini o'chirish`} onClick={async () => { if (confirm(`"${p.name}" o'chirilsinmi?`)) { await deleteProject(p.id); void refresh(); } }}><Icon n="trash" s={18} /></button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
