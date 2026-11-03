import type { AudioClip, Clip, OverlayClip, Project, TextClip } from './types';
import { uid } from './types';

export const clipDuration = (c: Clip) => (c.kind === 'video' ? Math.max(0.04, (c.out - c.in) / c.speed) : c.duration);

export interface Placed { clip: Clip; index: number; start: number; end: number; trIn: number; trOut: number }

/** Clamps a transition so it never eats more than half of either neighbouring clip. */
export function transitionLen(a: Clip, b?: Clip) {
  if (!a.transition || !b) return 0;
  return Math.min(a.transition.duration, clipDuration(a) * 0.5, clipDuration(b) * 0.5);
}

export function layoutMain(p: Project): Placed[] {
  const out: Placed[] = [];
  let cursor = 0, prevTr = 0;
  p.main.forEach((clip, index) => {
    const d = clipDuration(clip);
    const start = cursor - prevTr;
    const end = start + d;
    const trOut = transitionLen(clip, p.main[index + 1]);
    out.push({ clip, index, start, end, trIn: prevTr, trOut });
    cursor = end; prevTr = trOut;
  });
  return out;
}

export function projectDuration(p: Project): number {
  const layout = layoutMain(p);
  let d = layout.length ? layout[layout.length - 1].end : 0;
  for (const o of p.overlays) d = Math.max(d, o.start + clipDuration(o));
  for (const t of p.texts) d = Math.max(d, t.start + t.duration);
  if (d === 0) for (const a of p.audio) d = Math.max(d, a.start + (a.out - a.in));
  return d;
}

export interface ActiveMain { a: Placed; b?: Placed; progress: number }

/** Which clip or clips the main track shows at time t, including the transition progress between them. */
export function activeMain(layout: Placed[], t: number): ActiveMain | null {
  if (!layout.length) return null;
  const last = layout[layout.length - 1];
  if (t >= last.end) t = last.end - 1e-4;
  for (let i = 0; i < layout.length; i++) {
    const a = layout[i], b = layout[i + 1];
    if (t < a.start) continue;
    if (t >= a.end) continue;
    if (b && a.trOut > 0 && t >= b.start) return { a, b, progress: Math.min(1, (t - b.start) / a.trOut) };
    return { a, progress: 0 };
  }
  return { a: layout[0], progress: 0 };
}

/** Speed curves: velocity across the clip, 0..1. The clip keeps its length and its start and end frames. */
const RAMP_V: Record<string, (p: number) => number> = {
  montaj: p => 0.45 + 2.6 * Math.pow(Math.abs(p - 0.5) * 2, 2),
  qahramon: p => 0.22 + 3.2 * Math.pow(Math.abs(p - 0.5) * 2, 3),
  oq: p => (p > 0.3 && p < 0.7 ? 0.12 : 1.5),
  sakrash: p => 0.4 + 2.4 * Math.exp(-Math.pow((p - 0.5) * 5, 2)),
  tezlashish: p => 0.25 + 2.2 * p * p,
  sekinlashish: p => 0.25 + 2.2 * (1 - p) * (1 - p),
};
export const RAMPS = [
  { id: 'none', name: "Yo'q" }, { id: 'montaj', name: 'Montaj' }, { id: 'qahramon', name: 'Qahramon' }, { id: 'oq', name: 'Sekin lahza' },
  { id: 'sakrash', name: 'Tez lahza' }, { id: 'tezlashish', name: 'Tezlashish' }, { id: 'sekinlashish', name: 'Sekinlashish' },
];
const rampTables = new Map<string, Float32Array>();
function rampTable(id: string) {
  let t = rampTables.get(id);
  if (!t) {
    const v = RAMP_V[id];
    t = new Float32Array(129);
    for (let i = 1; i <= 128; i++) t[i] = t[i - 1] + v((i - 0.5) / 128);
    const end = t[128];
    for (let i = 0; i <= 128; i++) t[i] /= end;
    rampTables.set(id, t);
  }
  return t;
}
export const hasRamp = (c: Clip) => c.kind === 'video' && !!c.ramp && c.ramp !== 'none' && !!RAMP_V[c.ramp];

