      nav.appendChild(el);
    }
    return nav;
  }

  private renderDesktop(open: Incident[], selected: Incident | null) {
    const s = this.game.state;
    const left = document.createElement('div');
    left.className = 'panel-left glass';
    left.innerHTML = `<div class="panel-h">تنبيهات نشطة <span class="chip hot">${open.length}</span></div>`;
    if (!open.length) {
      left.innerHTML += `<div class="card"><p>لا بلاغات حالياً — المدينة هادئة نسبياً.</p></div>`;
    }
    for (const inc of open) {
      left.appendChild(this.incidentCard(inc, selected?.id === inc.id, false));
    }

    // unit readiness strip
    left.innerHTML += `<div class="panel-h">جاهزية الوحدات</div>`;
    const readyWrap = document.createElement('div');
    readyWrap.className = 'unit-ready-list';
    for (const u of this.game.units) {
      const row = document.createElement('div');
      row.className = `uready ${u.available ? '' : 'busy'} ${u.readiness < 70 ? 'warn' : ''}`;
      row.innerHTML = `<span>${UNIT_LABELS[u.type]}</span><span>${u.readiness}%</span>`;
      readyWrap.appendChild(row);
    }
    left.appendChild(readyWrap);
    this.hud.appendChild(left);

    const right = document.createElement('div');
    right.className = 'panel-right glass';
    right.innerHTML = `
      <div class="panel-h">مركز العمليات</div>
      ${this.readinessHTML()}
      <div class="panel-h">تقنية الشرطة</div>
      <div class="tech-tree" data-tech></div>
      <div class="btn-row" style="margin-top:8px">
        <button class="btn ghost" data-act="refuel">تزويد وقود</button>
        <button class="btn ghost" data-act="sup">مستلزمات</button>
        <button class="btn ghost" data-act="lab">بحث</button>
      </div>
      <div class="panel-h">سجل العمليات</div>
      <div class="log-feed">${this.game.log
        .slice(0, 10)
        .map((l) => {
          const sp = l.indexOf(' ');
          return `<div><span class="ts">${l.slice(0, sp)}</span>${l.slice(sp)}</div>`;
        })
        .join('')}</div>
    `;
    this.bindTechTree(right.querySelector('[data-tech]')!);
    right.querySelector('[data-act="refuel"]')!.addEventListener('click', () => {
      const ok = this.game.refuel();
      this.toast(ok ? 'تم تزويد الوقود' : 'ميزانية غير كافية', ok ? 'success' : 'fail');
    });
    right.querySelector('[data-act="sup"]')!.addEventListener('click', () => {
      const ok = this.game.buyEquipment();
      this.toast(ok ? 'تم شراء مستلزمات' : 'ميزانية غير كافية', ok ? 'success' : 'fail');
    });
    right.querySelector('[data-act="lab"]')!.addEventListener('click', () => {
      const ok = this.game.research();
      this.toast(ok ? 'تقدم بحثي' : 'ميزانية غير كافية', ok ? 'success' : 'fail');
    });
    this.hud.appendChild(right);

    if (this.cctvOpen && selected && (selected.severity >= 4 || s.cctvUnlocked)) {
      this.hud.appendChild(this.cctvPopup(selected));
    }
  }

  private renderMobile(open: Incident[], selected: Incident | null) {
    // floating toggle for alerts
    const toggle = document.createElement('button');
    toggle.className = 'mobile-alerts-toggle btn';
    toggle.textContent = this.mobileAlertsOpen ? 'إخفاء التنبيهات' : `تنبيهات نشطة (${open.length})`;
    toggle.addEventListener('click', () => {
      this.mobileAlertsOpen = !this.mobileAlertsOpen;
      this.render();
    });
    this.hud.appendChild(toggle);

    if (this.mobileAlertsOpen && !this.sheetTab) {
      const sheet = document.createElement('div');
      sheet.className = 'mobile-alerts glass';
      sheet.innerHTML = `<div class="panel-h">تنبيهات نشطة <span class="chip hot">${open.length}</span></div>`;
      if (!open.length) {
        sheet.innerHTML += `<div class="card"><p>لا بلاغات حالياً.</p></div>`;
      }
      for (const inc of open) {
