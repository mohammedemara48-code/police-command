import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '../public/icons');
fs.mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function png(size, rgbaFn) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = rgbaFn(x, y, size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function icon(size) {
  return png(size, (x, y, s) => {
    const cx = s / 2,
      cy = s / 2;
    const dx = x - cx,
      dy = y - cy;
    const r = Math.hypot(dx, dy);
    if (r > s * 0.45) return [8, 16, 28, 255];
    if (r > s * 0.38) return [126, 200, 255, 255];
    const inShield =
      Math.abs(dx) < s * 0.22 &&
      dy > -s * 0.28 &&
      dy < s * 0.3 &&
      (dy < s * 0.1 || Math.abs(dx) < s * 0.22 * (1 - (dy - s * 0.1) / (s * 0.2)));
    if (inShield) return [46, 229, 157, 255];
    return [26, 90, 175, 255];
  });
}

// shield badge shared by all images: (dx, dy) relative to the badge centre, scaled by `k`
function badge(dx, dy, k) {
  const r = Math.hypot(dx, dy);
  if (r > k * 0.45) return null;
  if (r > k * 0.38) return [126, 200, 255, 255];
  const inShield =
    Math.abs(dx) < k * 0.22 &&
    dy > -k * 0.28 &&
    dy < k * 0.3 &&
    (dy < k * 0.1 || Math.abs(dx) < k * 0.22 * (1 - (dy - k * 0.1) / (k * 0.2)));
  return inShield ? [46, 229, 157, 255] : [26, 90, 175, 255];
}

/** Maskable icon: full-bleed background, badge inside the 80% safe zone. */
function maskable(size) {
  return png(size, (x, y, s) => badge(x - s / 2, y - s / 2, s * 0.62) ?? [8, 16, 28, 255]);
}

/** Wide social preview (og:image): pixel-art siren bar + badge on a night gradient (generated, no binary in git). */
function wide(w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const t = y / h;
      let c = [Math.round(5 + 10 * t), Math.round(11 + 24 * t), Math.round(20 + 44 * t), 255];
      // red/blue light bar across the top third
      const bar = y > h * 0.1 && y < h * 0.16;
      if (bar) c = x < w / 2 ? [235, 40, 70, 255] : [40, 110, 255, 255];
      // soft glow under the bar
      const gy = Math.abs(y - h * 0.13) / (h * 0.25);
      if (!bar && gy < 1) {
        const glow = (1 - gy) * 0.35;
        const tint = x < w / 2 ? [235, 40, 70] : [40, 110, 255];
        c = [0, 1, 2].map((i) => Math.round(c[i] * (1 - glow) + tint[i] * glow)).concat(255);
      }
      // street: road with dashed centre line
      if (y > h * 0.78) {
        c = [30, 34, 40, 255];
        if (Math.abs(y - h * 0.89) < 4 && Math.floor(x / 60) % 2 === 0) c = [255, 210, 61, 255];
      }
      const b = badge(x - w / 2, y - h * 0.47, h * 0.62);
      if (b) c = b;
      const o = y * (w * 4 + 1) + 1 + x * 4;
      raw[o] = c[0];
      raw[o + 1] = c[1];
      raw[o + 2] = c[2];
      raw[o + 3] = c[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

fs.writeFileSync(path.join(outDir, 'icon-192.png'), icon(192));
fs.writeFileSync(path.join(outDir, 'maskable-512.png'), maskable(512));
fs.writeFileSync(path.join(outDir, 'og-image.png'), wide(1200, 630));
fs.writeFileSync(path.join(outDir, 'icon-512.png'), icon(512));
console.log('icons generated');
