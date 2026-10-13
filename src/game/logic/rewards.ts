/** Pure reward math: mission stars, XP and rank (no DOM, no three.js). */
export const RANKS = [
  { name: 'مستجد', xp: 0, mag: 12, dmg: 1, car: 0 },
  { name: 'شرطي', xp: 300, mag: 13, dmg: 1, car: 1 },
  { name: 'رقيب', xp: 800, mag: 15, dmg: 1.5, car: 2 },
  { name: 'ملازم', xp: 1600, mag: 15, dmg: 1.5, car: 3 },
  { name: 'نقيب', xp: 2800, mag: 17, dmg: 2, car: 4 },
  { name: 'رائد', xp: 4200, mag: 17, dmg: 2, car: 5 }
];
export type Rank = (typeof RANKS)[number];

export function rankForXp(xp: number): Rank {
  let r = RANKS[0];
  for (const k of RANKS) if (xp >= k.xp) r = k;
  return r;
}

/** 3 / 2 / 1 stars by finishing time against [threeStarSec, twoStarSec]. */
export function starsFor(seconds: number, thresholds: [number, number]): number {
  return seconds <= thresholds[0] ? 3 : seconds <= thresholds[1] ? 2 : 1;
}

export function xpFor(stars: number, patrol: boolean): number {
  return patrol ? 60 + 30 * stars : 100 + 50 * stars;
}

/** Money paid by a dispatch outcome. */
export function dispatchReward(success: boolean, baseReward: number, rewardMul = 1): number {
  return success ? Math.round(baseReward * rewardMul) : 0;
}

/** Reputation change after a dispatch outcome (positive gain on success, penalty size on failure). */
export function reputationDelta(success: boolean, gain: number, severity: number): number {
  return success ? gain : Math.max(2, Math.floor(severity * 1.5));
}

export function injureChance(success: boolean, risk: number | undefined, factor: number): number {
  return success ? (risk ?? 0) * factor : (risk ?? 0.2);
}
