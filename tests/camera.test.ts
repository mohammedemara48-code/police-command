import { describe, it, expect } from 'vitest';
import {
  CAM_MAX_DIST,
  CAM_MIN_BOOM,
  boomLength,
  clampDistance,
  distanceToBlocked,
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
