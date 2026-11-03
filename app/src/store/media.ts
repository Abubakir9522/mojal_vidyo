import { ALL_FORMATS, AudioBufferSink, BlobSource, CanvasSink, Input } from 'mediabunny';
import type { MediaAsset, MediaKind } from '../engine/types';
import { uid } from '../engine/types';
import { db } from './db';

const fileMemo = new Map<string, Blob>();

async function mediaDir(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle('media', { create: true });
  } catch { return null; }
}

async function storeBlob(id: string, blob: Blob) {
  const dir = await mediaDir();
  if (dir) {
    try {
      const fh = await dir.getFileHandle(id, { create: true });
      const w = await fh.createWritable();
      await w.write(blob);
      await w.close();
      return;
    } catch { /* falls through to IndexedDB on devices without a writable private file system */ }
  }
  await db.put('blobs', blob, id);
}

export async function getAsset(id: string) { return db.get<MediaAsset>('assets', id); }
export async function allAssets() { return (await db.all<MediaAsset>('assets')).sort((a, b) => b.createdAt - a.createdAt); }

export async function getBlob(asset: MediaAsset): Promise<Blob> {
  const memo = fileMemo.get(asset.id);
  if (memo) return memo;
  const dir = await mediaDir();
  if (dir) {
    try {
      const f = await (await dir.getFileHandle(asset.id)).getFile();
      fileMemo.set(asset.id, f);
      return f;
    } catch { /* stored in IndexedDB instead */ }
  }
  const b = await db.get<Blob>('blobs', asset.id);
  if (!b) throw new Error(`${asset.name} qurilmada topilmadi. Faylni qayta qo'shing.`);
  fileMemo.set(asset.id, b);
  return b;
}

const kindOf = (f: File): MediaKind | null => {
  if (f.type.startsWith('video/')) return 'video';
  if (f.type.startsWith('image/')) return 'image';
  if (f.type.startsWith('audio/')) return 'audio';
  const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
  if (['mp4', 'mov', 'webm', 'mkv', 'm4v', '3gp'].includes(ext)) return 'video';
  if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif', 'bmp'].includes(ext)) return 'image';
  if (['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'opus'].includes(ext)) return 'audio';
  return null;
};

function canvasToThumb(src: CanvasImageSource, w: number, h: number) {
  const maxSide = 240, k = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.72);
}

/** Probes a blob and builds the asset record: size, length, thumbnail, audio peaks. */
export async function probe(blob: Blob, kind: MediaKind, name: string): Promise<Omit<MediaAsset, 'id' | 'createdAt'>> {
  const base = { name, kind, duration: 0, width: 0, height: 0, hasAudio: false, size: blob.size };
  if (kind === 'image') {
    const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    const out = { ...base, duration: 4, width: bmp.width, height: bmp.height, thumb: canvasToThumb(bmp, bmp.width, bmp.height) };
    bmp.close();
    return out;
  }
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    if (kind === 'video') {
      const v = await input.getPrimaryVideoTrack();
      if (!v) throw new Error(`${name} faylida video topilmadi`);
      const a = await input.getPrimaryAudioTrack();
      const duration = await input.computeDuration();
      const out: Omit<MediaAsset, 'id' | 'createdAt'> = { ...base, duration, width: v.displayWidth, height: v.displayHeight, hasAudio: !!a };
      try {
        if (await v.canDecode()) {
          const sink = new CanvasSink(v, { width: Math.round(240 * Math.min(1, v.displayWidth / v.displayHeight)), height: Math.round(240 * Math.min(1, v.displayHeight / v.displayWidth)), fit: 'cover' });
          const r = await sink.getCanvas(Math.min(0.5, duration / 2));
          if (r) out.thumb = canvasToThumb(r.canvas as HTMLCanvasElement, r.canvas.width, r.canvas.height);
        }
      } catch { /* a missing thumbnail must not block import */ }
      return out;
    }
    const a = await input.getPrimaryAudioTrack();
    if (!a) throw new Error(`${name} faylida ovoz topilmadi`);
    const duration = await input.computeDuration();
    const out: Omit<MediaAsset, 'id' | 'createdAt'> = { ...base, duration, hasAudio: true };
    try { out.peaks = await computePeaks(a, duration); } catch { /* the clip still works without a waveform */ }
    return out;
  } finally { input.dispose(); }
}

