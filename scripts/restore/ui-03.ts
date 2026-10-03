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

  private decisionPanel(inc: Incident) {
    const box = document.createElement('div');
    box.className = 'decision-modal glass';
    box.innerHTML = `
      <div class="dec-head">
        <h3>${inc.title}</h3>
        <button class="btn ghost dec-skip" data-skip type="button">لاحقاً</button>
      </div>
      <div class="dec-grid"></div>
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
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `dec-card ${d.id}`;
    btn.innerHTML = `
      <span class="dec-title">${d.label}</span>
      <span class="dec-mini">نجاح ${chance}% · خطر ${risk}%</span>
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
