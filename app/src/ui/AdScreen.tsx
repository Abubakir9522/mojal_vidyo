import { useEffect, useState } from 'preact/hooks';
import type { Nav } from './App';
import { Chips, Top, importAll, useUi } from './kit';
import { Icon } from './icons';
import { pickFiles } from './native';
import { AspectId, Clip, MediaAsset, Project, newClip, newProject, newText } from '../engine/types';
import { addMusic } from '../data/templates';
import { builtinMusicAsset } from './Templates';
import { clipDuration } from '../engine/timeline';
import { kv } from '../store/db';
import { track } from '../store/api';

export interface Brand { name: string; phone: string; address: string; logoId?: string }

const STYLES = [
  { id: 'raqam', name: 'Raqam savdosi', intro: 'phone', outro: 'logoSpin', music: 'kuch', effect: 'f_cyber', colors: ['#0a1630', '#39d6c6', '#ffffff'] },
  { id: 'chegirma', name: 'Chegirma', intro: 'coins', outro: 'textFly', music: 'bayram', effect: 'f_vivid', colors: ['#190b05', '#ffc53d', '#ff7a1a'] },
  { id: 'mahsulot', name: 'Yangi mahsulot', intro: 'podium', outro: 'logoSpin', music: 'yengil', effect: 'f_clean', colors: ['#10121f', '#ffc53d', '#ffffff'] },
  { id: 'xizmat', name: 'Xizmat', intro: 'shapes', outro: 'crystal', music: 'ufq', effect: 'f_film', colors: ['#14102e', '#ff5fa2', '#39d6c6'] },
];