async function computePeaks(track: import('mediabunny').InputAudioTrack, duration: number) {
  const bins = Math.min(800, Math.max(60, Math.round(duration * 8)));
  const out = new Array<number>(bins).fill(0);
  const sink = new AudioBufferSink(track);
  for await (const { buffer, timestamp } of sink.buffers()) {
    const d = buffer.getChannelData(0);
    const sr = buffer.sampleRate, step = Math.max(1, Math.floor(d.length / 40));
    for (let i = 0; i < d.length; i += step) {
      const b = Math.min(bins - 1, Math.floor(((timestamp + i / sr) / duration) * bins));
      const v = Math.abs(d[i]);
      if (v > out[b]) out[b] = v;
    }
  }
  const mx = Math.max(0.001, ...out);
  return out.map(v => +(v / mx).toFixed(2));
}

export async function importFile(file: File): Promise<MediaAsset> {
  const kind = kindOf(file);
  if (!kind) throw new Error(`${file.name}: bu fayl turi qo'llanmaydi`);
  const info = await probe(file, kind, file.name);
  const asset: MediaAsset = { ...info, id: uid(), createdAt: Date.now() };
  await storeBlob(asset.id, file);
  await db.put('assets', asset);
  return asset;
}

/** Registers a file that lives at a URL, such as built-in music or a track from the online library. */
export async function ensureUrlAsset(id: string, url: string, name: string, kind: MediaKind): Promise<MediaAsset> {
  const hit = await getAsset(id);
  if (hit) return hit;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${name} faylini yuklab bo'lmadi`);
  const blob = await r.blob();
  const info = await probe(blob, kind, name);
  const asset: MediaAsset = { ...info, id, createdAt: Date.now() };
  // Every library file is copied to the device, so it keeps working with no network.
  await storeBlob(id, blob);
  await db.put('assets', asset);
  return asset;
}

export async function saveRawBlob(blob: Blob, name: string, kind: MediaKind): Promise<MediaAsset> {
  const info = await probe(blob, kind, name);
  const asset: MediaAsset = { ...info, id: uid(), createdAt: Date.now() };
  await storeBlob(asset.id, blob);
  await db.put('assets', asset);
  return asset;
}

export async function deleteAsset(id: string) {
  fileMemo.delete(id);
  await db.del('assets', id);
  await db.del('blobs', id);
  const dir = await mediaDir();
  try { await dir?.removeEntry(id); } catch { /* already gone */ }
}

const IMG_MAX = 2160;
const imgCache = new Map<string, ImageBitmap>();

export async function getImage(id: string): Promise<ImageBitmap | null> {
  const hit = imgCache.get(id);
  if (hit) return hit;
  const asset = await getAsset(id);
  if (!asset) return null;
  const blob = await getBlob(asset);
  const opts: ImageBitmapOptions = { imageOrientation: 'from-image', premultiplyAlpha: 'none' };
  const k = Math.min(1, IMG_MAX / Math.max(asset.width || 1, asset.height || 1));
  if (k < 1) { opts.resizeWidth = Math.round(asset.width * k); opts.resizeHeight = Math.round(asset.height * k); opts.resizeQuality = 'high'; }
  const bmp = await createImageBitmap(blob, opts);
  imgCache.set(id, bmp);
  if (imgCache.size > 24) {
    // Dropped, not closed: a 3D scene or the renderer may still be drawing from this bitmap.
    imgCache.delete(imgCache.keys().next().value as string);
  }
  return bmp;
}