export function sourceTime(c: Clip, local: number) {
  if (!hasRamp(c)) return c.in + local * c.speed;
  const dur = clipDuration(c);
  const x = Math.max(0, Math.min(1, local / dur)) * 128;
  const t = rampTable(c.ramp!);
  const i = Math.min(127, Math.floor(x));
  return c.in + (c.out - c.in) * (t[i] + (t[i + 1] - t[i]) * (x - i));
}

/** Momentary playback rate of a clip, for keeping the preview's video element in step. */
export function sourceRate(c: Clip, local: number) {
  if (!hasRamp(c)) return c.speed;
  const dur = clipDuration(c);
  const x = Math.max(0, Math.min(1, local / dur)) * 128;
  const t = rampTable(c.ramp!);
  const i = Math.min(127, Math.floor(x));
  return Math.max(0.0625, Math.min(16, (t[i + 1] - t[i]) * 128 * ((c.out - c.in) / dur)));
}

/** Every beat of the project's music, in timeline seconds, sorted. Loops repeat their beats. */
export function timelineBeats(p: Project): number[] {
  const out: number[] = [];
  const total = projectDuration(p);
  for (const a of p.audio) {
    if (!a.beats?.length || a.muted) continue;
    const span = a.out - a.in;
    if (span <= 0) continue;
    const inside = a.beats.filter(b => b >= a.in && b < a.out).map(b => b - a.in);
    const end = a.loop ? total : Math.min(total, a.start + span);
    for (let cur = a.start, n = 0; cur < end && n < 500; cur += span, n++) for (const b of inside) { const t = cur + b; if (t < end) out.push(t); }
  }
  return out.sort((x, y) => x - y);
}

export interface BeatPos { pulse: number; index: number; phase: number; period: number }
/** Where t sits between beats. Without any music a steady 120 BPM keeps previews moving. */
export function beatAt(beats: number[], t: number): BeatPos {
  if (beats.length < 2) {
    const period = 0.5, index = Math.floor(t / period), phase = (t % period) / period;
    return { pulse: Math.exp(-phase * 3.2), index, phase, period };
  }
  let lo = 0, hi = beats.length - 1;
  if (t < beats[0]) return { pulse: 0, index: -1, phase: 0, period: beats[1] - beats[0] };
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (beats[m] <= t) lo = m; else hi = m - 1; }
  const period = lo + 1 < beats.length ? beats[lo + 1] - beats[lo] : beats[lo] - beats[lo - 1];
  const since = t - beats[lo];
  return { pulse: Math.exp(-(since / Math.max(0.05, period)) * 3.2), index: lo, phase: Math.min(1, since / Math.max(0.05, period)), period };
}

export const activeOverlays = (p: Project, t: number): OverlayClip[] => p.overlays.filter(o => t >= o.start && t < o.start + clipDuration(o));
export const activeTexts = (p: Project, t: number): TextClip[] => p.texts.filter(x => t >= x.start && t < x.start + x.duration);

export function splitMainAt(p: Project, t: number): boolean {
  const l = layoutMain(p);
  const hit = l.find(x => t > x.start + 0.05 && t < x.end - 0.05);
  if (!hit) return false;
  const local = t - hit.start;
  const c = hit.clip;
  const second: Clip = structuredClone(c);
  second.id = uid();
  // A split would stretch a speed curve across two pieces, so both continue at their average speed.
  if (c.kind === 'video') {
    const cut = sourceTime(c, local);
    if (hasRamp(c)) { c.ramp = 'none'; second.ramp = 'none'; }
    if (c.keyframes?.length) { c.keyframes = c.keyframes.filter(k => k.t <= local); second.keyframes = (second.keyframes ?? []).filter(k => k.t > local).map(k => ({ ...k, t: k.t - local })); }
    second.in = cut; c.out = cut;
      } else {
    if (c.keyframes?.length) { c.keyframes = c.keyframes.filter(k => k.t <= local); second.keyframes = (second.keyframes ?? []).filter(k => k.t > local).map(k => ({ ...k, t: k.t - local })); }
    second.duration = c.duration - local; c.duration = local;
  }
  second.fadeIn = 0; c.fadeOut = 0;
  c.transition = null;
  p.main.splice(hit.index + 1, 0, second);
  return true;
}

