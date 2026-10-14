/**
 * Egyptian street identity, all drawn in code: apartment blocks (red-brick and plastered), blue road signs,
 * striped kerbs, the pyramids on the horizon, and the white microbus / black-and-white taxi.
 */
import * as THREE from 'three';
import { Batch } from './Environment';

const FLOOR = 3;
const BAY = 3;

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function canvasTex(c: HTMLCanvasElement, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** One bay of one floor (3 m x 3 m): wall + window. */
function facadeCanvas(kind: 'brick' | 'plaster', seed: number) {
  const [c, x] = canvas(128, 128);
  if (kind === 'brick') {
    x.fillStyle = '#9a4a32';
    x.fillRect(0, 0, 128, 128);
    for (let r = 0; r < 128 / 6; r++)
      for (let k = -1; k < 128 / 16 + 1; k++) {
        const v = 120 + ((r * 31 + k * 17 + seed) % 40);
        x.fillStyle = `rgb(${v + 20},${v / 2.1},${v / 3.2})`;
        x.fillRect(k * 16 + (r % 2) * 8 + 1, r * 6 + 1, 14, 4.5);
      }
    // grey concrete frame (column + floor slab), the classic unfinished block
    x.fillStyle = '#9d9a94';
    x.fillRect(0, 0, 10, 128);
    x.fillRect(0, 116, 128, 12);
  } else {
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, 128, 128);
    x.fillStyle = 'rgba(0,0,0,0.06)';
    for (let i = 0; i < 40; i++) x.fillRect((i * 37) % 128, (i * 53) % 128, 6, 3);
    x.fillStyle = 'rgba(0,0,0,0.12)';
    x.fillRect(0, 118, 128, 3);
  }
  // window with shutters / AC-stained frame
  x.fillStyle = kind === 'brick' ? '#3a2a22' : '#d8d0c0';
  x.fillRect(34, 26, 60, 70);
  x.fillStyle = '#1d2a33';
  x.fillRect(40, 32, 48, 58);
  x.fillStyle = 'rgba(160,200,230,0.35)';
  x.fillRect(42, 34, 20, 54);
  if (kind === 'plaster' && seed % 3 === 0) {
    x.fillStyle = '#6b4a2a';
    for (let s = 0; s < 8; s++) x.fillRect(40, 32 + s * 7.5, 48, 4);
  }
  return c;
}

const facadeCache = new Map<string, THREE.MeshStandardMaterial>();
export function facadeMat(kind: 'brick' | 'plaster', tint: number, seed = 0) {
  const key = kind + tint + ':' + (seed % 3);
  let m = facadeCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: canvasTex(facadeCanvas(kind, seed % 3)), color: tint, roughness: 0.92 });
    facadeCache.set(key, m);
  }
  return m;
}

const D = {
  slab: new THREE.MeshStandardMaterial({ color: 0xa8a49c, roughness: 0.95 }),
  rail: new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.5, metalness: 0.5 }),
  ac: new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.6 }),
  dish: new THREE.MeshStandardMaterial({ color: 0xdcdcd8, roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide }),
  tank: new THREE.MeshStandardMaterial({ color: 0x2d2d33, roughness: 0.7 }),
  rebar: new THREE.MeshStandardMaterial({ color: 0x5a3a2a, roughness: 0.8 })
};

/** Box with UVs scaled so one texture repeat = one 3 m bay x one floor. */
function wallGeo(w: number, h: number, d: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // faces: +x,-x,+y,-y,+z,-z (4 verts each)
  const span = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h]
  ];
  for (let f = 0; f < 6; f++)
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * span[f][0]) / BAY, (uv.getY(i) * span[f][1]) / FLOOR);
    }
  return g;
}

/**
 * An Egyptian apartment block standing at the street edge. `side` -1 = west row (faces +x), 1 = east row.
 * Returns a group flagged static so the street merges it with everything else.
 */
