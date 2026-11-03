import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny';
import type { Project } from '../engine/types';
import { fftReal } from '../engine/dsp';
import { kv } from '../store/db';

export const BANDS = 16;
export const SPEC_FPS = 20;

const memory = new Map<string, Uint8Array>();
const pending = new Map<string, Promise<Uint8Array | null>>();

/** Frequency bands of a whole song, 20 times a second, kept on the device once worked out. */
async function compute(blob: Blob): Promise<Uint8Array> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) return new Uint8Array(0);
    const N = 1024;
    const win = new Float32Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
    const frames: number[][] = [];
    const ring = new Float32Array(N);
    let filled = 0, sinceHop = 0, hop = 2205, sr = 44100;
    const re = new Float32Array(N), im = new Float32Array(N);
    let edges: number[] = [];
    let bandMax = 0.001;
    for await (const { buffer } of new AudioBufferSink(track).buffers()) {
      if (sr !== buffer.sampleRate || !edges.length) {
        sr = buffer.sampleRate; hop = Math.round(sr / SPEC_FPS);
        edges = Array.from({ length: BANDS + 1 }, (_, i) => Math.max(1, Math.round(((40 * Math.pow(12000 / 40, i / BANDS)) / sr) * N)));
      }
      const ch = buffer.getChannelData(0);
      for (let i = 0; i < ch.length; i++) {
        ring.copyWithin(0, 1); ring[N - 1] = ch[i];
        if (filled < N) filled++;
        if (++sinceHop >= hop && filled >= N) {
          sinceHop = 0;
          for (let k = 0; k < N; k++) { re[k] = ring[k] * win[k]; im[k] = 0; }
          fftReal(re, im);
          const row: number[] = [];
          for (let b = 0; b < BANDS; b++) {
            let s = 0;
            const lo = edges[b], hi = Math.max(lo + 1, edges[b + 1]);
            for (let k = lo; k < hi && k < N / 2; k++) s += re[k] * re[k] + im[k] * im[k];
            const v = Math.pow(s / (hi - lo), 0.25) * (1 + b * 0.09);
            row.push(v);
            if (v > bandMax) bandMax = v;
          }
          frames.push(row);
        }
      }
    }
    const out = new Uint8Array(frames.length * BANDS);
    frames.forEach((r, i) => r.forEach((v, b) => { out[i * BANDS + b] = Math.round(Math.min(1, v / bandMax) * 255); }));
    return out;
  } finally { input.dispose(); }
}

export function loadSpectrum(mediaId: string, blob: () => Promise<Blob>): Promise<Uint8Array | null> {
  const hit = memory.get(mediaId);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(mediaId);
  if (!p) {
    p = (async () => {
      let d = await kv.get<Uint8Array>(`spec:${mediaId}`);
      if (!d) { d = await compute(await blob()); await kv.set(`spec:${mediaId}`, d); }
      memory.set(mediaId, d);
      return d;
    })().catch(() => null).finally(() => pending.delete(mediaId));
    pending.set(mediaId, p);
  }
  return p;
}

const row = new Uint8Array(BANDS);
/** The bands playing at timeline time t, from the first active song with analysis ready. */
export function spectrumFor(p: Project, t: number): Uint8Array | null {
  for (const a of p.audio) {
    const data = memory.get(a.mediaId);
    if (!data || a.muted) continue;
    const span = a.out - a.in;
    if (span <= 0 || t < a.start) continue;
    const local = t - a.start;
    if (!a.loop && local >= span) continue;
    const src = a.in + (a.loop ? local % span : local);
    const i = Math.floor(src * SPEC_FPS);
    if ((i + 1) * BANDS > data.length) continue;
    row.set(data.subarray(i * BANDS, (i + 1) * BANDS));
    return row;
  }
  return null;
}
