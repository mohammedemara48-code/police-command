/** Street-level environment: PBR ground materials, kerbs, props, the sea and the corniche promenade. */
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Q } from '../config/Quality';
import { palm } from './Trees';

const BASE = (import.meta.env?.BASE_URL ?? '/') + 'textures/';
const loader = new THREE.TextureLoader();
const texCache = new Map<string, THREE.Texture>();

export function tex(file: string, srgb: boolean) {
  let t = texCache.get(file);
  if (!t) {
    t = loader.load(BASE + file);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = Q.shadows ? 4 : 1;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(file, t);
  }
  return t;
}

export type Surface = 'asphalt' | 'paving' | 'concrete' | 'desert' | 'pyramid' | 'stone' | 'park' | 'steel';
const matCache = new Map<string, THREE.MeshStandardMaterial>();

/** Texture set per surface: `lo` marks sets that also ship a 512 px colour map for low quality. */
const SETS: Record<Surface, { base: string; lo: boolean }> = {
  asphalt: { base: 'road', lo: true },
  paving: { base: 'sidewalk', lo: true },
  concrete: { base: 'concrete', lo: false },
  desert: { base: 'desert', lo: true },
  pyramid: { base: 'pyramid', lo: true },
  stone: { base: 'stone', lo: true },
  park: { base: 'park', lo: true },
  steel: { base: 'steel', lo: false }
};

/**
 * Shared PBR material (CC0 photo textures from ambientCG and Poly Haven: colour / normal / roughness).
 * Geometry needs world-space UVs (see worldUV). Low quality uses the small colour map and skips the normal map.
 */
export function surface(name: Surface, tint = 0xffffff, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const key = name + tint;
  let m = matCache.get(key);
  if (!m) {
    const set = SETS[name];
    m = new THREE.MeshStandardMaterial({
      color: tint,
      map: tex(`${set.base}_color${set.lo && !Q.hdri ? '_lo' : ''}.webp`, true),
      roughnessMap: tex(`${set.base}_rough.webp`, false),
      normalMap: Q.hdri ? tex(`${set.base}_normal.webp`, false) : null,
      roughness: 1,
      metalness: 0,
      ...opts
    });
    m.normalScale.setScalar(name === 'asphalt' ? 0.8 : 1);
    matCache.set(key, m);
  }
  return m;
}

/** Planar world-space UVs so textures tile at a constant size however long a road or wall is. */
export function worldUV(geo: THREE.BufferGeometry, size: number) {
  const p = geo.attributes.position,
    n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const nx = Math.abs(n.getX(i)),
      ny = Math.abs(n.getY(i)),
      nz = Math.abs(n.getZ(i));
    const [u, v] = ny >= nx && ny >= nz ? [x, z] : nx >= nz ? [z, y] : [x, y];
    uv[i * 2] = u / size;
    uv[i * 2 + 1] = v / size;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** [a0,a1] minus a gap of half-width `gap` around each cut. */
export function segments(a0: number, a1: number, cuts: number[], gap: number): [number, number][] {
  const out: [number, number][] = [];
  let s = a0;
  for (const c of [...cuts].sort((a, b) => a - b)) {
    if (c + gap < a0 || c - gap > a1) continue;
    if (c - gap > s) out.push([s, c - gap]);
    s = Math.max(s, c + gap);
  }
  if (a1 > s) out.push([s, a1]);
  return out;
}

/** Box geometries accumulated per material, then merged into one mesh each. */
export class Batch {
  private m = new Map<THREE.Material, THREE.BufferGeometry[]>();
  constructor(private uvSize = new Map<THREE.Material, number>()) {}
  add(geo: THREE.BufferGeometry, mat: THREE.Material, uv?: number) {
    if (uv) this.uvSize.set(mat, uv);
    if (!this.m.has(mat)) this.m.set(mat, []);
    this.m.get(mat)!.push(geo.index ? geo.toNonIndexed() : geo);
    if (geo.index) geo.dispose();
  }
  box(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, uv?: number) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    this.add(g, mat, uv);
  }
  flush(group: THREE.Object3D, shadows = false) {
    for (const [mat, geos] of this.m) {
      const keep = (mat as THREE.MeshStandardMaterial).vertexColors ? ['position', 'normal', 'uv', 'color'] : ['position', 'normal', 'uv'];
      for (const g of geos) for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k);
      const size = this.uvSize.get(mat);
      if (size) geos.forEach((g) => worldUV(g, size));
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.receiveShadow = true;
      mesh.castShadow = shadows;
      mesh.userData.dynamic = true;
      group.add(mesh);
    }
    this.m.clear();
  }
}

