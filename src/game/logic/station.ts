/** Police station hub: where it is and what it offers (pure, unit-tested). */
import { PAVEMENT, toWorld } from './cairo';
import { inRiver, net } from './roadnet';
import type { OBB } from './collide';

/** The precinct stands on Qasr El Aini Street, a short walk from Tahrir Square, facing the street. */
function site() {
  const N = net();
  const anchor = toWorld([31.2349, 30.0431]);
  let best = { d: Infinity, e: N.edges[0]! };
  for (const e of N.edges) {
    if (e.ring || e.bridge || e.len < 70 || e.cls === 'local') continue;
    const m = N.at(e, e.len / 2);
    const d = Math.hypot(m.x - anchor.x, m.z - anchor.z);
    if (d < best.d) best = { d, e };
  }
  const e = best.e;
  for (const s of [e.len / 2, e.len * 0.35, e.len * 0.65]) {
    const p = N.at(e, s);
    for (const side of [1, -1]) {
      // the street runs along (sin yaw, cos yaw); the right-hand normal is (cos yaw, -sin yaw)
      const nx = Math.cos(p.yaw) * side,
        nz = -Math.sin(p.yaw) * side;
      const off = e.half + PAVEMENT + 0.4 + 4.3;
      const x = p.x + nx * off,
        z = p.z + nz * off;
      if (inRiver(x, z, 3) || N.clearance(x, z, e.id) < 8) continue;
      // local x of the building points away from the street; its front (the sign) is on local -x
      const yaw = p.yaw + (side > 0 ? 0 : Math.PI);
      const door = { x: x - nx * (4.2 + 1.9), z: z - nz * (4.2 + 1.9) };
      const q = N.at(e, Math.min(e.len - 8, s + 11));
      const pk = { x: q.x + nx * 2.3, z: q.z + nz * 2.3, yaw: q.yaw };
      return { x, z, yaw, door, parking: pk, r: 2.2 };
    }
  }
  throw new Error('no site for the police station');
}

export const STATION = site();

/** Footprint of the precinct (a solid, and kept clear by the lot planner). */
export const STATION_BOX: OBB = { x: STATION.x, z: STATION.z, yaw: STATION.yaw, hw: 4.3, hl: 4.1 };

export const nearDoor = (x: number, z: number) => Math.hypot(x - STATION.door.x, z - STATION.door.z) < STATION.r;

/** The hub only opens when it's safe: on foot, not mid-chase, no armed suspects around. */
export function hubAllowed(o: { inCar: boolean; chasing: boolean; hostiles: number; x: number; z: number }) {
  return !o.inCar && !o.chasing && o.hostiles === 0 && nearDoor(o.x, o.z);
}

/** Garage repair is free but takes a moment; returns seconds needed. */
export const repairTime = (damage: number) => Math.round(Math.max(0, Math.min(100, damage)) / 25);
