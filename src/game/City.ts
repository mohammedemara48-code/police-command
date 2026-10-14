/** Open city grid: avenues + cross streets, district blocks built from instanced boxes (one draw call per block, culled per chunk). */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const AVENUES_X = [-120, -60, 0, 60, 120];
export const CROSS_Z = [-96, -45, 50, 145, 236];
export const ROAD_W = 9.2;
export const CITY = { x0: -125, x1: 125, z0: -100, z1: 240 };

export type District = 'suburb' | 'downtown' | 'port' | 'corniche';
export const districtAt = (z: number): District =>
  z < -45 ? 'suburb' : z < 50 ? 'downtown' : z < 145 ? 'port' : 'corniche';
export const DISTRICT_NAMES: Record<District, string> = {
  suburb: 'الضاحية',
  downtown: 'وسط البلد',
  port: 'الميناء',
  corniche: 'الكورنيش'
};

interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}
export const ROADS: Rect[] = [
  ...AVENUES_X.map((x) => ({ x0: x - ROAD_W / 2, x1: x + ROAD_W / 2, z0: CITY.z0, z1: CITY.z1 })),
  ...CROSS_Z.map((z) => ({ x0: CITY.x0, x1: CITY.x1, z0: z - ROAD_W / 2, z1: z + ROAD_W / 2 }))
];

/** true when (x,z) is on a road (pad = extra margin, e.g. sidewalks for pedestrians). */
export function onRoad(x: number, z: number, pad = 0) {
  for (const r of ROADS) if (x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad) return true;
  return false;
}
/** cross streets cut through the main-avenue building rows */
export const nearCross = (z: number, m = 8) => CROSS_Z.some((c) => Math.abs(c - z) < m);

function windowTex() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 64, 128);
  for (let y = 6; y < 128; y += 16)
    for (let x = 6; x < 64; x += 14) {
      const on = Math.random() < 0.45;
      g.fillStyle = on ? (Math.random() < 0.5 ? '#ffd890' : '#bfe0ff') : '#11161c';
      g.fillRect(x, y, 8, 9);
    }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const PALETTE: Record<District, number[]> = {
  suburb: [0xe8d8c0, 0xd8b890, 0xc8d0c0, 0xf0e0d0, 0xb8a080],
  downtown: [0x8a94a0, 0x6a7888, 0xa0a8b4, 0x56606c, 0x9098a8],
  port: [0xc0392b, 0x2e86c1, 0x27ae60, 0xd68910, 0x7f8c8d],
  corniche: [0xf5e6c8, 0xe8c9a0, 0xffffff, 0xd4b896, 0xc0d8e0]
};

