import { Compositor, Frame } from './compositor';
import { Scene3DRenderer } from './scene3d';
import { activeMain, activeOverlays, clipDuration, envelope, hasRamp, layoutMain, projectDuration, sourceRate, sourceTime } from './timeline';
import { loadSpectrum } from '../auto/spectrum';
import { ASPECTS, AudioClip, Clip, MediaAsset, Project } from './types';
import { getAsset, getBlob, getImage } from '../store/media';

interface VideoEntry { el: HTMLVideoElement; url: string; ready: boolean; mediaId: string; seeking: boolean }
interface AudioEntry { el: HTMLAudioElement; url: string; ready: boolean; mediaId: string }

const LONG_SIDE = 960;

/** Real-time preview: keeps media elements in step with a clock and draws through the compositor. */
export class Player {
  comp: Compositor;
  scenes: Scene3DRenderer;
  project: Project;
  t = 0;
  playing = false;
  onTime: (t: number) => void = () => {};
  onEnded: () => void = () => {};
  private raf = 0;
  private lastNow = 0;
  private dirty = true;
  private videos = new Map<string, VideoEntry>();
  private audios = new Map<string, AudioEntry>();
  private images = new Map<string, ImageBitmap>();
  private pendingImages = new Set<string>();
  private readyScenes = new Map<string, string>();
  private pendingScenes = new Set<string>();
  private assets = new Map<string, MediaAsset>();
  private destroyed = false;
  lastError = '';

