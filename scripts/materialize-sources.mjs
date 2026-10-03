import { readFileSync, writeFileSync } from 'node:fs';

function materialize(name, dest) {
  const text = readFileSync('scripts/restore/' + name, 'utf8');
  if (!text.includes('export class')) throw new Error('restore part incomplete: ' + name);
  writeFileSync(dest, text);
}

materialize('city-00.ts', 'src/game/CityScene.ts');
materialize('ui-00.ts', 'src/game/UI.ts');
