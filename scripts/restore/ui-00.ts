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
  type DecisionChoice
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
    this.incidents.onCriticalSpawn = (inc) => {
      this.cctvOpen = true;
      this.mobileAlertsOpen = true;
      this.decisionModalId = inc.id;
      this.toast(`🚨 ${inc.title} — اختر قرارك الآن!`, 'warn');
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
            <li>قرارات واضحة: تفاوض · اقتحام · حصار / مطاردة</li>
            <li>بلاغات متعددة المراحل مع عدّاد ضغط وصافرات</li>
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
        this.cctvOpen = true;
        this.decisionModalId = first.id;
        this.mobileAlertsOpen = true;
        this.toast('🚨 سطو على بنك — اختر قراراً ثم أرسل وحدة!', 'warn');
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

