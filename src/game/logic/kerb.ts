/**
 * Soft road edges. A car that runs into the edge of the asphalt used to lose most of its speed (and sometimes took damage);
 * now the part of the movement that points out of the road is removed, the rest slides along the kerb, the car is eased
 * back toward the road's middle and lines up with the street. Only a real head-on into a wall hurts.
 */
export interface V {
  x: number;
  z: number;
}

export interface Slide {
  /** movement to apply this step */
  move: V;
  /** share of the speed kept (1 = none lost) */
  keep: number;
  /** how head-on the hit was, 0 (grazing) to 1 (straight in) */
  head: number;
}

/**
 * @param move  where the car wanted to go this step
 * @param inward unit vector from the car toward the middle of the road
 * @param dt    step length (s)
 */
export function slideAlong(move: V, inward: V, dt: number): Slide {
  const len = Math.hypot(move.x, move.z);
  if (len < 1e-6) return { move: { x: 0, z: 0 }, keep: 1, head: 0 };
  const out = -(move.x * inward.x + move.z * inward.z); // component pointing out of the road
  if (out <= 0) return { move, keep: 1, head: 0 };
  const head = Math.min(1, out / len);
  // drop the outward part, add a small push back in so the car does not hug the edge
  const push = Math.min(len * 0.25, 0.05 + len * 0.1);
  const m = { x: move.x + inward.x * out + inward.x * push, z: move.z + inward.z * out + inward.z * push };
  // grazing costs almost nothing, a straight hit scrubs speed quickly
  const keep = 1 - Math.min(0.6, dt * (0.25 + 3.2 * head * head));
  return { move: m, keep, head };
}

/** Yaw change (rad) that eases a sliding car into line with the street: the road tangent nearest to the car's heading. */
export function alignYaw(yaw: number, tangentYaw: number, head: number, dt: number): number {
  let d = tangentYaw - yaw;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  // either way along the street is fine
  if (Math.abs(d) > Math.PI / 2) d = Math.atan2(Math.sin(d + Math.PI), Math.cos(d + Math.PI));
  return d * Math.min(1, dt * (1.2 + head * 2.5));
}

/** Only a nearly head-on hit at speed counts as a crash (damage); scraping along an edge never does. */
export function kerbCrashes(speed: number, head: number): boolean {
  return Math.abs(speed) > 9 && head > 0.8;
}
