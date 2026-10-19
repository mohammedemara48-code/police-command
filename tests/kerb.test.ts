import { describe, it, expect } from 'vitest';
import { slideAlong, alignYaw, kerbCrashes } from '../src/game/logic/kerb';

describe('soft road edges', () => {
  const inward = { x: -1, z: 0 }; // the road lies to the west, the kerb is to the east
  it('lets a car graze the kerb: it keeps going along it and loses almost no speed', () => {
    const s = slideAlong({ x: 0.1, z: 1 }, inward, 1 / 60);
    expect(s.move.z).toBeCloseTo(1, 1);
    expect(s.move.x).toBeLessThanOrEqual(0); // nothing is left pointing out of the road
    expect(s.keep).toBeGreaterThan(0.99);
    expect(s.head).toBeLessThan(0.2);
  });
  it('removes the outward movement of a hit at an angle and eases the car back in', () => {
    const s = slideAlong({ x: 0.7, z: 0.7 }, inward, 1 / 60);
    expect(s.move.x).toBeLessThan(0);
    expect(s.move.z).toBeCloseTo(0.7, 5);
    expect(s.keep).toBeLessThan(1);
    expect(s.keep).toBeGreaterThan(0.9);
  });
  it('scrubs speed on a straight hit, but never to a dead stop in one step', () => {
    const s = slideAlong({ x: 1, z: 0 }, inward, 1 / 60);
    expect(s.head).toBe(1);
    expect(s.keep).toBeLessThan(0.97);
    expect(s.keep).toBeGreaterThan(0.4);
  });
  it('moving away from the kerb is left alone', () => {
    const m = { x: -1, z: 0.2 };
    const s = slideAlong(m, inward, 1 / 60);
    expect(s.move).toEqual(m);
    expect(s.keep).toBe(1);
  });
  it('lines the car up with the street whichever way along it the car points', () => {
    expect(alignYaw(0.3, 0, 0.5, 0.1)).toBeLessThan(0);
    expect(alignYaw(0.3, Math.PI, 0.5, 0.1)).toBeLessThan(0); // the street runs both ways: turn toward the nearer direction
    expect(alignYaw(Math.PI - 0.3, 0, 0.5, 0.1)).toBeGreaterThan(0);
    expect(Math.abs(alignYaw(0, 0, 1, 0.1))).toBe(0);
  });
  it('only a fast head-on hit counts as a crash; scraping never does', () => {
    expect(kerbCrashes(15, 0.95)).toBe(true);
    expect(kerbCrashes(15, 0.3)).toBe(false);
    expect(kerbCrashes(5, 1)).toBe(false);
  });
});
