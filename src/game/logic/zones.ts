/**
 * Areas (مناطق) for taxi work: the driver picks a zone, and the trip board and the "next rank" choice are filtered by it.
 * Pure and unit-tested.
 */
import {
  ROUTE_FACTOR,
  TARIFF,
  WORLD_TO_KM,
  baseFare,
  distBetween,
  seatsFree,
  spotOf,
  type Persona,
  type Queues,
  type TaxiJob,
  type TaxiVehicle
} from './taxi';

export interface Zone {
  id: string;
  name: string;
  stops: readonly string[];
}

export const ZONES: readonly Zone[] = [
  { id: 'haram', name: 'الهرم', stops: ['haram', 'faisal'] },
  { id: 'giza', name: 'الجيزة', stops: ['giza'] },
  { id: 'dokki', name: 'الدقي والمهندسين', stops: ['dokki', 'mohandessin'] },
  { id: 'downtown', name: 'وسط البلد', stops: ['tahrir'] },
  { id: 'zamalek', name: 'الزمالك', stops: ['zamalek'] },
  { id: 'shubra', name: 'شبرا', stops: ['shubra'] },
  { id: 'imbaba', name: 'إمبابة', stops: ['imbaba'] },
  { id: 'ramses', name: 'رمسيس', stops: ['ramses'] }
];

/** 'all' means no filter. */
export type ZoneId = string;
export const ALL_ZONES = 'all';

export const zoneById = (id: ZoneId): Zone | undefined => ZONES.find((z) => z.id === id);
export const zoneOfStop = (stop: string): Zone | undefined => ZONES.find((z) => z.stops.includes(stop));
export const inZone = (zone: ZoneId, stop: string): boolean =>
  zone === ALL_ZONES || !!zoneById(zone)?.stops.includes(stop);
export const sanitizeZone = (z: unknown): ZoneId =>
  typeof z === 'string' && (z === ALL_ZONES || zoneById(z)) ? z : ALL_ZONES;

/** One fare on the trip board. */
export interface Offer {
  /** the waiting party's id */
  id: number;
  from: string;
  to: string;
  size: number;
  persona: Persona;
  /** real km of the trip and the meter fare for the party */
  km: number;
  fare: number;
  /** how far the pickup is from the car (world m) */
  away: number;
}

/** The meter fare for a party before comfort, time and tips (matches boardRider). */
export function offerFare(vehicle: TaxiVehicle, from: string, to: string, size: number): { km: number; fare: number } {
  const km = distBetween(from, to) * WORLD_TO_KM * ROUTE_FACTOR;
  const per = baseFare(vehicle, km);
  return { km, fare: TARIFF[vehicle].perSeat ? per * size : per };
}

/** Every party waiting in the chosen zone that fits the seats left, nearest pickup first. */
export function tripBoard(queues: Queues, job: TaxiJob, zone: ZoneId, car: { x: number; z: number }): Offer[] {
  const out: Offer[] = [];
  const free = seatsFree(job);
  for (const [stop, q] of Object.entries(queues)) {
    if (!inZone(zone, stop)) continue;
    const sp = spotOf(stop);
    if (!sp) continue;
    for (const w of q) {
      if (w.size > free) continue;
      const { km, fare } = offerFare(job.vehicle, w.stop, w.to, w.size);
      out.push({
        id: w.id,
        from: w.stop,
        to: w.to,
        size: w.size,
        persona: w.persona,
        km,
        fare,
        away: Math.hypot(sp.x - car.x, sp.z - car.z)
      });
    }
  }
  return out.sort((a, b) => a.away - b.away || b.fare - a.fare);
}
