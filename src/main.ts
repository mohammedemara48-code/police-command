import './style.css';
import { GameManager } from './game/GameManager';
import { IncidentManager } from './game/IncidentManager';
import { CityScene } from './game/CityScene';
import { UI } from './game/UI';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const game = new GameManager();
const city = new CityScene(canvas);
const incidents = new IncidentManager(game, city.pois);
const ui = new UI(game, incidents, city);

(window as unknown as { __PC: unknown }).__PC = { game, incidents, city, ui };

let last = performance.now();

function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  game.tick(dt);
  incidents.tick(dt);
  city.syncIncidents(incidents.openIncidents);

  for (const u of game.units) {
    if (!u.available && u.assignedIncidentId) {
      const inc = incidents.incidents.find((i) => i.id === u.assignedIncidentId);
      if (inc && inc.status !== 'resolved' && inc.status !== 'failed') {
        city.driveUnitToward(u.id, inc.x, inc.z, u.speed, dt);
      }
    }
  }

  city.update(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

setInterval(() => {
  if (game.state.running) ui.render();
}, 500);
