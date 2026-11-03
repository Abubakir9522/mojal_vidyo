export interface MotionState { scale: number; x: number; y: number; rot: number; tiltX: number; tiltY: number }

const ease = (p: number) => p * p * (3 - 2 * p);
const n = (t: number, s: number) => Math.sin(t * 1.7 + s) * 0.6 + Math.sin(t * 2.9 + s * 2.1) * 0.4;

export interface MotionDef { id: string; name: string; fn: (p: number, t: number) => Partial<MotionState> }

/** Camera moves for still photos and clips. p runs 0..1 across the clip, t is local seconds. */
export const MOTIONS: MotionDef[] = [
  { id: 'none', name: 'Harakatsiz', fn: () => ({}) },
  { id: 'zoomIn', name: 'Yaqinlashish', fn: p => ({ scale: 1 + 0.18 * p }) },
  { id: 'zoomOut', name: 'Uzoqlashish', fn: p => ({ scale: 1.18 - 0.18 * p }) },
  { id: 'zoomInFast', name: 'Tez yaqinlashish', fn: p => ({ scale: 1 + 0.45 * ease(p) }) },
  { id: 'panLeft', name: 'Chapga suzish', fn: p => ({ scale: 1.2, x: 0.08 - 0.16 * p }) },
  { id: 'panRight', name: "O'ngga suzish", fn: p => ({ scale: 1.2, x: -0.08 + 0.16 * p }) },
  { id: 'panUp', name: 'Yuqoriga suzish', fn: p => ({ scale: 1.2, y: -0.08 + 0.16 * p }) },
  { id: 'panDown', name: 'Pastga suzish', fn: p => ({ scale: 1.2, y: 0.08 - 0.16 * p }) },
  { id: 'diagonal', name: 'Diagonal', fn: p => ({ scale: 1.22, x: -0.07 + 0.14 * p, y: -0.07 + 0.14 * p }) },
  { id: 'rotateIn', name: 'Burilib kirish', fn: p => ({ scale: 1.25 - 0.1 * p, rot: (1 - ease(p)) * 0.12 }) },
  { id: 'slowRotate', name: 'Sekin aylanish', fn: p => ({ scale: 1.2, rot: -0.05 + 0.1 * p }) },
  { id: 'pulse', name: 'Puls', fn: (_, t) => ({ scale: 1.06 + 0.05 * Math.sin(t * 6.283) }) },
  { id: 'handheld', name: "Qo'lda tortilgan", fn: (_, t) => ({ scale: 1.08, x: n(t, 1) * 0.012, y: n(t, 4) * 0.012, rot: n(t, 7) * 0.006 }) },
  { id: 'drop', name: 'Tushish', fn: p => { const e = 1 - Math.pow(1 - Math.min(1, p * 2.5), 3); return { scale: 1.5 - 0.5 * e + 0.05 * p, y: 0.12 * (1 - e) }; } },
  { id: 'tiltLeft', name: '3D chapga burish', fn: p => ({ scale: 1.25, tiltY: 0.55 - 1.1 * p }) },
  { id: 'tiltRight', name: "3D o'ngga burish", fn: p => ({ scale: 1.25, tiltY: -0.55 + 1.1 * p }) },
  { id: 'tiltUp', name: '3D yuqoriga burish', fn: p => ({ scale: 1.25, tiltX: 0.5 - 1 * p }) },
  { id: 'tiltDown', name: '3D pastga burish', fn: p => ({ scale: 1.25, tiltX: -0.5 + 1 * p }) },
  { id: 'fly3d', name: '3D uchib kirish', fn: p => { const e = ease(Math.min(1, p * 1.6)); return { scale: 0.75 + 0.45 * e, tiltY: 0.9 * (1 - e), rot: 0.1 * (1 - e) }; } },
  { id: 'orbit3d', name: '3D aylanma', fn: p => ({ scale: 1.3, tiltY: Math.sin(p * 6.283) * 0.5, tiltX: Math.cos(p * 6.283) * 0.35 }) },
];

const byId = new Map(MOTIONS.map(m => [m.id, m]));

export function motionAt(id: string, local: number, dur: number): MotionState {
  const def = byId.get(id);
  const p = dur > 0 ? Math.min(1, Math.max(0, local / dur)) : 0;
  return { scale: 1, x: 0, y: 0, rot: 0, tiltX: 0, tiltY: 0, ...(def ? def.fn(p, local) : {}) };
}
