/** Ported from Unity PoliceCommand.Core — TypeScript / Three.js */

export enum CrimeType {
  Theft = 'Theft',
  Assault = 'Assault',
  BankRobbery = 'BankRobbery',
  Hostage = 'Hostage',
  Chase = 'Chase',
  Drugs = 'Drugs',
  Burglary = 'Burglary',
  Traffic = 'Traffic'
}

export enum ZoneType {
  Residential = 'Residential',
  Commercial = 'Commercial',
  Industrial = 'Industrial',
  Downtown = 'Downtown',
  Bank = 'Bank',
  Street = 'Street',
  HQ = 'HQ'
}

export enum UnitType {
  Patrol = 'Patrol',
  SWAT = 'SWAT',
  Investigations = 'Investigations',
  K9 = 'K9',
  Unmarked = 'Unmarked'
}

export enum OfficerRank {
  Rookie = 'Rookie',
  Officer = 'Officer',
  Sergeant = 'Sergeant',
  Lieutenant = 'Lieutenant',
  Captain = 'Captain',
  Major = 'Major'
}

export type IncidentStatus =
  | 'open'
  | 'awaiting_decision'
  | 'dispatched'
  | 'resolving'
  | 'resolved'
  | 'failed';

export type IncidentPhase =
  | 'reported'
  | 'perimeter'
  | 'breach'
  | 'arrest'
  | 'pursuit'
  | 'negotiate'
  | 'done';

export type DecisionId = 'negotiate' | 'breach' | 'chase' | 'siege' | 'investigate';

export interface DecisionChoice {
  id: DecisionId;
  label: string;
  blurb: string;
  successBonus: number;
  riskToOfficers: number;
  rewardMul: number;
  timeMul: number;
  preferredUnits: UnitType[];
  phaseHint: string;
}

export interface Officer {
  id: string;
  name: string;
  rank: OfficerRank;
  level: number;
  xp: number;
  xpToNext: number;
  specialty: UnitType;
  status: 'idle' | 'busy' | 'injured';
}

export interface PoliceUnit {
  id: string;
  type: UnitType;
  name: string;
  fuelCost: number;
  speed: number;
  power: number;
  available: boolean;
  assignedIncidentId: string | null;
  meshId: string | null;
  readiness: number;
}

export interface CityPOI {
  id: string;
  name: string;
  kind: 'hq' | 'bank' | 'residential' | 'commercial' | 'street';
  zone: ZoneType;
  x: number;
  z: number;
}

export interface Incident {
  id: string;
  crimeType: CrimeType;
  title: string;
  description: string;
  severity: 1 | 2 | 3 | 4 | 5;
  reward: number;
  reputationDelta: number;
  preferredUnits: UnitType[];
  zone: ZoneType;
  poiId: string;
  x: number;
  z: number;
  spawnedAt: number;
  deadlineSec: number;
  status: IncidentStatus;
  assignedUnitIds: string[];
  progress: number;
  resolveSpeed: number;
  resolveToken?: number;
  phase: IncidentPhase;
  decisions: DecisionChoice[];
  selectedDecision: DecisionId | null;
  multiStep: boolean;
  stepIndex: number;
  maxSteps: number;
  successChancePreview: number;
}

export type TechId =
  | 'sirens'
  | 'patrols'
  | 'radar'
  | 'armor'
  | 'cctv'
  | 'heli'
  | 'lab'
  | 'fuel_eff'
  | 'swat_boost'
  | 'response';

export interface TechNode {
  id: TechId;
  label: string;
  icon: string;
  costResearch: number;
  costBudget: number;
  desc: string;
  unlocked: boolean;
  requires?: TechId[];
}

export type DayPhase = 'morning' | 'noon' | 'dusk' | 'night';

export const DAY_PHASE_LABELS: Record<DayPhase, string> = {
  morning: 'صباح',
  noon: 'ظهر',
  dusk: 'غروب',
  night: 'ليل'
};

export const DAY_PHASE_ICONS: Record<DayPhase, string> = {
  morning: '🌅',
  noon: '☀️',
  dusk: '🌇',
  night: '🌙'
};

/** Map 0–24 hour to Arabic phase label. */
export function phaseFromHour(hour: number): DayPhase {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 5 && h < 10) return 'morning';
  if (h >= 10 && h < 15) return 'noon';
  if (h >= 15 && h < 19) return 'dusk';
  return 'night';
}

export interface GameState {
  budget: number;
  reputation: number;
  fuel: number;
  equipment: number;
  labResources: number;
  timeSec: number;
  day: number;
  /** In-game city clock hours 0–24 (accelerated day/night cycle). */
  cityHour: number;
  /** Real seconds for a full 24h lighting cycle (~10 min default). */
  dayCycleSec: number;
  score: number;
  incidentsResolved: number;
  incidentsFailed: number;
  running: boolean;
  selectedIncidentId: string | null;
  alertLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  techs: Record<TechId, boolean>;
  cctvUnlocked: boolean;
  responseMul: number;
  swatBonus: number;
  fuelMul: number;
  audioEnabled: boolean;
}

export const UNIT_LABELS: Record<UnitType, string> = {
  [UnitType.Patrol]: 'دورية',
  [UnitType.SWAT]: 'تكتيكي / SWAT',
  [UnitType.Investigations]: 'تحقيقات',
  [UnitType.K9]: 'كلاب K9',
  [UnitType.Unmarked]: 'سريّة'
};

