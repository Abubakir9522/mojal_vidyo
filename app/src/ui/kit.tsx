import { ComponentChildren, createContext } from 'preact';
import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './icons';
import { MediaAsset } from '../engine/types';
import { importFile } from '../store/media';

export function Slider({ label, value, min, max, step = 0.01, onChange, fmt, id }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; fmt?: (v: number) => string; id?: string }) {
  return (
    <label class="slider">
      <span class="slider-top"><span>{label}</span><b>{fmt ? fmt(value) : value.toFixed(2)}</b></span>
      <input data-testid={id} type="range" min={min} max={max} step={step} value={value} onInput={e => onChange(parseFloat((e.target as HTMLInputElement).value))} />
    </label>
  );
}

export function Chips<T extends string>({ items, value, onChange, label }: { items: { id: T; name: string }[]; value: T; onChange: (v: T) => void; label?: string }) {
  return (
    <div class="chips" role="tablist" aria-label={label}>
      {items.map(i => <button key={i.id} role="tab" aria-selected={i.id === value} class={i.id === value ? 'chip on' : 'chip'} onClick={() => onChange(i.id)}>{i.name}</button>)}
    </div>
  );
}

export function Tile({ img, name, on, onClick, badge, color, id, tall }: { img?: string; name: string; on?: boolean; onClick: () => void; badge?: string; color?: string; id?: string; tall?: boolean }) {
  const [broken, setBroken] = useState(false);
  return (
    <button data-testid={id} class={`tile${on ? ' on' : ''}${tall ? ' tall' : ''}`} onClick={onClick}>
      <span class="tile-img" style={color ? { background: color } : undefined}>
        {img && !broken && <img src={img} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />}
        {badge && <em>{badge}</em>}
      </span>
      <span class="tile-name">{name}</span>
    </button>
  );
}

export function Sheet({ title, onClose, children, actions, tall }: { title: string; onClose: () => void; children: ComponentChildren; actions?: ComponentChildren; tall?: boolean }) {
  return (
    <section class={tall ? 'sheet tall' : 'sheet'} role="dialog" aria-label={title} data-testid="sheet">
      <header>
        <h3>{title}</h3>
        {actions}
        <button class="icon-btn" aria-label="Yopish" data-testid="sheet-close" onClick={onClose}><Icon n="check" /></button>
      </header>
      <div class="sheet-body">{children}</div>
    </section>
  );
}

export function Top({ title, onBack, right }: { title: string; onBack?: () => void; right?: ComponentChildren }) {
  return (
    <header class="topbar">
      {onBack && <button class="icon-btn" aria-label="Orqaga" data-testid="back" onClick={onBack}><Icon n="back" /></button>}
      <h1>{title}</h1>
      <div class="spacer" />
      {right}
    </header>
  );
}

interface BusyState { msg: string; p: number | null }
interface Ui {
  busy: (msg: string, p?: number | null) => void;
  done: () => void;
  toast: (msg: string, bad?: boolean) => void;
}
export const UiCtx = createContext<Ui>({ busy() {}, done() {}, toast() {} });
export const useUi = () => useContext(UiCtx);

export function UiProvider({ children }: { children: ComponentChildren }) {
  const [busy, setBusy] = useState<BusyState | null>(null);
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null);
  const timer = useRef(0);
  const ui = useRef<Ui>({
    busy: (msg, p = null) => setBusy({ msg, p }),
    done: () => setBusy(null),
    toast: (msg, bad) => { setToast({ msg, bad }); clearTimeout(timer.current); timer.current = window.setTimeout(() => setToast(null), bad ? 6000 : 2600); },
  });
  useEffect(() => {
    const on = (e: Event) => ui.current.toast((e as CustomEvent<string>).detail);
    window.addEventListener('vodiy-hint', on);
    return () => window.removeEventListener('vodiy-hint', on);
  }, []);
  return (
    <UiCtx.Provider value={ui.current}>
      {children}
      {busy && <div class="busy" role="status" data-testid="busy"><div><IkatBar p={busy.p} /><p>{busy.msg}</p></div></div>}
      {toast && <div class={toast.bad ? 'toast bad' : 'toast'} role="alert" data-testid="toast">{toast.msg}</div>}
    </UiCtx.Provider>
  );
}

/** Progress fills with atlas weave: the app's one piece of signature ornament. */
export function IkatBar({ p }: { p: number | null }) {
  return <div class={p === null ? 'ikatbar loop' : 'ikatbar'} role="progressbar" aria-valuenow={p === null ? undefined : Math.round(p * 100)} aria-valuemin={0} aria-valuemax={100}><i style={p === null ? undefined : { width: `${Math.max(1, p * 100)}%` }} /></div>;
}

/** Copies chosen files into the app, so projects keep working after the phone's picker forgets them. */
export async function importAll(files: File[], ui: Ui): Promise<MediaAsset[]> {
  const out: MediaAsset[] = [];
  const errors: string[] = [];
  for (let i = 0; i < files.length; i++) {
    ui.busy(`Fayl qo'shilmoqda: ${files[i].name}`, i / files.length);
    try { out.push(await importFile(files[i])); } catch (e) {
      // Browser read errors are in English and name no file, so they get a plain message here.
      const m = (e as Error).message ?? '';
      errors.push(/[a-z]+ [a-z]+ (could|not|was)|NotReadable|NotFound/i.test(`${(e as Error).name} ${m}`) && !/bo'lmadi|topilmadi|qo'llanmaydi/.test(m) ? `${files[i].name} faylini ochib bo'lmadi. Boshqa fayl tanlang.` : m);
    }
  }
  ui.done();
  if (errors.length) ui.toast(errors[0], true);
  return out;
}

export const mmss = (t: number) => {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s % 1) * 10)}`;
};

export function useTick(ms: number) {
  const [, set] = useState(0);
  useEffect(() => { const i = setInterval(() => set(x => x + 1), ms); return () => clearInterval(i); }, [ms]);
}
