import * as THREE from 'three';
import { Font } from 'three/examples/jsm/loaders/FontLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Clip, SceneParams } from './types';

export interface SceneDef { id: string; name: string; images: number; text: string; sub?: string; colors: string[] }

export const SCENES: SceneDef[] = [
  { id: 'logoSpin', name: 'Oltin logotip', images: 0, text: "MO'JAL", sub: 'Ishonch tarmog\'i', colors: ['#120a2a', '#ffc53d', '#ff3d81'] },
  { id: 'textFly', name: 'Uchuvchi harflar', images: 0, text: 'YANGILIK', sub: 'Bugun boshlanadi', colors: ['#06142e', '#39d6c6', '#ffffff'] },
  { id: 'cubePhotos', name: 'Rasmli kub', images: 6, text: '', colors: ['#0d0f26', '#7b5cff', '#ffc53d'] },
  { id: 'carousel', name: 'Aylanma galereya', images: 8, text: 'Xotiralar', colors: ['#0b1226', '#39d6c6', '#ffffff'] },
  { id: 'galleryWall', name: 'Rasmlar devori', images: 8, text: '', colors: ['#17131f', '#f3e6c8', '#ffc53d'] },
  { id: 'galaxy', name: 'Galaktika', images: 0, text: 'KOINOT', sub: '', colors: ['#03030f', '#8a6cff', '#ff5fa2'] },
  { id: 'shapes', name: 'Suzuvchi shakllar', images: 0, text: 'ZAMONAVIY', sub: 'Dizayn', colors: ['#14102e', '#ff5fa2', '#39d6c6'] },
  { id: 'globe', name: 'Yer shari', images: 0, text: 'DUNYO', sub: 'Yangiliklari', colors: ['#020a18', '#2d8cff', '#7fe9ff'] },
  { id: 'ringTunnel', name: 'Nurli tunnel', images: 0, text: 'KIRISH', sub: '', colors: ['#05020f', '#ff3d81', '#39d6c6'] },
  { id: 'podium', name: 'Mahsulot podiumi', images: 1, text: 'YANGI MAHSULOT', sub: 'Faqat bizda', colors: ['#10121f', '#ffc53d', '#ffffff'] },
  { id: 'flipGrid', name: 'Aylanuvchi kartalar', images: 6, text: '', colors: ['#0f1020', '#7b5cff', '#39d6c6'] },
  { id: 'synthwave', name: 'Neon ufq', images: 0, text: 'RETRO', sub: '80-yillar', colors: ['#14012b', '#ff2fa0', '#29e7ff'] },
  { id: 'confetti', name: 'Bayram konfettisi', images: 0, text: 'TABRIKLAYMIZ', sub: "Tug'ilgan kuningiz bilan", colors: ['#1a0d33', '#ffc53d', '#ff5fa2'] },
  { id: 'coins', name: 'Oltin tangalar', images: 0, text: 'CHEGIRMA', sub: '50% gacha', colors: ['#190b05', '#ffc53d', '#ff7a1a'] },
  { id: 'phone', name: '3D telefon', images: 1, text: 'CHIROYLI RAQAMLAR', sub: "Mo'jal do'konida", colors: ['#0a1630', '#39d6c6', '#ffffff'] },
  { id: 'stackCards', name: 'Rasmlar dastasi', images: 5, text: '', colors: ['#1a1030', '#ff5fa2', '#ffc53d'] },
  { id: 'waves', name: "3D to'lqinlar", images: 0, text: 'SAYOHAT', sub: 'Sarguzasht kutmoqda', colors: ['#031827', '#18b7c9', '#ffffff'] },
  { id: 'crystal', name: 'Billur', images: 0, text: 'PREMIUM', sub: 'Sifat kafolati', colors: ['#0c0a1e', '#b89bff', '#ffffff'] },
  { id: 'pillars', name: 'Ritm ustunlari', images: 0, text: 'MUSIQA', sub: '', colors: ['#080818', '#39d6c6', '#ff3d81'] },
  { id: 'balloons', name: 'Sharlar', images: 0, text: 'BAYRAMINGIZ', sub: 'Muborak bo\'lsin', colors: ['#20103f', '#ff5fa2', '#ffc53d'] },
];
export const SCENE_BY_ID = new Map(SCENES.map(s => [s.id, s]));

