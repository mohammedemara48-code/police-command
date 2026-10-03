/**
 * Port of Unity PoliceCommand.Core.IncidentManager
 * Decisions, multi-step criticals, longer tense timers
 */
import { GameManager } from './GameManager';
import {
  Incident,
  CrimeType,
  UnitType,
  ZoneType,
  CityPOI,
  DecisionId,
  DecisionChoice,
  IncidentPhase,
  DayPhase,
  MissionReport,
  MissionOutcome,
  DISTRICTS,
  DistrictDef,
  CRIME_LABELS,
  PHASE_LABELS,
  decisionsForCrime,
  heatForDecision,
  districtById,
  clamp
} from './types';
import { audio } from './AudioManager';

interface IncidentTemplate {
  crimeType: CrimeType;
  severity: 1 | 2 | 3 | 4 | 5;
  reward: number;
  reputationDelta: number;
  preferredUnits: UnitType[];
  deadlineSec: number;
  zones: ZoneType[];
  kinds: CityPOI['kind'][];
  descriptions: string[];
  multiStep: boolean;
  maxSteps: number;
}

const TEMPLATES: IncidentTemplate[] = [
  {
    crimeType: CrimeType.BankRobbery,
    severity: 5,
    reward: 4500,
    reputationDelta: 6,
    preferredUnits: [UnitType.SWAT, UnitType.Patrol],
    deadlineSec: 110,
    zones: [ZoneType.Bank],
    kinds: ['bank'],
    descriptions: [
      'مسلحون داخل البنك — رهائن محتملون. كاميرات المراقبة نشطة.',
      'إنذار صامت من البنك التجاري — سيارة هروب جاهزة.'
    ],
    multiStep: true,
    maxSteps: 3
  },
  {
    crimeType: CrimeType.Hostage,
    severity: 5,
    reward: 5200,
    reputationDelta: 8,
    preferredUnits: [UnitType.SWAT, UnitType.Patrol],
    deadlineSec: 120,
    zones: [ZoneType.Commercial, ZoneType.Residential],
    kinds: ['commercial', 'residential'],
    descriptions: ['مختطف يحتجز مدنيين.', 'تهديد رهينة في مجمع تجاري.'],
    multiStep: true,
    maxSteps: 3
  },
  {
    crimeType: CrimeType.Chase,
    severity: 3,
    reward: 1600,
    reputationDelta: 3,
    preferredUnits: [UnitType.Patrol, UnitType.K9],
    deadlineSec: 75,
    zones: [ZoneType.Street, ZoneType.Downtown],
    kinds: ['street', 'commercial'],
    descriptions: ['مطاردة عالية السرعة.', 'مركبة مسروقة تهرب عبر الأحياء.'],
    multiStep: false,
    maxSteps: 1
  },
  {
    crimeType: CrimeType.Assault,
    severity: 3,
    reward: 1200,
    reputationDelta: 2,
    preferredUnits: [UnitType.Patrol, UnitType.SWAT],
    deadlineSec: 80,
    zones: [ZoneType.Commercial, ZoneType.Residential, ZoneType.Street],
    kinds: ['commercial', 'residential', 'street'],
    descriptions: ['مشاجرة مسلحة.', 'اعتداء في ساحة عامة.'],
    multiStep: false,
    maxSteps: 1
  },
  {
    crimeType: CrimeType.Burglary,
    severity: 2,
    reward: 900,
    reputationDelta: 2,
    preferredUnits: [UnitType.Patrol, UnitType.Investigations],
    deadlineSec: 85,
    zones: [ZoneType.Residential],
    kinds: ['residential'],
    descriptions: ['اقتحام منزل — الجاني قد يكون في الموقع.', 'بلاغ سرقة من حي سكني.'],
    multiStep: false,
    maxSteps: 1
  },
  {
    crimeType: CrimeType.Drugs,
    severity: 4,
    reward: 2800,
    reputationDelta: 5,
    preferredUnits: [UnitType.K9, UnitType.Investigations, UnitType.SWAT],
    deadlineSec: 100,
    zones: [ZoneType.Industrial, ZoneType.Commercial],
    kinds: ['commercial', 'residential', 'street'],
    descriptions: ['شحنة مخدرات مشتبه بها.', 'تبادل مشبوه في زقاق خلفي.'],
    multiStep: true,
    maxSteps: 2
  },
  {
    crimeType: CrimeType.Theft,
    severity: 2,
    reward: 700,
    reputationDelta: 1,
    preferredUnits: [UnitType.Patrol, UnitType.Unmarked],
    deadlineSec: 70,
    zones: [ZoneType.Commercial, ZoneType.Downtown],
    kinds: ['commercial', 'street'],
    descriptions: ['سرقة متجر.', 'نشل في منطقة مزدحمة.'],
    multiStep: false,
    maxSteps: 1
  },
  {
    crimeType: CrimeType.Traffic,
    severity: 1,
    reward: 400,
    reputationDelta: 1,
    preferredUnits: [UnitType.Patrol],
    deadlineSec: 60,
    zones: [ZoneType.Street],
    kinds: ['street'],
    descriptions: ['حادث مروري مع إصابات خفيفة.', 'مركبة معطلة تعيق الطريق.'],
    multiStep: false,
    maxSteps: 1
  }
];

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function phaseFromDecision(d: DecisionId | null, step: number, multi: boolean): IncidentPhase {
  if (!d) return 'reported';
  if (d === 'negotiate') return 'negotiate';
  if (d === 'chase' || d === 'investigate') return step === 0 ? 'pursuit' : 'arrest';
  if (d === 'breach') return multi && step === 0 ? 'perimeter' : step === 1 ? 'breach' : 'arrest';
  if (d === 'siege') return step === 0 ? 'perimeter' : step >= 2 ? 'arrest' : 'breach';
  return 'reported';
}

