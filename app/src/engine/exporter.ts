import { ALL_FORMATS, AudioBufferSource, BlobSource, BufferTarget, CanvasSource, Input, Mp4OutputFormat, Output, StreamTarget, VideoSampleSink, canEncodeAudio } from 'mediabunny';
import type { VideoSample } from 'mediabunny';
import { Compositor, Frame } from './compositor';
import { chooseVideoCodec } from './codec';
import { AudioMixer, SAMPLE_RATE, audioSegments } from './mixer';
import { Scene3DRenderer } from './scene3d';
import { ASPECTS, Clip, MediaAsset, Project } from './types';
import { activeMain, activeOverlays, clipDuration, layoutMain, projectDuration, sourceTime } from './timeline';
import { getAsset, getBlob, getImage } from '../store/media';
import { loadSpectrum } from '../auto/spectrum';

export interface ExportOptions { height: number; fps: number; quality: 'normal' | 'high' | 'max'; }
export interface ExportResult { file: Blob; name: string; duration: number; width: number; height: number; size: number; codec: string; seconds: number }

export function exportSize(p: Project, shortSide: number) {
  const a = ASPECTS[p.aspect];
  const k = shortSide / Math.min(a.w, a.h);
  return { w: Math.round((a.w * k) / 2) * 2, h: Math.round((a.h * k) / 2) * 2 };
}

const BITS: Record<ExportOptions['quality'], number> = { normal: 0.1, high: 0.17, max: 0.28 };

/** Sequentially decodes one clip's frames at the exact timestamps the timeline needs. */
class ClipStream {
  private gen: AsyncGenerator<VideoSample | null, void, unknown> | null = null;
  private last: VideoSample | null = null;
  private vf: VideoFrame | null = null;
  constructor(private sink: VideoSampleSink, private stamps: number[]) {}

  async advance() {
    this.gen ??= this.sink.samplesAtTimestamps(this.stamps);
    const r = await this.gen.next();
    const s = r.done ? null : r.value;
    if (s) {
      this.vf?.close(); this.vf = null;
      this.last?.close();
      this.last = s;
    }
  }
  frame(): Frame | null {
    if (!this.last) return null;
    this.vf ??= this.last.toVideoFrame();
    return { source: this.vf as unknown as TexImageSource, width: this.vf.displayWidth, height: this.vf.displayHeight, rotation: this.last.rotation };
  }
  async close() {
    this.vf?.close(); this.vf = null;
    this.last?.close(); this.last = null;
    try { await this.gen?.return(); } catch { /* the decoder was already closed */ }
    this.gen = null;
  }
}

/** Fallback for files WebCodecs cannot decode: seeks a video element frame by frame. */
class ElementStream {
  private el: HTMLVideoElement | null = null;
  private i = 0;
  private url = '';
  constructor(private blob: Blob, private stamps: number[]) {}
  async advance() {
    if (!this.el) {
      this.url = URL.createObjectURL(this.blob);
      this.el = document.createElement('video');
      this.el.muted = true; this.el.playsInline = true; this.el.preload = 'auto'; this.el.src = this.url;
      await new Promise<void>((res, rej) => { this.el!.onloadeddata = () => res(); this.el!.onerror = () => rej(new Error('Videoni ochib bo\'lmadi')); });
    }
    const t = this.stamps[this.i++];
    if (t === undefined) return;
    await new Promise<void>(res => { const el = this.el!; const done = () => { el.removeEventListener('seeked', done); res(); }; el.addEventListener('seeked', done); el.currentTime = t; });
  }
  frame(): Frame | null { return this.el ? { source: this.el, width: this.el.videoWidth, height: this.el.videoHeight } : null; }
  async close() { if (this.el) { this.el.src = ''; this.el = null; URL.revokeObjectURL(this.url); } }
}

type Stream = ClipStream | ElementStream;

