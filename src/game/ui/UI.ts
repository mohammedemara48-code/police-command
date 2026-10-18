import { boardHtml, recordWeekly } from '../services/Leaderboard';
import { openCreator } from './CharacterCreator';
import { needsCharacter } from '../entities/Character';
import { models } from '../core/Models';
import { accountHtml, bindAccount, onAccount, restore, account } from '../services/Account';
import { achHtml } from '../systems/Achievements';
// @source-complete
import { GameManager } from '../core/GameManager';
import { CityScene } from '../core/CityScene';
import { audio } from '../systems/AudioManager';
import { LEVELS, levelById, progress, setMissionXpHook, setVehicle } from '../missions/Levels';
import { VEHICLES, VEHICLE_IDS, sanitizeVehicle, modeOf, type VehicleId } from '../logic/vehicles';
import { VEHICLE_ICON } from '../logic/vehicleIcons';
setMissionXpHook(recordWeekly);
import { settingsHtml, bindSettings } from './Meta';
import { DAY_PHASE_LABELS, DAY_PHASE_ICONS } from '../core/types';

/** The big play button says what the chosen vehicle will actually do. */
function playLabel(levelId: number, title: string) {
  const v = sanitizeVehicle(progress.vehicle);
  const mode = modeOf(v);
  if (mode === 'police') return `▶ العب — المستوى ${levelId}: ${title}`;
  if (mode === 'taxi') return `▶ اشتغل بـ${VEHICLES[v].name} — ركاب وأجرة`;
  return `▶ لفّة حرة بالـ${VEHICLES[v].name}`;
}

/** Loading-screen tip for the chosen vehicle: police tips stay inside police mode. */
function loadingTip(v: VehicleId) {
  const mode = modeOf(v);
  if (mode === 'police') return 'نصيحة: «استسلم!» الأول، ومتضربش حد رافع إيده.';
  if (mode === 'taxi')
    return v === 'microbus'
      ? 'نصيحة: املا الكراسي من الموقف، ووصّل كل واحد محطته — الأجرة بالراكب.'
      : 'نصيحة: سوق بهدوء والراكب هيسيبلك بقشيش، وفي الزحمة الرصيف اختصارك.';
  return 'نصيحة: السوق الحر بدون بلاغات — خد لفّة على الكورنيش أو الدائري.';
}

export class UI {
  hud: HTMLElement;
  overlay: HTMLElement;
  private toastEl: HTMLElement;

