/** VIP escort patrol call (pure, unit-tested): convoy speed, ambush plan and spots on the route, VIP damage. */
import type { RaidRole } from './calls';

export type Pt = { x: number; z: number };

/** Full VIP health (shown as the gold ring on the HUD). */
export const VIP_HP = 100;
/** Full cruise speed while the patrol is this close to the VIP car (m). */
export const ESCORT_NEAR = 16;
/** Beyond this the VIP car stops and waits for its escort (m). */
export const ESCORT_FAR = 34;
/** VIP cruise speed, m/s (~31 km/h): easy to keep up with, slow enough to cover. */
export const VIP_CRUISE = 8.6;
/** The run is over once the VIP car is this close to the destination (m). */
export const VIP_ARRIVE_R = 7;
/** The ambush springs this far ahead of the VIP on its route (m): inside the gunmen's range of the stopped car. */
export const AMBUSH_AHEAD = 18;
/** Lane offset of the VIP car to the right of the road centre (m). */
export const VIP_LANE = 1.6;
/** Chance an aimed gunman's round hits the VIP car (before the peek/move aim factor). */
export const VIP_HIT = 0.45;
/** Gunmen only shoot at things within this range (same as at the officer). */
export const SHOT_R = 24;

/** Rank level 1 (rookie) … 6 (major) clamped to the table. */
const lv = (n: number) => Math.max(1, Math.min(6, Math.floor(n) || 1));

/**
 * VIP car speed (m/s): stops dead while an ambush is live, waits when the escort falls behind,
 * eases off as the gap grows, brakes for corners and rolls to a stop at the destination. `blocked`: the
 * patrol car or the officer is right in front of it, so it waits instead of ramming through.
 */
export function vipSpeed(o: { escort: number; ambush: boolean; toGo: number; turn: number; blocked?: boolean }) {
  if (o.ambush || o.blocked || !(o.escort <= ESCORT_FAR)) return 0;
  let v = VIP_CRUISE;
  if (o.escort > ESCORT_NEAR) v *= 1 - (o.escort - ESCORT_NEAR) / (ESCORT_FAR - ESCORT_NEAR);
  v *= 1 - 0.5 * Math.min(1, Math.abs(o.turn) / 1.2);
  if (o.toGo < 20) v = Math.min(v, 1.5 + Math.max(0, o.toGo) * 0.35);
  return Math.max(0, v);
}

export interface Ambush {
  /** route fraction (0..1) at which it springs */
  at: number;
  roles: RaidRole[];
}

/**
 * Ambushes on the way: 1 as a rookie, 2 from sergeant. 2 attackers as a rookie, 3 from officer, and the
 * last ambush gets a 4th from captain. The first ambush is all gunmen; later ones can include a runner.
 */
export function ambushPlan(rankLevel: number, rolls: readonly number[]): Ambush[] {
  const L = lv(rankLevel);
  const at = L >= 3 ? [0.3, 0.68] : [0.45];
  const roll = (i: number) => rolls[i % Math.max(1, rolls.length)] ?? 0.5;
  return at.map((a, w) => {
    const size = Math.min(4, 2 + (L >= 2 ? 1 : 0) + (L >= 5 && w === at.length - 1 ? 1 : 0));
    const roles: RaidRole[] = [];
    for (let i = 0; i < size; i++) roles.push(w === 0 || i === 0 || roll(w * 4 + i) >= 0.3 ? 'fight' : 'flee');
    // a little jitter so two calls never spring at exactly the same spot
    return { at: Math.max(0.15, Math.min(0.85, a + (roll(w + 7) - 0.5) * 0.1)), roles };
  });
}

/** Total attackers over the whole run (for pay and time). */
export const ambushCount = (plan: readonly Ambush[]) => plan.reduce((n, a) => n + a.roles.length, 0);

/** Length of a polyline (m). */
export function routeLength(pts: readonly Pt[]) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.z - pts[i - 1]!.z);
  return s;
}

