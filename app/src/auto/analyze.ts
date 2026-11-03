import { ALL_FORMATS, AudioBufferSink, BlobSource, CanvasSink, Input } from 'mediabunny';
import type { Adjust } from '../engine/types';
import { NO_ADJUST } from '../engine/types';

export interface VideoScore { t: number; score: number }

function stats(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const d = ctx.getImageData(0, 0, w, h).data;
  let sum = 0, sumR = 0, sumB = 0, sat = 0, minL = 255, maxL = 0, grad = 0;
  const lums = new Float32Array(w * h);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    lums[p] = l;
    sum += l; sumR += r; sumB += b;
    sat += Math.max(r, g, b) - Math.min(r, g, b);
    if (l < minL) minL = l; if (l > maxL) maxL = l;
    if (p > 0 && p % w) grad += Math.abs(l - lums[p - 1]);
  }
  const n = w * h;
  return { lum: sum / n, r: sumR / n, b: sumB / n, sat: sat / n, min: minL, max: maxL, sharp: grad / n, lums };
}

/** Scores a video once per second on motion, sharpness and exposure, to pick its best moments. */
export async function scoreVideo(blob: Blob, duration: number): Promise<VideoScore[]> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) return [];
    const W = 48, H = 48;
    const sink = new CanvasSink(track, { width: W, height: H, fit: 'fill' });
    const step = Math.max(0.5, duration / 60);
    const stamps: number[] = [];
    for (let t = 0; t < duration; t += step) stamps.push(t);
    const out: VideoScore[] = [];
    const cnv = document.createElement('canvas'); cnv.width = W; cnv.height = H;
    const ctx = cnv.getContext('2d', { willReadFrequently: true })!;
    let prev: Float32Array | null = null, i = 0;
    for await (const r of sink.canvasesAtTimestamps(stamps)) {
      const t = stamps[i++];
      if (!r) continue;
      ctx.drawImage(r.canvas as HTMLCanvasElement, 0, 0);
      const s = stats(ctx, W, H);
      let motion = 0;
      if (prev) { for (let k = 0; k < s.lums.length; k++) motion += Math.abs(s.lums[k] - prev[k]); motion /= s.lums.length; }
      prev = s.lums;
      const exposure = 1 - Math.min(1, Math.abs(s.lum - 120) / 120);
      out.push({ t, score: Math.min(1, motion / 22) * 0.5 + Math.min(1, s.sharp / 16) * 0.3 + exposure * 0.2 });
    }
    return out;
  } finally { input.dispose(); }
}

/** Picks non-overlapping windows with the highest scores, returned in time order. */
export function pickHighlights(scores: VideoScore[], duration: number, want: number, windowLen: number): number[] {
  if (duration <= windowLen || !scores.length) return Array.from({ length: Math.max(1, want) }, (_, i) => Math.max(0, Math.min(duration - windowLen, (duration / Math.max(1, want)) * i)));
  const ranked = [...scores].sort((a, b) => b.score - a.score);
  const picks: number[] = [];
  for (const s of ranked) {
    const start = Math.max(0, Math.min(duration - windowLen, s.t - windowLen * 0.3));
    if (picks.every(p => Math.abs(p - start) >= windowLen)) picks.push(start);
    if (picks.length >= want) break;
  }
  return picks.sort((a, b) => a - b);
}

/** Works out a colour correction from a frame's exposure, contrast, saturation and colour cast. */
export function autoColorFrom(source: CanvasImageSource, w: number, h: number): Adjust {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(source, 0, 0, 64, 64);
  void w; void h;
  const s = stats(x, 64, 64);
  const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));
  return {
    ...NO_ADJUST,
    brightness: +clamp((122 - s.lum) / 255 * 1.1, 0.3).toFixed(3),
    contrast: +clamp((175 - (s.max - s.min)) / 255 * 0.8, 0.3).toFixed(3),
    saturation: +clamp((62 - s.sat) / 150, 0.3).toFixed(3),
    temperature: +clamp((s.b - s.r) / 255 * 1.1, 0.4).toFixed(3),
  };
}

/** Measures a source's overall loudness (RMS) so clips can be levelled against each other. */
export async function measureLoudness(blob: Blob, from: number, to: number): Promise<number> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track || !(await track.canDecode())) return 0;
    const sink = new AudioBufferSink(track);
    let sum = 0, n = 0;
    for await (const { buffer } of sink.buffers(from, Math.min(to, from + 30))) {
      const d = buffer.getChannelData(0);
      for (let i = 0; i < d.length; i += 16) { sum += d[i] * d[i]; n++; }
    }
    return n ? Math.sqrt(sum / n) : 0;
  } finally { input.dispose(); }
}
