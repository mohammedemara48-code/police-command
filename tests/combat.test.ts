import { describe, it, expect } from 'vitest';
import {
  rollHitZone,
  zoneDamage,
  applyArmor,
  coverDamage,
  officerCovered,
  refillArmor,
  takeAmmoPickup,
  reloadFromReserve,
  nearPickup,
  ZONE_MULT,
  ARMOR_MAX,
  COVER_BLOCK,
  AMMO_PACK
} from '../src/game/logic/combat';
import type { Cover } from '../src/game/logic/cover';

describe('hit zones', () => {
  it('only rolls torso or limb — never a headshot zone', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const z = rollHitZone(() => i / 200);
      seen.add(z);
      expect(z === 'torso' || z === 'limb').toBe(true);
    }
    expect(seen.has('torso')).toBe(true);
    expect(seen.has('limb')).toBe(true);
    expect(seen.has('head')).toBe(false);
  });
  it('limb hits deal less than torso; neither is an insta-kill multiplier', () => {
    expect(zoneDamage(10, 'torso')).toBe(10);
    expect(zoneDamage(10, 'limb')).toBeCloseTo(5.5);
    expect(ZONE_MULT.torso).toBeLessThanOrEqual(1);
    expect(ZONE_MULT.limb).toBeLessThan(1);
    expect(Object.keys(ZONE_MULT)).not.toContain('head');
  });
});

describe('armor and cover', () => {
  it('vest soaks most of a hit until empty', () => {
    const a = applyArmor(10, 50);
    expect(a.hp).toBeCloseTo(3);
    expect(a.armor).toBeCloseTo(43);
    const bare = applyArmor(10, 0);
    expect(bare.hp).toBe(10);
    expect(bare.armor).toBe(0);
  });
  it('refillArmor restores a full vest', () => {
    expect(refillArmor(12)).toBe(ARMOR_MAX);
    expect(refillArmor(0, 80)).toBe(80);
  });
  it('crate cover blocks most of an incoming shot', () => {
    expect(coverDamage(20, false)).toBe(20);
    expect(coverDamage(20, true)).toBeCloseTo(20 * (1 - COVER_BLOCK));
  });
  it('officerCovered is true when a crate sits between the officer and the shooter', () => {
    const covers: Cover[] = [{ x: 0, z: 0, by: -1 }];
    // officer just behind the crate, shooter far in front
    expect(officerCovered(covers, 0, 0.9, 0, -15)).toBe(true);
    // officer out in the open to the side
    expect(officerCovered(covers, 8, 0.9, 0, -15)).toBe(false);
    // no crates
    expect(officerCovered([], 0, 0.9, 0, -15)).toBe(false);
  });
});

describe('ammo pickups', () => {
  it('tops up the magazine first, leftover goes to reserve', () => {
    const got = takeAmmoPickup(3, 12, 0, AMMO_PACK);
    expect(got).toEqual({ ammo: 12, reserve: 3 });
  });
  it('adds to reserve when the mag is already full', () => {
    expect(takeAmmoPickup(12, 12, 0)).toEqual({ ammo: 12, reserve: AMMO_PACK });
  });
  it('ignores a pack when already well stocked', () => {
    expect(takeAmmoPickup(12, 12, AMMO_PACK * 2)).toBeNull();
  });
  it('reloadFromReserve fills the mag from the pouch', () => {
    expect(reloadFromReserve(0, 12, 20)).toEqual({ ammo: 12, reserve: 8 });
    expect(reloadFromReserve(12, 12, 5)).toBeNull();
    expect(reloadFromReserve(4, 12, 0)).toBeNull();
  });
  it('nearPickup uses a short walk-over radius', () => {
    expect(nearPickup(0, 0, 1, 0)).toBe(true);
    expect(nearPickup(0, 0, 5, 0)).toBe(false);
  });
});
