/**
 * Street trees and palms.
 * - Broadleaf street trees: a tapered trunk with a few limbs and a crown of alpha-tested leaf cards cut from a photographed
 *   leaf scan (Poly Haven "Jacaranda Tree", CC0), bark from the same scan.
 * - Date palms: the Innerscene "Mature date palm tree" model (CC0), instanced; low quality keeps a small procedural palm.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { Q, quality } from '../config/Quality';
import type { Batch } from './Environment';

const BASE = import.meta.env?.BASE_URL ?? '/';
const loader = new THREE.TextureLoader();
const cache = new Map<string, THREE.Texture>();
function tex(file: string, srgb = true) {
  let t = cache.get(file);
  if (!t) {
    t = loader.load(`${BASE}textures/${file}`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = Q.shadows ? 4 : 1;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    cache.set(file, t);
  }
  return t;
}

let leafMat: THREE.MeshStandardMaterial | null = null;
let barkMat: THREE.MeshStandardMaterial | null = null;
const mats = () => {
  leafMat ??= new THREE.MeshStandardMaterial({
    map: tex('leaves_frond.webp'),
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    vertexColors: true,
    roughness: 0.78,
    metalness: 0
  });
  barkMat ??= new THREE.MeshStandardMaterial({ map: tex('bark.webp'), color: 0xb8aa98, roughness: 0.95, vertexColors: false });
  return { leaf: leafMat, bark: barkMat };
};

/** The three fronds of the leaf scan: texture-space bounds (x from the stem to the tip, y from the top) and where the stem sits. */
const FRONDS = [
  { s: 0.16, t: 0.988, top: 0.023, bot: 0.473, ys: 0.219 },
  { s: 0.0, t: 0.43, top: 0.324, bot: 0.695, ys: 0.488 },
  { s: 1.0, t: 0.246, top: 0.59, bot: 0.996, ys: 0.797 }
];

