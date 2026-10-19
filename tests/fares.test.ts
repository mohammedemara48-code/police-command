import { describe, expect, it } from 'vitest';
import {
  addPayout,
  boardRider,
  collectFare,
  dropAt,
  newJob,
  paysOnBoarding,
  STOPS,
  type Waiting
} from '../src/game/logic/taxi';
import { addFare, addTrip, newShift, shiftSoFar, addRepair } from '../src/game/logic/shift';

const w = (persona: Waiting['persona'] = 'calm'): Waiting => ({
  id: 1,
  stop: STOPS[0]!.id,
  to: STOPS[5]!.id,
  persona,
  size: 1
});
const book = { total: 0, tips: 0, trips: 0, riders: 0, best: 0 };

describe('collecting the fare', () => {
  it('the microbus is paid per seat on boarding, the tuk-tuk at the drop', () => {
    expect(paysOnBoarding('microbus')).toBe(true);
    expect(paysOnBoarding('tuktuk')).toBe(false);
  });
  it('a seat paid on boarding is never paid twice; the tip still comes at the drop', () => {
    const job = newJob('microbus');
    const r = boardRider(job, w('generous'))!;
    const fare = collectFare(r);
    expect(fare).toBeGreaterThan(0);
    expect(collectFare(r)).toBe(0);
    r.elapsed = r.expected * 0.5;
    const [p] = dropAt(job, r.to);
    expect(p!.fare).toBe(0);
    expect(p!.prepaid).toBe(fare);
    expect(p!.tip).toBeGreaterThan(0);
    expect(p!.total).toBe(p!.tip);
    // the books see the whole trip
    expect(addPayout(book, p!).total).toBe(fare + p!.tip);
  });
  it('a tuk-tuk ride pays its fare at the drop, nothing before', () => {
    const job = newJob('tuktuk');
    const r = boardRider(job, w())!;
    r.elapsed = r.expected * 0.5;
    const [p] = dropAt(job, r.to);
    expect(p!.prepaid).toBe(0);
    expect(p!.fare).toBeGreaterThan(0);
  });
  it('the shift counter adds boarding fares at once and shows money made, never a stale 0', () => {
    let s = newShift('microbus', 10);
    expect(shiftSoFar(s)).toBe(0);
    s = addFare(s, 6.5);
    expect(shiftSoFar(s)).toBe(6.5);
    s = addTrip(s, { fare: 0, tip: 2, stars: 5, size: 1, prepaid: 6.5 });
    expect(shiftSoFar(s)).toBe(8.5);
    expect(s.best).toBe(8.5);
    expect(s.trips).toBe(1);
    s = addRepair(s, 10);
    expect(shiftSoFar(s)).toBe(-1.5);
  });
});
