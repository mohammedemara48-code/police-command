import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { bindOfficerWeapon } from '../src/game/core/OfficerAttachments';
import { models } from '../src/game/core/Models';

vi.mock('../src/game/world/Egypt', () => ({ rigModelWheels: vi.fn() }));

// Real shipped rigs/animation clips, without textures (no DOM or GPU needed).
async function rig(kind = 'cop_m') {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).register((parser) => ({
    name: 'test-no-textures',
    beforeRoot() {
      parser.json.materials = [];
      for (const mesh of parser.json.meshes) for (const p of mesh.primitives) delete p.material;
    }
  }));
  const bytes = readFileSync(new URL(`../public/models/${kind}.glb`, import.meta.url));
  return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}

describe('officer attachments on the shipped rig', () => {
  for (const kind of ['cop_m', 'cop_f']) {
    it(`${kind}: badge stays at the chest surface, not a twice-transformed world offset`, async () => {
      const { scene } = await rig(kind);
      scene.scale.setScalar(0.83);
      scene.position.set(2, 0.1, -3);
      scene.rotation.y = 0.4;
      scene.updateMatrixWorld(true);
      const H = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3()).y / scene.scale.y;
      const chest = scene.getObjectByName('spine_03')!;
      const ch = scene.worldToLocal(chest.getWorldPosition(new THREE.Vector3()));
      const expected = scene.localToWorld(ch.add(new THREE.Vector3(H * 0.055, H * 0.045, H * 0.072)));
      models['policeGear'](scene);
      const badge = chest.children.find((c) => (c as THREE.Mesh).geometry?.type === 'CylinderGeometry')!;
      scene.updateMatrixWorld(true);
      expect(badge.getWorldPosition(new THREE.Vector3()).distanceTo(expected)).toBeLessThan(0.00001);
    });
  }
});

for (const kind of ['cop_m', 'cop_f']) {
  it(`${kind}: weapon grip follows the right palm through idle, run, aim and firing`, async () => {
    const { scene, animations } = await rig(kind);
    const player = new THREE.Group();
    const holder = new THREE.Group();
    holder.userData.model = true;
    player.add(holder);
    holder.add(scene);
    scene.scale.setScalar(0.83);
    const gun = new THREE.Group();
    player.add(gun);
    expect(bindOfficerWeapon(player, gun)).toBe(true);
    const hand = scene.getObjectByName('hand_r')!;
    expect(gun.parent).toBe(hand);
    const mixer = new THREE.AnimationMixer(scene);
    for (const pose of ['idle', 'walk', 'sprint', 'aim', 'gun']) {
      mixer.stopAllAction();
      mixer.clipAction(animations.find((c) => c.name === pose)!).play();
      for (const t of [0, 0.15, 0.4, 0.7]) {
        mixer.setTime(t);
        player.updateMatrixWorld(true);
        const palm = hand.localToWorld(new THREE.Vector3(0, 0.065, 0));
        expect(gun.getWorldPosition(new THREE.Vector3()).distanceTo(palm)).toBeLessThan(0.00001);
        expect(gun.getWorldScale(new THREE.Vector3()).x).toBeCloseTo(1);
        const barrel = new THREE.Vector3(0, 0, 1).transformDirection(gun.matrixWorld);
        const fingers = new THREE.Vector3(0, 1, 0).transformDirection(hand.matrixWorld);
        expect(barrel.dot(fingers)).toBeCloseTo(1);
      }
    }
    // A character edit removes the old model; rebind rather than losing the gun with it.
    holder.removeFromParent();
    expect(bindOfficerWeapon(player, gun)).toBe(false);
    expect(gun.parent).toBe(player);
    const replacement = await rig(kind === 'cop_m' ? 'cop_f' : 'cop_m');
    holder.clear();
    holder.add(replacement.scene);
    player.add(holder);
    expect(bindOfficerWeapon(player, gun)).toBe(true);
    expect(gun.parent).toBe(replacement.scene.getObjectByName('hand_r'));
  });
}
