/** Precinct hub: armory prices, garage upgrades and mission-board helpers (pure, unit-tested). */
import type { WeaponId } from './character';
import { canAfford } from './economy';

/** Starter cash so the first purchase is a goal, not free. */
export const START_MONEY = 800;

/** Weapon shop prices. Pistol is the free starter; others scale vs early mission payouts (~1.5–5k). */
export const WEAPON_PRICE: Record<WeaponId, number> = {
  pistol: 0,
  revolver: 2200,
  smg: 4500
};

export type GarageId = 'engine' | 'armor' | 'brakes';

export interface GarageUpgrade {
  id: GarageId;
  name: string;
  desc: string;
  /** Cost for levels 1, 2, 3. */
  costs: [number, number, number];
  max: 3;
}

export const GARAGE: GarageUpgrade[] = [
  {
    id: 'engine',
    name: 'محرك أقوى',
    desc: 'سرعة قصوى أعلى',
    costs: [1500, 2800, 4200],
    max: 3
  },
  {
    id: 'armor',
    name: 'درع الدورية',
    desc: 'ضرر أقل من الخبطات',
    costs: [1200, 2400, 3800],
    max: 3
  },
  {
    id: 'brakes',
    name: 'فرامل رياضية',
    desc: 'توقف أسرع وسارينة أوضح',
    costs: [1000, 2000, 3200],
    max: 3
  }
];

export type GarageLevels = Record<GarageId, number>;

export const DEFAULT_GARAGE: GarageLevels = { engine: 0, armor: 0, brakes: 0 };

export interface HubWallet {
  money: number;
  ownedWeapons: WeaponId[];
  garage: GarageLevels;
}

export const DEFAULT_OWNED: WeaponId[] = ['pistol'];

/** Clamp garage levels and owned weapons from any save blob. */
export function sanitizeGarage(raw: unknown): GarageLevels {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const n = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 3 ? (v as number) : 0);
  return { engine: n(r.engine), armor: n(r.armor), brakes: n(r.brakes) };
}

export function sanitizeOwned(raw: unknown): WeaponId[] {
  const ids: WeaponId[] = ['pistol', 'revolver', 'smg'];
  const list = Array.isArray(raw)
    ? raw.filter((x): x is WeaponId => typeof x === 'string' && ids.includes(x as WeaponId))
    : [];
  return list.includes('pistol') ? [...new Set(list)] : ['pistol', ...list];
}

export function sanitizeMoney(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : START_MONEY;
}

export type BuyFail = 'broke' | 'owned' | 'max' | 'unknown';

export interface BuyOk {
  ok: true;
  money: number;
  ownedWeapons: WeaponId[];
  weapon: WeaponId;
}

export interface BuyNo {
  ok: false;
  reason: BuyFail;
  need?: number;
}

/** Buy (or re-buy is blocked) a weapon; equips it. Free pistol is always "owned". */
export function buyWeapon(w: HubWallet, id: WeaponId): BuyOk | BuyNo {
  if (!(id in WEAPON_PRICE)) return { ok: false, reason: 'unknown' };
  if (w.ownedWeapons.includes(id)) return { ok: false, reason: 'owned' };
  const price = WEAPON_PRICE[id];
  if (!canAfford(w.money, price)) return { ok: false, reason: 'broke', need: price - w.money };
  return {
    ok: true,
    money: w.money - price,
    ownedWeapons: [...w.ownedWeapons, id],
    weapon: id
  };
}

/** Equip an already-owned weapon (free). */
export function equipOwned(owned: WeaponId[], id: WeaponId): WeaponId | null {
  return owned.includes(id) ? id : null;
}

export interface UpOk {
  ok: true;
  money: number;
  garage: GarageLevels;
  level: number;
}

export interface UpNo {
  ok: false;
  reason: BuyFail;
  need?: number;
}

/** Buy the next garage upgrade level. */
export function buyUpgrade(w: HubWallet, id: GarageId): UpOk | UpNo {
  const def = GARAGE.find((g) => g.id === id);
  if (!def) return { ok: false, reason: 'unknown' };
  const cur = w.garage[id] ?? 0;
  if (cur >= def.max) return { ok: false, reason: 'max' };
  const price = def.costs[cur]!;
  if (!canAfford(w.money, price)) return { ok: false, reason: 'broke', need: price - w.money };
  return {
    ok: true,
    money: w.money - price,
    garage: { ...w.garage, [id]: cur + 1 },
    level: cur + 1
  };
}

/** Extra top-speed (m/s) from engine upgrades. */
export const engineBonus = (g: GarageLevels) => (g.engine ?? 0) * 1.4;

/** Incoming car-hit damage after armor plating (0–3 → up to ~45% less). */
export function armoredHit(rawDamage: number, g: GarageLevels) {
  const mul = 1 - 0.15 * Math.min(3, g.armor ?? 0);
  return Math.max(0, Math.round(rawDamage * mul));
}

/** Brake strength multiplier (1 at stock, up to 1.45). */
export const brakeMul = (g: GarageLevels) => 1 + 0.15 * Math.min(3, g.brakes ?? 0);

/** Siren pull-over range bonus (metres) from sport brakes / louder kit. */
export const sirenRangeBonus = (g: GarageLevels) => (g.brakes ?? 0) * 6;

/** Arabic reason when a purchase fails. */
export function buyFailAr(r: BuyFail, need = 0): string {
  if (r === 'broke') return `فلوسك مش كافية (ناقص $${need})`;
  if (r === 'owned') return 'عندك السلاح ده بالفعل';
  if (r === 'max') return 'وصلت لأقصى تحسين';
  return 'مش متاح';
}

/** Mission board row: lock state, stars and a short reward/gate hint. */
export function missionBoardRow(o: { id: number; title: string; reward: number; unlocked: number; stars: number }) {
  const locked = o.id > o.unlocked;
  const st = Math.max(0, Math.min(3, o.stars));
  return {
    locked,
    stars: st,
    starText: `${'★'.repeat(st)}${'☆'.repeat(3 - st)}`,
    hint: locked
      ? o.id === o.unlocked + 1
        ? `مقفولة · خلّص المهمة ${o.unlocked} الأول`
        : `مقفولة · رتبة المهام`
      : `مكافأة $${o.reward.toLocaleString()}`
  };
}
