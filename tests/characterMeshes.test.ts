import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('../src/game/entities/Character', () => ({ character: () => ({ gender: 'male' }) }));
vi.mock('../src/game/logic/character', () => ({
  modelFor: () => 'cop_m',
  recolorFor: () => ({})
}));
vi.mock('../src/game/core/Models', () => ({
  models: { dress: vi.fn() },
  MEN: ['man-a', 'man-b'],
  WOMEN: ['woman-a', 'woman-b']
}));

import { makeOfficer, makePerson, type CharacterMeshFactory } from '../src/game/core/CharacterMeshes';
import { models } from '../src/game/core/Models';

const factory: CharacterMeshFactory = {
  mat: (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.12, ...opts }),
  box: (w, h, d, material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  }
};

describe('character mesh factory', () => {
  it('keeps the officer placeholder and leg animation handles', () => {
    const g = makeOfficer(factory);
    expect(g.children).toHaveLength(5);
    expect(g.userData.legs).toHaveLength(2);
    expect(g.userData.legs[0].position.y).toBe(0.35);
    expect(models.dress).toHaveBeenLastCalledWith(g, 'cop_m', { height: 1.8, recolor: {} });
  });

  it.each([false, true])('keeps civilian limb handles and stable model selection, female=%s', (female) => {
    const a = makePerson(factory, female, 0x123456, 0x654321, 7);
    const first = vi.mocked(models.dress).mock.calls.at(-1)!;
    const b = makePerson(factory, female, 0x123456, 0x654321, 7);
    const second = vi.mocked(models.dress).mock.calls.at(-1)!;
    expect(a.g.children).toContain(a.legL);
    expect(a.g.children).toContain(a.legR);
    expect(a.g.children).toContain(a.armL);
    expect(a.g.children).toContain(a.armR);
    expect(a.legL.position.x).toBe(female ? -0.07 : -0.09);
    expect(first[1]).toBe(second[1]);
    expect(first[2]).toEqual(second[2]);
    expect(second[0]).toBe(b.g);
  });
});
