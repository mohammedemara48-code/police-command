/**
 * Port of Unity PoliceCommand.Core.GameManager
 * Starting resources match concept HUD: $125400 / 82★ / fuel 750 / supplies 900 / research 400
 */
import {
  Officer,
  PoliceUnit,
  UnitType,
  OfficerRank,
  GameState,
  xpForLevel,
  rankForLevel,
  clamp
} from './types';

const OFFICER_NAMES = [
  'النقيب أحمد',
  'الملازم سارة',
  'الرقيب خالد',
  'الرائد نورة',
  'المقدم فهد',
  'العريف ليلى',
  'النقيب يوسف',
  'الملازم مريم'
];

export class GameManager {
  state: GameState;
  officers: Officer[] = [];
  units: PoliceUnit[] = [];
  listeners = new Set<() => void>();
  log: string[] = [];

  constructor() {
    this.state = {
      budget: 125400,
      reputation: 82,
      fuel: 750,
      equipment: 900,
      labResources: 400,
      timeSec: 0,
      day: 1,
      score: 0,
      incidentsResolved: 0,
      incidentsFailed: 0,
      running: false,
      selectedIncidentId: null,
      alertLevel: 'MEDIUM'
    };
    this.seedOfficers();
    this.seedUnits();
    this.pushLog('نظام القيادة جاهز — المدينة تحت المراقبة');
  }

  private seedOfficers() {
    const specialties: UnitType[] = [
      UnitType.Patrol,
      UnitType.SWAT,
      UnitType.Investigations,
      UnitType.K9,
      UnitType.Patrol,
      UnitType.Unmarked,
      UnitType.SWAT,
      UnitType.Investigations
    ];
    this.officers = OFFICER_NAMES.map((name, i) => {
      const level = 1 + (i % 4);
      return {
        id: `off-${i + 1}`,
        name,
        rank: rankForLevel(level),
        level,
        xp: 10 * i,
        xpToNext: xpForLevel(level),
        specialty: specialties[i],
        status: 'idle' as const
      };
    });
  }

  private seedUnits() {
    const defs: Array<{
      type: UnitType;
      name: string;
      fuelCost: number;
      speed: number;
      power: number;
      readiness: number;
    }> = [
      { type: UnitType.Patrol, name: 'دورية ألفا', fuelCost: 25, speed: 18, power: 1, readiness: 100 },
      { type: UnitType.Patrol, name: 'دورية براڤو', fuelCost: 25, speed: 18, power: 1, readiness: 100 },
      { type: UnitType.Patrol, name: 'دورية تشارلي', fuelCost: 25, speed: 17, power: 1, readiness: 100 },
      { type: UnitType.SWAT, name: 'وحدة تكتيكية ١', fuelCost: 55, speed: 14, power: 2.4, readiness: 60 },
      { type: UnitType.Investigations, name: 'فريق تحقيقات', fuelCost: 30, speed: 12, power: 1.6, readiness: 100 },
      { type: UnitType.K9, name: 'وحدة الكلاب', fuelCost: 35, speed: 16, power: 1.8, readiness: 100 },
      { type: UnitType.Unmarked, name: 'سرية دلتا', fuelCost: 28, speed: 15, power: 1.3, readiness: 100 }
    ];
    this.units = defs.map((d, i) => ({
      id: `unit-${i + 1}`,
      type: d.type,
      name: d.name,
      fuelCost: d.fuelCost,
      speed: d.speed,
      power: d.power,
      available: true,
      assignedIncidentId: null,
      meshId: null,
      readiness: d.readiness
    }));
  }

