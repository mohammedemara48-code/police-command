/** Street furniture for the streamed city: tree and palm templates that are stamped out cheaply, lamps, and the shop-front atlas. */
import * as THREE from 'three';
import { quality } from '../config/Quality';
import { Batch, PROP_MATS as M } from './Environment';
import { palm, tree } from './Trees';
import { rng } from '../logic/roadnet';

type Template = Map<THREE.Material, THREE.BufferGeometry[]>;

function template(make: (b: Batch) => void): Template {
  const b = new Batch();
  make(b);
  return b.drain();
}

export class TreeKit {
  private trees: Template[] = [];
  private palms: Template[] = [];
  constructor() {
    const r = rng(77);
    for (let i = 0; i < 5; i++) this.trees.push(template((b) => tree(b, 0, 0, r)));
    // low quality keeps the small procedural palm; the others instance the real model per chunk (see Trees.palmInstances)
    if (quality === 'low') for (let i = 0; i < 3; i++) this.palms.push(template((b) => palm(b, 0, 0, 7 + r() * 2)));
  }
  private stamp(t: Template, b: Batch, x: number, z: number, rot: number, scale: number) {
    const m = new THREE.Matrix4().makeRotationY(rot).scale(new THREE.Vector3(scale, scale, scale));
    m.setPosition(x, 0, z);
    for (const [mat, geos] of t) for (const g of geos) b.add(g.clone().applyMatrix4(m), mat);
  }
  tree(b: Batch, x: number, z: number, seed: number) {
    this.stamp(this.trees[seed % this.trees.length]!, b, x, z, (seed * 2.399) % 6.28, 0.85 + ((seed * 7) % 10) / 30);
  }
  /** returns true when the palm was drawn into the batch (low quality); otherwise the caller instances it */
  palm(b: Batch, x: number, z: number, seed: number): boolean {
    if (!this.palms.length) return false;
    this.stamp(this.palms[seed % this.palms.length]!, b, x, z, (seed * 1.7) % 6.28, 1);
    return true;
  }
}

/** A street lamp at (x, z) whose arm reaches towards (dx, dz). Returns the lamp head position. */
export function lampAt(b: Batch, x: number, z: number, dx: number, dz: number, h = 5.2): THREE.Vector3 {
  const ry = Math.atan2(-dz, dx);
  b.box(M.metal, 0.14, h, 0.14, x, h / 2, z);
  b.box(M.metal, 0.3, 0.5, 0.3, x, 0.25, z);
  b.box(M.metal, 1.5, 0.07, 0.07, x + dx * 0.75, h - 0.05, z + dz * 0.75, ry);
  b.box(M.metal, 0.6, 0.1, 0.26, x + dx * 1.45, h - 0.12, z + dz * 1.45, ry);
  b.box(M.lampHead, 0.5, 0.04, 0.2, x + dx * 1.45, h - 0.19, z + dz * 1.45, ry);
  return new THREE.Vector3(x + dx * 1.45, h - 0.3, z + dz * 1.45);
}

/** Shop names (Egyptian street style) and the sign colour. */
export const SHOPS: [string, string][] = [
  ['جزارة الأمانة', '#b03a2e'],
  ['مكوجي النور', '#5d6d7e'],
  ['سوبر ماركت الحمد', '#e74c3c'],
  ['أدوات منزلية', '#2874a6'],
  ['صيدلية الشفاء', '#1e8449'],
  ['كشري التحرير', '#d35400'],
  ['فول وطعمية', '#b9770e'],
  ['حلواني الصفا', '#c2185b'],
  ['مخبز العيش البلدي', '#a0522d'],
  ['موبايلات الأهرام', '#2e86c1'],
  ['عصير قصب', '#7cb342'],
  ['كاوتش وبطاريات', '#424949'],
  ['ملابس الشباب', '#7d3c98'],
  ['خردوات أم هاشم', '#6e2c00'],
  ['قهوة الفن', '#6e4a2e'],
  ['مكتبة النهضة', '#9a7d0a'],
  ['أسماك البحر', '#1a5276'],
  ['عطارة الحسين', '#7e5109'],
  ['دهانات وحدايد', '#566573'],
  ['أحذية الهرم', '#5b2c6f'],
  ['بقالة التوحيد', '#117864'],
  ['نظارات النيل', '#1f618d'],
  ['حلاق الأسطى', '#922b21'],
  ['مفروشات الزهراء', '#8e44ad']
];
/** atlas cells: one open front per shop, then rolling shutters (closed shops) */
export const SHOP_COLS = 8;
export const SHOP_ROWS = 4;
export const SHUTTER0 = SHOPS.length;

