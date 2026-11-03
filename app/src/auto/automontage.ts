import type { AspectId, AudioClip, Clip, MediaAsset, Project } from '../engine/types';
import { newClip, newProject, newText, uid } from '../engine/types';
import { clipDuration, layoutMain, projectDuration } from '../engine/timeline';
import { getBlob, getImage } from '../store/media';
import { BeatInfo, detectBeats } from './beat';
import { autoColorFrom, measureLoudness, pickHighlights, scoreVideo } from './analyze';

export interface AutoStyle {
  id: string; name: string; hint: string;
  beatsPerCut: number[]; fallbackCut: number;
  filters: string[]; effects: string[]; transitions: string[]; transitionLen: number;
  motions: string[]; intro?: string; outro?: string; titleFont: string; music: string;
}

export const AUTO_STYLES: AutoStyle[] = [
  { id: 'dinamik', name: 'Dinamik', hint: 'Tez kesishlar va zarbalar', beatsPerCut: [2, 2, 4], fallbackCut: 1.1, filters: ['f_vivid'], effects: ['m_beat', '', 'm_zoompulse', ''], transitions: ['t_zoomIn', 't_whipL', 't_flash'], transitionLen: 0.22, motions: ['zoomInFast', 'drop', 'pulse'], music: 'kuch', titleFont: 'Russo One' },
  { id: 'kino', name: 'Kinematografik', hint: 'Sekin, kino ranglari', beatsPerCut: [8, 8], fallbackCut: 3.2, filters: ['f_teal'], effects: ['l_vignette'], transitions: ['t_fade', 't_cloud', 't_black'], transitionLen: 0.8, motions: ['zoomIn', 'panLeft', 'slowRotate'], intro: 'ringTunnel', music: 'kino', titleFont: 'Playfair Display' },
  { id: 'romantik', name: 'Romantik', hint: "Iliq ranglar, to'y va oila", beatsPerCut: [4, 8], fallbackCut: 2.8, filters: ['f_rose'], effects: ['l_bokeh', '', 'l_leak'], transitions: ['t_fade', 't_heart', 't_light'], transitionLen: 0.8, motions: ['zoomIn', 'zoomOut'], music: 'sokin', titleFont: 'Pacifico' },
  { id: 'reklama', name: 'Reklama', hint: "Do'kon va mahsulotlar uchun", beatsPerCut: [4, 2, 2], fallbackCut: 1.8, filters: ['f_clean'], effects: ['', 'l_flare'], transitions: ['t_slideL', 't_flipY', 't_cubeL'], transitionLen: 0.4, motions: ['zoomIn', 'tiltLeft', 'tiltRight'], intro: 'podium', outro: 'logoSpin', music: 'kuch', titleFont: 'Oswald' },
  { id: 'sayohat', name: 'Sayohat', hint: 'Keng kadrlar va tabiat', beatsPerCut: [4], fallbackCut: 2.4, filters: ['f_chimyon'], effects: ['', 'l_rays'], transitions: ['t_whipL', 't_light', 't_slideL'], transitionLen: 0.45, motions: ['panLeft', 'panRight', 'diagonal'], intro: 'waves', music: 'ufq', titleFont: 'Lobster' },
  { id: 'vlog', name: 'Vlog', hint: 'Tabiiy va yengil', beatsPerCut: [4, 2], fallbackCut: 2, filters: ['f_film'], effects: [''], transitions: ['t_slideL', 't_fade'], transitionLen: 0.3, motions: ['handheld', 'zoomIn'], music: 'yengil', titleFont: 'Caveat' },
  { id: 'd3', name: '3D', hint: 'Hajmli harakat va 3D sahnalar', beatsPerCut: [4], fallbackCut: 2.2, filters: ['f_cyber'], effects: ['', 'x_depth'], transitions: ['t_cubeL', 't_flipY', 't_door3d', 't_perspective', 't_cards'], transitionLen: 0.6, motions: ['tiltLeft', 'tiltRight', 'fly3d', 'orbit3d'], intro: 'cubePhotos', outro: 'galaxy', music: 'ritm', titleFont: 'Russo One' },
];

