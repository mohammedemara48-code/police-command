import { GameManager } from './GameManager';
import { IncidentManager } from './IncidentManager';
import { CityScene } from './CityScene';
import { CCTVFeed } from './CCTVFeed';
import { audio } from './AudioManager';
import {
  UNIT_LABELS,
  RANK_LABELS,
  PHASE_LABELS,
  DAY_PHASE_LABELS,
  DAY_PHASE_ICONS,
  UnitType,
  CrimeType,
  DecisionId,
  type DayPhase,
  type Incident,
  type DecisionChoice,
  type MissionReport,
  type ActionHeat
} from './types';

type Tab = 'units' | 'officers' | 'investigations' | 'buildings' | 'analytics' | 'settings' | null;

export class UI {
  hud: HTMLElement;
  overlay: HTMLElement;
  sheetTab: Tab = null;
  cctvOpen = true;
  mobileAlertsOpen = true;
  private toastEl: HTMLElement;
  private cctvFeed: CCTVFeed | null = null;
  private decisionModalId: string | null = null;
  private lastAlertLevel = '';
  private mode: 'play' | 'action' | 'result' = 'play';
  private actionText = '';
  private report: MissionReport | null = null;
  private nextPlaceName = '';
  private resultTimer: number | null = null;
  private gunTimer: number | null = null;

  constructor(
    private game: GameManager,
    private incidents: IncidentManager,
    private city: CityScene
  ) {
    this.hud = document.getElementById('hud')!;
    this.overlay = document.getElementById('overlay')!;
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'toast-stack';
    this.hud.appendChild(this.toastEl);

    this.game.onChange(() => this.render());
    this.incidents.onChange(() => this.render());
    this.incidents.onReport = (report) => this.showReport(report);
    this.incidents.onCriticalSpawn = (inc) => {
      if (this.mode !== 'play') return;
      this.city.flyTo(inc.x, inc.z, true);
      this.toast(`🚨 ${inc.title} — ${inc.districtName}`, 'warn');
    };
    window.addEventListener('resize', () => this.render());
    this.renderStart();
  }

  private isMobile() {
    return window.innerWidth <= 900;
  }

  private toast(msg: string, kind: 'success' | 'fail' | 'warn' | '' = '') {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = msg;
    this.toastEl.prepend(t);
    setTimeout(() => t.remove(), 3400);
  }

  renderStart() {
    this.overlay.innerHTML = `
      <div class="start-screen">
        <div class="start-card glass">
          <h1>POLICE COMMAND</h1>
          <p class="sub">قيادة الشرطة — غرفة عمليات ثلاثية الأبعاد</p>
          <ul>
            <li>اختَر قراراً: الكاميرا تروح للمكان وتشوف اللي بيحصل</li>
            <li>مربع نتيجة بأرقامك، وبعدين انتقال لحي تاني</li>
            <li>شجرة تقنيات قابلة للفتح تؤثر على اللعب</li>
            <li>دورة نهار/ليل سينمائية · شوارع نهارية وإنارة ليلية</li>
            <li>واجهة مكتب + موبايل · سحب للكاميرا · عجلة للزوم</li>
          </ul>
          <button class="btn" id="btn-start" style="padding:12px 28px;font-size:15px">بدء الوردية</button>
        </div>
      </div>`;
    this.overlay.querySelector('#btn-start')!.addEventListener('click', () => {
      audio.resume();
      audio.startAmbient();
      this.overlay.innerHTML = '';
      this.game.start();
      const first = this.incidents.spawnTutorialBankRobbery();
      if (first) {
        this.city.syncIncidents(this.incidents.openIncidents);
        this.city.focusOn(first.x, first.z);
        this.city.setSelectedIncident(first.id);
        this.mode = 'play';
        this.toast(`🚨 ${first.title} — ${first.districtName}. اختَر قراراً من الأزرار.`, 'warn');
      }
      this.render();
    });
  }

  render() {
    if (!this.game.state.running) return;
    const s = this.game.state;
    const open = this.incidents.openIncidents;
    const selected = open.find((i) => i.id === s.selectedIncidentId) || open[0] || null;

    if (selected) {
      this.city.setSelectedIncident(selected.id);
      const phase = PHASE_LABELS[selected.phase];
      this.city.updateIncidentLabel(
        selected.id,
        `${selected.title} — ${phase}`,
        selected.severity >= 4 ? '#ff4d6d' : '#ffc14d'
      );
    }

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

    const layout = this.layout();
    document.body.dataset.layout = layout;

    if (layout === 'portrait' && this.mode === 'play') {
      this.hud.appendChild(this.rotateGate());
      return;
    }

    if (layout === 'portrait') {
      /* action / result still visible if the phone is upright */
    } else if (layout === 'landscape') {
      this.renderDesktop(open, selected);
    } else {
      this.renderDesktop(open, selected);
    }

    if (this.mode === 'action') {
      this.hud.appendChild(this.actionCaption());
    } else if (this.mode === 'result' && this.report) {
      this.hud.appendChild(this.resultDialog(this.report));
    } else if (selected && !selected.selectedDecision && selected.status === 'awaiting_decision') {
      this.hud.appendChild(this.decisionDock(selected));
    }

    // BOTTOM NAV
    this.hud.appendChild(this.buildNav());
    if (this.sheetTab && this.mode === 'play') this.hud.appendChild(this.sheet());

    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = this.isMobile()
      ? `يوم ${s.day} · إصبع: دوران`
      : `سحب: دوران · عجلة: زوم · يوم ${s.day}`;
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
    if (this.isMobile()) {
      top.innerHTML = `
        <div class="brand">POLICE COMMAND</div>
        ${clockHtml}
        <div class="res money"><span class="ico">💵</span>$${s.budget.toLocaleString()}</div>
        <div class="res stars"><span class="ico">⭐</span>${s.reputation}</div>
        <div class="res alerts"><span class="ico">🚨</span>${openCount}</div>
      `;
    } else {
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
    }
    return top;
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

    if (this.mode === 'play' && this.cctvOpen && selected && (selected.severity >= 4 || s.cctvUnlocked)) {
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
