/** Landmarks of the open city: the bronze Qasr El Nil lions on their pedestals and the Cairo Tower with its plaza. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Q } from '../config/Quality';
import { TOWER_AT, lions } from '../logic/monuments';
import { Batch, surface } from './Environment';
import { buildCairoTower } from './CairoTower';

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

export function buildMonuments(parent: THREE.Object3D) {
  const b = new Batch();
  const stone = surface('stone', 0xd9cfba);
  const lion = lionGeometry();
  const bronze = new THREE.MeshStandardMaterial({ color: 0x4a3b2c, roughness: 0.42, metalness: 0.65 });
  const inst = new THREE.Group();
  for (const l of lions()) {
    // pedestal first, in the lion's frame (it faces +z)
    const ped = new THREE.Group();
    ped.position.set(l.x, 0, l.z);
    ped.rotation.y = l.yaw;
    const box = (w: number, h: number, d: number, y: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stone);
      m.position.y = y;
      m.castShadow = Q.shadows;
      ped.add(m);
    };
    box(3.6, 0.7, 4.2, 0.35);
    box(3.0, 2.2, 3.6, 1.8);
    box(3.4, 0.3, 4.0, 3.05);
    const m = new THREE.Mesh(lion, bronze);
    m.position.set(0, 3.2, -0.3);
    m.scale.setScalar(1.05);
    m.castShadow = Q.shadows;
    ped.add(m);
    inst.add(ped);
  }
  inst.userData.dynamic = true;
  parent.add(inst);
  // the tower plaza: a paved disc and low stone kerb under the tower
  const paving = surface('paving', 0xcfc8bb);
  const disc = new THREE.CylinderGeometry(16, 16, 0.2, 40);
  disc.translate(TOWER_AT.x, 0.1, TOWER_AT.z);
  b.add(disc, paving, 2);
  b.flush(parent, false);
  parent.add(buildCairoTower(TOWER_AT.x, TOWER_AT.z));
}