export function egyptBlock(dx: number, h: number, dz: number, side: number, seed: number) {
  const g = new THREE.Group();
  g.userData.static = true;
  const floors = Math.max(2, Math.round(h / FLOOR));
  const H = floors * FLOOR;
  const brick = seed % 3 === 0;
  const tints = [0xe9d6b4, 0xdcc49a, 0xefe2cc, 0xd9b48a, 0xe6cfa8];
  const mat = brick ? facadeMat('brick', 0xffffff, seed) : facadeMat('plaster', tints[seed % tints.length], seed);
  const wall = new THREE.Mesh(wallGeo(dx, H, dz), mat);
  wall.position.y = H / 2;
  g.add(wall);
  // roof slab; unfinished blocks keep rebar stubs sticking up
  const roof = new THREE.Mesh(new THREE.BoxGeometry(dx + 0.2, 0.25, dz + 0.2), D.slab);
  roof.position.y = H + 0.12;
  g.add(roof);
  const b = new Batch();
  const out = -side; // street side, local x
  const fx = (out * dx) / 2;
  const bays = Math.max(1, Math.floor(dz / BAY));
  for (let f = 1; f < floors; f++) {
    for (let k = 0; k < bays; k++) {
      const z = -dz / 2 + BAY / 2 + k * BAY + (dz - bays * BAY) / 2;
      const r = (seed * 7 + f * 13 + k * 29) % 10;
      const y = f * FLOOR;
      if (!brick && r < 5) {
        b.box(D.slab, 0.9, 0.14, 2.4, fx + out * 0.45, y, z);
        b.box(D.rail, 0.05, 0.9, 2.4, fx + out * 0.88, y + 0.5, z);
        b.box(D.rail, 0.9, 0.9, 0.05, fx + out * 0.45, y + 0.5, z - 1.18);
        b.box(D.rail, 0.9, 0.9, 0.05, fx + out * 0.45, y + 0.5, z + 1.18);
      }
      if (r === 6 || r === 8 || (brick && r < 2)) b.box(D.ac, 0.45, 0.42, 0.8, fx + out * 0.24, y + 1.6, z + 1.0);
    }
  }
  const ry = H + 0.25;
  for (let i = 0; i < 1 + (seed % 3); i++) {
    const dzz = -dz / 2 + 1 + ((seed * 5 + i * 3) % Math.max(1, Math.floor(dz - 2)));
    const dish = new THREE.SphereGeometry(0.45, 10, 4, 0, Math.PI * 2, 0, 0.9);
    dish.rotateZ(-out * 1.1);
    dish.translate(fx * 0.6, ry + 0.9, dzz);
    b.add(dish, D.dish);
    b.box(D.rail, 0.05, 0.8, 0.05, fx * 0.6, ry + 0.4, dzz);
  }
  b.add(new THREE.CylinderGeometry(0.55, 0.55, 1.1, 10).translate(-fx * 0.4, ry + 0.55, 0), D.tank);
  if (brick)
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) b.box(D.rebar, 0.06, 0.9, 0.06, (sx * dx) / 2.2, ry + 0.45, (sz * dz) / 2.2);
  b.flush(g, false);
  for (const c of g.children) c.userData.dynamic = false;
  return g;
}

// ---------- road signs ----------
export interface SignDest {
  ar: string;
  en: string;
  km: number;
}

function signCanvas(dests: SignDest[]) {
  const [c, x] = canvas(512, 256);
  x.fillStyle = '#1b5fb4';
  x.fillRect(0, 0, 512, 256);
  x.strokeStyle = '#ffffff';
  x.lineWidth = 6;
  x.strokeRect(8, 8, 496, 240);
  const rows = dests.slice(0, 2);
  rows.forEach((d, i) => {
    const y0 = 20 + i * 116;
    x.fillStyle = '#ffffff';
    x.textAlign = 'right';
    x.direction = 'rtl';
    x.font = 'bold 50px Cairo, "Noto Sans Arabic", Arial';
    x.fillText(d.ar, 490, y0 + 48);
    x.direction = 'ltr';
    x.textAlign = 'left';
    x.font = 'bold 30px Arial';
    x.fillText(d.en, 22, y0 + 90);
    x.fillStyle = '#ffd84a';
    x.textAlign = 'right';
    x.font = 'bold 34px Arial';
    x.fillText(`${d.km.toFixed(1)} km`, 490, y0 + 92);
    x.fillStyle = '#ffffff';
    x.textAlign = 'left';
    x.font = 'bold 46px Arial';
    x.fillText(i === 0 ? '↑' : '↗', 24, y0 + 48);
    if (i === 0 && rows.length > 1) x.fillRect(20, 136, 472, 3);
  });
  return c;
}