/**
 * Point `s` metres along the polyline (clamped to its ends). `ns` is true when that leg runs north–south
 * (along an avenue), `edge` is the distance to the nearer end of the leg (i.e. to the intersection).
 */
export function pointAlong(pts: readonly Pt[], s: number): { x: number; z: number; ns: boolean; edge: number } {
  if (!pts.length) return { x: 0, z: 0, ns: true, edge: 0 };
  let left = Math.max(0, s);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!,
      b = pts[i]!;
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    if (left <= d || i === pts.length - 1) {
      const k = d > 0 ? Math.min(1, left / d) : 0;
      const at = k * d;
      return {
        x: a.x + (b.x - a.x) * k,
        z: a.z + (b.z - a.z) * k,
        ns: Math.abs(b.x - a.x) < Math.abs(b.z - a.z),
        edge: Math.min(at, d - at)
      };
    }
    left -= d;
  }
  const p = pts[0]!;
  return { x: p.x, z: p.z, ns: true, edge: 0 };
}

/**
 * Where an ambush springs: the first spot at least `ahead` m beyond `s` that lies on an avenue leg and is
 * clear of the intersections (so the gunmen and crates sit on the avenue sidewalks, never in a crossing).
 * Stays short of the destination; falls back to the plain point `ahead` m on if no leg qualifies.
 */
export function ambushSpot(pts: readonly Pt[], s: number, ahead = AMBUSH_AHEAD) {
  const total = routeLength(pts);
  const end = total - 12;
  for (let t = s + ahead; t <= Math.min(end, s + ahead + 90); t += 3) {
    const p = pointAlong(pts, t);
    if (p.ns && p.edge > 12) return p;
  }
  return pointAlong(pts, Math.min(s + ahead, Math.max(s, end)));
}

/**
 * Does a gunman fire at the VIP car (true) or at the officer (false)? Only at what's in range; when both
 * are, mostly at the nearer one, but the car is the prize so it gets a fair share either way.
 */
export function shootsVip(dOfficer: number, dVip: number, roll: number) {
  if (!(dVip < SHOT_R)) return false;
  if (!(dOfficer < SHOT_R)) return true;
  return roll < (dVip < dOfficer ? 0.6 : 0.3);
}

/** Damage of one round that hits the VIP car: 7 as a rookie, up to 12 at major. */
export const vipShotDamage = (rankLevel: number) => 6 + lv(rankLevel);

/** Ramming the VIP car with the patrol car hurts too (closing speed in m/s). */
export const vipCrashDamage = (closing: number) => (closing > 3 ? Math.min(20, Math.round((closing - 3) * 2)) : 0);

/**
 * VIP destination: one of the given junctions 110–260 m from the start (as the crow flies); the farthest few when none
 * is that far. The caller pulls the point into the block so the car never parks in a crossing. `roll` picks among them.
 */
export function vipDestination(start: Pt, nodes: readonly Pt[], roll: number): Pt {
  const dist = (n: Pt) => Math.hypot(n.x - start.x, n.z - start.z);
  let c = nodes.filter((n) => dist(n) >= 110 && dist(n) <= 260);
  if (!c.length) c = [...nodes].sort((a, b) => dist(b) - dist(a)).slice(0, 3);
  const n = c[Math.min(c.length - 1, Math.floor(Math.max(0, Math.min(0.999, roll)) * c.length))]!;
  return { x: n.x, z: n.z };
}

/** Who rides in the car and where to (Egyptian Arabic, for the radio and the objective). */
export const VIP_WHO = ['السفير', 'الوزير', 'شاهد الملك في قضية العقرب', 'القاضي', 'رجل الأعمال الكبير'];
export const VIP_DEST = ['فندق كورنيش الجيزة', 'مبنى المحافظة', 'المحكمة', 'السفارة', 'قاعة المؤتمرات'];
