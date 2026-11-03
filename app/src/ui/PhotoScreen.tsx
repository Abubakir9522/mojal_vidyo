import { useState } from 'preact/hooks';
import type { Nav } from './App';
import { Chips, Slider, Top, importAll, useUi } from './kit';
import { Icon } from './icons';
import { pickFiles } from './native';
import { ASPECTS, AspectId, MediaAsset, Project, newClip, newProject } from '../engine/types';
import { MusicPicker } from './MusicPicker';
import { addMusic } from '../data/templates';
import { track } from '../store/api';

const STYLES = [
  { id: 'jonli', name: 'Sekin harakat', hint: 'Yaqinlashish va suzish', motions: ['zoomIn', 'panLeft', 'zoomOut', 'panRight', 'diagonal'], transitions: ['t_fade', 't_slideL'], tl: 0.7 },
  { id: 'd3', name: '3D harakat', hint: 'Rasm hajmli buriladi', motions: ['tiltLeft', 'tiltRight', 'fly3d', 'orbit3d', 'tiltUp'], transitions: ['t_cubeL', 't_flipY', 't_door3d'], tl: 0.7 },
  { id: 'ritm', name: 'Tez ritm', hint: 'Qisqa va zarbali', motions: ['zoomInFast', 'drop', 'pulse'], transitions: ['t_flash', 't_zoomIn', 't_glitch'], tl: 0.2 },
  { id: 'album', name: 'Fotoalbom', hint: 'Varaqlanuvchi rasmlar', motions: ['slowRotate', 'zoomIn'], transitions: ['t_page', 't_fade'], tl: 0.8 },
  { id: 'kino', name: 'Kino', hint: "Qora o'tishlar, sekin yaqinlashish", motions: ['zoomIn', 'zoomOut'], transitions: ['t_black', 't_cloud'], tl: 0.9 },
];

/** Turns photos into a video with camera moves. This is motion on the original photo, not AI-generated footage. */
export function PhotoScreen({ open }: { nav: Nav; open: (p: Project) => void }) {
  const ui = useUi();
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [style, setStyle] = useState(STYLES[0].id);
  const [aspect, setAspect] = useState<AspectId>('9:16');
  const [sec, setSec] = useState(3);
  const [music, setMusic] = useState<{ a: MediaAsset; name: string } | null>(null);

  const add = async () => {
    const files = await pickFiles('image/*');
    const a = await importAll(files, ui);
    setMedia(m => [...m, ...a.filter(x => x.kind === 'image')]);
  };
  const run = async () => {
    const st = STYLES.find(s => s.id === style)!;
    const p = newProject(aspect, 'Rasmdan vidyo');
    p.main = media.map((m, i) => newClip({
      kind: 'image', mediaId: m.id, duration: sec, motion: st.motions[i % st.motions.length],
      transition: i < media.length - 1 ? { id: st.transitions[i % st.transitions.length], duration: st.tl } : null,
    }));
    if (music) addMusic(p, music.a, music.name);
    void track('photo_to_video', { style, count: media.length });
    await open(p);
  };

  return (
    <>
      <Top title="Rasmdan vidyo" />
      <div class="pad form">
        <h4>Rasmlar</h4>
        <div class="media-strip">
          <button class="media-add" data-testid="photo-add" onClick={add}><Icon n="plus" /><span>Qo'shish</span></button>
          {media.map((m, i) => <button key={i} class="media-thumb" aria-label={`${m.name} ni olib tashlash`} style={m.thumb ? { backgroundImage: `url(${m.thumb})` } : undefined} onClick={() => setMedia(x => x.filter((_, k) => k !== i))}><Icon n="close" s={14} /></button>)}
        </div>
        <h4>Harakat uslubi</h4>
        <div class="style-list">{STYLES.map(s => <button key={s.id} data-testid={`pstyle-${s.id}`} class={style === s.id ? 'style on' : 'style'} onClick={() => setStyle(s.id)}><b>{s.name}</b><span>{s.hint}</span></button>)}</div>
        <h4>O'lcham</h4>
        <Chips items={(Object.keys(ASPECTS) as AspectId[]).map(a => ({ id: a, name: a }))} value={aspect} onChange={setAspect} label="O'lcham" />
        <Slider label="Har bir rasm" value={sec} min={1} max={8} step={0.5} onChange={setSec} fmt={v => `${v} soniya`} />
        <h4>Qo'shiq{music ? `: ${music.name}` : ', ixtiyoriy'}</h4>
        <MusicPicker selected={music?.a.id} onPick={(a, name) => setMusic({ a, name })} />
      </div>
      <div class="sticky-cta"><button class="btn primary big" data-testid="photo-run" disabled={!media.length} onClick={run}><Icon n="video" />Vidyo yaratish</button></div>
    </>
  );
}
