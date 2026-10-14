// Rebuilds binary assets (README GIF, realistic GLB models) from base64 text parts:
// the repo tooling can only commit text. Each folder in assets-b64/ is named after its target
// path with "/" written as "__", e.g. assets-b64/public__models__cop_m.glb/part-00.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

const join = (dir) =>
  Buffer.from(
    readdirSync(dir)
      .filter((f) => f.startsWith('part-'))
      .sort()
      .map((f) => readFileSync(`${dir}/${f}`, 'utf8').trim())
      .join(''),
    'base64'
  );
const write = (target, buf) => {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, buf);
};

write('public/media/gameplay.gif', join('docs/media/gameplay-gif'));
if (existsSync('assets-b64'))
  for (const d of readdirSync('assets-b64')) write(d.replaceAll('__', '/'), join(`assets-b64/${d}`));
