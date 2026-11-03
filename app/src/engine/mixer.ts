import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny';
import type { MediaAsset, Project } from './types';
import { clipDuration, envelope, hasRamp, layoutMain, projectDuration } from './timeline';
import { denoise, stretch, voiceEffect } from './dsp';

export const SAMPLE_RATE = 48000;

/** One stretch of a source's audio placed on the timeline. */
export interface AudioSegment {
  mediaId: string; start: number; len: number; srcStart: number; rate: number;
  volume: number; fadeIn: number; fadeOut: number;
  /** Rendered through the audio tools first: pitch-kept speed, noise reduction, voice effects. */
  process?: { keepPitch: boolean; denoise: boolean; voice: string };
}

/** Flattens all clips with sound into timeline segments. Preview and export share this logic. */
export function audioSegments(p: Project, assetOf: (id: string) => MediaAsset | undefined): AudioSegment[] {
  const out: AudioSegment[] = [];
  const total = projectDuration(p);
  for (const pl of layoutMain(p)) {
    const c = pl.clip;
    if (c.kind !== 'video' || c.muted || hasRamp(c) || c.volume <= 0 || !c.mediaId || !assetOf(c.mediaId)?.hasAudio) continue;
    out.push({ mediaId: c.mediaId, start: pl.start, len: pl.end - pl.start, srcStart: c.in, rate: c.speed, volume: c.volume, fadeIn: Math.max(c.fadeIn, pl.trIn), fadeOut: Math.max(c.fadeOut, pl.trOut), process: processOf(c) });
  }
  for (const c of p.overlays) {
    if (c.kind !== 'video' || c.muted || hasRamp(c) || c.volume <= 0 || !c.mediaId || !assetOf(c.mediaId)?.hasAudio) continue;
    out.push({ mediaId: c.mediaId, start: c.start, len: clipDuration(c), srcStart: c.in, rate: c.speed, volume: c.volume, fadeIn: c.fadeIn, fadeOut: c.fadeOut, process: processOf(c) });
  }
  for (const a of p.audio) {
    if (a.muted || a.volume <= 0 || a.start >= total) continue;
    const span = a.out - a.in;
    if (span <= 0) continue;
    const end = a.loop ? total : Math.min(total, a.start + span);
    for (let cur = a.start, n = 0; cur < end - 1e-3 && n < 500; n++) {
      const len = Math.min(span, end - cur);
      const first = cur === a.start, last = cur + len >= end - 1e-3;
      out.push({ mediaId: a.mediaId, start: cur, len, srcStart: a.in, rate: 1, volume: a.volume, fadeIn: first ? a.fadeIn : 0, fadeOut: last ? a.fadeOut : 0, process: a.denoise || (a.voice && a.voice !== 'none') ? { keepPitch: true, denoise: !!a.denoise, voice: a.voice ?? 'none' } : undefined });
      cur += len;
    }
  }
  return out;
}

function processOf(c: { speed: number; keepPitch?: boolean; denoise?: boolean; voice?: string }) {
  const keepPitch = c.keepPitch !== false && c.speed !== 1;
  const voice = c.voice ?? 'none';
  return keepPitch || c.denoise || voice !== 'none' ? { keepPitch, denoise: !!c.denoise, voice } : undefined;
}

type BlobOf = (id: string) => Promise<Blob>;

/** Decodes and mixes the timeline window [w0, w1) to a stereo AudioBuffer, with no sound if nothing plays there. */
export class AudioMixer {
  private inputs = new Map<string, { input: Input; sink: AudioBufferSink | null }>();
  constructor(private segments: AudioSegment[], private blobOf: BlobOf) {}

  get hasAudio() { return this.segments.length > 0; }

