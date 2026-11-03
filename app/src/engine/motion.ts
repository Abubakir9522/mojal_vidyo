export interface MotionState { scale: number; x: number; y: number; rot: number; tiltX: number; tiltY: number; flip?: boolean }

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

export interface DanceDef { id: string; name: string; fn: (b: { pulse: number; index: number; phase: number }, a: number) => Partial<MotionState> }

const rnd = (n: number, s: number) => { const x = Math.sin(n * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x) - 0.5; };
const alt = (n: number) => (n % 2 ? 1 : -1);
const io = (p: number) => p * p * (3 - 2 * p);

/** Ways a photo can move to music. pulse jumps to 1 on each beat and decays, phase runs 0..1 between beats. */
export const DANCES: DanceDef[] = [
  { id: 'sakrash', name: 'Zarba', fn: (b, a) => ({ scale: 1.04 + 0.2 * a * b.pulse }) },
  { id: 'bosish', name: 'Bosilish', fn: (b, a) => ({ scale: 1.18 - 0.16 * a * b.pulse }) },
  { id: 'yurak', name: 'Yurak urishi', fn: (b, a) => { const p = b.phase, k = Math.exp(-p * 7) + 0.7 * Math.exp(-Math.pow((p - 0.32) * 9, 2)); return { scale: 1.05 + 0.15 * a * k }; } },
  { id: 'chayqalish', name: 'Chayqalish', fn: (b, a) => ({ scale: 1.2, rot: alt(b.index) * 0.13 * a * Math.cos(b.phase * Math.PI) }) },
  { id: 'tebranish', name: 'Yonga borish', fn: (b, a) => ({ scale: 1.25, x: alt(b.index) * 0.07 * a * Math.cos(b.phase * Math.PI) }) },
  { id: 'sakrab', name: 'Sakrash', fn: (b, a) => ({ scale: 1.2, y: Math.sin(b.phase * Math.PI) * 0.09 * a }) },
  { id: 'silkinish', name: 'Silkinish', fn: (b, a) => ({ scale: 1.14, x: rnd(b.index, 1) * 0.1 * a * b.pulse, y: rnd(b.index, 2) * 0.1 * a * b.pulse, rot: rnd(b.index, 3) * 0.07 * a * b.pulse }) },
  { id: 'robot', name: 'Robot', fn: (b, a) => ({ scale: 1.2, x: rnd(b.index, 4) * 0.12 * a, y: rnd(b.index, 5) * 0.12 * a, rot: Math.round(rnd(b.index, 6) * 2) * 0.06 * a }) },
  { id: 'burilish3d', name: '3D burilish', fn: (b, a) => ({ scale: 1.25, tiltY: alt(b.index) * 0.9 * a * Math.cos(b.phase * Math.PI) }) },
  { id: 'qiyalik3d', name: '3D egilish', fn: (b, a) => ({ scale: 1.25, tiltX: alt(b.index) * 0.75 * a * Math.cos(b.phase * Math.PI) }) },
  { id: 'kamera3d', name: '3D uchish', fn: (b, a) => ({ scale: 1.1 + 0.3 * a * io(1 - b.pulse), tiltY: rnd(b.index, 7) * 1.1 * a * b.pulse, tiltX: rnd(b.index, 8) * 0.9 * a * b.pulse }) },
  { id: 'oyna', name: "Ko'zgu", fn: (b, a) => ({ scale: 1.06 + 0.1 * a * b.pulse, flip: b.index % 2 === 1 }) },
  { id: 'aylanish', name: 'Aylanish', fn: (b, a) => ({ scale: 1.35, rot: (b.index + io(Math.min(1, b.phase * 2.2))) * 0.26 * a }) },
  { id: 'zina', name: 'Zinapoya', fn: (b, a) => ({ scale: 1 + (((b.index % 4) + 4) % 4) * 0.1 * a + 0.06 * a * b.pulse }) },
  { id: 'suzish', name: 'Suzish', fn: (b, a) => { const t = (b.index + b.phase) * 0.8; return { scale: 1.22, x: Math.cos(t) * 0.06 * a, y: Math.sin(t) * 0.06 * a }; } },
  { id: 'aralash', name: 'Aralash', fn: (b, a) => DANCE_CYCLE[((Math.floor(b.index / 4) % DANCE_CYCLE.length) + DANCE_CYCLE.length) % DANCE_CYCLE.length](b, a) },
];
const DANCE_CYCLE: DanceDef['fn'][] = ['sakrash', 'chayqalish', 'burilish3d', 'sakrab', 'silkinish', 'tebranish'].map(id => DANCES.find(d => d.id === id)!.fn);
const danceById = new Map(DANCES.map(d => [d.id, d]));

export function danceAt(style: string, b: { pulse: number; index: number; phase: number }, amount: number): Partial<MotionState> {
  return danceById.get(style)?.fn(b, amount) ?? {};
}
