/** New mission types (pure, unit-tested): traffic stop (siren pull-over) and patrol checkpoints. */
export const PULL_T = 3; // s of siren-on-the-bumper to make the speeder pull over
export const PULL_R = 28; // m
export const TICKET_R = 3.6; // m on foot to the stopped car
export const CHECK_R = 7; // m to pass a checkpoint

/** Pull-over meter: fills while your siren is on and you're close in the car, drains otherwise. */
export function stepPull(m: number, o: { siren: boolean; inCar: boolean; dist: number }, dt: number) {
  return o.siren && o.inCar && o.dist < PULL_R ? Math.min(PULL_T, m + dt) : Math.max(0, m - dt * 0.6);
}

/** Speeder pace: a bit slower than the patrol car so you can always catch up. */
export const speederSpeed = (playerMax: number, turn: number) => playerMax * 0.62 * (1 - 0.4 * Math.min(1, Math.abs(turn) / 1.2));

/** Checkpoint progress: returns the next index after passing (or the same). */
export function passCheckpoint(i: number, pts: { x: number; z: number }[], x: number, z: number, inCar: boolean) {
  const p = pts[i];
  if (!p || !inCar) return i;
  return Math.hypot(p.x - x, p.z - z) < CHECK_R ? i + 1 : i;
}
