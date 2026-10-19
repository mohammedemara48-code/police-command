/**
 * Building lots of the open city (pure, unit-tested): rows of plots along every street, set back behind the pavement,
 * never on a road, in the river or on top of each other. Planned once for the whole world, so chunk borders always agree.
 */
import { PAVEMENT, type District, type V2 } from './cairo';
import { cornersAt } from './junctions';
import { hash01 } from './districts';
import { inPoly, inRiver, net, rng, type REdge } from './roadnet';
import { STATION_BOX } from './station';
import { TOWER_BOX, lionBox, lions } from './monuments';
import type { OBB } from './collide';

/** Spacing (m) at which a lot's outline is tested against streets and pavements, when placing it and when auditing it. */
export const OUTLINE_STEP = 0.8;

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
  /** 0 on the street, 1 and 2 for the rows behind it */
  row?: number;
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
  private cornerGrid = new Map<number, { poly: V2[]; x: number; z: number; r: number }[]>();
  private cornersNear(x: number, z: number, r: number) {
    const out: { poly: V2[]; x: number; z: number; r: number }[] = [];
    const c = 32;
    for (let i = Math.floor((x - r) / c); i <= Math.floor((x + r) / c); i++)
      for (let j = Math.floor((z - r) / c); j <= Math.floor((z + r) / c); j++)
        for (const f of this.cornerGrid.get(this.key(i, j)) ?? [])
          if (Math.hypot(f.x - x, f.z - z) < r + f.r) out.push(f);
    return out;
  }
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

    // the whole outline keeps off the carriageways and the pavements (checked at the same spacing the city audit uses)
    const edge = (a: number, b: number) => n.clearance(l.x + a * c0 + b * s0, l.z - a * s0 + b * c0) < PAVEMENT;
    if (edge(0, 0)) return false;
    const nx = Math.max(1, Math.ceil((l.hw * 2) / OUTLINE_STEP)),
      nz = Math.max(1, Math.ceil((l.hl * 2) / OUTLINE_STEP));
    for (let i = 0; i <= nx; i++) {
      const a = -l.hw + (i / nx) * l.hw * 2;
      if (edge(a, -l.hl) || edge(a, l.hl)) return false;
    }
    for (let j = 1; j < nz; j++) {
      const b = -l.hl + (j / nz) * l.hl * 2;
      if (edge(-l.hw, b) || edge(l.hw, b)) return false;
    }
    // the pavement corner fills at junctions
    for (const c of this.cornersNear(l.x, l.z, r)) {
      if (
        c.poly.some(
          (q) =>
            Math.abs((q.x - l.x) * c0 - (q.z - l.z) * s0) < l.hw && Math.abs((q.x - l.x) * s0 + (q.z - l.z) * c0) < l.hl
        )
      )
        return false;
      for (let i = 0; i <= nx; i++) {
        const a = -l.hw + (i / nx) * l.hw * 2;
        for (const bb of [-l.hl, l.hl])
          if (inPoly({ x: l.x + a * c0 + bb * s0, z: l.z - a * s0 + bb * c0 }, c.poly)) return false;
      }
      for (let j = 1; j < nz; j++) {
        const bb = -l.hl + (j / nz) * l.hl * 2;
        for (const a of [-l.hw, l.hw])
          if (inPoly({ x: l.x + a * c0 + bb * s0, z: l.z - a * s0 + bb * c0 }, c.poly)) return false;
      }
    }
    return true;
  }

  constructor() {
    const N = net();
    for (const nd of N.nodes)
      for (const poly of cornersAt(nd.id)) {
        const x = poly.reduce((a, q) => a + q.x, 0) / poly.length,
          z = poly.reduce((a, q) => a + q.z, 0) / poly.length;
        const f = { poly, x, z, r: Math.max(...poly.map((q) => Math.hypot(q.x - x, q.z - z))) };
        const k = this.key(Math.floor(x / 32), Math.floor(z / 32));
        const g = this.cornerGrid.get(k);
        if (g) g.push(f);
        else this.cornerGrid.set(k, [f]);
      }
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
    // courtyards and back rows: blocks are filled behind the street frontage (up to two more rows, with the odd gap left as a yard)
    for (let row = 0; row < 2; row++) {
      const fronts = this.lots.filter((l) => !l.reserved && l.edge >= 0 && (l.row ?? 0) === row);
      for (const f of fronts) {
        const r = rng(f.id * 131 + 7 + row);
        if (r() < 0.14) continue;
        const nx = Math.cos(f.yaw) * f.side,
          nz = -Math.sin(f.yaw) * f.side;
        for (const dep of [20 + r() * 8, 15, 11]) {
          const off = f.hw + 0.9 + dep / 2;
          const seed = ++id * 7 + f.edge;
          const floors = Math.max(2, Math.round(f.h / FLOOR) - 1 - Math.floor(r() * 2));
          const l: Lot = {
            ...f,
            id,
            x: f.x + nx * off,
            z: f.z + nz * off,
            hw: dep / 2,
            d: dep,
            seed,
            h: floors * FLOOR,
            shop: false,
            row: row + 1
          };
          if (this.tryPlace(l)) {
            this.lots.push(l);
            this.put(l);
            break;
          }
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
