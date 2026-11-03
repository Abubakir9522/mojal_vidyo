import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny';
import type { MediaAsset, Project } from './types';
import { clipDuration, envelope, layoutMain, projectDuration } from './timeline';

export const SAMPLE_RATE = 48000;

/** One stretch of a source's audio placed on the timeline. */
export interface AudioSegment {
  mediaId: string; start: number; len: number; srcStart: number; rate: number;
  volume: number; fadeIn: number; fadeOut: number;
}

/** Flattens all clips with sound into timeline segments. Preview and export share this logic. */
export function audioSegments(p: Project, assetOf: (id: string) => MediaAsset | undefined): AudioSegment[] {
  const out: AudioSegment[] = [];
  const total = projectDuration(p);
  for (const pl of layoutMain(p)) {
    const c = pl.clip;
    if (c.kind !== 'video' || c.muted || c.volume <= 0 || !c.mediaId || !assetOf(c.mediaId)?.hasAudio) continue;
    out.push({ mediaId: c.mediaId, start: pl.start, len: pl.end - pl.start, srcStart: c.in, rate: c.speed, volume: c.volume, fadeIn: Math.max(c.fadeIn, pl.trIn), fadeOut: Math.max(c.fadeOut, pl.trOut) });
  }
  for (const c of p.overlays) {
    if (c.kind !== 'video' || c.muted || c.volume <= 0 || !c.mediaId || !assetOf(c.mediaId)?.hasAudio) continue;
    out.push({ mediaId: c.mediaId, start: c.start, len: clipDuration(c), srcStart: c.in, rate: c.speed, volume: c.volume, fadeIn: c.fadeIn, fadeOut: c.fadeOut });
  }
  for (const a of p.audio) {
    if (a.muted || a.volume <= 0 || a.start >= total) continue;
    const span = a.out - a.in;
    if (span <= 0) continue;
    const end = a.loop ? total : Math.min(total, a.start + span);
    for (let cur = a.start, n = 0; cur < end - 1e-3 && n < 500; n++) {
      const len = Math.min(span, end - cur);
      const first = cur === a.start, last = cur + len >= end - 1e-3;
      out.push({ mediaId: a.mediaId, start: cur, len, srcStart: a.in, rate: 1, volume: a.volume, fadeIn: first ? a.fadeIn : 0, fadeOut: last ? a.fadeOut : 0 });
      cur += len;
    }
  }
  return out;
}

type BlobOf = (id: string) => Promise<Blob>;

/** Decodes and mixes the timeline window [w0, w1) to a stereo AudioBuffer, with no sound if nothing plays there. */
export class AudioMixer {
  private inputs = new Map<string, { input: Input; sink: AudioBufferSink | null }>();
  constructor(private segments: AudioSegment[], private blobOf: BlobOf) {}

  get hasAudio() { return this.segments.length > 0; }

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