export class IncidentManager {
  incidents: Incident[] = [];
  spawnTimer = 30;
  maxOpen = 1;
  listeners = new Set<() => void>();
  /** While a result dialog is up, do not pile another call. */
  holdAuto = false;
  lastDistrictId: string | null = null;
  private stagedDistrictId: string | null = null;
  private resolveTimers = new Map<string, number>();
  onCriticalSpawn?: (inc: Incident) => void;
  onReport?: (report: MissionReport) => void;

  constructor(
    private game: GameManager,
    private pois: CityPOI[]
  ) {}

  onChange(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) fn();
  }

  get openIncidents() {
    return this.incidents.filter(
      (i) =>
        i.status === 'open' ||
        i.status === 'awaiting_decision' ||
        i.status === 'dispatched' ||
        i.status === 'resolving'
    );
  }

  tick(dt: number) {
    if (!this.game.state.running) return;

    this.spawnTimer -= dt;
    if (!this.holdAuto && this.spawnTimer <= 0 && this.openIncidents.length < this.maxOpen) {
      this.SpawnIncident();
      this.spawnTimer = 25;
    }

    const critical = this.openIncidents.filter((i) => i.severity >= 4).length;
    this.game.setAlertFromOpenCount(this.openIncidents.length, critical);

    for (const inc of [...this.incidents]) {
      if (inc.status === 'open' || inc.status === 'awaiting_decision') {
        const age = this.game.state.timeSec - inc.spawnedAt;
        if (age >= inc.deadlineSec) this.failIncident(inc);
      } else if (inc.status === 'dispatched' || inc.status === 'resolving') {
        if (inc.resolveSpeed > 0) {
          inc.progress = clamp(inc.progress + dt * inc.resolveSpeed, 0, 0.95);
        }
        const age = this.game.state.timeSec - inc.spawnedAt;
        if (age >= inc.deadlineSec + 55) this.failIncident(inc);
      }
    }
  }

  private rollDistrict(exclude?: string | null): DistrictDef {
    const pool = DISTRICTS.filter((d) => d.id !== exclude);
    return pool[Math.floor(Math.random() * pool.length)] || DISTRICTS[0];
  }

  /** Name of the district the next call will move to (staged until spawn). */
  previewNextDistrict(): string {
    const d = this.rollDistrict(this.lastDistrictId);
    this.stagedDistrictId = d.id;
    return d.name;
  }

  spawnNext(): Incident | undefined {
    const id = this.stagedDistrictId || this.rollDistrict(this.lastDistrictId).id;
    this.stagedDistrictId = null;
    this.holdAuto = false;
    return this.SpawnIncident(undefined, id);
  }

  SpawnIncident(forced?: CrimeType, districtId?: string): Incident | undefined {
    const pool = forced ? TEMPLATES.filter((t) => t.crimeType === forced) : TEMPLATES;
    const t = pool[Math.floor(Math.random() * pool.length)] || TEMPLATES[0];
    const district = districtId ? districtById(districtId) : this.rollDistrict(this.lastDistrictId);
    this.lastDistrictId = district.id;
    const poi =
      this.pois.find((p) => p.districtId === district.id) ||
      this.pois[0] || {
        id: district.id,
        name: district.name,
        kind: 'street' as const,
        zone: district.zone,
        x: district.x,
        z: district.z,
        districtId: district.id
      };

    let x = district.x;
    let z = district.z;
    for (let attempt = 0; attempt < 6; attempt++) {
      const jx = (Math.random() - 0.5) * 10;
      const jz = (Math.random() - 0.5) * 10;
      x = district.x + jx;
      z = district.z + jz;
      const clash = this.openIncidents.some((o) => Math.hypot(o.x - x, o.z - z) < 7);
      if (!clash) break;
    }

    const decisions = decisionsForCrime(t.crimeType);
    const inc: Incident = {
      id: uid('inc'),
      crimeType: t.crimeType,
      title: CRIME_LABELS[t.crimeType],
      description: `${t.descriptions[Math.floor(Math.random() * t.descriptions.length)]} الموقع: ${district.name}.`,
      severity: t.severity,
      reward: t.reward + Math.floor(Math.random() * 400),
      reputationDelta: t.reputationDelta,
      preferredUnits: [...t.preferredUnits],
      zone: district.zone,
      poiId: poi.id,
      districtId: district.id,
      districtName: district.name,
      x,
      z,
      spawnedAt: this.game.state.timeSec,
      deadlineSec: t.deadlineSec,
      status: 'awaiting_decision',
      assignedUnitIds: [],
      progress: 0,
      resolveSpeed: 0,
      phase: 'reported',
      decisions,
      selectedDecision: null,
      multiStep: t.multiStep,
      stepIndex: 0,
      maxSteps: t.maxSteps,
      successChancePreview: 0.55
    };
    this.previewChance(inc, decisions[0]);

    this.incidents.unshift(inc);
    this.game.selectIncident(inc.id);
    this.game.pushLog(`${inc.title} — ${inc.districtName}`);
    const critical = this.openIncidents.filter((i) => i.severity >= 4).length;
    this.game.setAlertFromOpenCount(this.openIncidents.length, critical);
    if (inc.severity >= 4) {
      audio.sirenSting();
      this.onCriticalSpawn?.(inc);
    }
    this.emit();
    this.game.emit();
    return inc;
  }

  spawnTutorialBankRobbery() {
    return this.SpawnIncident(CrimeType.BankRobbery);
  }

  previewChance(inc: Incident, choice: DecisionChoice): number {
    let base = 0.48 + choice.successBonus + this.game.state.equipment / 5000;
    if (this.game.state.techs.cctv) base += 0.08;
    if (this.game.state.techs.heli) base += 0.05;
    if (this.game.state.techs.lab) base += 0.04;
    base += this.game.state.swatBonus * 0.5;
    inc.successChancePreview = clamp(base, 0.15, 0.92);
    return inc.successChancePreview;
  }

  selectDecision(incidentId: string, decisionId: DecisionId): { ok: boolean; message: string } {
    const inc = this.incidents.find((i) => i.id === incidentId);
    if (!inc) return { ok: false, message: 'بلاغ غير موجود' };
    if (inc.status !== 'awaiting_decision' && inc.status !== 'open') {
      return { ok: false, message: 'تم اختيار القرار مسبقاً' };
    }
    const choice = inc.decisions.find((d) => d.id === decisionId);
    if (!choice) return { ok: false, message: 'قرار غير صالح' };

    inc.selectedDecision = decisionId;
    inc.preferredUnits = [...choice.preferredUnits];
    inc.phase = phaseFromDecision(decisionId, 0, inc.multiStep);
    inc.status = 'open';
    this.previewChance(inc, choice);
    this.game.pushLog(`قرار: ${choice.label} → ${inc.title} (${PHASE_LABELS[inc.phase]})`);
    audio.click();
    this.emit();
    this.game.emit();
    return { ok: true, message: `تم اختيار: ${choice.label}` };
  }

  async DispatchUnitToIncident(
    incidentId: string,
    unitId: string
  ): Promise<{ ok: boolean; message: string }> {
    const inc = this.incidents.find((i) => i.id === incidentId);
    const unit = this.game.units.find((u) => u.id === unitId);
    if (!inc || !unit) return { ok: false, message: 'بلاغ أو وحدة غير موجودة' };
    if (inc.status === 'resolved' || inc.status === 'failed')
      return { ok: false, message: 'البلاغ مغلق' };
    if (inc.status === 'awaiting_decision' || !inc.selectedDecision) {
      return { ok: false, message: 'اختر قراراً أولاً (تفاوض / اقتحام / حصار…)' };
    }
    if (!unit.available) return { ok: false, message: 'الوحدة مشغولة' };
    if (!this.game.canAffordDispatch(unit))
      return { ok: false, message: 'وقود أو ميزانية غير كافية' };

    this.game.spendDispatch(unit);
    unit.assignedIncidentId = inc.id;
    if (!inc.assignedUnitIds.includes(unit.id)) inc.assignedUnitIds.push(unit.id);
    if (inc.status === 'open') inc.status = 'dispatched';

    const match = inc.preferredUnits.includes(unit.type) ? 1.4 : 0.8;
    const power = unit.power * match;
    const dist = Math.hypot(inc.x, inc.z);
    const travelFactor = clamp(1.2 - dist / 120, 0.45, 1.2) * this.game.state.responseMul;
    inc.resolveSpeed = Math.max(inc.resolveSpeed, 0.05 * power * travelFactor);

    const officer =
      this.game.officers.find((o) => o.status === 'idle' && o.specialty === unit.type) ||
      this.game.officers.find((o) => o.status === 'idle');
    if (officer) officer.status = 'busy';

    this.game.pushLog(`توجيه ${unit.name} → ${inc.title} [${PHASE_LABELS[inc.phase]}]`);
    audio.click();
    this.emit();
    this.game.emit();

    if (!this.resolveTimers.has(inc.id)) {
      const choice = inc.decisions.find((d) => d.id === inc.selectedDecision);
      const timeMul = choice?.timeMul ?? 1;
      const resolveMs = clamp(
        (14000 / Math.max(0.5, power * travelFactor)) * timeMul,
        12000,
        28000
      );
      this.scheduleStep(inc.id, resolveMs);
    }

    return { ok: true, message: `تم توجيه ${unit.name} إلى: ${inc.title}` };
  }

  dispatch(incidentId: string, unitId: string) {
    return this.DispatchUnitToIncident(incidentId, unitId);
  }

  private scheduleStep(incidentId: string, resolveMs: number) {
    const token = window.setTimeout(() => this.advanceOrFinish(incidentId), resolveMs);
    this.resolveTimers.set(incidentId, token);
    const inc = this.incidents.find((i) => i.id === incidentId);
    if (inc) {
      inc.status = 'resolving';
      const stepsLeft = Math.max(1, inc.maxSteps - inc.stepIndex);
      inc.resolveSpeed = 1 / ((resolveMs / 1000) * stepsLeft);
    }
  }

  private matchingOfficers(inc: Incident) {
    return this.game.officers
      .filter((o) => o.status === 'busy')
      .slice(0, Math.max(1, inc.assignedUnitIds.length));
  }

  private advanceOrFinish(incidentId: string) {
