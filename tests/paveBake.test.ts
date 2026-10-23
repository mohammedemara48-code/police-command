import { describe, expect, it } from 'vitest';
import baked from '../src/game/world/paveBake.json';
import { shapeHash } from '../src/game/world/pavement';

// The pavement is baked offline (npm run bake:pave). If the road network or the pavement rules change, the bake must
// be rebuilt, or every chunk would fall back to building its pavement at load time.
describe('baked pavement', () => {
  it('matches the current road shape', () => {
    expect((baked as { hash: string }).hash).toBe(shapeHash());
  });
});