let atlas: THREE.MeshStandardMaterial | null = null;
/** One texture holding sixteen shop fronts (sign, window with goods, door), so every shop in a chunk is one draw. */
export function shopAtlas(): THREE.MeshStandardMaterial {
  if (atlas) return atlas;
  const cw = 256,
    ch = 128;
  const c = document.createElement('canvas');
  c.width = cw * SHOP_COLS;
  c.height = ch * SHOP_ROWS;
  const g = c.getContext('2d')!;
  const r = rng(5);
  for (let i = 0; i < SHOP_COLS * SHOP_ROWS; i++) {
    const shut = i >= SHUTTER0;
    const [name, raw] = SHOPS[shut ? (i * 7) % SHOPS.length : i]!;
    const ox = (i % SHOP_COLS) * cw,
      oy = Math.floor(i / SHOP_COLS) * ch;
    const hsl = { h: 0, s: 0, l: 0 };
    new THREE.Color(raw).getHSL(hsl);
    const col = '#' + new THREE.Color().setHSL(hsl.h, hsl.s * 0.7, hsl.l * 0.9).getHexString();
    // plaster pier around the opening, a little dirty at the foot
    g.fillStyle = ['#cfc4ae', '#bfb39a', '#d8cdb8', '#b8ad99'][i % 4]!;
    g.fillRect(ox, oy, cw, ch);
    g.fillStyle = 'rgba(60,50,40,0.25)';
    g.fillRect(ox, oy + ch - 10, cw, 10);
    // sign board: coloured panel, light frame, the name in white, a small line under it
    const sy = oy + 3,
      sh = 36;
    g.fillStyle = col;
    g.fillRect(ox + 4, sy, cw - 8, sh);
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineWidth = 2;
    g.strokeRect(ox + 6, sy + 2, cw - 12, sh - 4);
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.direction = 'rtl';
    let fs = 26;
    g.font = `bold ${fs}px Cairo, Tahoma, Arial`;
    while (g.measureText(name).width > cw - 30 && fs > 14) g.font = `bold ${--fs}px Cairo, Tahoma, Arial`;
    g.fillText(name, ox + cw / 2, sy + sh / 2 + 1);
    const wx = ox + 8,
      wy = oy + 44,
      ww = cw - 16,
      wh = ch - 44;
    if (shut) {
      // rolling shutter: grey slats, a lock at the foot, a little graffiti or rust
      g.fillStyle = '#8f9496';
      g.fillRect(wx, wy, ww, wh);
      for (let y = wy; y < wy + wh; y += 4) {
        g.fillStyle = (y / 4) % 2 ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.22)';
        g.fillRect(wx, y, ww, 2);
      }
      g.fillStyle = '#3d3d3d';
      g.fillRect(wx, wy, ww, 5);
      g.fillRect(wx + ww / 2 - 5, wy + wh - 12, 10, 8);
      g.fillStyle = `rgba(${120 + r() * 60},70,30,0.25)`;
      g.fillRect(wx + r() * ww * 0.6, wy + wh * 0.5, ww * 0.3, wh * 0.4);
    } else {
      // open front: lit interior with shelves and goods, half the opening behind glass, a door
      const grad = g.createLinearGradient(0, wy, 0, wy + wh);
      grad.addColorStop(0, '#f3e6c4');
      grad.addColorStop(1, '#8a7650');
      g.fillStyle = grad;
      g.fillRect(wx, wy, ww, wh);
      for (let sI = 0; sI < 3; sI++) {
        const yy = wy + 10 + sI * (wh / 3);
        g.fillStyle = 'rgba(90,70,40,0.8)';
        g.fillRect(wx + 3, yy + 14, ww - 6, 3);
        for (let k = 0; k < 14; k++) {
          g.fillStyle = `hsl(${Math.floor(r() * 360)} ${45 + r() * 30}% ${35 + r() * 30}%)`;
          const bh = 6 + r() * 9;
          g.fillRect(wx + 5 + k * ((ww - 10) / 14), yy + 14 - bh, 8 + r() * 5, bh);
        }
      }
      // glass on the left part with a reflection; the shutter box rolled up over the opening
      g.fillStyle = 'rgba(120,150,170,0.35)';
      g.fillRect(wx, wy, ww * 0.55, wh);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.beginPath();
      g.moveTo(wx + 10, wy + wh);
      g.lineTo(wx + 40, wy);
      g.lineTo(wx + 55, wy);
      g.lineTo(wx + 25, wy + wh);
      g.fill();
      g.fillStyle = '#5a5e60';
      g.fillRect(wx, wy, ww, 6);
      g.strokeStyle = '#2b2b2b';
      g.lineWidth = 3;
      g.strokeRect(wx, wy, ww, wh);
      g.beginPath();
      g.moveTo(wx + ww * 0.55, wy);
      g.lineTo(wx + ww * 0.55, wy + wh);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  atlas = new THREE.MeshStandardMaterial({
    map: t,
    emissive: 0xffffff,
    emissiveMap: t,
    emissiveIntensity: 0.18,
    roughness: 0.8,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
  return atlas;
}
