import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny';
import type { MediaAsset } from '../engine/types';
import { getBlob } from '../store/media';

const cache = new Map<string, Promise<string[]>>();

/** A row of small frames for the timeline, made once for each file. */
export function filmstrip(asset: MediaAsset): Promise<string[]> {
  let p = cache.get(asset.id);
  if (!p) {
    p = build(asset).catch(() => (asset.thumb ? [asset.thumb] : []));
    cache.set(asset.id, p);
  }
  return p;
}

async function build(asset: MediaAsset): Promise<string[]> {
  const input = new Input({ source: new BlobSource(await getBlob(asset)), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) return asset.thumb ? [asset.thumb] : [];
    const n = Math.min(30, Math.max(4, Math.ceil(asset.duration / 2)));
    const h = 56, w = Math.round((h * asset.width) / asset.height);
    const sink = new CanvasSink(track, { width: w, height: h, fit: 'fill' });
    const stamps = Array.from({ length: n }, (_, i) => ((i + 0.5) / n) * asset.duration);
    const out: string[] = [];
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d')!;
    for await (const r of sink.canvasesAtTimestamps(stamps)) {
      if (r) { x.drawImage(r.canvas as HTMLCanvasElement, 0, 0); out.push(c.toDataURL('image/jpeg', 0.55)); }
      else if (out.length) out.push(out[out.length - 1]);
    }
    return out;
  } finally { input.dispose(); }
}