  constructor(
    private game: GameManager,
    private city: CityScene
  ) {
    this.hud = document.getElementById('hud')!;
    this.overlay = document.getElementById('overlay')!;
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'toast-stack';
    this.hud.appendChild(this.toastEl);

    this.game.onChange(() => this.render());
    window.addEventListener('resize', () => this.render());
    this.renderStart();
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
          <p class="sub"><span dir="ltr">Cairo Asphalt Demons</span> — قاهرة واحدة، وعربيتك هي اللي بتحدد شغلك</p>
          <div class="menu-col">
            <button class="btn menu-big" data-m="play">${playLabel(cur.id, cur.title)}</button>
            <button class="btn ghost" data-m="levels">🚓 مهام الدورية</button>
            <button class="btn ghost" data-m="character">🙂 شخصيتي</button>
            <button class="btn ghost" data-m="vehicle">${VEHICLE_ICON[sanitizeVehicle(progress.vehicle)]} عربيتي: ${VEHICLES[sanitizeVehicle(progress.vehicle)].name}</button>
            <button class="btn ghost" data-m="board">📊 ترتيب الأسبوع</button>
            <button class="btn ghost" data-m="ach">🏆 الإنجازات</button>
            <button class="btn ghost" data-m="account">👤 ${account.user ? 'حسابي' : 'تسجيل الدخول'}</button>
            <button class="btn ghost" data-m="settings">الإعدادات</button>
            <button class="btn ghost" data-m="credits">الحقوق</button>
          </div>
          <p class="hint">كمبيوتر: WASD للحركة · Shift جري · E ركوب · M خريطة · Esc إيقاف — موبايل: الجويستيك والأزرار</p>`
        : screen === 'levels'
          ? `<h2>🚓 مهام الدورية</h2>
            <button class="btn menu-big" data-m="patrol">🚨 دورية حرة (بلاغات عشوائية)</button>
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
              موسيقى هادية: Empty City — OpenGameArt (CC0)<br>
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
        if (m === 'patrol') this.policeFirst();
        if ((m === 'play' || m === 'patrol') && needsCharacter())
          this.creator(true, () => this.launch(m === 'play' ? progress.current : -1));
        else if (m === 'character') this.creator(false, () => this.menu('main'));
        else if (m === 'play') this.launch(progress.current);
        else if (m === 'patrol') this.launch(-1);
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
        this.policeFirst();
        if (needsCharacter()) this.creator(true, () => this.launch(l));
        else this.launch(l);
      })
    );
  }

  private creator(first: boolean, done: () => void) {
    this.menuScreen = 'character';
    openCreator(this.overlay, { first, done });
  }

  /** Campaign levels and free patrols are police work: choosing one puts you in the patrol car. */
  private policeFirst() {
    if (modeOf(sanitizeVehicle(progress.vehicle)) === 'police') return;
    setVehicle('police');
    this.city.street?.applyVehicle('police');
  }

  private async launch(level = 1) {
    if (!this.city.street) {
      this.overlay.innerHTML = `<div class="loading-screen" role="progressbar" aria-label="تحميل"><div class="ls-title">عفاريت أسفلت القاهرة — جاري تجهيز الشارع…</div><div class="ls-bar"><i></i></div><div class="ls-tip">${loadingTip(sanitizeVehicle(progress.vehicle))}</div></div>`;
      const bar = this.overlay.querySelector('.ls-bar i') as HTMLElement | null;
      const t0 = performance.now();
      const poll = setInterval(() => {
        const p = models.progress();
        const frac = p.total ? p.done / p.total : 0.1;
        if (bar) bar.style.width = `${Math.round(10 + frac * 90)}%`;
      }, 120);
      try {
        await this.city.loadStreet();
      } catch (e) {
        console.error('street failed to load', e);
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
    audio.setTrack('music');
    audio.startAmbient();
    this.overlay.innerHTML = '';
    if (!this.launched) {
      this.launched = true;
      this.game.start();
    }
    // the day starts in bright daylight; the day/night cycle carries on from there
    this.game.state.cityHour = 10;
    this.city.setTimeOfDay(10);
    this.city.street?.engage();
    this.city.street?.setLevel(level);
    this.render();
  }

  private renderQueued = 0;
  private lastRenderAt = 0;
  /** The only HUD left outside the street game: brand + city clock. Coalesced so bursts of change events cost one rebuild. */
  render() {
    if (this.renderQueued) return;
    const wait = Math.max(0, 250 - (performance.now() - this.lastRenderAt));
    this.renderQueued = window.setTimeout(() => {
      this.renderQueued = 0;
      this.lastRenderAt = performance.now();
      this.renderNow();
    }, wait);
  }

  renderNow() {
    if (!this.game.state.running) return;
    this.hud.innerHTML = '';
    this.hud.appendChild(this.toastEl);
    const phase = this.game.getDayPhase();
    const top = document.createElement('div');
    top.className = 'topbar';
    top.innerHTML = `<div class="brand">عفاريت أسفلت القاهرة</div>
      <div class="res clock phase-${phase}" title="توقيت المدينة"><span class="ico">${DAY_PHASE_ICONS[phase]}</span><span class="clock-text">${this.game.formatClock()}<small>${DAY_PHASE_LABELS[phase]}</small></span></div>`;
    this.hud.appendChild(top);
    document.body.dataset.layout = this.layout();
  }

  private layout(): 'desktop' | 'landscape' | 'portrait' {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w >= 980 && h >= 620) return 'desktop';
    if (w > h) return 'landscape';
    return 'portrait';
  }
}