export const CRIME_LABELS: Record<CrimeType, string> = {
  [CrimeType.Theft]: 'سرقة',
  [CrimeType.Assault]: 'اعتداء',
  [CrimeType.BankRobbery]: 'سطو على بنك',
  [CrimeType.Hostage]: 'رهينة',
  [CrimeType.Chase]: 'مطاردة',
  [CrimeType.Drugs]: 'مخدرات',
  [CrimeType.Burglary]: 'سرقة منزل',
  [CrimeType.Traffic]: 'حادث مروري'
};

export const RANK_LABELS: Record<OfficerRank, string> = {
  [OfficerRank.Rookie]: 'مستجد',
  [OfficerRank.Officer]: 'شرطي',
  [OfficerRank.Sergeant]: 'رقيب',
  [OfficerRank.Lieutenant]: 'ملازم',
  [OfficerRank.Captain]: 'نقيب',
  [OfficerRank.Major]: 'رائد'
};

export const PHASE_LABELS: Record<IncidentPhase, string> = {
  reported: 'بلاغ وارد',
  perimeter: 'تأمين المحيط',
  breach: 'اقتحام',
  arrest: 'اعتقال',
  pursuit: 'مطاردة جارية',
  negotiate: 'تفاوض',
  done: 'منتهٍ'
};

export function xpForLevel(level: number): number {
  return 80 + level * 40;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function rankForLevel(level: number): OfficerRank {
  if (level >= 8) return OfficerRank.Major;
  if (level >= 6) return OfficerRank.Captain;
  if (level >= 4) return OfficerRank.Lieutenant;
  if (level >= 3) return OfficerRank.Sergeant;
  if (level >= 2) return OfficerRank.Officer;
  return OfficerRank.Rookie;
}

export function decisionsForCrime(crime: CrimeType): DecisionChoice[] {
  switch (crime) {
    case CrimeType.BankRobbery:
    case CrimeType.Hostage:
      return [
        {
          id: 'negotiate',
          label: 'تفاوض',
          blurb: 'أبطأ وأكثر أماناً للضباط — مكافأة أقل',
          successBonus: 0.18,
          riskToOfficers: 0.12,
          rewardMul: 0.75,
          timeMul: 1.35,
          preferredUnits: [UnitType.Investigations, UnitType.Patrol],
          phaseHint: 'تفاوض'
        },
        {
          id: 'breach',
          label: 'اقتحام',
          blurb: 'خطر عالي ومكافأة أعلى — يحتاج SWAT',
          successBonus: -0.05,
          riskToOfficers: 0.42,
          rewardMul: 1.35,
          timeMul: 0.85,
          preferredUnits: [UnitType.SWAT, UnitType.Patrol],
          phaseHint: 'اقتحام'
        },
        {
          id: 'siege',
          label: 'حصار',
          blurb: 'تأمين المحيط ثم ضغط تدريجي',
          successBonus: 0.08,
          riskToOfficers: 0.22,
          rewardMul: 1.0,
          timeMul: 1.15,
          preferredUnits: [UnitType.SWAT, UnitType.Patrol, UnitType.K9],
          phaseHint: 'تأمين المحيط'
        }
      ];
    case CrimeType.Chase:
      return [
        {
          id: 'chase',
          label: 'مطاردة',
          blurb: 'سرعة عالية — خطر حوادث',
          successBonus: 0.02,
          riskToOfficers: 0.35,
          rewardMul: 1.2,
          timeMul: 0.8,
          preferredUnits: [UnitType.Patrol, UnitType.K9],
          phaseHint: 'مطاردة جارية'
        },
        {
          id: 'siege',
          label: 'حصار طرق',
          blurb: 'إغلاق مخارج الحي — أبطأ لكن أوفر',
          successBonus: 0.15,
          riskToOfficers: 0.15,
          rewardMul: 0.9,
          timeMul: 1.2,
          preferredUnits: [UnitType.Patrol, UnitType.Unmarked],
          phaseHint: 'تأمين المحيط'
        },
        {
          id: 'investigate',
          label: 'تتبع هادئ',
          blurb: 'سرية بدون صافرات — نجاح متوسط',
          successBonus: 0.05,
          riskToOfficers: 0.18,
          rewardMul: 1.05,
          timeMul: 1.1,
          preferredUnits: [UnitType.Unmarked, UnitType.Investigations],
          phaseHint: 'مطاردة جارية'
        }
      ];
    default:
      return [
        {
          id: 'investigate',
          label: 'تحقيق ميداني',
          blurb: 'جمع أدلة بهدوء',
          successBonus: 0.12,
          riskToOfficers: 0.1,
          rewardMul: 0.95,
          timeMul: 1.15,
          preferredUnits: [UnitType.Investigations, UnitType.Patrol],
          phaseHint: 'بلاغ وارد'
        },
        {
          id: 'breach',
          label: 'تدخل فوري',
          blurb: 'سرعة أعلى وخطر أكبر',
          successBonus: -0.02,
          riskToOfficers: 0.28,
          rewardMul: 1.2,
          timeMul: 0.9,
          preferredUnits: [UnitType.Patrol, UnitType.SWAT],
          phaseHint: 'اقتحام'
        },
        {
          id: 'siege',
          label: 'تأمين المنطقة',
          blurb: 'إغلاق المحيط ثم دخول',
          successBonus: 0.08,
          riskToOfficers: 0.16,
          rewardMul: 1.0,
          timeMul: 1.1,
          preferredUnits: [UnitType.Patrol, UnitType.K9],
          phaseHint: 'تأمين المحيط'
        }
      ];
  }
}
