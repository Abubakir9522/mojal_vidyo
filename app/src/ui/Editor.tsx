import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { Nav } from './App';
import { Icon } from './icons';
import { mmss, useUi } from './kit';
import { Player } from '../engine/player';
import { AudioClip, Clip, MediaAsset, OverlayClip, Project, TextClip, uid } from '../engine/types';
import { clipDuration, layoutMain, normalize, projectDuration, splitAudioAt, splitMainAt, splitOverlayAt, splitTextAt } from '../engine/timeline';
import { Timeline } from './Timeline';
import { Sheets, SheetName } from './Sheets';
import { ExportSheet } from './ExportSheet';
import { saveProject } from '../store/projects';
import { getAsset } from '../store/media';

type MutableRef<T> = { current: T };
export type Sel = { type: 'main' | 'overlay' | 'text' | 'audio'; id: string } | null;

export interface EditorApi {
  project: Project;
  sel: Sel;
  setSel: (s: Sel) => void;
  commit: (fn: (p: Project) => void, key?: string) => void;
  time: () => number;
  seek: (t: number) => void;
  seekFromScroll: (t: number) => void;
  assets: Map<string, MediaAsset>;
  ensureAssets: (ids: string[]) => Promise<void>;
  /** The main clip that is selected, or else the one under the playhead. */
  targetClip: () => Clip | OverlayClip | null;
  open: (s: SheetName) => void;
  close: () => void;
}

const MAX_UNDO = 60;