type V3 = [number, number, number];
const v = (x: number, y: number, z: number): V3 => [x, y, z];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** A tapered tube along a polyline. UV: u around, v along (metres / vScale). */
function tube(pts: V3[], radii: number[], radial: number, vScale: number) {
  const pos: number[] = [],
    nor: number[] = [],
    uv: number[] = [],
    idx: number[] = [];
  let run = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)]!,
      b = pts[Math.min(pts.length - 1, i + 1)]!;
    const dir = norm(v(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
    const side = norm(cross(dir, Math.abs(dir[1]) > 0.9 ? v(1, 0, 0) : v(0, 1, 0)));
    const up = cross(side, dir);
    if (i) run += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1], pts[i]![2] - pts[i - 1]![2]);
    for (let k = 0; k <= radial; k++) {
      const an = (k / radial) * Math.PI * 2;
      const c = Math.cos(an),
        s = Math.sin(an);
      const n: V3 = [side[0] * c + up[0] * s, side[1] * c + up[1] * s, side[2] * c + up[2] * s];
      pos.push(pts[i]![0] + n[0] * radii[i]!, pts[i]![1] + n[1] * radii[i]!, pts[i]![2] + n[2] * radii[i]!);
      nor.push(...n);
      uv.push(k / radial, run / vScale);
    }
  }
  for (let i = 0; i < pts.length - 1; i++)
    for (let k = 0; k < radial; k++) {
      const a = i * (radial + 1) + k,
        b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** One leaf card: a bent strip carrying one scanned frond, root at `o`, pointing along `d`, drooping under its own weight. */
function card(
  out: { pos: number[]; nor: number[]; uv: number[]; col: number[]; idx: number[] },
  o: V3,
  d: V3,
  roll: number,
  len: number,
  droop: number,
  fr: (typeof FRONDS)[number],
  centre: V3,
  shade: number,
  segs: number
) {
  const wc = (len * (fr.bot - fr.top)) / Math.abs(fr.t - fr.s);
  const l0 = -((fr.bot - fr.ys) / (fr.bot - fr.top)) * wc,
    l1 = ((fr.ys - fr.top) / (fr.bot - fr.top)) * wc;
  const ref: V3 = Math.abs(d[1]) > 0.9 ? v(1, 0, 0) : v(0, 1, 0);
  let lat = norm(cross(d, ref));
  const up2 = cross(lat, d);
  lat = norm([lat[0] * Math.cos(roll) + up2[0] * Math.sin(roll), lat[1] * Math.cos(roll) + up2[1] * Math.sin(roll), lat[2] * Math.cos(roll) + up2[2] * Math.sin(roll)]);
  const base = out.pos.length / 3;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const a = t * len;
    const dy = -droop * t * t * len;
    for (const [l, vy] of [
      [l0, fr.bot],
      [l1, fr.top]
    ] as const) {
      const p: V3 = [o[0] + d[0] * a + lat[0] * l, o[1] + d[1] * a + lat[1] * l + dy, o[2] + d[2] * a + lat[2] * l];
      out.pos.push(...p);
      // spherical shading: normals point away from the crown centre with a lift, so a leaf mass reads as one soft volume
      const n = norm(v(p[0] - centre[0], p[1] - centre[1] + 0.6, p[2] - centre[2]));
      out.nor.push(...n);
      out.uv.push(fr.s + (fr.t - fr.s) * t, 1 - vy);
      const inner = THREE.MathUtils.clamp(0.55 + 0.45 * ((p[1] - centre[1]) / 2.4 + 0.6), 0.5, 1) * shade;
      out.col.push(inner, inner, inner * 0.98);
    }
  }
  for (let i = 0; i < segs; i++) {
    const a = base + i * 2;
    out.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
}

/** A broadleaf street tree (photographed leaf cards on a bark-textured trunk). Heights 6-8.5 m. */
export function tree(b: Batch, x: number, z: number, rnd: () => number = Math.random) {
  const { leaf, bark } = mats();
  const H = 6 + rnd() * 2.5;
  const radial = quality === 'low' ? 5 : 8;
  // trunk with a slight lean
  const lean: V3 = [(rnd() - 0.5) * 0.8, 0, (rnd() - 0.5) * 0.8];
  const trunk: V3[] = [],
    tr: number[] = [];
  const nTr = 5;
  for (let i = 0; i <= nTr; i++) {
    const t = i / nTr;
    trunk.push(v(x + lean[0] * t * t, t * H * 0.62, z + lean[2] * t * t));
    tr.push(0.2 * (1 - t) + 0.1 * t);
  }
  b.add(tube(trunk, tr, radial, 1.4), bark);
  const top = trunk[nTr]!;
  const centre: V3 = [top[0], top[1] + H * 0.2, top[2]];
  const cards = { pos: [] as number[], nor: [] as number[], uv: [] as number[], col: [] as number[], idx: [] as number[] };
  const limbs = quality === 'low' ? 3 : 5;
  const nCards = quality === 'low' ? 46 : quality === 'medium' ? 110 : 170;
  const crownR = 2.1 + H * 0.12;
  const crownH = 1.5 + H * 0.12;
  const per = Math.ceil(nCards / (limbs + 1));
  const addCards = (o: V3, spread: number, count: number) => {
    for (let i = 0; i < count; i++) {
      const ang = rnd() * Math.PI * 2;
      const out = v(Math.cos(ang), 0.15 + rnd() * 0.35, Math.sin(ang));
      const pRad = Math.pow(rnd(), 0.6) * spread;
      const pAng = rnd() * Math.PI * 2;
      const origin: V3 = [o[0] + Math.cos(pAng) * pRad, o[1] + (rnd() - 0.4) * crownH, o[2] + Math.sin(pAng) * pRad];
      const d = norm(v(out[0] + (rnd() - 0.5) * 0.5, out[1], out[2] + (rnd() - 0.5) * 0.5));
      card(cards, origin, d, rnd() * Math.PI, 1.0 + rnd() * 0.7, 0.12 + rnd() * 0.22, FRONDS[Math.floor(rnd() * 3)]!, centre, 0.85 + rnd() * 0.3, 3);
    }
  };
  // limbs from the top of the trunk, each carrying a cluster of leaf cards
  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * Math.PI * 2 + rnd() * 0.8;
    const len = crownR * (0.55 + rnd() * 0.35);
    const o = top;
    const mid: V3 = [o[0] + Math.cos(a) * len * 0.5, o[1] + len * 0.35, o[2] + Math.sin(a) * len * 0.5];
    const end: V3 = [o[0] + Math.cos(a) * len, o[1] + len * 0.55, o[2] + Math.sin(a) * len];
    b.add(tube([o, mid, end], [0.085, 0.06, 0.03], Math.max(4, radial - 2), 1.2), bark);
    addCards(end, crownR * 0.55, per);
  }
  addCards([centre[0], centre[1] + 0.4, centre[2]], crownR * 0.45, per);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(cards.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(cards.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(cards.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cards.col, 3));
  g.setIndex(cards.idx);
  b.add(g, leaf);
}

// ---------- date palms ----------
interface PalmSpot {
  x: number;
  z: number;
  h: number;
}
const palmQueue: PalmSpot[] = [];

/** Small procedural palm for low quality (trunk + a ring of arched fronds). */
function palmLow(b: Batch, x: number, z: number, h: number) {
  const { bark } = mats();
  const pts: V3[] = [];
  const lean = (Math.random() - 0.5) * 0.5;
  for (let i = 0; i <= 4; i++) pts.push(v(x + lean * (i / 4) ** 2, (i / 4) * h, z));
  b.add(tube(pts, [0.22, 0.2, 0.17, 0.15, 0.13], 5, 1.2), bark);
  const top = pts[4]!;
  const out = { pos: [] as number[], nor: [] as number[], uv: [] as number[], col: [] as number[], idx: [] as number[] };
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + Math.random() * 0.3;
    card(out, top, norm(v(Math.cos(a), 0.45, Math.sin(a))), 0, 2.2, 0.35, FRONDS[0]!, [top[0], top[1] - 0.5, top[2]], 0.9, 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(out.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
  g.setIndex(out.idx);
  b.add(g, mats().leaf);
}

/** Palm at (x, z), `h` metres tall. Medium and high quality queue an instance of the real model; see flushPalms. */
export function palm(b: Batch, x: number, z: number, h = 7 + Math.random() * 2) {
  if (quality === 'low') palmLow(b, x, z, h);
  else palmQueue.push({ x, z, h });
}

/** Instantiate every queued palm from the CC0 date-palm model (one InstancedMesh per part). */
export function flushPalms(group: THREE.Group) {
  const spots = palmQueue.splice(0);
  if (!spots.length) return;
  new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .loadAsync(`${BASE}models/palm-date.glb`)
    .then((gltf) => {
      gltf.scene.updateMatrixWorld(true);
      const m4 = new THREE.Matrix4(),
        q = new THREE.Quaternion(),
        sc = new THREE.Vector3(),
        pos = new THREE.Vector3(),
        e = new THREE.Euler();
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        mat.roughness = 0.85;
        mat.metalness = 0;
        mat.side = THREE.DoubleSide;
        if (/leaf|foliage/i.test(mat.name)) mat.color.multiplyScalar(0.8);
        const im = new THREE.InstancedMesh(mesh.geometry, mat, spots.length);
        spots.forEach((s, i) => {
          const k = s.h / 12;
          e.set(0, ((s.x * 13.7 + s.z * 7.1) % 6.28), 0);
          q.setFromEuler(e);
          m4.compose(pos.set(s.x, 0, s.z), q, sc.set(k, k, k)).multiply(mesh.matrixWorld);
          im.setMatrixAt(i, m4);
        });
        im.castShadow = Q.shadows;
        im.userData.dynamic = true;
        im.frustumCulled = false;
        group.add(im);
      });
    })
    .catch(() => {
      /* palms are decoration: the street works without them */
    });
}
