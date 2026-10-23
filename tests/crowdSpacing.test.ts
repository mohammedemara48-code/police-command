import { describe, expect, it } from 'vitest';
import { KERB_CLEAR, PERSONAL, lanePose, pickLane, separate, type Walker } from '../src/game/logic/crowd';
import { net, rng } from '../src/game/logic/roadnet';
import { PAVEMENT } from '../src/game/logic/cairo';

// Walkers that meet on a pavement step aside instead of walking through each other, and they never step out to the
// kerb edge to do it.
describe('pedestrian spacing', () => {
  it(`keeps ${PERSONAL} m between people, a metre in from the kerb`, () => {
    const N = net();
    const r = rng(11);
    let groups = 0;
    for (let t = 0; t < 60; t++) {
      const n = N.nodes[Math.floor(r() * N.nodes.length)]!;
      const lane = pickLane({ x: n.x, z: n.z }, r, { rMin: 0, rMax: 200 });
      if (!lane) continue;
      groups++;
      // three or four people bunched within a metre of each other, some walking each way
      const k = 3 + Math.floor(r() * 2);
      const ws: (Walker & { off: number; rel: number })[] = [];
      for (let i = 0; i < k; i++) {
        const l = { ...lane, s: lane.s + (r() - 0.5) * 0.8, off: KERB_CLEAR + 0.4 + r() * 0.6 };
        if (r() < 0.4) l.dir = -l.dir as 1 | -1;
        if (l.dir !== lane.dir) l.rel = -lane.rel as 1 | -1;
        const p = lanePose(l);
        const rx = Math.cos(p.yaw),
          rz = -Math.sin(p.yaw);
        const toKerb = l.off - KERB_CLEAR,
          toWall = PAVEMENT - 0.5 - l.off;
        ws.push({
          x: p.x,
          z: p.z,
          rx,
          rz,
          right: l.rel > 0 ? toWall : toKerb,
          left: l.rel > 0 ? toKerb : toWall,
          off: l.off,
          rel: l.rel
        });
      }
      const { side: off, along } = separate(ws, 12);
      const at = ws.map((w, i) => ({
        x: w.x + w.rx * off[i]! - w.rz * along[i]!,
        z: w.z + w.rz * off[i]! + w.rx * along[i]!
      }));
      for (let i = 0; i < k; i++) {
        // offset from the kerb after the step: never inside the kerb clearance
        const fromKerb = ws[i]!.off + off[i]! * ws[i]!.rel;
        expect(fromKerb).toBeGreaterThanOrEqual(KERB_CLEAR - 1e-6);
        expect(net().onRoad(at[i]!.x, at[i]!.z, 0)).toBe(false);
        for (let j = i + 1; j < k; j++)
          expect(Math.hypot(at[i]!.x - at[j]!.x, at[i]!.z - at[j]!.z), `group ${t}`).toBeGreaterThanOrEqual(
            PERSONAL - 0.05
          );
      }
    }
    expect(groups).toBeGreaterThan(40);
  }, 60_000);
});
