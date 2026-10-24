/**
 * Egyptian street identity: apartment blocks (concrete frames with plaster or brick infill, Belle Epoque and
 * modernist facades), blue road signs, striped kerbs, the taxi roof sign and microbus roof rack, and rolling wheels.
 */
import * as THREE from 'three';
import { Batch, surface } from './Environment';
import { facadeMaterial } from './Facade';
import type { FacadeStyle } from '../logic/districts';

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

const D = {
  slab: new THREE.MeshStandardMaterial({ color: 0xa8a49c, roughness: 0.95 }),
  rail: new THREE.MeshStandardMaterial({ color: 0x2a2b2d, roughness: 0.55, metalness: 0.5 }),
  ac: new THREE.MeshStandardMaterial({ color: 0xe4e4de, roughness: 0.6 }),
  dish: new THREE.MeshStandardMaterial({ color: 0xcfcfca, roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide }),
  tank: new THREE.MeshStandardMaterial({ color: 0x2d2d33, roughness: 0.7 }),
  rebar: new THREE.MeshStandardMaterial({ color: 0x5a3a2a, roughness: 0.8 }),
  cornice: new THREE.MeshStandardMaterial({ color: 0xd9d0bc, roughness: 0.9 })
};
let concreteMat: THREE.MeshStandardMaterial | null = null;
/** Bare concrete for balcony slabs, parapets and roof slabs (ambientCG concrete, world-space UVs). */
function concrete() {
  if (!concreteMat) {
    concreteMat = surface('concrete', 0xb4b0a8);
    concreteMat.userData.uvSize = 1.6;
  }
  return concreteMat;
}

/**
 * Box with UVs scaled so one texture repeat = one 3 m bay x one floor, bays centred on the wall.
 * Vertex colours darken the foot of the wall and vary each block a little, so rows of similar blocks differ.
 */
export function wallGeo(w: number, h: number, d: number, seed: number) {
  const floors = Math.max(1, Math.round(h / FLOOR));
  const g = new THREE.BoxGeometry(w, h, d, 1, floors, 1);
  const p = g.attributes.position,
    n = g.attributes.normal,
    uv = g.attributes.uv as THREE.BufferAttribute;
  const col = new Float32Array(p.count * 3);
  const bays = (len: number) => Math.max(1, Math.floor(len / BAY));
  const tone = 0.9 + (((seed * 37) % 17) / 17) * 0.14;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i) + h / 2,
      z = p.getZ(i);
    const nx = Math.abs(n.getX(i)),
      ny = Math.abs(n.getY(i));
    if (ny > 0.5) uv.setXY(i, x / BAY, z / BAY);
    else if (nx > 0.5) uv.setXY(i, (z + d / 2 - (d - bays(d) * BAY) / 2) / BAY, y / FLOOR);
    else uv.setXY(i, (x + w / 2 - (w - bays(w) * BAY) / 2) / BAY, y / FLOOR);
    const foot = 0.58 + 0.42 * Math.min(1, y / 3.2);
    const c = foot * tone * (ny > 0.5 ? 0.85 : 1);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = c;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/**
 * An Egyptian apartment block standing at the street edge. `side` -1 = west row (faces +x), 1 = east row.
 * Returns a group flagged static so the street merges it with everything else.
 */