  private rendered = new Map<AudioSegment, AudioBuffer>();
  /** Runs one clip's sound through the audio tools once. Export then plays the result at normal speed. */
  private async renderSegment(s: AudioSegment, sink: AudioBufferSink) {
    const hit = this.rendered.get(s);
    if (hit) return hit;
    const srcEnd = s.srcStart + s.len * s.rate;
    const parts: AudioBuffer[] = [];
    for await (const b of sink.buffers(s.srcStart, srcEnd)) parts.push(b.buffer);
    const sr = parts[0]?.sampleRate ?? SAMPLE_RATE;
    const chs = parts[0]?.numberOfChannels ?? 1;
    const frames = Math.round((srcEnd - s.srcStart) * sr);
    const done: Float32Array[] = [];
    for (let c = 0; c < chs; c++) {
      let d = new Float32Array(frames);
      let off = 0;
      for (const p of parts) { const n = Math.min(p.length, frames - off); if (n <= 0) break; d.set(p.getChannelData(c).subarray(0, n), off); off += n; }
      if (s.process!.denoise) d = denoise(d) as typeof d;
      if (s.process!.keepPitch) d = stretch(d, s.rate, sr) as typeof d;
      if (s.process!.voice !== 'none') d = voiceEffect(d, s.process!.voice, sr) as typeof d;
      done.push(d);
    }
    const buf = new AudioBuffer({ length: Math.max(1, done[0].length), numberOfChannels: chs, sampleRate: sr });
    done.forEach((d, c) => buf.copyToChannel(d as Float32Array<ArrayBuffer>, c));
    this.rendered.set(s, buf);
    return buf;
  }

  private async sinkFor(id: string) {
    let e = this.inputs.get(id);
    if (!e) {
      const input = new Input({ source: new BlobSource(await this.blobOf(id)), formats: ALL_FORMATS });
      const track = await input.getPrimaryAudioTrack();
      e = { input, sink: track && (await track.canDecode()) ? new AudioBufferSink(track) : null };
      this.inputs.set(id, e);
    }
    return e.sink;
  }

  async mix(w0: number, w1: number): Promise<AudioBuffer> {
    const frames = Math.max(1, Math.round((w1 - w0) * SAMPLE_RATE));
    const ctx = new OfflineAudioContext(2, frames, SAMPLE_RATE);
    for (const s of this.segments) {
      const end = s.start + s.len;
      if (end <= w0 || s.start >= w1) continue;
      const sink = await this.sinkFor(s.mediaId);
      if (!sink) continue;
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      const stepT = 0.05;
      for (let tt = w0; tt <= w1 + stepT; tt += stepT) {
        const local = tt - s.start;
        const g = local < 0 || local > s.len ? 0 : s.volume * envelope(local, s.len, s.fadeIn, s.fadeOut);
        gain.gain.linearRampToValueAtTime(g, Math.max(0, tt - w0));
      }
      if (s.process) {
        const buf = await this.renderSegment(s, sink);
        const node = ctx.createBufferSource();
        node.buffer = buf;
        // A voice effect on an ordinary-speed clip, or a pitch-kept clip, plays as is. Otherwise the rate stays.
        node.playbackRate.value = s.process.keepPitch ? 1 : s.rate;
        node.connect(gain);
        let when = s.start - w0, offset = 0;
        if (when < 0) { offset = -when * node.playbackRate.value; when = 0; }
        if (offset < buf.duration) node.start(when, offset);
        continue;
      }
      const srcFrom = s.srcStart + Math.max(0, w0 - s.start) * s.rate;
      const srcTo = s.srcStart + (Math.min(w1, end) - s.start) * s.rate;
      for await (const b of sink.buffers(srcFrom, srcTo)) {
        const node = ctx.createBufferSource();
        node.buffer = b.buffer;
        node.playbackRate.value = s.rate;
        node.connect(gain);
        // Where this decoded chunk lands on the timeline, relative to the window.
        let when = s.start + (b.timestamp - s.srcStart) / s.rate - w0;
        let offset = 0;
        if (when < 0) { offset = -when * s.rate; when = 0; }
        if (offset >= b.buffer.duration) continue;
        node.start(when, offset);
      }
    }
    return ctx.startRendering();
  }

  dispose() { for (const e of this.inputs.values()) e.input.dispose(); this.inputs.clear(); }
}
