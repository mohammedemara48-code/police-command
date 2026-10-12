import './style.css';
import { GameManager } from './game/GameManager';
import { IncidentManager } from './game/IncidentManager';
import { CityScene } from './game/CityScene';
import { UI } from './game/UI';
import { audio } from './game/AudioManager';
import { Meta } from './game/Meta';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const game = new GameManager();
const city = new CityScene(canvas);
const incidents = new IncidentManager(game, city.pois);
const ui = new UI(game, incidents, city);
const meta = new Meta(game);

(window as unknown as { __PC: unknown }).__PC = { meta, game, incidents, city, ui, audio };

let last = performance.now();

function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (meta.active || !game.state.running) {
    game.tick(dt);
    incidents.tick(dt);
  }
  meta.check();
  if (meta.paused || meta.over) { requestAnimationFrame(frame); return; }
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

  city.setTimeOfDay(game.state.cityHour);
  city.update(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

