import { reducedMotion, setReducedMotion } from '../config/Motion';
import { exportSave, importSave } from '../systems/Save';
import type { GameManager } from '../core/GameManager';
import { audio } from '../systems/AudioManager';
import { quality, setQuality, type Quality } from '../config/Quality';
import { controls, paveStyle, setControls, setPaveStyle, type Controls, type PaveStyle } from '../config/prefs';

const KEY = 'pc.save.v1';
interface Save {
  best: number;
  shifts: number;
  resolved: number;
  level: number;
}

function load(): Save {
  try {
    return { best: 0, shifts: 0, resolved: 0, level: 1, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { best: 0, shifts: 0, resolved: 0, level: 1 };
  }
}
function store(s: Save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** Pause menu, game over, persistent career progress (best score, career level). */
export class Meta {
  paused = false;
  over = false;
  save = load();
  private el: HTMLDivElement;
  private btn: HTMLButtonElement;
  private resolvedAtStart = 0;

  constructor(private game: GameManager) {
    this.el = document.createElement('div');
    this.el.className = 'meta-overlay';
    this.el.hidden = true;
    document.body.appendChild(this.el);
    this.btn = document.createElement('button');
    this.btn.className = 'meta-pause-btn';
    this.btn.setAttribute('aria-label', 'إيقاف مؤقت');
    this.btn.textContent = '⏸';
    this.btn.addEventListener('click', () => this.togglePause());
    this.btn.hidden = true;
    document.body.appendChild(this.btn);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') this.togglePause();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.game.state.running) this.setPause(true);
    });
    setInterval(() => this.persist(), 5000);
  }

  get active() {
    return this.game.state.running && !this.paused && !this.over;
  }

  togglePause() {
    if (this.game.state.running && !this.over) this.setPause(!this.paused);
  }

  setPause(p: boolean) {
    this.paused = p;
    audio.click();
    if (p) {
      this.show(`<h2>إيقاف مؤقت</h2>
        <p>أفضل نتيجة: <b>${this.save.best}</b> · مستوى المسيرة: <b>${this.save.level}</b></p>
        ${settingsHtml()}
        ${document.documentElement.dataset.mode === 'taxi' ? '<button class="btn ghost" data-a="endshift">🏁 إنهاء الوردية</button>' : ''}
        <button class="btn" data-a="resume">استكمال</button>
        <button class="btn ghost" data-a="restart">القائمة الرئيسية</button>`);
    } else this.hide();
  }

  check() {
    const s = this.game.state;
    this.btn.hidden = !s.running;
    if (!s.running || this.over) return;
    if (s.reputation <= 0 || s.budget < -50000) {
      this.over = true;
      this.persist();
      audio.fail();
      const record = s.score >= this.save.best && s.score > 0;
      this.show(`<h2>انتهت الوردية</h2>
        <p>${s.reputation <= 0 ? 'فقدت ثقة المدينة' : 'نفدت الميزانية'}</p>
        <p class="meta-score">${s.score}</p>
        ${record ? '<p class="meta-record">🏆 رقم قياسي جديد!</p>' : `<p>أفضل نتيجة: ${this.save.best}</p>`}
        <p>بلاغات محلولة: ${s.incidentsResolved} · فاشلة: ${s.incidentsFailed}</p>
        <button class="btn" data-a="restart">حاول مرة أخرى</button>`);
    }
  }

  persist() {
    const s = this.game.state;
    if (!s.running) return;
    const delta = s.incidentsResolved - this.resolvedAtStart;
    if (delta > 0) {
      this.save.resolved += delta;
      this.resolvedAtStart = s.incidentsResolved;
    }
    this.save.best = Math.max(this.save.best, s.score);
    this.save.level = 1 + Math.floor(Math.sqrt(this.save.resolved / 3));
    store(this.save);
  }

  private show(html: string) {
    this.el.innerHTML = `<div class="meta-card glass">${html}</div>`;
    this.el.hidden = false;
    this.bindSettings();
    this.el.querySelectorAll<HTMLButtonElement>('[data-a]').forEach((b) =>
      b.addEventListener('click', () => {
        if (b.dataset.a === 'resume') this.setPause(false);
        else if (b.dataset.a === 'endshift') {
          // clock out of the taxi shift (the summary shows over the street)
          this.setPause(false);
          window.dispatchEvent(new CustomEvent('pc:end-shift'));
        } else {
          window.dispatchEvent(new CustomEvent('pc:flush-shift'));
          this.persist();
          this.save.shifts += 1;
          store(this.save);
          location.reload();
        }
      })
    );
  }
  private bindSettings() {
    bindSettings(this.el, () => this.persist());
  }
  private hide() {
    this.el.hidden = true;
    this.el.innerHTML = '';
  }
}

