/**
 * The Nile south of Dokki: stone embankments, the river with feluccas, Qasr El Nil Bridge (drivable, level with the avenue),
 * the 6th of October flyover (elevated, scenery), Gezira island with its Zamalek skyline and the Cairo Tower.
 * Sizes follow docs/DISTRICT_REFERENCE.md; the river is narrowed so the far bank is within sight of the avenue.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Q, quality } from '../config/Quality';
import { Batch, PROP_MATS as M, surface, tex, worldUV } from './Environment';
import { NILE, NILE_ROADS, LION_SPOTS } from '../logic/nile';
import { blockLook } from '../logic/districts';
import { facadeMaterial } from './Facade';
import { wallGeo } from './Egypt';
import { tree, palm } from './Trees';
import { buildCairoTower } from './CairoTower';

export interface Sea {
  update(dt: number): void;
}

const WIDE = 3000;
const rnd = (seed: number) => {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** A prism whose outline is given in (z, y) and which is `depth` wide in x, centred on x0. */
function profilePrism(pts: [number, number][], depth: number, x0: number) {
  const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
  g.rotateY(-Math.PI / 2);
  g.translate(x0 + depth / 2, 0, 0);
  return g;
}

/** Bronze lion, seated, facing +z. About 2.7 m tall. */
function lionGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0) => {
    g.scale(sx, sy, sz);
    if (rx) g.rotateX(rx);
    g.translate(x, y, z);
    parts.push(g.index ? g.toNonIndexed() : g);
  };
  const sph = (r: number) => new THREE.SphereGeometry(r, 14, 10);
  add(sph(0.62), -0.48, 0.62, -0.5, 0.85, 1, 1.15); // haunches
  add(sph(0.62), 0.48, 0.62, -0.5, 0.85, 1, 1.15);
  add(sph(0.7), 0, 1.15, -0.1, 0.85, 1.25, 1.0, -0.55); // torso, leaning back
  add(sph(0.8), 0, 1.7, 0.3, 1, 1, 0.85); // chest
  add(sph(0.82), 0, 2.0, 0.22, 1, 1.05, 0.7); // mane
  add(sph(0.4), 0, 2.2, 0.55); // head
  add(new THREE.BoxGeometry(0.34, 0.26, 0.5), 0, 2.08, 0.92); // muzzle
  add(sph(0.11), -0.27, 2.55, 0.45);
  add(sph(0.11), 0.27, 2.55, 0.45);
  for (const sx of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.15, 0.18, 1.15, 8), sx * 0.3, 0.58, 0.62); // forelegs
    add(new THREE.BoxGeometry(0.3, 0.14, 0.5), sx * 0.3, 0.07, 0.8);
  }
  const tail = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.1, 0.25, -1.05),
      new THREE.Vector3(0.65, 0.12, -1.0),
      new THREE.Vector3(0.85, 0.5, -0.7)
    ]),
    8,
    0.07,
    6
  );
  parts.push(tail.toNonIndexed());
  for (const g of parts)
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  return mergeGeometries(parts, false)!;
}