export interface AutoOptions {
  media: MediaAsset[];
  music?: MediaAsset | null;
  style: AutoStyle;
  aspect: AspectId;
  /** Desired length in seconds. Zero follows the amount of material. */
  length: number;
  title?: string;
  autoColor: boolean;
}

export type Progress = (p: number, msg: string) => void;

function shuffleRepeat<T>(items: T[], n: number): T[] {
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(items[i % items.length]);
  return out;
}

/**
 * Builds a finished edit from raw files: picks each video's best moments, cuts on the song's
 * beats, grades colour and adds transitions, effects and titles. Everything runs on the device.
 */
export async function autoMontage(o: AutoOptions, onProgress: Progress = () => {}): Promise<Project> {
  const p = newProject(o.aspect, o.title?.trim() || `Avto montaj: ${o.style.name}`);
  const visual = o.media.filter(m => m.kind !== 'audio');
  if (!visual.length) throw new Error('Kamida bitta rasm yoki vidyo tanlang.');

  let beat: BeatInfo | null = null;
  if (o.music) {
    onProgress(0.05, 'Qo\'shiq ritmi aniqlanmoqda');
    try { beat = await detectBeats(await getBlob(o.music)); } catch { beat = null; }
    if (beat && beat.beats.length < 4) beat = null;
  }

  // Cut lengths come from the beat grid when there is a song, from the style otherwise.
  const totalVideo = visual.filter(m => m.kind === 'video').reduce((s, m) => s + m.duration, 0);
  const images = visual.filter(m => m.kind === 'image').length;
  const defaultLen = Math.min(90, Math.max(12, totalVideo * 0.55 + images * o.style.fallbackCut));
  const wantLen = o.length > 0 ? o.length : Math.min(defaultLen, o.music ? o.music.duration : Infinity);
  const cuts: number[] = [];
  const beatTimes: number[] = [];
  if (beat) {
    let i = 0, n = 0, acc = 0;
    while (i < beat.beats.length - 1 && acc < wantLen) {
      const step = o.style.beatsPerCut[n % o.style.beatsPerCut.length];
      const j = Math.min(beat.beats.length - 1, i + step);
      const d = beat.beats[j] - beat.beats[i];
      if (d <= 0) break;
      beatTimes.push(beat.beats[i]);
      cuts.push(d); acc += d; i = j; n++;
    }
  } else {
    let acc = 0, n = 0;
    while (acc < wantLen) { const d = o.style.fallbackCut * (n % 3 === 2 ? 1.3 : 1); cuts.push(d); acc += d; n++; }
  }
  if (cuts.length === 0) cuts.push(o.style.fallbackCut);

  // Each video gets slots in proportion to its length, then fills them with its best moments.
  const slots = shuffleRepeat(visual, cuts.length);
  const needByMedia = new Map<string, number[]>();
  slots.forEach((m, i) => { if (m.kind === 'video') { const l = needByMedia.get(m.id) ?? []; l.push(cuts[i]); needByMedia.set(m.id, l); } });
  const momentsFor = new Map<string, number[]>();
  let done = 0;
  for (const m of visual) {
    if (m.kind !== 'video') continue;
    onProgress(0.1 + 0.6 * (done++ / Math.max(1, visual.length)), `${m.name} ko'rib chiqilmoqda`);
    const needs = needByMedia.get(m.id) ?? [];
    const windowLen = Math.max(...needs, 0.5);
    let scores: Awaited<ReturnType<typeof scoreVideo>> = [];
    try { scores = await scoreVideo(await getBlob(m), m.duration); } catch { /* falls back to evenly spaced moments */ }
    const picks = pickHighlights(scores, m.duration, needs.length, windowLen);
    momentsFor.set(m.id, picks);
  }

  onProgress(0.75, 'Montaj yig\'ilmoqda');
  const clips: Clip[] = [];
  const used = new Map<string, number>();
  const groupStart = beat ? beatTimes[0] ?? 0 : 0;
  let introDur = 0;
  const imageIds = visual.filter(m => m.kind === 'image').map(m => m.id);
  if (o.style.intro) {
    introDur = 2.6;
    clips.push(newClip({ kind: 'scene3d', scene: o.style.intro, duration: introDur, sceneParams: { ...(o.title ? { text: o.title.toUpperCase(), sub: '' } : {}), mediaIds: imageIds } }));
  }
  slots.forEach((m, i) => {
    const len = cuts[i];
    const effectId = o.style.effects[i % o.style.effects.length];
    const effects = [...o.style.filters.map(id => ({ id, amount: 0.85 })), ...(effectId ? [{ id: effectId, amount: 0.7 }] : [])];
    const motion = o.style.motions[i % o.style.motions.length];
    if (m.kind === 'video') {
      const list = momentsFor.get(m.id) ?? [0];
      const k = used.get(m.id) ?? 0;
      used.set(m.id, k + 1);
      const from = list[k % list.length] ?? 0;
      clips.push(newClip({ kind: 'video', mediaId: m.id, in: from, out: Math.min(m.duration, from + len), effects, motion: motion === 'zoomInFast' ? 'zoomIn' : motion, muted: !!o.music }));
    } else {
      clips.push(newClip({ kind: 'image', mediaId: m.id, duration: len, effects, motion }));
    }
  });
  if (o.style.outro) clips.push(newClip({ kind: 'scene3d', scene: o.style.outro, duration: 2.6, sceneParams: { ...(o.title ? { text: o.title.toUpperCase(), sub: '' } : {}) } }));
  // Clips stay on the beat because a cut's transition extends the clip by exactly its overlap.
  clips.forEach((c, i) => {
    if (i < clips.length - 1) {
      const tl = o.style.transitionLen;
      c.transition = { id: o.style.transitions[i % o.style.transitions.length], duration: tl };
      const room = Math.min(clipDuration(c), clips[i + 1].kind === 'video' ? 99 : clips[i + 1].duration) / 2;
      const real = Math.min(tl, room);
      if (c.kind === 'video') {
        const m = visual.find(x => x.id === c.mediaId);
        const extra = Math.min(real * c.speed, (m?.duration ?? c.out) - c.out);
        c.out += Math.max(0, extra);
      } else if (c.kind === 'image') c.duration += real;
    }
  });
  p.main = clips;

  if (o.title?.trim() && !o.style.intro) {
    p.texts.push(newText({ text: o.title.trim(), start: 0.2, duration: 2.6, font: o.style.titleFont, weight: ['Oswald', 'Playfair Display', 'Caveat'].includes(o.style.titleFont) ? 700 : 400, size: 8, y: 0.5, animIn: 'pop' }));
  }

  if (o.music) {
    const a: AudioClip = { id: uid(), mediaId: o.music.id, name: o.music.name, start: Math.max(0, introDur - 0.3), in: Math.max(0, groupStart), out: o.music.duration, volume: 0.9, fadeIn: 0.2, fadeOut: 1.2, loop: false, muted: false, kind: 'music', beats: beat?.strong };
    p.audio.push(a);
  }

  if (o.autoColor) {
    onProgress(0.88, 'Ranglar sozlanmoqda');
    await autoColorProject(p);
  }
  onProgress(1, 'Tayyor');
  return p;
}

