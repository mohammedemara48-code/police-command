/** The open city as the game sees it: roads, pavements and walkable ground, all read from the one street network. */
import { DISTRICT_NAMES, type District } from '../logic/districts';
import { WORLD_BOX } from '../logic/cairo';
import { inRiver, net } from '../logic/roadnet';
import { lots } from '../logic/lots';

export { DISTRICT_NAMES, type District };

/** true when (x,z) is on a carriageway (pad = extra margin, e.g. pavements for people). */
export function onRoad(x: number, z: number, pad = 0) {
  return net().onRoad(x, z, pad);
}

/** inside the streamed world and not in the river */
export function inWorld(x: number, z: number) {
  return x > WORLD_BOX.x0 + 2 && x < WORLD_BOX.x1 - 2 && z > WORLD_BOX.z0 + 2 && z < WORLD_BOX.z1 - 2;
}

/** walkable on foot: any ground that is not water, not inside a building and within the world wall */
export function onFoot(x: number, z: number) {
  return inWorld(x, z) && !inRiver(x, z, 0.5) && !lots().blocked(x, z, 0);
}

export const districtAt = (x: number, z: number): District => net().area(x, z).district;
export const areaName = (x: number, z: number) => net().area(x, z).area;

export const findPath = (fx: number, fz: number, tx: number, tz: number) => net().findPath(fx, fz, tx, tz);
export const farNode = (x: number, z: number, rnd = Math.random) => net().farNode(x, z, 160, 520, rnd);
export const nearestNode = (x: number, z: number) => net().nearestNode(x, z);

/** move (p) toward waypoint list w at speed; returns heading or null when the path is finished */
export function followPath(p: { x: number; z: number }, w: { x: number; z: number }[], step: number): number | null {
  while (w.length) {
    const t = w[0]!;
    const dx = t.x - p.x,
      dz = t.z - p.z,
      d = Math.hypot(dx, dz);
    if (d < 1.2) {
      w.shift();
      continue;
    }
    const k = Math.min(1, step / d);
    p.x += dx * k;
    p.z += dz * k;
    return Math.atan2(dx, dz);
  }
  return null;
}
