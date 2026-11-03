import { ADJUST_FRAG, BLIT_FRAG, BLUR_FRAG, LAYER_FRAG, MASK_FRAG, SRC_FRAG, VERT, fxFrag, trFrag } from './glsl';
import { EFFECT_BY_ID } from './effects';
import { TRANSITION_BY_ID } from './transitions';
import { BeatPos, activeMain, activeOverlays, activeTexts, beatAt, clipDuration, keyframedValues, layoutMain, timelineBeats } from './timeline';
import { MotionState, danceAt, motionAt } from './motion';
import { drawText } from './text';
import type { Adjust, Clip, OverlayClip, Project } from './types';
import { spectrumFor } from '../auto/spectrum';

export interface Frame { source: TexImageSource; width: number; height: number; rotation?: number; /** Still images keep a cached, mipmapped texture under this key. */ cacheKey?: string }

/** Supplies pixels for a clip at a given moment. Preview and export use different implementations. */
export type FrameGetter = (clip: Clip) => Frame | null;

interface Prog { p: WebGLProgram; u: Map<string, WebGLUniformLocation | null> }
interface Target { fb: WebGLFramebuffer; tex: WebGLTexture }

const SHAPES: Record<string, number> = { circle: 0, rounded: 1, heart: 2, star: 3, diamond: 4, hexagon: 5, band: 6, column: 7 };

