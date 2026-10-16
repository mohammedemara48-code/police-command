import { describe, it, expect } from 'vitest';
import { humanMatRole, shouldBrightenRecolor, LOCO_CROSSFADE, LOCO_SPEED_EMA } from '../src/game/logic/humanMaterials';

describe('humanMatRole', () => {
  it('maps Skin / Hair / Shoes', () => {
    expect(humanMatRole('Skin')).toBe('skin');
    expect(humanMatRole('Hair')).toBe('hair');
    expect(humanMatRole('Shoes')).toBe('shoes');
    expect(humanMatRole('Shoe')).toBe('shoes');
  });
  it('maps eye-like names', () => {
    expect(humanMatRole('Eye')).toBe('eye');
    expect(humanMatRole('Eyes')).toBe('eye');
    expect(humanMatRole('Cornea')).toBe('eye');
    expect(humanMatRole('iris')).toBe('eye');
  });
  it('everything else is cloth', () => {
    expect(humanMatRole('Suit')).toBe('cloth');
    expect(humanMatRole('Shirt')).toBe('cloth');
    expect(humanMatRole('')).toBe('cloth');
  });
});

describe('shouldBrightenRecolor', () => {
  it('brightens mapped Kenney mats only', () => {
    expect(shouldBrightenRecolor(true, false)).toBe(true);
    expect(shouldBrightenRecolor(true, true)).toBe(false);
    expect(shouldBrightenRecolor(false, false)).toBe(false);
  });
});

describe('locomotion constants', () => {
  it('uses a longer blend and softer speed EMA', () => {
    expect(LOCO_CROSSFADE).toBeGreaterThanOrEqual(0.28);
    expect(LOCO_CROSSFADE).toBeLessThanOrEqual(0.35);
    expect(LOCO_SPEED_EMA).toBeLessThan(8);
    expect(LOCO_SPEED_EMA).toBeGreaterThan(0);
  });
});
