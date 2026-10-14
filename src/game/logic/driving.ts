/** Arcade car handling (pure, unit-tested): accel/brake, speed-sensitive steering, grip and handbrake drift. */
import { wrapAngle } from './locomotion';

export interface CarState { speed: number; yaw: number; velYaw: number }
export interface CarInput { throttle: number; steer: number; handbrake: boolean; max: number; damage?: number }

export const ACCEL = 10; // m/s²
export const BRAKE = 22;
export const COAST = 3;
export const REVERSE_MAX = 6;
export const GRIP = 9; // how fast the velocity heading follows the nose (rad/s-ish)
export const DRIFT_GRIP = 1.6;

export function stepCar(s: CarState, i: CarInput, dt: number): CarState {
  const max = i.max * (1 - 0.4 * Math.min(1, (i.damage ?? 0) / 100));
  let { speed, yaw, velYaw } = s;
  const t = Math.max(-1, Math.min(1, i.throttle));
  if (t > 0.05) speed += (speed < 0 ? BRAKE : ACCEL * (1 - 0.65 * Math.max(0, speed) / max)) * t * dt;
  else if (t < -0.05) speed += (speed > 0.5 ? -BRAKE : -ACCEL * 0.6) * -t * dt * (speed > 0.5 ? 1 : 1);
  else speed -= Math.sign(speed) * Math.min(Math.abs(speed), COAST * dt);
  if (i.handbrake) speed -= Math.sign(speed) * Math.min(Math.abs(speed), 7 * dt);
  speed = Math.max(-REVERSE_MAX, Math.min(max, speed));
  // steering: none when parked, strongest at mid speed, a bit calmer at top speed; handbrake swings the tail
  const a = Math.abs(speed);
  const auth = Math.min(1, a / 5) * (1 - 0.3 * Math.min(1, a / Math.max(1, max)));
  const steer = Math.max(-1, Math.min(1, i.steer));
  yaw = wrapAngle(yaw + steer * 2.1 * auth * (i.handbrake ? 1.6 : 1) * Math.sign(speed || 1) * dt);
  const grip = i.handbrake ? DRIFT_GRIP : GRIP;
  const d = wrapAngle(yaw - velYaw);
  velYaw = wrapAngle(velYaw + d * Math.min(1, grip * dt));
  // sliding sideways scrubs speed
  speed *= 1 - Math.min(0.5, Math.abs(Math.sin(d)) * 0.9 * dt);
  return { speed, yaw, velYaw };
}

/** 0..1 drift amount (for smoke/skid sound/score) */
export const driftOf = (s: CarState) => Math.min(1, Math.abs(Math.sin(wrapAngle(s.yaw - s.velYaw))) * 2);

export const kmh = (mps: number) => Math.round(Math.abs(mps) * 3.6);

/** Damage from a hit at closing speed v (m/s); small taps don't count. */
export const hitDamage = (v: number) => (v < 3 ? 0 : Math.min(35, Math.round((v - 3) * 2.2)));

/** Traffic pull-over: cars within range of a siren ease to the kerb. Returns lateral offset target (m). */
export function pullOver(sirenOn: boolean, dist: number) {
  return sirenOn && dist < 40 ? 1.9 : 0;
}
