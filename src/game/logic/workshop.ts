/**
 * Workshops (ورش) along the road: pay for repairs and upgrades, kept per vehicle (pure, unit-tested).
 * The effects are plain multipliers on the vehicle's handling preset, so they plug straight into `handlingOf`.
 */
import { toWorld, type LonLat } from './cairo';
import { net } from './roadnet';
import type { Handling, VehicleId } from './vehicles';
import { VEHICLES } from './vehicles';

export type UpgradeId = 'engine' | 'accel' | 'brakes' | 'armor' | 'comfort' | 'special';
export const UPGRADE_IDS: readonly UpgradeId[] = ['engine', 'accel', 'brakes', 'armor', 'comfort', 'special'];
export const MAX_LEVEL = 5;

export interface UpgradeInfo {
  id: UpgradeId;
  icon: string;
  name: string;
  /** what one level does, in words */
  blurb: string;
  /** price of level 1 for a reference vehicle (EGP) */
  base: number;
}

const COMMON: Record<Exclude<UpgradeId, 'special'>, UpgradeInfo> = {
  engine: { id: 'engine', icon: '🏎', name: 'موتور أقوى', blurb: 'سرعة قصوى +5% في كل مستوى', base: 150 },
  accel: { id: 'accel', icon: '⚡', name: 'تسارع', blurb: 'بتطلع بسرعة أكتر +6% في كل مستوى', base: 110 },
  brakes: { id: 'brakes', icon: '🛑', name: 'فرامل وتماسك', blurb: 'فرامل +7% وتماسك +3% في كل مستوى', base: 90 },
  armor: { id: 'armor', icon: '🛡', name: 'هيكل متين', blurb: 'الخبطات بتأذي أقل 10% في كل مستوى', base: 130 },
  comfort: { id: 'comfort', icon: '🛋', name: 'راحة الركاب', blurb: 'الركاب بيصبروا أكتر والبقشيش أحلى', base: 70 }
};

/** The upgrade that only one vehicle gets. */
const SPECIAL: Partial<Record<VehicleId, UpgradeInfo>> = {
  tuktuk: { id: 'special', icon: '🛞', name: 'جنوط عريضة وشاسيه', blurb: 'بيلف أسهل +4% في كل مستوى', base: 100 },
  microbus: {
    id: 'special',
    icon: '🧰',
    name: 'مساعدين وتعليق',
    blurb: 'الركاب بيحسوا بالمطبات أقل 10% في كل مستوى',
    base: 120
  },
  private: { id: 'special', icon: '🔧', name: 'ظبط الدركسيون', blurb: 'بيلف أسهل +3% في كل مستوى', base: 95 },
  police: { id: 'special', icon: '🔧', name: 'ظبط الدركسيون', blurb: 'بيلف أسهل +3% في كل مستوى', base: 95 }
};

/** What a vehicle's workshop sells, in menu order. */
export function catalogFor(v: VehicleId): UpgradeInfo[] {
  const sp = SPECIAL[v]!;
  return [COMMON.engine, COMMON.accel, COMMON.brakes, COMMON.armor, COMMON.comfort, sp];
}

/** Prices scale with the vehicle (a tuk-tuk part is cheaper than a microbus part). */
const PRICE_FACTOR: Record<VehicleId, number> = { tuktuk: 0.8, microbus: 1.3, private: 1.1, police: 1 };

export type Tuning = Record<UpgradeId, number>;
export const emptyTuning = (): Tuning => ({ engine: 0, accel: 0, brakes: 0, armor: 0, comfort: 0, special: 0 });
export type TuningBook = Record<VehicleId, Tuning>;
export const emptyBook = (): TuningBook => ({
  police: emptyTuning(),
  private: emptyTuning(),
  microbus: emptyTuning(),
  tuktuk: emptyTuning()
});

/** Price of the next level (EGP), or null at the top. Each level costs more than the last. */
export function priceOf(v: VehicleId, id: UpgradeId, level: number): number | null {
  if (level >= MAX_LEVEL) return null;
  const info = catalogFor(v).find((u) => u.id === id)!;
  return Math.round((info.base * PRICE_FACTOR[v] * (1 + level * 0.85)) / 10) * 10;
}

/** The vehicle's handling with its upgrades applied. */
export function tunedHandling(v: VehicleId, t: Tuning): Handling {
  const h = VEHICLES[v].handling;
  const agile = v === 'microbus' ? 0 : v === 'tuktuk' ? 0.04 : 0.03;
  return {
    top: h.top * (1 + 0.05 * t.engine),
    accel: h.accel * (1 + 0.06 * t.accel),
    brake: h.brake * (1 + 0.07 * t.brakes),
    grip: h.grip * (1 + 0.03 * t.brakes),
    steer: h.steer * (1 + agile * t.special),
    reverse: h.reverse
  };
}

