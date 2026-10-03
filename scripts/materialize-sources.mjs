import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function materialize(prefix, dest) {
  const dir = 'scripts/restore';
  const parts = readdirSync(dir)
    .filter((name) => name.startsWith(prefix) && name.endsWith('.ts'))
    .sort();
  if (!parts.length) throw new Error(`missing restore parts for ${prefix}`);
  const text = parts.map((name) => readFileSync(join(dir, name), 'utf8')).join('');
  writeFileSync(dest, text);
}

materialize('city-', 'src/game/CityScene.ts');
materialize('ui-', 'src/game/UI.ts');