function rng(seed: number) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
const easeIO = (x: number) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const back = (x: number) => { x = clamp01(x); const c = 1.70158; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

let fontPromise: Promise<Font> | null = null;
export function loadFont() {
  fontPromise ??= fetch(new URL('fonts/montserrat-black.typeface.json', document.baseURI).href).then(r => r.json()).then(j => new Font(j)).catch(e => { fontPromise = null; throw e; });
  return fontPromise;
}

interface Ctx { scene: THREE.Scene; camera: THREE.PerspectiveCamera; font: Font; params: SceneParams; colors: THREE.Color[]; tex: THREE.Texture[]; aspect: number; text: string; sub: string; env: THREE.Texture }
type Update = (t: number, p: number, dur: number) => void;
type Builder = (c: Ctx) => Update;

/** Extruded, bevelled, centred 3D text sized to fit a target width. Empty strings give an empty group. */
function text3D(c: Ctx, text: string, opts: { width: number; depth?: number; material?: THREE.Material; maxSize?: number }) {
  const g = new THREE.Group();
  if (!text.trim()) return g;
  const shapes = c.font.generateShapes(text, 1);
  const geo = new THREE.ExtrudeGeometry(shapes, { depth: opts.depth ?? 0.28, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.028, bevelSegments: 3, curveSegments: 6 });
  geo.computeBoundingBox();
  const b = geo.boundingBox!;
  geo.translate(-(b.max.x + b.min.x) / 2, -(b.max.y + b.min.y) / 2, -(b.max.z + b.min.z) / 2);
  const w = b.max.x - b.min.x;
  const s = Math.min(opts.width / w, opts.maxSize ?? 1.1);
  const m = new THREE.Mesh(geo, opts.material ?? new THREE.MeshStandardMaterial({ color: c.colors[1], metalness: 0.85, roughness: 0.22, envMap: c.env }));
  m.scale.setScalar(s);
  g.add(m);
  return g;
}

const fitWidth = (c: Ctx) => (c.aspect < 1 ? 5.0 * c.aspect / 0.5625 * 0.56 : 6.4);

function standardLights(c: Ctx, a = 1) {
  c.scene.add(new THREE.AmbientLight(0xffffff, 0.35 * a));
  const k = new THREE.DirectionalLight(0xffffff, 2.2 * a); k.position.set(3, 5, 6); c.scene.add(k);
  const r = new THREE.PointLight(c.colors[2].getHex(), 40 * a, 30); r.position.set(-5, -2, 4); c.scene.add(r);
  return { k, r };
}

function background(c: Ctx) {
  c.scene.background = c.colors[0];
}

function photoMaterial(tex: THREE.Texture) { return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide }); }

function coverUV(tex: THREE.Texture, planeAspect: number) {
  const t = tex.clone();
  const img = tex.image as { width: number; height: number };
  const ia = img.width / img.height;
  if (ia > planeAspect) { t.repeat.set(planeAspect / ia, 1); t.offset.set((1 - planeAspect / ia) / 2, 0); }
  else { t.repeat.set(1, ia / planeAspect); t.offset.set(0, (1 - ia / planeAspect) / 2); }
  t.needsUpdate = true;
  return t;
}

const titleRow = (c: Ctx, yMain: number, ySub: number) => {
  const g = new THREE.Group();
  const main = text3D(c, c.text, { width: fitWidth(c) });
  main.position.y = yMain;
  const sub = text3D(c, c.sub, { width: fitWidth(c) * 0.72, depth: 0.08, maxSize: 0.3, material: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.2, roughness: 0.4 }) });
  sub.position.y = ySub;
  g.add(main, sub);
  return { g, main, sub };
};

