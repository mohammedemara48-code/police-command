// Rebuilds binary README media from base64 parts (the repo tooling can only commit text).
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const dir = 'docs/media/gameplay-gif';
const b64 = readdirSync(dir)
  .filter((f) => f.startsWith('part-'))
  .sort()
  .map((f) => readFileSync(`${dir}/${f}`, 'utf8').trim())
  .join('');
mkdirSync('public/media', { recursive: true });
writeFileSync('public/media/gameplay.gif', Buffer.from(b64, 'base64'));
