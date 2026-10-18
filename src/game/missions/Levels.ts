/** Story campaign: 12 scripted missions (see docs/GAME_DESIGN.md; intro/outro cutscenes live in src/story/cutscenes.ts). Unlocks, stars, XP/rank saved locally (and synced when signed in). */
import type { Ambush } from '../logic/escort';
import { rankForXp, starsFor, xpFor } from '../logic/rewards';
import {
  START_MONEY,
  DEFAULT_GARAGE,
  DEFAULT_OWNED,
  sanitizeGarage,
  sanitizeOwned,
  sanitizeMoney,
  type GarageLevels
} from '../logic/hub';
import type { WeaponId } from '../logic/character';
import { DEFAULT_VEHICLE, sanitizeVehicle, type VehicleId } from '../logic/vehicles';
export type Who = 'mona' | 'hamed' | 'yasser' | 'suspect' | 'informant' | 'boss';
export interface Line {
  who: Who;
  text: string;
}
export type Behaviour = 'surrender' | 'flee' | 'fight';
export interface SuspectSpec {
  b: Behaviour;
  dx: number;
  dz: number;
  boss?: boolean;
}
export type Step =
  | { t: 'radio'; lines: Line[] }
  | { t: 'car'; text?: string }
  | { t: 'goto'; x: number; z: number; r?: number; text: string }
  | { t: 'chase'; speed: number; limit: number; then?: Behaviour; text?: string }
  | { t: 'pullover'; text: string; dui?: boolean }
  | { t: 'trap'; x: number; z: number; n: number; text: string }
  | { t: 'escort'; x: number; z: number; tx: number; tz: number; dest: string; ambush: Ambush[]; text: string }
  | { t: 'checkpoints'; pts: { x: number; z: number }[]; text: string }
  | { t: 'suspects'; x: number; z: number; list: SuspectSpec[]; hostage?: boolean; cover?: boolean; text: string };

export interface LevelDef {
  id: number;
  placeId: 'downtown' | 'port' | 'corniche' | 'suburb';
  title: string;
  brief: string;
  /** seconds for the whole scenario (after arrival) */
  limit: number;
  reward: number;
  rep: number;
  /** finish under these seconds for 3 / 2 stars */
  stars: [number, number];
  steps: Step[];
  /** true when the points are already on the open city (patrol calls); story levels are laid onto it by logic/places.ts */
  world?: boolean;
  // legacy fields still read by older code paths
  speed: number;
  kind?: 'gang';
  gang?: number;
}

const S = (b: Behaviour, dx: number, dz: number, boss = false): SuspectSpec => ({ b, dx, dz, boss });

