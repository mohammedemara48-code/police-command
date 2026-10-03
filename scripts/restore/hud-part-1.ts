        sheet.innerHTML += `<div class="card"><p>لا بلاغات حالياً.</p></div>`;
      }
      for (const inc of open) {
        sheet.appendChild(this.incidentCard(inc, selected?.id === inc.id, true));
      }
      this.hud.appendChild(sheet);
    }

    // compact banner
    const ban = document.createElement('div');
    ban.className = `mobile-alert-banner ${this.game.state.alertLevel}`;
    ban.textContent = `التأهب: ${this.game.state.alertLevel}`;
    this.hud.appendChild(ban);
  }

  private bindTechTree(host: HTMLElement) {
    for (const t of this.game.techDefs) {
      const unlocked = this.game.state.techs[t.id] || t.unlocked;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `tech ${unlocked ? 'on' : 'lock'}`;
      el.title = `${t.label}: ${t.desc}${unlocked ? '' : ` — ${t.costBudget}$ / ${t.costResearch} بحث`}`;
      el.innerHTML = unlocked ? t.icon : '🔒';
      el.disabled = unlocked;
      el.addEventListener('click', () => {
        const res = this.game.unlockTech(t.id);
        this.toast(res.message, res.ok ? 'success' : 'fail');
        if (res.ok) audio.success();
        this.render();
      });
      host.appendChild(el);
    }
  }

  private readinessHTML() {
    const rows: Array<[string, UnitType]> = [
      ['الدوريات', UnitType.Patrol],
      ['التحقيقات', UnitType.Investigations],
      ['تكتيكي', UnitType.SWAT],
      ['الطب الشرعي', UnitType.Investigations],
      ['K9', UnitType.K9]
    ];
    return rows
      .map(([label, type], idx) => {
        let v = this.game.readinessByType(type);
        if (idx === 3) v = Math.min(100, v + 5);
        const warn = v < 70 ? 'warn' : '';
        return `<div class="readiness"><div class="row"><span>${label}</span><span>${v}%</span></div>
          <div class="bar ${warn}"><i style="width:${v}%"></i></div></div>`;
      })
      .join('');
  }

  private layout(): 'desktop' | 'landscape' | 'portrait' {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w >= 980 && h >= 620) return 'desktop';
    if (w > h) return 'landscape';
    return 'portrait';
  }

  private rotateGate() {
    const el = document.createElement('div');
    el.className = 'rotate-lock';
    el.innerHTML = `
      <div class="glass rotate-card">
        <div class="rotate-ico">📱</div>
        <h2>دوّر الموبايل بالعرض</h2>
        <p>اللعبة بتتلعب زي شاشة العمليات: المدينة في النص، والقرارات أزرار صغيرة تحت.</p>
      </div>`;
    return el;
  }

  private decisionDock(inc: Incident) {
    const box = document.createElement('div');
    box.className = 'decision-dock glass';
    const title = document.createElement('div');
    title.className = 'dock-title';
    title.textContent = `${inc.title} · ${inc.districtName}`;
    box.appendChild(title);
    const row = document.createElement('div');
    row.className = 'dock-btns';
    for (const d of inc.decisions) {
      const b = document.createElement('button');
      b.className = `btn dock-btn ${d.id}`;
      b.textContent = d.label;
      b.title = d.blurb;
      b.addEventListener('click', () => {
        void this.confirmDecision(inc, d);
      });
      row.appendChild(b);
    }
    box.appendChild(row);
    return box;
  }

  private actionCaption() {
    const el = document.createElement('div');
    el.className = 'action-caption glass';
    el.textContent = this.actionText || 'الوحدات في الطريق…';
    return el;
  }

  private resultDialog(r: MissionReport) {
    const el = document.createElement('div');
    el.className = `result-dialog glass ${r.success ? 'ok' : 'bad'}`;
    const money = `${r.money >= 0 ? '+' : ''}$${r.money.toLocaleString()}`;
    const rep = `${r.rep >= 0 ? '+' : ''}${r.rep}`;
    el.innerHTML = `
      <h3>${r.timedOut ? 'انتهى الوقت' : r.success ? 'نجحت العملية' : 'فشلت العملية'}</h3>
      <p class="result-where">${r.title} · ${r.decisionLabel} · ${r.districtName}</p>
      <p class="result-sum">${r.summary}</p>
      <div class="result-nums">
        <span>💵 ${money}</span>
        <span>⭐ ${rep}</span>
        <span>👮 ${r.officerLine}</span>
      </div>
      <button class="btn" data-next>الانتقال إلى ${this.nextPlaceName || 'الموقع التالي'}</button>
      <p class="result-hint">يتقفل لوحده بعد ثواني</p>
    `;
    el.querySelector('[data-next]')!.addEventListener('click', () => this.dismissResult());
    return el;
  }

  private showReport(report: MissionReport) {
    if (this.mode === 'action') return;
    if (this.mode === 'result') return;
    this.report = report;
    this.nextPlaceName = this.incidents.previewNextDistrict();
    this.mode = 'result';
    this.armResultTimer();
    this.render();
  }

  private armResultTimer() {
    if (this.resultTimer) clearTimeout(this.resultTimer);
    this.resultTimer = window.setTimeout(() => this.dismissResult(), 6000);
  }

  private stopGuns() {
    if (this.gunTimer) {
      clearInterval(this.gunTimer);
      this.gunTimer = null;
    }
  }

  private async confirmDecision(inc: Incident, d: DecisionChoice) {
    if (this.mode !== 'play') return;
    this.mode = 'action';
    this.sheetTab = null;
    this.decisionModalId = null;
    this.mobileAlertsOpen = false;
    this.actionText = 'الوحدات بتتحرك…';
    const armed = this.incidents.arm(inc.id, d.id);
    if (!armed.ok) {
      this.mode = 'play';
      this.toast(armed.message, 'fail');
      this.render();
      return;
    }
    this.actionText = armed.caption;
    this.render();
    this.city.syncIncidents(this.incidents.openIncidents);
    this.city.flyTo(armed.x, armed.z, true);
    this.city.beginAction(armed.heat as ActionHeat, armed.x, armed.z);
    this.stopGuns();
    if (armed.heat === 'hot') {
      audio.gunshot();
      this.gunTimer = window.setInterval(() => audio.gunshot(), 260);
    } else if (armed.heat === 'warm') {
      this.gunTimer = window.setInterval(() => audio.gunshot(), 520);
    }
    await new Promise((r) => setTimeout(r, 3200));
    this.stopGuns();
    this.city.endAction();
    const report = this.incidents.settle(inc.id);
    if (!report) {
      this.mode = 'play';
      this.render();
      return;
    }
    this.report = report;
    this.nextPlaceName = this.incidents.previewNextDistrict();
    this.mode = 'result';
    this.armResultTimer();
    this.render();
  }

  private dismissResult() {
    if (this.mode !== 'result') return;
    if (this.resultTimer) {
      clearTimeout(this.resultTimer);
      this.resultTimer = null;
    }
    this.mode = 'play';
    this.report = null;
    const next = this.incidents.spawnNext();
    if (next) {
      this.city.syncIncidents(this.incidents.openIncidents);
      this.city.flyTo(next.x, next.z, true);
      this.toast(`انتقلت إلى ${next.districtName}`, 'success');
    }
    this.render();
  }

  private decisionPanel(inc: Incident) {
    const box = document.createElement('div');
    box.className = 'decision-modal glass';
    box.innerHTML = `
      <h3>قرار مطلوب — ${inc.title}</h3>
      <p class="dec-desc">${inc.description}</p>
      <div class="dec-grid"></div>
      <button class="btn ghost" data-skip style="margin-top:8px;width:100%">لاحقاً</button>
    `;
    const grid = box.querySelector('.dec-grid')!;
    for (const d of inc.decisions) {
      grid.appendChild(this.decisionButton(inc, d));
    }
    box.querySelector('[data-skip]')!.addEventListener('click', () => {
      this.decisionModalId = null;
      this.render();
    });
    return box;
  }

  private decisionButton(inc: Incident, d: DecisionChoice) {
    const chance = Math.round(this.incidents.previewChance(inc, d) * 100);
    const risk = Math.round(d.riskToOfficers * 100);
    const reward = Math.round(inc.reward * d.rewardMul);
    const btn = document.createElement('button');
    btn.className = `dec-card ${d.id}`;
    btn.innerHTML = `
      <div class="dec-title">${d.label}</div>
      <div class="dec-blurb">${d.blurb}</div>
      <div class="dec-stats">
        <span class="chip ok">نجاح ~${chance}%</span>
        <span class="chip hot">خطر ضباط ${risk}%</span>
        <span class="chip warn">مكافأة $${reward}</span>
        <span class="chip blue">وقت ×${d.timeMul.toFixed(2)}</span>
      </div>
    `;
    btn.addEventListener('click', () => {
      const res = this.incidents.selectDecision(inc.id, d.id);
      this.toast(res.message, res.ok ? 'success' : 'fail');
      this.decisionModalId = null;
      this.city.focusOn(inc.x, inc.z);
      this.render();
    });
    return btn;
  }

  private incidentCard(inc: Incident, active: boolean, mobile: boolean) {
    const el = document.createElement('div');
    el.className = `card ${active ? 'active' : ''} sev-${inc.severity}`;
    const remain = Math.max(0, Math.ceil(inc.deadlineSec - (this.game.state.timeSec - inc.spawnedAt)));
    const urgent = remain <= 25 ? 'urgent' : '';
    const needsDecision = !inc.selectedDecision;
    el.innerHTML = `
      <h4>${inc.title}</h4>
      <p>${inc.description}</p>
      <div class="chips">
        <span class="chip hot">شدة ${inc.severity}</span>
        <span class="chip warn ${urgent}">${remain}ث</span>
        <span class="chip ok">$${inc.reward}</span>
        <span class="chip blue">${PHASE_LABELS[inc.phase]}</span>
        ${inc.selectedDecision ? `<span class="chip ok">${inc.decisions.find((d) => d.id === inc.selectedDecision)?.label || ''}</span>` : `<span class="chip hot">بانتظار قرار</span>`}
      </div>
      ${inc.progress > 0 ? `<div class="progress"><span style="width:${Math.round(inc.progress * 100)}%"></span></div>` : ''}
      <div class="btn-row dispatch-row" data-dispatch></div>
    `;
    el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      this.game.selectIncident(inc.id);
      this.city.flyTo(inc.x, inc.z, true);
      this.city.setSelectedIncident(inc.id);
      this.cctvOpen = inc.severity >= 4 || this.game.state.cctvUnlocked;
      if (needsDecision) this.decisionModalId = inc.id;
      this.render();
    });

    const row = el.querySelector('[data-dispatch]') as HTMLElement;
    if (needsDecision) {
      row.textContent = 'القرار من الأزرار تحت الخريطة';
      return el;
    }
    row.textContent = inc.status === 'resolving' ? 'العملية على الخريطة الآن' : PHASE_LABELS[inc.phase];
    return el;

    const preferred = new Set(inc.preferredUnits);
    const units = [...this.game.units].sort((a, b) => {
      const ap = preferred.has(a.type) ? 0 : 1;
      const bp = preferred.has(b.type) ? 0 : 1;
      return ap - bp;
    });
    // unique by type for cleaner mobile buttons, keep all on desktop if space
    const seen = new Set<UnitType>();
    for (const u of units) {
      if (mobile && seen.has(u.type)) continue;
      seen.add(u.type);
      const b = document.createElement('button');
      const cls =
        u.type === UnitType.SWAT
          ? 'swat'
          : u.type === UnitType.K9
            ? 'k9'
            : u.type === UnitType.Investigations
              ? 'invest'
              : u.type === UnitType.Unmarked
                ? 'ghost'
                : preferred.has(u.type)
                  ? ''
                  : 'ghost';
      b.className = `btn ${cls} ${mobile ? 'dispatch-lg' : ''}`;
      b.textContent = UNIT_LABELS[u.type];
      b.disabled = !u.available || !this.game.canAffordDispatch(u) || inc.status === 'resolved';
      b.title = `${u.name} · وقود ${this.game.effectiveFuelCost(u)}`;
      b.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const res = await this.incidents.DispatchUnitToIncident(inc.id, u.id);
        this.toast(res.message, res.ok ? 'success' : 'fail');
        if (res.ok) {
          this.city.focusOn(inc.x, inc.z);
        }
        this.render();
      });
      row.appendChild(b);
    }
    return el;
  }

  private cctvPopup(inc: Incident) {
    const box = document.createElement('div');
    box.className = 'cctv glass';
