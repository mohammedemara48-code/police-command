import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

function decode(prefix, dest) {
  const parts = readdirSync('scripts/street-b64')
    .filter((n) => n.startsWith(prefix))
    .sort();
  if (!parts.length) throw new Error('missing street payload ' + prefix);
  const b64 = parts.map((p) => readFileSync('scripts/street-b64/' + p, 'utf8')).join('').replace(/\s+/g, '');
  const buf = Buffer.from(b64, 'base64');
  writeFileSync(dest, buf);
  console.log('street-decode', dest, buf.length);
}

decode('StreetPlay.ts.b64.part', 'src/game/StreetPlay.ts');
decode('street-city.patch.b64.part', 'scripts/patches/street-city.patch');
decode('street-ui.patch.b64.part', 'scripts/patches/street-ui.patch');
decode('street-css.patch.b64.part', 'scripts/patches/street-css.patch');

const matPath = 'scripts/materialize-sources.mjs';
let mat = readFileSync(matPath, 'utf8');
const needle = "['city.patch', 'ui.patch', 'main.patch', 'css.patch']";
const next = "['city.patch', 'ui.patch', 'main.patch', 'css.patch', 'street-city.patch', 'street-ui.patch', 'street-css.patch']";
if (!mat.includes('street-city.patch')) {
  if (!mat.includes(needle)) throw new Error('materialize loop not found');
  mat = mat.replace(needle, next);
  mat = mat.replace(
    'materialize-sources: joined restore parts and applied decision-visible patches',
    'materialize-sources: joined restore parts and applied street-play patches'
  );
  writeFileSync(matPath, mat);
  console.log('street-decode: enabled street patches in materialize');
}
