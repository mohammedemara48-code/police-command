/** Chase-camera boom rules (pure, unit-tested): how far the camera may sit behind its target before it would end up inside a building. */

export type FreeFn = (x: number, z: number) => boolean;

/** Pavement width the camera may use beside a road: buildings start 3 m from the kerb, keep a margin. */
export const CAM_PAD_CAR = 2.0;
export const CAM_PAD_FOOT = 2.9;
/** Never closer than this behind the target. */
export const CAM_MIN_BOOM = 2.4;
/** Farthest the camera may ever drift from its target, whatever the easing says. */
export const CAM_MAX_DIST = 15;

/** Walk from the target along the unit vector (ux, uz) and return the distance to the first spot that is not free (or `max`). */
export function distanceToBlocked(
  free: FreeFn,
  x: number,
  z: number,
  ux: number,
  uz: number,
  max: number,
  start = 1.2,
  step = 0.4
): number {
  let d = start;
  while (d < max && free(x + ux * d, z + uz * d)) d += step;
  return Math.min(d, max);
}

/** Boom length behind a target facing `yaw`: as long as `back` allows, cut short before the first wall, never below `min`. */
export function boomLength(
  free: FreeFn,
  tx: number,
  tz: number,
  yaw: number,
  back: number,
  min = CAM_MIN_BOOM
): { length: number; boxed: boolean } {
  const ux = -Math.sin(yaw),
    uz = -Math.cos(yaw);
  const clear = distanceToBlocked(free, tx, tz, ux, uz, back);
  const length = Math.max(min, clear >= back ? back : clear - 0.6);
  const boxed = length < 3.2 && !free(tx + ux * length, tz + uz * length);
  return { length, boxed };
}

/** Extra camera height when a wall stands close ahead of a slow car, so the view looks down on the car instead of at the facade. */
export function wallLift(ahead: number, near = 10, per = 0.35, cap = 2.8): number {
  return ahead >= near ? 0 : Math.min(cap, (near - ahead) * per);
}

/** Keep a camera position within `maxDist` of the target (pulls it back along the line). */
export function clampDistance(
  cx: number,
  cz: number,
  tx: number,
  tz: number,
  maxDist = CAM_MAX_DIST
): { x: number; z: number } {
  const dx = cx - tx,
    dz = cz - tz,
    d = Math.hypot(dx, dz);
  if (d <= maxDist || d === 0) return { x: cx, z: cz };
  const k = maxDist / d;
  return { x: tx + dx * k, z: tz + dz * k };
}
