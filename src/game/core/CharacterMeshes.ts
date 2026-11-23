import * as THREE from 'three';
import { character } from '../entities/Character';
import { modelFor, recolorFor } from '../logic/character';
import { outfitFor } from '../logic/outfits';
import { models, MEN, WOMEN } from './Models';

/** Geometry helpers supplied by the scene, without exposing its private state. */
export interface CharacterMeshFactory {
  mat(color: number, opts?: Partial<THREE.MeshStandardMaterialParameters>): THREE.MeshStandardMaterial;
  box(w: number, h: number, d: number, material: THREE.Material, x?: number, y?: number, z?: number): THREE.Mesh;
}

export function makeOfficer(factory: CharacterMeshFactory) {
  const g = new THREE.Group();
  const navy = factory.mat(0x142033, { roughness: 0.55 });
  const skin = factory.mat(0xd7a679);
  g.add(factory.box(0.46, 0.62, 0.28, navy, 0, 1.15, 0));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), skin);
  head.position.y = 1.62;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 10), factory.mat(0x0c1420));
  cap.position.y = 1.76;
  g.add(cap);
  const legL = factory.box(0.14, 0.7, 0.16, navy, -0.12, 0.35, 0);
  const legR = factory.box(0.14, 0.7, 0.16, navy, 0.12, 0.35, 0);
  g.add(legL, legR);
  g.userData.legs = [legL, legR];
  const c = character();
  models.dress(g, modelFor(c), { height: 1.8, recolor: recolorFor(c) });
  return g;
}

export function makePerson(factory: CharacterMeshFactory, female: boolean, dress: number, hair: number, id?: number) {
  const g = new THREE.Group();
  const skinC = female ? 0xf0c2a4 : 0xc68658;
  const skin = factory.mat(skinC);
  const cloth = factory.mat(dress, { roughness: 0.6 });
  const hairMat = factory.mat(hair, { roughness: 0.45 });
  const legMat = factory.mat(female ? 0x2a2428 : 0x243044);

  const legL = new THREE.Group();
  const legR = new THREE.Group();
  legL.position.set(female ? -0.07 : -0.09, 0.78, 0);
  legR.position.set(female ? 0.07 : 0.09, 0.78, 0);
  legL.add(factory.box(female ? 0.09 : 0.12, 0.74, 0.12, legMat, 0, -0.37, 0));
  legR.add(factory.box(female ? 0.09 : 0.12, 0.74, 0.12, legMat, 0, -0.37, 0));
  g.add(legL, legR);

  if (female) {
    const dressMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.26, 0.62, 8), cloth);
    dressMesh.position.y = 1.12;
    g.add(dressMesh);
  } else {
    g.add(factory.box(0.42, 0.55, 0.24, cloth, 0, 1.16, 0));
  }

  const armL = new THREE.Group();
  const armR = new THREE.Group();
  armL.position.set(female ? -0.2 : -0.26, 1.32, 0);
  armR.position.set(female ? 0.2 : 0.26, 1.32, 0);
  armL.add(factory.box(0.08, 0.46, 0.08, cloth, 0, -0.22, 0));
  armR.add(factory.box(0.08, 0.46, 0.08, cloth, 0, -0.22, 0));
  g.add(armL, armR);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), skin);
  head.position.y = female ? 1.58 : 1.6;
  g.add(head);
  const eye = factory.mat(0x1a1a1a);
  const eL = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), eye);
  const eR = eL.clone();
  eL.position.set(-0.05, head.position.y + 0.01, 0.13);
  eR.position.set(0.05, head.position.y + 0.01, 0.13);
  g.add(eL, eR);

  if (female) {
    const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), hairMat);
    hairMesh.scale.set(1, 1.15, 1.2);
    hairMesh.position.set(0, 1.64, -0.02);
    g.add(hairMesh);
    const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.32, 3, 6), hairMat);
    tail.position.set(0.02, 1.38, -0.12);
    g.add(tail);
  } else {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.155, 10, 8), hairMat);
    cap.scale.set(1, 0.55, 1);
    cap.position.set(0, 1.7, 0);
    g.add(cap);
  }
  // realistic MakeHuman people (CC0); pick a stable variant from the colours passed in
  const pool = female ? WOMEN : MEN;
  const pick = pool[((hair >> 3) + (dress >> 5)) % pool.length]!;
  const who = id ?? (dress >> 4) + hair;
  models.dress(g, pick, {
    height: female ? 1.68 : 1.8,
    outfit: outfitFor({ id: who, role: id === undefined ? 'pedestrian' : 'passenger', female, top: dress })
  });
  return { g, legL, legR, armL, armR };
}
