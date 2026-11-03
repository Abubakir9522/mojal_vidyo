export type AspectId = '9:16' | '16:9' | '1:1' | '4:5' | '3:4';
export const ASPECTS: Record<AspectId, { w: number; h: number; label: string }> = {
  '9:16': { w: 1080, h: 1920, label: 'TikTok, Reels' },
  '16:9': { w: 1920, h: 1080, label: 'YouTube' },
  '1:1': { w: 1080, h: 1080, label: 'Kvadrat' },
  '4:5': { w: 1080, h: 1350, label: 'Instagram post' },
  '3:4': { w: 1080, h: 1440, label: 'Portret' },
};

export type MediaKind = 'video' | 'image' | 'audio';

export interface MediaAsset {
  id: string;
  name: string;
  kind: MediaKind;
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  thumb?: string;
  /** Normalised loudness peaks (0..1) used to draw the audio waveform. */
  peaks?: number[];
  size?: number;
  createdAt: number;
}

export interface FxRef { id: string; amount: number }

export interface Adjust {
  brightness: number; contrast: number; saturation: number;
  temperature: number; tint: number; vignette: number; sharpen: number; fade: number;
}
export const NO_ADJUST: Adjust = { brightness: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, vignette: 0, sharpen: 0, fade: 0 };

export interface Transform {
  x: number; y: number; scale: number; rotation: number;
  flipH: boolean; flipV: boolean; opacity: number; fit: 'cover' | 'contain';
}
export const NO_TRANSFORM: Transform = { x: 0, y: 0, scale: 1, rotation: 0, flipH: false, flipV: false, opacity: 1, fit: 'cover' };

export type ClipKind = 'video' | 'image' | 'scene3d' | 'color';

export interface SceneParams {
  text?: string; sub?: string;
  colors?: string[];
  mediaIds?: string[];
}

export interface Clip {
  id: string;
  kind: ClipKind;
  mediaId?: string;
  scene?: string;
  sceneParams?: SceneParams;
  color?: string;
  /** Source window in seconds, video only. */
  in: number; out: number;
  /** Timeline length in seconds for image, scene3d and color clips. */
  duration: number;
  speed: number;
  volume: number; muted: boolean;
  fadeIn: number; fadeOut: number;
  effects: FxRef[];
  adjust: Adjust;
  transform: Transform;
  motion: string;
  /** Transition played from this clip into the next one. */
  transition: { id: string; duration: number } | null;
}

export interface OverlayClip extends Clip { start: number; blend: 'normal' | 'screen' | 'multiply' | 'add' }

export type TextAnim = 'none' | 'fade' | 'pop' | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight' | 'zoom' | 'type' | 'bounce' | 'blur' | 'wave' | 'flip' | 'spin' | 'letters';
export type TextLoop = 'none' | 'pulse' | 'shake' | 'float' | 'glow' | 'wiggle';

export interface TextClip {
  id: string; start: number; duration: number;
  text: string;
  sticker?: boolean;
  font: string; size: number; weight: number;
  color: string; gradient?: string[];
  stroke: string; strokeWidth: number;
  shadow: boolean; bg: string;
  align: 'left' | 'center' | 'right';
  x: number; y: number; rotation: number; scale: number; letterSpacing: number;
  animIn: TextAnim; animOut: TextAnim; loop: TextLoop;
}

export interface AudioClip {
  id: string; mediaId: string; name: string;
  start: number; in: number; out: number;
  volume: number; fadeIn: number; fadeOut: number; loop: boolean; muted: boolean;
  /** Beat positions, in seconds of the source, shown as marks on the timeline. */
  beats?: number[];
  kind: 'music' | 'sfx' | 'voice';
}

export interface Project {
  id: string; name: string;
  createdAt: number; updatedAt: number;
  aspect: AspectId; fps: number;
  background: string;
  main: Clip[]; overlays: OverlayClip[]; texts: TextClip[]; audio: AudioClip[];
  thumb?: string;
  templateId?: string;
  cloudVersion?: number;
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);

export function newClip(partial: Partial<Clip> & { kind: ClipKind }): Clip {
  return {
    id: uid(), in: 0, out: 0, duration: 3, speed: 1, volume: 1, muted: false, fadeIn: 0, fadeOut: 0,
    effects: [], adjust: { ...NO_ADJUST }, transform: { ...NO_TRANSFORM }, motion: 'none', transition: null,
    ...partial,
  };
}

export function newProject(aspect: AspectId = '9:16', name = 'Yangi loyiha'): Project {
  const now = Date.now();
  return { id: uid(), name, createdAt: now, updatedAt: now, aspect, fps: 30, background: '#000000', main: [], overlays: [], texts: [], audio: [] };
}

export function newText(partial: Partial<TextClip> = {}): TextClip {
  return {
    id: uid(), start: 0, duration: 3, text: 'Matn', font: 'Montserrat', size: 7, weight: 800,
    color: '#ffffff', stroke: '#000000', strokeWidth: 0, shadow: true, bg: '', align: 'center',
    x: 0.5, y: 0.5, rotation: 0, scale: 1, letterSpacing: 0, animIn: 'fade', animOut: 'fade', loop: 'none', ...partial,
  };
}
