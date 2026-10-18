import { boardHtml, recordWeekly } from '../services/Leaderboard';
import { openCreator } from './CharacterCreator';
import { needsCharacter } from '../entities/Character';
import { models } from '../core/Models';
import { accountHtml, bindAccount, onAccount, restore, account } from '../services/Account';
import { achHtml } from '../systems/Achievements';
// @source-complete
import { GameManager } from '../core/GameManager';
import { IncidentManager } from '../missions/IncidentManager';
import { CityScene } from '../core/CityScene';
import { CCTVFeed } from './CCTVFeed';
import { audio } from '../systems/AudioManager';
import { LEVELS, levelById, progress, setMissionXpHook, setVehicle } from '../missions/Levels';
import { VEHICLES, VEHICLE_IDS, sanitizeVehicle } from '../logic/vehicles';
import { VEHICLE_ICON } from '../logic/vehicleIcons';
setMissionXpHook(recordWeekly);
import { settingsHtml, bindSettings } from './Meta';
import {
  UNIT_LABELS,
  RANK_LABELS,
  PHASE_LABELS,
  DAY_PHASE_LABELS,
  DAY_PHASE_ICONS,
  UnitType,
  CrimeType,
  type DayPhase,
  type Incident,
  type DecisionChoice,
  type MissionReport,
  type ActionHeat
} from '../core/types';

type Tab = 'units' | 'officers' | 'investigations' | 'buildings' | 'analytics' | 'settings' | null;

