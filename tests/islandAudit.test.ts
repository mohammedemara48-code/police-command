import { describe, expect, it } from 'vitest';
import { auditIslands } from '../src/game/world/edgeAudit';

// Stray pavement and kerb: crumbs of slab smaller than 3 m² and kerb strips with no slab beside them, lying on the
// asphalt. The pavement is one polygon region per chunk (thin tips and crumbs taken out and poured as asphalt) and the
// kerbs follow its boundary only, so there must be none.
describe('stray pavement and kerb', () => {
  it('there is none', () => {
    const r = auditIslands();
    const where = r.spots
      .slice(0, 6)
      .map((s) => `${s.kind} at ${s.x.toFixed(1)},${s.z.toFixed(1)}`)
      .join('; ');
    expect(r.counts.crumb, where).toBe(0);
    expect(r.counts.stray, where).toBe(0);
  }, 240_000);
});
