import { useState } from 'preact/hooks';
import type { Nav } from './App';
import { Chips, Top, importAll, useUi } from './kit';
import { Icon } from './icons';
import { pickFiles } from './native';
import { ASPECTS, AspectId, MediaAsset, Project } from '../engine/types';
import { AUTO_STYLES, autoMontage } from '../auto/automontage';
import { MusicPicker } from './MusicPicker';
import { track } from '../store/api';

export function AutoScreen({ open }: { nav: Nav; open: (p: Project) => void }) {
  const ui = useUi();
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [music, setMusic] = useState<MediaAsset | null>(null);
  const [style, setStyle] = useState(AUTO_STYLES[0].id);
  const [aspect, setAspect] = useState<AspectId>('9:16');
  const [length, setLength] = useState('0');
  const [title, setTitle] = useState('');
  const [color, setColor] = useState(true);

  const add = async () => {
    const files = await pickFiles('video/*,image/*');
    const a = await importAll(files, ui);
    setMedia(m => [...m, ...a]);
  };
  const run = async () => {
    try {
      const p = await autoMontage({ media, music, style: AUTO_STYLES.find(s => s.id === style)!, aspect, length: +length, title, autoColor: color }, (x, msg) => ui.busy(msg, x));
      ui.done();
      void track('auto_montage', { style });
      await open(p);
    } catch (e) { ui.done(); ui.toast((e as Error).message, true); }
  };

  return (
    <>
      <Top title="Avto montaj" />
      <div class="pad form">
        <p class="lead">Fayllarni tanlang. Ilova vidyolarning eng yaxshi joylarini topadi, qo'shiq ritmiga qarab kesadi, ranglarni sozlaydi va o'tishlar qo'shadi. Natijani keyin qo'lda o'zgartira olasiz.</p>

        <h4>Rasm va vidyolar</h4>
        <div class="media-strip" data-testid="auto-media">
          <button class="media-add" data-testid="auto-add" onClick={add}><Icon n="plus" /><span>Qo'shish</span></button>
          {media.map((m, i) => (
            <button key={i} class="media-thumb" aria-label={`${m.name} ni olib tashlash`} style={m.thumb ? { backgroundImage: `url(${m.thumb})` } : undefined} onClick={() => setMedia(x => x.filter((_, k) => k !== i))}><Icon n="close" s={14} /></button>
          ))}
        </div>

        <h4>Uslub</h4>
        <div class="style-list">
          {AUTO_STYLES.map(s => (
            <button key={s.id} data-testid={`style-${s.id}`} class={style === s.id ? 'style on' : 'style'} onClick={() => setStyle(s.id)}><b>{s.name}</b><span>{s.hint}</span></button>
          ))}
        </div>

        <h4>O'lcham</h4>
        <Chips items={(Object.keys(ASPECTS) as AspectId[]).map(a => ({ id: a, name: a }))} value={aspect} onChange={setAspect} label="O'lcham" />

        <h4>Davomiyligi</h4>
        <Chips items={[{ id: '0', name: 'Avtomatik' }, { id: '15', name: '15 soniya' }, { id: '30', name: '30 soniya' }, { id: '60', name: '1 daqiqa' }]} value={length} onChange={setLength} label="Davomiyligi" />

        <label class="field"><span>Sarlavha, ixtiyoriy</span><input data-testid="auto-title" value={title} maxLength={40} placeholder="Masalan: Yangi tariflar" onInput={e => setTitle((e.target as HTMLInputElement).value)} /></label>
        <label class="check"><input type="checkbox" checked={color} onChange={e => setColor((e.target as HTMLInputElement).checked)} /><span>Ranglarni avtomatik to'g'rilash</span></label>

        <h4>Qo'shiq{music ? `: ${music.name}` : ', ixtiyoriy'}</h4>
        <MusicPicker selected={music?.id} onPick={a => setMusic(a)} />
      </div>
      <div class="sticky-cta"><button class="btn primary big" data-testid="auto-run" disabled={!media.length} onClick={run}><Icon n="wand" />Montaj qilish</button></div>
    </>
  );
}
