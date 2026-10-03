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
        <div class="card"><h4>موقف الدوريات</h4><p>سعة الأسطول الحالية</p><span class="chip blue">6 مركبات</span></div>
        <div class="card"><h4>شجرة التقنيات</h4><p>افتح تقنيات من لوحة العمليات (ديسكتوب) أو من هنا</p>
          <div class="tech-tree" data-tech></div></div>`;
      this.bindTechTree(el.querySelector('[data-tech]')!);
    } else if (this.sheetTab === 'analytics') {
      el.innerHTML = `<h3>تحليلات الجريمة</h3>
        <div class="card"><h4>النتيجة</h4><p style="font-size:22px;font-weight:800;color:var(--green)">${this.game.state.score}</p></div>
        <div class="card"><h4>بلاغات</h4><p>نجاح ${this.game.state.incidentsResolved} / فشل ${this.game.state.incidentsFailed}</p></div>
        <div class="card"><h4>السمعة</h4><div class="bar"><i style="width:${this.game.state.reputation}%"></i></div></div>
        <div class="card"><h4>التأهب</h4><span class="chip hot">${this.game.state.alertLevel}</span></div>`;
    } else if (this.sheetTab === 'settings') {
      const cycleMin = Math.round(this.game.state.dayCycleSec / 60);
      el.innerHTML = `<h3>إعدادات</h3>
        <div class="card"><p>PWA: من المتصفح → تثبيت التطبيق</p></div>
        <div class="card">
          <h4>توقيت المدينة / الإضاءة</h4>
          <p>دورة نهار↔ليل كاملة كل ~${cycleMin} دقائق حقيقية. الآن ${this.game.formatClock()} — ${DAY_PHASE_LABELS[this.game.getDayPhase()]}</p>
          <div class="btn-row" style="margin-top:8px">
            <button class="btn ghost" data-phase="morning">🌅 صباح</button>
            <button class="btn ghost" data-phase="noon">☀️ ظهر</button>
            <button class="btn ghost" data-phase="dusk">🌇 غروب</button>
            <button class="btn ghost" data-phase="night">🌙 ليل</button>
          </div>
          <div class="btn-row" style="margin-top:8px">
            <button class="btn ghost" data-cycle="8">دورة 8 د</button>
            <button class="btn ghost" data-cycle="10">دورة 10 د</button>
            <button class="btn ghost" data-cycle="12">دورة 12 د</button>
          </div>
        </div>
        <div class="btn-row">
          <button class="btn ghost" id="toggle-audio">${this.game.state.audioEnabled ? 'كتم الصوت' : 'تشغيل الصوت'}</button>
          <button class="btn ghost" id="spawn-bank">محاكاة سطو بنك</button>
          <button class="btn ghost" id="spawn-any">بلاغ عشوائي</button>
        </div>`;
      el.querySelectorAll('[data-phase]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const phase = (btn as HTMLElement).dataset.phase as DayPhase;
          this.game.setDayPhase(phase);
          this.city.setTimeOfDay(this.game.state.cityHour);
          this.toast(`الإضاءة: ${DAY_PHASE_LABELS[phase]}`, 'success');
          this.render();
        });
      });
      el.querySelectorAll('[data-cycle]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const m = Number((btn as HTMLElement).dataset.cycle);
          this.game.setCycleMinutes(m);
          this.toast(`دورة كاملة كل ${m} دقائق`, 'success');
          this.render();
        });
      });
      el.querySelector('#toggle-audio')!.addEventListener('click', () => {
        this.game.state.audioEnabled = !this.game.state.audioEnabled;
        audio.setEnabled(this.game.state.audioEnabled);
        if (this.game.state.audioEnabled) audio.startAmbient();
        this.toast(this.game.state.audioEnabled ? 'الصوت مفعّل' : 'الصوت مكتوم', 'success');
        this.render();
      });
      el.querySelector('#spawn-bank')!.addEventListener('click', () => {
        const i = this.incidents.SpawnIncident(CrimeType.BankRobbery);
        if (i) {
          this.city.syncIncidents(this.incidents.openIncidents);
          this.city.flyTo(i.x, i.z, true);
          this.mode = 'play';
        }
        this.render();
      });
      el.querySelector('#spawn-any')!.addEventListener('click', () => {
        const i = this.incidents.SpawnIncident();
        if (i) {
          this.city.syncIncidents(this.incidents.openIncidents);
          this.city.flyTo(i.x, i.z, true);
          this.mode = 'play';
        }
        this.render();
      });
    }
    return el;
  }
}
