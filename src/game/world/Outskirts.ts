/**
 * The city continues beyond the playable grid: lattice blocks of apartment houses, low informal housing, empty lots,
 * palm groves and a hazy skyline; at the Haram end the avenue becomes a closed boulevard that ends at the wall of the
 * Giza plateau, and only the foot of the pyramids stands on sand. See logic/outskirts.ts for the layout.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { quality } from '../config/Quality';
import { Batch, PROP_MATS, lamp, surface, worldUV } from './Environment';
import { palm } from './Trees';
import { wallGeo } from './Egypt';
import { facadeMaterial } from './Facade';
import { BLOCK, BOULEVARD, CELL, PLATEAU, planOutskirts } from '../logic/outskirts';

/** Pyramid foot positions and radii of the sand that surrounds them (x, z, radius). */
export const SAND_DISCS: [number, number, number][] = [
  [40, -540, 150],
  [-135, -670, 140],
  [-240, -800, 95]
];

const EARTH = 0x8c8372;

function plane(w: number, d: number, x: number, y: number, z: number, mat: THREE.Material, uv: number, shadows = true) {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, z);
  worldUV(g, uv);
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = shadows;
  m.userData.city = true;
  return m;
}

export function buildOutskirts(group: THREE.Group) {
  const plan = planOutskirts(quality);
  const out = new THREE.Group();
  out.userData.city = true;
  group.add(out);

  // ground: one dark earth plane under everything, so no sand shows between the blocks
  out.add(plane(3400, 1800, 0, -0.03, -650, surface('desert', EARTH), 14, false));
  // the plateau in front of the pyramids is pale dusty rock; sand only right at the foot of each pyramid
  out.add(plane(PLATEAU.halfX * 2 + 260, 900, 0, -0.01, -660, surface('desert', 0xa89a7e), 14, false));
  SAND_DISCS.forEach(([x, z, r], i) => {
    const g = new THREE.CircleGeometry(r, 36);
    g.rotateX(-Math.PI / 2);
    g.translate(x, 0.006 + i * 0.004, z);
    worldUV(g, 12);
    const m = new THREE.Mesh(g, surface('desert', 0xd9c8a2));
    m.userData.city = true;
    out.add(m);
  });

  // block tiles: street asphalt under every cell, then the block surface inside
  const asphalt: THREE.BufferGeometry[] = [];
  const pave: THREE.BufferGeometry[] = [];
  const dirt: THREE.BufferGeometry[] = [];
  const grass: THREE.BufferGeometry[] = [];
  const tile = (arr: THREE.BufferGeometry[], s: number, x: number, y: number, z: number) => {
    const g = new THREE.PlaneGeometry(s, s);
    g.rotateX(-Math.PI / 2);
    g.translate(x, y, z);
    arr.push(g);
  };
  const walls = new Batch();
  const stone = PROP_MATS.paint;
  for (const c of plan.cells) {
    tile(asphalt, CELL, c.x, 0.012, c.z);
    tile(c.use === 'built' ? pave : c.use === 'green' ? grass : c.use === 'low' ? pave : dirt, BLOCK, c.x, 0.02, c.z);
    if (c.use === 'lot') {
      const e = BLOCK / 2;
      walls.box(stone, BLOCK, 2.2, 0.25, c.x, 1.1, c.z - e);
      walls.box(stone, BLOCK, 2.2, 0.25, c.x, 1.1, c.z + e);
      walls.box(stone, 0.25, 2.2, BLOCK, c.x - e, 1.1, c.z);
      walls.box(stone, 0.25, 2.2, BLOCK * 0.55, c.x + e, 1.1, c.z - BLOCK * 0.22);
    }
  }
  const flat = (geos: THREE.BufferGeometry[], mat: THREE.Material, uv: number) => {
    if (!geos.length) return;
    geos.forEach((g) => worldUV(g, uv));
    const m = new THREE.Mesh(mergeGeometries(geos, false)!, mat);
    m.receiveShadow = false;
    m.userData.city = true;
    out.add(m);
    geos.forEach((g) => g.dispose());
  };
  flat(asphalt, surface('asphalt', 0x8a8a8a), 5);
  flat(pave, surface('paving', 0xc9c2b4), 2);
  flat(dirt, surface('desert', 0xa39a86), 10);
  flat(grass, surface('park', 0x7f8f5a), 9);
  walls.flush(out);

  // buildings, merged per facade material
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (g: THREE.BufferGeometry, mat: THREE.Material) => {
    const nrm = g.attributes.normal,
      col = g.attributes.color as THREE.BufferAttribute;
    for (let v = 0; v < nrm.count; v++) if (nrm.getY(v) > 0.5) col.setXYZ(v, 0.42, 0.41, 0.4);
    if (!byMat.has(mat)) byMat.set(mat, []);
    byMat.get(mat)!.push(g);
  };
  plan.plots.forEach((p, i) => {
    const h = p.floors * 3;
    const g = wallGeo(p.w, h, p.d, i + 300);
    g.translate(p.x, h / 2, p.z);
    const mat = facadeMaterial(p.style, p.tint, 0);
    put(g, mat);
    if (p.roofBox) {
      const rb = wallGeo(3.2, 2.6, 3.2, i + 7);
      rb.translate(p.x + (p.w / 2 - 2.4) * (i % 2 ? 1 : -1), h + 1.3, p.z + (p.d / 2 - 2.4) * (i % 3 ? 1 : -1));
      put(rb, mat);
    }
  });
  for (const [mat, geos] of byMat) {
    const mesh = new THREE.Mesh(mergeGeometries(geos, false)!, mat);
    mesh.userData.city = true;
    out.add(mesh);
    geos.forEach((g) => g.dispose());
  }

  // hazy skyline far beyond the built-up edge (the scene fog melts it into the horizon)
  const skyGeos: THREE.BufferGeometry[] = [];
  for (const s of plan.skyline) {
    const g = new THREE.BoxGeometry(s.w, s.h, s.d);
    g.translate(s.x, s.h / 2, s.z);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const t = 0.62 + ((Math.abs(Math.round(s.x * 7 + s.z * 3)) % 9) / 9) * 0.3;
    for (let i = 0; i < n; i++) {
      const roof = g.attributes.normal.getY(i) > 0.5 ? 0.8 : 1;
      col[i * 3] = t * roof;
      col[i * 3 + 1] = t * 0.96 * roof;
      col[i * 3 + 2] = t * 0.9 * roof;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    skyGeos.push(g);
  }
  if (skyGeos.length) {
    const m = new THREE.Mesh(
      mergeGeometries(skyGeos, false)!,
      new THREE.MeshStandardMaterial({ color: 0xcbc3b2, roughness: 1, vertexColors: true })
    );
    m.userData.city = true;
    out.add(m);
    skyGeos.forEach((g) => g.dispose());
  }

  // palms in the groves and along the blocks (the low preset keeps only the nearest ones)
  const pb = new Batch();
  const palms = quality === 'low' ? plan.palms.filter((_, i) => i % 5 === 0) : plan.palms;
  for (const p of palms) palm(pb, p.x, p.z, p.h);

  boulevard(out, pb);
  pb.flush(out);
}

/** The Haram end of the avenue: closed by a barrier at the last cross street, continuing as a boulevard to the plateau wall. */
function boulevard(out: THREE.Group, b: Batch) {
  const { zBarrier, zWall, half } = BOULEVARD;
  const len = zBarrier - zWall;
  const zc = (zBarrier + zWall) / 2;
  const asphalt = surface('asphalt', 0x9a9a9a);
  const paving = surface('paving', 0xd8d2c8);
  out.add(plane(half * 2, len, 0, 0.05, zc, asphalt, 5, false));
  for (const s of [-1, 1]) {
    out.add(plane(2.4, len, s * (half + 1.2), 0.07, zc, paving, 2, false));
    b.box(PROP_MATS.paint, 0.22, 0.2, len, s * (half + 0.02), 0.1, zc);
  }
  for (let z = zBarrier - 6; z > zWall + 4; z -= 8) b.box(PROP_MATS.paint, 0.14, 0.012, 3, 0, 0.06, z);
  // lamps and palms along both pavements
  for (let z = zBarrier - 12; z > zWall + 6; z -= 22) {
    lamp(b, -5.0, z, 1);
    lamp(b, 5.0, z - 11, -1);
  }
  for (let z = zBarrier - 6; z > zWall + 4; z -= 11) for (const s of [-1, 1]) palm(b, s * 6.7, z, 8 + ((z * 7) % 2));

  // closed end of the avenue: concrete blocks and a red-white barrier across the carriageway
  const concrete = PROP_MATS.paint;
  for (const x of [-3.4, 0, 3.4]) b.box(concrete, 2.4, 0.85, 0.7, x, 0.43, zBarrier - 0.6);
  b.box(PROP_MATS.signRed, 9.2, 0.14, 0.1, 0, 1.05, zBarrier - 1.3);
  b.box(PROP_MATS.white, 1.1, 0.145, 0.105, -3.6, 1.05, zBarrier - 1.3);
  b.box(PROP_MATS.white, 1.1, 0.145, 0.105, 0.6, 1.05, zBarrier - 1.3);
  for (const x of [-4.9, 4.9]) b.box(concrete, 0.5, 1.3, 0.5, x, 0.65, zBarrier - 1.3);

  // the plateau wall with the gate, a pale paved forecourt in front of it
  const limestone = surface('stone', 0xd8c9a4);
  const wallB = new Batch();
  const wz = zWall - 0.7;
  out.add(plane(60, 24, 0, 0.08, zWall + 12, paving, 2, false));
  for (const s of [-1, 1]) {
    wallB.box(limestone, 321, 4.6, 1.4, s * (10 + 160.5), 2.3, wz, 0, 3.4);
    wallB.box(limestone, 3.2, 8.5, 3.2, s * 10.5, 4.25, wz, 0, 3.4);
    wallB.box(limestone, 2.2, 9.6, 2.2, s * 10.5, 4.8, wz - 0.4, 0, 3.4);
  }
  wallB.box(limestone, 21, 1.6, 2.6, 0, 8.6, wz, 0, 3.4);
  wallB.flush(out);
  // beyond the gate: a paved walk lined with palms towards the pyramids, groves and fields either side
  out.add(plane(14, 120, 0, 0.07, zWall - 60, paving, 2, false));
  for (let z = zWall - 10; z > zWall - 120; z -= 12) for (const s of [-1, 1]) palm(b, s * 9.5, z, 8 + ((z * 3) % 3));
  const grove = surface('park', 0x7b8a57);
  for (const s of [-1, 1]) {
    out.add(plane(130, 78, s * 84, 0.04, zWall - 44, grove, 9, false));
    for (let k = 0; k < 26; k++) {
      const gx = 24 + ((k * 37) % 120),
        gz = zWall - 6 - ((k * 53) % 72);
      palm(b, s * gx, gz, 7 + ((k * 7) % 3));
    }
  }
  // low sandstone service buildings for the visitor gate
  const sandstone = facadeMaterial('modern', 0xd9c9a3, 1);
  const lowGeos: THREE.BufferGeometry[] = [];
  for (const [x, z, w, d] of [
    [-72, zWall - 150, 44, 16],
    [66, zWall - 140, 36, 14],
    [-118, zWall - 110, 26, 12],
    [112, zWall - 100, 30, 14]
  ] as const) {
    const g = wallGeo(w, 6, d, Math.abs(x));
    g.translate(x, 3, z);
    lowGeos.push(g);
  }
  const lowMesh = new THREE.Mesh(mergeGeometries(lowGeos, false)!, sandstone);
  lowMesh.userData.city = true;
  out.add(lowMesh);
  lowGeos.forEach((g) => g.dispose());
  for (let x = 16; x < 150; x += 9) for (const s of [-1, 1]) palm(b, s * x, zWall + 3, 7 + ((x * 3) % 3));
  for (const s of [-1, 1]) for (let x = 24; x < 150; x += 17) palm(b, s * x, zWall - 6, 8 + ((x * 5) % 3));
}