const hex = (c: string): [number, number, number] => {
  const h = c.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

export class Compositor {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  W = 0; H = 0;
  private programs = new Map<string, Prog>();
  private pool: Target[] = [];
  private free: Target[] = [];
  private srcTex: WebGLTexture;
  private textCanvas = document.createElement('canvas');
  private textCtx = this.textCanvas.getContext('2d', { willReadFrequently: false })!;
  private textTex: WebGLTexture;
  private vao: WebGLVertexArrayObject;
  errors: string[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: true, premultipliedAlpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error("Bu qurilma WebGL2 ni qo'llamaydi. Android System WebView ni yangilang.");
    this.gl = gl;
    const buf = gl.createBuffer();
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.srcTex = this.makeTex();
    this.textTex = this.makeTex();
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
  }

  private makeTex() {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  setSize(w: number, h: number) {
    w = Math.round(w / 2) * 2; h = Math.round(h / 2) * 2;
    if (w === this.W && h === this.H) return;
    this.W = w; this.H = h;
    this.canvas.width = w; this.canvas.height = h;
    this.textCanvas.width = w; this.textCanvas.height = h;
    const gl = this.gl;
    for (const t of this.pool) { gl.deleteFramebuffer(t.fb); gl.deleteTexture(t.tex); }
    this.pool = []; this.free = [];
  }

  private acquire(): Target {
    const t = this.free.pop();
    if (t) return t;
    const gl = this.gl;
    const tex = this.makeTex();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.W, this.H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const target = { fb, tex };
    this.pool.push(target);
    return target;
  }
  private release(t: Target) { this.free.push(t); }

  program(key: string, frag: string): Prog {
    const cached = this.programs.get(key);
    if (cached) return cached;
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
        throw new Error(`Shader ${key}: ${gl.getShaderInfoLog(s)}`);
      }
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, frag));
    gl.bindAttribLocation(p, 0, 'a');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(`Link ${key}: ${gl.getProgramInfoLog(p)}`);
    const prog: Prog = { p, u: new Map() };
    this.programs.set(key, prog);
    return prog;
  }

  private use(pr: Prog) { this.gl.useProgram(pr.p); }
  private loc(pr: Prog, name: string) {
    if (!pr.u.has(name)) pr.u.set(name, this.gl.getUniformLocation(pr.p, name));
    return pr.u.get(name)!;
  }
  private f(pr: Prog, n: string, v: number) { this.gl.uniform1f(this.loc(pr, n), v); }
  private bindTex(pr: Prog, n: string, unit: number, tex: WebGLTexture) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(this.loc(pr, n), unit);
  }
  private draw(to: Target | null) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, to ? to.fb : null);
    gl.viewport(0, 0, this.W, this.H);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private upload(tex: WebGLTexture, f: Frame) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, f.source);
  }

  private stillCache = new Map<string, WebGLTexture>();
  /** Returns a texture for the frame. Stills are uploaded once, moving sources every frame. */
  private textureFor(f: Frame): WebGLTexture {
    const gl = this.gl;
    if (!f.cacheKey) { this.upload(this.srcTex, f); return this.srcTex; }
    const hit = this.stillCache.get(f.cacheKey);
    if (hit) { this.stillCache.delete(f.cacheKey); this.stillCache.set(f.cacheKey, hit); return hit; }
    const tex = this.makeTex();
    this.upload(tex, f);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    this.stillCache.set(f.cacheKey, tex);
    if (this.stillCache.size > 16) {
      const [k, old] = this.stillCache.entries().next().value as [string, WebGLTexture];
      gl.deleteTexture(old); this.stillCache.delete(k);
    }
    return tex;
  }

  /** Runs the source draw, colour adjustment and effect chain for one clip. Returned target must be released. */
  private renderClip(clip: Clip, local: number, dur: number, getFrame: FrameGetter, opaqueBg: [number, number, number] | null, project: Project, t: number): Target {
    const gl = this.gl;
    let cur = this.acquire();
    const frame = clip.kind === 'color' ? null : getFrame(clip);
    gl.bindFramebuffer(gl.FRAMEBUFFER, cur.fb);
    gl.viewport(0, 0, this.W, this.H);
    const fill = clip.kind === 'color' ? hex(clip.color ?? '#000000') : opaqueBg;
    if (fill) gl.clearColor(fill[0], fill[1], fill[2], 1); else gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const beat: BeatPos | null = clip.dance ? beatAt(this.beatsFor(project), t) : null;
    const m: MotionState = motionAt(clip.motion, local, dur);
    if (clip.dance && beat) {
      const d = danceAt(clip.dance.style, beat, clip.dance.amount);
      m.scale *= d.scale ?? 1; m.x += d.x ?? 0; m.y += d.y ?? 0; m.rot += d.rot ?? 0; m.tiltX += d.tiltX ?? 0; m.tiltY += d.tiltY ?? 0; m.flip = d.flip;
    }

    if (frame) {
      const srcTexture = this.textureFor(frame);
      const kf = keyframedValues(clip.keyframes, local);
      const tr = kf ? { ...clip.transform, x: kf.x, y: kf.y, scale: kf.scale, rotation: kf.rotation, opacity: kf.opacity } : clip.transform;
      const rot90 = frame.rotation === 90 || frame.rotation === 270;
      const crop = clip.crop ?? { l: 0, t: 0, r: 0, b: 0 };
      const dispW = (rot90 ? frame.height : frame.width) * (1 - crop.l - crop.r), dispH = (rot90 ? frame.width : frame.height) * (1 - crop.t - crop.b);
      const pr = this.program('_src', SRC_FRAG);
      const drawSource = (to: Target, opts: { cover: boolean; scale: number; x: number; y: number; rot: number; tiltX: number; tiltY: number; opacity: number; bgOn: boolean; flipH: boolean; flipV: boolean }) => {
        this.use(pr);
        this.bindTex(pr, 'tex', 0, srcTexture);
        this.f(pr, 'outAspect', this.W / this.H);
        this.f(pr, 'srcAspect', dispW / dispH);
        this.f(pr, 'scale', opts.scale);
        this.f(pr, 'rotation', opts.rot);
        this.f(pr, 'tiltX', opts.tiltX); this.f(pr, 'tiltY', opts.tiltY);
        this.f(pr, 'opacity', opts.opacity);
        this.f(pr, 'cover', opts.cover ? 1 : 0);
        gl.uniform2f(this.loc(pr, 'offset'), opts.x, opts.y);
        gl.uniform2f(this.loc(pr, 'flip'), opts.flipH ? -1 : 1, opts.flipV ? -1 : 1);
        gl.uniform1i(this.loc(pr, 'srcRot'), frame.rotation ?? 0);
        gl.uniform4f(this.loc(pr, 'crop'), crop.l, crop.t, crop.r, crop.b);
        const bg = opaqueBg ?? hex(project.background);
        gl.uniform3f(this.loc(pr, 'bg'), bg[0], bg[1], bg[2]);
        this.f(pr, 'bgOn', opts.bgOn ? 1 : 0);
        this.draw(to);
      };
      const flipH = tr.flipH !== !!m.flip;
      if (clip.canvas === 'blur' && opaqueBg) {
        // The same picture, enlarged and blurred, fills the bars around the fitted one.
        drawSource(cur, { cover: true, scale: 1.08, x: 0, y: 0, rot: 0, tiltX: 0, tiltY: 0, opacity: 1, bgOn: true, flipH: false, flipV: false });
        const blur = this.program('_blur', BLUR_FRAG);
        for (const dir of [[1 / this.W, 0], [0, 1 / this.H], [2.6 / this.W, 0], [0, 2.6 / this.H]]) {
          const k = Math.max(1, this.H / 300);
          const next = this.acquire();
          this.use(blur);
          this.bindTex(blur, 'tex', 0, cur.tex);
          gl.uniform2f(this.loc(blur, 'dir'), dir[0] * k, dir[1] * k);
          this.draw(next);
          this.release(cur); cur = next;
        }
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        drawSource(cur, { cover: false, scale: tr.scale * m.scale, x: tr.x + m.x, y: tr.y + m.y, rot: tr.rotation + m.rot, tiltX: m.tiltX, tiltY: m.tiltY, opacity: tr.opacity, bgOn: false, flipH, flipV: tr.flipV });
        gl.disable(gl.BLEND);
      } else {
        drawSource(cur, { cover: tr.fit === 'cover', scale: tr.scale * m.scale, x: tr.x + m.x, y: tr.y + m.y, rot: tr.rotation + m.rot, tiltX: m.tiltX, tiltY: m.tiltY, opacity: tr.opacity, bgOn: !!opaqueBg, flipH, flipV: tr.flipV });
      }
    }

    // A beat can flash the picture without changing the clip's saved colours.
    let a: Adjust = clip.adjust;
    if (clip.dance?.flash && beat) a = { ...a, brightness: a.brightness + 0.42 * beat.pulse * beat.pulse * clip.dance.amount, saturation: a.saturation + 0.3 * beat.pulse * clip.dance.amount };
    if (a && (a.brightness || a.contrast || a.saturation || a.temperature || a.tint || a.vignette || a.sharpen || a.fade)) {
      const next = this.acquire();
      const pr = this.program('_adj', ADJUST_FRAG);
      this.use(pr);
      this.bindTex(pr, 'tex', 0, cur.tex);
      gl.uniform2f(this.loc(pr, 'res'), this.W, this.H);
      for (const k of ['brightness', 'contrast', 'saturation', 'temperature', 'tint', 'vignette', 'sharpen', 'fade'] as const) this.f(pr, k, a[k]);
      this.draw(next);
      this.release(cur); cur = next;
    }

    for (const fx of clip.effects) {
      if (fx.amount <= 0) continue;
      const def = EFFECT_BY_ID.get(fx.id);
      if (!def) continue;
      const amount = clip.dance?.fxOnBeat && beat && !fx.id.startsWith('f_') ? fx.amount * (0.15 + 0.85 * beat.pulse) : fx.amount;
      const next = this.acquire();
      const pr = this.program(def.id, fxFrag(def.glsl));
      this.use(pr);
      this.bindTex(pr, 'tex', 0, cur.tex);
      this.f(pr, 't', local); this.f(pr, 'amt', amount);
      gl.uniform2f(this.loc(pr, 'res'), this.W, this.H);
      this.draw(next);
      this.release(cur); cur = next;
    }

    if (clip.mask && clip.mask.shape !== 'none') {
      const next = this.acquire();
      const pr = this.program('_mask', MASK_FRAG);
      this.use(pr);
      this.bindTex(pr, 'tex', 0, cur.tex);
      this.f(pr, 'size', clip.mask.size); this.f(pr, 'feather', clip.mask.feather);
      this.f(pr, 'outAspect', this.W / this.H);
      gl.uniform1i(this.loc(pr, 'shape'), SHAPES[clip.mask.shape] ?? 0);
      const bg = opaqueBg ?? hex(project.background);
      gl.uniform3f(this.loc(pr, 'bg'), bg[0], bg[1], bg[2]);
      this.f(pr, 'bgOn', opaqueBg ? 1 : 0);
      this.draw(next);
      this.release(cur); cur = next;
    }
    return cur;
  }

  private beatCache: { p: Project; beats: number[] } | null = null;
  private beatsFor(p: Project) {
    if (this.beatCache?.p !== p) this.beatCache = { p, beats: timelineBeats(p) };
    return this.beatCache.beats;
  }

  private blendLayer(base: Target, layerTex: WebGLTexture, mode: number, flipY: boolean): Target {
    const next = this.acquire();
    const pr = this.program('_layer', LAYER_FRAG);
    this.use(pr);
    this.bindTex(pr, 'tex', 0, layerTex);
    this.bindTex(pr, 'base', 1, base.tex);
    this.gl.uniform1i(this.loc(pr, 'mode'), mode);
    this.f(pr, 'flipY', flipY ? 1 : 0);
    this.draw(next);
    this.release(base);
    return next;
  }

  /** Renders the whole project at time t into the canvas. */
  render(project: Project, t: number, getFrame: FrameGetter) {
    const gl = this.gl;
    const bg = hex(project.background);
    const layout = layoutMain(project);
    const act = activeMain(layout, t);
    let out: Target;

    if (act) {
      const localA = t - act.a.start;
      const aT = this.renderClip(act.a.clip, localA, act.a.end - act.a.start, getFrame, bg, project, t);
      if (act.b) {
        const localB = t - act.b.start;
        const bT = this.renderClip(act.b.clip, localB, act.b.end - act.b.start, getFrame, bg, project, t);
        const def = TRANSITION_BY_ID.get(act.a.clip.transition!.id) ?? TRANSITION_BY_ID.get('t_fade')!;
        out = this.acquire();
        const pr = this.program(def.id, trFrag(def.glsl));
        this.use(pr);
        this.bindTex(pr, 'ta', 0, aT.tex);
        this.bindTex(pr, 'tb', 1, bT.tex);
        this.f(pr, 'pr', act.progress);
        gl.uniform2f(this.loc(pr, 'res'), this.W, this.H);
        this.draw(out);
        this.release(aT); this.release(bT);
      } else out = aT;
    } else {
      out = this.acquire();
      gl.bindFramebuffer(gl.FRAMEBUFFER, out.fb);
      gl.clearColor(bg[0], bg[1], bg[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    for (const ov of activeOverlays(project, t) as OverlayClip[]) {
      const layer = this.renderClip(ov, t - ov.start, clipDuration(ov), getFrame, null, project, t);
      out = this.blendLayer(out, layer.tex, { normal: 0, screen: 1, multiply: 2, add: 3 }[ov.blend] ?? 0, false);
      this.release(layer);
    }

    const texts = activeTexts(project, t);
    if (texts.length) {
      const ctx = this.textCtx;
      ctx.clearRect(0, 0, this.W, this.H);
      for (const tc of texts) drawText(ctx, tc, t - tc.start, this.W, this.H, tc.viz ? spectrumFor(project, t) : null, this.beatsFor(project), t);
      this.upload(this.textTex, { source: this.textCanvas, width: this.W, height: this.H });
      out = this.blendLayer(out, this.textTex, 0, true);
    }

    const blit = this.program('_blit', BLIT_FRAG);
    this.use(blit);
    this.bindTex(blit, 'tex', 0, out.tex);
    this.draw(null);
    this.release(out);
  }

  dispose() {
    const ext = this.gl.getExtension('WEBGL_lose_context');
    ext?.loseContext();
  }
}
