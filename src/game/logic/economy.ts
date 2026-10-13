/** Pure economy rules for the command-center budget (no DOM, no three.js). */
import { clamp } from './odds';

export interface Wallet {
  budget: number;
  reputation: number;
  score: number;
}

export function canAfford(budget: number, cost: number) {
  return budget >= cost;
}

/** Returns the new wallet after spending, or null when it can't be afforded. */
export function spend(w: Wallet, cost: number): Wallet | null {
  return canAfford(w.budget, cost) ? { ...w, budget: w.budget - cost } : null;
}

export function addRewards(w: Wallet, money: number, reputation = 0): Wallet {
  return {
    budget: w.budget + money,
    reputation: clamp(w.reputation + reputation, 0, 100),
    score: w.score + money + reputation * 50
  };
}

export const promoteCost = (officerLevel: number) => 400 + officerLevel * 150;