const poleMat = new THREE.MeshStandardMaterial({ color: 0x8c949c, metalness: 0.6, roughness: 0.4 });
/** Overhead gantry across the avenue with a blue Arabic/English direction sign facing `dir` (+1 = toward +z traffic). */
export function gantry(z: number, dir: number, dests: SignDest[], halfSpan = 4.9) {
  const g = new THREE.Group();
  g.position.z = z;
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.22, 6.6, 0.22), poleMat);
    p.position.set(s * halfSpan, 3.3, 0);
    g.add(p);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(halfSpan * 2, 0.28, 0.28), poleMat);
  beam.position.y = 6.4;
  g.add(beam);
  const mat = new THREE.MeshStandardMaterial({ map: canvasTex(signCanvas(dests), false), roughness: 0.55 });
  const back = new THREE.MeshStandardMaterial({ color: 0x9aa3aa, metalness: 0.5, roughness: 0.5 });
  const panel = new THREE.Group();
  panel.add(new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.1, 0.08), back));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.1), mat);
  face.position.z = 0.045;
  panel.add(face);
  // face the drivers coming toward the sign: traffic heading +z sees the side facing -z
  panel.position.set(-dir * 1.8, 6.2, -dir * 0.2);
  panel.rotation.y = dir > 0 ? Math.PI : 0;
  g.add(panel);
  return g;
}

// ---------- kerb ----------
let kerbM: THREE.MeshStandardMaterial | null = null;
/** Black-and-white kerb stones (needs world-space UVs at 2 m per repeat). */
export function kerbStripeMat() {
  if (kerbM) return kerbM;
  const [c, x] = canvas(64, 64);
  x.fillStyle = '#f2f2ee';
  x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#1c1c1c';
  x.fillRect(0, 0, 32, 32);
  x.fillRect(32, 32, 32, 32);
  const t = canvasTex(c);
  t.magFilter = THREE.NearestFilter;
  kerbM = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 });
  kerbM.userData.uvSize = 2;
  return kerbM;
}

// ---------- pyramids ----------
/** Distant pyramid silhouettes, hazed toward the horizon colour; no fog so they stay visible. */
export function pyramids(group: THREE.Object3D, cx: number, cz: number) {
  // unlit, hazed sandstone with baked face shading so they read as a soft silhouette at any time of day
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const base = new THREE.Color(0xc4a678);
  const haze = new THREE.Color(0xc9d6e2);
  const light = new THREE.Vector3(0.6, 0.5, 0.6).normalize();
  const list: [number, number, number][] = [
    [0, 0, 1],
    [-70, 12, 0.85],
    [55, -8, 0.55]
  ];
  for (const [dx, dz, k] of list) {
    const r = 40 * k,
      h = 38 * k;
    const geo = new THREE.ConeGeometry(r, h, 4, 1).toNonIndexed();
    geo.rotateY(Math.PI / 4);
    geo.computeVertexNormals();
    const n = geo.attributes.normal;
    const col = new Float32Array(n.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n.count; i++) {
      const lit = 0.72 + 0.28 * Math.max(0, n.getX(i) * light.x + n.getY(i) * light.y + n.getZ(i) * light.z);
      c.copy(base).multiplyScalar(lit).lerp(haze, 0.3 + (1 - k) * 0.2);
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(geo, mat);
    m.position.set(cx + dx, h / 2 - 2, cz + dz);
    group.add(m);
  }
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 700),
    new THREE.MeshBasicMaterial({ color: 0xc2ab84, fog: false })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(cx, -0.3, cz - 60);
  group.add(sand);
}

// ---------- vehicles ----------
function plateTex() {
  const [c, x] = canvas(128, 64);
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, 128, 64);
  x.fillStyle = '#d12c2c';
  x.fillRect(0, 0, 128, 18);
  x.fillStyle = '#ffffff';
  x.font = 'bold 13px Arial';
  x.textAlign = 'center';
  x.fillText('EGYPT  مصر', 64, 14);
  x.fillStyle = '#111';
  x.font = 'bold 28px Arial';
  x.direction = 'rtl';
  x.fillText('٤٥٧ ر ق م', 64, 52);
  return canvasTex(c, false);
}
let plateMat: THREE.MeshStandardMaterial | null = null;
const VM = {
  tyre: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }),
  rim: new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 0.8, roughness: 0.3 }),
  glass: new THREE.MeshStandardMaterial({
    color: 0x1a2a36,
    roughness: 0.08,
    metalness: 0.5,
    transparent: true,
    opacity: 0.85
  }),
  black: new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.5, metalness: 0.3 }),
  white: new THREE.MeshStandardMaterial({ color: 0xf1f1ec, roughness: 0.35, metalness: 0.25 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xcfd3d6, roughness: 0.2, metalness: 0.9 }),
  stripe: new THREE.MeshStandardMaterial({ color: 0x2a5aa8, roughness: 0.4 }),
  head: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2cc, emissiveIntensity: 0.6 }),
  tail: new THREE.MeshStandardMaterial({ color: 0xaa1010, emissive: 0xff2010, emissiveIntensity: 0.5 })
};

