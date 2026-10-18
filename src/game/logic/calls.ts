/** Patrol call types: drunk-driver stop, speed trap and drug-house raid waves (pure, unit-tested). VIP escort: logic/escort.ts. */
import { PULL_R, PULL_T } from './missions';

export type CallKind =
  'robbery' | 'chase' | 'gang' | 'hostage' | 'runner' | 'speeder' | 'route' | 'dui' | 'trap' | 'raid' | 'vip';

/** Rank level 1 (rookie) … 6 (major) clamped to the table. */
const lv = (n: number) => Math.max(1, Math.min(6, Math.floor(n) || 1));

// ---- DUI stop
/** A drunk driver reacts slower to the siren. */
export const DUI_PULL_RATE = 0.6;
/** Lateral swerve of a drunk driver, metres. */
export const DUI_WEAVE_AMP = 1.1;
const WEAVE_W = Math.PI * 2 * 0.32;
/** Walk this close to the stopped car and the driver steps out. */
export const DUI_TALK_R = 4.5;

/** Smooth lane offset (m) of a swerving car at time t: two mixed sines, never more than `amp`. */
export function duiWeave(t: number, amp = DUI_WEAVE_AMP) {
  return amp * (0.75 * Math.sin(t * WEAVE_W) + 0.25 * Math.sin(t * WEAVE_W * 2.3 + 1));
}

/** DUI pull-over meter: fills at 60% speed with the siren on the bumper and drains faster once you back off. */
export function stepPullDui(m: number, o: { siren: boolean; inCar: boolean; dist: number }, dt: number) {
  return o.siren && o.inCar && o.dist < PULL_R ? Math.min(PULL_T, m + dt * DUI_PULL_RATE) : Math.max(0, m - dt);
}

/** What the drunk driver does when you walk up: surrenders, or (more often at higher rank) stumbles off on foot. */
export function duiDriver(rankLevel: number, roll: number): 'surrender' | 'flee' {
  const flee = Math.min(0.5, 0.15 + 0.07 * (lv(rankLevel) - 1));
  return roll < flee ? 'flee' : 'surrender';
}

// ---- speed trap
/** Park inside this radius of the radar spot. */
export const TRAP_R = 8;
/** Below this speed (m/s) the patrol car counts as parked. */
export const TRAP_PARK_V = 1.2;
/** Seconds parked before the radar catches the next speeder. */
export const TRAP_WAIT = 2.5;
export const TRAP_LIMIT_KMH = 60;

/** Speeders to catch on one trap shift: 1 as a rookie, up to 3 from captain. */
export const trapCount = (rankLevel: number) => (lv(rankLevel) >= 5 ? 3 : lv(rankLevel) >= 3 ? 2 : 1);

/** Radar timer: counts up while parked in the zone and resets the moment you drive off or leave the car. */
export function stepTrap(t: number, o: { inCar: boolean; speed: number; dist: number }, dt: number) {
  return o.inCar && Math.abs(o.speed) < TRAP_PARK_V && o.dist < TRAP_R ? t + dt : 0;
}

/** Radar read-out for the clocked speeder (km/h), always well over the limit; faster cars at higher rank. */
export function radarKmh(rankLevel: number, roll: number) {
  return Math.round(TRAP_LIMIT_KMH + 30 + lv(rankLevel) * 8 + Math.max(0, Math.min(1, roll)) * 25);
}

// ---- drug-house raid
export type RaidRole = 'fight' | 'flee' | 'surrender';
export interface RaidWave {
  roles: RaidRole[];
}

/**
 * Raid plan: 2 waves for a rookie, 3 from sergeant. Each wave has 2–3 people; the first is all gunmen,
 * later waves can include one who runs and one who gives up. At most 8 suspects in total.
 */
export function raidPlan(rankLevel: number, rolls: readonly number[]): RaidWave[] {
  const L = lv(rankLevel);
  const n = L >= 3 ? 3 : 2;
  const roll = (i: number) => rolls[i % Math.max(1, rolls.length)] ?? 0.5;
  const waves: RaidWave[] = [];
  let total = 0;
  for (let w = 0; w < n; w++) {
    const size = Math.min(3, 2 + (w === n - 1 && L >= 2 ? 1 : 0), 8 - total);
    const roles: RaidRole[] = [];
    for (let i = 0; i < size; i++) {
      const r = roll(w * 3 + i);
      roles.push(w === 0 || i === 0 ? 'fight' : r < 0.25 ? 'flee' : r < 0.45 ? 'surrender' : 'fight');
    }
    total += size;
    waves.push({ roles });
  }
  return waves;
}

/** Arabic banner for the wave about to come out of the house. */
export const waveText = (i: number, n: number) =>
  i === n - 1 ? `الموجة الأخيرة (${i + 1}/${n}) طالعة من البيت!` : `موجة ${i + 1}/${n} طالعة من البيت!`;

// ---- pay and time
const PAY: Record<CallKind, { base: number; per: number; mul: number }> = {
  robbery: { base: 1200, per: 300, mul: 1 },
  chase: { base: 1200, per: 300, mul: 1 },
  gang: { base: 1200, per: 300, mul: 1 },
  hostage: { base: 1200, per: 300, mul: 1 },
  runner: { base: 1200, per: 300, mul: 1 },
  speeder: { base: 1200, per: 300, mul: 1 },
  route: { base: 1200, per: 300, mul: 1 },
  dui: { base: 1500, per: 300, mul: 1.1 },
  trap: { base: 900, per: 700, mul: 1 },
  raid: { base: 1600, per: 300, mul: 1.15 },
  vip: { base: 1800, per: 300, mul: 1.2 }
};

/** Call payout: base + rank × 400 + per suspect/speeder, times the call's risk multiplier (rounded to $10). */
export function callReward(kind: CallKind, rankLevel: number, count: number) {
  const p = PAY[kind];
  return Math.round(((p.base + lv(rankLevel) * 400 + Math.max(0, count) * p.per) * p.mul) / 10) * 10;
}

/** Call time limit in seconds: more people or speeders → more time. */
export function callLimit(kind: CallKind, count: number) {
  const n = Math.max(0, count);
  if (kind === 'trap') return 120 + n * 70;
  if (kind === 'raid') return 170 + n * 18;
  if (kind === 'dui') return 170;
  if (kind === 'vip') return 210 + n * 20;
  return 150 + n * 15;
}

/** A patrol loop is announced where the officer stands: the avenue nearest to them and their own position along it. */
export function patrolAnchor(px: number, pz: number, avenues: readonly number[]) {
  const x = avenues.reduce((best, a) => (Math.abs(a - px) < Math.abs(best - px) ? a : best), avenues[0] ?? 0);
  return { x, z: pz };
}
