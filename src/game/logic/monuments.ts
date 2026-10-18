/** Landmarks that stand in the street plan (pure): the Qasr El Nil lions at the bridgeheads and the Cairo Tower on Gezira. */
import { toWorld } from './cairo';
import { inRiver, net } from './roadnet';
import type { OBB } from './collide';

export interface Lion {
  x: number;
  z: number;
  /** three.js rotation.y of the lion: facing the traffic that approaches the bridge */
  yaw: number;
}

export const TOWER_AT = toWorld([31.2244, 30.0458]);
/** The tower's plaza: kept clear of buildings. */
export const TOWER_BOX: OBB = { x: TOWER_AT.x, z: TOWER_AT.z, yaw: 0, hw: 17, hl: 17 };

let cache: Lion[] | null = null;
/** Four lions: two at each end of Qasr El Nil Bridge, either side of the road (as on the real bridgeheads). */
export function lions(): Lion[] {
  if (cache) return cache;
  const N = net();
  const edges = N.edges.filter((e) => e.sid === 'qasr-nile-bridge');
  const out: Lion[] = [];
  if (!edges.length) return (cache = out);
  // the two ends of the street: the endpoints farthest apart
  const ends = edges.flatMap((e) => [e.pts[0]!, e.pts[e.pts.length - 1]!]);
  let a = ends[0]!,
    b = ends[1] ?? ends[0]!,
    bd = -1;
  for (const p of ends)
    for (const q of ends) {
      const d = Math.hypot(p.x - q.x, p.z - q.z);
      if (d > bd) {
        bd = d;
        a = p;
        b = q;
      }
    }
  for (const [p, q] of [
    [a, b],
    [b, a]
  ] as const) {
    const n = N.nearest(p.x, p.z, 20);
    if (!n) continue;
    // heading from the end of the bridge towards the other end
    const yawIn = Math.atan2(q.x - p.x, q.z - p.z);
    const fx = Math.sin(yawIn),
      fz = Math.cos(yawIn);
    const side = n.e.half + 2.7;
    // for each side, the first spot at the bridgehead where the pedestal stands clear of other streets and the water
    for (const sgn of [-1, 1]) {
      for (const along of [6, 10, 14, 19, -6, -10, -14, -19, -26]) {
        const l: Lion = {
          x: p.x + fx * along + Math.cos(yawIn) * side * sgn,
          z: p.z + fz * along - Math.sin(yawIn) * side * sgn,
          yaw: yawIn + Math.PI
        };
        const c = Math.cos(l.yaw),
          sn = Math.sin(l.yaw);
        const clear = [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1]
        ].every(([a2, b2]) => {
          const x = l.x + a2! * 1.8 * c + b2! * 2.1 * sn,
            z = l.z - a2! * 1.8 * sn + b2! * 2.1 * c;
          return !N.onRoad(x, z, 0.3) && !inRiver(x, z, 0.3);
        });
        if (clear) {
          out.push(l);
          break;
        }
      }
    }
  }
  return (cache = out);
}

export const lionBox = (l: Lion): OBB => ({ x: l.x, z: l.z, yaw: l.yaw, hw: 1.8, hl: 2.1 });
