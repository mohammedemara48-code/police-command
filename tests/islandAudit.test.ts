import { describe, expect, it } from 'vitest';
import { auditIslands } from '../src/game/world/edgeAudit';

// Stray pavement and kerb: crumbs of slab smaller than 3 m² and kerb strips with no slab beside them, lying on the
// asphalt. Fork wedge tips are now poured as asphalt; what is left is held at today's count so it can only go down.
describe('stray pavement and kerb', () => {
  it('stays at or below the current count', () => {
    const r = auditIslands();
    const where = r.spots
      .slice(0, 6)
      .map((s) => `${s.kind} at ${s.x.toFixed(1)},${s.z.toFixed(1)}`)
      .join('; ');
    expect(r.counts.crumb, where).toBeLessThanOrEqual(CRUMBS);
    expect(r.counts.stray, where).toBeLessThanOrEqual(STRAY);
  }, 240_000);
});
const CRUMBS = 16;
const STRAY = 405;