export const LEVELS: LevelDef[] = [
  {
    id: 1,
    placeId: 'downtown',
    title: 'أول يوم',
    brief: 'أول دورية ليك. حرامي محلات في وسط البلد.',
    limit: 120,
    reward: 1500,
    rep: 4,
    stars: [45, 80],
    speed: 1,
    steps: [
      {
        t: 'radio',
        lines: [
          { who: 'mona', text: 'أهلاً يا ياسر، أنا الرقيب منى من غرفة العمليات. أول يوم ليك في الدورية.' },
          { who: 'mona', text: 'المدينة دي تحت سيطرة عصابة «العقرب». هنبدأ واحدة واحدة.' },
          { who: 'mona', text: 'بلاغ: حرامي سرق محل في وسط البلد. اركب الدورية واتبع الـGPS.' }
        ]
      },
      { t: 'car', text: 'اركب الدورية' },
      { t: 'goto', x: 0, z: 0, text: 'سوق لوسط البلد' },
      {
        t: 'radio',
        lines: [{ who: 'mona', text: 'المشتبه به قدامك. انزل، وجّه عليه واضغط «استسلم!» وبعدين قرّب وكلبشه.' }]
      },
      { t: 'suspects', x: 0, z: 6, list: [S('surrender', 3, 4)], text: 'اقبض على الحرامي' }
    ]
  },
  {
    id: 2,
    placeId: 'corniche',
    title: 'سرقة جارية',
    brief: 'اتنين بيسرقوا محل دهب في الدقي دلوقتي.',
    limit: 120,
    reward: 2000,
    rep: 5,
    stars: [50, 85],
    speed: 1,
    steps: [
      { t: 'radio', lines: [{ who: 'mona', text: 'سرقة جارية في الدقي! اتنين. واحد منهم ممكن يجري — متسيبوش.' }] },
      { t: 'car' },
      { t: 'goto', x: 0, z: 186, text: 'روح الدقي بسرعة' },
      { t: 'suspects', x: 0, z: 192, list: [S('surrender', -3, 2), S('flee', 3, 4)], text: 'اقبض على الحرامية الاتنين' }
    ]
  },
  {
    id: 3,
    placeId: 'port',
    title: 'مطاردة شبرا',
    brief: 'عربية مسروقة خارجة من شارع شبرا.',
    limit: 90,
    reward: 2600,
    rep: 6,
    stars: [35, 60],
    speed: 0.85,
    steps: [
      {
        t: 'radio',
        lines: [{ who: 'mona', text: 'عربية مسروقة طالعة من شارع شبرا. الحقها وقفّل عليها، وبعدين اقبض على السواق.' }]
      },
      { t: 'car' },
      { t: 'goto', x: 0, z: 92, text: 'روح شبرا' },
      { t: 'chase', speed: 0.85, limit: 45, then: 'surrender', text: 'الحق العربية السودا' }
    ]
  },
  {
    id: 4,
    placeId: 'port',
    title: 'شحنة مهربة',
    brief: 'رجالة العقرب بيحمّلوا سلاح في مخزن في شبرا.',
    limit: 150,
    reward: 3200,
    rep: 7,
    stars: [60, 100],
    speed: 1,
    steps: [
      {
        t: 'radio',
        lines: [{ who: 'hamed', text: 'السواق اعترف. فيه 3 مسلحين عند المخزن. اتحامى ورا الحاجات واضرب بحذر.' }]
      },
      { t: 'car' },
      { t: 'goto', x: 0, z: 96, text: 'روح المخزن في شبرا' },
      {
        t: 'suspects',
        x: 0,
        z: 110,
        cover: true,
        list: [S('fight', -4, 4), S('fight', 4, 8), S('fight', -2, 13)],
        text: 'حيّد المسلحين'
      }
    ]
  },
  {
    id: 5,
    placeId: 'downtown',
    title: 'اضرب واهرب',
    brief: 'عربية خبطت حد وهربت في وسط البلد.',
    limit: 100,
    reward: 3400,
    rep: 7,
    stars: [40, 70],
    speed: 0.95,
    steps: [
      { t: 'radio', lines: [{ who: 'mona', text: 'حادث وهروب في وسط البلد! السواق بيجري. الحقه.' }] },
      { t: 'car' },
      { t: 'goto', x: 0, z: -6, text: 'روح وسط البلد' },
      { t: 'chase', speed: 0.95, limit: 45, then: 'flee', text: 'الحق العربية' }
    ]
  },
  {
    id: 6,
    placeId: 'downtown',
    title: 'رهينة',
    brief: 'مسلحين ماسكين رهينة جنب البنك.',
    limit: 150,
    reward: 4200,
    rep: 9,
    stars: [50, 90],
    speed: 1,
    steps: [
      {
        t: 'radio',
        lines: [
          { who: 'hamed', text: 'رهينة جنب البنك. اتنين مسلحين. أي طلقة في الرهينة = فشل.' },
          { who: 'hamed', text: 'خليك هادي ونشّن كويس.' }
        ]
      },
      { t: 'car' },
      { t: 'goto', x: 0, z: 14, text: 'روح البنك' },
      {
        t: 'suspects',
        x: 0,
        z: 26,
        cover: true,
        hostage: true,
        list: [S('fight', -3, 2), S('fight', 3, 3)],
        text: 'حرّر الرهينة'
      }
    ]
  },
  {
    id: 7,
    placeId: 'corniche',
    title: 'ليلة كورنيش الجيزة',
    brief: 'عربية العقرب على كورنيش الجيزة.',
    limit: 140,
    reward: 4700,
    rep: 9,
    stars: [55, 95],
    speed: 1.15,
    steps: [
      { t: 'radio', lines: [{ who: 'mona', text: 'عربية العقرب على كورنيش الجيزة في الدقي، والركاب مسلحين.' }] },
      { t: 'car' },
      { t: 'goto', x: 0, z: 170, text: 'روح كورنيش الجيزة' },
      { t: 'chase', speed: 1.15, limit: 40, then: 'fight', text: 'الحق العربية' }
    ]
  },
  {
    id: 8,
    placeId: 'port',
    title: 'مخزن العقرب',
    brief: 'مخزن العصابة في شارع الخلفاوي.',
    limit: 160,
    reward: 5200,
    rep: 10,
    stars: [60, 110],
    speed: 1,
    steps: [
      {
        t: 'radio',
        lines: [{ who: 'hamed', text: 'لقينا مخزنهم في شارع الخلفاوي في شبرا. 4 جوه. واحد هيحاول يهرب.' }]
      },
      { t: 'car' },
      { t: 'goto', x: 60, z: 90, text: 'روح المخزن (شارع الخلفاوي)' },
      {
        t: 'suspects',
        x: 60,
        z: 104,
        cover: true,
        list: [S('fight', -3, 2), S('fight', 3, 6), S('fight', -2, 10), S('flee', 2, 12)],
        text: 'اقتحم المخزن'
      }
    ]
  },
  {
    id: 9,
    placeId: 'suburb',
    title: 'الواشي',
    brief: 'واشي هيدلّك على بيت المخدرات.',
    limit: 160,
    reward: 5600,
    rep: 10,
    stars: [60, 110],
    speed: 1,
    steps: [
      {
        t: 'radio',
        lines: [
          { who: 'informant', text: 'أنا مش عايز مشاكل… بيت المخدرات في الهرم. 4 رجالة، واحد فيهم خواف.' },
          { who: 'mona', text: 'اتأكد منه يا ياسر. ممكن يكون فخ.' }
        ]
      },
      { t: 'car' },
      { t: 'goto', x: 0, z: -62, text: 'روح الهرم' },
      {
        t: 'suspects',
        x: 0,
        z: -78,
        cover: true,
        list: [S('fight', -3, 0), S('fight', 3, -3), S('fight', -2, -7), S('surrender', 3, -9)],
        text: 'نضّف بيت المخدرات'
      }
    ]
  },
  {
    id: 10,
    placeId: 'downtown',
    title: 'طريق الهروب',
    brief: 'سواق الزعيم شايل الفلوس.',
    limit: 120,
    reward: 6200,
    rep: 11,
    stars: [40, 70],
    speed: 1.3,
    steps: [
      { t: 'radio', lines: [{ who: 'mona', text: 'سواق الزعيم شايل فلوس العصابة! أسرع عربية في المدينة.' }] },
      { t: 'car' },
      { t: 'goto', x: 0, z: -10, text: 'روح وسط البلد' },
      { t: 'chase', speed: 1.3, limit: 40, then: 'surrender', text: 'الحق سواق الزعيم' }
    ]
  },
  {
    id: 11,
    placeId: 'downtown',
    title: 'هجوم على القسم',
    brief: 'العصابة بتهاجم القسم.',
    limit: 180,
    reward: 7000,
    rep: 12,
    stars: [70, 120],
    speed: 1,
    steps: [
      { t: 'radio', lines: [{ who: 'hamed', text: 'القسم تحت الهجوم! 5 مسلحين قدام المبنى. ارجع بسرعة!' }] },
      { t: 'car' },
      { t: 'goto', x: 0, z: 34, text: 'ارجع للقسم' },
      {
        t: 'suspects',
        x: 0,
        z: 46,
        cover: true,
        list: [S('fight', -4, 0), S('fight', 4, 2), S('fight', -2, 6), S('fight', 3, 9), S('fight', 0, 12)],
        text: 'صد الهجوم'
      }
    ]
  },
  {
    id: 12,
    placeId: 'suburb',
    title: 'الزعيم',
    brief: 'فيلا الزعيم في الهرم. النهاية.',
    limit: 200,
    reward: 10000,
    rep: 20,
    stars: [80, 140],
    speed: 1,
    steps: [
      {
        t: 'radio',
        lines: [
          { who: 'hamed', text: 'دي اللحظة يا ياسر. الزعيم في الفيلا ومعاه 3 حرس.' },
          { who: 'boss', text: 'مستجد؟ بعتولي مستجد؟! تعالى يا شاطر.' }
        ]
      },
      { t: 'car' },
      { t: 'goto', x: 0, z: -80, text: 'روح فيلا الزعيم' },
      {
        t: 'suspects',
        x: 0,
        z: -92,
        cover: true,
        list: [S('fight', -4, 2), S('fight', 4, 0), S('fight', -2, -3), S('fight', 0, -6, true)],
        text: 'اقبض على الزعيم'
      }
    ]
  }
];