export class UI {
  hud: HTMLElement;
  overlay: HTMLElement;
  sheetTab: Tab = null;
  cctvOpen = true;
  mobileAlertsOpen = true;
  private toastEl: HTMLElement;
  private cctvFeed: CCTVFeed | null = null;
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
    window.addEventListener('pointerdown', () => (this.pointerDownAt = performance.now()), {
      capture: true,
      passive: true
    });
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
    if (!this.accountHooked) {
      this.accountHooked = true;
      // refresh the menu (login label / unlocked levels) when the account syncs, but only if a menu is showing
      onAccount(() => {
        if (!this.launched && (this.menuScreen === 'main' || this.menuScreen === 'account'))
          this.menu(this.menuScreen as 'main');
      });
      void restore();
    }
    this.menu('main');
  }

  private launched = false;
  private menuScreen = '';
  private accountHooked = false;
  private menu(screen: 'main' | 'levels' | 'vehicle' | 'settings' | 'credits' | 'ach' | 'account' | 'board') {
    const cur = levelById(progress.current);
    const body =
      screen === 'main'
        ? `<h1>عفاريت أسفلت القاهرة</h1>
          <p class="sub"><span dir="ltr">Cairo Asphalt Demons</span> — دوريات ومطاردات في مدينة ثلاثية الأبعاد</p>
          <div class="menu-col">
            <button class="btn menu-big" data-m="play">▶ العب — المستوى ${cur.id}: ${cur.title}</button>
            <button class="btn ghost" data-m="levels">المستويات</button>
            <button class="btn ghost" data-m="character">👮 شخصيتي</button>
            <button class="btn ghost" data-m="vehicle">${VEHICLE_ICON[sanitizeVehicle(progress.vehicle)]} عربيتي: ${VEHICLES[sanitizeVehicle(progress.vehicle)].name}</button>
            <button class="btn ghost" data-m="patrol">🚨 دورية حرة (بلاغات عشوائية)</button>
            <button class="btn ghost" data-m="board">📊 ترتيب الأسبوع</button>
            <button class="btn ghost" data-m="ach">🏆 الإنجازات</button>
            <button class="btn ghost" data-m="account">👤 ${account.user ? 'حسابي' : 'تسجيل الدخول'}</button>
            <button class="btn ghost" data-m="command">غرفة العمليات (استراتيجية)</button>
            <button class="btn ghost" data-m="settings">الإعدادات</button>
            <button class="btn ghost" data-m="credits">الحقوق</button>
          </div>
          <p class="hint">كمبيوتر: WASD للحركة · Shift جري · E ركوب · M خريطة · Esc إيقاف — موبايل: الجويستيك والأزرار</p>`
        : screen === 'levels'
          ? `<h2>المستويات</h2>
            <div class="level-grid">${LEVELS.map((l) => {
              const locked = l.id > progress.unlocked;
              const st = progress.stars[l.id] ?? 0;
              return `<button class="level-tile ${locked ? 'locked' : ''}" data-l="${l.id}" ${locked ? 'disabled' : ''}>
                <b>${l.id}</b><span>${l.title}</span><i>${locked ? '🔒' : '★'.repeat(st) + '☆'.repeat(3 - st)}</i></button>`;
            }).join('')}</div>
            <button class="btn ghost" data-m="main">رجوع</button>`
          : screen === 'vehicle'
            ? `<h2>🚗 اختار عربيتك</h2>
            <div class="menu-col">${VEHICLE_IDS.map((id) => {
              const v = VEHICLES[id];
              const on = id === sanitizeVehicle(progress.vehicle);
              return `<button class="btn ${on ? '' : 'ghost'}" data-veh="${id}">${VEHICLE_ICON[id]} ${v.name}${on ? ' ✓' : ''}<br><small>${v.blurb}</small></button>`;
            }).join('')}</div>
            <button class="btn ghost" data-m="main">رجوع</button>`
            : screen === 'account'
              ? accountHtml()
              : screen === 'board'
                ? '<h2>🏆 ترتيب الأسبوع</h2><p class="hint">جاري التحميل…</p><button class="btn ghost" data-m="main">رجوع</button>'
                : screen === 'ach'
                  ? `${achHtml()}<button class="btn ghost" data-m="main">رجوع</button>`
                  : screen === 'settings'
                    ? `<h2>الإعدادات</h2>${settingsHtml()}<button class="btn ghost" data-m="main">رجوع</button>`
                    : `<h2>الحقوق</h2>
              <p class="credits">الضابط والمشاة وعربية الشرطة: Quaternius (CC0)<br>
              عربية Dodge Challenger: Grzybek عبر Poly Pizza (CC-BY 3.0)<br>
              مباني ومؤثرات صوتية: Kenney.nl (CC0)<br>
              موسيقى المطاردة: Fast Fight Battle Music — OpenGameArt (CC0)<br>
              موسيقى غرفة العمليات: Empty City — OpenGameArt (CC0)<br>
              صفارة وطلقات: OpenGameArt (CC0)<br>محرك الرسوم: Three.js</p>
              <button class="btn ghost" data-m="main">رجوع</button>`;
    this.overlay.innerHTML = `<div class="start-screen"><div class="start-card glass menu-card">${body}</div></div>`;
    if (screen === 'settings') bindSettings(this.overlay);
    if (screen === 'account') bindAccount(this.overlay, () => this.menu('account'));
    if (screen === 'board') {
      void boardHtml().then((html) => {
        if (this.menuScreen !== 'board' || this.launched) return;
        const card = this.overlay.querySelector('.menu-card, .meta-card') ?? this.overlay.firstElementChild;
        if (card) card.innerHTML = `${html}<button class="btn ghost" data-m="main">رجوع</button></div>`;
        this.overlay.querySelectorAll<HTMLButtonElement>('[data-m]').forEach((b) =>
          b.addEventListener('click', () => {
            audio.click();
            this.menu(b.dataset.m as 'main');
          })
        );
      });
    }
    this.menuScreen = screen;
    this.overlay.querySelectorAll<HTMLButtonElement>('[data-m]').forEach((b) =>
      b.addEventListener('click', () => {
        audio.resume();
        audio.click();
        const m = b.dataset.m!;
        if ((m === 'play' || m === 'patrol') && needsCharacter())
          this.creator(true, () => this.launch('street', m === 'play' ? progress.current : -1));
        else if (m === 'character') this.creator(false, () => this.menu('main'));
        else if (m === 'play') this.launch('street', progress.current);
        else if (m === 'patrol') this.launch('street', -1);
        else if (m === 'command') this.launch('command');
        else this.menu(m as 'main');
      })
    );
    this.overlay.querySelectorAll<HTMLButtonElement>('[data-veh]').forEach((b) =>
      b.addEventListener('click', () => {
        audio.resume();
        audio.click();
        const id = sanitizeVehicle(b.dataset.veh);
        setVehicle(id);
        this.city.street?.applyVehicle(id);
        this.menu('vehicle');
      })
    );
    this.overlay.querySelectorAll<HTMLButtonElement>('[data-l]').forEach((b) =>
      b.addEventListener('click', () => {
        audio.resume();
        audio.click();
        const l = Number(b.dataset.l);
        if (needsCharacter()) this.creator(true, () => this.launch('street', l));
        else this.launch('street', l);
      })
    );
  }

  private creator(first: boolean, done: () => void) {
    this.menuScreen = 'character';
    openCreator(this.overlay, { first, done });
  }

  private async launch(kind: 'street' | 'command', level = 1) {
    if (kind === 'street' && !this.city.street) {
      this.overlay.innerHTML = `<div class="loading-screen" role="progressbar" aria-label="تحميل"><div class="ls-title">🚓 عفاريت أسفلت القاهرة — جاري تجهيز الشارع…</div><div class="ls-bar"><i></i></div><div class="ls-tip">نصيحة: «استسلم!» الأول، ومتضربش حد رافع إيده.</div></div>`;
      const bar = this.overlay.querySelector('.ls-bar i') as HTMLElement | null;
      const t0 = performance.now();
      const poll = setInterval(() => {
        const p = models.progress();
        const frac = p.total ? p.done / p.total : 0.1;
        if (bar) bar.style.width = `${Math.round(10 + frac * 90)}%`;
      }, 120);
      try {
        await this.city.loadStreet();
      } catch {
        clearInterval(poll);
        this.overlay.innerHTML =
          '<div class="loading-screen"><div class="ls-title">تعذّر التحميل. تأكد من الإنترنت وجرّب تاني.</div></div>';
        return;
      }
      // progressive: the street shows placeholder meshes right away; wait briefly (max 6 s) for the main models
      await new Promise<void>((res) => {
        const chk = () => {
          const p = models.progress();
          if ((p.total && p.done >= p.total) || performance.now() - t0 > 6000) res();
          else setTimeout(chk, 150);
        };
        chk();
      });
      clearInterval(poll);
    }
    audio.resume();
    audio.setTrack(kind === 'street' ? 'music' : 'calm');
    audio.startAmbient();
    this.overlay.innerHTML = '';
    if (!this.launched) {
      this.launched = true;
      this.game.start();
    }
    if (kind === 'street') {
      if (this.city.street && !this.city.street.onReport)
        this.city.street.onReport = (r) => {
          // street purse (progress.money) is credited in completeLevel; command center only tracks reputation
          this.game.AddRewards(0, r.rep);
          if (r.success) this.game.state.incidentsResolved += 1;
          else this.game.state.incidentsFailed += 1;
        };
      // patrols start in bright daylight; the day/night cycle carries on from there
      this.game.state.cityHour = 10;
      this.city.setTimeOfDay(10);
      this.city.street?.engage();
      this.city.street?.setLevel(level);
    } else {
      this.city.street?.disengage();
      this.city.setTimeOfDay(9);
    }
    this.mode = 'play';
    this.render();
  }

  private renderQueued = 0;
  private lastRenderAt = 0;
  private pointerDownAt = 0;
  /** Coalesced HUD render: the HUD is rebuilt with innerHTML, so bursts of change events (and rebuilds under a finger) made taps lag for seconds on phones. */
  render() {
    if (this.renderQueued) return;
    const wait = Math.max(0, 250 - (performance.now() - this.lastRenderAt));
    this.renderQueued = window.setTimeout(() => {
      this.renderQueued = 0;
      if (performance.now() - this.pointerDownAt < 350) {
        this.render();
        return;
      }
      this.lastRenderAt = performance.now();
      this.renderNow();
    }, wait);
  }

  renderNow() {
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

    if (layout === 'portrait' && this.mode === 'play' && !this.city.street?.active) {
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
      const dim = document.createElement('div');
      dim.className = 'result-backdrop';
      this.hud.appendChild(dim);
      this.hud.appendChild(this.resultDialog(this.report));
    } else if (selected && !selected.selectedDecision && selected.status === 'awaiting_decision') {
      this.hud.appendChild(this.decisionDock(selected));
    }

    // BOTTOM NAV
    this.hud.appendChild(this.buildNav());
    if (this.sheetTab && this.mode === 'play') this.hud.appendChild(this.sheet());

    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = this.isMobile() ? `يوم ${s.day} · إصبع: دوران` : `سحب: دوران · عجلة: زوم · يوم ${s.day}`;
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
        <div class="brand">عفاريت أسفلت القاهرة</div>
        ${clockHtml}
        <div class="res money"><span class="ico">💵</span>$${s.budget.toLocaleString()}</div>
        <div class="res stars"><span class="ico">⭐</span>${s.reputation}</div>
        <div class="res alerts"><span class="ico">🚨</span>${openCount}</div>
      `;
    } else {
      top.innerHTML = `
        <div class="brand">عفاريت أسفلت القاهرة</div>
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
      b.type = 'button';
      b.dataset.decision = d.id;
      b.textContent = d.label;
      b.title = d.blurb;
      // pointerdown, not click: a HUD rebuild between down and up used to detach the button and swallow the choice.
      b.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
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
    el.dataset.result = '1';
    el.innerHTML = `
      <h3>${r.timedOut ? 'فشل' : r.success ? 'نجاح' : 'فشل'}</h3>
      <p class="result-where">${r.title} · ${r.decisionLabel} · ${r.districtName}</p>
      <p class="result-sum">${r.summary}</p>
      <div class="result-nums">
        <span>💵 ${money}</span>
        <span>⭐ ${rep}</span>
        <span>👮 ${r.officerLine}</span>
      </div>
      <button class="btn" type="button" data-next>الانتقال إلى ${this.nextPlaceName || 'الموقع التالي'}</button>
    `;
    const next = el.querySelector('[data-next]')!;
    next.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.dismissResult();
    });
    return el;
  }

  private showReport(report: MissionReport) {
    if (this.mode === 'action') return;
    if (this.mode === 'result') return;
    this.report = report;
    this.nextPlaceName = this.incidents.previewNextDistrict();
    this.mode = 'result';
    this.render();
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
    await new Promise((r) => setTimeout(r, 1100));
    this.stopGuns();
    const report = this.incidents.settle(inc.id);
    this.report = report || {
      success: false,
      timedOut: false,
      title: inc.title,
      districtName: inc.districtName,
      decisionLabel: d.label,
      summary: `القرار في ${inc.districtName} اتسجل. الوحدات كانت على الخط.`,
      money: 0,
      rep: 0,
      officerLine: '—'
    };
    this.nextPlaceName = this.incidents.previewNextDistrict();
    this.mode = 'result';
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
    this.city.endAction();
    const next = this.incidents.spawnNext();
    if (next) {
      this.city.syncIncidents(this.incidents.openIncidents);
      this.city.flyTo(next.x, next.z, true);
      this.toast(`انتقلت إلى ${next.districtName}`, 'success');
    }
    this.render();
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
    const logs = this.game.log.slice(0, 4);
    box.innerHTML = `
      <h3>${inc.title} <button class="btn ghost" id="cctv-x" style="padding:2px 8px">✕</button></h3>
      <div class="cctv-feed">
        <canvas id="cctv-canvas"></canvas>
        <div class="rec">● REC SURVEILLANCE FEED</div>
      </div>
      <div class="dispatch-log">
        <div style="font-weight:800;margin-bottom:4px;color:#edf3ff">سجل الإرسال المباشر</div>
        ${
          logs
            .map((l) => {
              const sp = l.indexOf(' ');
              return `<div><span class="ts">${l.slice(0, sp)}</span>${l.slice(sp)}</div>`;
            })
            .join('') || '<div>Surveillance current…</div>'
        }
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
        ${
          closed
            .slice(0, 8)
            .map(
              (i) =>
                `<div class="card"><h4>${i.title}</h4><p>${i.description}</p>
              <span class="chip ${i.status === 'resolved' ? 'ok' : 'hot'}">${i.status}</span></div>`
            )
            .join('') || '<div class="card"><p>لا قضايا مغلقة بعد.</p></div>'
        }`;
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
