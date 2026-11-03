import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { EditorApi } from './Editor';
import { Icon } from './icons';
import { clipDuration, layoutMain, projectDuration } from '../engine/timeline';
import { MediaAsset } from '../engine/types';
import { filmstrip } from './filmstrip';
import { SCENE_BY_ID } from '../engine/scene3d';

type MutableRef<T> = { current: T };
const MIN_PX = 12, MAX_PX = 300;
const ROW_MAIN = 56;

function Waveform({ peaks, width, height, from, to, total }: { peaks?: number[]; width: number; height: number; from: number; to: number; total: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !peaks?.length) return;
    const w = Math.min(4000, Math.max(1, Math.round(width)));
    c.width = w; c.height = height;
    const x = c.getContext('2d')!;
    x.clearRect(0, 0, w, height);
    x.fillStyle = 'rgba(255,255,255,.7)';
    const span = to - from;
    const reps = total > 0 ? 1 : 1;
    for (let i = 0; i < w; i += 2) {
      const srcT = (i / w) * span * reps;
      const t = from + (srcT % Math.max(0.001, span));
      const v = peaks[Math.min(peaks.length - 1, Math.floor((t / total) * peaks.length))] ?? 0;
      const h = Math.max(1, v * (height - 4));
      x.fillRect(i, (height - h) / 2, 1.4, h);
    }
  }, [peaks, width, height, from, to, total]);
  return <canvas ref={ref} class="wave" />;
}

function Strip({ asset, clipIn, clipOut, width, px }: { asset?: MediaAsset; clipIn: number; clipOut: number; width: number; px: number }) {
  const [frames, setFrames] = useState<string[] | null>(null);
  useEffect(() => {
    let live = true;
    if (asset?.kind === 'video') void filmstrip(asset).then(f => { if (live) setFrames(f); });
    return () => { live = false; };
  }, [asset?.id]);
  if (!asset) return null;
  if (asset.kind === 'image' || !frames?.length) return <div class="strip-fill" style={asset.thumb ? { backgroundImage: `url(${asset.thumb})` } : undefined} />;
  const tile = ROW_MAIN * Math.min(1.4, Math.max(0.56, asset.width / asset.height));
  const n = Math.max(1, Math.ceil(width / tile));
  void px;
  return (
    <div class="strip">
      {Array.from({ length: n }, (_, i) => {
        const t = clipIn + (i / n) * (clipOut - clipIn);
        const idx = Math.min(frames.length - 1, Math.floor((t / asset.duration) * frames.length));
        return <img key={i} src={frames[idx]} width={tile} height={ROW_MAIN} alt="" draggable={false} />;
      })}
    </div>
  );
}

/** Puts overlapping clips on separate rows, so every clip stays visible and can be tapped. */
function lanes<T>(items: T[], start: (x: T) => number, end: (x: T) => number): T[][] {
  const rows: { end: number; items: T[] }[] = [];
  for (const it of [...items].sort((a, b) => start(a) - start(b))) {
    const row = rows.find(r => r.end <= start(it) + 0.001);
    if (row) { row.items.push(it); row.end = end(it); } else rows.push({ end: end(it), items: [it] });
  }
  return rows.map(r => r.items);
}

