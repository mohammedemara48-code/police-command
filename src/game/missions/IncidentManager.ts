/**
 * Port of Unity PoliceCommand.Core.IncidentManager
 * Decisions, multi-step criticals, longer tense timers
 */
import { GameManager } from '../core/GameManager';
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
} from '../core/types';
import { audio } from '../systems/AudioManager';
import { previewOdds, resolveOdds } from '../logic/odds';
import { dispatchReward, reputationDelta, injureChance as injureChanceFor } from '../logic/rewards';

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
        i.status === 'open' || i.status === 'awaiting_decision' || i.status === 'dispatched' || i.status === 'resolving'
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
    const poi = this.pois.find((p) => p.districtId === district.id) ||
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
    const st = this.game.state;
    inc.successChancePreview = previewOdds({
      successBonus: choice.successBonus,
      equipment: st.equipment,
      techs: st.techs,
      swatBonus: st.swatBonus
    });
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

  async DispatchUnitToIncident(incidentId: string, unitId: string): Promise<{ ok: boolean; message: string }> {
    const inc = this.incidents.find((i) => i.id === incidentId);
    const unit = this.game.units.find((u) => u.id === unitId);
    if (!inc || !unit) return { ok: false, message: 'بلاغ أو وحدة غير موجودة' };
    if (inc.status === 'resolved' || inc.status === 'failed') return { ok: false, message: 'البلاغ مغلق' };
    if (inc.status === 'awaiting_decision' || !inc.selectedDecision) {
      return { ok: false, message: 'اختر قراراً أولاً (تفاوض / اقتحام / حصار…)' };
    }
    if (!unit.available) return { ok: false, message: 'الوحدة مشغولة' };
    if (!this.game.canAffordDispatch(unit)) return { ok: false, message: 'وقود أو ميزانية غير كافية' };

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
      const resolveMs = clamp((14000 / Math.max(0.5, power * travelFactor)) * timeMul, 12000, 28000);
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
    return this.game.officers.filter((o) => o.status === 'busy').slice(0, Math.max(1, inc.assignedUnitIds.length));
  }

  private advanceOrFinish(incidentId: string) {
    const inc = this.incidents.find((i) => i.id === incidentId);
    if (!inc || inc.status === 'resolved' || inc.status === 'failed') return;
    this.resolveTimers.delete(incidentId);

    if (inc.multiStep && inc.stepIndex < inc.maxSteps - 1) {
      inc.stepIndex += 1;
      inc.phase = phaseFromDecision(inc.selectedDecision, inc.stepIndex, true);
      inc.progress = clamp(inc.stepIndex / inc.maxSteps, 0.15, 0.85);
      this.game.pushLog(`${inc.title}: مرحلة ${PHASE_LABELS[inc.phase]} (${inc.stepIndex + 1}/${inc.maxSteps})`);
      const choice = inc.decisions.find((d) => d.id === inc.selectedDecision);
      const timeMul = choice?.timeMul ?? 1;
      const nextMs = clamp(9000 * timeMul, 7000, 16000);
      this.scheduleStep(inc.id, nextMs);
      this.emit();
      this.game.emit();
      return;
    }

    this.finishResolve(incidentId);
  }

  private finishResolve(incidentId: string) {
    const inc = this.incidents.find((i) => i.id === incidentId);
    if (!inc || inc.status === 'resolved' || inc.status === 'failed') return;
    this.resolveTimers.delete(incidentId);

    const units = inc.assignedUnitIds.map((id) => this.game.units.find((u) => u.id === id)).filter(Boolean);
    const preferredHits = units.filter((u) => u && inc.preferredUnits.includes(u!.type)).length;
    const powerSum = units.reduce((s, u) => s + (u?.power || 0), 0);
    const choice = inc.decisions.find((d) => d.id === inc.selectedDecision);

    const chance = resolveOdds({
      preferredHits,
      powerSum,
      equipment: this.game.state.equipment,
      successBonus: choice?.successBonus ?? 0,
      techs: this.game.state.techs,
      swatBonus: this.game.state.swatBonus,
      breachOrSwat: inc.selectedDecision === 'breach' || units.some((u) => u?.type === UnitType.SWAT),
      labWithInvestigations: !!this.game.state.techs.lab && units.some((u) => u?.type === UnitType.Investigations)
    });
    const success = Math.random() < chance;
    const officers = this.matchingOfficers(inc);
    const reward = dispatchReward(success, inc.reward, choice?.rewardMul);
    const injureChance = injureChanceFor(success, choice?.riskToOfficers, 0.35);

    this.game.applyMissionResult({
      success,
      reward,
      reputationDelta: reputationDelta(success, inc.reputationDelta, inc.severity),
      officerIds: officers.map((o) => o.id),
      severity: inc.severity,
      injureChance
    });

    if (success) audio.success();
    else audio.fail();

    for (const o of officers) {
      if (o.status === 'busy') o.status = 'idle';
    }
    for (const id of [...inc.assignedUnitIds]) this.game.releaseUnit(id);

    inc.status = success ? 'resolved' : 'failed';
    inc.phase = 'done';
    inc.progress = 1;
    const critical = this.openIncidents.filter((i) => i.severity >= 4).length;
    this.game.setAlertFromOpenCount(this.openIncidents.length, critical);
    this.emit();
    this.game.emit();
  }

  private failIncident(inc: Incident) {
    if (inc.status === 'failed' || inc.status === 'resolved') return;
    const token = this.resolveTimers.get(inc.id);
    if (token) {
      clearTimeout(token);
      this.resolveTimers.delete(inc.id);
    }
    const officers = this.matchingOfficers(inc);
    for (const o of officers) o.status = 'idle';
    for (const id of [...inc.assignedUnitIds]) this.game.releaseUnit(id);
    this.game.applyMissionResult({
      success: false,
      reward: 0,
      reputationDelta: Math.max(2, Math.floor(inc.severity * 1.5)),
      officerIds: [],
      severity: inc.severity
    });
    audio.fail();
    inc.status = 'failed';
    inc.phase = 'done';
    this.game.pushLog(`فشل زمني: ${inc.title} — ${inc.districtName}`);
    const critical = this.openIncidents.filter((i) => i.severity >= 4).length;
    this.game.setAlertFromOpenCount(this.openIncidents.length, critical);
    this.holdAuto = true;
    this.emit();
    const choice = inc.decisions.find((d) => d.id === inc.selectedDecision);
    this.onReport?.(
      this.makeReport(
        inc,
        {
          success: false,
          money: 0,
          rep: -Math.max(2, Math.floor(inc.severity * 1.5)),
          officerLine: 'الوحدات ما لحقتش توصل'
        },
        true,
        choice?.label || 'بدون قرار'
      )
    );
  }

  /**
   * Decision click: lock the call, send the best free unit, and hand the
   * scene to the camera. Rewards wait until settle() after the action beat.
   */
  arm(
    incidentId: string,
    decisionId: DecisionId
  ): {
    ok: boolean;
    message: string;
    x: number;
    z: number;
    district: string;
    heat: 'hot' | 'warm' | 'quiet';
    caption: string;
  } {
    const inc = this.incidents.find((i) => i.id === incidentId);
    if (!inc) return { ok: false, message: 'بلاغ غير موجود', x: 0, z: 0, district: '', heat: 'quiet', caption: '' };
    if (inc.status === 'resolved' || inc.status === 'failed' || inc.status === 'resolving') {
      return {
        ok: false,
        message: 'القرار اتنفّذ خلاص',
        x: inc.x,
        z: inc.z,
        district: inc.districtName,
        heat: 'quiet',
        caption: ''
      };
    }
    const choice = inc.decisions.find((d) => d.id === decisionId);
    if (!choice)
      return {
        ok: false,
        message: 'قرار غير صالح',
        x: inc.x,
        z: inc.z,
        district: inc.districtName,
        heat: 'quiet',
        caption: ''
      };

    inc.selectedDecision = decisionId;
    inc.preferredUnits = [...choice.preferredUnits];
    inc.phase = phaseFromDecision(decisionId, 0, inc.multiStep);
    inc.status = 'resolving';
    inc.progress = 0.15;
    this.holdAuto = true;

    const unit =
      this.game.units.find(
        (u) => u.available && choice.preferredUnits.includes(u.type) && this.game.canAffordDispatch(u)
      ) || this.game.units.find((u) => u.available && this.game.canAffordDispatch(u));
    if (unit) {
      this.game.spendDispatch(unit);
      unit.assignedIncidentId = inc.id;
      if (!inc.assignedUnitIds.includes(unit.id)) inc.assignedUnitIds.push(unit.id);
      const officer =
        this.game.officers.find((o) => o.status === 'idle' && o.specialty === unit.type) ||
        this.game.officers.find((o) => o.status === 'idle');
      if (officer) officer.status = 'busy';
    }

    const heat = heatForDecision(decisionId);
    const caption =
      heat === 'quiet' ? `الوحدات وصلت ${inc.districtName} — تفاوض هادئ` : `تبادل إطلاق نار في ${inc.districtName}`;
    this.game.pushLog(`${choice.label} → ${inc.title} / ${inc.districtName}`);
    audio.click();
    if (heat === 'hot') audio.sirenSting();
    else audio.radio();
    this.emit();
    this.game.emit();
    return { ok: true, message: choice.label, x: inc.x, z: inc.z, district: inc.districtName, heat, caption };
  }

  /** Resolve the armed call now and build the Arabic result card. */
  settle(incidentId: string): MissionReport | null {
    const inc = this.incidents.find((i) => i.id === incidentId);
    if (!inc || inc.status === 'resolved' || inc.status === 'failed') return null;
    const token = this.resolveTimers.get(inc.id);
    if (token) {
      clearTimeout(token);
      this.resolveTimers.delete(inc.id);
    }
    const units = inc.assignedUnitIds
      .map((id) => this.game.units.find((u) => u.id === id))
      .filter((u): u is NonNullable<typeof u> => !!u);
    const preferredHits = units.filter((u) => inc.preferredUnits.includes(u.type)).length;
    const powerSum = units.reduce((s, u) => s + u.power, 0);
    const choice = inc.decisions.find((d) => d.id === inc.selectedDecision);
    const chance = resolveOdds({
      quick: true,
      unitCount: units.length,
      preferredHits,
      powerSum,
      equipment: this.game.state.equipment,
      successBonus: choice?.successBonus ?? 0,
      techs: this.game.state.techs,
      swatBonus: this.game.state.swatBonus,
      breachOrSwat: inc.selectedDecision === 'breach' || units.some((u) => u.type === UnitType.SWAT),
      labWithInvestigations: false
    });
    const success = Math.random() < chance;
    const officers = this.matchingOfficers(inc);
    const reward = dispatchReward(success, inc.reward, choice?.rewardMul);
    const injureChance = injureChanceFor(success, choice?.riskToOfficers, 0.45);
    const outcome = this.game.applyMissionResult({
      success,
      reward,
      reputationDelta: reputationDelta(success, inc.reputationDelta, inc.severity),
      officerIds: officers.map((o) => o.id),
      severity: inc.severity,
      injureChance
    });
    if (success) audio.success();
    else audio.fail();
    for (const o of officers) {
      if (o.status === 'busy') o.status = 'idle';
    }
    for (const id of [...inc.assignedUnitIds]) this.game.releaseUnit(id);
    inc.status = success ? 'resolved' : 'failed';
    inc.phase = 'done';
    inc.progress = 1;
    this.holdAuto = true;
    const critical = this.openIncidents.filter((i) => i.severity >= 4).length;
    this.game.setAlertFromOpenCount(this.openIncidents.length, critical);
    this.emit();
    return this.makeReport(inc, outcome, false, choice?.label || 'قرار');
  }

  private whenPhrase(phase: DayPhase): string {
    if (phase === 'night') return 'في الليل وتحت إنارة الشوارع';
    if (phase === 'dusk') return 'وقت الغروب والأضواء بتشتعل';
    if (phase === 'morning') return 'في الصباح والشوارع واضحة';
    return 'في وضح النهار';
  }

  private makeReport(inc: Incident, outcome: MissionOutcome, timedOut: boolean, decisionLabel: string): MissionReport {
    const where = inc.districtName || 'المدينة';
    const when = this.whenPhrase(this.game.getDayPhase());
    const id = inc.selectedDecision;
    let summary: string;
    if (timedOut) {
      summary = `انتهى الوقت في ${where} ${when}. البلاغ اتقفل قبل ما القرار يخلّص، والسمعة نزلت.`;
    } else if (outcome.success && (id === 'breach' || id === 'chase')) {
      summary = `الوحدات دخلت ${where} ${when}. تبادل إطلاق نار قصير، والمشتبه بهم اتقبض عليهم.`;
    } else if (!outcome.success && (id === 'breach' || id === 'chase')) {
      summary = `الاشتباك في ${where} ${when} كان أقوى من المتوقع. المشتبه بهم هربوا والعملية فشلت.`;
    } else if (outcome.success && id === 'negotiate') {
      summary = `التفاوض في ${where} ${when} خلّص بهدوء. تسليم من غير اشتباك كبير.`;
    } else if (!outcome.success && id === 'negotiate') {
      summary = `التفاوض في ${where} ${when} انهار. الوضع اتلخبط والمشتبه به فلت.`;
    } else if (outcome.success && id === 'siege') {
      summary = `الحصار على ${where} ${when} ضغط عليهم لحد ما استسلموا. في طلقات متفرقة بس المحيط ثبت.`;
    } else if (!outcome.success && id === 'siege') {
      summary = `الحصار في ${where} ${when} اتخرق. خرجوا من فتحة جانبية قبل ما الدائرة تقفل.`;
    } else if (outcome.success) {
      summary = `الفريق خلّص المهمة في ${where} ${when}. الوضع اتقفل والأدلة اتلمّت.`;
    } else {
      summary = `التدخل في ${where} ${when} ما ظبطش. البلاغ اتسجل فشل على الوردية.`;
    }
    return {
      success: outcome.success,
      timedOut,
      title: inc.title,
      districtName: where,
      decisionLabel,
      summary,
      money: outcome.money,
      rep: outcome.rep,
      officerLine: outcome.officerLine
    };
  }
}
