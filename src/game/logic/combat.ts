/**
 * Combat hit resolution (pure, unit-tested).
 * Hits land on body zones only — torso or limbs. There is no headshot / insta-kill zone.
 * Armor soaks part of each hit; crates can cover the officer the same way they cover gunmen.
 */
import { shielded, type Cover } from './cover';

export type HitZone = 'torso' | 'limb';

/** Damage multipliers by zone. Limbs hurt less; nothing is an insta-kill. */
export const ZONE_MULT: Record<HitZone, number> = {
  torso: 1,
  limb: 0.55
};

/** Full vest capacity shown on the HUD ring as a percentage. */
export const ARMOR_MAX = 100;

/** How much of a hit a vest absorbs while it still has charge (rest goes to HP). */
export const ARMOR_ABSORB = 0.7;

/** Fraction of incoming damage blocked when the officer is behind a crate. */
export const COVER_BLOCK = 0.85;

/** Rounds granted by one ground ammo pack. */
export const AMMO_PACK = 12;

/** Weighted zone roll: mostly torso, sometimes a limb. Never a head. */
export function rollHitZone(rnd: () => number = Math.random): HitZone {
  return rnd() < 0.7 ? 'torso' : 'limb';
}

export function zoneDamage(base: number, zone: HitZone): number {
  return Math.max(0, base * ZONE_MULT[zone]);
}

/** Apply vest absorption. Returns HP loss and the remaining armor. */
export function applyArmor(incoming: number, armor: number): { hp: number; armor: number } {
  const soak = Math.min(Math.max(0, armor), Math.max(0, incoming) * ARMOR_ABSORB);
  return { hp: Math.max(0, incoming - soak), armor: Math.max(0, armor - soak) };
}

/** Reduce damage when the officer is using crate cover against that shooter. */
export function coverDamage(incoming: number, covered: boolean): number {
  const n = Math.max(0, incoming);
  return covered ? n * (1 - COVER_BLOCK) : n;
}

/**
 * True when any crate sits between the officer at (ox, oz) and a hostile at (hx, hz).
 * Reuses the same geometry test gunmen use — the officer must be close to the crate.
 */
export function officerCovered(covers: Cover[], ox: number, oz: number, hx: number, hz: number): boolean {
  for (const c of covers) {
    if (shielded(c, ox, oz, hx, hz)) return true;
  }
  return false;
}

export function refillArmor(_current: number, max = ARMOR_MAX): number {
  return max;
}

/**
 * Walking over a pack: top up the magazine first, leftover goes to reserve.
 * Returns null when the officer is already full (mag + a couple of packs in reserve).
 */
export function takeAmmoPickup(
  ammo: number,
  mag: number,
  reserve: number,
  pack = AMMO_PACK
): { ammo: number; reserve: number } | null {
  if (ammo >= mag && reserve >= pack * 2) return null;
  let nextAmmo = ammo;
  let nextReserve = reserve;
  let left = pack;
  if (nextAmmo < mag) {
    const need = mag - nextAmmo;
    const give = Math.min(need, left);
    nextAmmo += give;
    left -= give;
  }
  nextReserve += left;
  return { ammo: nextAmmo, reserve: nextReserve };
}

/** Reload: fill the magazine from reserve. Returns false when there is nothing to load. */
export function reloadFromReserve(
  ammo: number,
  mag: number,
  reserve: number
): { ammo: number; reserve: number } | null {
  if (reserve <= 0 || ammo >= mag) return null;
  const need = mag - ammo;
  const take = Math.min(need, reserve);
  return { ammo: ammo + take, reserve: reserve - take };
}

export function nearPickup(px: number, pz: number, x: number, z: number, r = 1.4): boolean {
  return Math.hypot(px - x, pz - z) < r;
}
