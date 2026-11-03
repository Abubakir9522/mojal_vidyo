import type { AspectId, AudioClip, Clip, Dance, MediaAsset, Project } from '../engine/types';
import { newClip, newProject, newText, uid } from '../engine/types';
import { getBlob } from '../store/media';
import { detectBeats } from './beat';
import { loadSpectrum } from './spectrum';
import { clipDuration } from '../engine/timeline';

export const VIZ_STYLES = [
  { id: 'bars', name: 'Ustunlar' }, { id: 'mirror', name: "Ikki tomonlama" }, { id: 'circle', name: 'Doira' }, { id: 'line', name: "To'lqin" }, { id: 'dots', name: 'Nuqtalar' },
] as const;
export type VizId = (typeof VIZ_STYLES)[number]['id'];

export const vizLayer = (viz: VizId, duration: number) => newText({
  text: 'Ekvalayzer', viz, start: 0, duration, size: viz === 'circle' ? 16 : 11, x: 0.5, y: viz === 'circle' ? 0.5 : 0.86,
  color: '#ffffff', gradient: ['#f5b301', '#d6246e', '#16a9b8'], shadow: true, animIn: 'none', animOut: 'none',
});

export interface DanceOptions {
  media: MediaAsset[]; music: MediaAsset; musicName?: string; aspect: AspectId;
  style: string; amount: number; beatsPerCut: number; length: number;
  flash: boolean; viz: VizId | null; title?: string; effect?: string;
}

/**
 * Makes photos and clips move to a song. Every cut lands on a beat, and each picture
 * keeps moving to the beats that fall inside it.
 */
export async function danceMontage(o: DanceOptions, onProgress: (p: number, msg: string) => void = () => {}): Promise<Project> {
  const visual = o.media.filter(m => m.kind !== 'audio');
  if (!visual.length) throw new Error('Kamida bitta rasm tanlang.');
  onProgress(0.15, "Qo'shiq ritmi aniqlanmoqda");
  const blob = await getBlob(o.music);
  const info = await detectBeats(blob);
  if (info.beats.length < 4) throw new Error("Bu qo'shiqda ritm topilmadi. Boshqa qo'shiq tanlang.");
  onProgress(0.55, 'Musiqa tahlil qilinmoqda');
  if (o.viz) await loadSpectrum(o.music.id, async () => blob);
  onProgress(0.8, 'Rasmlar joylashtirilmoqda');

  const p = newProject(o.aspect, o.title?.trim() || "Musiqaga o'ynash");
  const offset = info.beats[0];
  const limit = o.length > 0 ? Math.min(o.length, info.duration - offset) : info.duration - offset;
  const dance: Dance = { style: o.style, amount: o.amount, flash: o.flash, fxOnBeat: true };
  const clips: Clip[] = [];
  let i = 0, elapsed = 0, n = 0;
  while (i + o.beatsPerCut < info.beats.length && elapsed < limit) {
    const d = info.beats[i + o.beatsPerCut] - info.beats[i];
    if (d <= 0) break;
    const m = visual[n % visual.length];
    const effects = o.effect ? [{ id: o.effect, amount: 0.8 }] : [];
    if (m.kind === 'video') {
      const uses = Math.ceil(Math.max(1, limit / d) / visual.length);
      const span = Math.max(0, m.duration - d);
      const pass = Math.floor(n / visual.length);
      const from = uses > 1 ? (span * (pass % uses)) / Math.max(1, uses - 1) : 0;
      clips.push(newClip({ kind: 'video', mediaId: m.id, in: from, out: Math.min(m.duration, from + d), muted: true, dance, effects }));
    } else {
      clips.push(newClip({ kind: 'image', mediaId: m.id, duration: d, dance, effects }));
    }
    elapsed += d; i += o.beatsPerCut; n++;
  }
  p.main = clips;
  const total = clips.reduce((s, c) => s + clipDuration(c), 0);
  const a: AudioClip = { id: uid(), mediaId: o.music.id, name: o.musicName ?? o.music.name, start: 0, in: offset, out: Math.min(o.music.duration, offset + total + 0.05), volume: 1, fadeIn: 0, fadeOut: Math.min(1, total / 4), loop: false, muted: false, kind: 'music', beats: info.beats };
  p.audio = [a];
  if (o.viz) p.texts.push(vizLayer(o.viz, total));
  if (o.title?.trim()) p.texts.push(newText({ text: o.title.trim(), start: 0, duration: Math.min(3, total), font: 'Russo One', weight: 400, size: 7.5, y: 0.14, animIn: 'pop', loop: 'pulse' }));
  onProgress(1, 'Tayyor');
  return p;
}

/** Fills in the beats of the project's music, and re-times clips onto them when asked. */
export async function beatsForProject(p: Project, assetOf: (id: string) => MediaAsset | undefined, step = 0) {
  const a = p.audio.find(x => x.kind === 'music') ?? p.audio[0];
  if (!a) return false;
  const asset = assetOf(a.mediaId);
  if (!asset) return false;
  const info = await detectBeats(await getBlob(asset));
  if (info.beats.length < 4) return false;
  a.beats = info.beats;
  if (step > 0) {
    a.in = info.beats[0]; a.start = 0; a.out = asset.duration;
    let i = 0;
    for (const c of p.main) {
      if (c.kind === 'scene3d') continue;
      if (i + step >= info.beats.length) break;
      const d = info.beats[i + step] - info.beats[i];
      if (c.kind === 'video') { const dur = assetOf(c.mediaId ?? '')?.duration ?? c.out; c.out = Math.min(dur, c.in + d * c.speed); } else c.duration = d;
      c.transition = null;
      i += step;
    }
  }
  return true;
}
