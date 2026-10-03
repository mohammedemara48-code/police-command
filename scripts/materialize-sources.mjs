import { readFileSync, writeFileSync } from 'node:fs';

function joinParts(parts, dest) {
  const text = parts.map((name) => readFileSync('scripts/restore/' + name, 'utf8')).join('');
  if (!text.includes('export class')) throw new Error('restore join incomplete: ' + dest);
  writeFileSync(dest, text);
}

joinParts(
  ['scene-part-0.ts', 'scene-part-1.ts', 'scene-part-2.ts', 'scene-part-3.ts'],
  'src/game/CityScene.ts'
);
joinParts(['hud-part-0.ts', 'hud-part-1.ts', 'hud-part-2.ts'], 'src/game/UI.ts');
joinParts(['inc-part-0.ts', 'inc-part-1.ts'], 'src/game/IncidentManager.ts');
