/**
 * Shift accounting for taxi and microbus work (pure, unit-tested): a shift (وردية) starts when the driver clocks in at a rank
 * and ends from the HUD or the menu. It adds up trips, riders, distance, fares, tips, fuel and repair costs, and the last
 * 30 shifts of each vehicle are kept.
 */
import { WORLD_TO_KM, type TaxiVehicle } from './taxi';

export const SHIFT_KEEP = 30;
/** Fuel is an accounting charge per real kilometre driven (EGP). */
export const FUEL_PER_KM: Record<TaxiVehicle, number> = { tuktuk: 0.9, microbus: 2.2 };
/** Night fares (20:00 to 05:00) pay this much more. */
export const NIGHT_BONUS = 0.15;

/** Night shift: clock-in between 20:00 and 05:00. */
export const isNight = (hour: number): boolean => {
  const h = ((hour % 24) + 24) % 24;
  return h >= 20 || h < 5;
};

export interface Shift {
  vehicle: TaxiVehicle;
  /** city hour (0-24) and wall-clock time at clock-in */
  startHour: number;
  startedAt: number;
  night: boolean;
  trips: number;
  riders: number;
  fares: number;
  tips: number;
  bonus: number;
  /** real kilometres driven */
  km: number;
  repairs: number;
  /** sum of the star ratings and how many were given */
  stars: number;
  rated: number;
  best: number;
  bailed: number;
}

export function newShift(vehicle: TaxiVehicle, hour: number, now = Date.now()): Shift {
  return {
    vehicle,
    startHour: hour,
    startedAt: now,
    night: isNight(hour),
    trips: 0,
    riders: 0,
    fares: 0,
    tips: 0,
    bonus: 0,
    km: 0,
    repairs: 0,
    stars: 0,
    rated: 0,
    best: 0,
    bailed: 0
  };
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** The extra a night fare pays. */
export const nightBonusOf = (total: number, hour: number): number => (isNight(hour) ? r1(total * NIGHT_BONUS) : 0);

export function addTrip(s: Shift, p: { fare: number; tip: number; stars: number; size: number }, bonus = 0): Shift {
  const total = p.fare + p.tip + bonus;
  return {
    ...s,
    trips: s.trips + 1,
    riders: s.riders + p.size,
    fares: r1(s.fares + p.fare),
    tips: r1(s.tips + p.tip),
    bonus: r1(s.bonus + bonus),
    stars: s.stars + p.stars,
    rated: s.rated + 1,
    best: Math.max(s.best, r1(total))
  };
}

/** Add metres driven (world metres). */
export const addDistance = (s: Shift, metres: number): Shift => ({
  ...s,
  km: s.km + Math.max(0, metres) * WORLD_TO_KM
});
export const addRepair = (s: Shift, cost: number): Shift => ({ ...s, repairs: r1(s.repairs + Math.max(0, cost)) });
export const addBailed = (s: Shift): Shift => ({ ...s, bailed: s.bailed + 1 });

export const fuelCost = (vehicle: TaxiVehicle, km: number): number => r1(Math.max(0, km) * FUEL_PER_KM[vehicle]);

/** What a finished shift is remembered as. */
export interface ShiftRecord {
  at: number;
  night: boolean;
  startHour: number;
  endHour: number;
  /** minutes of play the shift lasted */
  minutes: number;
  trips: number;
  riders: number;
  fares: number;
  tips: number;
  bonus: number;
  km: number;
  fuel: number;
  repairs: number;
  net: number;
  /** average stars, 0 when there were no trips */
  rating: number;
  best: number;
  bailed: number;
}

export function finishShift(s: Shift, endHour: number, now = Date.now()): ShiftRecord {
  const fuel = fuelCost(s.vehicle, s.km);
  const net = r1(s.fares + s.tips + s.bonus - fuel - s.repairs);
  return {
    at: now,
    night: s.night,
    startHour: s.startHour,
    endHour,
    minutes: Math.max(0, Math.round((now - s.startedAt) / 60000)),
    trips: s.trips,
    riders: s.riders,
    fares: s.fares,
    tips: s.tips,
    bonus: s.bonus,
    km: r1(s.km),
    fuel,
    repairs: s.repairs,
    net,
    rating: s.rated ? r1(s.stars / s.rated) : 0,
    best: s.best,
    bailed: s.bailed
  };
}

/** Fares and tips go into the wallet as they are paid; clocking out charges the fuel. */
export const fuelCharge = (rec: ShiftRecord): number => rec.fuel;

export type ShiftBook = Record<TaxiVehicle, ShiftRecord[]>;
export const emptyShifts = (): ShiftBook => ({ tuktuk: [], microbus: [] });

/** Newest first, at most SHIFT_KEEP. */
export function pushShift(list: readonly ShiftRecord[], rec: ShiftRecord): ShiftRecord[] {
  return [rec, ...list].slice(0, SHIFT_KEEP);
}

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
function cleanRecord(raw: unknown): ShiftRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.at !== 'number' || !Number.isFinite(r.at)) return null;
  return {
    at: r.at,
    night: r.night === true,
    startHour: num(r.startHour),
    endHour: num(r.endHour),
    minutes: Math.max(0, Math.floor(num(r.minutes))),
    trips: Math.max(0, Math.floor(num(r.trips))),
    riders: Math.max(0, Math.floor(num(r.riders))),
    fares: Math.max(0, num(r.fares)),
    tips: Math.max(0, num(r.tips)),
    bonus: Math.max(0, num(r.bonus)),
    km: Math.max(0, num(r.km)),
    fuel: Math.max(0, num(r.fuel)),
    repairs: Math.max(0, num(r.repairs)),
    net: num(r.net),
    rating: Math.max(0, Math.min(5, num(r.rating))),
    best: Math.max(0, num(r.best)),
    bailed: Math.max(0, Math.floor(num(r.bailed)))
  };
}

/** Clean up a saved shift book: bad entries are dropped and each list is cut to the last 30. */
export function sanitizeShifts(raw: unknown): ShiftBook {
  const out = emptyShifts();
  if (!raw || typeof raw !== 'object') return out;
  const o = raw as Record<string, unknown>;
  for (const v of ['tuktuk', 'microbus'] as const) {
    const a = o[v];
    if (!Array.isArray(a)) continue;
    out[v] = a
      .map(cleanRecord)
      .filter((x): x is ShiftRecord => !!x)
      .slice(0, SHIFT_KEEP);
  }
  return out;
}

/** "10:30 ص" style label of a city hour. */
export function hourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'ص' : 'م'}`;
}
