/**
 * The Giza pyramids, seen from the Haram end of the avenue.
 * Real proportions (Khufu 230 m base / 139 m tall, Khafre 215 / 136 with its limestone cap, Menkaure 103 / 62) built as
 * stepped courses (the casing is gone, as it is today) in a sandstone photo texture, and drawn at ~0.6 scale and ~400 m
 * out so the whole group fits the view. Scene fog would swallow them, so they carry their own haze.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { surface, worldUV } from './Environment';

const SCALE = 0.6;

/** Courses of varying height: each is a vertical-walled box whose corners sit on the true slope. */
function stepped(base: number, top: number, h: number, courses: number, seed: number, dark = 0) {
  const parts: THREE.BufferGeometry[] = [];
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const hs = Array.from({ length: courses }, () => 0.7 + rnd() * 0.6);
  const sum = hs.reduce((a, b) => a + b, 0);
  const half = (y: number) => base / 2 - (y / h) * (base / 2 - top / 2);
  let y = 0;
  hs.forEach((k, i) => {
    const ch = (k / sum) * h;
    const lo = half(y),
      hi = half(y + ch);
    // the lower corner touches the slope, the upper step is cut back inside it: a staircase with the true silhouette
    const w = lo - (lo - hi) * 0.18;
    const g = new THREE.BoxGeometry(w * 2, ch, w * 2);
    g.translate(0, y + ch / 2, 0);
    const tone = 0.9 + rnd() * 0.16 - (i < dark ? 0.34 : 0);
    const col = new Float32Array(g.attributes.position.count * 3);
    for (let c = 0; c < col.length; c += 3) {
      col[c] = tone * (i < dark ? 0.95 : 1);
      col[c + 1] = tone * (i < dark ? 0.82 : 0.99);
      col[c + 2] = tone * (i < dark ? 0.78 : 0.96);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    parts.push(g.index ? g.toNonIndexed() : g);
    y += ch;
  });
  const merged = mergeGeometries(parts, false)!;
  return worldUV(merged, 11);
}

/** Smooth limestone cap: a four-sided cone from half-width `hw` at the base. */
function cap(hw: number, h: number) {
  const g = new THREE.ConeGeometry(hw * Math.SQRT2, h, 4, 1, true);
  g.rotateY(Math.PI / 4);
  g.translate(0, h / 2, 0);
  const ni = g.toNonIndexed();
  const col = new Float32Array(ni.attributes.position.count * 3).fill(1);
  ni.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return worldUV(ni, 40);
}

interface Mat {
  m: THREE.MeshStandardMaterial;
  base: THREE.Color;
}
const mats: Mat[] = [];
let group: THREE.Group | null = null;
const dust: THREE.MeshBasicMaterial[] = [];
const haze = new THREE.Color(0xd6c9b0);
let daylight = 1;

function pyramidMat(tint: number): THREE.MeshStandardMaterial {
  const m = surface('pyramid', tint, { vertexColors: true }).clone();
  m.fog = false;
  mats.push({ m, base: new THREE.Color(tint) });
  return m;
}

export function buildPyramids(parent: THREE.Group) {
  const stone = pyramidMat(0xe6c98f);
  const lime = pyramidMat(0xf0e8d4);
  group = new THREE.Group();
  group.userData.city = true;
  // [x, z, base, flat top, height, cap fraction of the height (0 = none), granite courses]
  const defs: [number, number, number, number, number, number, number][] = [
    [40, -540, 230.3, 10, 138.5, 0, 0], // Khufu: the casing and apex are gone, the top is a small platform
    [-135, -670, 215.3, 0, 136.4, 0.28, 0], // Khafre keeps the limestone casing at its top
    [-240, -800, 103.4, 6, 62, 0, 7] // Menkaure: darker granite at the foot
  ];
  defs.forEach(([x, z, base, top, h, capFrac, granite], i) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.scale.setScalar(SCALE);
    g.rotation.y = i === 1 ? 0.012 : -0.02;
    const bodyH = h * (1 - capFrac);
    const topW = capFrac ? base * capFrac : top;
    g.add(new THREE.Mesh(stepped(base, topW, bodyH, capFrac ? 52 : 64, 11 + i * 7, granite), stone));
    if (capFrac) {
      const c = new THREE.Mesh(cap(topW / 2, h - bodyH), lime);
      c.position.y = bodyH;
      g.add(c);
    }
    group!.add(g);
  });
  // dust haze hugging the plateau floor in front of the pyramids, so the ground melts into the base instead of ending in a line
  const gc = document.createElement('canvas');
  gc.width = 4;
  gc.height = 64;
  const gx = gc.getContext('2d')!;
  const grad = gx.createLinearGradient(0, 64, 0, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  gx.fillStyle = grad;
  gx.fillRect(0, 0, 4, 64);
  const gt = new THREE.CanvasTexture(gc);
  for (const [z, w, h, o] of [
    [-300, 1000, 70, 0.7],
    [-420, 1100, 110, 0.75],
    [-520, 1200, 150, 0.6]
  ] as const) {
    const m = new THREE.MeshBasicMaterial({
      map: gt,
      transparent: true,
      depthWrite: false,
      fog: false,
      opacity: o,
      color: haze
    });
    m.userData.o = o;
    dust.push(m);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    p.position.set(0, h / 2 - 2, z);
    p.renderOrder = 2;
    group.add(p);
  }
  group.visible = false;
  parent.add(group);
}

/** The pyramids exist only in the Haram district: hidden everywhere else. */
export function updatePyramids(playerZ: number) {
  if (!group) return;
  group.visible = playerZ < -45;
  if (!group.visible) return;
  const mix = 0.4;
  for (const { m, base } of mats) {
    m.color.copy(base).multiplyScalar(1 - mix * 0.55);
    m.emissive.copy(haze).multiplyScalar(mix * 0.55 * Math.max(0.12, daylight));
  }
  for (const m of dust) {
    m.color.copy(haze).multiplyScalar(Math.max(0.25, daylight));
    m.opacity = (m.userData.o as number) * Math.max(0.35, daylight);
  }
}

export function setPyramidHaze(c: THREE.Color, day: number) {
  haze.copy(c);
  daylight = day;
}
