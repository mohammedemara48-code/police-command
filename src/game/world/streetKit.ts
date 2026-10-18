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

export const SHOPS: [string, string][] = [
  ['صيدلية', '#2ecc71'],
  ['مخبز', '#f39c12'],
  ['كافيه', '#a0522d'],
  ['سوبر ماركت', '#e74c3c'],
  ['مطعم', '#e67e22'],
  ['ملابس', '#9b59b6'],
  ['موبايلات', '#3498db'],
  ['حلويات', '#ff6fa8'],
  ['بنك', '#16a085'],
  ['مكتبة', '#c0a050'],
  ['عصير', '#9acd32'],
  ['كشري', '#d35400'],
  ['مكوجي', '#5d6d7e'],
  ['خضار وفاكهة', '#27ae60'],
  ['قهوة', '#6e4a2e'],
  ['مفروشات', '#8e44ad']
];
export const SHOP_COLS = 4;
export const SHOP_ROWS = 4;

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
  SHOPS.forEach(([name, raw], i) => {
    const ox = (i % SHOP_COLS) * cw,
      oy = Math.floor(i / SHOP_COLS) * ch;
    const hsl = { h: 0, s: 0, l: 0 };
    new THREE.Color(raw).getHSL(hsl);
    const col = '#' + new THREE.Color().setHSL(hsl.h, hsl.s * 0.62, hsl.l * 0.86).getHexString();
    // plaster
    g.fillStyle = '#cfc4ae';
    g.fillRect(ox, oy, cw, ch);
    // sign band
    g.fillStyle = col;
    g.fillRect(ox + 6, oy + 4, cw - 12, 34);
    g.fillStyle = '#fff';
    g.font = 'bold 28px Cairo, Arial';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.direction = 'rtl';
    g.fillText(name, ox + cw / 2, oy + 22);
    // window: dark glass, warm light, shelves and goods
    const wx = ox + 10,
      wy = oy + 46,
      ww = cw * 0.62,
      wh = ch - 52;
    const grad = g.createLinearGradient(0, wy, 0, wy + wh);
    grad.addColorStop(0, '#3a3228');
    grad.addColorStop(1, '#6b5a3c');
    g.fillStyle = grad;
    g.fillRect(wx, wy, ww, wh);
    for (let s = 0; s < 3; s++) {
      g.fillStyle = 'rgba(240,220,170,0.55)';
      g.fillRect(wx + 4, wy + 8 + s * (wh / 3), ww - 8, 2);
      for (let k = 0; k < 7; k++) {
        g.fillStyle = `hsl(${Math.floor(r() * 360)} 55% ${40 + r() * 25}%)`;
        const bw = 7 + r() * 10;
        g.fillRect(wx + 6 + k * (ww / 7.4), wy + 10 + s * (wh / 3) - (6 + r() * 9) + 12, bw, 6 + r() * 9);
      }
    }
    g.strokeStyle = '#2b2b2b';
    g.lineWidth = 3;
    g.strokeRect(wx, wy, ww, wh);
    // door
    const dx = ox + cw * 0.72;
    g.fillStyle = '#2d2a26';
    g.fillRect(dx, oy + 46, cw * 0.22, ch - 46);
    g.fillStyle = 'rgba(255,230,170,0.35)';
    g.fillRect(dx + 5, oy + 52, cw * 0.22 - 10, ch - 72);
    g.fillStyle = '#c0a050';
    g.fillRect(dx + cw * 0.22 - 12, oy + 92, 3, 10);
  });
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
