/**
 * The car against the edges of the road (pure): the step StreetPlay runs every frame after the handling model, and the
 * drive audit runs over the whole network. The car's centre keeps `rp` inside the asphalt and its nose may overhang by
 * `noseRp`; at the edge it slides along the kerb, eases back toward the middle and lines up with the street.
 */
import { alignYaw, kerbCrashes, slideAlong } from './kerb';
import { wrapAngle } from './locomotion';
import { net } from './roadnet';
import { VEHICLES, type VehicleId } from './vehicles';

export interface RoadQuery {
  onRoad(x: number, z: number, pad: number): boolean;
  /** nearest point on a road centre line and the road's heading there */
  mid(x: number, z: number, r: number): { x: number; z: number; yaw: number } | null;
}
export interface CarBody {
  x: number;
  z: number;
  speed: number;
  yaw: number;
  velYaw: number;
}
export interface EdgeHit {
  /** 'free' moved normally, 'slide' slid along an edge, 'wedged' could not move (backed off) */
  kind: 'free' | 'slide' | 'wedged';
  head: number;
  crash: boolean;
  /** speed at the moment of a crash */
  crashV: number;
  /** the wall normal for a hard slide (to bounce/shake), else null */
  wall: { nx: number; nz: number } | null;
  offRoad: boolean;
}

/** How far inside the asphalt the centre must stay (negative = inside) and how far the nose may overhang. */
export function carMargins(vehicle: VehicleId) {
  const rp = vehicle === 'tuktuk' ? 2 : -0.5;
  return { rp, noseRp: vehicle === 'tuktuk' ? rp + 2 : rp + 1.2, bump: VEHICLES[vehicle].hl - 0.15 };
}

export function moveCar(c: CarBody, vehicle: VehicleId, dt: number, Q: RoadQuery): EdgeHit {
  const { rp, noseRp, bump } = carMargins(vehicle);
  const out: EdgeHit = { kind: 'free', head: 0, crash: false, crashV: 0, wall: null, offRoad: false };
  const cmx = Math.sin(c.velYaw) * c.speed * dt,
    cmz = Math.cos(c.velYaw) * c.speed * dt;
  const dir = Math.sign(c.speed) || 1;
  const nx = c.x + cmx + Math.sin(c.yaw) * bump * dir,
    nz = c.z + cmz + Math.cos(c.yaw) * bump * dir;
  if (!Q.onRoad(c.x + cmx, c.z + cmz, rp) || !Q.onRoad(nx, nz, noseRp)) {
    const mid = Q.mid(c.x + cmx, c.z + cmz, 30);
    let moved = false;
    if (mid) {
      const ix = mid.x - (c.x + cmx),
        iz = mid.z - (c.z + cmz);
      const il = Math.hypot(ix, iz) || 1;
      const sl = slideAlong({ x: cmx, z: cmz }, { x: ix / il, z: iz / il }, dt);
      const tx = c.x + sl.move.x,
        tz = c.z + sl.move.z;
      out.head = sl.head;
      if (
        Q.onRoad(tx, tz, rp) &&
        Q.onRoad(tx + Math.sin(c.yaw) * bump * dir, tz + Math.cos(c.yaw) * bump * dir, noseRp)
      ) {
        c.x = tx;
        c.z = tz;
        c.speed *= sl.keep;
        const dy = alignYaw(c.yaw, mid.yaw, sl.head, dt);
        c.yaw = wrapAngle(c.yaw + dy);
        c.velYaw = wrapAngle(c.velYaw + dy);
        if (sl.head > 0.5 && Math.abs(c.speed) > 8) out.wall = { nx: -Math.sign(ix), nz: -Math.sign(iz) };
        out.kind = 'slide';
        moved = true;
      } else if (kerbCrashes(c.speed, sl.head)) {
        out.crash = true;
        out.crashV = Math.abs(c.speed);
      }
    }
    if (!moved) {
      c.speed *= -0.15;
      out.kind = 'wedged';
    }
  } else {
    c.x += cmx;
    c.z += cmz;
  }
  if (!Q.onRoad(c.x, c.z, rp)) {
    // still over the edge: ease back toward the middle of the road (no bounce)
    out.offRoad = true;
    const mid = Q.mid(c.x, c.z, 30);
    if (mid) {
      const k = Math.min(1, dt * 4);
      c.x += (mid.x - c.x) * k * 0.5;
      c.z += (mid.z - c.z) * k * 0.5;
    }
    c.speed *= 1 - Math.min(0.5, dt * 1.5);
  }
  return out;
}

/** The road network as the car sees it. */
export const ROAD_QUERY: RoadQuery = {
  onRoad: (x, z, pad) => net().onRoad(x, z, pad),
  mid: (x, z, r) => {
    const N = net();
    const n = N.nearest(x, z, r);
    return n ? N.at(n.e, n.s) : null;
  }
};
