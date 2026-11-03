import type { MediaAsset } from '../engine/types';
import { getBlob, saveRawBlob } from '../store/media';

interface Segmenter {
  setOptions(o: { modelSelection: number }): void;
  onResults(fn: (r: { segmentationMask: CanvasImageSource }) => void): void;
  send(i: { image: HTMLCanvasElement }): Promise<void>;
  initialize(): Promise<void>;
}

let loading: Promise<Segmenter> | null = null;

/** Loads the person-cutout model bundled with the app. It runs on the phone, with no network. */
function segmenter(): Promise<Segmenter> {
  loading ??= new Promise<Segmenter>((res, rej) => {
    const base = new URL('mediapipe/', document.baseURI).href;
    const go = () => {
      const Ctor = (window as unknown as { SelfieSegmentation: new (o: { locateFile: (f: string) => string }) => Segmenter }).SelfieSegmentation;
      const s = new Ctor({ locateFile: f => base + f });
      s.setOptions({ modelSelection: 0 });
      res(s);
    };
    if ((window as unknown as { SelfieSegmentation?: unknown }).SelfieSegmentation) return go();
    const tag = document.createElement('script');
    tag.src = `${base}selfie_segmentation.js`;
    tag.onload = go;
    tag.onerror = () => rej(new Error("Fonni olib tashlash vositasini ochib bo'lmadi"));
    document.head.append(tag);
  }).catch(e => { loading = null; throw e; });
  return loading;
}

/** Makes a copy of a photo with the background removed, keeping the person. */
export async function cutoutPerson(asset: MediaAsset): Promise<MediaAsset> {
  const s = await segmenter();
  const bmp = await createImageBitmap(await getBlob(asset), { imageOrientation: 'from-image' });
  const maxSide = 1600, k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const src = document.createElement('canvas'); src.width = w; src.height = h;
  src.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const x = out.getContext('2d', { willReadFrequently: true })!;
  await new Promise<void>((res, rej) => {
    s.onResults(r => {
      try {
        x.imageSmoothingQuality = 'high';
        x.drawImage(r.segmentationMask, 0, 0, w, h);
        x.globalCompositeOperation = 'source-in';
        x.drawImage(src, 0, 0);
        res();
      } catch (e) { rej(e as Error); }
    });
    s.send({ image: src }).catch(rej);
  });
  // A photo with no person gives an empty mask, which would otherwise look like a broken picture.
  const d = x.getImageData(0, 0, w, h).data;
  let kept = 0;
  for (let i = 3; i < d.length; i += 64) if (d[i] > 128) kept++;
  if (kept < (d.length / 64) * 0.01) throw new Error('Rasmda odam topilmadi. Bu vosita odamni fondan ajratadi.');
  const blob = await new Promise<Blob>((res, rej) => out.toBlob(b => (b ? res(b) : rej(new Error('Rasm saqlanmadi'))), 'image/png'));
  return saveRawBlob(blob, `${asset.name} (fonsiz)`, 'image');
}
