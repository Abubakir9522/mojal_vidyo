import { useEffect, useRef, useState } from 'preact/hooks';
import type { EditorApi } from './Editor';
import { Chips, Sheet, Slider, Tile, importAll, useUi } from './kit';
import { Icon } from './icons';
import { pickFiles } from './native';
import { allEffects, allScenes, allTransitions, thumbUrl } from '../data/catalog';
import { FX_CATS, FxCat } from '../engine/effects';
import { MOTIONS } from '../engine/motion';
import { FONTS } from '../engine/text';
import { ASPECTS, AspectId, AudioClip, Clip, Dance, Keyframe, MediaAsset, NO_ADJUST, OverlayClip, TextAnim, TextClip, TextLoop, VoiceFx, newClip, newText, uid } from '../engine/types';
import { RAMPS, clipDuration, hasRamp, keyframedValues, layoutMain, projectDuration } from '../engine/timeline';
import { DANCES } from '../engine/motion';
import { VIZ_STYLES, beatsForProject, vizLayer } from '../auto/dance';
import { parseSrt, placeLines, speechSpans, toLines } from '../auto/tools';
import { SCENE_BY_ID } from '../engine/scene3d';
import { MusicPicker } from './MusicPicker';
import { ensureUrlAsset, getBlob, saveRawBlob } from '../store/media';
import { detectBeats } from '../auto/beat';
import { autoAudioProject, autoColorProject, snapCutsToBeats } from '../auto/automontage';

export type SheetName = 'dance' | 'viz' | 'subtitle' | 'crop' | 'mask' | 'textkf' | 'effects' | 'filters' | 'transition' | 'speed' | 'volume' | 'duration' | 'adjust' | 'motion' | 'transform' | 'blend' | 'text' | 'textnew' | 'textedit' | 'audio' | 'audioedit' | 'beat' | 'scene' | 'scene3d' | 'overlay' | 'sticker' | 'auto' | 'format' | 'add';

const pct = (v: number) => `${Math.round(v * 100)}%`;
const COLORS = ['#ffffff', '#000000', '#ffc53d', '#ff5fa2', '#39d6c6', '#8a6cff', '#ff3b4e', '#2d8cff', '#7ee081', '#ff7a1a'];
const FADE = (v: number) => `${v.toFixed(1)} s`;
const VOICES: { id: VoiceFx; name: string }[] = [{ id: 'none', name: "Yo'q" }, { id: 'ingichka', name: 'Ingichka' }, { id: 'yogon', name: "Yo'g'on" }, { id: 'robot', name: 'Robot' }, { id: 'aks', name: 'Aks-sado' }, { id: 'zal', name: 'Katta zal' }];

function clipPatch(api: EditorApi, target: Clip | OverlayClip, fn: (c: Clip) => void, key?: string) {
  api.commit(p => {
    const c = p.main.find(x => x.id === target.id) ?? p.overlays.find(x => x.id === target.id);
    if (c) fn(c);
  }, key);
}

function NeedsClip({ api, title }: { api: EditorApi; title: string }) {
  return <Sheet title={title} onClose={api.close}><p class="empty">Avval vaqt chizig'iga rasm yoki vidyo qo'shing.</p></Sheet>;
}

function EffectsSheet({ api, filters }: { api: EditorApi; filters: boolean }) {
  const [cat, setCat] = useState<FxCat>(filters ? 'filter' : 'd3');
  const target = api.targetClip();
  const [lastId, setLastId] = useState<string | null>(null);
  if (!target) return <NeedsClip api={api} title={filters ? 'Filtrlar' : 'Effektlar'} />;
  const live = api.project.main.find(c => c.id === target.id) ?? api.project.overlays.find(c => c.id === target.id) ?? target;
  const list = allEffects(filters ? 'filter' : cat);
  const isOn = (id: string) => live.effects.some(e => e.id === id);
  const toggle = (id: string, amount: number) => {
    const on = isOn(id);
    clipPatch(api, live, c => {
      if (on) c.effects = c.effects.filter(e => e.id !== id);
      else {
        if (filters) c.effects = c.effects.filter(e => !e.id.startsWith('f_'));
        c.effects.push({ id, amount });
        if (c.effects.length > 5) c.effects.shift();
      }
    });
    setLastId(on ? null : id);
  };
  const cur = live.effects.find(e => e.id === lastId) ?? live.effects[live.effects.length - 1];
  return (
    <Sheet title={filters ? 'Filtrlar' : 'Effektlar'} onClose={api.close} tall actions={live.effects.length > 0 && <>
      <button class="btn small ghost" data-testid="fx-all" onClick={() => api.commit(p => { p.main.forEach(c => { if (c.kind !== 'scene3d') c.effects = structuredClone(live.effects); }); })}>Barchasiga</button>
      <button class="btn small ghost" data-testid="fx-clear" onClick={() => clipPatch(api, live, c => { c.effects = filters ? c.effects.filter(e => !e.id.startsWith('f_')) : c.effects.filter(e => e.id.startsWith('f_')); })}>Tozalash</button>
    </>}>
      {!filters && <Chips items={FX_CATS.filter(c => c.id !== 'filter')} value={cat} onChange={setCat} label="Effekt turi" />}
      {cur && <Slider id="fx-amount" label="Kuchi" value={cur.amount} min={0} max={1} onChange={v => clipPatch(api, live, c => { const e = c.effects.find(x => x.id === cur.id); if (e) e.amount = v; }, 'fxamt')} fmt={pct} />}
      <div class="fx-grid" data-testid="fx-grid">
        {list.map(e => <Tile key={e.id} id={`fx-${e.id}`} img={thumbUrl('fx', e.id)} name={e.name} on={isOn(e.id)} color="#262b52" onClick={() => toggle(e.id, e.defaultAmount ?? 0.7)} />)}
      </div>
    </Sheet>
  );
}

function TransitionSheet({ api }: { api: EditorApi }) {
  const target = api.targetClip();
  const list = allTransitions();
  const [cat, setCat] = useState('all');
  if (!target || api.sel?.type !== 'main') return <NeedsClip api={api} title="O'tishlar" />;
  const live = api.project.main.find(c => c.id === target.id);
  if (!live) return null;
  const cats = ['all', ...new Set(list.map(t => t.cat))];
  const setAll = () => api.commit(p => { p.main.forEach((c, i) => { if (i < p.main.length - 1) c.transition = live.transition ? { ...live.transition } : null; }); });
  return (
    <Sheet title="O'tishlar" onClose={api.close} tall actions={<button class="btn small ghost" data-testid="tr-all" onClick={setAll}>Barchasiga</button>}>
      <Chips items={cats.map(c => ({ id: c, name: c === 'all' ? 'Barchasi' : c }))} value={cat} onChange={setCat} label="O'tish turi" />
      {live.transition && <Slider id="tr-dur" label="Davomiyligi" value={live.transition.duration} min={0.1} max={2} onChange={v => clipPatch(api, live, c => { if (c.transition) c.transition.duration = v; }, 'trdur')} fmt={FADE} />}
      <div class="fx-grid" data-testid="tr-grid">
        <Tile id="tr-none" name="Yo'q" on={!live.transition} color="#262b52" onClick={() => clipPatch(api, live, c => { c.transition = null; })} />
        {list.filter(t => cat === 'all' || t.cat === cat).map(t => <Tile key={t.id} id={`tr-${t.id}`} img={thumbUrl('tr', t.id)} name={t.name} on={live.transition?.id === t.id} color="#262b52" onClick={() => clipPatch(api, live, c => { c.transition = { id: t.id, duration: c.transition?.duration ?? 0.6 }; })} />)}
      </div>
    </Sheet>
  );
}