const KEY = 'pc.levels.v1';
export interface Progress {
  unlocked: number;
  stars: Record<number, number>;
  current: number;
  xp?: number;
  /** Street purse (mission payouts). Same dollars shown on the result card. */
  money: number;
  ownedWeapons: WeaponId[];
  garage: GarageLevels;
  /** which vehicle the officer drives */
  vehicle?: VehicleId;
}

function load(): Progress {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<Progress>;
    return {
      unlocked: 1,
      stars: {},
      current: 1,
      xp: 0,
      ...raw,
      money: sanitizeMoney(raw.money),
      ownedWeapons: sanitizeOwned(raw.ownedWeapons),
      garage: sanitizeGarage(raw.garage),
      vehicle: sanitizeVehicle(raw.vehicle)
    };
  } catch {
    return {
      unlocked: 1,
      stars: {},
      current: 1,
      xp: 0,
      money: START_MONEY,
      ownedWeapons: [...DEFAULT_OWNED],
      garage: { ...DEFAULT_GARAGE },
      vehicle: DEFAULT_VEHICLE
    };
  }
}

export const progress = load();
/** hook for the weekly leaderboard (set by UI to avoid an import cycle) */
let onMissionXp: (xp: number) => void = () => undefined;
export function setMissionXpHook(f: (xp: number) => void) {
  onMissionXp = f;
}
export function saveProgress() {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    /* ignore */
  }
}

