/** Where the objective arrow points: a spot on the road route about `ahead` metres further on, so it follows the streets, not a straight line. */
export interface Pt {
  x: number;
  z: number;
}

export function routeAim(route: readonly Pt[], pos: Pt, target: Pt, ahead = 24): Pt {
  if (route.length < 2) return target;
  // a target that is already close wins over any waypoint
  if (Math.hypot(target.x - pos.x, target.z - pos.z) < ahead) return target;
  let bi = 0,
    bd = Infinity;
  for (let i = 0; i < route.length; i++) {
    const d = Math.hypot(route[i]!.x - pos.x, route[i]!.z - pos.z);
    if (d < bd) {
      bd = d;
      bi = i;
    }
  }
  let acc = bd;
  let aim = route[bi]!;
  for (let k = bi; k < route.length - 1 && acc < ahead; k++) {
    aim = route[k + 1]!;
    acc += Math.hypot(route[k + 1]!.x - route[k]!.x, route[k + 1]!.z - route[k]!.z);
  }
  return aim;
}

/** How far it is to drive: to the nearest waypoint, along the rest of the route, then to the target (the straight distance when there is no route). */
export function roadDistance(route: readonly Pt[], pos: Pt, target: Pt): number {
  const straight = Math.hypot(target.x - pos.x, target.z - pos.z);
  if (route.length < 2) return straight;
  let bi = 0,
    bd = Infinity;
  for (let i = 0; i < route.length; i++) {
    const d = Math.hypot(route[i]!.x - pos.x, route[i]!.z - pos.z);
    if (d < bd) {
      bd = d;
      bi = i;
    }
  }
  let acc = bd;
  for (let k = bi; k < route.length - 1; k++)
    acc += Math.hypot(route[k + 1]!.x - route[k]!.x, route[k + 1]!.z - route[k]!.z);
  acc += Math.hypot(target.x - route[route.length - 1]!.x, target.z - route[route.length - 1]!.z);
  // a detour is never shorter than the straight line
  return Math.max(straight, acc);
}