const BUILDERS: Record<string, Builder> = {
  logoSpin(c) {
    background(c); standardLights(c);
    const { g, main, sub } = titleRow(c, 0.25, -1.0);
    c.scene.add(g);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(fitWidth(c) * 0.62, 0.035, 12, 96), new THREE.MeshStandardMaterial({ color: c.colors[2], metalness: 0.9, roughness: 0.2, envMap: c.env, emissive: c.colors[2], emissiveIntensity: 0.4 }));
    ring.rotation.x = 1.25; c.scene.add(ring);
    return (t, p) => {
      const e = easeOut(t / 1.3);
      main.rotation.y = (1 - e) * 6.283 + Math.sin(t * 0.8) * 0.12;
      main.scale.setScalar(0.2 + 0.8 * back(t / 1.1));
      sub.position.y = -1.0 - (1 - easeOut((t - 0.8) / 0.7)) * 1.5;
      sub.visible = t > 0.75;
      ring.rotation.z = t * 0.9; ring.scale.setScalar(0.4 + 0.6 * easeOut(t / 1.5));
      c.camera.position.set(Math.sin(t * 0.5) * 0.7, 0.3, 7.4 - p * 0.8);
      c.camera.lookAt(0, -0.1, 0);
    };
  },
  textFly(c) {
    background(c); standardLights(c);
    const chars = [...c.text];
    // Letters sit on a shared baseline with their real widths, so words keep their shape once they land.
    const glyphs = (c.font as unknown as { data: { glyphs: Record<string, { ha: number }>; resolution: number } }).data;
    const adv = chars.map(ch => (glyphs.glyphs[ch]?.ha ?? glyphs.glyphs['?']?.ha ?? 600) / glyphs.resolution);
    const totalAdv = adv.reduce((p, x) => p + x, 0) || 1;
    const k = Math.min(1.25, fitWidth(c) / totalAdv);
    const mat = new THREE.MeshStandardMaterial({ color: c.colors[1], metalness: 0.85, roughness: 0.22, envMap: c.env });
    const letters: { m: THREE.Group; x: number; r: number }[] = [];
    let cursor = -totalAdv / 2;
    chars.forEach((ch, i) => {
      const g = new THREE.Group();
      if (ch.trim()) {
        const geo = new THREE.ExtrudeGeometry(c.font.generateShapes(ch, 1), { depth: 0.28, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.028, bevelSegments: 3, curveSegments: 6 });
        geo.translate(-adv[i] / 2, -0.36, -0.14);
        const m = new THREE.Mesh(geo, mat);
        m.scale.setScalar(k);
        g.add(m);
      }
      c.scene.add(g);
      letters.push({ m: g, x: (cursor + adv[i] / 2) * k, r: i });
      cursor += adv[i];
    });
    const sub = text3D(c, c.sub, { width: fitWidth(c) * 0.7, depth: 0.08, maxSize: 0.4, material: new THREE.MeshStandardMaterial({ color: c.colors[2], metalness: 0.3, roughness: 0.4 }) });
    c.scene.add(sub);
    return (t, p) => {
      letters.forEach(l => {
        const q = easeOut((t - l.r * 0.07) / 0.8);
        l.m.position.set(l.x * (1 + (1 - q) * 3), (1 - q) * Math.sin(l.r * 2.3) * 5 + 0.3, (1 - q) * -30);
        l.m.rotation.set((1 - q) * 4, (1 - q) * 5 + Math.sin(t + l.r) * 0.1, 0);
      });
      sub.position.y = -1.1 + (1 - easeOut((t - 1.1) / 0.6)) * -1.4;
      sub.visible = t > 1.05;
      c.camera.position.set(0, 0, 7 - p * 0.6); c.camera.lookAt(0, 0, 0);
    };
  },
  cubePhotos(c) {
    background(c); standardLights(c);
    const mats = Array.from({ length: 6 }, (_, i) => photoMaterial(coverUV(c.tex[i % c.tex.length], 1)));
    const cube = new THREE.Mesh(new THREE.BoxGeometry(2.7, 2.7, 2.7), mats);
    c.scene.add(cube);
    return (t) => {
      const e = back(t / 0.9);
      cube.scale.setScalar(e);
      cube.rotation.set(0.42 + Math.sin(t * 0.5) * 0.25, t * 0.9, 0);
      c.camera.position.set(0, 0, c.aspect < 1 ? 9.4 : 5.6); c.camera.lookAt(0, 0, 0);
    };
  },
  carousel(c) {
    background(c); standardLights(c);
    const n = 8, R = 3.3;
    const group = new THREE.Group();
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.8), photoMaterial(coverUV(c.tex[i % c.tex.length], 0.75)));
      const a = (i / n) * Math.PI * 2;
      m.position.set(Math.sin(a) * R, 0, Math.cos(a) * R); m.rotation.y = a;
      group.add(m);
    }
    c.scene.add(group);
    const { g, main } = titleRow(c, -3.1, -3.9);
    c.scene.add(g);
    return (t) => {
      group.rotation.y = t * 0.65;
      group.scale.setScalar(0.6 + 0.4 * easeOut(t / 1));
      main.scale.setScalar(easeOut((t - 0.4) / 0.6) + 1e-3);
      c.camera.position.set(0, 1.6, c.aspect < 1 ? 15 : 9.2); c.camera.lookAt(0, -0.6, 0);
    };
  },
  galleryWall(c) {
    background(c);
    c.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 18), new THREE.MeshStandardMaterial({ color: c.colors[0].clone().offsetHSL(0, 0, 0.14), roughness: 0.95 }));
    wall.position.set(0, 0, -0.1); c.scene.add(wall);
    const frames: THREE.Object3D[] = [];
    for (let i = 0; i < 12; i++) {
      const x = i * 3.8 - 2, y = i % 2 ? 1.0 : -1.0;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(3.05, 2.45, 0.14), new THREE.MeshStandardMaterial({ color: c.colors[2], metalness: 0.8, roughness: 0.3, envMap: c.env }));
      frame.position.set(x, y, 0.05);
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.2), photoMaterial(coverUV(c.tex[i % c.tex.length], 2.8 / 2.2)));
      pic.position.z = 0.09; frame.add(pic);
      const spot = new THREE.SpotLight(0xfff1d6, 26, 7, 0.65, 0.6); spot.position.set(x, y + 1.6, 3); spot.target = frame;
      c.scene.add(frame, spot); frames.push(frame);
    }
    return (t) => {
      c.camera.position.set(t * 2.1, Math.sin(t * 0.6) * 0.3, c.aspect < 1 ? 6.2 : 4.6);
      c.camera.lookAt(t * 2.1 + 1.4, 0, 0);
    };
  },
  galaxy(c) {
    background(c); standardLights(c, 0.8);
    const r = rng(5), N = 7000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const arm = i % 4, d = Math.pow(r(), 1.8) * 9, a = arm * 1.5708 + d * 0.85 + (r() - 0.5) * 0.6;
      pos.set([Math.cos(a) * d, (r() - 0.5) * (1.2 - d * 0.09), Math.sin(a) * d], i * 3);
      const k = c.colors[1].clone().lerp(c.colors[2], d / 9);
      col.set([k.r, k.g, k.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.05, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    c.scene.add(pts);
    const { g, main } = titleRow(c, 0, -1);
    c.scene.add(g);
    return (t, p) => {
      pts.rotation.y = t * 0.25;
      pts.rotation.x = 0.45;
      main.scale.setScalar(0.4 + 0.6 * easeOut((t - 0.4) / 1));
      main.rotation.y = Math.sin(t * 0.6) * 0.25;
      c.camera.position.set(0, 0.6, 11 - 3 * easeIO(p)); c.camera.lookAt(0, 0, 0);
    };
  },
  shapes(c) {
    background(c); standardLights(c);
    const r = rng(11), geos = [new THREE.TorusGeometry(0.5, 0.2, 16, 48), new THREE.IcosahedronGeometry(0.6), new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.SphereGeometry(0.5, 32, 24), new THREE.ConeGeometry(0.5, 0.9, 32), new THREE.TorusKnotGeometry(0.38, 0.13, 96, 12)];
    const items = Array.from({ length: 24 }, (_, i) => {
      const m = new THREE.Mesh(geos[i % geos.length], new THREE.MeshStandardMaterial({ color: i % 2 ? c.colors[1] : c.colors[2], metalness: 0.55, roughness: 0.25, envMap: c.env }));
      c.scene.add(m);
      return { m, x: (r() - 0.5) * 11, y: (r() - 0.5) * 11, z: -2 - r() * 7, s: r() * 2 + 0.5, ph: r() * 6 };
    });
    const { g, main } = titleRow(c, 0.1, -1.05);
    c.scene.add(g);
    return (t, p) => {
      items.forEach(i => {
        i.m.position.set(i.x + Math.sin(t * 0.4 + i.ph) * 0.5, i.y + Math.cos(t * 0.5 + i.ph) * 0.6, i.z);
        i.m.rotation.set(t * 0.4 * i.s, t * 0.3 * i.s, i.ph);
      });
      main.scale.setScalar(back(t / 0.9) + 1e-3);
      c.camera.position.set(Math.sin(t * 0.4) * 0.6, 0, 7.5 - p * 0.7); c.camera.lookAt(0, 0, 0);
    };
  },
  globe(c) {
    background(c); standardLights(c);
    const r = rng(3);
    const cnv = document.createElement('canvas'); cnv.width = 1024; cnv.height = 512;
    const x = cnv.getContext('2d')!; x.fillStyle = '#0b3a78'; x.fillRect(0, 0, 1024, 512);
    x.fillStyle = '#2bb7a6';
    for (let i = 0; i < 28; i++) { const px = r() * 1024, py = 70 + r() * 370; for (let j = 0; j < 26; j++) { x.beginPath(); x.arc(px + (r() - 0.5) * 120, py + (r() - 0.5) * 70, 5 + r() * 22, 0, 7); x.fill(); } }
    const map = new THREE.CanvasTexture(cnv); map.colorSpace = THREE.SRGBColorSpace;
    const globe = new THREE.Mesh(new THREE.SphereGeometry(2, 64, 48), new THREE.MeshStandardMaterial({ map, roughness: 0.65, metalness: 0.1 }));
    c.scene.add(globe);
    const atm = new THREE.Mesh(new THREE.SphereGeometry(2.1, 48, 32), new THREE.MeshBasicMaterial({ color: c.colors[2], transparent: true, opacity: 0.14, side: THREE.BackSide }));
    c.scene.add(atm);
    const { g, main } = titleRow(c, -2.75, -3.6);
    c.scene.add(g);
    return (t) => {
      globe.rotation.y = t * 0.45; globe.rotation.z = 0.3;
      globe.scale.setScalar(0.5 + 0.5 * easeOut(t / 1.1));
      main.scale.setScalar(easeOut((t - 0.5) / 0.7) + 1e-3);
      c.camera.position.set(0, -0.4, c.aspect < 1 ? 10.5 : 8.4); c.camera.lookAt(0, -0.6, 0);
    };
  },
  ringTunnel(c) {
    background(c); standardLights(c, 0.7);
    const rings = Array.from({ length: 28 }, (_, i) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.05, 10, 72), new THREE.MeshBasicMaterial({ color: i % 2 ? c.colors[1] : c.colors[2] }));
      m.position.z = -i * 2.2; c.scene.add(m);
      return m;
    });
    c.scene.fog = new THREE.Fog(c.colors[0].getHex(), 2, 42);
    const { g, main } = titleRow(c, 0, -1);
    c.scene.add(g);
    return (t, p) => {
      rings.forEach((m, i) => { m.position.x = Math.sin(i * 0.35 + t) * 0.5; m.position.y = Math.cos(i * 0.28 + t) * 0.5; m.rotation.z = t + i * 0.2; });
      const z = 6 - t * 7;
      c.camera.position.set(0, 0, z); c.camera.lookAt(0, 0, z - 10);
      const k = easeOut((p - 0.45) / 0.4);
      g.position.z = z - 7;
      g.visible = k > 0;
      main.scale.setScalar(k + 1e-3);
    };
  },
  podium(c) {
    background(c); standardLights(c, 0.45);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.5, 0.5, 64), new THREE.MeshStandardMaterial({ color: 0x20232f, metalness: 0.9, roughness: 0.25, envMap: c.env }));
    base.position.y = -1.7; c.scene.add(base);
    const trim = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.035, 12, 96), new THREE.MeshBasicMaterial({ color: c.colors[1] }));
    trim.rotation.x = Math.PI / 2; trim.position.y = -1.44; c.scene.add(trim);
    const card = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3), photoMaterial(coverUV(c.tex[0], 0.8)));
    card.position.y = 0.05; c.scene.add(card);
    const sp1 = new THREE.SpotLight(0xffffff, 140, 18, 0.5, 0.5); sp1.position.set(4, 5, 5); sp1.target = card; c.scene.add(sp1);
    const sp2 = new THREE.SpotLight(c.colors[1].getHex(), 110, 18, 0.5, 0.5); sp2.position.set(-4, 5, 5); sp2.target = card; c.scene.add(sp2);
    const { g, main, sub } = titleRow(c, 2.45, -2.75);
    c.scene.add(g);
    return (t) => {
      card.rotation.y = Math.sin(t * 0.9) * 0.55;
      card.scale.setScalar(back(t / 0.8) + 1e-3);
      main.scale.setScalar(easeOut((t - 0.5) / 0.6) + 1e-3);
      sub.visible = t > 0.9;
      c.camera.position.set(Math.sin(t * 0.3) * 1.2, 0.5, c.aspect < 1 ? 11 : 8.8); c.camera.lookAt(0, 0, 0);
    };
  },
  flipGrid(c) {
    background(c); standardLights(c);
    const cols = c.aspect < 1 ? 3 : 4, rows = c.aspect < 1 ? 5 : 3, size = 1.5;
    const cards: { m: THREE.Mesh; d: number }[] = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const back_ = new THREE.MeshStandardMaterial({ color: (x + y) % 2 ? c.colors[1] : c.colors[2], metalness: 0.6, roughness: 0.3, envMap: c.env });
      const front = photoMaterial(coverUV(c.tex[(x + y * cols) % c.tex.length], 1));
      const m = new THREE.Mesh(new THREE.BoxGeometry(size * 0.96, size * 0.96, 0.08), [back_, back_, back_, back_, front, back_]);
      m.position.set((x - (cols - 1) / 2) * size, (y - (rows - 1) / 2) * size, 0);
      c.scene.add(m);
      cards.push({ m, d: (x + rows - y) * 0.14 });
    }
    return (t) => {
      cards.forEach(k => { k.m.rotation.y = Math.PI * (1 - easeOut((t - k.d) / 0.8)); });
      const fit = c.aspect < 1 ? 11 : 8;
      c.camera.position.set(Math.sin(t * 0.5) * 0.8, Math.cos(t * 0.4) * 0.4, fit); c.camera.lookAt(0, 0, 0);
    };
  },
  synthwave(c) {
    background(c);
    c.scene.fog = new THREE.Fog(c.colors[0].getHex(), 8, 40);
    const grid = new THREE.GridHelper(80, 60, c.colors[1].getHex(), c.colors[1].getHex());
    c.scene.add(grid);
    const sun = new THREE.Mesh(new THREE.CircleGeometry(6, 64), new THREE.ShaderMaterial({
      fog: false,
      uniforms: { a: { value: c.colors[1] }, b: { value: new THREE.Color('#ffd23d') } },
      vertexShader: 'varying vec2 u;void main(){u=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'varying vec2 u;uniform vec3 a,b;void main(){float y=u.y;if(y<.5&&fract(y*16.)<.38*(1.-y*1.6))discard;gl_FragColor=vec4(mix(a,b,y),1.);}',
    }));
    sun.position.set(0, 4.5, -34); c.scene.add(sun);
    standardLights(c);
    const { g, main } = titleRow(c, 3.0, 2.0);
    c.scene.add(g);
    return (t) => {
      grid.position.z = (t * 6) % (80 / 60);
      main.scale.setScalar(back((t - 0.2) / 0.8) + 1e-3);
      main.rotation.x = Math.sin(t) * 0.08;
      c.camera.position.set(Math.sin(t * 0.4) * 0.6, 1.4, 9); c.camera.lookAt(0, 2.6, -8);
    };
  },
  confetti(c) {
    background(c); standardLights(c);
    const N = 420, r = rng(9);
    const inst = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.14, 0.24), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.5 }), N);
    const seeds = Array.from({ length: N }, () => ({ x: (r() - 0.5) * 14, y: r() * 16, z: (r() - 0.5) * 8, sp: 1 + r() * 1.6, ph: r() * 6 }));
    const pal = [c.colors[1], c.colors[2], new THREE.Color('#39d6c6'), new THREE.Color('#ffffff'), new THREE.Color('#7b5cff')];
    seeds.forEach((_, i) => inst.setColorAt(i, pal[i % pal.length]));
    c.scene.add(inst);
    const d = new THREE.Object3D();
    const { g, main, sub } = titleRow(c, 0.35, -0.85);
    c.scene.add(g);
    return (t) => {
      seeds.forEach((s, i) => {
        d.position.set(s.x + Math.sin(t * 2 + s.ph) * 0.35, 8 - ((s.y + t * s.sp * 2.1) % 16), s.z);
        d.rotation.set(t * 3 + s.ph, t * 2 + s.ph, s.ph);
        d.updateMatrix(); inst.setMatrixAt(i, d.matrix);
      });
      inst.instanceMatrix.needsUpdate = true;
      main.scale.setScalar(back(t / 0.7) + 1e-3);
      sub.visible = t > 0.6;
      c.camera.position.set(0, 0, 8); c.camera.lookAt(0, 0, 0);
    };
  },
  coins(c) {
    background(c); standardLights(c);
    const N = 70, r = rng(21);
    const mat = new THREE.MeshStandardMaterial({ color: c.colors[1], metalness: 1, roughness: 0.25, envMap: c.env });
    const inst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 32), mat, N);
    const seeds = Array.from({ length: N }, () => ({ x: (r() - 0.5) * 12, y: r() * 16, z: -1 - r() * 7, sp: 1 + r() * 1.2, ph: r() * 6 }));
    c.scene.add(inst);
    const d = new THREE.Object3D();
    const { g, main, sub } = titleRow(c, 0.4, -0.85);
    c.scene.add(g);
    return (t) => {
      seeds.forEach((s, i) => {
        d.position.set(s.x, 8 - ((s.y + t * s.sp * 2.5) % 16), s.z);
        d.rotation.set(t * 3 + s.ph, t * 1.5, s.ph);
        d.updateMatrix(); inst.setMatrixAt(i, d.matrix);
      });
      inst.instanceMatrix.needsUpdate = true;
      const k = back(t / 0.7);
      main.scale.setScalar(k * (1 + Math.sin(t * 5) * 0.015) + 1e-3);
      sub.scale.setScalar(easeOut((t - 0.5) / 0.5) + 1e-3);
      c.camera.position.set(0, 0, 8); c.camera.lookAt(0, 0, 0);
    };
  },
  phone(c) {
    background(c); standardLights(c);
    const phone = new THREE.Group();
    const shape = new THREE.Shape();
    const w = 1.5, h = 3.1, R = 0.22;
    shape.moveTo(-w + R, -h); shape.lineTo(w - R, -h); shape.quadraticCurveTo(w, -h, w, -h + R); shape.lineTo(w, h - R); shape.quadraticCurveTo(w, h, w - R, h); shape.lineTo(-w + R, h); shape.quadraticCurveTo(-w, h, -w, h - R); shape.lineTo(-w, -h + R); shape.quadraticCurveTo(-w, -h, -w + R, -h);
    const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 3 }), new THREE.MeshStandardMaterial({ color: 0x14161d, metalness: 0.95, roughness: 0.25, envMap: c.env }));
    body.position.z = -0.12; phone.add(body);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 5.9), new THREE.MeshBasicMaterial({ map: coverUV(c.tex[0], 2.8 / 5.9) }));
    screen.position.z = 0.115; phone.add(screen);
    c.scene.add(phone);
    const { g, main, sub } = titleRow(c, c.aspect < 1 ? 4.2 : 1, c.aspect < 1 ? -4.2 : -0.1);
    if (c.aspect >= 1) g.position.x = 2.2;
    phone.position.x = c.aspect >= 1 ? -2.6 : 0;
    c.scene.add(g);
    return (t) => {
      const e = easeOut(t / 1.2);
      phone.rotation.y = (1 - e) * 3.8 + Math.sin(t * 0.8) * 0.28;
      phone.rotation.x = Math.sin(t * 0.5) * 0.06;
      phone.position.y = Math.sin(t * 1.1) * 0.08;
      main.scale.setScalar(easeOut((t - 0.6) / 0.6) + 1e-3);
      sub.scale.setScalar(easeOut((t - 0.8) / 0.6) + 1e-3);
      c.camera.position.set(0, 0, c.aspect < 1 ? 13 : 9.5); c.camera.lookAt(0, 0, 0);
    };
  },
  stackCards(c) {
    background(c); standardLights(c);
    const cards = Array.from({ length: 5 }, (_, i) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(3, 4, 0.05), [0, 1, 2, 3].map(() => new THREE.MeshStandardMaterial({ color: 0xffffff })).concat([photoMaterial(coverUV(c.tex[i % c.tex.length], 0.75)), new THREE.MeshStandardMaterial({ color: 0xffffff })]));
      c.scene.add(m);
      return m;
    });
    return (t, _p, dur) => {
      const per = dur / cards.length;
      cards.forEach((m, i) => {
        const j = cards.length - 1 - i;
        const q = easeIO((t - j * per) / (per * 0.7));
        m.position.set(q * (j % 2 ? -9 : 9), q * 1.5, -i * 0.12);
        m.rotation.set(0, q * (j % 2 ? -0.9 : 0.9), (i - 2) * 0.06 + q * (j % 2 ? 0.4 : -0.4));
      });
      c.camera.position.set(0, 0, c.aspect < 1 ? 7.6 : 6); c.camera.lookAt(0, 0, 0);
    };
  },
  waves(c) {
    background(c); standardLights(c);
    const geo = new THREE.PlaneGeometry(40, 40, 110, 110);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const base = Float32Array.from(pos.array as Float32Array);
    const sea = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: c.colors[1], metalness: 0.15, roughness: 0.55, flatShading: true }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = -2.4; c.scene.add(sea);
    c.scene.fog = new THREE.Fog(c.colors[0].getHex(), 10, 34);
    const { g, main } = titleRow(c, 1.2, 0.1);
    c.scene.add(g);
    return (t) => {
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3], y = base[i * 3 + 1];
        pos.setZ(i, Math.sin(x * 0.45 + t * 1.3) * 0.55 + Math.sin(y * 0.6 + t * 1.1) * 0.45 + Math.sin((x + y) * 0.9 + t * 1.9) * 0.14);
      }
      pos.needsUpdate = true; geo.computeVertexNormals();
      main.scale.setScalar(back(t / 0.8) + 1e-3);
      main.position.y = 1.2 + Math.sin(t * 1.2) * 0.12;
      c.camera.position.set(Math.sin(t * 0.3) * 1, 0.8, 10); c.camera.lookAt(0, 0.4, 0);
    };
  },
  crystal(c) {
    background(c); standardLights(c);
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 0), new THREE.MeshStandardMaterial({ color: c.colors[1], metalness: 1, roughness: 0.08, flatShading: true, envMap: c.env }));
    m.position.y = 1.1; c.scene.add(m);
    const wire = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(2.25, 1)), new THREE.LineBasicMaterial({ color: c.colors[2], transparent: true, opacity: 0.35 }));
    wire.position.y = 1.1; c.scene.add(wire);
    const { g, main, sub } = titleRow(c, -1.65, -2.55);
    c.scene.add(g);
    return (t) => {
      m.rotation.set(t * 0.5, t * 0.8, 0); wire.rotation.set(-t * 0.3, -t * 0.4, 0);
      m.scale.setScalar(back(t / 0.9) + 1e-3);
      main.scale.setScalar(easeOut((t - 0.4) / 0.6) + 1e-3);
      sub.visible = t > 0.75;
      c.camera.position.set(0, 0, c.aspect < 1 ? 10.5 : 8); c.camera.lookAt(0, 0, 0);
    };
  },
  pillars(c) {
    background(c); standardLights(c);
    const n = 15;
    const bars = Array.from({ length: n * n }, (_, i) => {
      const x = (i % n) - n / 2, z = Math.floor(i / n) - n / 2;
      const col = c.colors[1].clone().lerp(c.colors[2], (x + n / 2) / n);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1, 0.72), new THREE.MeshStandardMaterial({ color: col, metalness: 0.2, roughness: 0.5, emissive: col, emissiveIntensity: 0.08 }));
      m.position.set(x, -2, z - 2); c.scene.add(m);
      return { m, x, z };
    });
    const { g, main } = titleRow(c, 3.6, 2.6);
    c.scene.add(g);
    return (t) => {
      bars.forEach(b => {
        const d = Math.hypot(b.x, b.z);
        const h = 0.4 + 2.4 * Math.pow(0.5 + 0.5 * Math.sin(d * 0.9 - t * 4), 2);
        b.m.scale.y = h; b.m.position.y = -2.2 + h / 2;
      });
      main.scale.setScalar(back(t / 0.7) + 1e-3);
      c.camera.position.set(Math.sin(t * 0.3) * 4, 5, 11); c.camera.lookAt(0, 0.5, 0);
    };
  },
  balloons(c) {
    background(c); standardLights(c);
    const r = rng(33), pal = [c.colors[1], c.colors[2], new THREE.Color('#39d6c6'), new THREE.Color('#7b5cff')];
    const geo = new THREE.SphereGeometry(0.62, 32, 24); geo.scale(1, 1.2, 1);
    const items = Array.from({ length: 26 }, (_, i) => {
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: pal[i % 4], metalness: 0.25, roughness: 0.12, envMap: c.env }));
      c.scene.add(m);
      return { m, x: (r() - 0.5) * 12, y: r() * 16, z: -1.5 - r() * 6, sp: 0.6 + r() * 0.6, ph: r() * 6 };
    });
    const { g, main, sub } = titleRow(c, 0.3, -0.75);
    c.scene.add(g);
    return (t) => {
      items.forEach(i => {
        i.m.position.set(i.x + Math.sin(t + i.ph) * 0.3, ((i.y + t * i.sp * 1.6) % 16) - 8, i.z);
        i.m.rotation.z = Math.sin(t + i.ph) * 0.14;
      });
      main.scale.setScalar(back(t / 0.8) + 1e-3);
      sub.visible = t > 0.7;
      c.camera.position.set(0, 0, 8); c.camera.lookAt(0, 0, 0);
    };
  },
};

