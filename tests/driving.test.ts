import { describe, it, expect } from 'vitest';
import { smoothSteer, camRig, topSpeed, smokeLevel, stepCar, type CamRig } from '../src/game/logic/driving';
import { overlap, bounce, pitSpin, spinRate, SPIN_T, type Contact } from '../src/game/logic/crash';
import { fleeSpeed } from '../src/game/logic/chase';

describe('steering and camera', () => {
  it('steering eases in, slower at speed, and snaps back faster', () => {
    const slow = smoothSteer(0, 1, 2, 0.05);
    const fast = smoothSteer(0, 1, 25, 0.05);
    expect(slow).toBeGreaterThan(fast);
    expect(fast).toBeGreaterThan(0);
    expect(smoothSteer(0.9, 1, 0, 0.05)).toBe(1);
    // letting go recovers quicker than turning in at speed
    expect(0.6 - smoothSteer(0.6, 0, 25, 0.05)).toBeGreaterThan(fast);
    expect(smoothSteer(0.02, 0, 25, 0.05)).toBe(0);
  });
  it('camera trails and looks ahead more at speed', () => {
    const r: CamRig = { lag: 0, ahead: 0, fov: 0 };
    const parked = { ...camRig(0, 20, false, r) };
    const flat = { ...camRig(20, 20, false, r) };
    expect(flat.lag).toBeGreaterThan(parked.lag);
    expect(flat.ahead).toBeGreaterThan(parked.ahead);
    expect(flat.fov).toBeGreaterThan(0);
  });
  it('reduced motion: rigid camera, no zoom', () => {
    const r = camRig(20, 20, true, { lag: 1, ahead: 0, fov: 5 });
    expect(r.lag).toBe(0);
    expect(r.fov).toBe(0);
    expect(1 - Math.pow(r.lag, 1 / 60)).toBe(1);
  });
});

describe('damage', () => {
  it('slows the car but never stops it', () => {
    expect(topSpeed(20, 0)).toBe(20);
    expect(topSpeed(20, 100)).toBeCloseTo(12);
    expect(topSpeed(20, 500)).toBeCloseTo(12);
    let s = { speed: 0, yaw: 0, velYaw: 0 };
    for (let k = 0; k < 200; k++)
      s = stepCar(s, { throttle: 1, steer: 0, handbrake: false, max: 20, damage: 100 }, 0.05);
    expect(s.speed).toBeGreaterThan(10);
  });
  it('a wrecked patrol car can still catch the suspect', () => {
    for (const rankCar of [0, 2, 4]) {
      const mine = topSpeed(20 + rankCar, 100);
      const theirs = fleeSpeed({ t: 120, k: 1.2, playerMax: topSpeed(18 + rankCar, 100), dist: 10, turn: 0 });
      expect(theirs).toBeLessThan(mine);
    }
  });
  it('smoke only shows when the car is badly hurt', () => {
    expect(smokeLevel(30)).toBe(0);
    expect(smokeLevel(70)).toBeGreaterThan(0);
    expect(smokeLevel(100)).toBe(1);
  });
});

describe('car contact', () => {
  const c: Contact = { nx: 0, nz: 0, depth: 0 };
  const box = (x: number, z: number, yaw = 0) => ({ x, z, yaw, hw: 1, hl: 2.3 });
  it('detects overlap and pushes along the shortest axis', () => {
    expect(overlap(box(0, 0), box(0, 4), c)).toBe(true);
    expect(c.nz).toBeCloseTo(-1);
    expect(c.depth).toBeCloseTo(0.6);
    expect(overlap(box(1.5, 0), box(0, 0), c)).toBe(true);
    expect(c.nx).toBeCloseTo(1);
    expect(c.depth).toBeCloseTo(0.5);
  });
  it('no contact when apart, including rotated boxes', () => {
    expect(overlap(box(0, 0), box(0, 5), c)).toBe(false);
    expect(overlap(box(0, 0), box(3.4, 0, Math.PI / 2), c)).toBe(false);
    expect(overlap(box(0, 0), box(3.2, 0, Math.PI / 2), c)).toBe(true);
  });
  it('head-on into a wall stops, glancing hits slide on', () => {
    const m = { speed: 15, velYaw: 0 };
    const closing = bounce(m, 0, { nx: 0, nz: -1, depth: 0.1 }, 0, 0, 1, 0);
    expect(closing).toBeCloseTo(15);
    expect(m.speed).toBeCloseTo(0);
    const g = { speed: 15, velYaw: 0.3 };
    bounce(g, 0.3, { nx: -1, nz: 0, depth: 0.1 }, 0, 0, 1, 0);
    expect(g.speed).toBeGreaterThan(13);
    expect(Math.abs(g.velYaw)).toBeLessThan(0.05);
  });
  it('ignores contacts that are already separating', () => {
    const m = { speed: 10, velYaw: 0 };
    expect(bounce(m, 0, { nx: 0, nz: 1, depth: 0.1 }, 0, 0, 1)).toBe(0);
    expect(m.speed).toBe(10);
  });
  it('rear-ending a slower car only costs the closing speed', () => {
    const m = { speed: 14, velYaw: 0 };
    const closing = bounce(m, 0, { nx: 0, nz: -1, depth: 0.1 }, 0, 5, 0.5, 0);
    expect(closing).toBeCloseTo(9);
    expect(m.speed).toBeCloseTo(9.5);
  });
});

describe('PIT manoeuvre', () => {
  const base = { pVelYaw: 0, pSpeed: 14, sx: 0, sz: 0, sYaw: 0, sSpeed: 12, sHl: 2.3 };
  it('rear quarter hit while alongside spins the car', () => {
    expect(pitSpin({ ...base, px: 1.6, pz: -2.5 })).toBe(1);
    expect(pitSpin({ ...base, px: -1.6, pz: -2.5 })).toBe(-1);
  });
  it('straight rear-ending, front hits, slow taps and T-bones do not count', () => {
    expect(pitSpin({ ...base, px: 0, pz: -4.5 })).toBe(0);
    expect(pitSpin({ ...base, px: 1.8, pz: 1.5 })).toBe(0);
    expect(pitSpin({ ...base, px: 1.6, pz: -2.5, pSpeed: 4 })).toBe(0);
    expect(pitSpin({ ...base, px: 1.6, pz: -2.5, pVelYaw: Math.PI / 2 })).toBe(0);
  });
  it('works for any heading', () => {
    const yaw = 2.2;
    const c = Math.cos(yaw),
      s = Math.sin(yaw);
    // local (1.6, -2.5) to world: x = lx*c + lz*s, z = -lx*s + lz*c
    const px = 1.6 * c - 2.5 * s,
      pz = -1.6 * s - 2.5 * c;
    expect(pitSpin({ ...base, sYaw: yaw, pVelYaw: yaw, px, pz })).toBe(1);
  });
  it('spin dies away', () => {
    expect(spinRate(SPIN_T)).toBeGreaterThan(spinRate(SPIN_T / 2));
    expect(spinRate(0)).toBe(0);
  });
});
