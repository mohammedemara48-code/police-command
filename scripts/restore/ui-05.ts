          .map((l) => {
            const sp = l.indexOf(' ');
            return `<div><span class="ts">${l.slice(0, sp)}</span>${l.slice(sp)}</div>`;
          })
          .join('') || '<div>Surveillance current…</div>'}
      </div>
    `;
    box.querySelector('#cctv-x')!.addEventListener('click', () => {
      this.cctvOpen = false;
      this.render();
    });
    const canvas = box.querySelector('#cctv-canvas') as HTMLCanvasElement;
    this.cctvFeed = new CCTVFeed(canvas);
    const mode =
      inc.crimeType === CrimeType.BankRobbery || inc.crimeType === CrimeType.Hostage
        ? 'bank'
        : inc.crimeType === CrimeType.Chase
          ? 'chase'
          : 'generic';
    this.cctvFeed.setMode(mode);
    this.cctvFeed.start();
    return box;
  }

  private sheet() {
    const el = document.createElement('div');
    el.className = 'sheet glass';
    if (this.sheetTab === 'units') {
      el.innerHTML = `<h3>الوحدات المتخصصة</h3><div class="unit-grid"></div>`;
      const grid = el.querySelector('.unit-grid')!;
      for (const u of this.game.units) {
        const c = document.createElement('div');
        c.className = 'card';
        c.innerHTML = `<h4>${u.name}</h4>
          <p>${UNIT_LABELS[u.type]} · قوة ${u.power} · سرعة ${u.speed}</p>
          <div class="chips">
            <span class="chip ${u.available ? 'ok' : 'hot'}">${u.available ? 'متاحة' : 'مشغولة'}</span>
            <span class="chip warn">⛽ ${this.game.effectiveFuelCost(u)}</span>
            <span class="chip blue">${u.readiness}%</span>
          </div>
          <div class="bar"><i style="width:${u.readiness}%"></i></div>`;
        grid.appendChild(c);
      }
    } else if (this.sheetTab === 'officers') {
      el.innerHTML = `<h3>قائمة الضباط</h3><div class="officer-grid"></div>`;
      const grid = el.querySelector('.officer-grid')!;
      for (const o of this.game.officers) {
        const c = document.createElement('div');
        c.className = 'card';
        const pct = Math.round((o.xp / o.xpToNext) * 100);
        c.innerHTML = `<h4>${o.name}</h4>
          <p>${RANK_LABELS[o.rank]} · مستوى ${o.level} · ${UNIT_LABELS[o.specialty]}</p>
          <div class="chips"><span class="chip blue">XP ${o.xp}/${o.xpToNext}</span>
          <span class="chip ${o.status === 'idle' ? 'ok' : o.status === 'injured' ? 'hot' : 'warn'}">${o.status}</span></div>
          <div class="progress"><span style="width:${pct}%"></span></div>
          <div class="btn-row"><button class="btn ghost" data-promo>ترقية</button></div>`;
        c.querySelector('[data-promo]')!.addEventListener('click', () => {
          const ok = this.game.promoteOfficer(o.id);
          this.toast(ok ? `تمت ترقية ${o.name}` : 'لا يمكن الترقية الآن', ok ? 'success' : 'fail');
          this.render();
        });
        grid.appendChild(c);
      }
    } else if (this.sheetTab === 'investigations') {
      const closed = this.incidents.incidents.filter((i) => i.status === 'resolved' || i.status === 'failed');
      el.innerHTML = `<h3>التحقيقات والقضايا</h3>
        <p style="font-size:12px;color:var(--muted);margin-bottom:8px">محلول: ${this.game.state.incidentsResolved} · فاشل: ${this.game.state.incidentsFailed}</p>
        ${closed
          .slice(0, 8)
          .map(
            (i) =>
              `<div class="card"><h4>${i.title}</h4><p>${i.description}</p>
              <span class="chip ${i.status === 'resolved' ? 'ok' : 'hot'}">${i.status}</span></div>`
          )
          .join('') || '<div class="card"><p>لا قضايا مغلقة بعد.</p></div>'}`;
    } else if (this.sheetTab === 'buildings') {
      el.innerHTML = `<h3>المباني والترقيات</h3>
        <div class="card"><h4>مركز القيادة</h4><p>مهبط + هليكوبتر + صحن فضائي — نشط</p><span class="chip ok">LVL 1</span></div>