export function settingsHtml() {
  return `<div class="meta-settings">
          <label>الصوت العام <input type="range" min="0" max="1" step="0.05" data-v="master" value="${audio.vol.master}"></label>
          <label>الموسيقى <input type="range" min="0" max="1" step="0.05" data-v="music" value="${audio.vol.music}"></label>
          <label>المؤثرات <input type="range" min="0" max="1" step="0.05" data-v="sfx" value="${audio.vol.sfx}"></label>
          <label>تقليل الحركة <select data-motion>
            <option value="full" ${reducedMotion ? '' : 'selected'}>عادي</option>
            <option value="reduce" ${reducedMotion ? 'selected' : ''}>أقل حركة (بدون اهتزاز الكاميرا)</option>
          </select></label>
          <label>جودة الرسوم <select data-q>
            ${(['low', 'medium', 'high'] as Quality[]).map((q) => `<option value="${q}" ${q === quality ? 'selected' : ''}>${{ low: 'منخفضة (موبايل ضعيف)', medium: 'متوسطة', high: 'عالية' }[q]}</option>`).join('')}
          </select></label>
          <label>تحكم السواقة <select data-ctl>
            <option value="joystick" ${controls === 'joystick' ? 'selected' : ''}>جويستيك</option>
            <option value="wheel" ${controls === 'wheel' ? 'selected' : ''}>دريكسيون ودواسات وعداد</option>
          </select></label>
          <label>بلاط الرصيف في وسط البلد <select data-pave>
            <option value="redgrey" ${paveStyle === 'redgrey' ? 'selected' : ''}>أحمر ورمادي</option>
            <option value="beige" ${paveStyle === 'beige' ? 'selected' : ''}>بيج</option>
          </select></label>
          <div class="save-row">
            <button type="button" class="btn ghost" data-save="export">⬇️ تصدير الحفظ</button>
            <button type="button" class="btn ghost" data-save="import">⬆️ استيراد حفظ</button>
          </div>
          <p class="save-msg" aria-live="polite">التقدم بيتحفظ تلقائياً على الجهاز ده.</p>
        </div>`;
}

export function bindSettings(root: HTMLElement, beforeReload: () => void = () => undefined) {
  root
    .querySelectorAll<HTMLInputElement>('[data-v]')
    .forEach((r) =>
      r.addEventListener('input', () => audio.setVolume(r.dataset.v as 'master' | 'music' | 'sfx', Number(r.value)))
    );
  const q = root.querySelector<HTMLSelectElement>('[data-q]');
  q?.addEventListener('change', () => {
    beforeReload();
    setQuality(q.value as Quality);
  });
  const ct = root.querySelector<HTMLSelectElement>('[data-ctl]');
  ct?.addEventListener('change', () => setControls(ct.value as Controls));
  const pv = root.querySelector<HTMLSelectElement>('[data-pave]');
  pv?.addEventListener('change', () => {
    beforeReload();
    setPaveStyle(pv.value as PaveStyle);
  });
  const m = root.querySelector<HTMLSelectElement>('[data-motion]');
  m?.addEventListener('change', () => setReducedMotion(m.value === 'reduce'));
  const msg = root.querySelector<HTMLElement>('.save-msg');
  root.querySelector('[data-save="export"]')?.addEventListener('click', () => {
    exportSave();
    if (msg) msg.textContent = 'اتحفظ ملف الحفظ في التنزيلات.';
  });
  root.querySelector('[data-save="import"]')?.addEventListener('click', async () => {
    const err = await importSave();
    if (err && msg) msg.textContent = err;
  });
}
