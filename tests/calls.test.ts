import { describe, it, expect } from 'vitest';
import {
  duiWeave,
  stepPullDui,
  duiDriver,
  DUI_WEAVE_AMP,
  DUI_PULL_RATE,
  stepTrap,
  trapCount,
  radarKmh,
  TRAP_LIMIT_KMH,
  TRAP_R,
  TRAP_WAIT,
  raidPlan,
  waveText,
  callReward,
  callLimit,
  patrolAnchor
} from '../src/game/logic/calls';
import { stepPull, PULL_T, PULL_R } from '../src/game/logic/missions';

const on = { siren: true, inCar: true, dist: 10 };

describe('DUI stop', () => {
  it('weave stays inside the amplitude and actually swerves', () => {
    let lo = 0,
      hi = 0;
    for (let t = 0; t < 20; t += 0.05) {
      const w = duiWeave(t);
      expect(Math.abs(w)).toBeLessThanOrEqual(DUI_WEAVE_AMP + 1e-9);
      lo = Math.min(lo, w);
      hi = Math.max(hi, w);
    }
    expect(hi - lo).toBeGreaterThan(DUI_WEAVE_AMP);
  });

  it('weave is smooth (no lane jumps between frames)', () => {
    for (let t = 0; t < 10; t += 1 / 60) expect(Math.abs(duiWeave(t + 1 / 60) - duiWeave(t))).toBeLessThan(0.05);
  });

  it('drunk driver needs longer on the siren than a speeder', () => {
    let a = 0,
      b = 0,
      ta = 0,
      tb = 0;
    while (a < PULL_T) {
      a = stepPull(a, on, 0.1);
      ta += 0.1;
    }
    while (b < PULL_T) {
      b = stepPullDui(b, on, 0.1);
      tb += 0.1;
    }
    expect(tb).toBeGreaterThan(ta * 1.5);
    expect(tb).toBeCloseTo(PULL_T / DUI_PULL_RATE, 0);
  });

  it('meter drains without the siren, out of the car or out of range', () => {
    expect(stepPullDui(2, { ...on, siren: false }, 0.5)).toBeCloseTo(1.5);
    expect(stepPullDui(2, { ...on, inCar: false }, 0.5)).toBeCloseTo(1.5);
    expect(stepPullDui(2, { ...on, dist: PULL_R + 1 }, 0.5)).toBeCloseTo(1.5);
    expect(stepPullDui(0.2, { ...on, siren: false }, 1)).toBe(0);
  });

  it('driver flees more often at higher rank, never more than half the time', () => {
    expect(duiDriver(1, 0.2)).toBe('surrender');
    expect(duiDriver(1, 0.1)).toBe('flee');
    expect(duiDriver(6, 0.45)).toBe('flee');
    expect(duiDriver(6, 0.5)).toBe('surrender');
    expect(duiDriver(99, 0.49)).toBe('flee');
  });
});

describe('speed trap', () => {
  it('radar timer only runs while parked in the zone', () => {
    const parked = { inCar: true, speed: 0.2, dist: 3 };
    let t = 0;
    for (let i = 0; i < 30; i++) t = stepTrap(t, parked, 0.1);
    expect(t).toBeGreaterThanOrEqual(TRAP_WAIT);
    expect(stepTrap(t, { ...parked, speed: 5 }, 0.1)).toBe(0);
    expect(stepTrap(t, { ...parked, inCar: false }, 0.1)).toBe(0);
    expect(stepTrap(t, { ...parked, dist: TRAP_R + 0.1 }, 0.1)).toBe(0);
    expect(stepTrap(t, { ...parked, speed: -0.5 }, 0.1)).toBeGreaterThan(t);
  });

  it('more speeders to catch with rank', () => {
    expect(trapCount(1)).toBe(1);
    expect(trapCount(2)).toBe(1);
    expect(trapCount(3)).toBe(2);
    expect(trapCount(5)).toBe(3);
    expect(trapCount(0)).toBe(1);
  });

  it('radar always reads well over the limit and rises with rank', () => {
    for (const r of [0, 0.5, 1, 7, -3]) expect(radarKmh(1, r)).toBeGreaterThan(TRAP_LIMIT_KMH + 20);
    expect(radarKmh(6, 0.5)).toBeGreaterThan(radarKmh(1, 0.5));
    expect(radarKmh(6, 2)).toBe(radarKmh(6, 1));
  });
});

