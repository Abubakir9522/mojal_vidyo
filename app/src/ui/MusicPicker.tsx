import { useEffect, useRef, useState } from 'preact/hooks';
import { MUSIC_TRACKS } from '../data/templates';
import { api, absoluteUrl } from '../store/api';
import { ensureUrlAsset, getBlob } from '../store/media';
import { MediaAsset } from '../engine/types';
import { Icon } from './icons';
import { importAll, useUi } from './kit';
import { pickFiles } from './native';
import { builtinMusicAsset } from './Templates';

/** Built-in tracks, the online library and the phone's own songs in one list. */
export function MusicPicker({ selected, onPick }: { selected?: string | null; onPick: (a: MediaAsset, name: string) => void }) {
  const ui = useUi();
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => { audio.current?.pause(); }, []);

  const pick = async (load: () => Promise<MediaAsset | null>, name: string) => {
    ui.busy(`${name} tayyorlanmoqda`);
    try { const a = await load(); if (a) onPick(a, name); } catch (e) { ui.toast((e as Error).message, true); } finally { ui.done(); }
  };

  const preview = async (key: string, load: () => Promise<MediaAsset | null>) => {
    audio.current?.pause();
    if (playing === key) { setPlaying(null); return; }
    const a = await load();
    if (!a) return;
    const el = new Audio(URL.createObjectURL(await getBlob(a)));
    audio.current = el;
    el.onended = () => setPlaying(null);
    void el.play();
    setPlaying(key);
  };

  const row = (key: string, name: string, sub: string, load: () => Promise<MediaAsset | null>) => (
    <div class={selected === key ? 'music-row on' : 'music-row'} key={key}>
      <button class="icon-btn" aria-label={`${name} ni eshitish`} onClick={() => preview(key, load)}><Icon n={playing === key ? 'pause' : 'play'} s={18} /></button>
      <div><b>{name}</b><span>{sub}</span></div>
      <button class="btn small" data-testid={`music-${key}`} onClick={() => pick(load, name)}>{selected === key ? 'Tanlangan' : 'Tanlash'}</button>
    </div>
  );

  return (
    <div class="music-list">
      <button class="btn" data-testid="music-phone" onClick={async () => {
        const f = await pickFiles('audio/*', false);
        const [a] = await importAll(f, ui);
        if (a) onPick(a, a.name);
      }}><Icon n="music" />Telefondan qo'shiq tanlash</button>
      {api.catalog.music.length > 0 && <h4>Internetdagi kutubxona</h4>}
      {api.catalog.music.map(m => row(`net:${m.id}`, m.name, m.mood, () => ensureUrlAsset(`net:${m.id}`, absoluteUrl(m.url), m.name, 'audio')))}
      <h4>Ilova ichidagi musiqa</h4>
      {MUSIC_TRACKS.map(t => row(`music:${t.id}`, t.name, t.mood, () => builtinMusicAsset(t.id) as Promise<MediaAsset | null>))}
    </div>
  );
}
