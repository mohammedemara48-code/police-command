import { describe, it, expect } from 'vitest';
import { advanceLane, dodgeRoom, lanePose, pickLane } from '../src/game/logic/crowd';
import { inRiver, net, rng } from '../src/game/logic/roadnet';
import { lots } from '../src/game/logic/lots';
import { PAVEMENT } from '../src/game/logic/cairo';

/** Is a person at (x, z) standing on the carriageway, in a building or in the river? */
function bad(x: number, z: number): string | null {
  if (net().onRoad(x, z, 0)) return 'on the carriageway';
  if (lots().blocked(x, z, 0)) return 'inside a building';
  if (inRiver(x, z, 0.3)) return 'in the river';
  return null;
}

describe('pedestrians walk on pavements only', () => {
  const N = net();
  it('lanes that pickLane offers are all beside the kerb, never on the roadway', () => {
    const r = rng(77);
    let n = 0;
    for (let t = 0; t < 80; t++) {
      const where = N.nodes[Math.floor(r() * N.nodes.length)]!;
      const lane = pickLane({ x: where.x, z: where.z }, r, { rMin: 0, rMax: 200 });
      if (!lane) continue;
      const p = lanePose(lane);
      expect(bad(p.x, p.z), `edge ${lane.e} s=${lane.s.toFixed(1)}`).toBeNull();
      n++;
    }
    expect(n).toBeGreaterThan(50);
  }, 30000);

  it('walkers that keep walking never end up on the roadway: they turn corners or turn back at the pavement ends', () => {
    const r = rng(5);
    const me = { x: 0, z: 0 };
    let turned = 0,
      steps = 0,
      lanes = 0;
    for (let t = 0; t < 60; t++) {
      const where = N.nodes[Math.floor(r() * N.nodes.length)]!;
      const l0 = pickLane({ x: where.x, z: where.z }, r, { rMin: 0, rMax: 220 });
      if (!l0) continue;
      lanes++;
      let lane = l0;
      void me;
      for (let k = 0; k < 500; k++) {
        const before = lanePose(lane);
        const st = advanceLane(lane, 0.7 + r() * 0.8, r);
        if (st.stuck) break;
        lane = st.lane;
        const after = lanePose(lane);
        steps++;
        expect(bad(after.x, after.z), `lane ${lane.e}@${lane.s.toFixed(1)}`).toBeNull();
        if (st.turned) {
          turned++;
          // the straight blend from the old pose to the new one (what the player sees at a corner) stays off the roadway too
          for (let q = 1; q < 16; q++) {
            const x = before.x + ((after.x - before.x) * q) / 16,
              z = before.z + ((after.z - before.z) * q) / 16;
            expect(bad(x, z), `corner blend of lane ${lane.e}`).toBeNull();
          }
        }
      }
    }
    expect(lanes).toBeGreaterThan(30);
    expect(turned).toBeGreaterThan(60);
    expect(steps).toBeGreaterThan(10000);
  }, 60000);

  it('stepping aside for the officer never leaves the pavement', () => {
    for (const off of [0.8, 1.2, 2.4]) {
      const room = dodgeRoom({ e: 0, s: 0, dir: 1, rel: 1, off });
      expect(room).toBeLessThan(off);
      expect(room).toBeGreaterThanOrEqual(0);
      expect(off - room).toBeGreaterThan(0.3);
    }
    expect(PAVEMENT).toBeGreaterThan(2.4);
  });
});
