import { describe, expect, it } from 'vitest';
import { baseTop, VEHICLES, VEHICLE_IDS } from '../src/game/logic/vehicles';
import { ACCEL, camRig, stepCar, steerAuth, STEER_RATE, type CamRig } from '../src/game/logic/driving';
import { fleeSpeed } from '../src/game/logic/chase';

// the speeds before this change, for the +40..60% rule
const OLD_TOP: Record<string, number> = { police: 20, private: 18 * 0.85, microbus: 18 * 0.78, tuktuk: 18 * 0.6 };
const OLD_ACCEL = 10;

describe('speed', () => {
  it('every vehicle is 40-60% faster, with the same order: police fastest, tuk-tuk slowest', () => {
    for (const v of VEHICLE_IDS) {
      const r = baseTop(v, v === 'police') / OLD_TOP[v]!;
      expect(r, v).toBeGreaterThanOrEqual(1.4);
      expect(r, v).toBeLessThanOrEqual(1.6);
    }
    const tops = VEHICLE_IDS.map((v) => [v, baseTop(v)] as const).sort((a, b) => b[1] - a[1]);
    expect(tops[0]![0]).toBe('police');
    expect(tops[tops.length - 1]![0]).toBe('tuktuk');
    expect(ACCEL / OLD_ACCEL).toBeGreaterThanOrEqual(1.4);
    expect(ACCEL / OLD_ACCEL).toBeLessThanOrEqual(1.6);
  });
  it('0-100 km/h comes sooner than before in every vehicle', () => {
    for (const v of VEHICLE_IDS) {
      const h = VEHICLES[v].handling;
      let s = { speed: 0, yaw: 0, velYaw: 0 },
        t = 0;
      const target = Math.min(27.8, baseTop(v) * 0.9);
      while (s.speed < target && t < 30) {
        s = stepCar(s, { throttle: 1, steer: 0, handbrake: false, max: baseTop(v) }, 1 / 60, h);
        t += 1 / 60;
      }
      expect(t, v).toBeLessThan(10);
    }
  });
  it('stays steady on a phone: a full flick at top speed turns no harder than ~1.3 rad/s, and less than at 15 m/s', () => {
    for (const v of VEHICLE_IDS) {
      const top = baseTop(v, true);
      const hi = STEER_RATE * VEHICLES[v].handling.steer * steerAuth(top, top);
      // lateral acceleration a full flick could ask for at top speed stays arcade-sane
      expect(hi * top, v).toBeLessThan(40);
      expect(steerAuth(top, top)).toBeLessThan(steerAuth(15, top));
    }
  });
  it('the camera widens and pulls back with speed, nothing when parked or with reduced motion', () => {
    const r: CamRig = { lag: 0, ahead: 0, fov: 0 };
    const parked = { ...camRig(0, 29, false, r) };
    const fast = { ...camRig(29, 29, false, r) };
    expect(parked.fov).toBe(0);
    expect(parked.pull).toBe(0);
    expect(fast.fov).toBeGreaterThan(12);
    expect(fast.pull).toBeGreaterThan(2);
    const red = camRig(29, 29, true, r);
    expect(red.fov).toBe(0);
    expect(red.pull).toBe(0);
  });
  it('a getaway car is still slower than the faster patrol car', () => {
    const top = baseTop('police', true);
    for (const t of [0, 20, 60])
      expect(fleeSpeed({ t, k: 1.2, playerMax: top * 0.9, dist: 30, turn: 0 })).toBeLessThan(top);
    expect(fleeSpeed({ t: 30, k: 1, playerMax: top, dist: 30, turn: 0 })).toBeGreaterThan(15);
  });
});

import { chaseCamYaw } from '../src/game/logic/driving';
describe('car camera', () => {
  it('lags a touch in a turn, then re-centres behind the car', () => {
    let c = 0;
    c = chaseCamYaw(c, 0.6, 15, 1 / 60);
    expect(c).toBeGreaterThan(0);
    expect(c).toBeLessThan(0.6 * 0.2);
    for (let i = 0; i < 60; i++) c = chaseCamYaw(c, 0.6, 15, 1 / 60);
    expect(Math.abs(c - 0.6)).toBeLessThan(0.01);
  });
  it('reversing keeps it behind the nose: the target is the car heading, which does not flip', () => {
    // the car (heading 0) reverses: the target stays 0 whatever the speed sign, so the view never swings round
    let c = 0.3;
    for (let i = 0; i < 120; i++) c = chaseCamYaw(c, 0, -5, 1 / 60);
    expect(Math.abs(c)).toBeLessThan(0.01);
  });
});