export function egyptBlock(
  dx: number,
  h: number,
  dz: number,
  side: number,
  seed: number,
  look: { brick?: boolean; tint?: number; style?: FacadeStyle; rebar?: boolean } = {}
) {
  const g = new THREE.Group();
  g.userData.static = true;
  const floors = Math.max(2, Math.round(h / FLOOR));
  const H = floors * FLOOR;
  const brick = look.brick ?? seed % 7 === 0;
  const style: FacadeStyle = brick ? 'brick' : (look.style ?? 'informal');
  const tints = [0xe6dac2, 0xd6c6a6, 0xcbc8c0, 0xe9e4d8, 0xd1b887];
  const tint = look.tint ?? tints[seed % tints.length]!;
  const mat = facadeMaterial(style, tint, seed);
  const wall = new THREE.Mesh(wallGeo(dx, H, dz, seed), mat);
  wall.position.y = H / 2;
  g.add(wall);
  // roof slab (a little proud of the wall); unfinished blocks keep rebar stubs sticking up
  const roof = new THREE.Mesh(new THREE.BoxGeometry(dx + 0.2, 0.25, dz + 0.2), concrete());
  roof.position.y = H + 0.12;
  g.add(roof);
  const b = new Batch();
  const out = -side; // street side, local x
  const fx = (out * dx) / 2;
  const bays = Math.max(1, Math.floor(dz / BAY));
  const khedival = style === 'khedival';
  const modern = style === 'modern';
  for (let f = 1; f < floors; f++) {
    for (let k = 0; k < bays; k++) {
      const z = -dz / 2 + BAY / 2 + k * BAY + (dz - bays * BAY) / 2;
      const r = (seed * 7 + f * 13 + k * 29) % 10;
      const y = f * FLOOR;
      if (khedival) {
        // stone balcony under the tall window on most floors, with an iron rail
        if (r < 7 && f > 1) {
          b.box(concrete(), 0.75, 0.16, 1.9, fx + out * 0.37, y, z, 0, 1.6);
          b.box(D.rail, 0.04, 0.95, 1.9, fx + out * 0.72, y + 0.5, z);
        }
      } else if (modern) {
        if (r < 8) b.box(concrete(), 1.1, 0.14, BAY - 0.2, fx + out * 0.55, y, z, 0, 1.6);
      } else if (!brick && r < 5) {
        b.box(concrete(), 0.9, 0.14, 2.4, fx + out * 0.45, y, z, 0, 1.6);
        b.box(D.rail, 0.05, 0.9, 2.4, fx + out * 0.88, y + 0.5, z);
        b.box(D.rail, 0.9, 0.9, 0.05, fx + out * 0.45, y + 0.5, z - 1.18);
        b.box(D.rail, 0.9, 0.9, 0.05, fx + out * 0.45, y + 0.5, z + 1.18);
      }
      if (!khedival && (r === 6 || r === 8 || (brick && r < 2)))
        b.box(D.ac, 0.45, 0.42, 0.8, fx + out * 0.24, y + 1.6, z + 1.0);
    }
  }
  if (khedival) {
    // Belle Epoque cornice with a stepped crown, plus a plinth for the ground floor
    b.box(D.cornice, 0.9, 0.35, dz + 0.3, fx + out * 0.35, H - 0.1, 0);
    b.box(D.cornice, 0.55, 0.3, dz + 0.5, fx + out * 0.2, H + 0.2, 0);
    b.box(D.cornice, 0.5, 0.9, dz + 0.1, fx + out * 0.05, H + 0.7, 0);
  } else {
    // flat roof parapet along the street edge
    b.box(D.slab, 0.2, 0.7, dz, fx + out * 0.05, H + 0.6, 0);
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
  if (look.rebar ?? brick)
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) b.box(D.rebar, 0.06, 0.9, 0.06, (sx * dx) / 2.2, ry + 0.45, (sz * dz) / 2.2);
  b.flush(g, false);
  for (const c of g.children) c.userData.dynamic = false;
  return g;
}

// ---------- street name boards ----------
const nameBoardCache = new Map<string, THREE.MeshStandardMaterial>();
function nameBoardMat(top: string, bottom: string) {
  const key = top + '|' + bottom;
  let m = nameBoardCache.get(key);
  if (!m) {
    const [c, x] = canvas(512, 192);
    x.fillStyle = '#12684a';
    x.fillRect(0, 0, 512, 192);
    x.strokeStyle = '#ffffff';
    x.lineWidth = 6;
    x.strokeRect(6, 6, 500, 180);
    x.fillStyle = '#ffffff';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.direction = 'rtl';
    x.font = 'bold 66px Cairo, "Noto Sans Arabic", Arial';
    x.fillText(top, 256, 62);
    x.fillRect(40, 100, 432, 3);
    x.font = 'bold 52px Cairo, "Noto Sans Arabic", Arial';
    x.fillText(bottom, 256, 142);
    m = new THREE.MeshStandardMaterial({ map: canvasTex(c, false), roughness: 0.6 });
    nameBoardCache.set(key, m);
  }
  return m;
}

