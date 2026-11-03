import { Capacitor, registerPlugin } from '@capacitor/core';

interface MojalMediaPlugin {
  begin(o: { name: string; mime: string }): Promise<{ id: string }>;
  append(o: { id: string; data: string }): Promise<void>;
  finish(o: { id: string }): Promise<{ uri: string }>;
  abort(o: { id: string }): Promise<void>;
  share(o: { uri: string; mime: string }): Promise<void>;
  open(o: { uri: string; mime: string }): Promise<void>;
}
const Native = registerPlugin<MojalMediaPlugin>('MojalMedia');
export const isNative = () => Capacitor.isNativePlatform();

function toBase64(u8: Uint8Array) {
  let s = '';
  const cs = 0x8000;
  for (let i = 0; i < u8.length; i += cs) s += String.fromCharCode.apply(null, u8.subarray(i, i + cs) as unknown as number[]);
  return btoa(s);
}

export interface Saved { uri: string; url?: string }

/** Copies a finished video into the phone gallery in chunks, or downloads it in a browser. */
export async function saveVideo(blob: Blob, name: string, onProgress?: (p: number) => void): Promise<Saved> {
  if (!isNative()) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    return { uri: url, url };
  }
  const { id } = await Native.begin({ name, mime: 'video/mp4' });
  try {
    const CHUNK = 3 * 1024 * 1024;
    for (let off = 0; off < blob.size; off += CHUNK) {
      const buf = new Uint8Array(await blob.slice(off, off + CHUNK).arrayBuffer());
      await Native.append({ id, data: toBase64(buf) });
      onProgress?.(Math.min(1, (off + CHUNK) / blob.size));
    }
    const { uri } = await Native.finish({ id });
    return { uri };
  } catch (e) {
    await Native.abort({ id }).catch(() => {});
    throw e;
  }
}

export async function shareVideo(saved: Saved | null, blob: Blob, name: string) {
  if (isNative() && saved) { await Native.share({ uri: saved.uri, mime: 'video/mp4' }); return; }
  const file = new File([blob], name, { type: 'video/mp4' });
  if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: name });
  else throw new Error('Bu brauzer ulashishni qo\'llamaydi. Faylni yuklab oling.');
}

/** Opens the system file chooser and resolves with the chosen files. Empty if the user backed out. */
export function pickFiles(accept: string, multiple = true): Promise<File[]> {
  return new Promise(res => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept; i.multiple = multiple; i.style.display = 'none';
    i.dataset.picker = accept;
    document.body.appendChild(i);
    const finish = (f: File[]) => { i.remove(); res(f); };
    i.addEventListener('change', () => finish(Array.from(i.files ?? [])));
    i.addEventListener('cancel', () => finish([]));
    i.click();
  });
}
