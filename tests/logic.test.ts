import { describe, it, expect } from 'vitest';
import { previewOdds, resolveOdds } from '../src/game/logic/odds';
import {
  starsFor,
  xpFor,
  rankForXp,
  dispatchReward,
  reputationDelta,
  injureChance,
  RANKS
} from '../src/game/logic/rewards';
import { addRewards, spend, promoteCost } from '../src/game/logic/economy';

const base = {
  preferredHits: 0,
  powerSum: 0,
  equipment: 0,
  successBonus: 0,
  techs: {},
  swatBonus: 0,
  breachOrSwat: false,
  labWithInvestigations: false
};

describe('success odds', () => {
  it('preview is clamped to [0.15, 0.92]', () => {
    expect(previewOdds({ successBonus: -5, equipment: 0, techs: {}, swatBonus: 0 })).toBe(0.15);
    expect(previewOdds({ successBonus: 5, equipment: 0, techs: {}, swatBonus: 0 })).toBe(0.92);
    expect(previewOdds({ successBonus: 0, equipment: 0, techs: {}, swatBonus: 0 })).toBeCloseTo(0.48);
  });
  it('techs raise the preview', () => {
    const a = previewOdds({ successBonus: 0, equipment: 0, techs: {}, swatBonus: 0 });
    const b = previewOdds({
      successBonus: 0,
      equipment: 0,
      techs: { cctv: true, heli: true, lab: true },
      swatBonus: 0
    });
    expect(b - a).toBeCloseTo(0.17);
  });
  it('preferred units and power raise resolve odds, capped at 0.97', () => {
    expect(resolveOdds(base)).toBeCloseTo(0.4);
    expect(resolveOdds({ ...base, preferredHits: 1 })).toBeCloseTo(0.56);
    expect(resolveOdds({ ...base, preferredHits: 10, breachOrSwat: true, swatBonus: 1 })).toBe(0.97);
  });
  it('quick resolve punishes sending no units', () => {
    expect(resolveOdds({ ...base, quick: true, unitCount: 0 })).toBeCloseTo(0.3);
    expect(resolveOdds({ ...base, quick: true, unitCount: 2 })).toBeCloseTo(0.5);
  });
});

describe('rewards', () => {
  it('stars by time', () => {
    expect(starsFor(30, [45, 80])).toBe(3);
    expect(starsFor(60, [45, 80])).toBe(2);
    expect(starsFor(200, [45, 80])).toBe(1);
  });
  it('xp: story pays more than patrol', () => {
    expect(xpFor(3, false)).toBe(250);
    expect(xpFor(3, true)).toBe(150);
  });
  it('rank thresholds', () => {
    expect(rankForXp(0).name).toBe(RANKS[0].name);
    expect(rankForXp(299).name).toBe(RANKS[0].name);
    expect(rankForXp(300).name).toBe(RANKS[1].name);
    expect(rankForXp(99999).name).toBe(RANKS[RANKS.length - 1].name);
  });
  it('dispatch money, reputation and injury', () => {
    expect(dispatchReward(true, 1000, 1.25)).toBe(1250);
    expect(dispatchReward(false, 1000, 2)).toBe(0);
    expect(reputationDelta(true, 7, 5)).toBe(7);
    expect(reputationDelta(false, 7, 5)).toBe(7);
    expect(reputationDelta(false, 7, 1)).toBe(2);
    expect(injureChance(true, 0.4, 0.5)).toBeCloseTo(0.2);
    expect(injureChance(false, undefined, 0.5)).toBe(0.2);
  });
});

describe('economy', () => {
  const w = { budget: 1000, reputation: 95, score: 0 };
  it('spend refuses when broke', () => {
    expect(spend(w, 2000)).toBeNull();
    expect(spend(w, 400)?.budget).toBe(600);
  });
  it('rewards add money and clamp reputation to 100', () => {
    const r = addRewards(w, 500, 10);
    expect(r).toEqual({ budget: 1500, reputation: 100, score: 1000 });
  });
  it('promotion cost grows with level', () => {
    expect(promoteCost(1)).toBe(550);
    expect(promoteCost(3)).toBe(850);
  });
});
