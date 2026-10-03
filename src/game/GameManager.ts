/**
 * Port of Unity PoliceCommand.Core.GameManager
 * Starting resources match concept HUD: $125400 / 82★ / fuel 750 / supplies 900 / research 400
 */
import {
  Officer,
  PoliceUnit,
  UnitType,
  GameState,
  TechId,
  TechNode,
  DayPhase,
  MissionOutcome,
  phaseFromHour,
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

export const TECH_DEFS: TechNode[] = [
  {
    id: 'sirens',
    label: 'صافرات',
    icon: '🚨',
    costResearch: 0,
    costBudget: 0,
    desc: 'أساسي — تنبيهات صوتية',
    unlocked: true
  },
  {
    id: 'patrols',
    label: 'دوريات',
    icon: '🚓',
    costResearch: 0,
    costBudget: 0,
    desc: 'أساسي — أسطول دوريات',
    unlocked: true
  },
  {
    id: 'radar',
    label: 'رادار',
    icon: '📡',
    costResearch: 0,
    costBudget: 0,
    desc: 'أساسي — تغطية المدينة',
    unlocked: true
  },
  {
    id: 'armor',
    label: 'دروع',
    icon: '🛡️',
    costResearch: 0,
    costBudget: 0,
    desc: 'أساسي — حماية خفيفة',
    unlocked: true
  },
  {
    id: 'response',
    label: 'استجابة سريعة',
    icon: '⚡',
    costResearch: 60,
    costBudget: 1800,
    desc: 'تسريع وصول الوحدات 20%',
    unlocked: false,
    requires: ['patrols']
  },
  {
    id: 'fuel_eff',
    label: 'كفاءة وقود',
    icon: '⛽',
    costResearch: 50,
    costBudget: 1200,
    desc: 'خفض استهلاك الوقود 25%',
    unlocked: false,
    requires: ['patrols']
  },
  {
    id: 'cctv',
    label: 'شبكة كاميرات',
    icon: '📹',
    costResearch: 80,
    costBudget: 2200,
    desc: 'فتح بث CCTV لكل البلاغات + نجاح +8%',
    unlocked: false,
    requires: ['radar']
  },
  {
    id: 'swat_boost',
    label: 'تعزيز SWAT',
    icon: '🎯',
    costResearch: 100,
    costBudget: 3500,
    desc: 'نجاح الاقتحام +15%',
    unlocked: false,
    requires: ['armor']
  },
  {
    id: 'heli',
    label: 'دعم جوي',
    icon: '🚁',
    costResearch: 120,
    costBudget: 5000,
    desc: 'استجابة أسرع + نجاح عام +5%',
    unlocked: false,
    requires: ['response']
  },
  {
    id: 'lab',
    label: 'مختبر أدلة',
    icon: '🧪',
    costResearch: 90,
    costBudget: 2800,
    desc: 'مكافآت بحث أعلى ونجاح تحقيقات +10%',
    unlocked: false,
    requires: ['cctv']
  }
];

export class GameManager {
  state: GameState;
  officers: Officer[] = [];
  units: PoliceUnit[] = [];
  listeners = new Set<() => void>();
  log: string[] = [];
  techDefs = TECH_DEFS.map((t) => ({ ...t }));

  constructor() {
    const techs = {} as Record<TechId, boolean>;
    for (const t of this.techDefs) techs[t.id] = t.unlocked;
    this.state = {
      budget: 125400,
      reputation: 82,
      fuel: 750,
      equipment: 900,
      labResources: 400,
      timeSec: 0,
      day: 1,
      cityHour: 8.0,
      dayCycleSec: 600,
      score: 0,
      incidentsResolved: 0,
      incidentsFailed: 0,
      running: false,
      selectedIncidentId: null,
      alertLevel: 'MEDIUM',
      techs,
      cctvUnlocked: false,
      responseMul: 1,
      swatBonus: 0,
      fuelMul: 1,
      audioEnabled: true
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
    const h = Math.floor(this.state.cityHour) % 24;
    const m = Math.floor((this.state.cityHour % 1) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  getDayPhase(): DayPhase {
    return phaseFromHour(this.state.cityHour);
  }

  /** Jump lighting clock to a named phase (settings / debug). */
  setDayPhase(phase: DayPhase) {
    const map: Record<DayPhase, number> = {
      morning: 7.5,
      noon: 12.5,
      dusk: 17.5,
      night: 22.0
    };
    this.state.cityHour = map[phase];
    this.emit();
  }

  setCycleMinutes(minutes: number) {
    this.state.dayCycleSec = Math.max(120, minutes * 60);
    this.emit();
  }

  start() {
    this.state.running = true;
    this.pushLog('بدء الوردية — حالة التأهب: متوسطة');
    this.emit();
  }

  tick(dt: number) {
    if (!this.state.running) return;
    this.state.timeSec += dt;
    this.state.cityHour =
      (this.state.cityHour + (dt / Math.max(60, this.state.dayCycleSec)) * 24) % 24;

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
  }

  setAlertFromOpenCount(open: number, critical = 0) {
    if (critical >= 2 || open >= 4) this.state.alertLevel = 'CRITICAL';
    else if (critical >= 1 || open >= 3) this.state.alertLevel = 'HIGH';
    else if (open >= 1) this.state.alertLevel = 'MEDIUM';
    else this.state.alertLevel = 'LOW';
  }

  SpendBudget(amount: number): boolean {
    if (this.state.budget < amount) return false;
    this.state.budget -= amount;
    this.emit();
    return true;
  }

  AddRewards(money: number, reputation = 0) {
    this.state.budget += money;
    this.state.reputation = clamp(this.state.reputation + reputation, 0, 100);
    this.state.score += money + reputation * 50;
    this.emit();
  }

  effectiveFuelCost(unit: PoliceUnit): number {
    return Math.max(5, Math.round(unit.fuelCost * this.state.fuelMul));
  }

  canAffordDispatch(unit: PoliceUnit): boolean {
    return unit.available && this.state.fuel >= this.effectiveFuelCost(unit) && this.state.budget >= 50;
  }

  spendDispatch(unit: PoliceUnit) {
    this.state.fuel = Math.max(0, this.state.fuel - this.effectiveFuelCost(unit));
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
    injureChance?: number;
  }): MissionOutcome {
    const xp = 25 + opts.severity * 12;
    const involved = opts.officerIds
      .map((id) => this.officers.find((o) => o.id === id))
      .filter((o): o is Officer => !!o);
    const names = involved.map((o) => o.name);
    let officerLine = names.length ? names.join('، ') : 'لا ضباط في الميدان';
    if (opts.success) {
      this.AddRewards(opts.reward, opts.reputationDelta);
      this.state.incidentsResolved += 1;
      this.state.equipment = clamp(this.state.equipment + 5, 0, 2000);
      const labGain = this.state.techs.lab ? 8 : 3;
      this.state.labResources = clamp(this.state.labResources + labGain, 0, 2000);
      for (const id of opts.officerIds) this.AddOfficerXP(id, xp);
      officerLine = names.length ? `${names.join('، ')} +${xp} خبرة` : 'لا ضباط في الميدان';
      this.pushLog(`نجاح العملية — +$${opts.reward}`);
    } else {
      this.state.reputation = clamp(this.state.reputation - Math.abs(opts.reputationDelta), 0, 100);
      this.state.score = Math.max(0, this.state.score - 30);
      this.state.incidentsFailed += 1;
      this.state.equipment = clamp(this.state.equipment - 10, 0, 2000);
      officerLine = names.length ? `${names.join('، ')} — بلا ترقية` : 'لا ضباط في الميدان';
      this.pushLog('فشل العملية — السمعة تأثرت');
    }
    if (opts.injureChance && opts.injureChance > 0 && Math.random() < opts.injureChance) {
      const victim = involved[0] || this.officers[0];
      if (victim) {
        victim.status = 'injured';
        officerLine = `إصابة: ${victim.name} — خارج الخدمة مؤقتاً`;
        this.pushLog(`إصابة: ${victim.name} — خارج الخدمة مؤقتاً`);
        window.setTimeout(() => {
          if (victim.status === 'injured') victim.status = 'idle';
          this.emit();
        }, 25000);
      }
    }
    this.emit();
    return {
      success: opts.success,
      money: opts.success ? opts.reward : 0,
      rep: opts.success ? opts.reputationDelta : -Math.abs(opts.reputationDelta),
      officerLine
    };
  }

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

  canUnlockTech(id: TechId): { ok: boolean; reason: string } {
    const def = this.techDefs.find((t) => t.id === id);
    if (!def) return { ok: false, reason: 'تقنية غير موجودة' };
    if (def.unlocked || this.state.techs[id]) return { ok: false, reason: 'مفتوحة مسبقاً' };
    if (def.requires) {
      for (const r of def.requires) {
        if (!this.state.techs[r]) return { ok: false, reason: 'تحتاج تقنية سابقة' };
      }
    }
    if (this.state.labResources < def.costResearch) return { ok: false, reason: 'بحث غير كافٍ' };
    if (this.state.budget < def.costBudget) return { ok: false, reason: 'ميزانية غير كافية' };
    return { ok: true, reason: '' };
  }

  unlockTech(id: TechId): { ok: boolean; message: string } {
    const check = this.canUnlockTech(id);
    if (!check.ok) return { ok: false, message: check.reason };
    const def = this.techDefs.find((t) => t.id === id)!;
    this.state.labResources -= def.costResearch;
    if (!this.SpendBudget(def.costBudget)) return { ok: false, message: 'ميزانية غير كافية' };
    def.unlocked = true;
    this.state.techs[id] = true;
    this.applyTechEffects(id);
    this.pushLog(`تقنية مفتوحة: ${def.label}`);
    this.emit();
    return { ok: true, message: `تم فتح ${def.label}` };
  }

  private applyTechEffects(id: TechId) {
    if (id === 'response') this.state.responseMul = 1.2;
    if (id === 'fuel_eff') this.state.fuelMul = 0.75;
    if (id === 'cctv') this.state.cctvUnlocked = true;
    if (id === 'swat_boost') this.state.swatBonus = 0.15;
    if (id === 'heli') this.state.responseMul = Math.max(this.state.responseMul, 1.3);
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
