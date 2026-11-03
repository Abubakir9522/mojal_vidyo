import { getFirstEncodableVideoCodec } from 'mediabunny';
import type { VideoCodec } from 'mediabunny';

export interface ChosenCodec { codec: VideoCodec; fullCodecString?: string }

// High, main, then baseline profile, at a level that fits the size. Many phones and emulators offer only some of them.
const AVC = ['avc1.640033', 'avc1.4d0033', 'avc1.420033', 'avc1.640028', 'avc1.4d0028', 'avc1.420028', 'avc1.64001f', 'avc1.4d001f', 'avc1.42001f', 'avc1.42e01f'];

/** Picks an encoder for this phone. H.264 comes first because every app and player can open it. */
export async function chooseVideoCodec(width: number, height: number, bitrate: number, framerate: number): Promise<ChosenCodec | null> {
  for (const codec of AVC) {
    try {
      const r = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate, framerate });
      if (r.supported) return { codec: 'avc', fullCodecString: codec };
    } catch { /* an unknown profile string just means trying the next one */ }
  }
  const other = await getFirstEncodableVideoCodec(['hevc', 'vp9', 'av1'], { width, height, bitrate });
  return other ? { codec: other } : null;
}