/** A wheel that can spin about its axle: group.rotation.x is the roll angle. */
export function makeWheel(r: number, width: number) {
  const g = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, width, 16), VM.tyre);
  tyre.rotation.z = Math.PI / 2;
  g.add(tyre);
  for (const s of [-1, 1]) {
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.02, 12), VM.rim);
    rim.rotation.z = Math.PI / 2;
    rim.position.x = (s * width) / 2;
    g.add(rim);
    for (let k = 0; k < 5; k++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.03, r * 1.1, 0.07), VM.black);
      sp.rotation.x = (k / 5) * Math.PI;
      sp.position.x = (s * width) / 2 + s * 0.012;
      g.add(sp);
    }
  }
  g.userData.r = r;
  return g;
}

/** Roll every wheel registered in `obj.userData.wheels` by distance `ds` (metres, signed). */
export function rollWheels(obj: THREE.Object3D, ds: number) {
  const ws = obj.userData.wheels as THREE.Object3D[] | undefined;
  if (!ws) return;
  for (const w of ws) w.rotation.x += ds / (w.userData.r as number);
}

function addWheels(g: THREE.Group, r: number, xs: number, zf: number, zb: number) {
  const wheels: THREE.Object3D[] = [];
  for (const x of [-xs, xs])
    for (const z of [zf, zb]) {
      const w = makeWheel(r, 0.24);
      w.position.set(x, r, z);
      g.add(w);
      wheels.push(w);
    }
  g.userData.wheels = wheels;
}

function box(g: THREE.Object3D, m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}

function lightsAndPlate(g: THREE.Group, w: number, y: number, front: number, back: number) {
  plateMat ??= new THREE.MeshStandardMaterial({ map: plateTex(), roughness: 0.5 });
  for (const s of [-1, 1]) {
    box(g, VM.head, 0.3, 0.14, 0.04, s * (w / 2 - 0.25), y, front + 0.01);
    box(g, VM.tail, 0.18, 0.3, 0.04, s * (w / 2 - 0.12), y + 0.1, back - 0.01);
  }
  box(g, plateMat, 0.52, 0.17, 0.02, 0, y - 0.18, back - 0.02);
  box(g, plateMat, 0.52, 0.17, 0.02, 0, y - 0.18, front + 0.02).rotation.y = Math.PI;
}

/** White Toyota HiAce-style microbus with blue stripe and roof rack (~4.7 m). Front is +z. */
export function makeMicrobus() {
  const g = new THREE.Group();
  const L = 4.7,
    W = 1.75;
  box(g, VM.white, W, 1.35, L, 0, 1.12, 0);
  box(g, VM.white, W * 0.98, 0.25, 0.5, 0, 0.62, L / 2 + 0.05); // nose
  box(g, VM.stripe, W + 0.01, 0.1, L - 0.2, 0, 0.82, 0);
  box(g, VM.black, W + 0.04, 0.16, 0.12, 0, 0.5, L / 2 + 0.22); // bumper
  box(g, VM.black, W + 0.04, 0.16, 0.12, 0, 0.5, -L / 2 - 0.04);
  // glass: windscreen, side windows, rear
  box(g, VM.glass, W * 0.92, 0.55, 0.05, 0, 1.45, L / 2 + 0.01).rotation.x = -0.12;
  for (const s of [-1, 1]) box(g, VM.glass, 0.03, 0.48, L - 1.0, s * (W / 2 + 0.01), 1.45, -0.25);
  box(g, VM.glass, W * 0.85, 0.5, 0.03, 0, 1.45, -L / 2 - 0.01);
  // roof rack
  const rack = new THREE.Group();
  for (const s of [-1, 1]) box(rack, VM.black, 0.04, 0.04, L - 0.9, s * 0.78, 0, 0);
  for (let i = 0; i < 6; i++) box(rack, VM.black, 1.56, 0.03, 0.04, 0, 0, -L / 2 + 0.75 + i * 0.64);
  for (let i = 0; i < 5; i++)
    for (const s of [-1, 1]) box(rack, VM.black, 0.03, 0.18, 0.03, s * 0.78, -0.09, -L / 2 + 0.75 + i * 0.8);
  rack.position.y = 1.98;
  g.add(rack);
  for (const s of [-1, 1]) box(g, VM.black, 0.06, 0.12, 0.18, s * (W / 2 + 0.06), 1.4, L / 2 - 0.3); // mirrors
  lightsAndPlate(g, W, 0.8, L / 2 + 0.3, -L / 2 - 0.01);
  addWheels(g, 0.34, W / 2 - 0.08, L / 2 - 0.75, -L / 2 + 0.85);
  g.userData.vehicle = 'microbus';
  return g;
}