  onChange(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) fn();
  }

  pushLog(msg: string) {
    const t = this.formatClock();
    this.log.unshift(`${t} ${msg}`);
    if (this.log.length > 40) this.log.length = 40;
  }

  formatClock() {
    const total = Math.floor(this.state.timeSec);
    const h = String(Math.floor(total / 3600) % 24).padStart(2, '0');
    const m = String(Math.floor((total % 3600) / 60).padStart(2, '0');
    const s = String(total % 60).padStart(2, '0');
    // concept uses 15:32 style — use shifted city clock
    const cityH = String((15 + Math.floor(total / 60)) % 24).padStart(2, '0');
    return `${cityH}:${m}:${s}`;
  }

  start() {
    this.state.running = true;
    this.pushLog('بدء الوردية — حالة التأهب: متوسطة');
    this.emit();
  }

  tick(dt: number) {
    if (!this.state.running) return;
    this.state.timeSec += dt;
    const dayLen = 180;
    const newDay = Math.floor(this.state.timeSec / dayLen) + 1;
    if (newDay !== this.state.day) {
      this.state.day = newDay;
      this.AddRewards(2500, 1);
      this.state.fuel = clamp(this.state.fuel + 80, 0, 2000);
      this.state.equipment = clamp(this.state.equipment + 40, 0, 2000);
      this.state.labResources = clamp(this.state.labResources + 20, 0, 2000);
      this.pushLog(`اليوم ${this.state.day} — دعم ميزانية يومي`);
      this.emit();
    }
    this.updateAlertLevel();
  }

  updateAlertLevel() {
    // set externally often; keep baseline from reputation + open pressure via caller
  }

  setAlertFromOpenCount(open: number) {
    if (open >= 4) this.state.alertLevel = 'CRITICAL';
    else if (open >= 3) this.state.alertLevel = 'HIGH';
    else if (open >= 1) this.state.alertLevel = 'MEDIUM';
    else this.state.alertLevel = 'LOW';
  }

  /** Unity: SpendBudget */
  SpendBudget(amount: number): boolean {
    if (this.state.budget < amount) return false;
    this.state.budget -= amount;
    this.emit();
    return true;
  }

  /** Unity: AddRewards */
  AddRewards(money: number, reputation = 0) {
    this.state.budget += money;
    this.state.reputation = clamp(this.state.reputation + reputation, 0, 100);
    this.state.score += money + reputation * 50;
    this.emit();
  }

  canAffordDispatch(unit: PoliceUnit): boolean {
    return unit.available && this.state.fuel >= unit.fuelCost && this.state.budget >= 50;
  }

  spendDispatch(unit: PoliceUnit) {
    this.state.fuel = Math.max(0, this.state.fuel - unit.fuelCost);
    this.SpendBudget(50);
    unit.available = false;
    unit.readiness = clamp(unit.readiness - 8, 20, 100);
    this.emit();
  }

  releaseUnit(unitId: string) {
    const u = this.units.find((x) => x.id === unitId);
    if (!u) return;
    u.available = true;
    u.assignedIncidentId = null;
    u.readiness = clamp(u.readiness + 5, 0, 100);
    this.emit();
  }

  applyMissionResult(opts: {
    success: boolean;
    reward: number;
    reputationDelta: number;
    officerIds: string[];
    severity: number;
  }) {
    if (opts.success) {
      this.AddRewards(opts.reward, opts.reputationDelta);
      this.state.incidentsResolved += 1;
      this.state.equipment = clamp(this.state.equipment + 5, 0, 2000);
      this.state.labResources = clamp(this.state.labResources + 3, 0, 2000);
      for (const id of opts.officerIds) this.AddOfficerXP(id, 25 + opts.severity * 12);
      this.pushLog(`نجاح العملية — +$${opts.reward}`);
    } else {
      this.state.reputation = clamp(this.state.reputation - Math.abs(opts.reputationDelta), 0, 100);
      this.state.score = Math.max(0, this.state.score - 30);
      this.state.incidentsFailed += 1;
      this.state.equipment = clamp(this.state.equipment - 10, 0, 2000);
      this.pushLog('فشل العملية — السمعة تأثرت');
    }
    this.emit();
  }

  /** Unity-style XP grant */
  AddOfficerXP(officerId: string, amount: number) {
    const o = this.officers.find((x) => x.id === officerId);
    if (!o) return;
    o.xp += amount;
    while (o.xp >= o.xpToNext) {
      o.xp -= o.xpToNext;
      o.level += 1;
      o.xpToNext = xpForLevel(o.level);
      o.rank = rankForLevel(o.level);
      this.pushLog(`ترقية: ${o.name} → المستوى ${o.level}`);
    }
  }

  promoteOfficer(officerId: string): boolean {
    const o = this.officers.find((x) => x.id === officerId);
    if (!o) return false;
    const cost = 400 + o.level * 150;
    if (!this.SpendBudget(cost)) return false;
    this.AddOfficerXP(officerId, o.xpToNext);
    return true;
  }

  refuel(cost = 800): boolean {
    if (!this.SpendBudget(cost)) return false;
    this.state.fuel = clamp(this.state.fuel + 150, 0, 2000);
    this.pushLog('إعادة تزويد الوقود');
    return true;
  }

  buyEquipment(cost = 1200): boolean {
    if (!this.SpendBudget(cost)) return false;
    this.state.equipment = clamp(this.state.equipment + 120, 0, 2000);
    this.pushLog('شراء مستلزمات');
    return true;
  }

  research(cost = 600): boolean {
    if (!this.SpendBudget(cost)) return false;
    this.state.labResources = clamp(this.state.labResources + 80, 0, 2000);
    this.pushLog('بحث تقني جديد');
    return true;
  }

  selectIncident(id: string | null) {
    this.state.selectedIncidentId = id;
    this.emit();
  }

  readinessByType(type: UnitType): number {
    const list = this.units.filter((u) => u.type === type);
    if (!list.length) return 0;
    return Math.round(list.reduce((s, u) => s + u.readiness, 0) / list.length);
  }
}