// ---------- props ----------
const M = {
  metal: new THREE.MeshStandardMaterial({ color: 0x2b3036, roughness: 0.4, metalness: 0.7 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.75 }),
  bin: new THREE.MeshStandardMaterial({ color: 0x2f5f3e, roughness: 0.55, metalness: 0.3 }),
  lampHead: new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0xffc56a, emissiveIntensity: 2.4 }),
  signRed: new THREE.MeshStandardMaterial({ color: 0xc8202a, roughness: 0.5 }),
  signBlue: new THREE.MeshStandardMaterial({ color: 0x1f5fb8, roughness: 0.5 }),
  white: new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.5 }),
  paint: new THREE.MeshStandardMaterial({
    color: 0xc4c1b6,
    roughness: 0.88,
    emissive: 0x333333,
    emissiveIntensity: 0.12
  }),
  yellow: new THREE.MeshStandardMaterial({
    color: 0xf0c040,
    roughness: 0.6,
    emissive: 0x6a5000,
    emissiveIntensity: 0.3
  })
};
export const PROP_MATS = M;

export function bench(b: Batch, x: number, z: number, ry: number) {
  const rot = (gx: number, gz: number) => [
    x + gx * Math.cos(ry) + gz * Math.sin(ry),
    z - gx * Math.sin(ry) + gz * Math.cos(ry)
  ];
  for (let s = 0; s < 3; s++) {
    const [sx, sz] = rot(0, -0.18 + s * 0.13);
    b.box(M.wood, 1.6, 0.05, 0.1, sx, 0.5, sz, ry);
  }
  for (let s = 0; s < 2; s++) {
    const [sx, sz] = rot(0, -0.27);
    b.box(M.wood, 1.6, 0.1, 0.04, sx, 0.68 + s * 0.16, sz, ry);
  }
  for (const lx of [-0.7, 0.7]) {
    const [sx, sz] = rot(lx, 0);
    b.box(M.metal, 0.06, 0.5, 0.45, sx, 0.25, sz, ry);
  }
}

export function bin(b: Batch, x: number, z: number) {
  const g = new THREE.CylinderGeometry(0.28, 0.24, 0.85, 10);
  g.translate(x, 0.55, z);
  b.add(g, M.bin);
  const l = new THREE.CylinderGeometry(0.3, 0.3, 0.06, 10);
  l.translate(x, 1.0, z);
  b.add(l, M.metal);
}

export function roadSign(b: Batch, x: number, z: number, ry: number, red: boolean) {
  b.box(M.metal, 0.08, 2.6, 0.08, x, 1.4, z);
  const d = new THREE.CylinderGeometry(0.38, 0.38, 0.04, 16);
  d.rotateX(Math.PI / 2);
  d.rotateY(ry);
  d.translate(x, 2.6, z);
  b.add(d, red ? M.signRed : M.signBlue);
  b.box(M.white, 0.5, 0.1, 0.05, x, 2.6, z, ry);
}