/** procedurally generated patrol calls (ids ≥ 100), see Dispatch.ts */
export const patrolCalls = new Map<number, LevelDef>();
export const isPatrol = (id: number) => id >= 100;
export function levelById(id: number) {
  return patrolCalls.get(id) ?? LEVELS.find((l) => l.id === id) ?? LEVELS[0];
}

export { RANKS } from '../logic/rewards';
export function rank() {
  return rankForXp(progress.xp ?? 0);
}

/** Record a result; returns earned stars (0 on fail). Credits mission reward to the street purse. */
export function completeLevel(id: number, success: boolean, seconds: number) {
  if (!success) return 0;
  const l = levelById(id);
  const stars = starsFor(seconds, l.stars);
  progress.money = (progress.money ?? START_MONEY) + l.reward;
  if (isPatrol(id)) {
    progress.xp = (progress.xp ?? 0) + xpFor(stars, true);
    saveProgress();
    onMissionXp(xpFor(stars, true));
    return stars;
  }
  progress.stars[id] = Math.max(progress.stars[id] ?? 0, stars);
  progress.xp = (progress.xp ?? 0) + xpFor(stars, false);
  onMissionXp(xpFor(stars, false));
  if (id < LEVELS.length) progress.unlocked = Math.max(progress.unlocked, id + 1);
  progress.current = Math.min(LEVELS.length, id + 1);
  saveProgress();
  return stars;
}

/** Spend from the street purse; returns false when broke. */
export function spendMoney(amount: number): boolean {
  if (amount < 0 || (progress.money ?? 0) < amount) return false;
  progress.money -= amount;
  saveProgress();
  return true;
}

export function setOwnedWeapons(list: WeaponId[]) {
  progress.ownedWeapons = sanitizeOwned(list);
  saveProgress();
}

export function setVehicle(v: VehicleId) {
  progress.vehicle = sanitizeVehicle(v);
  saveProgress();
}

export function setGarage(g: GarageLevels) {
  progress.garage = sanitizeGarage(g);
  saveProgress();
}
