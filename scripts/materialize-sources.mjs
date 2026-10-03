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

/** Apply a unified diff without relying on the patch binary (Vercel images vary). */
function applyUnified(diffText) {
  const lines = diffText.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  const files = [];
  while (i < lines.length) {
    if (!lines[i].startsWith('--- ')) { i++; continue; }
    const oldPath = lines[i].slice(4).split('\t')[0].trim();
    const newPath = lines[i + 1].slice(4).split('\t')[0].trim();
    i += 2;
    const hunks = [];
    while (i < lines.length && lines[i].startsWith('@@')) {
      const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(lines[i]);
      if (!m) throw new Error('bad hunk ' + lines[i]);
      i++;
      const body = [];
      while (i < lines.length && lines[i] !== '' && !lines[i].startsWith('@@') && !lines[i].startsWith('--- ')) {
        body.push(lines[i]);
        i++;
      }
      hunks.push({ oldStart: Number(m[1]), body });
    }
    files.push({ path: newPath === '/dev/null' ? oldPath : newPath, hunks });
  }
  for (const file of files) {
    const srcPath = file.path;
    const src = readFileSync(srcPath, 'utf8').replace(/\r\n/g, '\n').split('\n');
    let cursor = 0;
    const out = [];
    for (const hunk of file.hunks) {
      const start = hunk.oldStart - 1;
      if (start < cursor) throw new Error('overlapping hunk in ' + srcPath);
      out.push(...src.slice(cursor, start));
      let oldIdx = start;
      for (const line of hunk.body) {
        if (line === '\\ No newline at end of file') continue;
        const tag = line[0];
        const text = line.slice(1);
        if (tag === ' ') {
          if (src[oldIdx] !== text) {
            throw new Error('context mismatch in ' + srcPath + ' expected ' + JSON.stringify(text) + ' got ' + JSON.stringify(src[oldIdx]));
          }
          out.push(src[oldIdx]);
          oldIdx++;
        } else if (tag === '-') {
          if (src[oldIdx] !== text) {
            throw new Error('delete mismatch in ' + srcPath + ' expected ' + JSON.stringify(text) + ' got ' + JSON.stringify(src[oldIdx]));
          }
          oldIdx++;
        } else if (tag === '+') {
          out.push(text);
        } else if (line === '') {
          if (src[oldIdx] !== '') throw new Error('blank context mismatch in ' + srcPath);
          out.push('');
          oldIdx++;
        } else {
          throw new Error('bad diff line in ' + srcPath + ': ' + JSON.stringify(line));
        }
      }
      cursor = oldIdx;
    }
    out.push(...src.slice(cursor));
    let text = out.join('\n');
    if (!text.endsWith('\n')) text += '\n';
    writeFileSync(srcPath, text);
  }
}

for (const name of ['city.patch', 'ui.patch', 'main.patch', 'css.patch']) {
  applyUnified(readFileSync('scripts/patches/' + name, 'utf8'));
}
console.log('materialize-sources: joined restore parts and applied decision-visible patches');