function felucca() {
  const g = new THREE.Group();
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-3.6, 0);
  hullShape.bezierCurveTo(-2.4, 1.0, 2.4, 1.0, 3.9, 0.15);
  hullShape.bezierCurveTo(2.4, -1.0, -2.4, -1.0, -3.6, 0);
  const hull = new THREE.ExtrudeGeometry(hullShape, {
    depth: 0.55,
    bevelEnabled: true,
    bevelSize: 0.12,
    bevelThickness: 0.1,
    bevelSegments: 2
  });
  hull.rotateX(-Math.PI / 2);
  hull.translate(0, -0.15, 0);
  g.add(new THREE.Mesh(hull, new THREE.MeshStandardMaterial({ color: 0x6a5a48, roughness: 0.85 })));
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(6.6, 0.1, 1.5),
    new THREE.MeshStandardMaterial({ color: 0xe6e0d0, roughness: 0.8 })
  );
  stripe.position.set(0.1, 0.5, 0);
  g.add(stripe);
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.8 });
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 4.6, 6), wood);
  mast.position.set(1.6, 2.7, 0);
  mast.rotation.z = 0.1;
  g.add(mast);
  // lateen yard: long spar slanting up from the bow, the sail hangs from it
  const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 7.8, 5), wood);
  yard.position.set(0.5, 3.2, 0);
  yard.rotation.z = -0.62;
  g.add(yard);
  const sail = new THREE.BufferGeometry();
  const tack = [3.2, 0.9, 0],
    peak = [-0.05, 5.75, 0.05],
    clew = [-3.4, 0.95, 0.12];
  sail.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([...tack, ...peak, ...clew, ...peak, ...tack, ...clew], 3)
  );
  sail.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1], 3)
  );
  const sailMesh = new THREE.Mesh(
    sail,
    new THREE.MeshStandardMaterial({
      color: 0xdad0b8,
      roughness: 0.95,
      side: THREE.DoubleSide,
      emissive: 0x2a251a,
      emissiveIntensity: 0.3
    })
  );
  g.add(sailMesh);
  return g;
}

/** Stone bank wall from the water up to the quay. */
function bankWall(b: Batch, z: number, face: 1 | -1) {
  const stone = surface('stone', 0xd2c7b2);
  const y0 = NILE.waterY - 1.2,
    y1 = 0.12;
  b.box(stone, WIDE, y1 - y0, 0.8, 0, (y0 + y1) / 2, z + face * 0.4, 0, 3.4);
  // a ledge just above the water line, like the stepped quays along the Corniche
  b.box(stone, WIDE, 0.35, 0.7, 0, NILE.waterY + 0.7, z - face * 0.35, 0, 3.4);
}

function railing(b: Batch, z: number, gap: number, halfLen: number) {
  const spans: [number, number][] = [
    [-halfLen, -gap],
    [gap, halfLen]
  ];
  const post = new THREE.CylinderGeometry(0.035, 0.035, 0.6, 6);
  for (const [a, c] of spans) {
    for (let x = a + 0.4; x <= c; x += 2.2) {
      const g = post.clone();
      g.translate(x, 1.0, z);
      b.add(g, M.metal);
    }
    for (const y of [1.3, 0.98]) {
      const r = new THREE.CylinderGeometry(0.035, 0.035, c - a, 6);
      r.rotateZ(Math.PI / 2);
      r.translate((a + c) / 2, y, z);
      b.add(r, M.metal);
    }
  }
}

export interface NileBuild extends Sea {
  halos: THREE.Vector3[];
}

