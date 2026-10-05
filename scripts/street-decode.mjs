import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';

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

function preferCommitted(path, minBytes, decodePrefix) {
  if (existsSync(path) && statSync(path).size >= minBytes) {
    console.log('street-decode: using committed', path, statSync(path).size);
    return true;
  }
  decode(decodePrefix, path);
  return false;
}

preferCommitted('src/game/StreetPlay.ts', 20000, 'StreetPlay.ts.b64.part');
preferCommitted('scripts/patches/street-city.patch', 500, 'street-city.patch.b64.part');
preferCommitted('scripts/patches/street-ui.patch', 500, 'street-ui.patch.b64.part');
preferCommitted('scripts/patches/street-css.patch', 1000, 'street-css.patch.b64.part');

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
