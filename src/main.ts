import './style.css';
import { inject } from '@vercel/analytics';
// Vercel Web Analytics: free, cookie-less, no secret. Starts counting once it is enabled in the Vercel project (Analytics tab).
if (!location.search.includes('autotest')) inject({ mode: 'production' });

// Touch devices (also when the browser reports a fine pointer, e.g. 'desktop site' mode) get the joystick UI.
if ('ontouchstart' in window || navigator.maxTouchPoints > 0) document.documentElement.classList.add('touch');
import { GameManager } from './game/GameManager';
import { IncidentManager } from './game/IncidentManager';
import { CityScene } from './game/CityScene';
import { UI } from './game/UI';
import { audio } from './game/AudioManager';
import { Meta } from './game/Meta';
import { restoreCommand, startAutosave, saveCommand } from './game/Save';
import { registerSW as register } from 'virtual:pwa-register';
const registerSW = (o: Parameters<typeof register>[0]) => {
  updateSW = register(o);
};
let updateSW: (reload?: boolean) => Promise<void> = async () => undefined;

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const game = new GameManager();
restoreCommand(game);
startAutosave(game);
const city = new CityScene(canvas);
const incidents = new IncidentManager(game, city.pois);
const ui = new UI(game, incidents, city);
const meta = new Meta(game);

(window as unknown as { __PC: unknown }).__PC = { meta, game, incidents, city, ui, audio };

let last = performance.now();
let lastHour = -1;
let lastStreet = false;

function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (meta.active || !game.state.running) {
    game.tick(dt);
    if (!city.street?.active) incidents.tick(dt);
  }
  meta.check();
  if (meta.paused || meta.over) {
    requestAnimationFrame(frame);
    return;
  }
  city.syncIncidents(incidents.openIncidents);

  for (const u of game.units) {
    if (!u.available && u.assignedIncidentId) {
      const inc = incidents.incidents.find((i) => i.id === u.assignedIncidentId);
      if (inc && inc.status !== 'resolved' && inc.status !== 'failed') {
        const spd = u.speed * game.state.responseMul;
        city.driveUnitToward(u.id, inc.x, inc.z, spd, dt);
      }
    }
  }

  // Street patrol is always played at golden-hour/dusk; keep the HUD clock in sync with what is on screen.
  if (city.street?.active) game.state.cityHour = 18.9;
  if (Math.abs(game.state.cityHour - lastHour) > 0.02 || !!city.street?.active !== lastStreet) {
    lastHour = game.state.cityHour;
    lastStreet = !!city.street?.active;
    city.setTimeOfDay(game.state.cityHour);
  }
  city.update(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// PWA: offline cache + "new version available" prompt (the new service worker waits until the player taps Update).
registerSW({
  onNeedRefresh() {
    if (document.getElementById('pwa-update')) return;
    const bar = document.createElement('div');
    bar.id = 'pwa-update';
    bar.setAttribute('role', 'status');
    bar.innerHTML =
      '<span>🚨 فيه نسخة جديدة من اللعبة.</span><button type="button" data-u="go">تحديث</button><button type="button" data-u="later">بعدين</button>';
    bar.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-u]') as HTMLElement | null;
      if (!b) return;
      if (b.dataset.u === 'go') {
        saveCommand(game);
        void updateSW(true);
      }
      bar.remove();
    });
    document.body.appendChild(bar);
  },
  onOfflineReady() {
    /* cached for offline play */
  }
});
