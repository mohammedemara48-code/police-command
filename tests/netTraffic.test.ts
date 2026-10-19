import { describe, expect, it } from 'vitest';
import { NetTraffic } from '../src/game/logic/netTraffic';
import { net } from '../src/game/logic/roadnet';
import { rng } from '../src/game/logic/roadnet';
import { axisGreen, signalNodes, armAxis } from '../src/game/logic/signals';

const me = { x: 0, z: 0 };

describe('network traffic', () => {
  it('keeps a fixed number of cars on the roads for ten minutes of driving', () => {
    const t = new NetTraffic(15, me.x, me.z, rng(5));
    let clock = 0;
    let off = 0;
    let moved = 0;
    const start = t.cars.map((c) => ({ x: c.x, z: c.z }));
    for (let i = 0; i < 600 * 10; i++) {
      clock += 0.1;
      t.step(0.1, clock, me);
      for (const c of t.cars) {
        expect(Number.isFinite(c.x) && Number.isFinite(c.z) && Number.isFinite(c.yaw)).toBe(true);
        expect(c.v).toBeLessThan(13);
        if (i % 20 === 0 && !net().onRoad(c.x, c.z, 1.2)) off++;
      }
    }
    t.cars.forEach((c, i) => (moved += Math.hypot(c.x - start[i]!.x, c.z - start[i]!.z)));
    expect(t.cars).toHaveLength(15);
    expect(off).toBeLessThan(15 * 30 * 0.05);
    expect(moved).toBeGreaterThan(100);
  }, 30000);

  it('stops for a red light', () => {
    const N = net();
    const sig = signalNodes()[0]!;
    const e = N.edges[sig.edges.find((id) => !N.edges[id]!.ring && N.edges[id]!.len > 60)!]!;
    const t = new NetTraffic(1, 0, 0, rng(2));
    const c = t.cars[0]!;
    const atB = e.b === sig.id;
    c.e = e.id;
    c.dir = atB ? 1 : -1;
    c.s = atB ? e.len - 45 : 45;
    c.v = c.cruise = 8;
    c.next = null;
    // choose a clock at which this arm is red
    const axis = armAxis(sig, e);
    let clock = 0;
    while (axisGreen(clock, axis)) clock += 0.5;
    const endClock = clock + 10;
    let minGap = Infinity;
    for (let k = clock; k < endClock; k += 0.1) {
      t.step(0.1, k, { x: c.x + 60, z: c.z + 60 });
      if (c.e === e.id) minGap = Math.min(minGap, atB ? e.len - c.s : c.s);
    }
    expect(minGap).toBeGreaterThan(5);
    expect(c.v).toBeLessThan(0.5);
  });

  it('gives way to a siren by stopping near the patrol car', () => {
    const t = new NetTraffic(6, 0, 0, rng(8));
    const c = t.cars[0]!;
    const me2 = { x: c.x + 5, z: c.z };
    for (let i = 0; i < 100; i++) t.step(0.1, 3, me2, { siren: true });
    expect(c.v).toBeLessThan(0.3);
  });
});
