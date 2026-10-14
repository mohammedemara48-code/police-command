/** Third-person on-foot locomotion (pure math, unit-tested): camera-relative input, accel/decel, turning. */
export const WALK = 2.6;
export const RUN = 5.4;
export const ACCEL = 16; // m/s²
export const DECEL = 22; // m/s²
export const TURN_RATE = 11; // rad/s

export interface Loco {
  vx: number;
  vz: number;
  yaw: number;
}

export function wrapAngle(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * ix/iy: stick or keys in screen space (x right, y forward), magnitude 0..1.
 * camYaw: camera heading (world). Returns the new velocity and facing.
 */
export function stepLoco(s: Loco, ix: number, iy: number, camYaw: number, run: boolean, dt: number): Loco {
  let m = Math.hypot(ix, iy);
  if (m > 1) {
    ix /= m;
    iy /= m;
    m = 1;
  }
  if (m < 0.12) m = 0; // dead zone
  // world direction: forward = camera heading, right = heading - 90°
  const fx = Math.sin(camYaw),
    fz = Math.cos(camYaw);
  const rx = -Math.cos(camYaw),
    rz = Math.sin(camYaw);
  const dx = m ? (fx * iy + rx * ix) / Math.hypot(ix, iy) : 0;
  const dz = m ? (fz * iy + rz * ix) / Math.hypot(ix, iy) : 0;
  const top = run || m > 0.92 ? RUN : WALK * Math.max(0.45, m / 0.92);
  const tx = dx * (m ? top : 0),
    tz = dz * (m ? top : 0);
  const ex = tx - s.vx,
    ez = tz - s.vz;
  const el = Math.hypot(ex, ez);
  const rate = (m ? ACCEL : DECEL) * dt;
  const k = el > rate ? rate / el : 1;
  const vx = s.vx + ex * k,
    vz = s.vz + ez * k;
  let yaw = s.yaw;
  if (m) {
    const want = Math.atan2(dx, dz);
    const d = wrapAngle(want - yaw);
    const step = TURN_RATE * dt;
    yaw = wrapAngle(yaw + Math.max(-step, Math.min(step, d)));
  }
  return { vx, vz, yaw };
}

/** Lazy follow camera: drifts behind the player while they move forward-ish, holds when they run toward it. */
export function followCamYaw(camYaw: number, playerYaw: number, speed: number, dt: number) {
  if (speed < 0.6) return camYaw;
  const d = wrapAngle(playerYaw - camYaw);
  // only drift when heading roughly away from the camera; strafing/backing never spins the view
  if (Math.abs(d) > 0.9) return camYaw;
  const rate = 0.9 * Math.min(1, speed / RUN) * dt;
  return wrapAngle(camYaw + Math.max(-rate, Math.min(rate, d)));
}