export function splitOverlayAt(p: Project, id: string, t: number): boolean {
  const i = p.overlays.findIndex(o => o.id === id);
  if (i < 0) return false;
  const c = p.overlays[i];
  const d = clipDuration(c);
  if (t <= c.start + 0.05 || t >= c.start + d - 0.05) return false;
  const local = t - c.start;
  const second: OverlayClip = structuredClone(c);
  second.id = uid(); second.start = t;
  if (c.kind === 'video') { const cut = c.in + local * c.speed; second.in = cut; c.out = cut; }
  else { second.duration = d - local; c.duration = local; }
  p.overlays.splice(i + 1, 0, second);
  return true;
}

export function splitAudioAt(p: Project, id: string, t: number): boolean {
  const i = p.audio.findIndex(a => a.id === id);
  if (i < 0) return false;
  const c = p.audio[i];
  if (t <= c.start + 0.05 || t >= c.start + (c.out - c.in) - 0.05) return false;
  const local = t - c.start;
  const second: AudioClip = { ...structuredClone(c), id: uid(), start: t, in: c.in + local };
  c.out = c.in + local;
  c.fadeOut = 0; second.fadeIn = 0;
  p.audio.splice(i + 1, 0, second);
  return true;
}

export function splitTextAt(p: Project, id: string, t: number): boolean {
  const i = p.texts.findIndex(x => x.id === id);
  if (i < 0) return false;
  const c = p.texts[i];
  if (t <= c.start + 0.05 || t >= c.start + c.duration - 0.05) return false;
  const second: TextClip = { ...structuredClone(c), id: uid(), start: t, duration: c.start + c.duration - t };
  c.duration = t - c.start;
  p.texts.splice(i + 1, 0, second);
  return true;
}

/** Gain for an audio envelope at local time, given the clip length and fades. */
export function envelope(local: number, len: number, fadeIn: number, fadeOut: number) {
  let g = 1;
  if (fadeIn > 0 && local < fadeIn) g *= Math.max(0, local / fadeIn);
  if (fadeOut > 0 && local > len - fadeOut) g *= Math.max(0, (len - local) / fadeOut);
  return g;
}

/** A clip's framing at a moment: the transform, or the blend between the keyframes around it. */
export function keyframedValues<K extends { t: number; x: number; y: number; scale: number; rotation: number; opacity: number }>(frames: K[] | undefined, local: number) {
  if (!frames?.length) return null;
  const list = frames;
  if (local <= list[0].t) return list[0];
  const last = list[list.length - 1];
  if (local >= last.t) return last;
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i], b = list[i + 1];
    if (local >= a.t && local <= b.t) {
      const r = (local - a.t) / Math.max(1e-4, b.t - a.t), e = r * r * (3 - 2 * r);
      const m = (x: number, y: number) => x + (y - x) * e;
      return { t: local, x: m(a.x, b.x), y: m(a.y, b.y), scale: m(a.scale, b.scale), rotation: m(a.rotation, b.rotation), opacity: m(a.opacity, b.opacity) };
    }
  }
  return last;
}

/** Keeps every clip in a project valid after edits, and strips transitions from the last clip. */
export function normalize(p: Project) {
  p.main.forEach((c, i) => {
    if (i === p.main.length - 1) c.transition = null;
  });
  p.updatedAt = Date.now();
}
