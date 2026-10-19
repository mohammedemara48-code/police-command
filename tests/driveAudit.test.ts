import { describe, expect, it } from 'vitest';
import { auditDriving, drivePath } from '../src/game/logic/driveAudit';

// An autopilot drives every vehicle along every road (both ways) and through every turn of every junction at the speed
// a driver would hold, with the real handling and the real road-edge step. Nothing may stop it: no kerb scrape, no wedge,
// no leaving the asphalt, no speed lost that it should not lose. Tolerance 0.
// (DRIVE_EVERY=1 runs every route for every vehicle, ~70 000 runs.)
describe('driving the whole network', () => {
  it('never scrapes, wedges, leaves the road or gets stuck, in any vehicle', () => {
    const r = auditDriving(['police', 'private', 'microbus', 'tuktuk'], Number(process.env.DRIVE_EVERY ?? 6));
    expect(r.runs).toBeGreaterThan(10_000);
    const where = r.spots
      .slice(0, 6)
      .map((s) => `${s.kind} ${s.vehicle} at ${s.x.toFixed(1)},${s.z.toFixed(1)} (${s.route})`);
    for (const [k, n] of Object.entries(r.counts)) expect(n, `${k}: ${where.join('; ')}`).toBe(0);
  }, 240_000);
  it('does catch a road that ends in a wall', () => {
    const Q = {
      onRoad: (x: number) => x < 40,
      mid: (x: number, z: number) => ({ x: Math.min(x, 30), z, yaw: Math.PI / 2 })
    };
    const path = Array.from({ length: 60 }, (_, i) => ({ x: i, z: 0 }));
    const spots = drivePath(path, 'police', 'wall', Q);
    expect(spots.some((s) => s.kind === 'wedged' || s.kind === 'stuck' || s.kind === 'scrape')).toBe(true);
  });
});
