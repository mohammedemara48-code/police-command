import { describe, expect, it } from 'vitest';
import { WORLD_BOX } from '../src/game/logic/cairo';
import { net } from '../src/game/logic/roadnet';
import { planProps } from '../src/game/logic/props';
import { BAKE_CHUNK as C, MIN_AREA, inFill, paveRegion } from '../src/game/world/pavement';
import { edgesIn, onPave, signalSpot } from '../src/game/world/roadMesh';
import { planWalls } from '../src/game/world/walls';

const chunks = () => {
  const out: [number, number][] = [];
  for (let x = Math.floor(WORLD_BOX.x0 / C) * C; x < WORLD_BOX.x1; x += C)
    for (let z = Math.floor(WORLD_BOX.z0 / C) * C; z < WORLD_BOX.z1; z += C) out.push([x, z]);
  return out;
};

describe('street structure', () => {
  it('builds boundary walls only behind a pavement, never on asphalt, a junction fill or the slab', () => {
    const N = net();
    const bad: string[] = [];
    let n = 0;
    for (const [x, z] of chunks()) {
      for (const p of planWalls(x, z, x + C, z + C, edgesIn(x, z, x + C, z + C))) {
        n++;
        for (const k of [0, 0.5, 1]) {
          const px = p.ax + (p.bx - p.ax) * k,
            pz = p.az + (p.bz - p.az) * k;
          if (N.onRoad(px, pz, 0.25) || inFill(px, pz) || onPave(px, pz)) bad.push(`${px.toFixed(1)},${pz.toFixed(1)}`);
        }
      }
    }
    expect(n).toBeGreaterThan(500);
    expect(bad.slice(0, 8), `${bad.length} wall points on road or pavement`).toEqual([]);
  }, 120_000);

  it('leaves no small stray pavement slab inside a chunk', () => {
    const bad: string[] = [];
    for (const [x, z] of chunks()) {
      for (const g of paveRegion(x, z, x + C, z + C).pave) {
        const o = g.outer;
        if (o.some((v) => v.x <= x + 0.01 || v.x >= x + C - 0.01 || v.z <= z + 0.01 || v.z >= z + C - 0.01)) continue;
        let a = 0;
        for (let i = 0, j = o.length - 1; i < o.length; j = i++) a += (o[j]!.x - o[i]!.x) * (o[j]!.z + o[i]!.z);
        if (Math.abs(a / 2) < MIN_AREA - 0.5) bad.push(`${o[0]!.x.toFixed(1)},${o[0]!.z.toFixed(1)}`);
      }
    }
    expect(bad.slice(0, 8), `${bad.length} stray slabs`).toEqual([]);
  }, 120_000);

  it('stands traffic-light poles on the pavement, clear of the carriageway', () => {
    const sig = planProps().filter((p) => p.kind === 'signal');
    const built = sig.map((p) => signalSpot(p)).filter((p) => p !== null);
    for (const p of built) expect(net().onRoad(p.x, p.z, 0.6) || !onPave(p.x, p.z)).toBe(false);
    expect(built.length).toBeGreaterThan(sig.length * 0.6);
  }, 120_000);
});
