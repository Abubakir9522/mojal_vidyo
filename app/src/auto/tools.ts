import { ALL_FORMATS, AudioBufferSink, AudioBufferSource, BlobSource, BufferTarget, CanvasSink, CanvasSource, Input, Mp4OutputFormat, Output, VideoSampleSink, canEncodeAudio, getFirstEncodableVideoCodec } from 'mediabunny';
import type { AudioClip, Clip, MediaAsset, Project, TextClip } from '../engine/types';
import { newText } from '../engine/types';
import { clipDuration, layoutMain, projectDuration } from '../engine/timeline';
import { getBlob, saveRawBlob } from '../store/media';

export type Progress = (p: number, msg: string) => void;

/** Saves the frame at a source time as a photo, for freeze frames. */
export async function grabFrame(asset: MediaAsset, t: number): Promise<MediaAsset> {
  const input = new Input({ source: new BlobSource(await getBlob(asset)), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('Faylda vidyo topilmadi');
    if (!(await track.canDecode())) throw new Error('Bu vidyo turidan kadr olib bo\'lmadi');
    const sink = new CanvasSink(track, { width: track.displayWidth, height: track.displayHeight, fit: 'fill' });
    const r = await sink.getCanvas(Math.max(await track.getFirstTimestamp(), t));
    if (!r) throw new Error('Bu joyda kadr topilmadi');
    const c = r.canvas as HTMLCanvasElement;
    const blob = await new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('Kadr saqlanmadi'))), 'image/jpeg', 0.94));
    return await saveRawBlob(blob, `Kadr ${t.toFixed(1)}s`, 'image');
  } finally { input.dispose(); }
}

/**
 * Builds a new file that plays a stretch of video backwards, sound included.
 * Frames decode in short blocks from the end, because a video can only decode forwards.
 */
export async function reverseVideo(asset: MediaAsset, from: number, to: number, onProgress: Progress): Promise<MediaAsset> {
  if (to - from > 120) throw new Error('Teskari qilish uchun klipni 2 daqiqagacha qisqartiring.');
  const input = new Input({ source: new BlobSource(await getBlob(asset)), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) throw new Error("Bu vidyoni teskari qilib bo'lmadi");
    const fps = 30, n = Math.max(1, Math.round((to - from) * fps));
    const k = Math.min(1, 1080 / Math.min(track.displayWidth, track.displayHeight));
    const w = Math.round((track.displayWidth * k) / 2) * 2, h = Math.round((track.displayHeight * k) / 2) * 2;
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const bitrate = Math.round(w * h * fps * 0.2);
    const codec = await getFirstEncodableVideoCodec(['avc', 'hevc', 'vp9', 'av1'], { width: w, height: h, bitrate });
    if (!codec) throw new Error("Bu o'lchamda vidyo kodlab bo'lmadi");
    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
    const vs = new CanvasSource(canvas, { codec, bitrate, keyFrameInterval: 1 });
    output.addVideoTrack(vs, { frameRate: fps });

    const aTrack = await input.getPrimaryAudioTrack();
    let aSource: AudioBufferSource | null = null;
    let reversedAudio: AudioBuffer | null = null;
    if (aTrack && (await aTrack.canDecode())) {
      const parts: AudioBuffer[] = [];
      for await (const b of new AudioBufferSink(aTrack).buffers(from, to)) parts.push(b.buffer);
      if (parts.length) {
        const sr = parts[0].sampleRate, chs = parts[0].numberOfChannels;
        const len = Math.min(Math.round((to - from) * sr), parts.reduce((s, p) => s + p.length, 0));
        reversedAudio = new AudioBuffer({ length: Math.max(1, len), numberOfChannels: chs, sampleRate: sr });
        for (let c = 0; c < chs; c++) {
          const d = new Float32Array(len);
          let off = 0;
          for (const p of parts) { const m = Math.min(p.length, len - off); if (m <= 0) break; d.set(p.getChannelData(c).subarray(0, m), off); off += m; }
          d.reverse();
          reversedAudio.copyToChannel(d, c);
        }
        let codecA: 'aac' | 'opus' = 'aac';
        if (!(await canEncodeAudio('aac'))) {
          try { (await import('@mediabunny/aac-encoder')).registerAacEncoder(); } catch { /* the check below falls back */ }
          if (!(await canEncodeAudio('aac'))) codecA = 'opus';
        }
        aSource = new AudioBufferSource({ codec: codecA, bitrate: 160000 });
        output.addAudioTrack(aSource);
      }
    }

    await output.start();
    if (aSource && reversedAudio) await aSource.add(reversedAudio);
    const BLOCK = 12;
    const sink = new VideoSampleSink(track);
    let written = 0;
    for (let end = n; end > 0; end -= BLOCK) {
      const start = Math.max(0, end - BLOCK);
      const stamps: number[] = [];
      for (let i = start; i < end; i++) stamps.push(from + (i + 0.5) / fps);
      const frames: ImageBitmap[] = [];
      for await (const s of sink.samplesAtTimestamps(stamps)) {
        if (!s) continue;
        ctx.clearRect(0, 0, w, h);
        s.drawWithFit(ctx, { fit: 'fill' });
        s.close();
        frames.push(await createImageBitmap(canvas));
      }
      for (let i = frames.length - 1; i >= 0; i--) {
        ctx.drawImage(frames[i], 0, 0);
        frames[i].close();
        await vs.add(written / fps, 1 / fps);
        written++;
      }
      onProgress(Math.min(1, written / n), `${written} / ${n} kadr`);
      await new Promise(r => setTimeout(r));
    }
    vs.close();
    aSource?.close();
    await output.finalize();
    const blob = new Blob([target.buffer!], { type: 'video/mp4' });
    return await saveRawBlob(blob, `${asset.name} (teskari)`, 'video');
  } finally { input.dispose(); }
}

