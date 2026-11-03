import { useEffect, useRef, useState } from 'preact/hooks';
import { Chips, IkatBar, useUi } from './kit';
import { Icon } from './icons';
import { ExportOptions, ExportResult, exportProject, exportSize } from '../engine/exporter';
import { Project } from '../engine/types';
import { projectDuration } from '../engine/timeline';
import { Saved, isNative, saveVideo, shareVideo } from './native';
import { track } from '../store/api';

const mb = (b: number) => `${(b / 1048576).toFixed(1)} MB`;

export function ExportSheet({ project, onClose }: { project: Project; onClose: () => void }) {
  const ui = useUi();
  const [height, setHeight] = useState('1080');
  const [fps, setFps] = useState('30');
  const [quality, setQuality] = useState<ExportOptions['quality']>('high');
  const [progress, setProgress] = useState<{ p: number; msg: string } | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);
  const preview = useRef<string>('');
  useEffect(() => () => { abort.current?.abort(); if (preview.current) URL.revokeObjectURL(preview.current); }, []);

  const dur = projectDuration(project);
  const size = exportSize(project, +height);
  const estMb = (size.w * size.h * +fps * ({ normal: 0.1, high: 0.17, max: 0.28 }[quality]) * dur + 192000 * dur) / 8 / 1048576;

  const run = async () => {
    setError(''); setResult(null); setSaved(null);
    const ac = new AbortController();
    abort.current = ac;
    setProgress({ p: 0, msg: 'Tayyorlanmoqda' });
    try {
      const r = await exportProject(project, { height: +height, fps: +fps, quality }, (p, msg) => setProgress({ p, msg }), ac.signal);
      setResult(r);
      void track('export', { h: +height, fps: +fps, dur: Math.round(dur), secs: Math.round(r.seconds), native: isNative(), tpl: project.templateId });
      (window as unknown as { __lastExport?: ExportResult }).__lastExport = r;
    } catch (e) {
      const err = e as Error;
      if (err.name !== 'AbortError') {
        console.error(err);
        setError(`Eksport bajarilmadi: ${err.message}. Sifatni pasaytirib qayta urinib ko'ring.`);
      }
    } finally { setProgress(null); abort.current = null; }
  };

  const save = async () => {
    if (!result) return;
    ui.busy('Galereyaga saqlanmoqda', 0);
    try {
      const s = await saveVideo(result.file, result.name, p => ui.busy('Galereyaga saqlanmoqda', p));
      setSaved(s);
      ui.toast(isNative() ? 'Vidyo galereyaga saqlandi' : 'Vidyo yuklab olindi');
    } catch (e) { ui.toast(`Saqlab bo'lmadi: ${(e as Error).message}`, true); } finally { ui.done(); }
  };

  if (result && !preview.current) preview.current = URL.createObjectURL(result.file);

  return (
    <div class="export" role="dialog" aria-label="Eksport" data-testid="export-sheet">
      <header class="topbar">
        <button class="icon-btn" aria-label="Yopish" data-testid="export-close" onClick={() => { abort.current?.abort(); onClose(); }}><Icon n="close" /></button>
        <h1>Eksport</h1>
      </header>
      {!progress && !result && (
        <div class="pad form">
          <h4>Sifat</h4>
          <Chips items={[{ id: '480', name: '480p' }, { id: '720', name: '720p' }, { id: '1080', name: '1080p' }, { id: '1440', name: '2K' }, { id: '2160', name: '4K' }]} value={height} onChange={setHeight} label="O'lcham" />
          <h4>Kadr tezligi</h4>
          <Chips items={[{ id: '24', name: '24 kadr' }, { id: '30', name: '30 kadr' }, { id: '60', name: '60 kadr' }]} value={fps} onChange={setFps} label="Kadr tezligi" />
          <h4>Fayl hajmi</h4>
          <Chips items={[{ id: 'normal', name: 'Kichik' }, { id: 'high', name: 'Yaxshi' }, { id: 'max', name: 'Eng yuqori' }]} value={quality} onChange={setQuality as (v: string) => void} label="Bitreyt" />
          <p class="hint" data-testid="export-est">{size.w} x {size.h}, {dur.toFixed(1)} soniya, taxminan {estMb.toFixed(0)} MB. Eksport vaqtida ilovani yopmang.</p>
          {error && <p class="err" role="alert" data-testid="export-error">{error}</p>}
          <button class="btn primary big" data-testid="export-run" onClick={run}><Icon n="download" />Eksport qilish</button>
        </div>
      )}
      {progress && (
        <div class="pad export-run" data-testid="export-progress">
          <b class="pct">{Math.round(progress.p * 100)}%</b>
          <IkatBar p={progress.p} />
          <p>{progress.msg}</p>
          <button class="btn" onClick={() => abort.current?.abort()}>Bekor qilish</button>
        </div>
      )}
      {result && (
        <div class="pad export-done" data-testid="export-done">
          <video src={preview.current} controls playsInline class="result" />
          <p class="hint">{result.width} x {result.height}, {result.duration.toFixed(1)} soniya, {mb(result.size)}. {Math.round(result.seconds)} soniyada tayyor bo'ldi.</p>
          <button class="btn primary big" data-testid="export-save" disabled={!!saved && isNative()} onClick={save}><Icon n="download" />{isNative() ? (saved ? 'Galereyaga saqlandi' : 'Galereyaga saqlash') : 'Yuklab olish'}</button>
          <button class="btn" data-testid="export-share" onClick={async () => { try { let s = saved; if (isNative() && !s) { s = await saveVideo(result.file, result.name); setSaved(s); } await shareVideo(s, result.file, result.name); } catch (e) { if ((e as Error).name !== 'AbortError') ui.toast((e as Error).message, true); } }}><Icon n="share" />Ulashish</button>
          <button class="btn ghost" onClick={() => { setResult(null); URL.revokeObjectURL(preview.current); preview.current = ''; }}>Boshqa sifatda eksport qilish</button>
        </div>
      )}
    </div>
  );
}
