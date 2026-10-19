import { describe, expect, it } from 'vitest';
import { auditEdges, EDGE_KINDS } from '../src/game/world/edgeAudit';

// The road-edge audit pours every chunk of the city and checks each road's carriageway, kerb and pavement band:
// no bare ground between asphalt and pavement, no pavement or kerb slab on the drivable carriageway, no asphalt the car
// cannot drive on and no drivable ground that is not asphalt. Tolerance 0.
// (EDGE_STEP=0.6 npx vitest run tests/edgeAudit.test.ts runs it at the full sample density, ~10 M samples.)
describe('road edges', () => {
  it('have no gaps, slivers, phantom asphalt or hidden carriageway anywhere', () => {
    const r = auditEdges(Number(process.env.EDGE_STEP ?? 2));
    expect(r.samples).toBeGreaterThan(2_000_000);
    const where = r.spots
      .slice(0, 8)
      .map((s) => `${s.kind} at ${s.x.toFixed(1)},${s.z.toFixed(1)} (edge ${s.edge}, ${s.n})`);
    for (const k of EDGE_KINDS) expect(r.counts[k], `${k}: ${where.join('; ')}`).toBe(0);
  }, 240_000);
});
