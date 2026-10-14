/**
 * Fleeing car behaviour (pure, unit-tested). States:
 * flee → evade (you're on its tail) → ram (side swipe or brake check, then cooldown) → back to flee;
 * spun (after a PIT) and boxed (box-in meter past half) block rams; surrender once caught.
 */
export type CarMode = 'flee' | 'evade' | 'ram' | 'spun' | 'boxed' | 'surrender';

export interface CarAi {
  mode: CarMode;
  /** time left in the current ram */
  t: number;
  /** seconds until the next ram is allowed */
  cool: number;
  /** ram direction in the suspect's frame: +1 = its local +x, 0 = brake check */
  side: number;
  /** weave phase while evading */
  phase: number;
}

/** What the suspect knows this frame. lx/lz: patrol car in the suspect's frame (+z ahead). */
export interface CarSense {
  lx: number;
  lz: number;
  inCar: boolean;
  /** patrol car speed, m/s */
  pSpeed: number;
  /** box-in meter, 0..1 */
  lock: number;
  spun: boolean;
  caught: boolean;
  /** difficulty 0..1 (mission / patrol level) */
  skill: number;
}

/** How the chase code should move the car this frame. */
export interface CarCmd {
  /** multiplier on the normal flee speed */
  speedMul: number;
  /** sideways speed in the suspect's frame, m/s (+ = local +x) */
  lat: number;
  /** extra yaw toward the swipe, rad */
  yawOff: number;
}

export const SWIPE_T = 0.7; // s
export const BRAKE_T = 0.6; // s
export const FIRST_RAM = 6; // s of calm at the start of a chase

export const newCarAi = (): CarAi => ({ mode: 'flee', t: 0, cool: FIRST_RAM, side: 0, phase: 0 });

/** Rams get more frequent with difficulty: one every ~13 s on the first chase, ~7 s on the hardest. */
export const ramCooldown = (skill: number) => 13 - 6 * clamp01(skill);
/** Chance per second of taking a ram opportunity once the cooldown is over. */
export const ramRate = (skill: number) => 0.5 + clamp01(skill);
/** Side swipe speed, m/s: hard enough to shove you, small enough to cost only a few % damage. */
export const swipeSpeed = (skill: number) => 3.2 + 2 * clamp01(skill);

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Patrol car level with the suspect's doors, close enough to swipe. */
export const alongside = (s: CarSense) =>
  Math.abs(s.lx) > 1.6 && Math.abs(s.lx) < 4.6 && s.lz > -3.5 && s.lz < 2.5 && s.pSpeed > 5;
/** Patrol car right on the rear bumper: a brake check makes it rear-end the suspect. */
export const tailgating = (s: CarSense) => Math.abs(s.lx) < 1.6 && s.lz < -4.4 && s.lz > -9 && s.pSpeed > 8;

export function stepCarAi(ai: CarAi, s: CarSense, dt: number, rnd: () => number = Math.random): CarMode {
  if (ai.cool > 0) ai.cool = Math.max(0, ai.cool - dt);
  if (ai.mode === 'surrender') return ai.mode;
  if (s.caught) return (ai.mode = 'surrender');
  if (s.spun) {
    ai.t = 0;
    return (ai.mode = 'spun');
  }
  if (ai.mode === 'ram') {
    ai.t -= dt;
    if (ai.t > 0) return ai.mode;
    ai.cool = ramCooldown(s.skill);
  }
  if (!s.inCar) return (ai.mode = 'flee');
  const near = Math.hypot(s.lx, s.lz) < 14;
  if (s.lock >= 0.5 && near) return (ai.mode = 'boxed');
  const side = alongside(s),
    tail = !side && tailgating(s);
  if (ai.cool <= 0 && (side || tail) && rnd() < ramRate(s.skill) * (tail ? 0.5 : 1) * dt) {
    ai.side = side ? Math.sign(s.lx) : 0;
    ai.t = side ? SWIPE_T : BRAKE_T;
    return (ai.mode = 'ram');
  }
  if (near) {
    ai.phase += dt * 2.4;
    return (ai.mode = 'evade');
  }
  return (ai.mode = 'flee');
}

/** The swipe connected: back off right away (one hit per ram). */
export function ramLanded(ai: CarAi) {
  if (ai.mode === 'ram') ai.t = Math.min(ai.t, 0.12);
}

/** Movement for the current state. Writes into `out` (no allocations). */
export function carCmd(ai: CarAi, skill: number, out: CarCmd): CarCmd {
  out.speedMul = 1;
  out.lat = 0;
  out.yawOff = 0;
  switch (ai.mode) {
    case 'ram':
      if (ai.side === 0) out.speedMul = 0.55;
      else {
        const k = Math.min(1, ai.t / SWIPE_T) * 2; // quick jab that fades out
        out.lat = ai.side * swipeSpeed(skill) * Math.min(1, k);
        out.yawOff = ai.side * 0.22 * Math.min(1, k);
      }
      break;
    case 'evade':
      out.lat = Math.sin(ai.phase) * 1.4;
      break;
    case 'boxed':
      out.speedMul = 0.92;
      break;
    case 'spun':
    case 'surrender':
      out.speedMul = 0;
      break;
  }
  return out;
}