/** Fills in a short form and gets a finished advert: 3D opening, offer, price, contact details and music. */
export function AdScreen({ open }: { nav: Nav; open: (p: Project) => void }) {
  const ui = useUi();
  const [style, setStyle] = useState('raqam');
  const [title, setTitle] = useState('');
  const [items, setItems] = useState('');
  const [price, setPrice] = useState('');
  const [brand, setBrand] = useState<Brand>({ name: '', phone: '', address: '' });
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [aspect, setAspect] = useState<AspectId>('9:16');

  useEffect(() => { void kv.get<Brand>('brand').then(b => { if (b) setBrand(b); }); }, []);

  const add = async () => {
    const a = await importAll(await pickFiles('image/*,video/*'), ui);
    setMedia(m => [...m, ...a.filter(x => x.kind !== 'audio')]);
  };

  const run = async () => {
    try {
      ui.busy('Reklama tayyorlanmoqda');
      await kv.set('brand', brand);
      const st = STYLES.find(s => s.id === style)!;
      const heading = title.trim() || "MAXSUS TAKLIF";
      const p = newProject(aspect, heading);
      const clips: Clip[] = [newClip({ kind: 'scene3d', scene: st.intro, duration: 3.4, sceneParams: { text: heading.toUpperCase(), sub: price.trim(), colors: st.colors, mediaIds: media.filter(m => m.kind === 'image').map(m => m.id) } })];
      const lines = items.split('\n').map(x => x.trim()).filter(Boolean);
      const count = Math.max(lines.length, media.length);
      for (let i = 0; i < count; i++) {
        const m = media.length ? media[i % media.length] : null;
        const effects = [{ id: st.effect, amount: 0.9 }];
        if (m?.kind === 'video') clips.push(newClip({ kind: 'video', mediaId: m.id, in: 0, out: Math.min(m.duration, 2.4), effects, motion: 'zoomIn', muted: true }));
        else if (m) clips.push(newClip({ kind: 'image', mediaId: m.id, duration: 2.4, effects, motion: i % 2 ? 'tiltRight' : 'tiltLeft' }));
        else clips.push(newClip({ kind: 'color', color: st.colors[0], duration: 2.4, effects: [{ id: i % 2 ? 'l_sparkle' : 'l_bokeh', amount: 1 }] }));
      }
      const outro = newClip({ kind: 'scene3d', scene: st.outro, duration: 3.6, sceneParams: { text: (brand.name.trim() || "BIZNING DO'KON").toUpperCase(), sub: brand.phone.trim(), colors: st.colors } });
      clips.push(outro);
      clips.forEach((c, i) => { if (i < clips.length - 1) c.transition = { id: ['t_cubeL', 't_slideL', 't_flipY'][i % 3], duration: 0.45 }; });
      p.main = clips;
      // Caption times follow the clips, with each transition overlapping the next clip.
      let cursor = clipDuration(clips[0]) - 0.45;
      lines.forEach((text, i) => {
        const d = clipDuration(clips[i + 1]);
        p.texts.push(newText({ text, start: cursor + 0.2, duration: d - 0.6, font: 'Oswald', weight: 700, size: lines.length > 3 ? 6 : 7.5, y: 0.5, bg: '#0a0c1ccc', animIn: 'pop' }));
        if (price.trim()) p.texts.push(newText({ text: price.trim(), start: cursor + 0.2, duration: d - 0.6, font: 'Russo One', weight: 400, size: 5, y: 0.62, color: '#f5b301', animIn: 'slideUp' }));
        cursor += d - 0.45;
      });
      const contact = [brand.address.trim()].filter(Boolean).join('\n');
      const total = clips.reduce((s, c) => s + clipDuration(c), 0) - 0.45 * (clips.length - 1);
      if (contact) p.texts.push(newText({ text: contact, start: total - 3.4, duration: 3.3, size: 3.8, y: 0.88, animIn: 'fade' }));
      if (brand.logoId) {
        const logo = newClip({ kind: 'image', mediaId: brand.logoId, duration: total });
        p.overlays.push({ ...logo, start: 0, blend: 'normal', transform: { ...logo.transform, fit: 'contain', scale: 0.17, x: 0.34, y: 0.42 } });
      }
      const m = await builtinMusicAsset(st.music);
      if (m) addMusic(p, m, m.name);
      ui.done();
      void track('ad_builder', { style });
      await open(p);
    } catch (e) { ui.done(); ui.toast((e as Error).message, true); }
  };

  const setB = (k: keyof Brand) => (e: Event) => { const v = (e.target as HTMLInputElement).value; setBrand(b => ({ ...b, [k]: v })); };

  return (
    <>
      <Top title="Reklama ustasi" />
      <div class="pad form">
        <p class="lead">Ma'lumotni yozing, ilova 3D kirish, taklif, narx va manzil bilan tayyor reklama yig'adi. Keyin xohlagan joyini o'zgartirasiz.</p>
        <h4>Reklama turi</h4>
        <div class="style-list">{STYLES.map(s => <button key={s.id} data-testid={`ad-${s.id}`} class={style === s.id ? 'style on' : 'style'} onClick={() => setStyle(s.id)}><b>{s.name}</b></button>)}</div>
        <label class="field"><span>Sarlavha</span><input data-testid="ad-title" value={title} maxLength={40} placeholder="Masalan: Chiroyli raqamlar" onInput={e => setTitle((e.target as HTMLInputElement).value)} /></label>
        <label class="field"><span>Takliflar, har biri alohida qatorda</span><textarea data-testid="ad-items" rows={4} value={items} placeholder={'90 777 XX XX\n91 555 XX XX\nBepul sim karta'} onInput={e => setItems((e.target as HTMLTextAreaElement).value)} /></label>
        <label class="field"><span>Narx</span><input data-testid="ad-price" value={price} maxLength={40} placeholder="Masalan: 100 000 so'mdan" onInput={e => setPrice((e.target as HTMLInputElement).value)} /></label>
        <h4>Rasm yoki vidyo, ixtiyoriy</h4>
        <div class="media-strip">
          <button class="media-add" data-testid="ad-add" onClick={add}><Icon n="plus" /><span>Qo'shish</span></button>
          {media.map((m, i) => <button key={i} class="media-thumb" aria-label={`${m.name} ni olib tashlash`} style={m.thumb ? { backgroundImage: `url(${m.thumb})` } : undefined} onClick={() => setMedia(x => x.filter((_, k) => k !== i))}><Icon n="close" s={14} /></button>)}
        </div>
        <h4>Do'koningiz ma'lumoti, keyingi safar uchun saqlanadi</h4>
        <label class="field"><span>Nomi</span><input data-testid="ad-name" value={brand.name} onInput={setB('name')} /></label>
        <label class="field"><span>Telefon</span><input data-testid="ad-phone" type="tel" value={brand.phone} onInput={setB('phone')} /></label>
        <label class="field"><span>Manzil</span><input data-testid="ad-address" value={brand.address} onInput={setB('address')} /></label>
        <button class="btn" data-testid="ad-logo" onClick={async () => { const [a] = await importAll(await pickFiles('image/*', false), ui); if (a) setBrand(b => ({ ...b, logoId: a.id })); }}><Icon n="image" />{brand.logoId ? 'Logotip tanlangan, almashtirish' : 'Logotip tanlash'}</button>
        <h4>O'lcham</h4>
        <Chips items={[{ id: '9:16' as AspectId, name: '9:16' }, { id: '1:1' as AspectId, name: '1:1' }, { id: '16:9' as AspectId, name: '16:9' }, { id: '4:5' as AspectId, name: '4:5' }]} value={aspect} onChange={setAspect} label="O'lcham" />
      </div>
      <div class="sticky-cta"><button class="btn primary big" data-testid="ad-run" onClick={run}><Icon n="bolt" />Reklama yaratish</button></div>
    </>
  );
}