export function buildCity(group: THREE.Group, low: boolean) {
  const rnd = mulberry(7);
  // roads and sidewalks (main avenue already exists in StreetPlay; skip x=0)
  const roadGeos: THREE.BufferGeometry[] = [];
  const walkGeos: THREE.BufferGeometry[] = [];
  const lineGeos: THREE.BufferGeometry[] = [];
  const add = (arr: THREE.BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    arr.push(g);
  };
  for (const x of AVENUES_X) {
    if (x === 0) continue;
    const L = CITY.z1 - CITY.z0;
    add(roadGeos, ROAD_W, 0.08, L, x, 0.04, (CITY.z0 + CITY.z1) / 2);
    for (const s of [-1, 1]) add(walkGeos, 2.4, 0.14, L, x + s * (ROAD_W / 2 + 1.2), 0.07, (CITY.z0 + CITY.z1) / 2);
    for (let z = CITY.z0 + 4; z < CITY.z1; z += 8) if (!nearCross(z, 6)) add(lineGeos, 0.16, 0.02, 3.2, x, 0.1, z);
  }
  for (const z of CROSS_Z) {
    const L = CITY.x1 - CITY.x0;
    add(roadGeos, L, 0.085, ROAD_W, 0, 0.045, z);
    for (const s of [-1, 1]) add(walkGeos, L, 0.14, 2.4, 0, 0.07, z + s * (ROAD_W / 2 + 1.2));
    for (let x = CITY.x0 + 4; x < CITY.x1; x += 8)
      if (!AVENUES_X.some((a) => Math.abs(a - x) < 6)) add(lineGeos, 3.2, 0.02, 0.16, x, 0.1, z);
  }
  const mk = (geos: THREE.BufferGeometry[], mat: THREE.Material) => {
    const m = new THREE.Mesh(mergeGeometries(geos, false)!, mat);
    m.receiveShadow = true;
    m.userData.city = true;
    group.add(m);
    geos.forEach((g) => g.dispose());
  };
  mk(roadGeos, new THREE.MeshStandardMaterial({ color: 0x3b4048, roughness: 0.82, metalness: 0.05 }));
  mk(walkGeos, new THREE.MeshStandardMaterial({ color: 0x9a9ea4, roughness: 0.8 }));
  mk(lineGeos, new THREE.MeshStandardMaterial({ color: 0xf0d060, emissive: 0x886600, emissiveIntensity: 0.55 }));

  // ground plane for block interiors
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.x1 - CITY.x0 + 60, CITY.z1 - CITY.z0 + 60),
    new THREE.MeshStandardMaterial({ color: 0x4d5a48, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0.005, (CITY.z0 + CITY.z1) / 2);
  group.add(ground);

  // blocks: one InstancedMesh per block (a chunk), so off-screen blocks are culled as a unit
  const tex = windowTex();
  const bmat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.75,
    emissive: 0xffffff,
    emissiveMap: tex,
    emissiveIntensity: 0.9
  });
  const flat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  box.translate(0, 0.5, 0);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  let blocks = 0;
  for (let i = 0; i < AVENUES_X.length - 1; i++) {
    for (let j = 0; j < CROSS_Z.length - 1; j++) {
      const bx0 = AVENUES_X[i] + ROAD_W / 2 + 3,
        bx1 = AVENUES_X[i + 1] - ROAD_W / 2 - 3;
      const bz0 = CROSS_Z[j] + ROAD_W / 2 + 3,
        bz1 = CROSS_Z[j + 1] - ROAD_W / 2 - 3;
      const midZ = (bz0 + bz1) / 2;
      const d = districtAt(midZ);
      const items: { x: number; z: number; w: number; dd: number; h: number; c: number; flat?: boolean }[] = [];
      const step = d === 'downtown' ? 13 : d === 'suburb' ? 11 : 12;
      for (let x = bx0; x < bx1 - 4; x += step) {
        for (let z = bz0; z < bz1 - 4; z += step) {
          // keep the existing main-avenue rows untouched
          if (Math.abs(x + step / 2) < 24 && i >= 1 && i <= 2) continue;
          const edge = x - bx0 < step || bx1 - x < step * 1.5 || z - bz0 < step || bz1 - z < step * 1.5;
          if (!edge && d !== 'downtown' && d !== 'port') continue; // courtyards in residential blocks
          const w = step - 2 - rnd() * 2,
            dd = step - 2 - rnd() * 2;
          const pal = PALETTE[d];
          const c = pal[Math.floor(rnd() * pal.length)];
          if (d === 'port') {
            // container stacks + warehouses
            if (rnd() < 0.6) {
              items.push({
                x: x + w / 2,
                z: z + dd / 2,
                w: 2.4,
                dd: 6,
                h: 2.6 * (1 + Math.floor(rnd() * 3)),
                c,
                flat: true
              });
              continue;
            }
            items.push({ x: x + w / 2, z: z + dd / 2, w, dd, h: 6 + rnd() * 3, c: 0x8d9399 });
          } else {
            const h = d === 'downtown' ? 14 + rnd() * 34 : d === 'suburb' ? 4 + rnd() * 4 : 6 + rnd() * 10;
            items.push({ x: x + w / 2, z: z + dd / 2, w, dd, h, c });
          }
        }
      }
      if (!items.length) continue;
      for (const isFlat of [false, true]) {
        const list = items.filter((t) => !!t.flat === isFlat);
        if (!list.length) continue;
        const im = new THREE.InstancedMesh(box, isFlat ? flat : bmat, list.length);
        list.forEach((t, k) => {
          m4.makeScale(t.w, t.h, t.dd).setPosition(t.x, 0, t.z);
          im.setMatrixAt(k, m4);
          im.setColorAt(k, col.setHex(t.c));
        });
        im.computeBoundingSphere();
        im.castShadow = !low && isFlat;
        im.receiveShadow = false;
        im.userData.city = true;
        group.add(im);
        blocks++;
      }
    }
  }
  // water along the corniche edge
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 60),
    new THREE.MeshStandardMaterial({ color: 0x1d4e6e, roughness: 0.2, metalness: 0.3 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.02, CITY.z1 + 34);
  group.add(water);
  return blocks;
}

