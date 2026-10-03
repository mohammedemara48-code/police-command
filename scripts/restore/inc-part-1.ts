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

    const units = inc.assignedUnitIds
      .map((id) => this.game.units.find((u) => u.id === id))
      .filter(Boolean);
    const preferredHits = units.filter((u) => u && inc.preferredUnits.includes(u!.type)).length;
    const powerSum = units.reduce((s, u) => s + (u?.power || 0), 0);
    const choice = inc.decisions.find((d) => d.id === inc.selectedDecision);

    let chance = clamp(
      0.4 +
        preferredHits * 0.16 +
        powerSum * 0.07 +
        this.game.state.equipment / 4500 +
        (choice?.successBonus ?? 0) +
        (this.game.state.techs.cctv ? 0.08 : 0) +
        (this.game.state.techs.heli ? 0.05 : 0),
      0.15,
      0.96
    );
    if (inc.selectedDecision === 'breach' || units.some((u) => u?.type === UnitType.SWAT)) {
      chance = clamp(chance + this.game.state.swatBonus, 0.15, 0.97);
    }
    if (this.game.state.techs.lab && units.some((u) => u?.type === UnitType.Investigations)) {
      chance = clamp(chance + 0.1, 0.15, 0.97);
    }

    const success = Math.random() < chance;
    const officers = this.matchingOfficers(inc);
    const reward = success ? Math.round(inc.reward * (choice?.rewardMul ?? 1)) : 0;
    const injureChance = success ? (choice?.riskToOfficers ?? 0) * 0.35 : (choice?.riskToOfficers ?? 0.2);

    this.game.applyMissionResult({
      success,
      reward,
      reputationDelta: success ? inc.reputationDelta : Math.max(2, Math.floor(inc.severity * 1.5)),
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
      this.makeReport(inc, {
        success: false,
        money: 0,
        rep: -Math.max(2, Math.floor(inc.severity * 1.5)),
        officerLine: 'الوحدات ما لحقتش توصل'
      }, true, choice?.label || 'بدون قرار')
    );
  }

  /**
   * Decision click: lock the call, send the best free unit, and hand the
   * scene to the camera. Rewards wait until settle() after the action beat.
   */
  arm(incidentId: string, decisionId: DecisionId): {
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
      return { ok: false, message: 'القرار اتنفّذ خلاص', x: inc.x, z: inc.z, district: inc.districtName, heat: 'quiet', caption: '' };
    }
    const choice = inc.decisions.find((d) => d.id === decisionId);
    if (!choice) return { ok: false, message: 'قرار غير صالح', x: inc.x, z: inc.z, district: inc.districtName, heat: 'quiet', caption: '' };

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
      heat === 'quiet'
        ? `الوحدات وصلت ${inc.districtName} — تفاوض هادئ`
        : `تبادل إطلاق نار في ${inc.districtName}`;
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
    let chance = clamp(
      0.42 +
        preferredHits * 0.16 +
        powerSum * 0.07 +
        this.game.state.equipment / 4500 +
        (choice?.successBonus ?? 0) +
        (this.game.state.techs.cctv ? 0.08 : 0) +
        (this.game.state.techs.heli ? 0.05 : 0) +
        (units.length ? 0.08 : -0.12),
      0.18,
      0.94
    );
    if (inc.selectedDecision === 'breach' || units.some((u) => u.type === UnitType.SWAT)) {
      chance = clamp(chance + this.game.state.swatBonus, 0.18, 0.96);
    }
    const success = Math.random() < chance;
    const officers = this.matchingOfficers(inc);
    const reward = success ? Math.round(inc.reward * (choice?.rewardMul ?? 1)) : 0;
    const injureChance = success ? (choice?.riskToOfficers ?? 0) * 0.45 : choice?.riskToOfficers ?? 0.2;
    const outcome = this.game.applyMissionResult({
      success,
      reward,
      reputationDelta: success ? inc.reputationDelta : Math.max(2, Math.floor(inc.severity * 1.5)),
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

  private makeReport(
    inc: Incident,
    outcome: MissionOutcome,
    timedOut: boolean,
    decisionLabel: string
  ): MissionReport {
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
