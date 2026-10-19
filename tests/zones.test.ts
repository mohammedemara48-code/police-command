import { describe, it, expect } from 'vitest';
import { ALL_ZONES, ZONES, inZone, sanitizeZone, tripBoard, zoneOfStop } from '../src/game/logic/zones';
import {
  STOPS,
  emptyQueues,
  newJob,
  newWaiting,
  nextTarget,
  restock,
  spotOf,
  type Waiting
} from '../src/game/logic/taxi';

const W = (id: number, stop: string, to: string, size = 1): Waiting => ({ id, stop, to, persona: 'calm', size });

describe('zones', () => {
  it('every rank belongs to exactly one zone', () => {
    for (const s of STOPS)
      expect(
        ZONES.filter((z) => z.stops.includes(s.id)),
        s.id
      ).toHaveLength(1);
    for (const z of ZONES) for (const id of z.stops) expect(STOPS.some((s) => s.id === id)).toBe(true);
  });
  it('names the areas the driver asked for', () => {
    const names = ZONES.map((z) => z.name);
    for (const n of ['الهرم', 'الجيزة', 'الدقي والمهندسين', 'وسط البلد', 'الزمالك', 'شبرا', 'إمبابة', 'رمسيس'])
      expect(names).toContain(n);
    expect(zoneOfStop('mohandessin')!.name).toBe('الدقي والمهندسين');
  });
  it('"all" lets every rank through; a zone only its own', () => {
    expect(inZone(ALL_ZONES, 'haram')).toBe(true);
    expect(inZone('haram', 'faisal')).toBe(true);
    expect(inZone('haram', 'dokki')).toBe(false);
    expect(sanitizeZone('nope')).toBe(ALL_ZONES);
    expect(sanitizeZone('shubra')).toBe('shubra');
    expect(sanitizeZone(5)).toBe(ALL_ZONES);
  });
});

describe('the trip board', () => {
  const car = spotOf('dokki')!;
  it('lists fares in the chosen zone with from, to, km and price, nearest pickup first', () => {
    const q = emptyQueues();
    q.dokki = [W(1, 'dokki', 'haram')];
    q.mohandessin = [W(2, 'mohandessin', 'ramses')];
    q.ramses = [W(3, 'ramses', 'dokki')];
    const job = newJob('microbus');
    const all = tripBoard(q, job, ALL_ZONES, car);
    expect(all.map((o) => o.id)).toEqual([1, 2, 3]);
    const dz = tripBoard(q, job, 'dokki', car);
    expect(dz.map((o) => o.id)).toEqual([1, 2]);
    expect(dz[0]!.from).toBe('dokki');
    expect(dz[0]!.to).toBe('haram');
    expect(dz[0]!.km).toBeGreaterThan(1);
    expect(dz[0]!.fare).toBeGreaterThanOrEqual(4);
    expect(tripBoard(q, job, 'shubra', car)).toEqual([]);
  });
  it('leaves out parties that do not fit the seats left, and prices a microbus per seat', () => {
    const q = emptyQueues();
    q.dokki = [W(1, 'dokki', 'haram', 2)];
    const one = tripBoard(q, newJob('microbus'), 'dokki', car)[0]!;
    q.dokki = [W(2, 'dokki', 'haram', 1)];
    const single = tripBoard(q, newJob('microbus'), 'dokki', car)[0]!;
    expect(one.fare).toBeCloseTo(single.fare * 2, 5);
    const job = newJob('tuktuk');
    q.dokki = [W(3, 'dokki', 'haram', 2)];
    expect(tripBoard(q, job, 'dokki', car)).toHaveLength(1);
    job.riders.push({ size: 1 } as never);
    expect(tripBoard(q, job, 'dokki', car)).toHaveLength(0);
  });
});

describe('choosing the next rank', () => {
  const car = spotOf('dokki')!;
  it('goes to the nearest rank in the zone, not the nearest overall', () => {
    const q = emptyQueues();
    q.mohandessin = [W(1, 'mohandessin', 'ramses')];
    q.shubra = [W(2, 'shubra', 'dokki')];
    const job = newJob('tuktuk');
    expect(nextTarget(job, q, car)!.stop).toBe('mohandessin');
    expect(nextTarget(job, q, car, { allow: (s) => inZone('shubra', s) })!.stop).toBe('shubra');
    expect(nextTarget(job, q, car, { allow: (s) => inZone('haram', s) })).toBeNull();
  });
  it('an accepted fare is the target even when another rank is nearer', () => {
    const q = emptyQueues();
    q.mohandessin = [W(1, 'mohandessin', 'ramses')];
    q.shubra = [W(2, 'shubra', 'dokki')];
    expect(nextTarget(newJob('tuktuk'), q, car, { accepted: 2 })).toEqual({ stop: 'shubra', kind: 'pickup' });
  });
  it('a rider on board always comes first', () => {
    const q = emptyQueues();
    q.mohandessin = [W(1, 'mohandessin', 'ramses')];
    const job = newJob('microbus');
    job.riders.push({ size: 1, to: 'haram' } as never);
    expect(nextTarget(job, q, car, { accepted: 1 })).toEqual({ stop: 'haram', kind: 'drop' });
  });
  it('new passengers turn up mostly in the chosen zone', () => {
    let seed = 7;
    const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const q = emptyQueues();
    let inside = 0;
    const clock = { t: 0 };
    for (let i = 0; i < 200; i++) {
      for (const s of STOPS) q[s.id] = [];
      const w = restock(q, 'tuktuk', clock, 100, rng, (s) => inZone('shubra', s))!;
      if (inZone('shubra', w.stop)) inside++;
    }
    expect(inside).toBeGreaterThan(130);
    expect(newWaiting('dokki', 'tuktuk', rng).stop).toBe('dokki');
  });
});