/** Corrects exposure, contrast, saturation and colour cast of each clip from a sample frame. */
export async function autoColorProject(p: Project) {
  const cache = new Map<string, ReturnType<typeof autoColorFrom>>();
  for (const c of [...p.main, ...p.overlays]) {
    if (!c.mediaId || (c.kind !== 'image' && c.kind !== 'video')) continue;
    const key = c.mediaId + (c.kind === 'video' ? `@${Math.round(c.in)}` : '');
    let adj = cache.get(key);
    if (!adj) {
      try {
        if (c.kind === 'image') {
          const b = await getImage(c.mediaId);
          if (b) adj = autoColorFrom(b, b.width, b.height);
        } else {
          const frame = await grabVideoFrame(c.mediaId, c.in + (c.out - c.in) / 2);
          if (frame) adj = autoColorFrom(frame, frame.width, frame.height);
        }
      } catch { /* a clip that cannot be read keeps its current colours */ }
      if (adj) cache.set(key, adj);
    }
    if (adj) c.adjust = { ...c.adjust, ...adj };
  }
}

async function grabVideoFrame(mediaId: string, t: number): Promise<HTMLCanvasElement | null> {
  const { getAsset } = await import('../store/media');
  const a = await getAsset(mediaId);
  if (!a) return null;
  const { ALL_FORMATS, BlobSource, CanvasSink, Input } = await import('mediabunny');
  const input = new Input({ source: new BlobSource(await getBlob(a)), formats: ALL_FORMATS });
  try {
    const tr = await input.getPrimaryVideoTrack();
    if (!tr || !(await tr.canDecode())) return null;
    const r = await new CanvasSink(tr, { width: 64, height: 64, fit: 'fill' }).getCanvas(t);
    return (r?.canvas as HTMLCanvasElement) ?? null;
  } finally { input.dispose(); }
}