/** Green street-name board on a pole (readable from both directions): main avenue on top, the crossing street below. */
export function streetNameSign(top: string, bottom: string) {
  const g = new THREE.Group();
  g.userData.static = true;
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.4, 0.1), poleMat).translateY(1.7));
  const mat = nameBoardMat(top, bottom);
  for (const s of [1, -1]) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.71), mat);
    face.position.set(0, 3.2, s * 0.06);
    face.rotation.y = s > 0 ? 0 : Math.PI;
    g.add(face);
  }
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.75, 0.08), poleMat);
  back.position.y = 3.2;
  g.add(back);
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

// ---------- vehicles ----------
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
  for (const w of ws) {
    const a = ds / (w.userData.r as number);
    if (w.userData.axis === 'z') w.rotation.z += a;
    else w.rotation.x += a;
  }
}

function box(g: THREE.Object3D, m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}

/** Roof rack for the microbus (bars + rails), sized to the dressed van. */
export function roofRack(len: number, width: number) {
  const rack = new THREE.Group();
  // two low side rails on four short feet and three cross bars: a plain luggage rack, not a cage
  const w = width * 0.92;
  for (const s of [-1, 1]) {
    box(rack, VM.black, 0.035, 0.035, len, (s * w) / 2, 0, 0);
    for (const e of [-1, 1]) box(rack, VM.black, 0.04, 0.06, 0.06, (s * w) / 2, -0.04, (e * len) / 2 - e * 0.1);
  }
  for (const k of [-1, 0, 1]) box(rack, VM.black, w, 0.025, 0.035, 0, 0, (k * len) / 2.6);
  rack.userData.keep = true;
  return rack;
}

/** The ladder up the back door of a microbus to the roof rack: two rails and five rungs, rear at z = 0. */
export function rearLadder(h = 1.45) {
  const g = new THREE.Group();
  for (const x of [-0.17, 0.17]) box(g, VM.black, 0.035, h, 0.035, x, h / 2, 0);
  for (let k = 0; k < 5; k++) box(g, VM.black, 0.34, 0.03, 0.03, 0, 0.15 + (k * (h - 0.25)) / 4, 0);
  // stand-offs to the door at the top and the bottom
  for (const y of [0.05, h - 0.05]) for (const x of [-0.17, 0.17]) box(g, VM.black, 0.03, 0.03, 0.08, x, y, 0.05);
  g.userData.keep = true;
  return g;
}

function checkerTex() {
  const [c, x] = canvas(128, 32);
  for (let i = 0; i < 16; i++)
    for (let j = 0; j < 4; j++) {
      x.fillStyle = (i + j) % 2 ? '#111' : '#fff';
      x.fillRect(i * 8, j * 8, 8, 8);
    }
  return canvasTex(c, false);
}

/** Cairo taxi roof sign: chequered band with "TAXI / تاكسي" on top. */
export function taxiSign() {
  const g = new THREE.Group();
  const [c, x] = canvas(256, 64);
  x.fillStyle = '#fff';
  x.fillRect(0, 0, 256, 64);
  x.fillStyle = '#111';
  x.font = 'bold 34px Arial';
  x.textAlign = 'center';
  x.fillText('TAXI  تاكسي', 128, 44);
  const face = new THREE.MeshStandardMaterial({
    map: canvasTex(c, false),
    emissive: 0xffffff,
    emissiveMap: canvasTex(c, false),
    emissiveIntensity: 0.25
  });
  const chk = new THREE.MeshStandardMaterial({ map: checkerTex() });
  box(g, chk, 0.7, 0.08, 0.26, 0, 0.04, 0);
  const top = box(g, face, 0.66, 0.16, 0.22, 0, 0.16, 0);
  top.castShadow = false;
  g.userData.keep = true;
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
