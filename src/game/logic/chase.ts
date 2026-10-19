/** Chase-mission tuning (pure, unit-tested): fair suspect speed, catch/escape rules, path start. */
export const CATCH_R = 6.5; // m, car-to-car
export const LOCK_T = 1.2; // s you must stay on the bumper to box the car in
export const START_GAP = 32; // m head start
export const ESCAPE_R = 160; // m
export const WARN_R = 90; // m
export const GRACE = 6; // s on foot before the chase clock starts

/**
 * Suspect speed: scripted base (gets a little faster with time) but always beatable:
 * capped below the player's top speed, eases off when far (keeps it alive) and brakes for corners.
 */
export function fleeSpeed(o: { t: number; k: number; playerMax: number; dist: number; turn: number }) {
  // scaled with the patrol car (+45%): a getaway driver that the faster police car still has to work for
  const base = (13.8 + Math.min(5.8, o.t * 0.22)) * o.k;
  let v = Math.min(base, o.playerMax * 0.84);
  if (o.dist > 70)
    v *= 0.8; // rubber band: never just vanish
  else if (o.dist < 14) v = Math.min(v * 1.06, o.playerMax * 0.88); // panic burst when you're on the bumper
  const sharp = Math.min(1, Math.abs(o.turn) / 1.2);
  return v * (1 - 0.45 * sharp);
}

/** Drop waypoints that lie behind the car at the start (stops the U-turn straight through the player). */
export function trimBehind(path: { x: number; z: number }[], x: number, z: number, heading: number) {
  const fx = Math.sin(heading),
    fz = Math.cos(heading);
  while (path.length > 1) {
    const p = path[0]!;
    const dot = (p.x - x) * fx + (p.z - z) * fz;
    if (dot < 2) path.shift();
    else break;
  }
  return path;
}

export type ChaseResult = 'caught' | 'escaped' | 'timeout' | null;
/** "Box-in" meter: fills while you stay close in the car, drains slowly when you drop back. */
export function stepLock(lock: number, dist: number, inCar: boolean, dt: number) {
  return inCar && dist < CATCH_R ? Math.min(LOCK_T, lock + dt) : Math.max(0, lock - dt * 0.5);
}

export function chaseOutcome(o: {
  dist: number;
  inCar: boolean;
  clock: number;
  limit: number;
  lock: number;
}): ChaseResult {
  if (o.inCar && o.lock >= LOCK_T) return 'caught';
  if (o.dist > ESCAPE_R) return 'escaped';
  if (o.clock > o.limit) return 'timeout';
  return null;
}