export function Timeline({ api, scrollRef, playing }: { api: EditorApi; scrollRef: MutableRef<(t: number, force?: boolean) => void>; playing: boolean }) {
  const { project, sel, setSel, commit, assets } = api;
  const [px, setPx] = useState(60);
  const scroller = useRef<HTMLDivElement>(null);
  const pxRef = useRef(px);
  pxRef.current = px;
  const lastSet = useRef(-1);
  const [viewport, setViewport] = useState(400);

  const dur = projectDuration(project);
  const width = Math.max(1, dur * px);
  const layout = layoutMain(project);

  useLayoutEffect(() => {
    const el = scroller.current!;
    const ro = new ResizeObserver(() => setViewport(el.clientWidth));
    ro.observe(el);
    setViewport(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    scrollRef.current = (t, force) => {
      const el = scroller.current;
      if (!el) return;
      const left = t * pxRef.current;
      if (force || Math.abs(el.scrollLeft - left) > 0.5) { lastSet.current = left; el.scrollLeft = left; }
    };
  }, []);

  useEffect(() => { scrollRef.current(api.time(), true); }, [px]);

  const onScroll = () => {
    const el = scroller.current!;
    if (playing) return;
    if (Math.abs(el.scrollLeft - lastSet.current) < 1.5) return;
    lastSet.current = -1;
    api.seekFromScroll(el.scrollLeft / pxRef.current);
  };

  // Two-finger pinch changes the timeline zoom.
  const pinch = useRef<{ d: number; px: number } | null>(null);
  const touches = (e: TouchEvent) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  const onTouchStart = (e: TouchEvent) => { if (e.touches.length === 2) pinch.current = { d: touches(e), px: pxRef.current }; };
  const onTouchMove = (e: TouchEvent) => { if (e.touches.length === 2 && pinch.current) { e.preventDefault(); setPx(Math.max(MIN_PX, Math.min(MAX_PX, pinch.current.px * (touches(e) / pinch.current.d)))); } };
  const onTouchEnd = () => { pinch.current = null; };

  /** Shared drag handling. Reports the distance moved, in seconds. */
  const dragger = (onMove: (dSec: number) => void) => (e: PointerEvent) => {
    e.stopPropagation(); e.preventDefault();
    const x0 = e.clientX;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const mv = (m: PointerEvent) => onMove((m.clientX - x0) / pxRef.current);
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };

  const trimMain = (id: string, side: 'l' | 'r') => {
    const c0 = project.main.find(c => c.id === id)!;
    const a = c0.mediaId ? assets.get(c0.mediaId) : undefined;
    return dragger(d => commit(p => {
      const c = p.main.find(x => x.id === id);
      if (!c) return;
      if (c.kind === 'video') {
        if (side === 'l') c.in = Math.max(0, Math.min(c0.out - 0.1 * c.speed, c0.in + d * c.speed));
        else c.out = Math.min(a?.duration ?? c0.out, Math.max(c0.in + 0.1 * c.speed, c0.out + d * c.speed));
      } else {
        c.duration = Math.max(0.2, c0.duration + (side === 'r' ? d : -d));
      }
    }, `trim${id}`));
  };

  const trimOverlay = (id: string, side: 'l' | 'r') => {
    const c0 = project.overlays.find(c => c.id === id)!;
    const a = c0.mediaId ? assets.get(c0.mediaId) : undefined;
    return dragger(d => commit(p => {
      const c = p.overlays.find(x => x.id === id);
      if (!c) return;
      if (c.kind === 'video') {
        if (side === 'l') { const nIn = Math.max(0, Math.min(c0.out - 0.1, c0.in + d * c.speed)); c.in = nIn; c.start = Math.max(0, c0.start + (nIn - c0.in) / c.speed); }
        else c.out = Math.min(a?.duration ?? c0.out, Math.max(c0.in + 0.1, c0.out + d * c.speed));
      } else if (side === 'r') c.duration = Math.max(0.2, c0.duration + d);
      else { const nd = Math.max(0.2, c0.duration - d); c.start = Math.max(0, c0.start + c0.duration - nd); c.duration = nd; }
    }, `trimo${id}`));
  };

  const trimText = (id: string, side: 'l' | 'r') => {
    const c0 = project.texts.find(c => c.id === id)!;
    return dragger(d => commit(p => {
      const c = p.texts.find(x => x.id === id);
      if (!c) return;
      if (side === 'r') c.duration = Math.max(0.2, c0.duration + d);
      else { const nd = Math.max(0.2, c0.duration - d); c.start = Math.max(0, c0.start + c0.duration - nd); c.duration = nd; }
    }, `trimt${id}`));
  };

  const trimAudio = (id: string, side: 'l' | 'r') => {
    const c0 = project.audio.find(c => c.id === id)!;
    const a = assets.get(c0.mediaId);
    return dragger(d => commit(p => {
      const c = p.audio.find(x => x.id === id);
      if (!c) return;
      if (side === 'r') c.out = Math.min(a?.duration ?? c0.out, Math.max(c0.in + 0.2, c0.out + d));
      else { const nIn = Math.max(0, Math.min(c0.out - 0.2, c0.in + d)); c.in = nIn; c.start = Math.max(0, c0.start + (nIn - c0.in)); }
    }, `trima${id}`));
  };

  const moveStart = (type: 'overlay' | 'text' | 'audio', id: string, start0: number) => dragger(d => commit(p => {
    const list = type === 'overlay' ? p.overlays : type === 'text' ? p.texts : p.audio;
    const c = (list as { id: string; start: number }[]).find(x => x.id === id);
    if (c) c.start = Math.max(0, start0 + d);
  }, `move${id}`));

  const pad = viewport / 2;
  const marks: number[] = [];
  const step = px > 120 ? 1 : px > 50 ? 2 : px > 24 ? 5 : 10;
  for (let t = 0; t <= dur + step; t += step) marks.push(t);

  const totalAudioWidth = (a: typeof project.audio[0]) => (a.loop ? Math.max(0, dur - a.start) : a.out - a.in);

  return (
    <div class="timeline" data-testid="timeline">
      <div class="playhead" aria-hidden="true" />
      <div class="tl-scroll" ref={scroller} onScroll={onScroll} onTouchStart={onTouchStart as never} onTouchMove={onTouchMove as never} onTouchEnd={onTouchEnd} data-testid="tl-scroll"
        onClick={e => { if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('tl-track')) setSel(null); }}>
        <div class="tl-inner" style={{ width: width + pad * 2, paddingLeft: pad }}>
          <div class="ruler" style={{ width }}>
            {marks.map(t => <span key={t} style={{ left: t * px }}>{t < 60 ? `${t}s` : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`}</span>)}
          </div>

          <div class="tl-track main" style={{ width, height: ROW_MAIN }}>
            {layout.map(pl => {
              const c = pl.clip, w = (pl.end - pl.start) * px, on = sel?.type === 'main' && sel.id === c.id;
              const a = c.mediaId ? assets.get(c.mediaId) : undefined;
              const label = c.kind === 'scene3d' ? `3D: ${SCENE_BY_ID.get(c.scene ?? '')?.name ?? ''}` : c.kind === 'color' ? '' : '';
              return (
                <div key={c.id} class={on ? 'tclip main on' : 'tclip main'} data-testid="clip-main" style={{ left: pl.start * px, width: w, background: c.kind === 'color' ? c.color : c.kind === 'scene3d' ? '#2b2470' : undefined }} onClick={e => { e.stopPropagation(); setSel({ type: 'main', id: c.id }); const now = api.time(); if (now < pl.start || now >= pl.end) api.seek(pl.start + Math.min(0.05, (pl.end - pl.start) / 2)); }}>
                  {(c.kind === 'video' || c.kind === 'image') && <Strip asset={a} clipIn={c.in} clipOut={c.kind === 'video' ? c.out : 0} width={w} px={px} />}
                  {label && <b class="clabel">{label}</b>}
                  <span class="cdur">{(pl.end - pl.start).toFixed(1)}s{c.speed !== 1 ? ` ${c.speed}x` : ''}{c.muted ? ' ovozsiz' : ''}{c.effects.length ? ` ${c.effects.length} fx` : ''}</span>
                  {on && <><i class="handle l" data-testid="handle-l" onPointerDown={trimMain(c.id, 'l') as never} /><i class="handle r" data-testid="handle-r" onPointerDown={trimMain(c.id, 'r') as never} /></>}
                </div>
              );
            })}
            {layout.slice(0, -1).filter(pl => pl.clip.transition || (pl.end - pl.start) * px >= 46).map(pl => (
              <button key={`tr${pl.clip.id}`} class={pl.clip.transition ? 'trbtn on' : 'trbtn'} data-testid="tr-btn" aria-label="O'tish qo'shish" style={{ left: (pl.end - pl.trOut / 2) * px - 13 }} onClick={e => { e.stopPropagation(); setSel({ type: 'main', id: pl.clip.id }); api.open('transition'); }}><Icon n={pl.clip.transition ? 'swap' : 'plus'} s={14} /></button>
            ))}
          </div>

          {lanes(project.overlays, o => o.start, o => o.start + clipDuration(o)).map((row, ri) => (
            <div class="tl-track" style={{ width }} key={`ov${ri}`}>
              {row.map(o => {
                const on = sel?.type === 'overlay' && sel.id === o.id;
                const a = o.mediaId ? assets.get(o.mediaId) : undefined;
                return (
                  <div key={o.id} class={on ? 'tclip ov on' : 'tclip ov'} data-testid="clip-ov" style={{ left: o.start * px, width: clipDuration(o) * px, ...(a?.thumb ? { backgroundImage: `url(${a.thumb})` } : {}) }} onClick={e => { e.stopPropagation(); setSel({ type: 'overlay', id: o.id }); }} onPointerDown={on ? moveStart('overlay', o.id, o.start) as never : undefined}>
                    {on && <><i class="handle l" onPointerDown={trimOverlay(o.id, 'l') as never} /><i class="handle r" onPointerDown={trimOverlay(o.id, 'r') as never} /></>}
                  </div>
                );
              })}
            </div>
          ))}

          {lanes(project.texts, t => t.start, t => t.start + t.duration).map((row, ri) => (
            <div class="tl-track" style={{ width }} key={`tx${ri}`}>
              {row.map(t => {
                const on = sel?.type === 'text' && sel.id === t.id;
                return (
                  <div key={t.id} class={on ? 'tclip tx on' : 'tclip tx'} data-testid="clip-tx" style={{ left: t.start * px, width: t.duration * px }} onClick={e => { e.stopPropagation(); setSel({ type: 'text', id: t.id }); }} onPointerDown={on ? moveStart('text', t.id, t.start) as never : undefined}>
                    <span>{t.text}</span>
                    {on && <><i class="handle l" onPointerDown={trimText(t.id, 'l') as never} /><i class="handle r" onPointerDown={trimText(t.id, 'r') as never} /></>}
                  </div>
                );
              })}
            </div>
          ))}

          {lanes(project.audio, a => a.start, a => a.start + totalAudioWidth(a)).map((row, ri) => (
            <div class="tl-track" style={{ width }} key={`au${ri}`}>
              {row.map(a => {
                const on = sel?.type === 'audio' && sel.id === a.id;
                const w = totalAudioWidth(a) * px;
                const asset = assets.get(a.mediaId);
                return (
                  <div key={a.id} class={on ? 'tclip au on' : 'tclip au'} data-testid="clip-au" style={{ left: a.start * px, width: Math.max(4, w) }} onClick={e => { e.stopPropagation(); setSel({ type: 'audio', id: a.id }); }} onPointerDown={on ? moveStart('audio', a.id, a.start) as never : undefined}>
                    <Waveform peaks={asset?.peaks} width={w} height={34} from={a.in} to={a.out} total={asset?.duration || 1} />
                    {(a.beats ?? []).filter(b => b >= a.in && b < a.out).map(b => <i key={b} class="beat" style={{ left: (b - a.in) * px }} />)}
                    <span>{a.name}{a.loop ? ', takrorlanadi' : ''}</span>
                    {on && <><i class="handle l" onPointerDown={trimAudio(a.id, 'l') as never} /><i class="handle r" onPointerDown={trimAudio(a.id, 'r') as never} /></>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div class="zoom" role="group" aria-label="Vaqt chizig'i masshtabi">
        <button aria-label="Kichraytirish" onClick={() => setPx(x => Math.max(MIN_PX, x / 1.4))}>-</button>
        <button aria-label="Kattalashtirish" onClick={() => setPx(x => Math.min(MAX_PX, x * 1.4))}>+</button>
      </div>
    </div>
  );
}