  constructor(canvas: HTMLCanvasElement, project: Project) {
    this.comp = new Compositor(canvas);
    this.scenes = new Scene3DRenderer(getImage);
    this.project = project;
    this.applySize();
    this.ensureFonts();
    this.ensureSpectrum();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  private applySize() {
    const a = ASPECTS[this.project.aspect];
    const k = LONG_SIDE / Math.max(a.w, a.h);
    this.comp.setSize(a.w * k, a.h * k);
  }

  /** Call after any edit. Redraws the current frame with the new project state. */
  update(p: Project) {
    this.project = p;
    this.applySize();
    this.ensureFonts();
    this.ensureSpectrum();
    const ids = new Set([...p.main, ...p.overlays].map(c => c.id));
    for (const [id, e] of this.videos) if (!ids.has(id)) this.dropVideo(id, e);
    const aIds = new Set(p.audio.map(a => a.id));
    for (const [id, e] of this.audios) if (!aIds.has(id)) this.dropAudio(id, e);
    this.dirty = true;
  }

  private ensureSpectrum() {
    if (!this.project.texts.some(t => t.viz)) return;
    for (const a of this.project.audio) {
      void this.asset(a.mediaId).then(x => { if (x) void loadSpectrum(a.mediaId, () => getBlob(x)).then(() => { this.dirty = true; }); });
    }
  }

  private fontsSeen = new Set<string>();
  /** Loads each font the first time a text uses it, then redraws with the real letters. */
  private ensureFonts() {
    for (const t of this.project.texts) {
      const key = `${t.weight} ${t.font}`;
      if (this.fontsSeen.has(key)) continue;
      this.fontsSeen.add(key);
      document.fonts.load(`${t.weight} 40px "${t.font}"`, t.text).then(() => { this.dirty = true; }).catch(() => {});
    }
  }

  get duration() { return projectDuration(this.project); }

  seek(t: number) {
    this.t = Math.max(0, Math.min(this.duration, t));
    this.dirty = true;
    for (const e of this.audios.values()) e.el.pause();
    this.onTime(this.t);
  }

  play() {
    if (this.playing) return;
    if (this.t >= this.duration - 0.03) this.t = 0;
    this.playing = true;
    this.lastNow = performance.now();
  }

  pause() {
    this.playing = false;
    for (const e of this.videos.values()) e.el.pause();
    for (const e of this.audios.values()) e.el.pause();
    this.dirty = true;
  }

  toggle() { if (this.playing) this.pause(); else this.play(); }

  private dropVideo(id: string, e: VideoEntry) { e.el.pause(); e.el.removeAttribute('src'); e.el.load(); URL.revokeObjectURL(e.url); this.videos.delete(id); }
  private dropAudio(id: string, e: AudioEntry) { e.el.pause(); e.el.removeAttribute('src'); e.el.load(); URL.revokeObjectURL(e.url); this.audios.delete(id); }

  private async asset(id: string) {
    let a = this.assets.get(id);
    if (!a) { a = await getAsset(id); if (a) this.assets.set(id, a); }
    return a;
  }

  private ensureVideo(clip: Clip) {
    const hit = this.videos.get(clip.id);
    if (hit) return hit;
    const el = document.createElement('video');
    el.playsInline = true; el.preload = 'auto'; el.crossOrigin = 'anonymous'; el.setAttribute('playsinline', '');
    const entry: VideoEntry = { el, url: '', ready: false, mediaId: clip.mediaId!, seeking: false };
    this.videos.set(clip.id, entry);
    el.addEventListener('loadeddata', () => { entry.ready = true; this.dirty = true; });
    el.addEventListener('seeked', () => { entry.seeking = false; this.dirty = true; });
    this.asset(clip.mediaId!).then(a => (a ? getBlob(a) : Promise.reject(new Error('Fayl topilmadi')))).then(b => {
      if (this.destroyed || this.videos.get(clip.id) !== entry) return;
      entry.url = URL.createObjectURL(b);
      el.src = entry.url;
    }).catch(err => { this.lastError = String(err?.message ?? err); });
    return entry;
  }

  private ensureAudio(a: AudioClip) {
    const hit = this.audios.get(a.id);
    if (hit) return hit;
    const el = document.createElement('audio');
    el.preload = 'auto';
    const entry: AudioEntry = { el, url: '', ready: false, mediaId: a.mediaId };
    this.audios.set(a.id, entry);
    el.addEventListener('canplay', () => { entry.ready = true; });
    this.asset(a.mediaId).then(x => (x ? getBlob(x) : Promise.reject(new Error('Fayl topilmadi')))).then(b => {
      if (this.destroyed || this.audios.get(a.id) !== entry) return;
      entry.url = URL.createObjectURL(b);
      el.src = entry.url;
    }).catch(err => { this.lastError = String(err?.message ?? err); });
    return entry;
  }

  private ensureImage(id: string) {
    if (this.images.has(id) || this.pendingImages.has(id)) return;
    this.pendingImages.add(id);
    getImage(id).then(b => { if (b) { this.images.set(id, b); this.dirty = true; } }).finally(() => this.pendingImages.delete(id));
  }

  private ensureScene(c: Clip) {
    const W = this.comp.W, H = this.comp.H;
    const key = JSON.stringify([c.scene, c.sceneParams, W, H]);
    if (this.readyScenes.get(c.id) === key || this.pendingScenes.has(c.id)) return;
    this.pendingScenes.add(c.id);
    this.scenes.prepare(c, W, H).then(() => { this.readyScenes.set(c.id, key); this.dirty = true; })
      .catch(err => { this.lastError = String(err?.message ?? err); })
      .finally(() => this.pendingScenes.delete(c.id));
  }

  private syncVideo(clip: Clip, start: number, dur: number, gain: number) {
    const e = this.ensureVideo(clip);
    const want = Math.min(clip.out - 0.02, sourceTime(clip, this.t - start));
    const el = e.el;
    if (!e.ready) return;
    el.volume = Math.max(0, Math.min(1, clip.muted || hasRamp(clip) ? 0 : clip.volume * gain));
    el.playbackRate = sourceRate(clip, this.t - start);
    (el as unknown as { preservesPitch: boolean }).preservesPitch = clip.keepPitch !== false;
    if (this.playing) {
      if (Math.abs(el.currentTime - want) > 0.3 && !e.seeking) { e.seeking = true; el.currentTime = want; }
      if (el.paused) el.play().catch(() => { /* the next tick retries */ });
    } else {
      if (!el.paused) el.pause();
      if (Math.abs(el.currentTime - want) > 0.015 && !e.seeking) { e.seeking = true; el.currentTime = want; }
    }
    void dur;
  }

  private syncAudio() {
    const total = this.duration;
    for (const a of this.project.audio) {
      const span = a.out - a.in;
      const end = a.loop ? total : a.start + span;
      const inside = this.t >= a.start && this.t < end && this.playing && !a.muted;
      if (!inside) { const e = this.audios.get(a.id); if (e && !e.el.paused) e.el.pause(); if (this.t < end + 2) this.ensureAudio(a); continue; }
      const e = this.ensureAudio(a);
      if (!e.ready) continue;
      const local = this.t - a.start;
      const want = a.in + (a.loop ? local % span : local);
      const el = e.el;
      el.volume = Math.max(0, Math.min(1, a.volume * envelope(local, a.loop ? end - a.start : span, a.fadeIn, a.fadeOut)));
      if (Math.abs(el.currentTime - want) > 0.25) el.currentTime = want;
      if (el.paused) el.play().catch(() => { /* the next tick retries */ });
    }
  }

  private frameFor = (clip: Clip): Frame | null => {
    if (clip.kind === 'video') {
      const e = this.videos.get(clip.id);
      if (!e || !e.ready || e.el.videoWidth === 0) return null;
      return { source: e.el, width: e.el.videoWidth, height: e.el.videoHeight };
    }
    if (clip.kind === 'image' && clip.mediaId) {
      const b = this.images.get(clip.mediaId);
      return b ? { source: b, width: b.width, height: b.height, cacheKey: clip.mediaId } : null;
    }
    if (clip.kind === 'scene3d') {
      const l = layoutMain(this.project).find(x => x.clip.id === clip.id);
      const ov = this.project.overlays.find(o => o.id === clip.id);
      const start = l ? l.start : (ov?.start ?? 0);
      const dur = l ? l.end - l.start : clipDuration(clip);
      if (this.readyScenes.get(clip.id) === undefined) return null;
      const cv = this.scenes.render(clip, this.t - start, dur, this.comp.W, this.comp.H);
      return cv ? { source: cv, width: cv.width, height: cv.height } : null;
    }
    return null;
  };

  private loop(now: number) {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    try {
      if (this.playing) {
        this.t += (now - this.lastNow) / 1000;
        this.lastNow = now;
        if (this.t >= this.duration) { this.t = this.duration; this.pause(); this.onEnded(); }
        this.onTime(this.t);
      }
      const layout = layoutMain(this.project);
      const act = activeMain(layout, this.t);
      const activeIds = new Set<string>();
      const touch = (clip: Clip, start: number, dur: number, fadeIn: number, fadeOut: number) => {
        activeIds.add(clip.id);
        if (clip.kind === 'video') this.syncVideo(clip, start, dur, envelope(this.t - start, dur, fadeIn, fadeOut));
        else if (clip.kind === 'image' && clip.mediaId) this.ensureImage(clip.mediaId);
        else if (clip.kind === 'scene3d') this.ensureScene(clip);
      };
      if (act) {
        touch(act.a.clip, act.a.start, act.a.end - act.a.start, Math.max(act.a.clip.fadeIn, act.a.trIn), Math.max(act.a.clip.fadeOut, act.a.trOut));
        if (act.b) touch(act.b.clip, act.b.start, act.b.end - act.b.start, Math.max(act.b.clip.fadeIn, act.b.trIn), Math.max(act.b.clip.fadeOut, act.b.trOut));
      }
      for (const o of activeOverlays(this.project, this.t)) touch(o, o.start, clipDuration(o), o.fadeIn, o.fadeOut);

      // Load the next clip early so playback does not stall at the cut.
      const nextUp = layout.find(l => l.start > this.t && l.start < this.t + 1.5);
      if (nextUp) {
        const c = nextUp.clip;
        if (c.kind === 'video') { const e = this.ensureVideo(c); if (e.ready && !this.playing && Math.abs(e.el.currentTime - c.in) > 0.05 && !e.seeking) { e.seeking = true; e.el.currentTime = c.in; } else if (e.ready && this.playing && e.el.paused && Math.abs(e.el.currentTime - c.in) > 0.05 && !e.seeking) { e.seeking = true; e.el.currentTime = c.in; } activeIds.add(c.id); }
        else if (c.kind === 'image' && c.mediaId) this.ensureImage(c.mediaId);
        else if (c.kind === 'scene3d') this.ensureScene(c);
      }
      // Phones allow few hardware decoders, so idle clips release theirs.
      for (const [id, e] of this.videos) if (!activeIds.has(id)) { if (!e.el.paused) e.el.pause(); if (this.videos.size > 4) this.dropVideo(id, e); }
      this.syncAudio();

      if (this.playing || this.dirty || [...this.videos.values()].some(e => e.seeking)) {
        this.dirty = false;
        this.comp.render(this.project, this.t, this.frameFor);
      }
    } catch (err) {
      this.lastError = String((err as Error)?.message ?? err);
      console.error(err);
    }
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    for (const [id, e] of this.videos) this.dropVideo(id, e);
    for (const [id, e] of this.audios) this.dropAudio(id, e);
    this.scenes.dispose();
    this.comp.dispose();
  }
}
