import { useState } from 'preact/hooks';
import type { Nav } from './App';
import { Chips, Slider, Top, importAll, useUi } from './kit';
import { Icon } from './icons';
import { pickFiles } from './native';
import { ASPECTS, AspectId, MediaAsset, Project } from '../engine/types';
import { DANCES } from '../engine/motion';
import { MusicPicker } from './MusicPicker';
import { VIZ_STYLES, VizId, danceMontage } from '../auto/dance';
import { track } from '../store/api';
import { builtinMusicAsset } from './Templates';

/** Photos that move to a song: choose pictures, a song and a way of moving. */
export function DanceScreen({ open }: { nav: Nav; open: (p: Project) => void }) {
  const ui = useUi();
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [music, setMusic] = useState<{ a: MediaAsset; name: string } | null>(null);
  const [style, setStyle] = useState('aralash');
  const [amount, setAmount] = useState(1);
  const [step, setStep] = useState('2');
  const [length, setLength] = useState('30');
  const [aspect, setAspect] = useState<AspectId>('9:16');
  const [flash, setFlash] = useState(true);
  const [viz, setViz] = useState<'none' | VizId>('none');
  const [title, setTitle] = useState('');

  const add = async () => {
    const files = await pickFiles('image/*,video/*');
    const a = await importAll(files, ui);
    setMedia(m => [...m, ...a.filter(x => x.kind !== 'audio')]);
  };
  const run = async () => {
    try {
      const song = music ?? { a: (await builtinMusicAsset('kuch'))!, name: 'Kuch' };
      const p = await danceMontage({ media, music: song.a, musicName: song.name, aspect, style, amount, beatsPerCut: +step, length: +length, flash, viz: viz === 'none' ? null : viz, title }, (x, msg) => ui.busy(msg, x));
      ui.done();
      void track('dance_montage', { style, count: media.length });
      await open(p);
    } catch (e) { ui.done(); ui.toast((e as Error).message, true); }
  };

  return (
    <>
      <Top title="Musiqaga o'ynatish" />
      <div class="pad form">
        <p class="lead">Rasmlaringiz qo'shiq ritmiga qarab harakatlanadi. Ilova qo'shiqni tinglab, har bir zarbaga rasmni sakratadi, buradi yoki silkitadi va kesishlarni zarbaga to'g'rilaydi.</p>
        <h4>Rasm va vidyolar</h4>
        <div class="media-strip" data-testid="dance-media">
          <button class="media-add" data-testid="dance-add" onClick={add}><Icon n="plus" /><span>Qo'shish</span></button>
          {media.map((m, i) => <button key={i} class="media-thumb" aria-label={`${m.name} ni olib tashlash`} style={m.thumb ? { backgroundImage: `url(${m.thumb})` } : undefined} onClick={() => setMedia(x => x.filter((_, k) => k !== i))}><Icon n="close" s={14} /></button>)}
        </div>
        <h4>Harakat</h4>
        <div class="pill-grid" data-testid="dance-styles">{DANCES.map(d => <button key={d.id} data-testid={`dance-${d.id}`} class={style === d.id ? 'chip on' : 'chip'} onClick={() => setStyle(d.id)}>{d.name}</button>)}</div>
        <Slider id="dance-amount" label="Kuchi" value={amount} min={0.2} max={1.5} onChange={setAmount} fmt={v => `${Math.round(v * 100)}%`} />
        <label class="check"><input data-testid="dance-flash" type="checkbox" checked={flash} onChange={e => setFlash((e.target as HTMLInputElement).checked)} /><span>Zarbada rasm chaqnasin</span></label>
        <h4>Rasm qancha turadi</h4>
        <Chips items={[{ id: '1', name: 'Har zarbada' }, { id: '2', name: '2 zarba' }, { id: '4', name: '4 zarba' }, { id: '8', name: '8 zarba' }]} value={step} onChange={setStep} label="Rasm almashishi" />
        <h4>Davomiyligi</h4>
        <Chips items={[{ id: '15', name: '15 soniya' }, { id: '30', name: '30 soniya' }, { id: '60', name: '1 daqiqa' }, { id: '0', name: "Butun qo'shiq" }]} value={length} onChange={setLength} label="Davomiyligi" />
        <h4>O'lcham</h4>
        <Chips items={(Object.keys(ASPECTS) as AspectId[]).map(a => ({ id: a, name: a }))} value={aspect} onChange={setAspect} label="O'lcham" />
        <h4>Ekvalayzer</h4>
        <Chips items={[{ id: 'none' as const, name: "Yo'q" }, ...VIZ_STYLES]} value={viz} onChange={setViz} label="Ekvalayzer" />
        <label class="field"><span>Sarlavha, ixtiyoriy</span><input data-testid="dance-title" value={title} maxLength={40} onInput={e => setTitle((e.target as HTMLInputElement).value)} /></label>
        <h4>Qo'shiq{music ? `: ${music.name}` : ', tanlanmasa "Kuch" ishlatiladi'}</h4>
        <MusicPicker selected={music?.a.id} onPick={(a, name) => setMusic({ a, name })} />
      </div>
      <div class="sticky-cta"><button class="btn primary big" data-testid="dance-run" disabled={!media.length} onClick={run}><Icon n="beat" />Vidyo yaratish</button></div>
    </>
  );
}