export function Editor({ initial, nav, backRef }: { initial: Project; nav: Nav; backRef: MutableRef<() => boolean> }) {
  const ui = useUi();
  const [project, setProject] = useState<Project>(initial);
  const [sel, setSel] = useState<Sel>(null);
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const [exporting, setExporting] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [, bump] = useState(0);
  const projRef = useRef(project);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<Player | null>(null);
  const timeLabel = useRef<HTMLSpanElement>(null);
  const undo = useRef<string[]>([]);
  const redo = useRef<string[]>([]);
  const lastKey = useRef<{ k: string; at: number } | null>(null);
  const saveTimer = useRef(0);
  const assets = useRef(new Map<string, MediaAsset>());
  const timelineScroll = useRef<(t: number, force?: boolean) => void>(() => {});
  const [aspectKey, setAspectKey] = useState(0);

  const ensureAssets = useCallback(async (ids: string[]) => {
    let added = false;
    for (const id of ids) if (!assets.current.has(id)) { const a = await getAsset(id); if (a) { assets.current.set(id, a); added = true; } }
    if (added) bump(x => x + 1);
  }, []);

  const mediaIdsOf = (p: Project) => [...p.main, ...p.overlays].map(c => c.mediaId).filter(Boolean).concat(p.audio.map(a => a.mediaId)) as string[];

  useEffect(() => { void ensureAssets(mediaIdsOf(project)); }, [project]);

  const persist = (p: Project) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void saveProject(p); }, 500);
  };

  const commit = useCallback((fn: (p: Project) => void, key?: string) => {
    const cur = projRef.current;
    const now = performance.now();
    const coalesce = key && lastKey.current?.k === key && now - lastKey.current.at < 1200;
    if (!coalesce) {
      undo.current.push(JSON.stringify(cur));
      if (undo.current.length > MAX_UNDO) undo.current.shift();
      redo.current = [];
    }
    lastKey.current = key ? { k: key, at: now } : null;
    const next: Project = structuredClone(cur);
    fn(next);
    normalize(next);
    projRef.current = next;
    setProject(next);
    playerRef.current?.update(next);
    persist(next);
  }, []);

  const restore = (from: MutableRef<string[]>, to: MutableRef<string[]>) => {
    const s = from.current.pop();
    if (!s) return;
    to.current.push(JSON.stringify(projRef.current));
    const p = JSON.parse(s) as Project;
    projRef.current = p; setProject(p); playerRef.current?.update(p); persist(p); setSel(null);
    lastKey.current = null;
  };

  useEffect(() => {
    const pl = new Player(canvasRef.current!, projRef.current);
    playerRef.current = pl;
    pl.onTime = t => {
      if (timeLabel.current) timeLabel.current.textContent = mmss(t);
      if (pl.playing) timelineScroll.current(t);
    };
    pl.onEnded = () => setPlaying(false);
    (window as unknown as { __player?: Player }).__player = pl;
    pl.seek(0);
    return () => {
      clearTimeout(saveTimer.current);
      const cnv = canvasRef.current;
      const p = projRef.current;
      try {
        if (cnv && p.main.length) {
          const th = document.createElement('canvas');
          const k = 180 / Math.max(cnv.width, cnv.height);
          th.width = Math.round(cnv.width * k); th.height = Math.round(cnv.height * k);
          th.getContext('2d')!.drawImage(cnv, 0, 0, th.width, th.height);
          p.thumb = th.toDataURL('image/jpeg', 0.7);
        }
      } catch { /* a missing thumbnail is harmless */ }
      void saveProject(p);
      pl.destroy();
    };
  }, []);

  // A file that cannot be opened, for instance a project restored on another phone, is reported plainly.
  useEffect(() => {
    let last = '';
    const i = setInterval(() => {
      const e = playerRef.current?.lastError ?? '';
      if (e && e !== last) { last = e; ui.toast(e, true); }
    }, 1000);
    return () => clearInterval(i);
  }, []);

  const api: EditorApi = {
    project, sel, setSel, commit, assets: assets.current, ensureAssets,
    time: () => playerRef.current?.t ?? 0,
    seek: t => { playerRef.current?.seek(t); timelineScroll.current(t, true); },
    seekFromScroll: t => { playerRef.current?.seek(t); },
    targetClip: () => {
      const p = projRef.current;
      if (sel?.type === 'main') return p.main.find(c => c.id === sel.id) ?? null;
      if (sel?.type === 'overlay') return p.overlays.find(c => c.id === sel.id) ?? null;
      const t = playerRef.current?.t ?? 0;
      return layoutMain(p).find(l => t >= l.start && t < l.end)?.clip ?? p.main[p.main.length - 1] ?? null;
    },
    open: s => { playerRef.current?.pause(); setPlaying(false); setSheet(s); },
    close: () => setSheet(null),
  };

  backRef.current = () => {
    if (exporting) { setExporting(false); return true; }
    if (sheet) { setSheet(null); return true; }
    if (sel) { setSel(null); return true; }
    return false;
  };

  const togglePlay = () => {
    const pl = playerRef.current!;
    pl.toggle();
    setPlaying(pl.playing);
  };

  const splitHere = () => {
    const t = playerRef.current?.t ?? 0;
    let ok = false;
    commit(p => {
      if (sel?.type === 'overlay') ok = splitOverlayAt(p, sel.id, t);
      else if (sel?.type === 'text') ok = splitTextAt(p, sel.id, t);
      else if (sel?.type === 'audio') ok = splitAudioAt(p, sel.id, t);
      else ok = splitMainAt(p, t);
    });
    if (!ok) ui.toast('Kesish uchun chiziqni klip ichiga olib boring');
  };

  const removeSel = () => {
    if (!sel) return;
    commit(p => {
      if (sel.type === 'main') p.main = p.main.filter(c => c.id !== sel.id);
      if (sel.type === 'overlay') p.overlays = p.overlays.filter(c => c.id !== sel.id);
      if (sel.type === 'text') p.texts = p.texts.filter(c => c.id !== sel.id);
      if (sel.type === 'audio') p.audio = p.audio.filter(c => c.id !== sel.id);
    });
    setSel(null);
  };

  const duplicateSel = () => {
    if (!sel) return;
    commit(p => {
      if (sel.type === 'main') { const i = p.main.findIndex(c => c.id === sel.id); if (i >= 0) { const c: Clip = { ...structuredClone(p.main[i]), id: uid() }; p.main.splice(i + 1, 0, c); } }
      if (sel.type === 'overlay') { const o = p.overlays.find(c => c.id === sel.id); if (o) p.overlays.push({ ...structuredClone(o), id: uid(), start: o.start + clipDuration(o) }); }
      if (sel.type === 'text') { const o = p.texts.find(c => c.id === sel.id); if (o) p.texts.push({ ...structuredClone(o), id: uid(), start: o.start + o.duration } as TextClip); }
      if (sel.type === 'audio') { const o = p.audio.find(c => c.id === sel.id); if (o) p.audio.push({ ...structuredClone(o), id: uid(), start: o.start + (o.out - o.in) } as AudioClip); }
    });
  };

  const moveMain = (d: -1 | 1) => {
    if (sel?.type !== 'main') return;
    commit(p => {
      const i = p.main.findIndex(c => c.id === sel.id), j = i + d;
      if (i < 0 || j < 0 || j >= p.main.length) return;
      [p.main[i], p.main[j]] = [p.main[j], p.main[i]];
    });
  };

  const selectedMain = sel?.type === 'main' ? project.main.find(c => c.id === sel.id) : undefined;
  const selectedOverlay = sel?.type === 'overlay' ? project.overlays.find(c => c.id === sel.id) : undefined;
  const selectedAudio = sel?.type === 'audio' ? project.audio.find(c => c.id === sel.id) : undefined;
  const selClip = selectedMain ?? selectedOverlay;

  type Tool = [string, string, () => void, string?];
  const clipTools = (): Tool[] => {
    const c = selClip!;
    const t: Tool[] = [['split', "Bo'lish", splitHere, 'split']];
    if (c.kind === 'video') t.push(['speed', 'Tezlik', () => api.open('speed'), 'speed'], ['volume', 'Ovoz', () => api.open('volume'), 'volume']);
    if (c.kind === 'scene3d') t.push(['cube', '3D sahna', () => api.open('scene'), 'scene']);
    if (c.kind === 'image' || c.kind === 'color' || c.kind === 'scene3d') t.push(['speed', 'Davomiylik', () => api.open('duration'), 'duration']);
    t.push(['fx', 'Effekt', () => api.open('effects'), 'effects'], ['filter', 'Filtr', () => api.open('filters'), 'filters']);
    if (c.kind !== 'scene3d' && c.kind !== 'color') t.push(['sliders', 'Sozlash', () => api.open('adjust'), 'adjust'], ['motion', 'Harakat', () => api.open('motion'), 'motion'], ['frame', 'Kadr', () => api.open('transform'), 'transform']);
    if (selectedOverlay) t.push(['layers', 'Aralashtirish', () => api.open('blend'), 'blend']);
    if (selectedMain) t.push(['left', 'Chapga', () => moveMain(-1), 'moveL'], ['right', "O'ngga", () => moveMain(1), 'moveR']);
    t.push(['copy', 'Nusxa', duplicateSel, 'dup'], ['trash', "O'chirish", removeSel, 'del']);
    return t;
  };
  const textTools = (): Tool[] => [['text', 'Tahrirlash', () => api.open('text'), 'textedit'], ['split', "Bo'lish", splitHere, 'split'], ['copy', 'Nusxa', duplicateSel, 'dup'], ['trash', "O'chirish", removeSel, 'del']];
  const audioTools = (): Tool[] => [['volume', 'Ovoz', () => api.open('audioedit'), 'audioedit'], ['beat', 'Ritm', () => api.open('beat'), 'beat'], ['split', "Bo'lish", splitHere, 'split'], ['copy', 'Nusxa', duplicateSel, 'dup'], ['trash', "O'chirish", removeSel, 'del']];
  const rootTools = (): Tool[] => [
    ['scissors', 'Kesish', splitHere, 'split'], ['plus', "Qo'shish", () => api.open('add'), 'add'], ['music', 'Ovoz', () => api.open('audio'), 'audio'], ['text', 'Matn', () => api.open('textnew'), 'textnew'],
    ['fx', 'Effekt', () => api.open('effects'), 'effects'], ['filter', 'Filtr', () => api.open('filters'), 'filters'], ['cube', '3D', () => api.open('scene3d'), 'scene3d'], ['layers', 'Qatlam', () => api.open('overlay'), 'overlay'],
    ['sticker', 'Stiker', () => api.open('sticker'), 'sticker'], ['wand', 'Avto', () => api.open('auto'), 'auto'], ['frame', 'Format', () => api.open('format'), 'format'],
  ];
  const tools = selClip ? clipTools() : sel?.type === 'text' ? textTools() : selectedAudio ? audioTools() : rootTools();

  // Text and overlays can be dragged directly on the picture.
  const onStagePointer = (e: PointerEvent) => {
    const cnv = canvasRef.current!;
    const r = cnv.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    const t = playerRef.current?.t ?? 0;
    let target = sel?.type === 'text' ? projRef.current.texts.find(x => x.id === sel.id) : undefined;
    if (!target) {
      const hit = projRef.current.texts.filter(x => t >= x.start && t < x.start + x.duration).find(x => Math.abs(x.x - px) < 0.4 && Math.abs(x.y - py) < x.size / 100 + 0.03);
      if (hit) { target = hit; setSel({ type: 'text', id: hit.id }); }
    }
    const ov = sel?.type === 'overlay' ? projRef.current.overlays.find(x => x.id === sel.id) : undefined;
    if (!target && !ov) return;
    const id = target?.id ?? ov!.id, isText = !!target;
    const sx = px, sy = py, ox = isText ? target!.x : ov!.transform.x, oy = isText ? target!.y : ov!.transform.y;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const move = (m: PointerEvent) => {
      const nx = (m.clientX - r.left) / r.width, ny = (m.clientY - r.top) / r.height;
      commit(p => {
        if (isText) { const x = p.texts.find(q => q.id === id); if (x) { x.x = Math.max(0, Math.min(1, ox + nx - sx)); x.y = Math.max(0, Math.min(1, oy + ny - sy)); } }
        else { const x = p.overlays.find(q => q.id === id); if (x) { x.transform.x = ox + nx - sx; x.transform.y = oy - (ny - sy); } }
      }, `drag${id}`);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  const dur = projectDuration(project);

  return (
    <div class={sheet ? 'editor sheet-open' : 'editor'} data-testid="editor" data-aspect={aspectKey}>
      <header class="ed-top">
        <button class="icon-btn" aria-label="Orqaga" data-testid="ed-back" onClick={() => { void saveProject(projRef.current).then(() => nav({ name: 'home' })); }}><Icon n="back" /></button>
        <input class="ed-name" aria-label="Loyiha nomi" value={project.name} onChange={e => commit(p => { p.name = (e.target as HTMLInputElement).value || 'Loyiha'; })} />
        <button class="icon-btn" aria-label="Bekor qilish" data-testid="undo" disabled={!undo.current.length} onClick={() => restore(undo, redo)}><Icon n="undo" /></button>
        <button class="icon-btn" aria-label="Qaytarish" data-testid="redo" disabled={!redo.current.length} onClick={() => restore(redo, undo)}><Icon n="redo" /></button>
        <button class="btn primary small" data-testid="export-open" disabled={dur <= 0} onClick={() => { playerRef.current?.pause(); setPlaying(false); setExporting(true); }}>Eksport</button>
      </header>

      <div class="stage" onPointerDown={onStagePointer as unknown as (e: Event) => void}>
        <canvas ref={canvasRef} data-testid="preview" />
        {project.main.length === 0 && project.overlays.length === 0 && project.texts.length === 0 && (
          <button class="stage-empty" data-testid="stage-add" onClick={() => api.open('add')}><Icon n="plus" s={32} /><span>Rasm yoki vidyo qo'shish</span></button>
        )}
      </div>

      <div class="transport">
        <span class="time"><span ref={timeLabel} data-testid="time">00:00.0</span> / {mmss(dur)}</span>
        <button class="play" aria-label={playing ? "To'xtatish" : "Ijro etish"} data-testid="play" onClick={togglePlay}><Icon n={playing ? 'pause' : 'play'} s={22} /></button>
        <span class="time right">{project.aspect}</span>
      </div>

      <Timeline api={api} scrollRef={timelineScroll} playing={playing} />

      <div class="tools" role="toolbar" aria-label="Tahrir vositalari" data-testid="tools">
        {sel && <button class="tool back" aria-label="Tanlovni bekor qilish" data-testid="desel" onClick={() => setSel(null)}><Icon n="back" /></button>}
        {tools.map(([icon, label, fn, id]) => <button key={label} class="tool" data-testid={`tool-${id}`} onClick={fn}><Icon n={icon} /><span>{label}</span></button>)}
      </div>

      {sheet && <Sheets name={sheet} api={api} onAspect={() => setAspectKey(k => k + 1)} />}
      {exporting && <ExportSheet project={project} onClose={() => setExporting(false)} />}
    </div>
  );
}
