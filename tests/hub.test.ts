import { describe, it, expect } from 'vitest';
import {
  WEAPON_PRICE,
  GARAGE,
  START_MONEY,
  DEFAULT_GARAGE,
  buyWeapon,
  buyUpgrade,
  equipOwned,
  armoredHit,
  engineBonus,
  brakeMul,
  sirenRangeBonus,
  missionBoardRow,
  sanitizeOwned,
  sanitizeGarage,
  sanitizeMoney,
  buyFailAr
} from '../src/game/logic/hub';

const wallet = (money = 5000) => ({
  money,
  ownedWeapons: ['pistol' as const],
  garage: { ...DEFAULT_GARAGE }
});

describe('armory', () => {
  it('pistol is free and already owned blocks rebuy', () => {
    expect(WEAPON_PRICE.pistol).toBe(0);
    const r = buyWeapon(wallet(100), 'pistol');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('owned');
  });

  it('buys revolver when affordable and equips it', () => {
    const r = buyWeapon(wallet(WEAPON_PRICE.revolver), 'revolver');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.weapon).toBe('revolver');
      expect(r.ownedWeapons).toContain('revolver');
      expect(r.money).toBe(0);
    }
  });

  it('rejects smg when broke and reports the shortfall', () => {
    const r = buyWeapon(wallet(100), 'smg');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('broke');
      expect(r.need).toBe(WEAPON_PRICE.smg - 100);
      expect(buyFailAr('broke', r.need)).toMatch(/ناقص/);
    }
  });

  it('equipOwned only allows guns already in the locker', () => {
    expect(equipOwned(['pistol', 'smg'], 'smg')).toBe('smg');
    expect(equipOwned(['pistol'], 'revolver')).toBeNull();
  });
});

describe('garage upgrades', () => {
  it('buys engine level 1 then refuses past max', () => {
    let w = wallet(GARAGE[0]!.costs[0]);
    const a = buyUpgrade(w, 'engine');
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.level).toBe(1);
    expect(a.garage.engine).toBe(1);
    w = { ...w, money: 99999, garage: a.garage };
    let last = a;
    for (let i = 0; i < 5; i++) {
      const n = buyUpgrade({ ...w, money: 99999, garage: last.ok ? last.garage : w.garage }, 'engine');
      if (!n.ok) {
        expect(n.reason).toBe('max');
        expect(last.ok && last.garage.engine).toBe(3);
        return;
      }
      last = n;
    }
    throw new Error('should have hit max');
  });

  it('engine/armor/brakes change driving numbers', () => {
    expect(engineBonus({ engine: 2, armor: 0, brakes: 0 })).toBeCloseTo(2.8);
    expect(armoredHit(20, { engine: 0, armor: 2, brakes: 0 })).toBe(14);
    expect(armoredHit(0, { engine: 0, armor: 3, brakes: 0 })).toBe(0);
    expect(brakeMul({ engine: 0, armor: 0, brakes: 2 })).toBeCloseTo(1.3);
    expect(sirenRangeBonus({ engine: 0, armor: 0, brakes: 3 })).toBe(18);
  });
});

describe('mission board row', () => {
  it('shows reward when unlocked and a clear lock hint otherwise', () => {
    const open = missionBoardRow({ id: 2, title: 'x', reward: 2000, unlocked: 2, stars: 2 });
    expect(open.locked).toBe(false);
    expect(open.starText).toBe('★★☆');
    expect(open.hint).toMatch(/2,?000/);

    const next = missionBoardRow({ id: 3, title: 'y', reward: 2600, unlocked: 2, stars: 0 });
    expect(next.locked).toBe(true);
    expect(next.hint).toMatch(/خلّص المهمة 2/);
  });
});

describe('hub save clamps', () => {
  it('keeps pistol and drops junk weapon ids', () => {
    expect(sanitizeOwned(['smg', 'rocket', 'pistol'])).toEqual(['smg', 'pistol']);
    expect(sanitizeOwned(null)).toEqual(['pistol']);
  });
  it('clamps garage and money', () => {
    expect(sanitizeGarage({ engine: 9, armor: -1, brakes: 2 })).toEqual({ engine: 0, armor: 0, brakes: 2 });
    expect(sanitizeMoney(undefined)).toBe(START_MONEY);
    expect(sanitizeMoney(12.9)).toBe(12);
  });
});
