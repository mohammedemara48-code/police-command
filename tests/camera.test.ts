import { describe, it, expect } from 'vitest';
import {
  CAM_MAX_DIST,
  CAM_MIN_BOOM,
  boomLength,
  clampDistance,
  distanceToBlocked,
  limitPitch,
  MAX_PITCH_DEG,
  wallLift
} from '../src/game/logic/camera';

/** a street along z, 20 m wide */
const street = (x: number) => Math.abs(x) < 10;
const free = (x: number, z: number) => street(x) && z > -50;

describe('distanceToBlocked', () => {
  it('stops at the first wall', () => {
    const d = distanceToBlocked(free, 0, 0, 1, 0, 30);
    expect(d).toBeGreaterThan(9);
    expect(d).toBeLessThan(10.6);
  });
  it('returns the maximum in open space', () => {
    expect(distanceToBlocked(free, 0, 0, 0, 1, 12)).toBe(12);
  });
});

describe('boomLength', () => {
  it('keeps the full boom in the open', () => {
    const r = boomLength(free, 0, 30, 0, 7);
    expect(r.length).toBe(7);
    expect(r.boxed).toBe(false);
  });
  it('is cut short before a wall behind the car', () => {
    // car at z = -46 facing +z: the camera trails towards -z and the wall is at z = -50
    const r = boomLength(free, 0, -46, 0, 7);
    expect(r.length).toBeLessThan(7);
    expect(r.length).toBeGreaterThanOrEqual(CAM_MIN_BOOM);
    expect(free(0, -46 - r.length)).toBe(true);
  });
  it('never goes below the minimum and flags a boxed-in car', () => {
    const r = boomLength(free, 0, -49, 0, 7);
    expect(r.length).toBe(CAM_MIN_BOOM);
    expect(r.boxed).toBe(true);
  });
  it('works sideways too (yaw turned towards the wall)', () => {
    // car at x = 8 facing -x (yaw = -PI/2): the camera trails towards +x, into the facade at x = 10
    const r = boomLength(free, 8, 0, -Math.PI / 2, 7);
    expect(r.length).toBeLessThan(7);
  });
});

describe('wallLift', () => {
  it('is zero when the way ahead is clear and grows as a wall gets close', () => {
    expect(wallLift(15)).toBe(0);
    expect(wallLift(10)).toBe(0);
    expect(wallLift(5)).toBeGreaterThan(wallLift(8));
    expect(wallLift(0)).toBeLessThanOrEqual(2.8);
  });
});

describe('clampDistance', () => {
  it('leaves a close camera alone', () => {
    expect(clampDistance(3, 4, 0, 0)).toEqual({ x: 3, z: 4 });
  });
  it('pulls a far camera back along the line to the target', () => {
    const p = clampDistance(60, 80, 0, 0);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(CAM_MAX_DIST, 6);
    expect(p.x / p.z).toBeCloseTo(60 / 80, 6);
  });
  it('handles a camera exactly on the target', () => {
    expect(clampDistance(2, 2, 2, 2)).toEqual({ x: 2, z: 2 });
  });
});

describe('limitPitch', () => {
  const pitch = (c: { x: number; y: number; z: number }, tx: number, tz: number, lookY: number) =>
    (Math.atan2(c.y - lookY, Math.hypot(c.x - tx, c.z - tz)) * 180) / Math.PI;
  it('leaves a normal chase view alone', () => {
    const c = limitPitch({ x: 0, y: 2.3, z: -5.2 }, 0, 0, 1.3, 4, { x: 0, z: -1 });
    expect(c).toEqual({ x: 0, y: 2.3, z: -5.2 });
  });
  it('pushes a camera that sits right on top of the target out to the floor and lowers it', () => {
    const c = limitPitch({ x: 0.2, y: 8, z: 0 }, 0, 0, 1.3, 4, { x: 0, z: -1 });
    expect(Math.hypot(c.x, c.z)).toBeCloseTo(4, 5);
    expect(pitch(c, 0, 0, 1.3)).toBeLessThanOrEqual(MAX_PITCH_DEG + 1e-6);
  });
  it('uses the fallback bearing when exactly overhead', () => {
    const c = limitPitch({ x: 3, y: 9, z: 3 }, 3, 3, 1.3, 4, { x: 0, z: -1 });
    expect(c.x).toBeCloseTo(3, 5);
    expect(c.z).toBeCloseTo(-1, 5);
  });
  it('caps the pitch of a steep, far camera', () => {
    const c = limitPitch({ x: 0, y: 12, z: -6 }, 0, 0, 1.3, 4, { x: 0, z: -1 });
    expect(pitch(c, 0, 0, 1.3)).toBeLessThanOrEqual(MAX_PITCH_DEG + 1e-6);
  });
});
