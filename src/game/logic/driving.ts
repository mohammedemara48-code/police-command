/** Arcade car handling (pure, unit-tested): accel/brake, speed-sensitive steering, grip and handbrake drift. */
import { wrapAngle } from './locomotion';
import type { Handling } from './vehicles';

/** The patrol car: every multiplier 1. */
export const REFERENCE_HANDLING: Handling = { top: 1, accel: 1, brake: 1, grip: 1, steer: 1, reverse: 1 };

export interface CarState {
  speed: number;
  yaw: number;
  velYaw: number;
}
export interface CarInput {
  throttle: number;
  steer: number;
  handbrake: boolean;
  max: number;
  damage?: number;
}

export const ACCEL = 15; // m/s²
export const BRAKE = 28;
export const COAST = 3;
export const REVERSE_MAX = 6;
export const GRIP = 9; // how fast the velocity heading follows the nose (rad/s-ish)
export const DRIFT_GRIP = 1.6;

/** Top speed after damage: a wrecked car is slower but never undrivable (60% at 100 damage). */
export const topSpeed = (max: number, damage = 0) => max * (1 - 0.4 * Math.min(1, Math.max(0, damage) / 100));

/**
 * Steering authority at |speed| a: none when parked, strongest at mid speed, calmer towards top speed, and above
 * 20 m/s the wheel gets heavier still, so a flick on a phone stick does not throw the car at 100 km/h.
 */
export function steerAuth(a: number, max: number): number {
  return (Math.min(1, a / 5) * (1 - 0.3 * Math.min(1, a / Math.max(1, max)))) / (1 + Math.max(0, a - 20) / 30);
}
/** Yaw rate (rad/s) at full lock and authority 1. */
export const STEER_RATE = 2.1;

export function stepCar(s: CarState, i: CarInput, dt: number, h: Handling = REFERENCE_HANDLING): CarState {
  const max = topSpeed(i.max, i.damage);
  const ACCEL_ = ACCEL * h.accel,
    BRAKE_ = BRAKE * h.brake;
  let { speed, yaw, velYaw } = s;
  const t = Math.max(-1, Math.min(1, i.throttle));
  if (t > 0.05) speed += (speed < 0 ? BRAKE_ : ACCEL_ * (1 - (0.65 * Math.max(0, speed)) / max)) * t * dt;
  else if (t < -0.05) speed += (speed > 0.5 ? -BRAKE_ : -ACCEL_ * 0.6) * -t * dt;
  else speed -= Math.sign(speed) * Math.min(Math.abs(speed), COAST * dt);
  if (i.handbrake) speed -= Math.sign(speed) * Math.min(Math.abs(speed), 7 * dt);
  speed = Math.max(-REVERSE_MAX * h.reverse, Math.min(max, speed));
  // steering: none when parked, strongest at mid speed, a bit calmer at top speed; handbrake swings the tail
  const a = Math.abs(speed);
  const auth = steerAuth(a, max);
  const steer = Math.max(-1, Math.min(1, i.steer));
  yaw = wrapAngle(yaw + steer * STEER_RATE * h.steer * auth * (i.handbrake ? 1.6 : 1) * Math.sign(speed || 1) * dt);
  const grip = i.handbrake ? DRIFT_GRIP : GRIP * h.grip;
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

/**
 * Steering wheel: eases toward the input instead of snapping. Turning in gets slower with speed
 * (calmer at 90 km/h), letting go or counter-steering is quicker so the car recovers from a slide.
 */
export function smoothSteer(cur: number, target: number, speed: number, dt: number) {
  const t = Math.max(-1, Math.min(1, target));
  const back = t === 0 || (cur !== 0 && Math.sign(t) !== Math.sign(cur));
  const rate = back ? 7 : 5 / (1 + Math.abs(speed) / 10);
  const d = t - cur;
  const step = rate * dt;
  return Math.abs(d) <= step ? t : cur + Math.sign(d) * step;
}

export interface CamRig {
  /** per-second remainder for the follow lerp: k = 1 - lag^dt (smaller = stiffer) */
  lag: number;
  /** metres the camera looks ahead of the car */
  ahead: number;
  /** extra field of view in degrees */
  fov: number;
  /** metres the boom pulls back at speed */
  pull?: number;
}
/** Chase camera at speed: trails a little more and looks further ahead. Reduced motion: rigid, no zoom. */
export function camRig(speed: number, max: number, reduced: boolean, out: CamRig): CamRig {
  const a = Math.min(1, Math.abs(speed) / Math.max(1, max));
  if (reduced) {
    out.lag = 0;
    out.ahead = Math.min(4, Math.abs(speed) * 0.25);
    out.fov = 0;
    out.pull = 0;
    return out;
  }
  out.lag = 0.0008 + a * a * 0.006;
  out.ahead = Math.min(10, Math.abs(speed) * 0.4);
  // the faster you go the wider the view and the further back the camera sits (eased in, so cruising stays calm)
  out.fov = Math.min(16, Math.abs(speed) * 0.55);
  out.pull = a * a * 3;
  return out;
}

/**
 * The chase camera's heading in a car: eases behind the car (a touch of lag in a turn, then it re-centres), quicker
 * at speed. Reversing keeps it behind the nose, so it never flips round to face the driver.
 */
export function chaseCamYaw(cur: number, target: number, speed: number, dt: number): number {
  const d = wrapAngle(target - cur);
  const k = Math.abs(d) > 2.5 ? 9 : 3.2 + Math.min(1, Math.abs(speed) / 20) * 3.5;
  return wrapAngle(cur + d * (1 - Math.exp(-k * dt)));
}

/** Hood smoke from damage: 0 below 50%, ramps to 1 at a wreck. */
export const smokeLevel = (damage: number) => Math.max(0, Math.min(1, (damage - 50) / 40));
