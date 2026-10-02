import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const encDir = path.join(root, 'scripts/encoded');
if (!fs.existsSync(encDir)) process.exit(0);

const names = new Set();
for (const name of fs.readdirSync(encDir)) {
  if (name.endsWith('.b64') && !name.includes('.part')) names.add(name);
  const m = name.match(/^(.*\.b64)\.part\d+$/);
  if (m) names.add(m[1]);
}

for (const name of [...names].sort()) {
  const parts = fs
    .readdirSync(encDir)
    .filter((n) => n.startsWith(name + '.part'))
    .sort();
  let b64;
  if (parts.length) {
    b64 = parts.map((p) => fs.readFileSync(path.join(encDir, p), 'utf8')).join('');
  } else {
    b64 = fs.readFileSync(path.join(encDir, name), 'utf8');
  }
  const rel = name.replace(/__/g, '/').replace(/\.b64$/, '');
  const out = path.join(root, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const buf = Buffer.from(b64.replace(/\s+/g, ''), 'base64');
  fs.writeFileSync(out, buf);
  const hash = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12);
  console.log(`decoded ${rel} (${buf.length} bytes, sha256=${hash})`);
}
