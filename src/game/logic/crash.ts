/** Car-to-car contact (pure, unit-tested): box overlap, bounce, and the PIT manoeuvre. */
import { wrapAngle } from './locomotion';

/** Car footprint: centre, heading (three.js rotation.y, forward = +z), half width and half length. */
export interface CarBox {
  x: number;
  z: number;
  yaw: number;
  hw: number;
  hl: number;
}
/** Separation for `a`: move it by (nx, nz) * depth to stop touching `b`. */
export interface Contact {
  nx: number;
  nz: number;
  depth: number;
}

function radius(b: CarBox, ax: number, az: number) {
  const c = Math.cos(b.yaw),
    s = Math.sin(b.yaw);
  // local x = (cos, -sin), local z = (sin, cos)
  return b.hw * Math.abs(ax * c - az * s) + b.hl * Math.abs(ax * s + az * c);
}

/** Separating-axis test for two boxes on the ground. Writes into `out` (no allocations). */
export function overlap(a: CarBox, b: CarBox, out: Contact): boolean {
  const dx = a.x - b.x,
    dz = a.z - b.z;
  if (dx * dx + dz * dz > (a.hw + a.hl + b.hw + b.hl) ** 2) return false;
  let best = Infinity;
  for (let k = 0; k < 4; k++) {
    const yaw = k < 2 ? a.yaw : b.yaw;
    const c = Math.cos(yaw),
      s = Math.sin(yaw);
    let ax = k % 2 === 0 ? c : s,
      az = k % 2 === 0 ? -s : c;
    const d = dx * ax + dz * az;
    const pen = radius(a, ax, az) + radius(b, ax, az) - Math.abs(d);
    if (pen <= 0) return false;
    if (pen < best) {
      best = pen;
      if (d < 0) {
        ax = -ax;
        az = -az;
      }
      out.nx = ax;
      out.nz = az;
    }
  }
  out.depth = best;
  return true;
}

export interface Motion {
  speed: number;
  velYaw: number;
}
/**
 * Bounce the car's velocity off a contact normal (pointing away from the other car).
 * `share` is how much of the impulse this car takes (1 = the other is a wall, 0.5 = equal cars).
 * Glancing hits keep most of the speed and slide along; head-on hits stop the car.
 * Returns the closing speed (m/s, 0 when the cars were already separating).
 */
export function bounce(m: Motion, yaw: number, n: Contact, ovx: number, ovz: number, share: number, e = 0.2): number {
  const vx = Math.sin(m.velYaw) * m.speed,
    vz = Math.cos(m.velYaw) * m.speed;
  const vn = (vx - ovx) * n.nx + (vz - ovz) * n.nz;
  if (vn >= 0) return 0;
  const j = (1 + e) * vn * share;
  const wx = vx - j * n.nx,
    wz = vz - j * n.nz;
  const len = Math.hypot(wx, wz);
  if (len < 0.05) {
    m.speed = 0;
    m.velYaw = yaw;
  } else if (wx * Math.sin(yaw) + wz * Math.cos(yaw) >= 0) {
    m.speed = len;
    m.velYaw = Math.atan2(wx, wz);
  } else {
    m.speed = -len;
    m.velYaw = Math.atan2(-wx, -wz);
  }
  return -vn;
}

export const PIT_MIN_SPEED = 7; // m/s (~25 km/h)

/**
 * PIT manoeuvre: nudging the rear quarter of a fleeing car while running alongside spins it out.
 * Returns the spin direction (+1 / -1) or 0 when the hit doesn't qualify.
 */
export interface PitInput {
  px: number;
  pz: number;
  pVelYaw: number;
  pSpeed: number;
  sx: number;
  sz: number;
  sYaw: number;
  sSpeed: number;
  sHl: number;
}
export function pitSpin(o: PitInput): -1 | 0 | 1 {
  if (o.pSpeed < PIT_MIN_SPEED || o.pSpeed < o.sSpeed * 0.75) return 0;
  const rel = wrapAngle(o.pVelYaw - o.sYaw);
  if (Math.abs(rel) > 0.9) return 0; // must be going the same way, not T-boning
  const c = Math.cos(o.sYaw),
    s = Math.sin(o.sYaw);
  const dx = o.px - o.sx,
    dz = o.pz - o.sz;
  const lx = dx * c - dz * s,
    lz = dx * s + dz * c;
  // behind the middle of the car, but not just tailgating straight behind it
  if (lz > -0.3 || lz < -(o.sHl + 3)) return 0;
  if (Math.abs(lx) < 0.8) return 0;
  // not peeling away from it
  const vlx = o.pSpeed * Math.sin(rel);
  if (vlx * Math.sign(lx) > 1) return 0;
  return lx > 0 ? 1 : -1;
}

/** Spin-out: yaw rate (rad/s) that dies away over the stun time. */
export const SPIN_T = 2.4;
export const spinRate = (t: number) => (t <= 0 ? 0 : 6 * Math.min(1, t / SPIN_T));