export async function exportProject(project: Project, opts: ExportOptions, onProgress: (p: number, msg: string) => void, signal?: AbortSignal): Promise<ExportResult> {
  const began = performance.now();
  const { w, h } = exportSize(project, opts.height);
  const fps = opts.fps;
  const duration = projectDuration(project);
  if (duration <= 0) throw new Error("Loyiha bo'sh. Avval vidyo yoki rasm qo'shing.");
  const totalFrames = Math.max(1, Math.round(duration * fps));

  if (typeof VideoEncoder === 'undefined') throw new Error('Bu qurilmada video kodlash mavjud emas. Android System WebView ilovasini yangilang.');

  const canvas = document.createElement('canvas');
  const comp = new Compositor(canvas);
  comp.setSize(w, h);
  const scenes = new Scene3DRenderer(getImage);

  const bitrate = Math.round(w * h * fps * BITS[opts.quality]);
  const chosen = await chooseVideoCodec(w, h, bitrate, fps);
  if (!chosen) throw new Error(`${w}x${h} o'lchamda video kodlab bo'lmadi. Pastroq sifatni tanlang.`);
  const codec = chosen.codec;

  // Prefer writing straight to device storage, so long videos do not have to fit in memory.
  let fileHandle: FileSystemFileHandle | null = null;
  let writable: FileSystemWritableFileStream | null = null;
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('exports', { create: true });
    for await (const name of (dir as unknown as { keys(): AsyncIterable<string> }).keys()) await dir.removeEntry(name).catch(() => {});
    fileHandle = await dir.getFileHandle(`${project.id}.mp4`, { create: true });
    writable = await fileHandle.createWritable();
  } catch { fileHandle = null; writable = null; }

  const target = writable ? new StreamTarget(writable as unknown as WritableStream, { chunked: true, chunkSize: 4 * 1024 * 1024 }) : new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: writable ? false : 'in-memory' }), target });
  const videoSource = new CanvasSource(canvas, { codec, fullCodecString: chosen.fullCodecString, bitrate, keyFrameInterval: 2, latencyMode: 'quality', hardwareAcceleration: 'no-preference' });
  output.addVideoTrack(videoSource, { frameRate: fps });

  const assets = new Map<string, MediaAsset>();
  const needIds = new Set<string>();
  for (const c of [...project.main, ...project.overlays]) { if (c.mediaId) needIds.add(c.mediaId); for (const m of c.sceneParams?.mediaIds ?? []) needIds.add(m); }
  for (const a of project.audio) needIds.add(a.mediaId);
  for (const id of needIds) { const a = await getAsset(id); if (a) assets.set(id, a); }
  for (const c of project.main) if (c.mediaId && !assets.has(c.mediaId)) throw new Error(`Loyihadagi fayl topilmadi. Uni qayta qo'shing.`);

  const blobOf = async (id: string) => getBlob(assets.get(id)!);
  const mixer = new AudioMixer(audioSegments(project, id => assets.get(id)), blobOf);
  let audioSource: AudioBufferSource | null = null;
  if (mixer.hasAudio) {
    let audioCodec: 'aac' | 'opus' = 'aac';
    if (!(await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: SAMPLE_RATE, bitrate: 192000 }))) {
      try {
        const { registerAacEncoder } = await import('@mediabunny/aac-encoder');
        registerAacEncoder();
      } catch { /* the check below falls back to Opus */ }
      if (!(await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: SAMPLE_RATE, bitrate: 192000 }))) audioCodec = 'opus';
    }
    audioSource = new AudioBufferSource({ codec: audioCodec, bitrate: 192000 });
    output.addAudioTrack(audioSource);
  }

  // Which timestamps each video clip needs, so its decoder only runs while the clip is on screen.
  const layout = layoutMain(project);
  const placements: { clip: Clip; start: number; end: number }[] = [
    ...layout.map(l => ({ clip: l.clip, start: l.start, end: l.end })),
    ...project.overlays.map(o => ({ clip: o as Clip, start: o.start, end: o.start + clipDuration(o) })),
  ];
  const inputs = new Map<string, Input>();
  const stamps = new Map<string, number[]>();
  const lastFrameOf = new Map<string, number>();
  for (const pl of placements) {
    if (pl.clip.kind !== 'video') continue;
    const list: number[] = [];
    let lastN = -1;
    for (let n = Math.max(0, Math.floor(pl.start * fps)); n <= Math.min(totalFrames - 1, Math.ceil(pl.end * fps)); n++) {
      const t = n / fps;
      if (t < pl.start || t >= pl.end) continue;
      list.push(Math.min(pl.clip.out - 0.001, sourceTime(pl.clip, t - pl.start)));
      lastN = n;
    }
    stamps.set(pl.clip.id, list);
    lastFrameOf.set(pl.clip.id, lastN);
  }
  const streams = new Map<string, Stream>();

  async function streamFor(clip: Clip): Promise<Stream> {
    let s = streams.get(clip.id);
    if (s) return s;
    const blob = await blobOf(clip.mediaId!);
    let input = inputs.get(clip.mediaId!);
    if (!input) { input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS }); inputs.set(clip.mediaId!, input); }
    const track = await input.getPrimaryVideoTrack();
    if (track && (await track.canDecode())) s = new ClipStream(new VideoSampleSink(track), stamps.get(clip.id) ?? []);
    else s = new ElementStream(blob, stamps.get(clip.id) ?? []);
    streams.set(clip.id, s);
    return s;
  }

  onProgress(0, 'Tayyorlanmoqda');
  for (const c of [...project.main, ...project.overlays]) if (c.kind === 'scene3d') await scenes.prepare(c, w, h);
  await document.fonts.ready;
  if (project.texts.some(t => t.viz)) for (const a of project.audio) if (assets.has(a.mediaId)) await loadSpectrum(a.mediaId, () => blobOf(a.mediaId));
  for (const tc of project.texts) if (!tc.viz) await document.fonts.load(`${tc.weight} 40px "${tc.font}"`, tc.text).catch(() => []);

  const images = new Map<string, ImageBitmap>();
  let wake: WakeLockSentinel | null = null;
  try { wake = await navigator.wakeLock?.request('screen'); } catch { /* keeping the screen on is optional */ }

  let audioDone = 0;
  const AUDIO_WINDOW = 4;
  await output.start();
  let failed = true;
  try {
    for (let n = 0; n < totalFrames; n++) {
      if (signal?.aborted) throw new DOMException('Bekor qilindi', 'AbortError');
      const t = n / fps;

      // Audio runs slightly ahead of video, so the file stays interleaved and memory use stays flat.
      while (audioSource && audioDone < duration && audioDone < t + AUDIO_WINDOW) {
        const end = Math.min(duration, audioDone + AUDIO_WINDOW);
        await audioSource.add(await mixer.mix(audioDone, end));
        audioDone = end;
      }

      const act = activeMain(layout, t);
      const active: { clip: Clip; start: number; end: number }[] = [];
      if (act) { active.push({ clip: act.a.clip, start: act.a.start, end: act.a.end }); if (act.b) active.push({ clip: act.b.clip, start: act.b.start, end: act.b.end }); }
      for (const o of activeOverlays(project, t)) active.push({ clip: o, start: o.start, end: o.start + clipDuration(o) });

      const frames = new Map<string, Frame>();
      for (const a of active) {
        const c = a.clip;
        if (c.kind === 'video') {
          const s = await streamFor(c);
          await s.advance();
          const f = s.frame();
          if (f) frames.set(c.id, f);
        } else if (c.kind === 'image' && c.mediaId) {
          let b = images.get(c.mediaId);
          if (!b) { const got = await getImage(c.mediaId); if (got) { b = got; images.set(c.mediaId, got); } }
          if (b) frames.set(c.id, { source: b, width: b.width, height: b.height, cacheKey: c.mediaId });
        } else if (c.kind === 'scene3d') {
          const cv = scenes.render(c, t - a.start, a.end - a.start, w, h);
          if (cv) frames.set(c.id, { source: cv, width: cv.width, height: cv.height });
        }
      }
      comp.render(project, t, clip => frames.get(clip.id) ?? null);
      await videoSource.add(t, 1 / fps);

      // A clip's decoder closes after its final frame, because phones allow only a few at once.
      for (const [id, s] of streams) if ((lastFrameOf.get(id) ?? -1) <= n && !active.some(a => a.clip.id === id)) { await s.close(); streams.delete(id); }

      onProgress((n + 1) / totalFrames, `${n + 1} / ${totalFrames} kadr`);
      if (n % 8 === 0) await new Promise(r => setTimeout(r));
    }
    videoSource.close();
    audioSource?.close();
    onProgress(1, 'Yakunlanmoqda');
    await output.finalize();
    failed = false;
  } finally {
    if (failed) { try { await output.cancel(); } catch { /* the output may not have started */ } }
    for (const s of streams.values()) await s.close();
    for (const i of inputs.values()) i.dispose();
    mixer.dispose();
    scenes.dispose();
    comp.dispose();
    try { await wake?.release(); } catch { /* released by the system already */ }
  }

  const file: Blob = fileHandle ? await fileHandle.getFile() : new Blob([(target as BufferTarget).buffer!], { type: 'video/mp4' });
  const safe = project.name.replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'video';
  return { file, name: `${safe}-${Date.now().toString(36)}.mp4`, duration, width: w, height: h, size: file.size, codec, seconds: (performance.now() - began) / 1000 };
}