export interface Span { start: number; end: number }

/** Finds where someone is speaking on the timeline, from the sound's loudness against its quiet floor. */
export async function speechSpans(p: Project, assetOf: (id: string) => MediaAsset | undefined): Promise<Span[]> {
  const sources: { asset: MediaAsset; start: number; in: number; len: number; rate: number }[] = [];
  for (const l of layoutMain(p)) {
    const c = l.clip;
    const a = c.mediaId ? assetOf(c.mediaId) : undefined;
    if (c.kind === 'video' && !c.muted && a?.hasAudio) sources.push({ asset: a, start: l.start, in: c.in, len: l.end - l.start, rate: c.speed });
  }
  for (const c of p.audio) {
    const a = assetOf(c.mediaId);
    if (c.kind === 'voice' && !c.muted && a) sources.push({ asset: a, start: c.start, in: c.in, len: c.out - c.in, rate: 1 });
  }
  const spans: Span[] = [];
  for (const s of sources) {
    const input = new Input({ source: new BlobSource(await getBlob(s.asset)), formats: ALL_FORMATS });
    try {
      const track = await input.getPrimaryAudioTrack();
      if (!track || !(await track.canDecode())) continue;
      const STEP = 0.03;
      const levels: number[] = [];
      let acc = 0, cnt = 0, sr = 48000;
      for await (const { buffer } of new AudioBufferSink(track).buffers(s.in, s.in + s.len * s.rate)) {
        sr = buffer.sampleRate;
        const d = buffer.getChannelData(0), per = Math.round(sr * STEP);
        for (let i = 0; i < d.length; i++) { acc += d[i] * d[i]; if (++cnt >= per) { levels.push(Math.sqrt(acc / cnt)); acc = 0; cnt = 0; } }
      }
      if (!levels.length) continue;
      const sorted = [...levels].sort((a, b) => a - b);
      const floor = sorted[Math.floor(sorted.length * 0.15)], top = sorted[Math.floor(sorted.length * 0.95)];
      const gate = Math.max(0.004, floor + (top - floor) * 0.18);
      let open = -1, silent = 0;
      const flush = (endI: number) => {
        const a = (open * STEP) / s.rate, b = (endI * STEP) / s.rate;
        if (b - a >= 0.25) spans.push({ start: s.start + a, end: s.start + b });
      };
      levels.forEach((v, i) => {
        if (v > gate) { if (open < 0) open = i; silent = 0; }
        else if (open >= 0 && ++silent * STEP > 0.35) { flush(i - silent + 1); open = -1; silent = 0; }
      });
      if (open >= 0) flush(levels.length);
    } finally { input.dispose(); }
  }
  return spans.sort((a, b) => a.start - b.start);
}

const subtitleStyle = (text: string, start: number, duration: number): TextClip => newText({
  text, start, duration, subtitle: true, size: 4.4, y: 0.84, weight: 800, stroke: '#000000', strokeWidth: 0.16, shadow: true, animIn: 'none', animOut: 'none',
});

/** Breaks written text into short subtitle lines of a few words. */
export function toLines(text: string, maxWords = 6): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\n+/)) {
    for (const sentence of raw.split(/(?<=[.!?…])\s+/)) {
      const words = sentence.trim().split(/\s+/).filter(Boolean);
      for (let i = 0; i < words.length; i += maxWords) out.push(words.slice(i, i + maxWords).join(' '));
    }
  }
  return out;
}

/** Times written lines over the spoken parts in proportion to their length. Whole project if nothing was found. */
export function placeLines(p: Project, lines: string[], spans: Span[]): TextClip[] {
  const total = projectDuration(p);
  const use = spans.length ? spans : [{ start: 0, end: total }];
  const speech = use.reduce((s, x) => s + (x.end - x.start), 0);
  const chars = lines.reduce((s, l) => s + l.length + 1, 0) || 1;
  const mapClock = (clock: number) => {
    let c = clock;
    for (const x of use) { const d = x.end - x.start; if (c <= d) return x.start + c; c -= d; }
    return use[use.length - 1].end;
  };
  let clock = 0;
  return lines.map(l => {
    const d = (speech * (l.length + 1)) / chars;
    const a = mapClock(clock + 1e-3), b = mapClock(clock + d);
    clock += d;
    return subtitleStyle(l, a, Math.max(0.3, b - a));
  });
}

/** Reads a standard .srt subtitle file. */
export function parseSrt(text: string): TextClip[] {
  const out: TextClip[] = [];
  const time = (s: string) => { const m = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(s); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000 : null; };
  for (const block of text.replace(/\r/g, '').split(/\n\s*\n/)) {
    const rows = block.trim().split('\n');
    const i = rows.findIndex(r => r.includes('-->'));
    if (i < 0) continue;
    const [a, b] = rows[i].split('-->').map(time);
    const body = rows.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').trim();
    if (a !== null && b !== null && b > a && body) out.push(subtitleStyle(body, a, b - a));
  }
  return out;
}

export const placedClipTime = (p: Project, c: Clip) => layoutMain(p).find(l => l.clip.id === c.id)?.start ?? 0;
export const audioEnd = (a: AudioClip) => a.start + (a.out - a.in);
export { clipDuration };
