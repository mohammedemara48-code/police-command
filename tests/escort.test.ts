import { describe, it, expect } from 'vitest';
import {
  vipSpeed,
  ambushPlan,
  ambushCount,
  routeLength,
  pointAlong,
  ambushSpot,
  shootsVip,
  vipShotDamage,
  vipCrashDamage,
  vipDestination,
  VIP_CRUISE,
  ESCORT_NEAR,
  ESCORT_FAR,
  AMBUSH_AHEAD,
  SHOT_R
} from '../src/game/logic/escort';
import { callReward, callLimit } from '../src/game/logic/calls';

// the city's intersection grid (world/City.ts touches the DOM on import, so it's mirrored here)
const AVENUES_X = [-120, -60, 0, 60, 120];
const CROSS_Z = [-96, -45, 50, 145, 236];
const NODES = AVENUES_X.flatMap((x) => CROSS_Z.map((z) => ({ x, z })));

const go = { escort: 8, ambush: false, toGo: 200, turn: 0 };

describe('VIP car speed', () => {
  it('cruises with the escort close, stops for an ambush or when left behind', () => {
    expect(vipSpeed(go)).toBeCloseTo(VIP_CRUISE);
    expect(vipSpeed({ ...go, ambush: true })).toBe(0);
    expect(vipSpeed({ ...go, escort: ESCORT_FAR + 1 })).toBe(0);
    expect(vipSpeed({ ...go, escort: NaN })).toBe(0);
    expect(vipSpeed({ ...go, blocked: true })).toBe(0);
  });

  it('eases off smoothly as the escort falls back', () => {
    let last = Infinity;
    for (let d = ESCORT_NEAR; d <= ESCORT_FAR; d += 2) {
      const v = vipSpeed({ ...go, escort: d });
      expect(v).toBeLessThanOrEqual(last + 1e-9);
      last = v;
    }
    expect(vipSpeed({ ...go, escort: (ESCORT_NEAR + ESCORT_FAR) / 2 })).toBeCloseTo(VIP_CRUISE / 2);
  });

  it('brakes for corners and rolls to a stop at the destination', () => {
    expect(vipSpeed({ ...go, turn: 1.5 })).toBeCloseTo(VIP_CRUISE / 2);
    expect(vipSpeed({ ...go, toGo: 0 })).toBeLessThan(2);
    expect(vipSpeed({ ...go, toGo: 10 })).toBeLessThan(vipSpeed({ ...go, toGo: 30 }));
  });
});

describe('ambush plan', () => {
  const rolls = [0.1, 0.9, 0.2, 0.8, 0.1, 0.1, 0.6, 0.4, 0.5, 0.3];
  it('one ambush as a rookie, two from sergeant, in route order', () => {
    expect(ambushPlan(1, rolls)).toHaveLength(1);
    expect(ambushPlan(2, rolls)).toHaveLength(1);
    for (const L of [3, 4, 5, 6]) {
      const p = ambushPlan(L, rolls);
      expect(p).toHaveLength(2);
      expect(p[0]!.at).toBeLessThan(p[1]!.at);
    }
    for (const L of [1, 2, 3, 4, 5, 6])
      for (const a of ambushPlan(L, rolls)) {
        expect(a.at).toBeGreaterThanOrEqual(0.15);
        expect(a.at).toBeLessThanOrEqual(0.85);
      }
  });

  it('grows with rank but stays small, first ambush is all gunmen', () => {
    expect(ambushCount(ambushPlan(1, rolls))).toBe(2);
    expect(ambushCount(ambushPlan(2, rolls))).toBe(3);
    expect(ambushCount(ambushPlan(6, rolls))).toBe(7);
    for (const L of [1, 3, 6]) {
      const p = ambushPlan(L, rolls);
      expect(p[0]!.roles.every((r) => r === 'fight')).toBe(true);
      for (const a of p) expect(a.roles.length).toBeLessThanOrEqual(4);
    }
    // a low roll in a later ambush mixes in a runner, never as its first member
    const p = ambushPlan(3, [0.1]);
    expect(p[1]!.roles[0]).toBe('fight');
    expect(p[1]!.roles).toContain('flee');
  });
});

