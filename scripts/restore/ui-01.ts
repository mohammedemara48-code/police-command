    if (s.alertLevel !== this.lastAlertLevel) {
      if (s.alertLevel === 'CRITICAL' || s.alertLevel === 'HIGH') audio.sirenSting();
      this.lastAlertLevel = s.alertLevel;
    }

    // preserve toast + stop old cctv
    this.cctvFeed?.stop();
    this.cctvFeed = null;
    this.hud.innerHTML = '';
    this.hud.appendChild(this.toastEl);

    this.hud.appendChild(this.buildTopbar(open.length));

    // Phone and desktop share the cinematic shell (alerts | city | ops).
    // Portrait phones get a rotate prompt instead of a sheet that covers the city.
    this.renderDesktop(open, selected);
    if (this.isPortraitPhone()) this.hud.appendChild(this.rotatePrompt());

    // Decision modal (both)
    const needDecision =
      selected &&
      (selected.status === 'awaiting_decision' || this.decisionModalId === selected.id) &&
      !selected.selectedDecision;
    if (needDecision && selected) {
      this.hud.appendChild(this.decisionPanel(selected));
    }

    // BOTTOM NAV
    this.hud.appendChild(this.buildNav());
    if (this.sheetTab) this.hud.appendChild(this.sheet());

    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = `سحب: دوران · عجلة: زوم · يوم ${s.day}`;
    this.hud.appendChild(hint);
  }

  private buildTopbar(openCount: number) {
    const s = this.game.state;
    const top = document.createElement('div');
    top.className = 'topbar';
    const phase = this.game.getDayPhase();
    const clock = this.game.formatClock();
    const phaseLabel = DAY_PHASE_LABELS[phase];
    const phaseIcon = DAY_PHASE_ICONS[phase];
    const clockHtml = `<div class="res clock phase-${phase}" title="توقيت المدينة"><span class="ico">${phaseIcon}</span><span class="clock-text">${clock}<small>${phaseLabel}</small></span></div>`;
    top.innerHTML = `
        <div class="brand">POLICE COMMAND</div>
        ${clockHtml}
        <div class="res money"><span class="ico">💵</span>$${s.budget.toLocaleString()}</div>
        <div class="res stars"><span class="ico">⭐</span>${s.reputation}</div>
        <div class="res alerts"><span class="ico">🚨</span>${openCount}</div>
        <div class="res fuel"><span class="ico">⛽</span>${Math.round(s.fuel)}</div>
        <div class="res sup"><span class="ico">📦</span>${Math.round(s.equipment)}</div>
        <div class="res lab"><span class="ico">🔬</span>${Math.round(s.labResources)}</div>
        <div class="alert-banner ${s.alertLevel}">CITY WIDE ALERT STATUS: ${s.alertLevel}</div>
      `;
    return top;
  }

  private rotatePrompt() {
    const el = document.createElement('div');
    el.className = 'rotate-lock';
    el.innerHTML = `
      <div class="rotate-card glass">
        <div class="rotate-ico" aria-hidden="true">📱</div>
        <h2>دوّر الموبايل بالعرض</h2>
        <p>الشاشة زي غرفة القيادة: تنبيهات يمين، المدينة في النص، العمليات شمال.</p>
      </div>
    `;
    return el;
  }

  private buildNav() {
    const nav = document.createElement('div');
    nav.className = 'bottom-nav glass';
    const items: Array<{ id: Tab; ico: string; label: string }> = [
      { id: 'units', ico: '🚓', label: 'الوحدات' },
      { id: 'officers', ico: '👮', label: 'الضباط' },
      { id: 'investigations', ico: '🔍', label: 'التحقيقات' },
      { id: 'buildings', ico: '🏢', label: 'المباني' },
      { id: 'analytics', ico: '📊', label: 'تحليلات' },
      { id: 'settings', ico: '⚙️', label: 'إعدادات' }
    ];
    for (const it of items) {
      const el = document.createElement('div');
      el.className = `nav-item ${this.sheetTab === it.id ? 'active' : ''}`;
      el.innerHTML = `<span class="ico">${it.ico}</span>${it.label}`;
      el.addEventListener('click', () => {
        this.sheetTab = this.sheetTab === it.id ? null : it.id;
        if (this.sheetTab) this.mobileAlertsOpen = false;
        this.render();
      });
