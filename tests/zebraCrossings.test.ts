import { describe, expect, it } from 'vitest';
import { zebraOverlap, zebras } from '../src/game/world/roadMesh';

// Zebra crossings at junctions: two crossings that would lie across each other (short arms, forks) keep only the first.
describe('zebra crossings', () => {
  it('never overlap one another', () => {
    const Z = zebras();
    expect(Z.length).toBeGreaterThan(50);
    const bad: string[] = [];
    for (let i = 0; i < Z.length; i++)
      for (let j = i + 1; j < Z.length; j++)
        if (zebraOverlap(Z[i]!, Z[j]!)) bad.push(`${Z[i]!.x.toFixed(1)},${Z[i]!.z.toFixed(1)}`);
    expect(bad.slice(0, 5)).toEqual([]);
  });
});