export function buildNile(group: THREE.Group, sun: THREE.Vector3): NileBuild {
  const r = rnd(41);
  const b = new Batch();
  const stoneMat = surface('stone', 0xcfc4ae);
  const concrete = surface('concrete', 0xb9b4aa);
  const steel = surface('steel', 0x8f959b, { metalness: 0.45, roughness: 0.75 });
  const asphalt = surface('asphalt', Q.hdri ? 0x9a9a9a : 0xb8b8b8);
  const paving = surface('paving', 0xd8d2c8);
  const kerb = surface('concrete', 0xcfcac2);

  // ---- embankments, ground on both banks ----
  bankWall(b, NILE.bankZ, 1);
  bankWall(b, NILE.islandZ, -1);
  // far-bank promenade and its railing
  b.box(surface('paving', 0xe0d6c4), 420, 0.14, 8, 0, 0.07, NILE.islandZ + 4.4, 0, 2.2);
  railing(b, NILE.islandZ + 0.3, NILE.deckHalf, 210);
  b.box(surface('concrete', 0xe6dccb), 420, 0.62, 0.38, 0, 0.31, NILE.islandZ + 0.3, 0, 1.5);

  const ground = (
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    tint: number,
    size: number,
    mat: 'park' | 'desert'
  ) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    g.rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2, 0.005, (z0 + z1) / 2);
    b.add(g, surface(mat, tint), size);
  };
  // Gezira island park and dusty ground; outer Dokki bank beyond the city footprint
  ground(-WIDE / 2, WIDE / 2, NILE.islandZ + 8.4, 1300, 0x93a36f, 9, 'park');
  ground(155, WIDE / 2, -100, NILE.bankZ + 0.3, 0x8c8372, 12, 'desert');
  ground(-WIDE / 2, -155, -100, NILE.bankZ + 0.3, 0x8c8372, 12, 'desert');

  // ---- Qasr El Nil Bridge ----
  const zA = NILE.bankZ + 0.8,
    zB = NILE.islandZ - 0.8;
  const hw = NILE.deckHalf;
  const road0 = 240.6,
    road1 = NILE.islandRoadZ + 4.6;
  // carriageway, pavements, kerbs
  b.box(asphalt, NILE.roadHalf * 2, 0.08, road1 - road0, 0, 0.05, (road0 + road1) / 2, 0, 5);
  for (const s of [-1, 1]) {
    const pz1 = NILE.islandZ + 8;
    b.box(paving, hw - NILE.roadHalf, 0.14, pz1 - road0, (s * (NILE.roadHalf + hw)) / 2, 0.07, (road0 + pz1) / 2, 0, 2);
    b.box(kerb, 0.22, 0.2, pz1 - road0, s * (NILE.roadHalf + 0.02), 0.1, (road0 + pz1) / 2, 0, 1.2);
  }
  // island road along the bridge end and the spur to the tower plaza
  for (const rc of NILE_ROADS.slice(1)) {
    const w = rc.x1 - rc.x0,
      d = rc.z1 - rc.z0;
    const cx = (rc.x0 + rc.x1) / 2,
      cz = (rc.z0 + rc.z1) / 2;
    b.box(asphalt, w, 0.08, d, cx, 0.05, cz, 0, 5);
    const alongX = w > d;
    for (const sd of [-1, 1]) {
      if (alongX) {
        b.box(paving, w, 0.14, 2.4, cx, 0.07, cz + sd * (d / 2 + 1.2), 0, 2);
        b.box(kerb, w, 0.2, 0.22, cx, 0.1, cz + sd * (d / 2 + 0.02), 0, 1.2);
      } else {
        b.box(paving, 2.4, 0.14, d, cx + sd * (w / 2 + 1.2), 0.07, cz, 0, 2);
        b.box(kerb, 0.22, 0.2, d, cx + sd * (w / 2 + 0.02), 0.1, cz, 0, 1.2);
      }
    }
    if (alongX) {
      for (let x = rc.x0 + 4; x < rc.x1 - 4; x += 8) if (Math.abs(x) > 8) b.box(M.paint, 3, 0.012, 0.14, x, 0.096, cz);
    } else {
      for (let z = rc.z0 + 4; z < rc.z1 - 4; z += 8) b.box(M.paint, 0.14, 0.012, 3, cx, 0.096, z);
    }
  }
  // lane marks
  for (let z = road0 + 4; z < road1 - 4; z += 8) b.box(M.paint, 0.14, 0.012, 3, 0, 0.096, z);
  for (const s of [-0.13, 0.13]) b.box(M.paint, 0.1, 0.012, zB - zA, s, 0.096, (zA + zB) / 2);
  // under-deck: haunched steel girders, five arched spans on four stone piers
  const spans = 5;
  const L = (zB - zA) / spans;
  const soffitPier = -2.4,
    soffitMid = -1.0;
  for (let i = 0; i < spans; i++) {
    const z0 = zA + i * L;
    const pts: [number, number][] = [[z0, -0.02]];
    pts.push([z0 + L, -0.02]);
    const n = 16;
    for (let k = n; k >= 0; k--) {
      const t = k / n;
      pts.push([z0 + t * L, soffitPier + (soffitMid - soffitPier) * (1 - Math.pow(2 * t - 1, 2))]);
    }
    b.add(profilePrism(pts, hw * 2, -hw), steel, 4);
    // fascia: a thin darker band along both edges so the arch reads from the side
    for (const s of [-1, 1]) {
      const ins: [number, number][] = pts.map(([z, y], k) => [z, k < 2 ? y : y - 0.12]);
      b.add(profilePrism(ins, 0.3, s * (hw - 0.15) - 0.15), stoneMat, 3);
    }
  }
  for (let i = 0; i <= spans; i++) {
    const z = zA + i * L;
    const w = i === 0 || i === spans ? 3.2 : 2.4;
    const cx = i === 0 ? z - 0 : i === spans ? z : z;
    b.box(stoneMat, hw * 2 - 1.2, 3.6, w, 0, -4.2, cx, 0, 3);
    for (const s of [-1, 1]) {
      const g = new THREE.CylinderGeometry(w / 2, w / 2, 3.6, 14);
      g.translate(s * (hw - 0.6), -4.2, cx);
      b.add(g, stoneMat, 3);
    }
  }
  // parapet: stone base with a steel baluster rail, ornate lamp posts
  const heads: THREE.Vector3[] = [];
  const bal = new THREE.CylinderGeometry(0.025, 0.025, 0.85, 5);
  const zEnd = NILE.islandZ + 6,
    zStart = 244;
  for (const s of [-1, 1]) {
    const x = s * (hw - 0.2);
    b.box(concrete, 0.4, 0.55, zEnd - zStart, x, 0.4, (zStart + zEnd) / 2, 0, 1.6);
    b.box(M.metal, 0.06, 0.06, zEnd - zStart, x, 1.3, (zStart + zEnd) / 2);
    const step = Q.hdri ? 0.7 : 1.4;
    for (let z = zStart; z < zEnd; z += step) {
      const g = bal.clone();
      g.translate(x, 0.9, z);
      b.add(g, M.metal);
    }
    for (let z = zA + 4; z < zB; z += 24) {
      b.box(M.metal, 0.24, 3.6, 0.24, x, 2.1, z);
      b.box(M.metal, 1.5, 0.08, 0.1, x - s * 0.7, 3.8, z);
      for (const o of [0.1, 1.5]) {
        const g = new THREE.SphereGeometry(0.26, 8, 6);
        g.translate(x - s * o, 4.05, z);
        b.add(g, M.lampHead);
      }
      heads.push(new THREE.Vector3(x - s * 0.8, 3.95, z));
    }
  }
  // bronze lions on stone pedestals (Jacquemart), two at each bridgehead
  const lion = lionGeometry();
  const bronze = new THREE.MeshStandardMaterial({ color: 0x4a3b2c, roughness: 0.42, metalness: 0.65 });
  const inst = new THREE.Group();
  for (const [x, z] of LION_SPOTS) {
    const north = z < 300;
    b.box(stoneMat, 3.6, 0.7, 4.2, x, 0.35, z, 0, 3);
    b.box(stoneMat, 3.0, 2.2, 3.6, x, 1.8, z, 0, 3);
    b.box(stoneMat, 3.4, 0.3, 4.0, x, 3.05, z, 0, 3);
    const m = new THREE.Mesh(lion, bronze);
    m.position.set(x, 3.2, z - (north ? 0.3 : -0.3));
    m.rotation.y = north ? Math.PI : 0; // facing the approaching traffic
    m.scale.setScalar(1.05);
    m.castShadow = Q.shadows;
    inst.add(m);
  }
  inst.userData.dynamic = true;
  group.add(inst);

  // ---- 6th of October flyover: concrete viaduct on slim piers ----
  const F = NILE.flyover;
  const topAt = (z: number) => {
    if (z < 236) return 0.7 + ((F.y - 0.7) * Math.max(0, z - F.z0)) / (236 - F.z0);
    if (z < F.z1 - 150) return F.y;
    return F.y - ((F.y - 0.7) * (z - (F.z1 - 150))) / 150;
  };
  const zs: number[] = [];
  for (let z = F.z0; z <= F.z1; z += 10) zs.push(z);
  const thick = 1.6;
  const topPts: [number, number][] = zs.map((z) => [z, topAt(z)]);
  const deck = [...topPts, ...[...topPts].reverse().map(([z, y]): [number, number] => [z, y - thick])];
  b.add(profilePrism(deck, F.half * 2, F.x - F.half), concrete, 3);
  const asphaltTop = [...topPts, ...[...topPts].reverse().map(([z, y]): [number, number] => [z, y + 0.06])];
  const lane = surface('asphalt', 0x77777a);
  b.add(profilePrism(asphaltTop, F.half * 2 - 1.2, F.x - F.half + 0.6), lane, 5);
  for (const s of [-1, 1]) {
    const bar = [
      ...topPts.map(([z, y]): [number, number] => [z, y + 0.06]),
      ...[...topPts].reverse().map(([z, y]): [number, number] => [z, y + 1.0])
    ];
    b.add(profilePrism(bar, 0.45, F.x + s * (F.half - 0.3) - 0.22), concrete, 2);
    const stepL = 30;
    for (let z = F.z0 + 60; z < F.z1 - 60; z += stepL) {
      const y = topAt(z);
      b.box(M.metal, 0.14, 7.5, 0.14, F.x + s * (F.half - 0.3), y + 3.8, z);
      b.box(M.metal, 1.8, 0.1, 0.1, F.x + s * (F.half - 1.2), y + 7.4, z);
      b.box(M.lampHead, 0.5, 0.05, 0.22, F.x + s * (F.half - 2.0), y + 7.3, z);
    }
  }
  // piers every 30 m where the deck is clear of the ground: hammerhead columns, in the river too
  for (let z = F.z0 + 20; z < F.z1; z += 30) {
    const bottom = topAt(z) - thick;
    if (bottom < 2.2) continue;
    const inRiver = z > NILE.bankZ && z < NILE.islandZ;
    const y0 = inRiver ? NILE.waterY - 1 : 0;
    b.box(concrete, 2.2, bottom - y0 - 0.9, 2.2, F.x, (bottom + y0 - 0.9) / 2, z, 0, 3);
    b.box(concrete, F.half * 1.7, 1.0, 2.4, F.x, bottom - 0.5, z, 0, 3);
  }

  // ---- Zamalek skyline across the river ----
  const nBlocks = quality === 'low' ? 80 : 240;
  const geos = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const rb = rnd(9);
  let seed = 7000,
    placed = 0;
  for (let row = 0; placed < nBlocks && row < 22; row++) {
    for (let x = -330; x < 330 && placed < nBlocks; x += 26) {
      const bx = x + rb() * 8;
      const bz = NILE.islandZ + 60 + row * 30 + rb() * 6;
      if (Math.abs(bx - NILE.tower.x) < 60 && Math.abs(bz - NILE.tower.z) < 60) continue;
      if (Math.abs(bx - F.x) < 14 || Math.abs(bx) < 14 || (Math.abs(bx - NILE.tower.x) < 18 && bz < NILE.tower.z))
        continue;
      if (rb() < 0.18) continue;
      const look = blockLook('corniche', ++seed);
      const w = 15 + rb() * 5,
        d = 14 + rb() * 5,
        h = (look.floors + Math.floor(rb() * 3)) * 3;
      const g = wallGeo(w, h, d, seed);
      const nrm = g.attributes.normal,
        col = g.attributes.color as THREE.BufferAttribute;
      for (let v = 0; v < nrm.count; v++) if (nrm.getY(v) > 0.5) col.setXYZ(v, 0.42, 0.41, 0.4);
      g.translate(bx, h / 2, bz);
      const m = facadeMaterial(look.style, look.tint, seed);
      if (!geos.has(m)) geos.set(m, []);
      geos.get(m)!.push(g);
      placed++;
    }
  }
  for (const [m, gs] of geos) {
    const mesh = new THREE.Mesh(mergeGeometries(gs, false)!, m);
    mesh.userData.city = true;
    group.add(mesh);
    gs.forEach((g) => g.dispose());
  }
  // island trees along the quay
  const step = quality === 'low' ? 26 : 13;
  for (let x = -260; x < 260; x += step) {
    if (Math.abs(x) < 14 || Math.abs(x - F.x) < 12) continue;
    if ((x / step) % 3 === 0) palm(b, x + r() * 3, NILE.islandZ + 9 + r() * 2);
    else tree(b, x + r() * 4, NILE.islandZ + 10 + r() * 3, r);
  }
  b.flush(group, Q.shadows);

  // ---- Cairo Tower ----
  group.add(buildCairoTower(NILE.tower.x, NILE.tower.z));
  // tower plaza
  const plaza = new THREE.Mesh(worldUV(new THREE.CylinderGeometry(24, 24, 0.12, 40), 2.2), surface('paving', 0xdcd2be));
  plaza.position.set(NILE.tower.x, 0.06, NILE.tower.z);
  plaza.userData.city = true;
  group.add(plaza);

  // ---- the river ----
  const normals = tex('river_normal.webp', false);
  const geo = new THREE.PlaneGeometry(WIDE, NILE.islandZ - NILE.bankZ);
  const wz = (NILE.bankZ + NILE.islandZ) / 2;
  const boats: { m: THREE.Group; v: number; x0: number; x1: number; ph: number }[] = [];
  const nBoats = quality === 'low' ? 3 : 6;
  for (let i = 0; i < nBoats; i++) {
    const m = felucca();
    const west = i % 2 === 0;
    m.position.set(
      (west ? -1 : 1) * (28 + r() * 60),
      NILE.waterY + 0.1,
      NILE.bankZ + 20 + (i / nBoats) * (NILE.islandZ - NILE.bankZ - 40)
    );
    m.scale.setScalar(1.6 + r() * 0.4);
    group.add(m);
    boats.push({
      m,
      v: (west ? 1 : -1) * (0.7 + r() * 0.8) * (i % 3 === 0 ? -1 : 1),
      x0: west ? -140 : 26,
      x1: west ? -26 : 140,
      ph: r() * 6
    });
  }
  const bob = (dt: number, t: number) => {
    for (const bt of boats) {
      bt.m.position.x += bt.v * dt;
      if (bt.m.position.x > bt.x1 || bt.m.position.x < bt.x0) bt.v = -bt.v;
      bt.m.rotation.y = bt.v > 0 ? 0 : Math.PI;
      bt.m.rotation.z = Math.sin(t * 0.9 + bt.ph) * 0.035;
      bt.m.position.y = NILE.waterY + 0.08 + Math.sin(t * 1.3 + bt.ph) * 0.04;
    }
  };
  let clock = 0;
  // calm khaki-green river: PBR water with a slowly drifting ripple normal map (scene environment gives the sky reflection)
  const n2 = normals.clone();
  n2.repeat.set(90, 36);
  n2.needsUpdate = true;
  const water = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: 0x68724a,
      emissive: 0x1b2012,
      roughness: 0.16,
      metalness: 0.05,
      normalMap: n2,
      normalScale: new THREE.Vector2(0.35, 0.35),
      envMapIntensity: 1.6
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, NILE.waterY, wz);
  group.add(water);
  void sun;
  return {
    halos: heads,
    update(dt) {
      clock += dt;
      n2.offset.x += dt * 0.0035;
      n2.offset.y += dt * 0.0008;
      bob(dt, clock);
    }
  };
}
