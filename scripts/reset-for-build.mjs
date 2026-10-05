import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

function fromGit(path) {
  try {
    return execSync('git show HEAD:' + path, { encoding: 'utf8' });
  } catch {
    return null;
  }
}

for (const path of ['src/main.ts', 'src/style.css']) {
  const text = fromGit(path);
  if (text != null) {
    writeFileSync(path, text);
    console.log('reset-for-build:', path);
  }
}

// CityScene / UI / IncidentManager are rebuilt by materialize from restore parts.
writeFileSync('src/game/CityScene.ts', '');
if (existsSync('src/game/UI.ts')) writeFileSync('src/game/UI.ts', '');
console.log('reset-for-build: cleared CityScene/UI placeholders');
