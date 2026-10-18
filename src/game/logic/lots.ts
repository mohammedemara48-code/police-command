/**
 * Building lots of the open city (pure, unit-tested): rows of plots along every street, set back behind the pavement,
 * never on a road, in the river or on top of each other. Planned once for the whole world, so chunk borders always agree.
 */
import { PAVEMENT, type District } from './cairo';
import { hash01 } from './districts';
import { inRiver, net, rng, type REdge } from './roadnet';
import { STATION_BOX } from './station';
import { TOWER_BOX, lionBox, lions } from './monuments';
import type { OBB } from './collide';

export interface Lot extends OBB {
  id: number;
  /** building height in metres */
  h: number;
  seed: number;
  district: District;
  /** a shop front on the street side */
  shop: boolean;
  /** held back for something else (the police station): solid, but no apartment block is built */
  reserved?: boolean;
  /** kept clear of buildings but open to walk on (the tower plaza) */
  ghost?: boolean;
  edge: number;
  /** +1 left of the street's direction, -1 right */
  side: number;
  /** width along the street and depth away from it (full lengths) */
  w: number;
  d: number;
}

const FLOOR = 3.1;
const SET = PAVEMENT + 0.4;

/** Plot widths (min, spread), gap odds and extra floors per district look. */
const LOOK: Record<District, { w: [number, number]; gap: number; add: number }> = {
  downtown: { w: [14, 12], gap: 0.04, add: 1 },
  port: { w: [10, 7], gap: 0.03, add: 0 },
  corniche: { w: [13, 9], gap: 0.1, add: 0 },
  suburb: { w: [12, 8], gap: 0.17, add: 0 }
};

function corners(x: number, z: number, yaw: number, hw: number, hl: number, grow = 0) {
  const c = Math.cos(yaw),
    s = Math.sin(yaw);
  const out: { x: number; z: number }[] = [];
  for (const [a, b] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0]
  ] as const) {
    const lx = a * (hw + grow),
      lz = b * (hl + grow);
    out.push({ x: x + lx * c + lz * s, z: z - lx * s + lz * c });
  }
  return out;
}

/** Separating-axis test with a margin. */
export function obbOverlap(a: OBB, b: OBB, gap = 0): boolean {
  const ax = [
    { x: Math.cos(a.yaw), z: -Math.sin(a.yaw) },
    { x: Math.sin(a.yaw), z: Math.cos(a.yaw) },
    { x: Math.cos(b.yaw), z: -Math.sin(b.yaw) },
    { x: Math.sin(b.yaw), z: Math.cos(b.yaw) }
  ];
  const ca = corners(a.x, a.z, a.yaw, a.hw, a.hl).slice(0, 4);
  const cb = corners(b.x, b.z, b.yaw, b.hw, b.hl).slice(0, 4);
  for (const n of ax) {
    let a0 = Infinity,
      a1 = -Infinity,
      b0 = Infinity,
      b1 = -Infinity;
    for (const p of ca) {
      const d = p.x * n.x + p.z * n.z;
      a0 = Math.min(a0, d);
      a1 = Math.max(a1, d);
    }
    for (const p of cb) {
      const d = p.x * n.x + p.z * n.z;
      b0 = Math.min(b0, d);
      b1 = Math.max(b1, d);
    }
    if (a1 + gap < b0 || b1 + gap < a0) return false;
  }
  return true;
}

export class Lots {
  readonly lots: Lot[] = [];
  private cells = new Map<number, Lot[]>();
  private static readonly CELL = 64;

