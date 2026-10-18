import { beforeAll, describe, expect, it, vi } from 'vitest';
import { NILE, NILE_ROADS, LION_SPOTS, onNileRoad } from '../src/game/logic/nile';

let onRoad: (x: number, z: number, pad?: number) => boolean;
let onFoot: (x: number, z: number) => boolean;

beforeAll(async () => {
  // City pulls in the quality presets, which probe the browser
  vi.stubGlobal('navigator', { hardwareConcurrency: 8, userAgent: 'node' });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, location: { search: '' } });
  ({ onRoad, onFoot } = await import('../src/game/world/City'));
});

describe('Nile crossing', () => {
  it('keeps the road unbroken from the avenue over the bridge to the island road', () => {
    for (let z = 200; z <= NILE.islandRoadZ; z += 0.5) expect(onRoad(0, z, 0)).toBe(true);
  });

  it('keeps cars on the carriageway: the parapet side is off the road', () => {
    for (let z = 255; z < NILE.islandZ - 5; z += 10) {
      expect(onRoad(NILE.roadHalf + 1, z, 0.4)).toBe(false);
      expect(onRoad(-NILE.roadHalf - 1, z, 0.4)).toBe(false);
    }
  });

  it('lets the officer walk on the pavements but not past the parapet or into the river', () => {
    for (let z = 255; z < NILE.islandZ - 5; z += 10) {
      expect(onFoot(NILE.roadHalf + 2.5, z)).toBe(true);
      expect(onFoot(NILE.deckHalf + 1.5, z)).toBe(false);
    }
    expect(onFoot(30, 300)).toBe(false);
  });

  it('puts the island road across the bridge end and a spur towards Cairo Tower', () => {
    expect(onNileRoad(60, NILE.islandRoadZ)).toBe(true);
    expect(onNileRoad(NILE.tower.x, NILE.islandRoadZ + 30)).toBe(true);
    expect(NILE_ROADS.every((r) => r.x1 > r.x0 && r.z1 > r.z0)).toBe(true);
  });

  it('places the four lions beside the bridgeheads, off the carriageway', () => {
    expect(LION_SPOTS).toHaveLength(4);
    for (const [x, z] of LION_SPOTS) {
      expect(Math.abs(x)).toBeGreaterThan(NILE.deckHalf);
      expect(onRoad(x, z, 0)).toBe(false);
    }
  });

  it('uses the sourced tower height', () => {
    expect(NILE.tower.height).toBe(187);
  });
});
