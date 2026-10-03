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
      this.city.focusOn(inc.x, inc.z);
      this.city.setSelectedIncident(inc.id);
      this.cctvOpen = inc.severity >= 4 || this.game.state.cctvUnlocked;
      if (needsDecision) this.decisionModalId = inc.id;
      this.render();
    });

    const row = el.querySelector('[data-dispatch]') as HTMLElement;
    if (needsDecision) {
      const decide = document.createElement('button');
      decide.className = 'btn danger';
      decide.textContent = 'اختر القرار';
      decide.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.game.selectIncident(inc.id);
        this.decisionModalId = inc.id;
        this.render();
      });
      row.appendChild(decide);
      return el;
    }

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
    const logs = this.game.log.slice(0, 4);
    box.innerHTML = `
      <h3>${inc.title} <button class="btn ghost" id="cctv-x" style="padding:2px 8px">✕</button></h3>
      <div class="cctv-feed">
        <canvas id="cctv-canvas"></canvas>
        <div class="rec">● REC SURVEILLANCE FEED</div>
      </div>
      <div class="dispatch-log">
        <div style="font-weight:800;margin-bottom:4px;color:#edf3ff">سجل الإرسال المباشر</div>
        ${logs