/** whole-city minimap */
export function drawCityMap(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  dots: { x: number; z: number; c: string; r: number }[]
) {
  const sx = (x: number) => 8 + ((x - CITY.x0) / (CITY.x1 - CITY.x0)) * (w - 16);
  const sz = (z: number) => h - 8 - ((z - CITY.z0) / (CITY.z1 - CITY.z0)) * (h - 16);
  ctx.fillStyle = 'rgba(6,12,20,0.85)';
  ctx.fillRect(0, 0, w, h);
  const bands: [District, number, number, string][] = [
    ['suburb', CITY.z0, -45, '#1d2a1e'],
    ['downtown', -45, 50, '#1e2230'],
    ['port', 50, 145, '#2a2418'],
    ['corniche', 145, CITY.z1, '#18283a']
  ];
  for (const [, a, b, c] of bands) {
    ctx.fillStyle = c;
    ctx.fillRect(8, sz(b), w - 16, sz(a) - sz(b));
  }
  ctx.fillStyle = '#5c6878';
  for (const r of ROADS)
    ctx.fillRect(sx(r.x0), sz(r.z1), Math.max(2, sx(r.x1) - sx(r.x0)), Math.max(2, sz(r.z0) - sz(r.z1)));
  ctx.font = '10px Cairo, sans-serif';
  ctx.fillStyle = '#9fb3c8';
  ctx.textAlign = 'right';
  for (const [d, a, b] of bands) ctx.fillText(DISTRICT_NAMES[d], w - 10, (sz(a) + sz(b)) / 2 + 3);
  for (const p of dots) {
    ctx.fillStyle = p.c;
    ctx.beginPath();
    ctx.arc(sx(p.x), sz(p.z), p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  return { sx, sz };
}

function mulberry(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ===================== road graph + A* =====================
/** Intersections of every avenue with every cross street; edges run along the roads. */
export interface RNode {
  id: number;
  x: number;
  z: number;
  n: number[];
}
export const NODES: RNode[] = [];
for (let i = 0; i < AVENUES_X.length; i++)
  for (let j = 0; j < CROSS_Z.length; j++)
    NODES.push({ id: i * CROSS_Z.length + j, x: AVENUES_X[i], z: CROSS_Z[j], n: [] });
for (let i = 0; i < AVENUES_X.length; i++)
  for (let j = 0; j < CROSS_Z.length; j++) {
    const id = i * CROSS_Z.length + j;
    if (j + 1 < CROSS_Z.length) {
      NODES[id].n.push(id + 1);
      NODES[id + 1].n.push(id);
    }
    if (i + 1 < AVENUES_X.length) {
      NODES[id].n.push(id + CROSS_Z.length);
      NODES[id + CROSS_Z.length].n.push(id);
    }
  }

export function nearestNode(x: number, z: number) {
  let best = NODES[0],
    bd = Infinity;
  for (const n of NODES) {
    const d = (n.x - x) ** 2 + (n.z - z) ** 2;
    if (d < bd) {
      bd = d;
      best = n;
    }
  }
  return best;
}

/** A* over the intersection grid. Returns waypoints (x,z) from the start's nearest node to the goal point. */
export function findPath(fx: number, fz: number, tx: number, tz: number): { x: number; z: number }[] {
  const s = nearestNode(fx, fz),
    g = nearestNode(tx, tz);
  const open = new Set<number>([s.id]);
  const came = new Map<number, number>();
  const gs = new Map<number, number>([[s.id, 0]]);
  const h = (a: RNode) => Math.abs(a.x - g.x) + Math.abs(a.z - g.z);
  const fs = new Map<number, number>([[s.id, h(s)]]);
  while (open.size) {
    let cur = -1,
      cf = Infinity;
    for (const id of open) {
      const f = fs.get(id) ?? Infinity;
      if (f < cf) {
        cf = f;
        cur = id;
      }
    }
    if (cur === g.id) break;
    open.delete(cur);
    const c = NODES[cur];
    for (const nb of c.n) {
      const t = (gs.get(cur) ?? 0) + Math.abs(NODES[nb].x - c.x) + Math.abs(NODES[nb].z - c.z);
      if (t < (gs.get(nb) ?? Infinity)) {
        came.set(nb, cur);
        gs.set(nb, t);
        fs.set(nb, t + h(NODES[nb]));
        open.add(nb);
      }
    }
  }
  const out: { x: number; z: number }[] = [];
  let k: number | undefined = g.id;
  while (k !== undefined) {
    out.unshift({ x: NODES[k].x, z: NODES[k].z });
    k = came.get(k);
    if (k === s.id) {
      out.unshift({ x: s.x, z: s.z });
      break;
    }
  }
  // skip the first node if we are already past it toward the second
  if (out.length > 1 && Math.hypot(out[1].x - fx, out[1].z - fz) < Math.hypot(out[1].x - out[0].x, out[1].z - out[0].z))
    out.shift();
  out.push({ x: tx, z: tz });
  return out;
}

/** a node far from (x,z), for fleeing */
export function farNode(x: number, z: number, rnd = Math.random) {
  const c = NODES.filter((n) => Math.hypot(n.x - x, n.z - z) > 90);
  return c[Math.floor(rnd() * c.length)] ?? NODES[0];
}

/** move (p) toward waypoint list w at speed; returns heading or null when the path is finished */
export function followPath(p: { x: number; z: number }, w: { x: number; z: number }[], step: number): number | null {
  while (w.length) {
    const t = w[0];
    const dx = t.x - p.x,
      dz = t.z - p.z,
      d = Math.hypot(dx, dz);
    if (d < 1.2) {
      w.shift();
      continue;
    }
    const k = Math.min(1, step / d);
    p.x += dx * k;
    p.z += dz * k;
    return Math.atan2(dx, dz);
  }
  return null;
}