/** Share of crash damage that still gets through. */
export const damageMul = (t: Tuning): number => 1 - 0.1 * t.armor;
/** Share of the riders' patience loss from lateness and harsh driving that still applies. */
export const patienceMul = (t: Tuning): number => 1 - 0.1 * t.comfort;
/** Tip multiplier for a comfortable car. */
export const tipMul = (t: Tuning): number => 1 + 0.06 * t.comfort;
/** Share of bumps and swerves the riders feel (microbus suspension). */
export const rideMul = (v: VehicleId, t: Tuning): number => (v === 'microbus' ? 1 - 0.1 * t.special : 1);

/** EGP per percent of damage. */
export const REPAIR_RATE: Record<VehicleId, number> = { tuktuk: 0.2, microbus: 0.4, private: 0.3, police: 0 };
export const repairCost = (v: VehicleId, damagePct: number): number =>
  Math.max(0, Math.ceil(Math.max(0, Math.min(100, damagePct)) * REPAIR_RATE[v] - 1e-9));

export type Purchase =
  { ok: true; wallet: number; tuning: Tuning; cost: number } | { ok: false; reason: 'max' | 'broke' };

/** Buy the next level of an upgrade. */
export function buyUpgrade(v: VehicleId, t: Tuning, id: UpgradeId, wallet: number): Purchase {
  const price = priceOf(v, id, t[id]);
  if (price === null) return { ok: false, reason: 'max' };
  if (wallet < price) return { ok: false, reason: 'broke' };
  return { ok: true, wallet: wallet - price, tuning: { ...t, [id]: t[id] + 1 }, cost: price };
}

/** Pay for the repair of `damagePct`. Returns what was fixed (a part, if the wallet is short). */
export function payRepair(
  v: VehicleId,
  damagePct: number,
  wallet: number
): { fixed: number; cost: number; wallet: number } {
  const rate = REPAIR_RATE[v];
  if (rate <= 0 || damagePct <= 0) return { fixed: 0, cost: 0, wallet };
  const full = repairCost(v, damagePct);
  if (wallet >= full) return { fixed: damagePct, cost: full, wallet: wallet - full };
  const fixed = Math.floor(wallet / rate);
  const cost = Math.max(0, Math.min(wallet, Math.ceil(fixed * rate - 1e-9)));
  return { fixed, cost, wallet: wallet - cost };
}

export function sanitizeTuning(raw: unknown): TuningBook {
  const out = emptyBook();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, Record<string, unknown> | undefined>;
  for (const v of Object.keys(out) as VehicleId[]) {
    const t = r[v];
    if (!t || typeof t !== 'object') continue;
    for (const id of UPGRADE_IDS) {
      const n = t[id];
      out[v][id] = typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(MAX_LEVEL, Math.floor(n))) : 0;
    }
  }
  return out;
}

// ---- where the workshops are

export interface Workshop {
  id: string;
  name: string;
  at: LonLat;
}

export const WORKSHOPS: readonly Workshop[] = [
  { id: 'w-haram', name: 'ورشة الهرم', at: [31.179, 30.0048] },
  { id: 'w-giza', name: 'ورشة الجيزة', at: [31.2038, 30.0012] },
  { id: 'w-dokki', name: 'ورشة الدقي', at: [31.2068, 30.0425] },
  { id: 'w-imbaba', name: 'ورشة إمبابة', at: [31.207, 30.0855] },
  { id: 'w-downtown', name: 'ورشة وسط البلد', at: [31.2425, 30.0425] },
  { id: 'w-shubra', name: 'ورشة شبرا', at: [31.2445, 30.0785] }
];

/** Within this distance (m) of the entrance and slower than this (m/s) the driver is "in" the workshop. */
export const WORKSHOP_RADIUS = 12;
export const WORKSHOP_SPEED = 9;

export interface WorkshopSpot {
  shop: Workshop;
  /** the road point to pull in at */
  x: number;
  z: number;
  /** where the garage front stands: the kerb beside it */
  px: number;
  pz: number;
  yaw: number;
}

let spots: WorkshopSpot[] | null = null;
/** Workshops placed on the street network: the nearest carriageway point and the pavement beside it. */
export function workshopSpots(): WorkshopSpot[] {
  if (spots) return spots;
  const N = net();
  spots = WORKSHOPS.map((shop) => {
    const w = toWorld(shop.at);
    const n = N.nearest(w.x, w.z, 600)!;
    const a = N.at(n.e, n.s);
    const side = n.e.half + 1.8;
    return {
      shop,
      x: n.x,
      z: n.z,
      px: n.x + Math.cos(a.yaw) * side,
      pz: n.z - Math.sin(a.yaw) * side,
      yaw: a.yaw
    };
  });
  return spots;
}

export const inWorkshop = (car: { x: number; z: number; speed: number }, s: { x: number; z: number }): boolean =>
  Math.hypot(car.x - s.x, car.z - s.z) <= WORKSHOP_RADIUS && Math.abs(car.speed) <= WORKSHOP_SPEED;
