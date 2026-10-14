/** Police station hub: where it is and what it offers (pure, unit-tested). */
export const STATION = { x: 12.4, z: 3, door: { x: 6.2, z: 3 }, parking: { x: -2.6, z: 11 }, r: 2.2 } as const;

export const nearDoor = (x: number, z: number) => Math.hypot(x - STATION.door.x, z - STATION.door.z) < STATION.r;

/** The hub only opens when it's safe: on foot, not mid-chase, no armed suspects around. */
export function hubAllowed(o: { inCar: boolean; chasing: boolean; hostiles: number; x: number; z: number }) {
  return !o.inCar && !o.chasing && o.hostiles === 0 && nearDoor(o.x, o.z);
}

/** Garage repair is free but takes a moment; returns seconds needed. */
export const repairTime = (damage: number) => Math.round(Math.max(0, Math.min(100, damage)) / 25);