/** Modern street lamp (pole + arm + head); returns the head position for the glow. */
export function lamp(b: Batch, x: number, z: number, armDir: number, twin = false) {
  b.box(M.metal, 0.14, 5, 0.14, x, 2.5, z);
  b.box(M.metal, 0.22, 0.6, 0.22, x, 0.3, z);
  const heads: THREE.Vector3[] = [];
  for (const d of twin ? [-1, 1] : [armDir]) {
    b.box(M.metal, 0.9, 0.07, 0.07, x + d * 0.45, 4.95, z);
    b.box(M.metal, 0.5, 0.1, 0.24, x + d * 0.9, 4.9, z);
    b.box(M.lampHead, 0.42, 0.04, 0.18, x + d * 0.9, 4.84, z);
    heads.push(new THREE.Vector3(x + d * 0.9, 4.75, z));
  }
  return heads;
}

// ---------- environment light ----------
let envP: Promise<THREE.Texture> | null = null;
/** Poly Haven HDRI (CC0) as image-based lighting; skipped on low quality. */
export function loadEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  if (envP || !Q.hdri) return envP;
  envP = new RGBELoader().loadAsync(BASE + 'sky_1k.hdr').then((hdr) => {
    const pm = new THREE.PMREMGenerator(renderer);
    const env = pm.fromEquirectangular(hdr).texture;
    hdr.dispose();
    pm.dispose();
    scene.environment = env;
    scene.environmentIntensity = 0.55;
    return env;
  });
  envP.catch(() => (envP = null));
  return envP;
}

// ---------- corniche promenade ----------
export const CORNICHE = { x0: -130, x1: 130, z0: 240.6, z1: 250, rail: 250.2 };
/** half-width of the gap the Qasr El Nil bridge cuts through the promenade, wall and railing */
export const BRIDGE_GAP = 7.9;

export function buildPromenade(group: THREE.Group) {
  const b = new Batch();
  const spans: [number, number][] = [
    [CORNICHE.x0, -BRIDGE_GAP],
    [BRIDGE_GAP, CORNICHE.x1]
  ];
  const paving = surface('paving', 0xe8dcc8);
  const wallMat = surface('concrete', 0xe6dccb);
  const capMat = surface('concrete', 0xd8cbb4);
  const posts = new THREE.CylinderGeometry(0.035, 0.035, 0.6, 6);
  for (const [a, c] of spans) {
    const w = c - a,
      cx = (a + c) / 2;
    b.box(paving, w, 0.14, CORNICHE.z1 - CORNICHE.z0, cx, 0.07, (CORNICHE.z0 + CORNICHE.z1) / 2, 0, 2.2);
    b.box(wallMat, w, 0.62, 0.38, cx, 0.31, CORNICHE.rail, 0, 1.5);
    b.box(capMat, w, 0.08, 0.5, cx, 0.66, CORNICHE.rail, 0, 1.5);
    for (let x = a + 0.4; x <= c; x += 2.2) {
      const g = posts.clone();
      g.translate(x, 1.0, CORNICHE.rail);
      b.add(g, M.metal);
    }
    for (const y of [1.3, 0.98]) {
      const r = new THREE.CylinderGeometry(0.035, 0.035, w, 6);
      r.rotateZ(Math.PI / 2);
      r.translate(cx, y, CORNICHE.rail);
      b.add(r, M.metal);
    }
  }
  b.flush(group);
}

/** Corniche furniture: lamps (returned for glows), palms and benches along the promenade. */
export function corniche(group: THREE.Group) {
  const b = new Batch();
  const heads: THREE.Vector3[] = [];
  for (let x = CORNICHE.x0 + 6; x < CORNICHE.x1; x += 14) {
    if (Math.abs(x) < 20) continue; // the bridge approach and its lions
    heads.push(...lamp(b, x, CORNICHE.rail - 0.6, 0, true).map((v) => v));
    palm(b, x + 7, CORNICHE.z0 + 1.8);
    bench(b, x + 3.5, CORNICHE.rail - 1.1, Math.PI);
    if ((x | 0) % 28 === 0) bin(b, x + 10, CORNICHE.rail - 0.8);
  }
  b.flush(group, Q.shadows);
  return heads;
}
