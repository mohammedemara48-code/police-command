import { describe, expect, it } from 'vitest';
import { lots, obbOverlap } from '../src/game/logic/lots';
import { inRiver, net } from '../src/game/logic/roadnet';
import { PAVEMENT } from '../src/game/logic/cairo';

describe('building lots', () => {
  const L = lots();
  it('plans thousands of buildings', () => {
    expect(L.lots.length).toBeGreaterThan(3000);
  });
  it('keeps every building clear of the carriageway, pavement and river', () => {
    const N = net();
    let bad = 0;
    for (const l of L.lots) {
      if (l.reserved) continue;
      const c = Math.cos(l.yaw),
        s = Math.sin(l.yaw);
      for (const [a, b] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1]
      ]) {
        const x = l.x + a * l.hw * c + b * l.hl * s,
          z = l.z - a * l.hw * s + b * l.hl * c;
        if (N.onRoad(x, z, PAVEMENT - 0.5) || inRiver(x, z)) bad++;
      }
    }
    expect(bad).toBe(0);
  });
  it('keeps the police station and the lions off the carriageway and out of the river', () => {
    const N = net();
    const held = L.lots.filter((l) => l.reserved && !l.ghost);
    expect(held.length).toBeGreaterThanOrEqual(4);
    for (const l of held) {
      const c = Math.cos(l.yaw),
        s = Math.sin(l.yaw);
      for (const [a, b] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1]
      ]) {
        const x = l.x + a * l.hw * c + b * l.hl * s,
          z = l.z - a * l.hw * s + b * l.hl * c;
        expect(N.onRoad(x, z, 0.3)).toBe(false);
        expect(inRiver(x, z)).toBe(false);
      }
    }
  });
  it('never overlaps two buildings', () => {
    let bad = 0;
    for (const l of L.lots) {
      for (const o of L.inBox(l.x - 40, l.z - 40, l.x + 40, l.z + 40)) {
        if (o.id < l.id && obbOverlap(l, o, 0)) bad++;
      }
    }
    expect(bad).toBe(0);
  });
  it('leaves the roads walkable', () => {
    const N = net();
    let blocked = 0,
      n = 0;
    for (const e of N.edges)
      for (let s = 0; s < e.len; s += 7) {
        const p = N.at(e, s);
        n++;
        if (L.blocked(p.x, p.z, 0.6)) blocked++;
      }
    expect(blocked).toBe(0);
    expect(n).toBeGreaterThan(5000);
  });
});
