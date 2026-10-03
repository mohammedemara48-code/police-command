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
          this.city.focusOn(i.x, i.z);
          this.cctvOpen = true;