describe('route geometry', () => {
  const L = [
    { x: 0, z: 0 },
    { x: 0, z: 50 },
    { x: 60, z: 50 }
  ];
  it('measures and walks the polyline', () => {
    expect(routeLength(L)).toBe(110);
    expect(pointAlong(L, 20)).toMatchObject({ x: 0, z: 20, ns: true });
    expect(pointAlong(L, 80)).toMatchObject({ x: 30, z: 50, ns: false });
    expect(pointAlong(L, 999)).toMatchObject({ x: 60, z: 50 });
    expect(pointAlong(L, -5)).toMatchObject({ x: 0, z: 0 });
    expect(pointAlong([], 3)).toMatchObject({ x: 0, z: 0 });
  });

  it('springs ambushes on an avenue leg, away from the crossing and ahead of the car', () => {
    const long = [
      { x: 0, z: 0 },
      { x: 0, z: 95 },
      { x: 60, z: 95 },
      { x: 60, z: 190 }
    ];
    const a = ambushSpot(long, 10);
    expect(a.ns).toBe(true);
    expect(a.z).toBeGreaterThanOrEqual(10 + AMBUSH_AHEAD - 1e-6);
    expect(a.edge).toBeGreaterThan(12);
    // from inside the corner leg it skips the cross street and lands on the next avenue
    const b = ambushSpot(long, 80);
    expect(b.ns).toBe(true);
    expect(b.x).toBe(60);
  });

  it('never lands past the destination', () => {
    const s = ambushSpot(
      [
        { x: 0, z: 0 },
        { x: 0, z: 40 }
      ],
      30
    );
    expect(s.z).toBeLessThanOrEqual(40);
  });
});

describe('VIP fire and damage', () => {
  it('only shoots what is in range and favours the nearer target', () => {
    expect(shootsVip(10, SHOT_R + 1, 0)).toBe(false);
    expect(shootsVip(SHOT_R + 5, 10, 0.99)).toBe(true);
    expect(shootsVip(20, 10, 0.5)).toBe(true);
    expect(shootsVip(20, 10, 0.7)).toBe(false);
    expect(shootsVip(10, 20, 0.2)).toBe(true);
    expect(shootsVip(10, 20, 0.4)).toBe(false);
  });

  it('harder at rank, crash damage only above a light bump', () => {
    expect(vipShotDamage(1)).toBe(7);
    expect(vipShotDamage(9)).toBe(12);
    expect(vipCrashDamage(-1)).toBe(0);
    expect(vipCrashDamage(2)).toBe(0);
    expect(vipCrashDamage(8)).toBe(10);
    expect(vipCrashDamage(50)).toBe(20);
  });
});

describe('VIP escort call', () => {
  it('picks a destination 110–220 m away by road, inside a block', () => {
    for (const roll of [0, 0.3, 0.6, 0.99]) {
      const d = vipDestination({ x: 0, z: 0 }, NODES, roll);
      const n = Math.abs(d.x) + Math.abs(d.z);
      expect(n).toBeGreaterThanOrEqual(110 - 14);
      expect(n).toBeLessThanOrEqual(220 + 14);
      expect(AVENUES_X).toContain(d.x);
      expect(d.z).toBeGreaterThan(-96);
      expect(d.z).toBeLessThan(236);
      expect(CROSS_Z.every((z) => Math.abs(z - d.z) >= 14)).toBe(true);
    }
  });

  it('pays more than a raid of the same size and allows time for the drive', () => {
    expect(callReward('vip', 3, 6)).toBeGreaterThan(callReward('raid', 3, 6));
    expect(callLimit('vip', 2)).toBeGreaterThanOrEqual(240);
  });
});