function SpeedSheet({ api }: { api: EditorApi }) {
  const t = api.targetClip();
  if (!t) return <NeedsClip api={api} title="Tezlik" />;
  const live = api.project.main.find(c => c.id === t.id) ?? api.project.overlays.find(c => c.id === t.id)!;
  return (
    <Sheet title="Tezlik" onClose={api.close}>
      <Slider id="speed" label="Tezlik" value={live.speed} min={0.25} max={4} step={0.05} onChange={v => clipPatch(api, live, c => { c.speed = v; }, 'speed')} fmt={v => `${v.toFixed(2)}x`} />
      <div class="row-btns">{[0.25, 0.5, 1, 1.5, 2, 3, 4].map(s => <button key={s} class={live.speed === s ? 'chip on' : 'chip'} onClick={() => clipPatch(api, live, c => { c.speed = s; })}>{s}x</button>)}</div>
      <p class="hint">Yangi uzunligi: {clipDuration(live).toFixed(1)} soniya.</p>
      <h4>Tezlik egri chizig'i</h4>
      <div class="pill-grid" data-testid="ramps">{RAMPS.map(r => <button key={r.id} data-testid={`ramp-${r.id}`} class={(live.ramp ?? 'none') === r.id ? 'chip on' : 'chip'} onClick={() => clipPatch(api, live, c => { c.ramp = r.id; })}>{r.name}</button>)}</div>
      {hasRamp(live) && <p class="hint">Egri chiziqli klip o'z ovozisiz ijro etiladi.</p>}
      <label class="check"><input data-testid="keep-pitch" type="checkbox" checked={live.keepPitch !== false} onChange={e => { const v = (e.target as HTMLInputElement).checked; clipPatch(api, live, c => { c.keepPitch = v; }); }} /><span>Ovoz balandligini saqlash</span></label>
    </Sheet>
  );
}

function VolumeSheet({ api }: { api: EditorApi }) {
  const ui = useUi();
  const t = api.targetClip();
  if (!t) return <NeedsClip api={api} title="Ovoz" />;
  const live = api.project.main.find(c => c.id === t.id) ?? api.project.overlays.find(c => c.id === t.id)!;
  const extract = () => {
    if (!live.mediaId) return;
    const l = layoutMain(api.project).find(x => x.clip.id === live.id);
    const start = l?.start ?? (live as OverlayClip).start ?? 0;
    const name = api.assets.get(live.mediaId)?.name ?? 'Vidyo ovozi';
    api.commit(p => {
      const c = p.main.find(x => x.id === live.id) ?? p.overlays.find(x => x.id === live.id);
      if (c) c.muted = true;
      p.audio.push({ id: uid(), mediaId: live.mediaId!, name, start, in: live.in, out: live.out, volume: live.volume, fadeIn: 0, fadeOut: 0, loop: false, muted: false, kind: 'voice' });
    });
    ui.toast('Ovoz alohida qatorga ajratildi');
  };
  return (
    <Sheet title="Ovoz" onClose={api.close}>
      <label class="check"><input data-testid="mute" type="checkbox" checked={live.muted} onChange={e => { const v = (e.target as HTMLInputElement).checked; clipPatch(api, live, c => { c.muted = v; }); }} /><span>Ovozsiz qilish</span></label>
      <Slider id="volume" label="Balandligi" value={live.volume} min={0} max={2} onChange={v => clipPatch(api, live, c => { c.volume = v; }, 'vol')} fmt={pct} />
      <Slider label="Asta kirish" value={live.fadeIn} min={0} max={3} step={0.1} onChange={v => clipPatch(api, live, c => { c.fadeIn = v; }, 'fi')} fmt={FADE} />
      <Slider label="Asta chiqish" value={live.fadeOut} min={0} max={3} step={0.1} onChange={v => clipPatch(api, live, c => { c.fadeOut = v; }, 'fo')} fmt={FADE} />
      <button class="btn" data-testid="extract" onClick={extract}><Icon n="wave" />Ovozni alohida ajratish</button>
      <label class="check"><input data-testid="denoise" type="checkbox" checked={!!live.denoise} onChange={e => { const v = (e.target as HTMLInputElement).checked; clipPatch(api, live, c => { c.denoise = v; }); }} /><span>Shovqinni kamaytirish</span></label>
      <h4>Ovoz effekti</h4>
      <div class="pill-grid">{VOICES.map(v => <button key={v.id} data-testid={`voice-${v.id}`} class={(live.voice ?? 'none') === v.id ? 'chip on' : 'chip'} onClick={() => clipPatch(api, live, c => { c.voice = v.id; })}>{v.name}</button>)}</div>
      <p class="hint">Shovqin kamaytirish va ovoz effekti tayyor vidyoda eshitiladi.</p>
    </Sheet>
  );
}

function DurationSheet({ api }: { api: EditorApi }) {
  const t = api.targetClip();
  if (!t) return <NeedsClip api={api} title="Davomiylik" />;
  const live = api.project.main.find(c => c.id === t.id) ?? api.project.overlays.find(c => c.id === t.id)!;
  return <Sheet title="Davomiylik" onClose={api.close}><Slider id="duration" label="Uzunligi" value={live.duration} min={0.3} max={30} step={0.1} onChange={v => clipPatch(api, live, c => { c.duration = v; }, 'dur')} fmt={FADE} /></Sheet>;
}

function AdjustSheet({ api }: { api: EditorApi }) {
  const t = api.targetClip();
  if (!t) return <NeedsClip api={api} title="Sozlash" />;
  const live = api.project.main.find(c => c.id === t.id) ?? api.project.overlays.find(c => c.id === t.id)!;
  const rows: [keyof typeof NO_ADJUST, string, number, number][] = [
    ['brightness', 'Yorqinlik', -1, 1], ['contrast', 'Kontrast', -1, 1], ['saturation', "To'yinganlik", -1, 1], ['temperature', 'Harorat', -1, 1],
    ['tint', 'Tus', -1, 1], ['sharpen', 'Tiniqlik', 0, 1], ['vignette', 'Chekka soya', 0, 1], ['fade', 'Xiralik', 0, 1],
  ];
  return (
    <Sheet title="Sozlash" onClose={api.close} tall actions={<button class="btn small ghost" onClick={() => clipPatch(api, live, c => { c.adjust = { ...NO_ADJUST }; })}>Asliga qaytarish</button>}>
      {rows.map(([k, label, min, max]) => <Slider key={k} id={`adj-${k}`} label={label} value={live.adjust[k]} min={min} max={max} onChange={v => clipPatch(api, live, c => { c.adjust[k] = v; }, `adj${k}`)} fmt={pct} />)}
    </Sheet>
  );
}

function MotionSheet({ api }: { api: EditorApi }) {
  const t = api.targetClip();
  if (!t) return <NeedsClip api={api} title="Harakat" />;
  const live = api.project.main.find(c => c.id === t.id) ?? api.project.overlays.find(c => c.id === t.id)!;
  return (
    <Sheet title="Kamera harakati" onClose={api.close}>
      <div class="pill-grid" data-testid="motion-grid">{MOTIONS.map(m => <button key={m.id} data-testid={`motion-${m.id}`} class={live.motion === m.id ? 'chip on' : 'chip'} onClick={() => clipPatch(api, live, c => { c.motion = m.id; })}>{m.name}</button>)}</div>
    </Sheet>
  );
}

function TransformSheet({ api }: { api: EditorApi }) {
  const t = api.targetClip();
  if (!t) return <NeedsClip api={api} title="Kadr" />;
  const live = api.project.main.find(c => c.id === t.id) ?? api.project.overlays.find(c => c.id === t.id)!;
  const tr = live.transform;
  const set = (fn: (x: typeof tr) => void, key?: string) => clipPatch(api, live, c => fn(c.transform), key);
  const pl = layoutMain(api.project).find(l => l.clip.id === live.id);
  const start = pl?.start ?? (live as OverlayClip).start ?? 0;
  const local = Math.max(0, Math.min(clipDuration(live), api.time() - start));
  const frames = live.keyframes ?? [];
  const cur = keyframedValues(frames, local);
  const v = cur ?? { x: tr.x, y: tr.y, scale: tr.scale, rotation: tr.rotation, opacity: tr.opacity };
  const nearFrame = frames.find(k => Math.abs(k.t - local) < 0.05);
  /** With keyframes in use, a slider edits the keyframe under the playhead, making one if needed. */
  const setValue = (k: 'x' | 'y' | 'scale' | 'rotation' | 'opacity', val: number, key: string) => {
    if (!frames.length) { set(x => { x[k] = val; }, key); return; }
    clipPatch(api, live, c => {
      const list = c.keyframes ?? [];
      let f = list.find(q => Math.abs(q.t - local) < 0.05);
      if (!f) { f = { t: local, x: v.x, y: v.y, scale: v.scale, rotation: v.rotation, opacity: v.opacity }; list.push(f); list.sort((a, b) => a.t - b.t); }
      f[k] = val;
      c.keyframes = list;
    }, key);
  };
  const addFrame = () => clipPatch(api, live, c => {
    const list: Keyframe[] = (c.keyframes ?? []).filter(k => Math.abs(k.t - local) >= 0.05);
    list.push({ t: local, x: v.x, y: v.y, scale: v.scale, rotation: v.rotation, opacity: v.opacity });
    c.keyframes = list.sort((a, b) => a.t - b.t);
  });
  return (
    <Sheet title="Kadr" onClose={api.close} tall>
      <Chips items={[{ id: 'cover', name: "Ekranni to'ldirish" }, { id: 'contain', name: "To'liq ko'rsatish" }]} value={tr.fit} onChange={val => set(x => { x.fit = val; })} label="Joylashuv" />
      {tr.fit === 'contain' && api.sel?.type === 'main' && <label class="check"><input data-testid="canvas-blur" type="checkbox" checked={live.canvas === 'blur'} onChange={e => { const on = (e.target as HTMLInputElement).checked; clipPatch(api, live, c => { c.canvas = on ? 'blur' : 'none'; }); }} /><span>Bo'sh joyni xira fon bilan to'ldirish</span></label>}
      <div class="kf-row" data-testid="kf-row">
        <button class="chip" data-testid="kf-add" onClick={addFrame}><Icon n="plus" s={16} />Kalit kadr</button>
        {nearFrame && <button class="chip" data-testid="kf-del" onClick={() => clipPatch(api, live, c => { c.keyframes = (c.keyframes ?? []).filter(k => Math.abs(k.t - local) >= 0.05); })}>Bu kadrni o'chirish</button>}
        {frames.length > 0 && <button class="chip" data-testid="kf-clear" onClick={() => clipPatch(api, live, c => { c.keyframes = []; })}>Hammasini tozalash</button>}
        <p class="hint">{frames.length ? `${frames.length} ta kalit kadr. Chiziqni boshqa joyga surib, qiymatni o'zgartiring: rasm shu joylar orasida silliq harakatlanadi.` : "Harakat yaratish uchun chiziqni kerakli joyga qo'yib, kalit kadr qo'shing."}</p>
      </div>
      <Slider id="tr-scale" label="O'lcham" value={v.scale} min={0.1} max={3} onChange={val => setValue('scale', val, 'sc')} fmt={pct} />
      <Slider id="tr-x" label="Gorizontal joy" value={v.x} min={-1} max={1} onChange={val => setValue('x', val, 'tx')} fmt={pct} />
      <Slider id="tr-y" label="Vertikal joy" value={v.y} min={-1} max={1} onChange={val => setValue('y', val, 'ty')} fmt={pct} />
      <Slider label="Burchak" value={v.rotation} min={-3.1416} max={3.1416} onChange={val => setValue('rotation', val, 'rot')} fmt={val => `${Math.round((val * 180) / Math.PI)} daraja`} />
      <Slider label="Shaffoflik" value={v.opacity} min={0} max={1} onChange={val => setValue('opacity', val, 'op')} fmt={pct} />
      <div class="row-btns">
        <button class="chip" onClick={() => set(x => { x.rotation = (x.rotation + Math.PI / 2) % (Math.PI * 2); })}><Icon n="rotate" s={16} />90 daraja</button>
        <button class={tr.flipH ? 'chip on' : 'chip'} onClick={() => set(x => { x.flipH = !x.flipH; })}><Icon n="flip" s={16} />Ko'zgu</button>
        <button class={tr.flipV ? 'chip on' : 'chip'} onClick={() => set(x => { x.flipV = !x.flipV; })}>Teskari</button>
      </div>
    </Sheet>
  );
}

function BlendSheet({ api }: { api: EditorApi }) {
  const sel = api.sel;
  const live = sel?.type === 'overlay' ? api.project.overlays.find(o => o.id === sel.id) : undefined;
  if (!live) return <NeedsClip api={api} title="Aralashtirish" />;
  const hasChroma = live.effects.some(e => e.id === 's_chroma');
  return (
    <Sheet title="Aralashtirish" onClose={api.close}>
      <Chips items={[{ id: 'normal', name: 'Oddiy' }, { id: 'screen', name: 'Yoritish' }, { id: 'multiply', name: "Qoraytirish" }, { id: 'add', name: "Qo'shish" }]} value={live.blend} onChange={v => api.commit(p => { const o = p.overlays.find(x => x.id === live.id); if (o) o.blend = v; })} label="Aralashtirish usuli" />
      <label class="check"><input type="checkbox" checked={hasChroma} onChange={e => { const on = (e.target as HTMLInputElement).checked; api.commit(p => { const o = p.overlays.find(x => x.id === live.id); if (o) o.effects = on ? [...o.effects, { id: 's_chroma', amount: 0.7 }] : o.effects.filter(x => x.id !== 's_chroma'); }); }} /><span>Yashil fonni olib tashlash</span></label>
    </Sheet>
  );
}

const ANIMS: { id: TextAnim; name: string }[] = [{ id: 'none', name: "Yo'q" }, { id: 'fade', name: 'Erish' }, { id: 'pop', name: 'Sakrab' }, { id: 'zoom', name: 'Zum' }, { id: 'slideUp', name: 'Pastdan' }, { id: 'slideDown', name: 'Yuqoridan' }, { id: 'slideLeft', name: "O'ngdan" }, { id: 'slideRight', name: 'Chapdan' }, { id: 'bounce', name: 'Tushib' }, { id: 'blur', name: 'Xiradan' }, { id: 'flip', name: "Ag'darilib" }, { id: 'spin', name: 'Aylanib' }, { id: 'type', name: 'Yozilib' }, { id: 'letters', name: 'Harfma-harf' }, { id: 'wave', name: "To'lqin" }];
const LOOPS: { id: TextLoop; name: string }[] = [{ id: 'none', name: "Yo'q" }, { id: 'pulse', name: 'Puls' }, { id: 'shake', name: 'Titrash' }, { id: 'float', name: 'Suzish' }, { id: 'glow', name: 'Nur' }, { id: 'wiggle', name: 'Tebranish' }];

const TEXT_PRESETS: (Partial<TextClip> & { name: string; font: string; weight: number })[] = [
  { name: 'Oltin', font: 'Russo One', weight: 400, color: '#ffc53d', gradient: ['#fff1a8', '#ffc53d', '#c9820a'], animIn: 'pop' },
  { name: 'Neon', font: 'Montserrat', weight: 800, color: '#ff5fa2', loop: 'glow', animIn: 'fade' },
  { name: 'Reklama', font: 'Oswald', weight: 700, color: '#ffffff', bg: '#d6246e', animIn: 'slideUp' },
  { name: 'Chegirma', font: 'Russo One', weight: 400, color: '#ff3b4e', stroke: '#ffffff', strokeWidth: 0.08, loop: 'pulse', animIn: 'zoom' },
  { name: 'Subtitr', font: 'Montserrat', weight: 800, color: '#ffffff', stroke: '#000000', strokeWidth: 0.16, animIn: 'none', animOut: 'none' },
  { name: 'Sariq fon', font: 'Roboto Condensed', weight: 700, color: '#14122b', bg: '#ffc53d', animIn: 'pop' },
  { name: 'Kino', font: 'Playfair Display', weight: 700, color: '#f4efe2', letterSpacing: 0.08, animIn: 'blur' },
  { name: "To'y", font: 'Pacifico', weight: 400, color: '#ffc53d', animIn: 'fade', loop: 'float' },
  { name: 'Bayram', font: 'Lobster', weight: 400, color: '#ff5fa2', stroke: '#ffffff', strokeWidth: 0.05, animIn: 'bounce' },
  { name: 'Qalam', font: 'Caveat', weight: 700, color: '#ffffff', animIn: 'type' },
  { name: 'Sport', font: 'Russo One', weight: 400, color: '#39d6c6', loop: 'shake', animIn: 'zoom' },
  { name: 'Yumshoq', font: 'Comfortaa', weight: 700, color: '#ffffff', bg: '#00000088', animIn: 'slideUp' },
  { name: "To'lqin", font: 'Montserrat', weight: 800, color: '#ffffff', animIn: 'wave' },
  { name: 'Harfma-harf', font: 'Oswald', weight: 700, color: '#ffffff', animIn: 'letters' },
];

function TextSheet({ api, isNew }: { api: EditorApi; isNew: boolean }) {
  const created = useRef(false);
  const sel = api.sel;
  useEffect(() => {
    if (isNew && !created.current) {
      created.current = true;
      const t = newText({ start: api.time(), duration: 3, y: 0.5 });
      api.commit(p => { p.texts.push(t); });
      api.setSel({ type: 'text', id: t.id });
    }
  }, []);
  const [tab, setTab] = useState<'text' | 'ready' | 'style' | 'anim'>('text');
  const live = sel?.type === 'text' ? api.project.texts.find(t => t.id === sel.id) : undefined;
  if (!live) return null;
  const set = (fn: (t: TextClip) => void, key?: string) => api.commit(p => { const t = p.texts.find(x => x.id === live.id); if (t) fn(t); }, key);
  const Swatches = ({ value, onPick, allowNone }: { value: string; onPick: (c: string) => void; allowNone?: boolean }) => (
    <div class="swatches">
      {allowNone && <button class={!value ? 'swatch none on' : 'swatch none'} aria-label="Rangsiz" onClick={() => onPick('')} />}
      {COLORS.map(c => <button key={c} aria-label={c} class={value === c ? 'swatch on' : 'swatch'} style={{ background: c }} onClick={() => onPick(c)} />)}
      <input type="color" aria-label="Boshqa rang" value={value || '#ffffff'} onInput={e => onPick((e.target as HTMLInputElement).value)} />
    </div>
  );
  return (
    <Sheet title="Matn" onClose={api.close} tall>
      <Chips items={[{ id: 'text', name: 'Matn' }, { id: 'ready', name: 'Tayyor uslub' }, { id: 'style', name: 'Uslub' }, { id: 'anim', name: 'Animatsiya' }]} value={tab} onChange={setTab} label="Matn sozlamalari" />
      {tab === 'text' && (
        <>
          <textarea data-testid="text-input" rows={2} aria-label="Matn" value={live.text} onInput={e => set(t => { t.text = (e.target as HTMLTextAreaElement).value; }, 'txt')} />
          <h4>Shrift</h4>
          <div class="fonts">{FONTS.map(f => <button key={f.id} data-testid={`font-${f.name}`} class={live.font === f.id ? 'chip on' : 'chip'} style={{ fontFamily: `"${f.id}"`, fontWeight: f.weights[f.weights.length - 1] }} onClick={() => set(t => { t.font = f.id; t.weight = f.weights[f.weights.length - 1]; })}>{f.name}</button>)}</div>
          <Slider id="text-size" label="O'lcham" value={live.size} min={2} max={22} step={0.2} onChange={v => set(t => { t.size = v; }, 'sz')} fmt={v => v.toFixed(1)} />
          <Slider id="text-dur" label="Davomiyligi" value={live.duration} min={0.3} max={30} step={0.1} onChange={v => set(t => { t.duration = v; }, 'tdur')} fmt={FADE} />
        </>
      )}
      {tab === 'ready' && (
        <div class="preset-grid" data-testid="text-presets">
          {TEXT_PRESETS.map(pr => (
            <button key={pr.name} class="preset" data-testid={`preset-${pr.name}`} aria-label={pr.name} style={{ fontFamily: `"${pr.font}"`, fontWeight: pr.weight, color: pr.gradient ? pr.gradient[0] : pr.color, background: pr.bg || undefined, WebkitTextStroke: pr.strokeWidth ? `1px ${pr.stroke}` : undefined }}
              onClick={() => set(t => { Object.assign(t, { gradient: undefined, bg: '', strokeWidth: 0, stroke: '#000000', loop: 'none', shadow: true, letterSpacing: 0 }, pr, { name: undefined }); })}>{pr.name}</button>
          ))}
        </div>
      )}
      {tab === 'style' && (
        <>
          <h4>Rang</h4><Swatches value={live.color} onPick={c => set(t => { t.color = c || '#ffffff'; t.gradient = undefined; })} />
          <h4>Kontur</h4><Swatches value={live.strokeWidth > 0 ? live.stroke : ''} allowNone onPick={c => set(t => { if (c) { t.stroke = c; t.strokeWidth = t.strokeWidth || 0.08; } else t.strokeWidth = 0; })} />
          {live.strokeWidth > 0 && <Slider label="Kontur qalinligi" value={live.strokeWidth} min={0.01} max={0.3} onChange={v => set(t => { t.strokeWidth = v; }, 'sw')} fmt={v => v.toFixed(2)} />}
          <h4>Fon</h4><Swatches value={live.bg} allowNone onPick={c => set(t => { t.bg = c; })} />
          <label class="check"><input type="checkbox" checked={live.shadow} onChange={e => { const v = (e.target as HTMLInputElement).checked; set(t => { t.shadow = v; }); }} /><span>Soya</span></label>
          <Chips items={[{ id: 'left', name: 'Chapga' }, { id: 'center', name: 'Markazga' }, { id: 'right', name: "O'ngga" }]} value={live.align} onChange={v => set(t => { t.align = v; })} label="Tekislash" />
          <Slider label="Harflar orasi" value={live.letterSpacing} min={-0.05} max={0.4} onChange={v => set(t => { t.letterSpacing = v; }, 'ls')} fmt={v => v.toFixed(2)} />
          <Slider label="Burchak" value={live.rotation} min={-3.14} max={3.14} onChange={v => set(t => { t.rotation = v; }, 'rt')} fmt={v => `${Math.round((v * 180) / Math.PI)} daraja`} />
        </>
      )}
      {tab === 'anim' && (
        <>
          <h4>Kirish</h4><div class="pill-grid">{ANIMS.map(a => <button key={a.id} data-testid={`anim-${a.id}`} class={live.animIn === a.id ? 'chip on' : 'chip'} onClick={() => set(t => { t.animIn = a.id; })}>{a.name}</button>)}</div>
          <h4>Chiqish</h4><div class="pill-grid">{ANIMS.filter(a => !['type', 'letters', 'wave'].includes(a.id)).map(a => <button key={a.id} class={live.animOut === a.id ? 'chip on' : 'chip'} onClick={() => set(t => { t.animOut = a.id; })}>{a.name}</button>)}</div>
          <h4>Doimiy</h4><div class="pill-grid">{LOOPS.map(a => <button key={a.id} class={live.loop === a.id ? 'chip on' : 'chip'} onClick={() => set(t => { t.loop = a.id; })}>{a.name}</button>)}</div>
        </>
      )}
    </Sheet>
  );
}

function DanceSheet({ api }: { api: EditorApi }) {
  const ui = useUi();
  const target = api.sel?.type === 'main' || api.sel?.type === 'overlay' ? api.targetClip() : null;
  const live = target ? (api.project.main.find(c => c.id === target.id) ?? api.project.overlays.find(c => c.id === target.id)) : null;
  const first = live ?? api.project.main.find(c => c.dance) ?? null;
  const d: Dance = first?.dance ?? { style: 'none', amount: 1, flash: false, fxOnBeat: true };
  const music = api.project.audio.find(a => a.kind === 'music') ?? api.project.audio[0];
  const hasBeats = !!music?.beats?.length;
  const write = (fn: (x: Dance) => void, key?: string) => api.commit(p => {
    const list: Clip[] = live ? [...p.main, ...p.overlays].filter(c => c.id === live.id) : p.main.filter(c => c.kind !== 'scene3d');
    for (const c of list) { const nd: Dance = { ...(c.dance ?? d) }; fn(nd); c.dance = nd.style === 'none' ? undefined : nd; }
  }, key);
  const detect = async () => {
    ui.busy("Qo'shiq ritmi aniqlanmoqda");
    try {
      const copy = structuredClone(api.project);
      await api.ensureAssets(copy.audio.map(a => a.mediaId));
      const ok = await beatsForProject(copy, id => api.assets.get(id));
      if (!ok) { ui.toast("Qo'shiqda ritm topilmadi"); return; }
      api.commit(p => { p.audio = copy.audio; });
      ui.toast('Ritm topildi');
    } catch (e) { ui.toast((e as Error).message, true); } finally { ui.done(); }
  };
  return (
    <Sheet title={live ? "Musiqaga o'ynatish" : "Barcha rasmlarni o'ynatish"} onClose={api.close} tall>
      {!music && <p class="hint" data-testid="dance-nomusic">Hali qo'shiq yo'q. Hozir rasm bir tekis ritmda harakatlanadi. Qo'shiq qo'shsangiz, uning ritmiga o'tadi.</p>}
      {music && !hasBeats && <button class="btn primary" data-testid="dance-detect" onClick={detect}><Icon n="beat" />Qo'shiq ritmini aniqlash</button>}
      {hasBeats && <p class="hint">Rasm "{music!.name}" qo'shig'i ritmiga harakatlanadi.</p>}
      <div class="pill-grid" data-testid="dance-list">
        <button class={d.style === 'none' ? 'chip on' : 'chip'} data-testid="dance-none" onClick={() => write(x => { x.style = 'none'; })}>Yo'q</button>
        {DANCES.map(x => <button key={x.id} data-testid={`dance-${x.id}`} class={d.style === x.id ? 'chip on' : 'chip'} onClick={() => write(n => { n.style = x.id; })}>{x.name}</button>)}
      </div>
      {d.style !== 'none' && <>
        <Slider id="dance-amt" label="Kuchi" value={d.amount} min={0.1} max={1.5} onChange={v => write(x => { x.amount = v; }, 'dam')} fmt={pct} />
        <label class="check"><input data-testid="dance-flash" type="checkbox" checked={d.flash} onChange={e => { const v = (e.target as HTMLInputElement).checked; write(x => { x.flash = v; }); }} /><span>Zarbada chaqnash</span></label>
        <label class="check"><input type="checkbox" checked={d.fxOnBeat} onChange={e => { const v = (e.target as HTMLInputElement).checked; write(x => { x.fxOnBeat = v; }); }} /><span>Effektlar zarbaga ergashsin</span></label>
      </>}
    </Sheet>
  );
}

function VizSheet({ api }: { api: EditorApi }) {
  const music = api.project.audio.find(a => a.kind === 'music') ?? api.project.audio[0];
  const existing = api.project.texts.find(t => t.viz);
  return (
    <Sheet title="Ekvalayzer" onClose={api.close}>
      <p class="hint">{music ? "Qo'shiq chastotalariga qarab harakatlanuvchi qatlam. Tanlangach, barmoq bilan surish mumkin." : "Ekvalayzer ishlashi uchun avval qo'shiq qo'shing."}</p>
      <div class="pill-grid" data-testid="viz-list">{VIZ_STYLES.map(v => <button key={v.id} data-testid={`viz-${v.id}`} class={existing?.viz === v.id ? 'chip on' : 'chip'} disabled={!music} onClick={() => {
        const layer = vizLayer(v.id, Math.max(1, projectDuration(api.project)));
        api.commit(p => { p.texts = p.texts.filter(t => !t.viz); p.texts.push(layer); });
        api.setSel({ type: 'text', id: layer.id });
      }}>{v.name}</button>)}</div>
      {existing && <>
        <div class="swatches">{COLORS.map(c => <button key={c} aria-label={c} class="swatch" style={{ background: c }} onClick={() => api.commit(p => { const t = p.texts.find(x => x.viz); if (t) { t.color = c; t.gradient = undefined; } })} />)}</div>
        <Slider label="Balandligi" value={existing.size} min={3} max={30} step={0.5} onChange={v => api.commit(p => { const t = p.texts.find(x => x.viz); if (t) t.size = v; }, 'vs')} fmt={v => v.toFixed(0)} />
        <button class="btn ghost" data-testid="viz-remove" onClick={() => { api.commit(p => { p.texts = p.texts.filter(t => !t.viz); }); api.setSel(null); }}>Ekvalayzerni olib tashlash</button>
      </>}
    </Sheet>
  );
}

function CropSheet({ api }: { api: EditorApi }) {
  const t = api.targetClip();
  if (!t) return <NeedsClip api={api} title="Qirqish" />;
  const live = api.project.main.find(c => c.id === t.id) ?? api.project.overlays.find(c => c.id === t.id)!;
  const c0 = live.crop ?? { l: 0, t: 0, r: 0, b: 0 };
  const a = live.mediaId ? api.assets.get(live.mediaId) : undefined;
  const ratio = (rw: number, rh: number) => {
    const w = a?.width || 1, h = a?.height || 1;
    const want = rw / rh, cur = w / h;
    clipPatch(api, live, c => {
      if (cur > want) { const keep = want / cur; c.crop = { l: (1 - keep) / 2, r: (1 - keep) / 2, t: 0, b: 0 }; }
      else { const keep = cur / want; c.crop = { l: 0, r: 0, t: (1 - keep) / 2, b: (1 - keep) / 2 }; }
    });
  };
  const edit = (k: 'l' | 't' | 'r' | 'b', v: number) => clipPatch(api, live, c => {
    const n = { ...(c.crop ?? { l: 0, t: 0, r: 0, b: 0 }), [k]: v };
    if (n.l + n.r > 0.9) { if (k === 'l') n.l = 0.9 - n.r; if (k === 'r') n.r = 0.9 - n.l; }
    if (n.t + n.b > 0.9) { if (k === 't') n.t = 0.9 - n.b; if (k === 'b') n.b = 0.9 - n.t; }
    c.crop = n;
  }, `crop${k}`);
  return (
    <Sheet title="Qirqish" onClose={api.close} tall actions={<button class="btn small ghost" data-testid="crop-reset" onClick={() => clipPatch(api, live, c => { c.crop = undefined; })}>Asliga qaytarish</button>}>
      <div class="row-btns">{([[1, 1], [9, 16], [16, 9], [4, 5], [3, 4]] as const).map(([w, h]) => <button key={`${w}${h}`} class="chip" data-testid={`crop-${w}x${h}`} onClick={() => ratio(w, h)}>{w}:{h}</button>)}</div>
      <Slider id="crop-l" label="Chapdan" value={c0.l} min={0} max={0.9} onChange={v => edit('l', v)} fmt={pct} />
      <Slider id="crop-r" label="O'ngdan" value={c0.r} min={0} max={0.9} onChange={v => edit('r', v)} fmt={pct} />
      <Slider id="crop-t" label="Yuqoridan" value={c0.t} min={0} max={0.9} onChange={v => edit('t', v)} fmt={pct} />
      <Slider id="crop-b" label="Pastdan" value={c0.b} min={0} max={0.9} onChange={v => edit('b', v)} fmt={pct} />
    </Sheet>
  );
}

const MASKS = [{ id: 'none', name: "Yo'q" }, { id: 'circle', name: 'Doira' }, { id: 'rounded', name: 'Yumaloq burchak' }, { id: 'heart', name: 'Yurak' }, { id: 'star', name: 'Yulduz' }, { id: 'diamond', name: 'Olmos' }, { id: 'hexagon', name: 'Olti burchak' }, { id: 'band', name: 'Keng tasma' }, { id: 'column', name: 'Tik tasma' }];

function MaskSheet({ api }: { api: EditorApi }) {
  const t = api.targetClip();
  if (!t) return <NeedsClip api={api} title="Niqob" />;
  const live = api.project.main.find(c => c.id === t.id) ?? api.project.overlays.find(c => c.id === t.id)!;
  const m = live.mask ?? { shape: 'none', size: 0.9, feather: 0.01 };
  return (
    <Sheet title="Niqob" onClose={api.close}>
      <div class="pill-grid" data-testid="mask-list">{MASKS.map(x => <button key={x.id} data-testid={`mask-${x.id}`} class={m.shape === x.id ? 'chip on' : 'chip'} onClick={() => clipPatch(api, live, c => { c.mask = x.id === 'none' ? undefined : { ...m, shape: x.id }; })}>{x.name}</button>)}</div>
      {m.shape !== 'none' && <>
        <Slider id="mask-size" label="O'lcham" value={m.size} min={0.1} max={2} onChange={v => clipPatch(api, live, c => { c.mask = { ...m, size: v }; }, 'ms')} fmt={pct} />
        <Slider label="Chetini yumshatish" value={m.feather} min={0} max={0.3} onChange={v => clipPatch(api, live, c => { c.mask = { ...m, feather: v }; }, 'mf')} fmt={v => v.toFixed(2)} />
      </>}
    </Sheet>
  );
}

function TextKeyframes({ api }: { api: EditorApi }) {
  const sel = api.sel;
  const live = sel?.type === 'text' ? api.project.texts.find(t => t.id === sel.id) : undefined;
  if (!live) return null;
  const local = Math.max(0, Math.min(live.duration, api.time() - live.start));
  const frames = live.keyframes ?? [];
  const kv0 = keyframedValues(frames, local);
  const v = kv0 ?? { x: live.x, y: live.y, scale: live.scale, rotation: live.rotation };
  const upsert = (k: 'x' | 'y' | 'scale' | 'rotation', val: number, key: string) => api.commit(p => {
    const t = p.texts.find(q => q.id === live.id);
    if (!t) return;
    const list = t.keyframes ?? [];
    let f = list.find(q => Math.abs(q.t - local) < 0.05);
    if (!f) { f = { t: local, x: v.x, y: v.y, scale: v.scale, rotation: v.rotation, opacity: 1 }; list.push(f); list.sort((a, b) => a.t - b.t); }
    f[k] = val;
    t.keyframes = list;
  }, key);
  return (
    <Sheet title="Matn harakati" onClose={api.close}>
      <p class="hint">{frames.length ? `${frames.length} ta kalit kadr.` : "Hali kalit kadr yo'q."} Chiziqni boshqa vaqtga surib, qiymatni o'zgartiring: matn shu nuqtalar orasida silliq harakatlanadi.</p>
      <Slider id="tkf-x" label="Gorizontal" value={v.x} min={0} max={1} onChange={val => upsert('x', val, 'tkx')} fmt={pct} />
      <Slider id="tkf-y" label="Vertikal" value={v.y} min={0} max={1} onChange={val => upsert('y', val, 'tky')} fmt={pct} />
      <Slider id="tkf-s" label="O'lcham" value={v.scale} min={0.2} max={4} onChange={val => upsert('scale', val, 'tks')} fmt={pct} />
      <Slider label="Burchak" value={v.rotation} min={-3.14} max={3.14} onChange={val => upsert('rotation', val, 'tkr')} fmt={val => `${Math.round((val * 180) / Math.PI)} daraja`} />
      {frames.length > 0 && <button class="btn ghost" onClick={() => api.commit(p => { const t = p.texts.find(q => q.id === live.id); if (t) t.keyframes = []; })}>Kalit kadrlarni tozalash</button>}
    </Sheet>
  );
}

function SubtitleSheet({ api }: { api: EditorApi }) {
  const ui = useUi();
  const [text, setText] = useState('');
  const subs = api.project.texts.filter(t => t.subtitle).sort((a, b) => a.start - b.start);
  const place = async () => {
    const lines = toLines(text);
    if (!lines.length) { ui.toast('Avval matnni yozing'); return; }
    ui.busy("Gapirilgan joylar qidirilmoqda");
    try {
      const spans = await speechSpans(api.project, id => api.assets.get(id));
      const clips = placeLines(api.project, lines, spans);
      api.commit(p => { p.texts = p.texts.filter(t => !t.subtitle); p.texts.push(...clips); });
      setText('');
      ui.toast(spans.length ? `${clips.length} ta qator gapga moslandi` : `${clips.length} ta qator vidyo bo'ylab joylandi`);
    } catch (e) { ui.toast((e as Error).message, true); } finally { ui.done(); }
  };
  const importSrt = async () => {
    const [f] = await pickFiles('.srt,text/plain', false);
    if (!f) return;
    const clips = parseSrt(await f.text());
    if (!clips.length) { ui.toast('Faylda subtitr topilmadi', true); return; }
    api.commit(p => { p.texts = p.texts.filter(t => !t.subtitle); p.texts.push(...clips); });
    ui.toast(`${clips.length} ta qator qo'shildi`);
  };
  const edit = (id: string, v: string) => api.commit(p => { const t = p.texts.find(x => x.id === id); if (t) t.text = v; }, `sub${id}`);
  return (
    <Sheet title="Subtitr" onClose={api.close} tall>
      <p class="hint">Vidyoda aytilgan gapni yozing yoki joylang. Ilova gapirilgan joylarni topib, matnni qatorlarga bo'ladi va vaqtiga qo'yadi. Ovozni o'zi so'zga aylantirmaydi.</p>
      <textarea data-testid="sub-text" rows={3} aria-label="Subtitr matni" value={text} onInput={e => setText((e.target as HTMLTextAreaElement).value)} />
      <button class="btn primary" data-testid="sub-place" onClick={place}><Icon n="wave" />Vaqtiga joylashtirish</button>
      <button class="btn" data-testid="sub-srt" onClick={importSrt}>SRT fayldan olish</button>
      {subs.length > 0 && <>
        <h4>Qatorlar, {subs.length} ta</h4>
        <div class="sub-list" data-testid="sub-list">{subs.map(s => (
          <div class="sub-row" key={s.id}>
            <button aria-label={`${s.start.toFixed(1)} soniyaga o'tish`} onClick={() => api.seek(s.start + 0.02)}>{s.start.toFixed(1)}s</button>
            <input aria-label="Subtitr qatori" value={s.text} onInput={e => edit(s.id, (e.target as HTMLInputElement).value)} />
          </div>
        ))}</div>
        <button class="btn ghost" data-testid="sub-clear" onClick={() => api.commit(p => { p.texts = p.texts.filter(t => !t.subtitle); })}>Subtitrlarni o'chirish</button>
      </>}
    </Sheet>
  );
}

const SFX = [['whoosh', 'Shamol'], ['swoosh', 'Tez o\'tish'], ['pop', 'Pop'], ['zarba', 'Zarba'], ['ding', "Qo'ng'iroq"], ['kassa', 'Kassa'], ['qarsak', 'Qarsak'], ['kulgi', 'Quvnoq']] as const;

function AudioSheet({ api }: { api: EditorApi }) {
  const ui = useUi();
  const [tab, setTab] = useState<'music' | 'sfx' | 'voice'>('music');
  const [rec, setRec] = useState<{ stop: () => void; startedAt: number } | null>(null);
  const addClip = (a: MediaAsset, name: string, kind: AudioClip['kind']) => {
    const start = kind === 'music' && api.project.audio.every(x => x.kind !== 'music') ? 0 : api.time();
    const clip: AudioClip = { id: uid(), mediaId: a.id, name, start, in: 0, out: a.duration, volume: kind === 'sfx' ? 1 : 0.85, fadeIn: 0, fadeOut: kind === 'music' ? 1 : 0, loop: false, muted: false, kind };
    api.commit(p => { p.audio.push(clip); });
    void api.ensureAssets([a.id]);
    api.setSel({ type: 'audio', id: clip.id });
    api.close();
  };
  const record = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mr.ondataavailable = e => chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setRec(null);
        ui.busy('Ovoz saqlanmoqda');
        try {
          const a = await saveRawBlob(new Blob(chunks, { type: mr.mimeType }), `Ovoz ${new Date().toLocaleTimeString()}`, 'audio');
          addClip(a, a.name, 'voice');
        } catch (e) { ui.toast((e as Error).message, true); } finally { ui.done(); }
      };
      mr.start();
      setRec({ stop: () => mr.stop(), startedAt: Date.now() });
    } catch { ui.toast('Mikrofonga ruxsat berilmadi. Telefon sozlamalarida ruxsat bering.', true); }
  };
  return (
    <Sheet title="Ovoz qo'shish" onClose={api.close} tall>
      <Chips items={[{ id: 'music', name: 'Musiqa' }, { id: 'sfx', name: 'Ovoz effektlari' }, { id: 'voice', name: 'Ovoz yozish' }]} value={tab} onChange={setTab} label="Ovoz turi" />
      {tab === 'music' && <MusicPicker onPick={(a, n) => addClip(a, n, 'music')} />}
      {tab === 'sfx' && <div class="pill-grid" data-testid="sfx">{SFX.map(([id, name]) => <button key={id} class="chip" data-testid={`sfx-${id}`} onClick={async () => { ui.busy(name); try { const a = await ensureUrlAsset(`sfx:${id}`, new URL(`sfx/${id}.mp3`, document.baseURI).href, name, 'audio'); addClip(a, name, 'sfx'); } catch (e) { ui.toast((e as Error).message, true); } finally { ui.done(); } }}>{name}</button>)}</div>}
      {tab === 'voice' && (
        <div class="rec">
          <button class={rec ? 'rec-btn on' : 'rec-btn'} data-testid="rec" aria-label={rec ? "Yozishni to'xtatish" : 'Yozishni boshlash'} onClick={() => (rec ? rec.stop() : record())}><Icon n="mic" s={32} /></button>
          <p>{rec ? "Yozilmoqda. To'xtatish uchun bosing." : 'Ovoz yozish uchun bosing. Ovoz chiziq turgan joyga qo\'shiladi.'}</p>
        </div>
      )}
    </Sheet>
  );
}

function AudioEditSheet({ api }: { api: EditorApi }) {
  const sel = api.sel;
  const live = sel?.type === 'audio' ? api.project.audio.find(a => a.id === sel.id) : undefined;
  if (!live) return null;
  const set = (fn: (a: AudioClip) => void, key?: string) => api.commit(p => { const a = p.audio.find(x => x.id === live.id); if (a) fn(a); }, key);
  return (
    <Sheet title={live.name} onClose={api.close}>
      <Slider id="a-volume" label="Balandligi" value={live.volume} min={0} max={2} onChange={v => set(a => { a.volume = v; }, 'av')} fmt={pct} />
      <Slider label="Asta kirish" value={live.fadeIn} min={0} max={5} step={0.1} onChange={v => set(a => { a.fadeIn = v; }, 'afi')} fmt={FADE} />
      <Slider label="Asta chiqish" value={live.fadeOut} min={0} max={5} step={0.1} onChange={v => set(a => { a.fadeOut = v; }, 'afo')} fmt={FADE} />
      <label class="check"><input data-testid="a-loop" type="checkbox" checked={live.loop} onChange={e => { const v = (e.target as HTMLInputElement).checked; set(a => { a.loop = v; }); }} /><span>Vidyo oxirigacha takrorlash</span></label>
      <label class="check"><input type="checkbox" checked={live.muted} onChange={e => { const v = (e.target as HTMLInputElement).checked; set(a => { a.muted = v; }); }} /><span>Ovozsiz qilish</span></label>
      <label class="check"><input type="checkbox" checked={!!live.denoise} onChange={e => { const v = (e.target as HTMLInputElement).checked; set(a => { a.denoise = v; }); }} /><span>Shovqinni kamaytirish</span></label>
      <h4>Ovoz effekti</h4>
      <div class="pill-grid">{VOICES.map(v => <button key={v.id} class={(live.voice ?? 'none') === v.id ? 'chip on' : 'chip'} onClick={() => set(a => { a.voice = v.id; })}>{v.name}</button>)}</div>
      <p class="hint">Shovqin kamaytirish va ovoz effekti tayyor vidyoda eshitiladi.</p>
    </Sheet>
  );
}

function BeatSheet({ api }: { api: EditorApi }) {
  const ui = useUi();
  const sel = api.sel;
  const live = sel?.type === 'audio' ? api.project.audio.find(a => a.id === sel.id) : api.project.audio.find(a => a.kind === 'music');
  const [bpm, setBpm] = useState<number | null>(null);
  if (!live) return <Sheet title="Ritm" onClose={api.close}><p class="empty">Avval qo'shiq qo'shing, keyin ilova uning ritmini topadi.</p></Sheet>;
  const detect = async () => {
    ui.busy('Ritm aniqlanmoqda');
    try {
      const a = api.assets.get(live.mediaId);
      if (!a) throw new Error('Qo\'shiq topilmadi');
      const r = await detectBeats(await getBlob(a));
      setBpm(r.bpm);
      api.commit(p => { const x = p.audio.find(q => q.id === live.id); if (x) { x.beats = r.strong.length > 3 ? r.strong : r.beats; } });
      ui.toast(`Ritm topildi: ${r.bpm} BPM`);
    } catch (e) { ui.toast((e as Error).message, true); } finally { ui.done(); }
  };
  const snap = () => {
    const beats = live.beats;
    if (!beats?.length) { ui.toast('Avval ritmni aniqlang'); return; }
    let ok = false;
    const list = beats.filter(b => b >= live.in && b < live.out).map(b => b - live.in);
    api.commit(p => { ok = snapCutsToBeats(p, list, live.start, id => api.assets.get(id)); });
    ui.toast(ok ? 'Kesishlar ritmga moslandi' : 'Moslash uchun ritm nuqtalari yetarli emas');
  };
  return (
    <Sheet title="Ritm" onClose={api.close}>
      <p class="hint">{bpm ? `Tezligi: ${bpm} BPM. ` : ''}{live.beats?.length ? `${live.beats.length} ta ritm nuqtasi belgilangan.` : 'Ilova qo\'shiqning ritmini topib, vaqt chizig\'iga belgilaydi.'}</p>
      <button class="btn" data-testid="beat-detect" onClick={detect}><Icon n="beat" />Ritmni aniqlash</button>
      <button class="btn" data-testid="beat-snap" disabled={!live.beats?.length} onClick={snap}><Icon n="wand" />Kesishlarni ritmga moslash</button>
      <button class="btn ghost" onClick={() => api.commit(p => { const x = p.audio.find(q => q.id === live.id); if (x) x.beats = undefined; })}>Belgilarni tozalash</button>
    </Sheet>
  );
}

function SceneEdit({ api }: { api: EditorApi }) {
  const t = api.targetClip();
  const ui = useUi();
  if (!t || t.kind !== 'scene3d') return <NeedsClip api={api} title="3D sahna" />;
  const live = api.project.main.find(c => c.id === t.id) ?? api.project.overlays.find(c => c.id === t.id)!;
  const def = SCENE_BY_ID.get(live.scene ?? '');
  const params = live.sceneParams ?? {};
  const set = (fn: (s: NonNullable<Clip['sceneParams']>) => void, key?: string) => clipPatch(api, live, c => { c.sceneParams = c.sceneParams ?? {}; fn(c.sceneParams); }, key);
  const colors = params.colors?.length ? params.colors : def?.colors ?? ['#000000', '#ffffff', '#ffffff'];
  return (
    <Sheet title={def?.name ?? '3D sahna'} onClose={api.close} tall>
      {def?.text !== '' && <label class="field"><span>Sarlavha</span><input data-testid="scene-text" value={params.text ?? def?.text ?? ''} onInput={e => set(s => { s.text = (e.target as HTMLInputElement).value; }, 'st')} /></label>}
      {(def?.sub !== undefined && def?.sub !== '') && <label class="field"><span>Kichik matn</span><input data-testid="scene-sub" value={params.sub ?? def?.sub ?? ''} onInput={e => set(s => { s.sub = (e.target as HTMLInputElement).value; }, 'ss')} /></label>}
      <h4>Ranglar</h4>
      <div class="row-btns">
        {colors.map((c, i) => <label class="color-field" key={i}><span>{['Fon', 'Asosiy', "Qo'shimcha"][i]}</span><input type="color" value={c} onInput={e => { const v = (e.target as HTMLInputElement).value; set(s => { const n = [...colors]; n[i] = v; s.colors = n; }, `sc${i}`); }} /></label>)}
      </div>
      {!!def?.images && (
        <>
          <h4>Rasmlar, {params.mediaIds?.length ?? 0} ta</h4>
          <button class="btn" data-testid="scene-images" onClick={async () => {
            const f = await pickFiles('image/*');
            const as = await importAll(f, ui);
            if (as.length) set(s => { s.mediaIds = as.map(a => a.id); });
          }}><Icon n="image" />Rasmlarni tanlash</button>
        </>
      )}
      <Slider label="Davomiyligi" value={live.duration} min={1} max={20} step={0.1} onChange={v => clipPatch(api, live, c => { c.duration = v; }, 'dur')} fmt={FADE} />
    </Sheet>
  );
}

function Scene3DAdd({ api }: { api: EditorApi }) {
  const add = (id: string, asOverlay = false) => {
    const c = newClip({ kind: 'scene3d', scene: id, duration: 4 });
    void asOverlay;
    api.commit(p => {
      const t = api.time();
      const l = layoutMain(p);
      const at = l.findIndex(x => t < (x.start + x.end) / 2);
      if (at < 0) p.main.push(c); else p.main.splice(at, 0, c);
    });
    api.setSel({ type: 'main', id: c.id });
    api.open('scene');
  };
  return (
    <Sheet title="3D sahna qo'shish" onClose={api.close} tall>
      <div class="fx-grid tall" data-testid="scene-grid">{allScenes().map(s => <Tile key={s.id} tall id={`scene-${s.id}`} img={thumbUrl('scene', s.id)} name={s.name} color="#262b52" onClick={() => add(s.id)} />)}</div>
    </Sheet>
  );
}

const fileToClip = (a: MediaAsset) => (a.kind === 'video' ? newClip({ kind: 'video', mediaId: a.id, in: 0, out: a.duration }) : newClip({ kind: 'image', mediaId: a.id, duration: 4, motion: 'zoomIn' }));

function AddSheet({ api }: { api: EditorApi }) {
  const ui = useUi();
  const [color, setColor] = useState('#1b2a7a');
  return (
    <Sheet title="Qo'shish" onClose={api.close}>
      <button class="btn primary" data-testid="add-media" onClick={async () => {
        const f = await pickFiles('video/*,image/*');
        const as = await importAll(f, ui);
        if (as.length) {
          await api.ensureAssets(as.map(a => a.id));
          api.commit(p => { p.main.push(...as.filter(a => a.kind !== 'audio').map(fileToClip)); });
        }
        api.close();
      }}><Icon n="image" />Rasm yoki vidyo tanlash</button>
      <button class="btn" data-testid="add-3d" onClick={() => api.open('scene3d')}><Icon n="cube" />3D sahna</button>
      <div class="row-btns">
        <label class="color-field"><span>Rangli fon</span><input type="color" value={color} onInput={e => setColor((e.target as HTMLInputElement).value)} /></label>
        <button class="btn" data-testid="add-color" onClick={() => { api.commit(p => { p.main.push(newClip({ kind: 'color', color, duration: 3 })); }); api.close(); }}>Rangli kadr qo'shish</button>
      </div>
    </Sheet>
  );
}

function OverlaySheet({ api }: { api: EditorApi }) {
  const ui = useUi();
  return (
    <Sheet title="Qatlam qo'shish" onClose={api.close}>
      <p class="hint">Asosiy vidyo ustiga rasm yoki kichik vidyo qo'yiladi. Keyin ekranda barmoq bilan suriladi.</p>
      <button class="btn primary" data-testid="overlay-add" onClick={async () => {
        const f = await pickFiles('video/*,image/*');
        const as = (await importAll(f, ui)).filter(a => a.kind !== 'audio');
        if (as.length) {
          await api.ensureAssets(as.map(a => a.id));
          const t = api.time();
          const ids: string[] = [];
          api.commit(p => {
            as.forEach(a => {
              const c = fileToClip(a);
              const o: OverlayClip = { ...c, motion: 'none', start: t, blend: 'normal', transform: { ...c.transform, scale: 0.5, fit: 'contain' } };
              if (o.kind === 'video') o.muted = false;
              ids.push(o.id);
              p.overlays.push(o);
            });
          });
          api.setSel({ type: 'overlay', id: ids[0] });
        }
        api.close();
      }}><Icon n="layers" />Rasm yoki vidyo tanlash</button>
    </Sheet>
  );
}

const STICKERS = '😀 😂 😍 🥰 😎 🤩 🥳 😭 😡 👍 👏 🙌 🙏 💪 ❤️ 💛 💙 💚 🔥 ⭐ ✨ 🎉 🎁 🎂 🎈 🎵 🎬 📱 💰 💵 🏷️ 🛒 📞 ☎️ ✅ ❌ ⚡ 🚀 🏆 🥇 ⚽ 🌹 🌸 🌙 ☀️ 🌈 🍉 🍇 🇺🇿'.split(' ');

function StickerSheet({ api }: { api: EditorApi }) {
  return (
    <Sheet title="Stiker" onClose={api.close} tall>
      <div class="sticker-grid" data-testid="sticker-grid">
        {STICKERS.map(s => <button key={s} aria-label={`Stiker ${s}`} onClick={() => {
          const t = newText({ text: s, sticker: true, start: api.time(), duration: 3, size: 14, x: 0.5, y: 0.35, shadow: false, animIn: 'pop', weight: 400 });
          api.commit(p => { p.texts.push(t); });
          api.setSel({ type: 'text', id: t.id });
          api.close();
        }}>{s}</button>)}
      </div>
    </Sheet>
  );
}

function AutoSheet({ api }: { api: EditorApi }) {
  const ui = useUi();
  const run = async (msg: string, fn: () => Promise<void>, ok: string) => {
    ui.busy(msg);
    try { await fn(); ui.toast(ok); } catch (e) { ui.toast((e as Error).message, true); } finally { ui.done(); }
  };
  return (
    <Sheet title="Avtomat vositalar" onClose={api.close}>
      <div class="auto-list">
        <button data-testid="auto-color" onClick={() => run('Ranglar sozlanmoqda', async () => {
          const copy = structuredClone(api.project);
          await autoColorProject(copy);
          api.commit(p => { [...p.main, ...p.overlays].forEach(c => { const m = [...copy.main, ...copy.overlays].find(x => x.id === c.id); if (m) c.adjust = m.adjust; }); });
        }, "Ranglar to'g'rilandi")}><Icon n="sliders" /><div><b>Avto rang</b><span>Yorug'lik, kontrast va rang muvozanati</span></div></button>
        <button data-testid="auto-audio" onClick={() => run('Ovoz tekshirilmoqda', async () => {
          const copy = structuredClone(api.project);
          await autoAudioProject(copy, id => api.assets.get(id));
          api.commit(p => { p.main.forEach(c => { const m = copy.main.find(x => x.id === c.id); if (m) c.volume = m.volume; }); p.audio = copy.audio; });
        }, "Ovoz balandligi tenglashtirildi")}><Icon n="volume" /><div><b>Avto ovoz</b><span>Ovozni tenglaydi, gapirganda musiqani pasaytiradi</span></div></button>
        <button data-testid="auto-beat" onClick={() => api.open('beat')}><Icon n="beat" /><div><b>Avto ritm</b><span>Kesishlarni qo'shiq ritmiga moslaydi</span></div></button>
        <button data-testid="auto-trans" onClick={() => {
          const list = allTransitions();
          api.commit(p => { p.main.forEach((c, i) => { if (i < p.main.length - 1) c.transition = { id: list[(i * 7) % list.length].id, duration: 0.5 }; }); });
          ui.toast("O'tishlar qo'shildi");
        }}><Icon n="swap" /><div><b>Avto o'tish</b><span>Har bir kesishga turli o'tish qo'yadi</span></div></button>
      </div>
    </Sheet>
  );
}

function FormatSheet({ api }: { api: EditorApi; onAspect: () => void }) {
  return (
    <Sheet title="Format" onClose={api.close}>
      <div class="aspect-row" data-testid="format-row">
        {(Object.keys(ASPECTS) as AspectId[]).map(a => (
          <button key={a} data-testid={`fmt-${a.replace(':', 'x')}`} class={api.project.aspect === a ? 'on' : ''} onClick={() => api.commit(p => { p.aspect = a; })}><i style={{ aspectRatio: a.replace(':', '/') }} /><b>{a}</b><span>{ASPECTS[a].label}</span></button>
        ))}
      </div>
      <label class="color-field"><span>Fon rangi</span><input type="color" value={api.project.background} onInput={e => { const v = (e.target as HTMLInputElement).value; api.commit(p => { p.background = v; }, 'bg'); }} /></label>
      <p class="hint">Jami uzunligi: {projectDuration(api.project).toFixed(1)} soniya.</p>
    </Sheet>
  );
}

export function Sheets({ name, api, onAspect }: { name: SheetName; api: EditorApi; onAspect: () => void }) {
  switch (name) {
    case 'dance': return <DanceSheet api={api} />;
    case 'viz': return <VizSheet api={api} />;
    case 'subtitle': return <SubtitleSheet api={api} />;
    case 'crop': return <CropSheet api={api} />;
    case 'mask': return <MaskSheet api={api} />;
    case 'textkf': return <TextKeyframes api={api} />;
    case 'effects': return <EffectsSheet api={api} filters={false} />;
    case 'filters': return <EffectsSheet api={api} filters />;
    case 'transition': return <TransitionSheet api={api} />;
    case 'speed': return <SpeedSheet api={api} />;
    case 'volume': return <VolumeSheet api={api} />;
    case 'duration': return <DurationSheet api={api} />;
    case 'adjust': return <AdjustSheet api={api} />;
    case 'motion': return <MotionSheet api={api} />;
    case 'transform': return <TransformSheet api={api} />;
    case 'blend': return <BlendSheet api={api} />;
    case 'textnew': return <TextSheet api={api} isNew />;
    case 'text': case 'textedit': return <TextSheet api={api} isNew={false} />;
    case 'audio': return <AudioSheet api={api} />;
    case 'audioedit': return <AudioEditSheet api={api} />;
    case 'beat': return <BeatSheet api={api} />;
    case 'scene': return <SceneEdit api={api} />;
    case 'scene3d': return <Scene3DAdd api={api} />;
    case 'overlay': return <OverlaySheet api={api} />;
    case 'sticker': return <StickerSheet api={api} />;
    case 'auto': return <AutoSheet api={api} />;
    case 'format': return <FormatSheet api={api} onAspect={onAspect} />;
    case 'add': return <AddSheet api={api} />;
  }
}
