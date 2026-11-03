import type { TextClip } from './types';

const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const backOut = (x: number) => { const c = 1.70158; x = Math.min(1, x); return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const ANIM = 0.45;

export const FONTS = [
  { id: 'Montserrat', name: 'Montserrat', weights: [400, 800] },
  { id: 'Oswald', name: 'Oswald', weights: [700] },
  { id: 'Russo One', name: 'Russo One', weights: [400] },
  { id: 'Playfair Display', name: 'Playfair', weights: [700] },
  { id: 'Lobster', name: 'Lobster', weights: [400] },
  { id: 'Pacifico', name: 'Pacifico', weights: [400] },
  { id: 'Comfortaa', name: 'Comfortaa', weights: [700] },
  { id: 'Roboto Condensed', name: 'Roboto', weights: [700] },
  { id: 'Caveat', name: 'Caveat', weights: [700] },
];

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    let line = '';
    for (const w of raw.split(' ')) {
      const test = line ? line + ' ' + w : w;
      if (line && ctx.measureText(test).width > maxW) { out.push(line); line = w; } else line = test;
    }
    out.push(line);
  }
  return out;
}

/** Draws one text or sticker clip on a 2D canvas at the given local time. Same code for preview and export. */
export function drawText(ctx: CanvasRenderingContext2D, tc: TextClip, local: number, W: number, H: number) {
  const px = (tc.size / 100) * H;
  const dIn = Math.min(ANIM, tc.duration * 0.4), dOut = Math.min(ANIM, tc.duration * 0.4);
  const pin = dIn > 0 ? Math.min(1, local / dIn) : 1;
  const pout = dOut > 0 ? Math.min(1, (tc.duration - local) / dOut) : 1;
  let alpha = 1, sx = 1, sy = 1, dx = 0, dy = 0, rot = 0, blur = 0;
  const apply = (a: string, p: number, dir: 1 | -1) => {
    switch (a) {
      case 'fade': alpha *= p; break;
      case 'pop': { const k = backOut(p); sx *= k; sy *= k; alpha *= Math.min(1, p * 3); break; }
      case 'zoom': { const k = 1 + (1 - ease(p)) * 1.6; sx *= k; sy *= k; alpha *= p; break; }
      case 'slideUp': dy += (1 - ease(p)) * H * 0.12 * dir; alpha *= p; break;
      case 'slideDown': dy -= (1 - ease(p)) * H * 0.12 * dir; alpha *= p; break;
      case 'slideLeft': dx += (1 - ease(p)) * W * 0.3 * dir; alpha *= p; break;
      case 'slideRight': dx -= (1 - ease(p)) * W * 0.3 * dir; alpha *= p; break;
      case 'bounce': dy -= Math.abs(Math.sin(p * 7)) * (1 - p) * H * 0.12; alpha *= Math.min(1, p * 4); break;
      case 'blur': blur = Math.max(blur, (1 - p) * px * 0.4); alpha *= p; break;
      case 'flip': sy *= Math.max(0.01, ease(p)); alpha *= Math.min(1, p * 3); break;
      case 'spin': rot += (1 - ease(p)) * 3.14 * dir; { const k = ease(p); sx *= k; sy *= k; } break;
    }
  };
  apply(tc.animIn, pin, 1);
  apply(tc.animOut, pout, -1);
  switch (tc.loop) {
    case 'pulse': { const k = 1 + Math.sin(local * 5) * 0.05; sx *= k; sy *= k; break; }
    case 'shake': dx += Math.sin(local * 40) * H * 0.003; dy += Math.cos(local * 33) * H * 0.003; break;
    case 'float': dy += Math.sin(local * 2) * H * 0.012; break;
    case 'wiggle': rot += Math.sin(local * 6) * 0.05; break;
  }
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.translate(tc.x * W + dx, tc.y * H + dy);
  ctx.rotate(tc.rotation + rot);
  ctx.scale(tc.scale * sx, tc.scale * sy);
  ctx.font = `${tc.weight} ${px}px "${tc.font}", "Noto Color Emoji", sans-serif`;
  (ctx as unknown as { letterSpacing: string }).letterSpacing = `${tc.letterSpacing * px}px`;
  ctx.textAlign = tc.align;
  ctx.textBaseline = 'middle';
  if (blur > 0) ctx.filter = `blur(${blur.toFixed(1)}px)`;

  let lines = wrapLines(ctx, tc.text, W * 0.92 / Math.max(0.2, tc.scale));
  const lh = px * 1.22;
  // Per-character animations reveal or move letters on their own.
  const typing = tc.animIn === 'type' ? Math.floor(ease(local / Math.max(0.3, tc.duration * 0.5)) * tc.text.length) : -1;
  const originY = -((lines.length - 1) * lh) / 2;

  let widest = 0;
  for (const l of lines) widest = Math.max(widest, ctx.measureText(l).width);
  const originX = tc.align === 'center' ? 0 : tc.align === 'left' ? -widest / 2 : widest / 2;

  if (tc.bg) {
    const pad = px * 0.32;
    ctx.save();
    ctx.fillStyle = tc.bg;
    const w = widest + pad * 2, h = lines.length * lh + pad * 0.9;
    ctx.beginPath();
    (ctx as CanvasRenderingContext2D).roundRect(-w / 2, -h / 2, w, h, px * 0.2);
    ctx.fill();
    ctx.restore();
  }

  let fill: string | CanvasGradient = tc.color;
  if (tc.gradient && tc.gradient.length > 1) {
    const g = ctx.createLinearGradient(0, -lh * lines.length / 2, 0, lh * lines.length / 2);
    tc.gradient.forEach((c, i) => g.addColorStop(i / (tc.gradient!.length - 1), c));
    fill = g;
  }

  const paint = (s: string, x: number, y: number) => {
    if (tc.loop === 'glow') {
      ctx.shadowColor = typeof fill === 'string' ? fill : '#ffffff';
      ctx.shadowBlur = px * (0.3 + 0.2 * Math.sin(local * 5));
    } else if (tc.shadow) {
      ctx.shadowColor = 'rgba(0,0,0,.55)';
      ctx.shadowBlur = px * 0.14; ctx.shadowOffsetY = px * 0.05;
    }
    if (tc.strokeWidth > 0) {
      ctx.lineJoin = 'round'; ctx.strokeStyle = tc.stroke; ctx.lineWidth = tc.strokeWidth * px;
      ctx.strokeText(s, x, y);
      ctx.shadowColor = 'transparent';
    }
    ctx.fillStyle = fill;
    ctx.fillText(s, x, y);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  };

  let shown = 0;
  lines.forEach((line, li) => {
    const y = originY + li * lh;
    if (tc.animIn === 'wave' || tc.animIn === 'letters') {
      const total = ctx.measureText(line).width;
      let x = originX - (tc.align === 'center' ? total / 2 : tc.align === 'right' ? total : 0);
      const saved = ctx.textAlign;
      ctx.textAlign = 'left';
      [...line].forEach((ch, i) => {
        const w = ctx.measureText(ch).width;
        if (tc.animIn === 'wave') {
          paint(ch, x, y + Math.sin(local * 5 + i * 0.5) * px * 0.14);
        } else {
          const p = Math.max(0, Math.min(1, (local - (shown + i) * 0.035) / 0.3));
          const a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * p;
          paint(ch, x, y + (1 - ease(p)) * px * 0.6);
          ctx.globalAlpha = a0;
        }
        x += w;
      });
      ctx.textAlign = saved;
    } else if (typing >= 0) {
      const visible = line.slice(0, Math.max(0, typing - shown));
      const total = ctx.measureText(line).width;
      const saved = ctx.textAlign;
      ctx.textAlign = 'left';
      paint(visible, originX - (tc.align === 'center' ? total / 2 : tc.align === 'right' ? total : 0), y);
      ctx.textAlign = saved;
    } else {
      paint(line, originX, y);
    }
    shown += line.length + 1;
  });
  lines = [];
  ctx.restore();
}