/** Levels speech and clip sound to one loudness, and lowers music while someone is talking. */
export async function autoAudioProject(p: Project, assetOf: (id: string) => MediaAsset | undefined) {
  const TARGET = 0.12;
  let anyVoice = false;
  for (const c of p.main) {
    if (c.kind !== 'video' || c.muted || !c.mediaId) continue;
    const a = assetOf(c.mediaId);
    if (!a?.hasAudio) continue;
    const rms = await measureLoudness(await getBlob(a), c.in, c.out);
    if (rms < 0.004) continue;
    anyVoice = true;
    c.volume = +Math.max(0.2, Math.min(2, TARGET / rms)).toFixed(2);
  }
  for (const m of p.audio) {
    if (m.kind === 'voice') { const a = assetOf(m.mediaId); if (a) { const rms = await measureLoudness(await getBlob(a), m.in, m.out); if (rms > 0.004) { anyVoice = true; m.volume = +Math.max(0.2, Math.min(2, TARGET / rms)).toFixed(2); } } }
  }
  for (const m of p.audio) if (m.kind === 'music') { m.volume = anyVoice ? 0.28 : 0.85; m.fadeIn = Math.max(m.fadeIn, 0.3); m.fadeOut = Math.max(m.fadeOut, 1); }
}

/** Re-times the main track so every cut lands on a beat of the given song. */
export function snapCutsToBeats(p: Project, beats: number[], offset: number, assetOf: (id: string) => MediaAsset | undefined) {
  if (beats.length < 2) return false;
  const timeline = beats.map(b => b + offset).filter(b => b > 0);
  const layout = layoutMain(p);
  let last = 0;
  layout.forEach((pl, i) => {
    if (i === layout.length - 1) return;
    const c = pl.clip;
    const target = last + clipDuration(c);
    let best = timeline[0], bestD = Infinity;
    for (const b of timeline) { if (b <= last + 0.25) continue; const d = Math.abs(b - target); if (d < bestD) { bestD = d; best = b; } }
    if (bestD === Infinity) return;
    const want = Math.max(0.25, best - last);
    if (c.kind === 'video') {
      const dur = assetOf(c.mediaId ?? '')?.duration ?? c.out;
      c.out = Math.min(dur, c.in + want * c.speed);
    } else c.duration = want;
    c.transition = c.transition ? { ...c.transition, duration: Math.min(c.transition.duration, 0.2) } : null;
    last += clipDuration(c) - (c.transition ? Math.min(c.transition.duration, clipDuration(c) / 2) : 0);
  });
  void projectDuration;
  return true;
}
