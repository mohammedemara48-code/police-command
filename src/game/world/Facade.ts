/**
 * Facade textures for the apartment blocks: one 3 m x 3 m bay of one floor, painted onto a canvas on top of real wall photos
 * (Poly Haven, CC0): plaster, formwork concrete and red-brick infill. Windows, shutters, sills and stains are drawn on top.
 */
import * as THREE from 'three';
import { Q } from '../config/Quality';
import type { FacadeStyle } from '../logic/districts';

const BASE = (import.meta.env?.BASE_URL ?? '/') + 'textures/';
type Wall = 'stucco' | 'rough' | 'concrete' | 'peel' | 'brick';
const WALLS: Wall[] = ['stucco', 'rough', 'concrete', 'peel', 'brick'];
const imgs: Partial<Record<Wall, HTMLImageElement>> = {};
const redraw = new Set<() => void>();
let loading = false;

function loadWalls() {
  if (loading || typeof Image === 'undefined') return;
  loading = true;
  for (const w of WALLS) {
    const im = new Image();
    im.onload = () => {
      imgs[w] = im;
      for (const f of redraw) f();
    };
    im.src = `${BASE}wall_${w}.webp`;
  }
}

function rng(seed: number) {
  let a = (seed * 2654435761) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Paint a wall photo over the whole canvas, shifted with wrap-around so every variant looks different but still tiles. */
function photo(
  g: CanvasRenderingContext2D,
  S: number,
  wall: Wall,
  r: () => number,
  rect?: [number, number, number, number]
) {
  const im = imgs[wall];
  const [x, y, w, h] = rect ?? [0, 0, S, S];
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  if (!im) {
    g.fillStyle = wall === 'brick' ? '#a4543a' : wall === 'concrete' ? '#8e8b85' : '#d8d0c0';
    g.fillRect(x, y, w, h);
  } else {
    const ox = Math.floor(r() * S),
      oy = Math.floor(r() * S);
    const flip = r() < 0.5;
    g.translate(flip ? S : 0, 0);
    g.scale(flip ? -1 : 1, 1);
    const ts = wall === 'brick' ? S / 1.6 : S;
    for (let ix = -1; ix <= Math.ceil(S / ts); ix++)
      for (let iy = -1; iy <= Math.ceil(S / ts); iy++)
        g.drawImage(im, (((ox % ts) + ts) % ts) + ix * ts - ts, (((oy % ts) + ts) % ts) + iy * ts - ts, ts, ts);
  }
  g.restore();
}

function blotches(g: CanvasRenderingContext2D, S: number, r: () => number, n: number, a: number) {
  for (let i = 0; i < n; i++) {
    const x = r() * S,
      y = r() * S,
      rad = S * (0.12 + r() * 0.25);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const dark = r() < 0.7;
    gr.addColorStop(0, dark ? `rgba(60,50,40,${a})` : `rgba(255,250,240,${a * 0.8})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}

/** Soft vertical rain streaks running down from (x, y). */
function streaks(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  len: number,
  r: () => number,
  a: number
) {
  const n = Math.max(2, Math.round(w / 3));
  for (let i = 0; i < n; i++) {
    const sx = x + (i + r()) * (w / n);
    const l = len * (0.4 + r() * 0.6);
    const gr = g.createLinearGradient(0, y, 0, y + l);
    gr.addColorStop(0, `rgba(70,55,40,${a * (0.5 + r() * 0.5)})`);
    gr.addColorStop(1, 'rgba(70,55,40,0)');
    g.fillStyle = gr;
    g.fillRect(sx, y, 1 + r() * 1.6, l);
  }
}

function glass(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: () => number) {
  const gr = g.createLinearGradient(x, y, x + w * 0.4, y + h);
  gr.addColorStop(0, '#6d8798');
  gr.addColorStop(0.45, '#2f414d');
  gr.addColorStop(1, '#14191e');
  g.fillStyle = gr;
  g.fillRect(x, y, w, h);
  // sky glint across the pane
  g.fillStyle = 'rgba(200,225,240,0.22)';
  g.beginPath();
  g.moveTo(x + w * 0.1, y);
  g.lineTo(x + w * 0.5, y);
  g.lineTo(x + w * 0.15, y + h);
  g.lineTo(x - w * 0.15, y + h);
  g.closePath();
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fill();
  g.restore();
  // a lit room or a curtain behind some panes
  const k = r();
  if (k < 0.28) {
    g.fillStyle = `rgba(${200 + Math.floor(r() * 40)},${190 + Math.floor(r() * 40)},${170 + Math.floor(r() * 40)},0.75)`;
    g.fillRect(x, y, w * (0.35 + r() * 0.3), h * 0.92);
  } else if (k < 0.42) {
    g.fillStyle = 'rgba(210,200,185,0.55)';
    g.fillRect(x, y, w, h);
  }
}

function drawInformal(g: CanvasRenderingContext2D, S: number, seed: number, r: () => number, brick: boolean) {
  const u = S / 128;
  photo(g, S, brick ? 'brick' : seed % 2 ? 'stucco' : 'rough', r);
  if (!brick && seed % 3 === 2) {
    // patch where the paint has peeled
    g.globalAlpha = 0.45;
    photo(g, S, 'peel', r, [r() * 60 * u, r() * 50 * u, 60 * u, 50 * u]);
    g.globalAlpha = 1;
  }
  blotches(g, S, r, 5, 0.1);
  // concrete frame: a column at the left edge of the bay and the floor slab at the bottom
  photo(g, S, 'concrete', r, [0, 0, 9 * u, S]);
  photo(g, S, 'concrete', r, [0, 114 * u, S, 14 * u]);
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.fillRect(9 * u, 0, 1.5 * u, 114 * u);
  g.fillRect(0, 114 * u, S, 1.5 * u);
  g.fillStyle = 'rgba(255,255,255,0.14)';
  g.fillRect(0, 128 * u - 1.2 * u, S, 1.2 * u);
  // shadow under the slab above
  const sh = g.createLinearGradient(0, 0, 0, 14 * u);
  sh.addColorStop(0, 'rgba(30,22,16,0.32)');
  sh.addColorStop(1, 'rgba(30,22,16,0)');
  g.fillStyle = sh;
  g.fillRect(9 * u, 0, S, 14 * u);
  // window
  const wx = 34 * u,
    wy = 30 * u,
    ww = 60 * u,
    wh = 62 * u;
  if (!brick) {
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(wx - 3 * u, wy - 3 * u, ww + 6 * u, wh + 3 * u);
  }
  g.fillStyle = '#0f1214';
  g.fillRect(wx - u, wy - u, ww + 2 * u, wh + 2 * u);
  glass(g, wx + 2 * u, wy + 2 * u, ww - 4 * u, wh - 4 * u, r);
  // aluminium frame and sliding mullion
  g.strokeStyle = seed % 4 === 0 ? '#5a4332' : '#cfcfc8';
  g.lineWidth = 2.2 * u;
  g.strokeRect(wx + u, wy + u, ww - 2 * u, wh - 2 * u);
  g.beginPath();
  g.moveTo(wx + ww / 2, wy);
  g.lineTo(wx + ww / 2, wy + wh);
  g.stroke();
  if (seed % 3 === 0) {
    // rolled wooden shutter, half down
    g.fillStyle = '#6f4a2c';
    const dh = wh * (0.35 + r() * 0.3);
    g.fillRect(wx + 2 * u, wy + 2 * u, ww - 4 * u, dh);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let y = wy + 2 * u; y < wy + dh; y += 4 * u) g.fillRect(wx + 2 * u, y, ww - 4 * u, 0.9 * u);
  }
  // sill and what runs down from it
  g.fillStyle = '#b9b5ac';
  g.fillRect(wx - 5 * u, wy + wh, ww + 10 * u, 4.5 * u);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(wx - 5 * u, wy + wh + 4.5 * u, ww + 10 * u, 2 * u);
  streaks(g, wx - 5 * u, wy + wh + 5 * u, ww + 10 * u, 22 * u, r, 0.22);
  streaks(g, wx, wy - 2 * u, ww, 10 * u, r, 0.1);
  grime(g, S, 0.1);
}

function drawKhedival(g: CanvasRenderingContext2D, S: number, seed: number, r: () => number) {
  const u = S / 128;
  photo(g, S, seed % 2 ? 'stucco' : 'rough', r);
  blotches(g, S, r, 6, 0.1);
  // pilasters at the bay edges, a projecting cornice band at the bottom
  const edge = g.createLinearGradient(0, 0, 14 * u, 0);
  edge.addColorStop(0, 'rgba(255,250,235,0.35)');
  edge.addColorStop(0.7, 'rgba(255,250,235,0.18)');
  edge.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = edge;
  g.fillRect(0, 0, 14 * u, S);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(S - 3 * u, 0, 3 * u, S);
  g.fillStyle = 'rgba(255,248,230,0.4)';
  g.fillRect(0, 112 * u, S, 3 * u);
  const cor = g.createLinearGradient(0, 115 * u, 0, 128 * u);
  cor.addColorStop(0, 'rgba(0,0,0,0.38)');
  cor.addColorStop(1, 'rgba(0,0,0,0.12)');
  g.fillStyle = cor;
  g.fillRect(0, 115 * u, S, 13 * u);
  const sh = g.createLinearGradient(0, 0, 0, 12 * u);
  sh.addColorStop(0, 'rgba(30,22,16,0.4)');
  sh.addColorStop(1, 'rgba(30,22,16,0)');
  g.fillStyle = sh;
  g.fillRect(0, 0, S, 12 * u);
  // tall French window with an arched head and a moulded surround
  const wx = 38 * u,
    ww = 54 * u,
    top = 12 * u,
    bot = 108 * u;
  const arc = ww / 2;
  const path = (inset: number) => {
    g.beginPath();
    g.moveTo(wx + inset, bot);
    g.lineTo(wx + inset, top + arc);
    g.arc(wx + ww / 2, top + arc, arc - inset, Math.PI, 0);
    g.lineTo(wx + ww - inset, bot);
    g.closePath();
  };
  g.fillStyle = 'rgba(0,0,0,0.3)';
  path(-6 * u);
  g.fill();
  g.fillStyle = 'rgba(255,245,222,0.55)';
  path(-4 * u);
  g.fill();
  g.fillStyle = '#0d0f11';
  path(0);
  g.fill();
  g.save();
  path(3 * u);
  g.clip();
  glass(g, wx, top, ww, bot - top, r);
  // muntins
  g.strokeStyle = 'rgba(225,220,205,0.85)';
  g.lineWidth = 1.2 * u;
  for (let y = top + 24 * u; y < bot; y += 24 * u) {
    g.beginPath();
    g.moveTo(wx, y);
    g.lineTo(wx + ww, y);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(wx + ww / 2, top);
  g.lineTo(wx + ww / 2, bot);
  g.stroke();
  g.restore();
  // louvered shutters folded back on both sides
  if (seed % 3 !== 1) {
    for (const sx of [wx - 14 * u, wx + ww]) {
      g.fillStyle = seed % 2 ? '#4d5a40' : '#5b3f28';
      g.fillRect(sx, top + 22 * u, 14 * u, bot - top - 22 * u);
      g.fillStyle = 'rgba(0,0,0,0.38)';
      for (let y = top + 24 * u; y < bot; y += 3.2 * u) g.fillRect(sx + u, y, 12 * u, 1 * u);
    }
  }
  // wrought-iron balcony rail across the lower part of the window
  g.strokeStyle = '#17181a';
  g.lineWidth = 1.1 * u;
  const ry = 78 * u;
  for (let x = wx - 8 * u; x <= wx + ww + 8 * u; x += 3.6 * u) {
    g.beginPath();
    g.moveTo(x, ry);
    g.lineTo(x, bot + 2 * u);
    g.stroke();
  }
  g.lineWidth = 2 * u;
  g.beginPath();
  g.moveTo(wx - 9 * u, ry);
  g.lineTo(wx + ww + 9 * u, ry);
  g.moveTo(wx - 9 * u, bot + u);
  g.lineTo(wx + ww + 9 * u, bot + u);
  g.stroke();
  streaks(g, wx - 8 * u, bot + 2 * u, ww + 16 * u, 16 * u, r, 0.2);
  grime(g, S, 0.12);
}

function drawModern(g: CanvasRenderingContext2D, S: number, seed: number, r: () => number) {
  const u = S / 128;
  photo(g, S, seed % 2 ? 'rough' : 'stucco', r);
  blotches(g, S, r, 4, 0.08);
  // 1960s-70s block: a continuous ribbon window above a solid balcony parapet, concrete slab line
  photo(g, S, 'concrete', r, [0, 108 * u, S, 20 * u]);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(0, 108 * u, S, 1.6 * u);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.fillRect(0, 126 * u, S, 2 * u);
  const wy = 24 * u,
    wh = 50 * u;
  g.fillStyle = '#101214';
  g.fillRect(0, wy - 2 * u, S, wh + 4 * u);
  const panes = seed % 2 ? 2 : 1;
  const pw = S / panes;
  for (let i = 0; i < panes; i++) glass(g, i * pw + 2 * u, wy, pw - 4 * u, wh, r);
  g.strokeStyle = '#c9c9c2';
  g.lineWidth = 2.4 * u;
  for (let i = 0; i <= panes; i++) {
    g.beginPath();
    g.moveTo(i * pw, wy - u);
    g.lineTo(i * pw, wy + wh + u);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(0, wy + wh * 0.5);
  g.lineTo(S, wy + wh * 0.5);
  g.stroke();
  // balcony parapet: lighter solid band with a coping
  g.fillStyle = 'rgba(255,255,250,0.18)';
  g.fillRect(0, 80 * u, S, 28 * u);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0, 78 * u, S, 2.4 * u);
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.fillRect(0, 76 * u, S, 2 * u);
  const sh = g.createLinearGradient(0, 0, 0, 14 * u);
  sh.addColorStop(0, 'rgba(30,22,16,0.3)');
  sh.addColorStop(1, 'rgba(30,22,16,0)');
  g.fillStyle = sh;
  g.fillRect(0, 0, S, 14 * u);
  streaks(g, 0, 108 * u, S, 14 * u, r, 0.18);
  grime(g, S, 0.1);
}

/** Dusty lower edge of the bay so the repeating floors do not look freshly painted. */
function grime(g: CanvasRenderingContext2D, S: number, a: number) {
  const gr = g.createLinearGradient(0, 0, 0, S);
  gr.addColorStop(0, 'rgba(70,58,44,0)');
  gr.addColorStop(1, `rgba(70,58,44,${a})`);
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
}

const sizeFor = () => (Q.hdri ? 512 : 256);

function paint(c: HTMLCanvasElement, style: FacadeStyle, seed: number) {
  const g = c.getContext('2d')!;
  const r = rng(seed * 97 + style.length * 13 + 5);
  g.clearRect(0, 0, c.width, c.height);
  if (style === 'khedival') drawKhedival(g, c.width, seed, r);
  else if (style === 'modern') drawModern(g, c.width, seed, r);
  else drawInformal(g, c.width, seed, r, style === 'brick');
}

const texCache = new Map<string, THREE.CanvasTexture>();
const cache = new Map<string, THREE.MeshStandardMaterial>();

function facadeTexture(style: FacadeStyle, seed: number) {
  const key = `${style}:${seed}`;
  let tex = texCache.get(key);
  if (!tex) {
    const c = document.createElement('canvas');
    c.width = c.height = sizeFor();
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = Q.shadows ? 8 : 2;
    const t = tex;
    const draw = () => {
      paint(c, style, seed);
      t.needsUpdate = true;
    };
    draw();
    redraw.add(draw);
    texCache.set(key, tex);
  }
  return tex;
}

/**
 * Photo facade tiles (one storey each, generated with Higgsfield for this game): width / height of the tile, so the
 * texture keeps its proportions on the 3 m bay x 3 m floor UVs of `wallGeo`.
 */
const PHOTO: Record<FacadeStyle, number> = { brick: 1.009, informal: 1.873, khedival: 1.224, modern: 1.758 };
const BAY_M = 3;
const FLOOR_M = 3;
const photoCache = new Map<string, THREE.Texture>();

function photoTexture(style: FacadeStyle, flip: boolean, onLoad: (t: THREE.Texture) => void) {
  const key = `${style}:${flip}`;
  const hit = photoCache.get(key);
  if (hit) {
    if (hit.image) onLoad(hit);
    else hit.userData.waiting = [...((hit.userData.waiting as ((t: THREE.Texture) => void)[]) ?? []), onLoad];
    return;
  }
  const t = new THREE.Texture();
  t.userData.waiting = [onLoad];
  photoCache.set(key, t);
  if (typeof Image === 'undefined') return;
  const im = new Image();
  im.onload = () => {
    t.image = im;
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = Q.shadows ? 8 : 2;
    // u runs one bay per unit, v one floor per unit: stretch so the tile keeps its own aspect ratio
    t.repeat.set(((flip ? -1 : 1) * BAY_M) / (PHOTO[style] * FLOOR_M), 1);
    t.needsUpdate = true;
    for (const f of t.userData.waiting as ((t: THREE.Texture) => void)[]) f(t);
    t.userData.waiting = [];
  };
  im.src = `${BASE}facade_${style}.webp`;
}

/**
 * Facade material for a style, tint and seed. It starts with the hand-painted canvas bay and switches to the photo tile
 * once that has loaded, so a failed download still leaves a painted building.
 */
export function facadeMaterial(style: FacadeStyle, tint: number, seed = 0) {
  loadWalls();
  const flip = seed % 2 === 1;
  const key = `${style}:${style === 'brick' ? 0 : tint}:${flip ? 1 : 0}`;
  let m = cache.get(key);
  if (!m) {
    const mat = new THREE.MeshStandardMaterial({
      map: facadeTexture(style, seed % 3),
      color: style === 'brick' ? 0xffffff : tint,
      roughness: 0.94,
      metalness: 0,
      vertexColors: true
    });
    photoTexture(style, flip, (t) => {
      mat.map = t;
      mat.color.setHex(0xffffff);
      mat.needsUpdate = true;
    });
    m = mat;
    cache.set(key, m);
  }
  return m;
}
