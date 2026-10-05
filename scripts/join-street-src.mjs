import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
const dir = 'scripts/street-src';
const parts = readdirSync(dir).filter((n) => n.startsWith('part') && n.endsWith('.ts.txt')).sort();
if (!parts.length) throw new Error('missing street-src parts');
const text = parts.map((p) => readFileSync(dir + '/' + p, 'utf8')).join('');
writeFileSync('src/game/StreetPlay.ts', text);
console.log('join-street-src', parts.length, text.length);