  private key(i: number, j: number) {
    return (i + 4096) * 8192 + (j + 4096);
  }
  private put(l: Lot) {
    const c = Lots.CELL;
    const r = Math.hypot(l.hw, l.hl);
    for (let i = Math.floor((l.x - r) / c); i <= Math.floor((l.x + r) / c); i++)
      for (let j = Math.floor((l.z - r) / c); j <= Math.floor((l.z + r) / c); j++) {
        const k = this.key(i, j);
        const a = this.cells.get(k);
        if (a) a.push(l);
        else this.cells.set(k, [l]);
      }
  }
  /** Lots whose cell touches the box. */
  inBox(x0: number, z0: number, x1: number, z1: number, out: Lot[] = []): Lot[] {
    out.length = 0;
    const c = Lots.CELL;
    const seen = new Set<Lot>();
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++)
      for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++) {
        const l = this.cells.get(this.key(i, j));
        if (l)
          for (const v of l)
            if (!seen.has(v) && v.x > x0 - 40 && v.x < x1 + 40 && v.z > z0 - 40 && v.z < z1 + 40) {
              seen.add(v);
              out.push(v);
            }
      }
    return out;
  }
  /** Is a circle of radius r at (x, z) inside a building? */
  blocked(x: number, z: number, r = 0): boolean {
    const l = this.cells.get(this.key(Math.floor(x / Lots.CELL), Math.floor(z / Lots.CELL)));
    if (!l) return false;
    for (const b of l) {
      if (b.ghost) continue;
      const c = Math.cos(b.yaw),
        s = Math.sin(b.yaw);
      const dx = x - b.x,
        dz = z - b.z;
      const lx = dx * c - dz * s,
        lz = dx * s + dz * c;
      if (Math.abs(lx) < b.hw + r && Math.abs(lz) < b.hl + r) return true;
    }
    return false;
  }

  private tryPlace(l: Lot, gap = 0.5): boolean {
    const n = net();
    const c0 = Math.cos(l.yaw),
      s0 = Math.sin(l.yaw);
    for (let a = -1; a <= 1; a += 0.5)
      for (let b = -1; b <= 1.01; b += 1 / 3) {
        const lx = a * l.hw,
          lz = b * l.hl;
        if (n.clearance(l.x + lx * c0 + lz * s0, l.z - lx * s0 + lz * c0) < PAVEMENT) return false;
      }
    // keep off the quay and the water
    for (const p of corners(l.x, l.z, l.yaw, l.hw, l.hl, 4)) if (inRiver(p.x, p.z)) return false;
    const c = Lots.CELL;
    const r = Math.hypot(l.hw, l.hl);
    const seen = new Set<Lot>();
    for (let i = Math.floor((l.x - r) / c); i <= Math.floor((l.x + r) / c); i++)
      for (let j = Math.floor((l.z - r) / c); j <= Math.floor((l.z + r) / c); j++)
        for (const o of this.cells.get(this.key(i, j)) ?? []) {
          if (seen.has(o)) continue;
          seen.add(o);
          if (Math.hypot(o.x - l.x, o.z - l.z) < r + Math.hypot(o.hw, o.hl) && obbOverlap(l, o, gap)) return false;
        }
    return true;
  }

  constructor() {
    const N = net();
    const hold = (box: OBB, ghost = false) => {
      const st: Lot = {
        ...box,
        id: 0,
        h: 8,
        seed: 0,
        district: 'downtown',
        shop: false,
        reserved: true,
        ghost,
        edge: -1,
        side: 0,
        w: box.hl * 2,
        d: box.hw * 2
      };
      this.lots.push(st);
      this.put(st);
    };
    hold(STATION_BOX);
    hold(TOWER_BOX, true);
    for (const l of lions()) hold(lionBox(l));
    const order = [...N.edges].sort((a, b) => rank(a) - rank(b) || a.id - b.id);
    let id = 0;
    for (const e of order) {
      if (e.bridge || e.ring) continue;
      const r = rng(e.id * 977 + 13);
      for (const side of [1, -1]) {
        const na = N.nodes[e.a]!.edges.length >= 3 ? 1 : 0;
        let s = na ? 3 + r() * 3 : r() * 4;
        while (s < e.len - 3) {
          const here = N.at(e, s);
          const area = N.area(here.x, here.z);
          const look = LOOK[area.district];
          const w = look.w[0] + r() * look.w[1];
          if (s + w > e.len + 2) break;
          const mid = N.at(e, Math.min(e.len, s + w / 2));
          s += w + 0.6 + r() * 1.4;
          if (r() < look.gap) {
            s += 6 + r() * 8;
            continue;
          }
          const maxD = e.infill ? 23 : e.cls === 'arterial' ? 27 : 25;
          const nx = Math.cos(mid.yaw) * side,
            nz = -Math.sin(mid.yaw) * side;
          let placed = false;
          for (const dep of [maxD * (0.75 + r() * 0.25), 15, 10, 7]) {
            const off = e.half + SET + dep / 2;
            const seed = ++id * 7 + e.id;
            const lk = areaFloors(area.district, e, seed, r);
            const l: Lot = {
              id: id,
              x: mid.x + nx * off,
              z: mid.z + nz * off,
              yaw: mid.yaw,
              hw: dep / 2,
              hl: w / 2,
              h: lk * FLOOR,
              seed,
              district: area.district,
              shop: e.cls !== 'local' && hash01(seed * 5 + 3) < (area.district === 'suburb' ? 0.3 : 0.6),
              edge: e.id,
              side,
              w,
              d: dep
            };
            if (this.tryPlace(l)) {
              this.lots.push(l);
              this.put(l);
              placed = true;
              break;
            }
          }
          if (!placed) s += 2;
        }
      }
    }
  }
}

const rank = (e: REdge) => (e.infill ? 3 : e.cls === 'arterial' ? 0 : e.cls === 'collector' ? 1 : 2);

function areaFloors(d: District, e: REdge, seed: number, r: () => number): number {
  const base = 3 + Math.floor(hash01(seed * 7 + 3) * 4);
  const bump = d === 'downtown' ? 2 : d === 'port' ? 2 : d === 'corniche' ? 1 : 0;
  let f = base + bump + (e.cls === 'arterial' ? 1 : 0) + (r() < 0.07 ? 5 : 0);
  if (d === 'suburb') f -= 1;
  if (e.infill) f -= 1;
  return Math.max(2, Math.min(15, f));
}

let shared: Lots | null = null;
export function lots(): Lots {
  return (shared ??= new Lots());
}
