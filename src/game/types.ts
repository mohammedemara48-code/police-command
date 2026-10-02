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

export type IncidentStatus = 'open' | 'dispatched' | 'resolving' | 'resolved' | 'failed';

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

/** Maps to Unity PoliceUnit */
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
}

export interface GameState {
  budget: number;
  reputation: number;
  fuel: number;
  equipment: number;
  labResources: number;
  timeSec: number;
  day: number;
  score: number;
  incidentsResolved: number;
  incidentsFailed: number;
  running: boolean;
  selectedIncidentId: string | null;
  alertLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
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