describe('drug-house raid', () => {
  const rolls = [0.1, 0.3, 0.9, 0.2, 0.4, 0.6, 0.05, 0.35, 0.8];

  it('2 waves for a rookie, 3 from sergeant', () => {
    expect(raidPlan(1, rolls)).toHaveLength(2);
    expect(raidPlan(3, rolls)).toHaveLength(3);
    expect(raidPlan(6, rolls)).toHaveLength(3);
  });

  it('first wave is all gunmen and every wave leads with one', () => {
    for (const lvl of [1, 2, 3, 6]) {
      const p = raidPlan(lvl, rolls);
      expect(p[0]!.roles.every((r) => r === 'fight')).toBe(true);
      for (const w of p) expect(w.roles[0]).toBe('fight');
    }
  });

  it('waves are 2–3 people and never more than 8 in total', () => {
    for (let lvl = 1; lvl <= 6; lvl++) {
      const p = raidPlan(lvl, rolls);
      for (const w of p) {
        expect(w.roles.length).toBeGreaterThanOrEqual(2);
        expect(w.roles.length).toBeLessThanOrEqual(3);
      }
      expect(p.reduce((a, w) => a + w.roles.length, 0)).toBeLessThanOrEqual(8);
    }
    expect(raidPlan(1, rolls).at(-1)!.roles).toHaveLength(2);
    expect(raidPlan(2, rolls).at(-1)!.roles).toHaveLength(3);
  });

  it('later waves can mix in a runner and a surrender', () => {
    const p = raidPlan(3, [0.1, 0.1, 0.1, 0.9, 0.1, 0.3, 0.9, 0.1, 0.3]);
    expect(p[1]!.roles).toEqual(['fight', 'flee', 'surrender'].slice(0, p[1]!.roles.length));
    expect(raidPlan(3, []).length).toBe(3);
  });

  it('wave banner calls out the last wave', () => {
    expect(waveText(0, 3)).toContain('1/3');
    expect(waveText(2, 3)).toContain('الأخيرة');
  });
});

describe('call pay and time', () => {
  it('keeps the classic call formula unchanged', () => {
    expect(callReward('robbery', 1, 3)).toBe(1200 + 400 + 900);
    expect(callReward('gang', 4, 5)).toBe(1200 + 1600 + 1500);
    expect(callLimit('robbery', 3)).toBe(195);
  });

  it('new calls pay more with rank and with risk', () => {
    for (const k of ['dui', 'trap', 'raid'] as const) expect(callReward(k, 5, 2)).toBeGreaterThan(callReward(k, 1, 2));
    expect(callReward('raid', 3, 7)).toBeGreaterThan(callReward('gang', 3, 7));
    expect(callReward('dui', 1, 1)).toBeGreaterThan(callReward('speeder', 1, 0));
    expect(callReward('trap', 3, 2)).toBeGreaterThan(callReward('trap', 3, 1));
    expect(callReward('raid', 2, 5) % 10).toBe(0);
  });

  it('more speeders or suspects means more time', () => {
    expect(callLimit('trap', 3)).toBeGreaterThan(callLimit('trap', 1));
    expect(callLimit('raid', 8)).toBeGreaterThan(callLimit('raid', 4));
    expect(callLimit('dui', 1)).toBeGreaterThanOrEqual(150);
  });
});

describe('patrol anchor', () => {
  it('keeps the loop on the officer position, on the nearest avenue', () => {
    const avenues = [-120, -60, 0, 60, 120];
    expect(patrolAnchor(5, -70, avenues)).toEqual({ x: 0, z: -70 });
    expect(patrolAnchor(-80, 120, avenues)).toEqual({ x: -60, z: 120 });
  });
});