function fallbackTexture(colors: THREE.Color[], i: number) {
  const cnv = document.createElement('canvas'); cnv.width = 512; cnv.height = 640;
  const x = cnv.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 512, 640);
  g.addColorStop(0, `#${colors[1].getHexString()}`); g.addColorStop(1, `#${colors[2].getHexString()}`);
  x.fillStyle = g; x.fillRect(0, 0, 512, 640);
  x.fillStyle = 'rgba(255,255,255,.24)';
  x.beginPath(); x.arc(160 + i * 50, 240, 170, 0, 7); x.fill();
  x.fillStyle = 'rgba(0,0,0,.22)';
  x.beginPath(); x.moveTo(0, 640); x.lineTo(200 + i * 30, 300); x.lineTo(512, 640); x.fill();
  const t = new THREE.CanvasTexture(cnv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Built { scene: THREE.Scene; camera: THREE.PerspectiveCamera; update: Update; key: string }

/** Renders 3D scenes to a separate canvas that the compositor then uses as a clip source. */
export class Scene3DRenderer {
  renderer: THREE.WebGLRenderer;
  private built = new Map<string, Built>();
  private env: THREE.Texture | null = null;

  constructor(private resolveImage: (mediaId: string) => Promise<ImageBitmap | null>) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setPixelRatio(1);
  }

  private keyFor(clip: Clip, aspect: number) { return JSON.stringify([clip.id, clip.scene, clip.sceneParams, aspect.toFixed(3)]); }

  async prepare(clip: Clip, W: number, H: number) {
    const aspect = W / H, key = this.keyFor(clip, aspect);
    if (this.built.has(clip.id) && this.built.get(clip.id)!.key === key) return;
    const def = SCENE_BY_ID.get(clip.scene ?? '') ?? SCENES[0];
    const font = await loadFont();
    const params = clip.sceneParams ?? {};
    const colors = (params.colors?.length ? params.colors : def.colors).map(c => new THREE.Color(c));
    if (!this.env) {
      const pm = new THREE.PMREMGenerator(this.renderer);
      this.env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      pm.dispose();
    }
    const tex: THREE.Texture[] = [];
    for (const id of params.mediaIds ?? []) {
      const bmp = await this.resolveImage(id);
      if (bmp) { const t = new THREE.Texture(bmp as unknown as HTMLImageElement); t.flipY = true; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; tex.push(t); }
    }
    if (!tex.length) for (let i = 0; i < Math.max(1, def.images); i++) tex.push(fallbackTexture(colors, i));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 120);
    const ctx: Ctx = { scene, camera, font, params, colors, tex, aspect, text: params.text ?? def.text, sub: params.sub ?? def.sub ?? '', env: this.env };
    const update = (BUILDERS[def.id] ?? BUILDERS.logoSpin)(ctx);
    this.disposeClip(clip.id);
    this.built.set(clip.id, { scene, camera, update, key });
  }

  /** Draws the scene at local time and returns the canvas holding the pixels. */
  render(clip: Clip, local: number, dur: number, W: number, H: number): HTMLCanvasElement | null {
    const b = this.built.get(clip.id);
    if (!b) return null;
    if (this.renderer.domElement.width !== W || this.renderer.domElement.height !== H) this.renderer.setSize(W, H, false);
    b.update(local, dur > 0 ? Math.min(1, local / dur) : 0, dur);
    this.renderer.render(b.scene, b.camera);
    return this.renderer.domElement;
  }

  private disposeClip(id: string) {
    const b = this.built.get(id);
    if (!b) return;
    b.scene.traverse(o => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach(x => x.dispose()); else mat?.dispose?.();
    });
    this.built.delete(id);
  }

  dispose() { for (const id of [...this.built.keys()]) this.disposeClip(id); this.renderer.dispose(); this.renderer.forceContextLoss(); }
}
