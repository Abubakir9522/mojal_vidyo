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

export const sourceTime = (c: Clip, local: number) => c.in + local * c.speed;

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
  if (c.kind === 'video') {
    const cut = c.in + local * c.speed;
    second.in = cut; c.out = cut;
  } else {
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

/** Keeps every clip in a project valid after edits, and strips transitions from the last clip. */
export function normalize(p: Project) {
  p.main.forEach((c, i) => {
    if (i === p.main.length - 1) c.transition = null;
  });
  p.updatedAt = Date.now();
}