/** Black-and-white Cairo taxi sedan (~4.4 m). Front is +z. */
export function makeTaxi() {
  const g = new THREE.Group();
  const L = 4.4,
    W = 1.7;
  box(g, VM.black, W, 0.5, L, 0, 0.62, 0);
  box(g, VM.white, W + 0.01, 0.2, L - 0.6, 0, 0.66, 0); // white band
  box(g, VM.black, W * 0.86, 0.48, 2.1, 0, 1.12, -0.15);
  box(g, VM.white, W * 0.8, 0.06, 1.9, 0, 1.38, -0.15);
  box(g, VM.glass, W * 0.8, 0.42, 0.04, 0, 1.12, 0.92).rotation.x = -0.5;
  box(g, VM.glass, W * 0.8, 0.4, 0.04, 0, 1.12, -1.22).rotation.x = 0.45;
  for (const s of [-1, 1]) box(g, VM.glass, 0.03, 0.34, 1.8, s * (W * 0.43 + 0.01), 1.14, -0.15);
  // roof "TAXI" light
  const sign = box(g, VM.white, 0.6, 0.16, 0.22, 0, 1.47, -0.1);
  sign.material = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1a0, emissiveIntensity: 0.5 });
  for (const s of [-1, 1]) box(g, VM.chrome, W + 0.04, 0.12, 0.1, 0, 0.45, s * (L / 2 + 0.03));
  lightsAndPlate(g, W, 0.72, L / 2, -L / 2);
  addWheels(g, 0.31, W / 2 - 0.06, L / 2 - 0.85, -L / 2 + 0.85);
  g.userData.vehicle = 'taxi';
  return g;
}

/**
 * Model cars ship their four tyres as one merged mesh, so they can't roll. Hide that mesh and put a separate
 * spinning wheel at the centre of each quarter of it.
 */
export function rigModelWheels(group: THREE.Object3D, model: THREE.Object3D) {
  const tyres: THREE.Mesh[] = [];
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const name = ((m.material as THREE.Material).name + ' ' + m.name).toLowerCase();
    if (/tyre|tire|rubber/.test(name) && !/steering/.test(name)) tyres.push(m);
  });
  if (!tyres.length) return;
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const pts: THREE.Vector3[] = [];
  const v = new THREE.Vector3();
  for (const t of tyres) {
    const p = t.geometry.attributes.position;
    const mtx = new THREE.Matrix4().multiplyMatrices(inv, t.matrixWorld);
    for (let i = 0; i < p.count; i += 1) pts.push(v.fromBufferAttribute(p, i).applyMatrix4(mtx).clone());
  }
  const bb = new THREE.Box3().setFromPoints(pts);
  const c = bb.getCenter(new THREE.Vector3());
  const wheels: THREE.Object3D[] = [];
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const q = new THREE.Box3();
      for (const p of pts) if (Math.sign(p.x - c.x) === sx && Math.sign(p.z - c.z) === sz) q.expandByPoint(p);
      if (q.isEmpty()) return; // unexpected layout: leave the model as it is
      const size = q.getSize(new THREE.Vector3());
      const r = Math.max(size.y, size.z) / 2;
      const w = makeWheel(r * 1.01, Math.min(size.x, 0.3));
      q.getCenter(w.position);
      wheels.push(w);
    }
  for (const t of tyres) t.visible = false;
  for (const w of wheels) group.add(w);
  group.userData.wheels = wheels;
}
