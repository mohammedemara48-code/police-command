import { describe, it, expect } from 'vitest';
import {
  SHIFT_KEEP,
  addBailed,
  addDistance,
  addRepair,
  addTrip,
  emptyShifts,
  finishShift,
  fuelCost,
  hourLabel,
  isNight,
  newShift,
  nightBonusOf,
  pushShift,
  sanitizeShifts,
  fuelCharge
} from '../src/game/logic/shift';
import { WORLD_TO_KM } from '../src/game/logic/taxi';

describe('day and night shifts', () => {
  it('a shift is a night shift when it starts between 20:00 and 05:00', () => {
    expect(isNight(12)).toBe(false);
    expect(isNight(5)).toBe(false);
    expect(isNight(19.9)).toBe(false);
    expect(isNight(20)).toBe(true);
    expect(isNight(23.5)).toBe(true);
    expect(isNight(1)).toBe(true);
    expect(isNight(4.99)).toBe(true);
    expect(newShift('tuktuk', 22).night).toBe(true);
    expect(newShift('microbus', 9).night).toBe(false);
  });
  it('night fares pay 15% more, day fares nothing extra', () => {
    expect(nightBonusOf(20, 23)).toBe(3);
    expect(nightBonusOf(20, 12)).toBe(0);
  });
  it('labels a city hour in Arabic', () => {
    expect(hourLabel(0)).toBe('12:00 ص');
    expect(hourLabel(10.5)).toBe('10:30 ص');
    expect(hourLabel(13.25)).toBe('1:15 م');
    expect(hourLabel(24)).toBe('12:00 ص');
  });
});

describe('adding up a shift', () => {
  it('sums trips, riders, fares, tips, bonus, best trip and rating', () => {
    let s = newShift('microbus', 10, 1000);
    s = addTrip(s, { fare: 10, tip: 2, stars: 5, size: 2 });
    s = addTrip(s, { fare: 25, tip: 0, stars: 3, size: 1 }, 3);
    expect(s.trips).toBe(2);
    expect(s.riders).toBe(3);
    expect(s.fares).toBe(35);
    expect(s.tips).toBe(2);
    expect(s.bonus).toBe(3);
    expect(s.best).toBe(28);
    expect(s.stars / s.rated).toBe(4);
  });
  it('turns world metres into kilometres, fuel and net', () => {
    let s = newShift('tuktuk', 10, 0);
    s = addDistance(s, 2000);
    expect(s.km).toBeCloseTo(2000 * WORLD_TO_KM, 6);
    s = addTrip(s, { fare: 40, tip: 5, stars: 4, size: 1 });
    s = addRepair(s, 8);
    s = addBailed(s);
    const rec = finishShift(s, 11.5, 30 * 60000);
    expect(rec.fuel).toBe(fuelCost('tuktuk', s.km));
    expect(rec.fuel).toBeCloseTo(9, 5); // 10 km at 0.9
    expect(rec.net).toBeCloseTo(40 + 5 - 9 - 8, 5);
    expect(rec.minutes).toBe(30);
    expect(rec.rating).toBe(4);
    expect(rec.bailed).toBe(1);
    expect(fuelCharge(rec)).toBeCloseTo(9, 5);
  });
  it('a bad shift ends below zero net, has no rating, and only the fuel is charged', () => {
    let s = newShift('microbus', 10, 0);
    s = addDistance(s, 4000);
    s = addRepair(s, 50);
    const rec = finishShift(s, 11, 60000);
    expect(rec.net).toBeLessThan(0);
    expect(rec.rating).toBe(0);
    expect(fuelCharge(rec)).toBeGreaterThan(0);
  });
  it('ignores negative distances and repair costs', () => {
    const s = addRepair(addDistance(newShift('tuktuk', 9), -50), -5);
    expect(s.km).toBe(0);
    expect(s.repairs).toBe(0);
  });
});

describe('the shift history', () => {
  const rec = (i: number) =>
    finishShift(addTrip(newShift('tuktuk', 10, i), { fare: i, tip: 0, stars: 5, size: 1 }), 11, i + 1000);
  it('keeps the last 30, newest first', () => {
    let list = emptyShifts().tuktuk;
    for (let i = 1; i <= 40; i++) list = pushShift(list, rec(i));
    expect(list).toHaveLength(SHIFT_KEEP);
    expect(list[0]!.fares).toBe(40);
    expect(list[SHIFT_KEEP - 1]!.fares).toBe(11);
  });
  it('survives a round trip through JSON and drops junk', () => {
    const book = emptyShifts();
    book.microbus = [rec(3), rec(2)];
    const back = sanitizeShifts(JSON.parse(JSON.stringify(book)));
    expect(back.microbus).toEqual(book.microbus);
    expect(back.tuktuk).toEqual([]);
    const bad = sanitizeShifts({
      tuktuk: [null, 5, { at: 'x' }, { at: 5, trips: -3, rating: 99, net: 'a' }],
      microbus: 'no'
    });
    expect(bad.tuktuk).toHaveLength(1);
    expect(bad.tuktuk[0]!.trips).toBe(0);
    expect(bad.tuktuk[0]!.rating).toBe(5);
    expect(bad.tuktuk[0]!.net).toBe(0);
    expect(bad.microbus).toEqual([]);
    expect(sanitizeShifts(null)).toEqual(emptyShifts());
    const many = { tuktuk: Array.from({ length: 80 }, (_, i) => ({ at: i })) };
    expect(sanitizeShifts(many).tuktuk).toHaveLength(SHIFT_KEEP);
  });
});
