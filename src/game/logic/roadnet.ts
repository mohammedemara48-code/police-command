/**
 * The road network of the open city (pure, unit-tested): the hand-drawn streets of `cairo.ts` plus generated infill streets,
 * cut into edges at every crossing, with a spatial index for "is this a road" tests and a path finder that follows the roads.
 */
import { resetJunctions } from './junctions';
import { roadConflicts } from './netcheck';
import { inCarriage, resetShape } from './roadShape';
import {
  ANCHORS,
  BANK_EAST,
  BANK_WEST,
  ISLANDS,
  PAVEMENT,
  ROAD_HALF,
  TOWER_LL,
  SQUARES,
  STREETS,
  WORLD_BOX,
  ZONES,
  toWorld,
  type District,
  type LonLat,
  type RoadClass,
  type V2
} from './cairo';

export interface RNode {
  id: number;
  x: number;
  z: number;
  edges: number[];
}
export interface REdge {
  id: number;
  a: number;
  b: number;
  /** centre line from node a to node b */
  pts: V2[];
  /** distance along the line at each point */
  cum: number[];
  len: number;
  cls: RoadClass;
  name: string;
  half: number;
  /** a one-way edge (roundabout) can only be driven from a to b */
  oneway: boolean;
  ring: boolean;
  /** true on stretches over the river */
  bridge: boolean;
  /** the street it was cut from */
  sid: string;
  /** generated infill, not hand drawn */
  infill: boolean;
}

export const dist = (a: V2, b: V2) => Math.hypot(a.x - b.x, a.z - b.z);

// ---- geometry helpers
export function inPoly(p: V2, poly: V2[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!,
      b = poly[j]!;
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) c = !c;
  }
  return c;
}
function distToSeg(p: V2, a: V2, b: V2) {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)) : 0;
  return { d: Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t), t, x: a.x + dx * t, z: a.z + dz * t };
}
function segHit(a: V2, b: V2, c: V2, d: V2): { t: number; u: number } | null {
  const r = { x: b.x - a.x, z: b.z - a.z },
    q = { x: d.x - c.x, z: d.z - c.z };
  const den = r.x * q.z - r.z * q.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * q.z - (c.z - a.z) * q.x) / den;
  const u = ((c.x - a.x) * r.z - (c.z - a.z) * r.x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u };
}

/** Catmull-Rom curve through the points, sampled about every `step` metres. */
export function smooth(pts: V2[], step = 5): V2[] {
  if (pts.length < 3) return resample(pts, step);
  const out: V2[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!,
      p1 = pts[i]!,
      p2 = pts[i + 1]!,
      p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    const n = Math.max(1, Math.ceil(dist(p1, p2) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n,
        t2 = t * t,
        t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  out.push({ ...pts[pts.length - 1]! });
  return out;
}
function resample(pts: V2[], step: number): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!,
      b = pts[i + 1]!;
    const n = Math.max(1, Math.ceil(dist(a, b) / step));
    for (let k = 0; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
  }
  out.push({ ...pts[pts.length - 1]! });
  return out;
}

/** Parallel copy of a line, `d` metres to its left (positive) or right. */
export function offsetLine(pts: V2[], d: number): V2[] {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)]!,
      b = pts[Math.min(pts.length - 1, i + 1)]!;
    const dx = b.x - a.x,
      dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    return { x: p.x - (dz / l) * d, z: p.z + (dx / l) * d };
  });
}

// ---- the river
const worldPts = (a: readonly LonLat[]) => a.map(toWorld);
export const RIVER = (() => {
  const east = smooth(worldPts(BANK_EAST), 8);
  const west = smooth(worldPts(BANK_WEST), 8);
  const outline = [...west, ...east.slice().reverse()];
  const islands = ISLANDS.map((i) => smooth([...worldPts(i.pts), toWorld(i.pts[0]!)], 6));
  const xs = outline.map((p) => p.x),
    zs = outline.map((p) => p.z);
  const box = { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
  return { east, west, outline, islands, box };
})();

/** On the water (inside the banks, outside the islands) with a margin `pad` metres. */
export function inRiver(x: number, z: number, pad = 0): boolean {
  const b = RIVER.box;
  if (x < b.x0 - pad || x > b.x1 + pad || z < b.z0 - pad || z > b.z1 + pad) return false;
  const p = { x, z };
  if (!inPoly(p, RIVER.outline)) return false;
  for (const isl of RIVER.islands) if (inPoly(p, isl)) return false;
  if (pad > 0) {
    // inside by at least `pad`: shrink the test by probing the four sides
    for (const [dx, dz] of [
      [pad, 0],
      [-pad, 0],
      [0, pad],
      [0, -pad]
    ] as const) {
      const q = { x: x + dx, z: z + dz };
      if (!inPoly(q, RIVER.outline)) return false;
      for (const isl of RIVER.islands) if (inPoly(q, isl)) return false;
    }
  }
  return true;
}

// ---- building the network
interface Stroke {
  id: string;
  name: string;
  cls: RoadClass;
  pts: V2[];
  ring: boolean;
  infill: boolean;
}

/** A small deterministic random generator. */
export function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Hash<T> {
  private m = new Map<number, T[]>();
  constructor(readonly cell: number) {}
  key(cx: number, cz: number) {
    return (cx + 4096) * 8192 + (cz + 4096);
  }
  add(x0: number, z0: number, x1: number, z1: number, v: T) {
    const c = this.cell;
    for (let i = Math.floor(Math.min(x0, x1) / c); i <= Math.floor(Math.max(x0, x1) / c); i++)
      for (let j = Math.floor(Math.min(z0, z1) / c); j <= Math.floor(Math.max(z0, z1) / c); j++) {
        const k = this.key(i, j);
        const l = this.m.get(k);
        if (l) l.push(v);
        else this.m.set(k, [v]);
      }
  }
  /** values whose box touches the cells around (x, z) within r */
  near(x: number, z: number, r: number, out: T[] = []): T[] {
    out.length = 0;
    const c = this.cell;
    const seen = new Set<T>();
    for (let i = Math.floor((x - r) / c); i <= Math.floor((x + r) / c); i++)
      for (let j = Math.floor((z - r) / c); j <= Math.floor((z + r) / c); j++) {
        const l = this.m.get(this.key(i, j));
        if (l)
          for (const v of l)
            if (!seen.has(v)) {
              seen.add(v);
              out.push(v);
            }
      }
    return out;
  }
}

function drawnStrokes(): Stroke[] {
  const out: Stroke[] = [];
  const squares = SQUARES.map((q) => ({ ...q, c: toWorld(q.at) }));
  for (const st of STREETS) {
    const line = smooth(st.pts.map(toWorld), 5);
    // cut out the stretch inside each square: the roundabout takes its place
    let run: V2[] = [];
    let k = 0;
    const flush = () => {
      if (run.length >= 2)
        out.push({ id: `${st.id}.${k++}`, name: st.name, cls: st.cls, pts: run, ring: false, infill: false });
      run = [];
    };
    for (const p of line) {
      const inside = squares.some((q) => dist(p, q.c) < q.r - 0.5);
      if (inside) flush();
      else run.push(p);
    }
    flush();
  }
  for (const q of squares) {
    const n = Math.max(20, Math.min(44, Math.round((Math.PI * 2 * q.r) / 5)));
    const pts: V2[] = [];
    // counter-clockwise on the map = decreasing angle with z pointing south
    for (let i = 0; i <= n; i++) {
      const a = -(i / n) * Math.PI * 2;
      pts.push({ x: q.c.x + Math.cos(a) * q.r, z: q.c.z + Math.sin(a) * q.r });
    }
    out.push({ id: `sq.${q.id}`, name: q.name, cls: 'collector', pts, ring: true, infill: false });
  }
  return out;
}

/** Infill streets: a rotated grid inside each zone, kept off the river and the drawn streets it would run along. */
function infillStrokes(base: Stroke[]): Stroke[] {
  const tower = toWorld(TOWER_LL);
  const segs = new Hash<{ a: V2; b: V2 }>(24);
  for (const s of base)
    for (let i = 0; i + 1 < s.pts.length; i++) {
      const a = s.pts[i]!,
        b = s.pts[i + 1]!;
      segs.add(a.x, a.z, b.x, b.z, { a, b });
    }
  const squares = SQUARES.map((q) => ({ c: toWorld(q.at), r: q.r }));
  const out: Stroke[] = [];
  const tmp: { a: V2; b: V2 }[] = [];
  let n = 0;
  for (const z of ZONES) {
    const c = toWorld(z.at);
    const r = rng(z.id.length * 977 + Math.round(z.w));
    const cos = Math.cos(z.angle),
      sin = Math.sin(z.angle);
    const loc = (u: number, v: number): V2 => ({ x: c.x + u * cos - v * sin, z: c.z + u * sin + v * cos });
    const hw = z.w / 2 - 4,
      hh = z.h / 2 - 4;
    const lines: { dir: V2; pts: V2[] }[] = [];
    // lines along u (varying v) and along v (varying u)
    for (const alongU of [true, false]) {
      const span = alongU ? z.h : z.w;
      for (let o = -span / 2 + z.spacing / 2; o < span / 2; o += z.spacing + (r() - 0.5) * 8) {
        const pts: V2[] = [];
        const half = alongU ? hw : hh;
        for (let t = -half; t <= half; t += 4) pts.push(alongU ? loc(t, o) : loc(o, t));
        lines.push({ dir: alongU ? { x: cos, z: sin } : { x: -sin, z: cos }, pts });
      }
    }
    for (const ln of lines) {
      let run: V2[] = [];
      const flush = () => {
        if (run.length >= 6)
          out.push({ id: `inf.${z.id}.${n++}`, name: 'شارع جانبي', cls: 'local', pts: run, ring: false, infill: true });
        run = [];
      };
      for (let i = 0; i < ln.pts.length; i++) {
        const p = ln.pts[i]!;
        let ok =
          p.x > WORLD_BOX.x0 + 20 && p.x < WORLD_BOX.x1 - 20 && p.z > WORLD_BOX.z0 + 20 && p.z < WORLD_BOX.z1 - 20;
        if (ok && inRiver(p.x, p.z, 0) === true) ok = false;
        if (ok && nearRiver(p, 9)) ok = false;
        if (ok && squares.some((q) => dist(p, q.c) < q.r + 8)) ok = false;
        // the Cairo Tower plaza stays free of streets
        if (ok && Math.abs(p.x - tower.x) < 17 + 14 && Math.abs(p.z - tower.z) < 17 + 14) ok = false;
        if (ok) {
          segs.near(p.x, p.z, 11, tmp);
          for (const s of tmp) {
            const d = distToSeg(p, s.a, s.b);
            if (d.d < 11) {
              const sx = s.b.x - s.a.x,
                sz = s.b.z - s.a.z;
              const l = Math.hypot(sx, sz) || 1;
              const cosA = Math.abs((sx * ln.dir.x + sz * ln.dir.z) / l);
              if (cosA > 0.9) {
                ok = false;
                break;
              }
            }
          }
        }
        if (ok) run.push(p);
        else flush();
      }
      flush();
    }
    // later zones keep clear of this zone's streets too
    for (let k = out.length - 1; k >= 0 && out[k]!.id.startsWith(`inf.${z.id}.`); k--) {
      const s = out[k]!;
      for (let i = 0; i + 1 < s.pts.length; i++)
        segs.add(s.pts[i]!.x, s.pts[i]!.z, s.pts[i + 1]!.x, s.pts[i + 1]!.z, { a: s.pts[i]!, b: s.pts[i + 1]! });
    }
  }
  return out;
}

function nearRiver(p: V2, r: number): boolean {
  for (const [dx, dz] of [
    [r, 0],
    [-r, 0],
    [0, r],
    [0, -r],
    [r * 0.7, r * 0.7],
    [-r * 0.7, -r * 0.7],
    [r * 0.7, -r * 0.7],
    [-r * 0.7, r * 0.7]
  ] as const)
    if (inRiver(p.x + dx, p.z + dz)) return true;
  return false;
}

/** true when a line runs over the river (any sample on the water or within a few metres of it). */
function overWater(line: V2[]): boolean {
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]!,
      b = line[i + 1]!;
    const n = Math.max(1, Math.ceil(dist(a, b) / 6));
    for (let k = 0; k <= n; k++) {
      const x = a.x + ((b.x - a.x) * k) / n,
        z = a.z + ((b.z - a.z) * k) / n;
      if (inRiver(x, z) || nearRiver({ x, z }, 4)) return true;
    }
  }
  return false;
}

export interface NetBuild {
  nodes: RNode[];
  edges: REdge[];
}

/** Cut all strokes at their crossings and join near endpoints (T junctions). */
/** Junctions closer together than this become one. */
const MERGE = 9;

export function buildNet(): NetBuild {
  const drawn = drawnStrokes();
  const strokes = [...drawn, ...infillStrokes(drawn)];
  // segment index over all strokes
  interface Seg {
    s: number;
    i: number;
    a: V2;
    b: V2;
  }
  const hash = new Hash<Seg>(24);
  strokes.forEach((st, s) => {
    for (let i = 0; i + 1 < st.pts.length; i++) {
      const a = st.pts[i]!,
        b = st.pts[i + 1]!;
      hash.add(a.x, a.z, b.x, b.z, { s, i, a, b });
    }
  });
  // cut points per stroke: [segment index + t, x, z]
  const cuts: { k: number; x: number; z: number; gen?: boolean }[][] = strokes.map(() => []);
  const drawnCrossings: V2[] = [];
  const tmp: Seg[] = [];
  strokes.forEach((st, s) => {
    for (let i = 0; i + 1 < st.pts.length; i++) {
      const a = st.pts[i]!,
        b = st.pts[i + 1]!;
      hash.near((a.x + b.x) / 2, (a.z + b.z) / 2, 14, tmp);
      for (const o of tmp) {
        if (o.s <= s) continue;
        const h = segHit(a, b, o.a, o.b);
        if (!h) continue;
        const x = a.x + (b.x - a.x) * h.t,
          z = a.z + (b.z - a.z) * h.t;
        const gen = st.infill || strokes[o.s]!.infill;
        cuts[s]!.push({ k: i + h.t, x, z, gen });
        cuts[o.s]!.push({ k: o.i + h.u, x, z, gen });
        if (!gen) drawnCrossings.push({ x, z });
      }
    }
  });
  // a generated street never makes a junction right beside a drawn one (it would have to bend the drawn streets to meet it):
  // it is left uncut there and dropped below if it then cuts across
  for (const list of cuts)
    for (let q = list.length - 1; q >= 0; q--) {
      const c = list[q]!;
      if (c.gen && drawnCrossings.some((d) => Math.hypot(d.x - c.x, d.z - c.z) < MERGE * 1.4)) list.splice(q, 1);
    }
  // T junctions: an end of a stroke that stops just short of another street is joined to it
  strokes.forEach((st, s) => {
    if (st.ring) return;
    // a drawn street may stop short of the street it joins by a block or so; generated ones only by a few metres
    const SNAP = st.infill ? 9 : 48;
    for (const end of [0, st.pts.length - 1]) {
      const p = st.pts[end]!;
      // already on a crossing?
      if (
        cuts[s]!.some(
          (c) => (end === 0 ? c.k < 0.6 : c.k > st.pts.length - 1.6) && Math.hypot(c.x - p.x, c.z - p.z) < 1.5
        )
      )
        continue;
      hash.near(p.x, p.z, SNAP + 6, tmp);
      let best: { d: number; seg: Seg; t: number; x: number; z: number } | null = null;
      for (const o of tmp) {
        if (o.s === s) continue;
        const d = distToSeg(p, o.a, o.b);
        if (d.d < SNAP && (!best || d.d < best.d)) best = { d: d.d, seg: o, t: d.t, x: d.x, z: d.z };
      }
      if (best && st.infill) {
        // a generated street joins a nearby junction of the street it meets rather than making a second one beside it
        let near: { k: number; x: number; z: number } | null = null;
        let nd = 14;
        for (const c of cuts[best.seg.s]!) {
          const d = Math.hypot(c.x - best.x, c.z - best.z);
          if (d < nd) {
            nd = d;
            near = c;
          }
        }
        if (near) best = { ...best, x: near.x, z: near.z, t: near.k - best.seg.i };
      }
      if (best) {
        cuts[best.seg.s]!.push({ k: best.seg.i + best.t, x: best.x, z: best.z });
        cuts[s]!.push({ k: end === 0 ? 0 : st.pts.length - 1, x: best.x, z: best.z });
        st.pts[end] = { x: best.x, z: best.z };
      }
    }
  });

  // nodes: merge cut points that are within a few metres of each other
  const nodes: RNode[] = [];
  const nodeHash = new Hash<RNode>(12);
  const nodeAt = (x: number, z: number): RNode => {
    const near = nodeHash.near(x, z, MERGE);
    let best: RNode | null = null;
    let bd = MERGE;
    for (const n of near) {
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    if (best) return best;
    const n: RNode = { id: nodes.length, x, z, edges: [] };
    nodes.push(n);
    nodeHash.add(x, z, x, z, n);
    return n;
  };

  const edges: REdge[] = [];
  strokes.forEach((st, s) => {
    const pts = st.pts;
    const list = cuts[s]!.slice().sort((p, q) => p.k - q.k);
    // always cut at both ends
    list.unshift({ k: 0, x: pts[0]!.x, z: pts[0]!.z });
    list.push({ k: pts.length - 1, x: pts[pts.length - 1]!.x, z: pts[pts.length - 1]!.z });
    // drop cuts that fall almost on top of the previous one
    const cs: typeof list = [];
    for (const c of list) {
      const prev = cs[cs.length - 1];
      if (prev && Math.hypot(prev.x - c.x, prev.z - c.z) < MERGE) {
        if (c === list[list.length - 1]) cs[cs.length - 1] = c;
        continue;
      }
      cs.push(c);
    }
    for (let q = 0; q + 1 < cs.length; q++) {
      const c0 = cs[q]!,
        c1 = cs[q + 1]!;
      let line: V2[] = [{ x: c0.x, z: c0.z }];
      for (let i = Math.floor(c0.k) + 1; i <= Math.ceil(c1.k) - 1; i++) if (i > c0.k && i < c1.k) line.push(pts[i]!);
      line.push({ x: c1.x, z: c1.z });
      const na = nodeAt(c0.x, c0.z),
        nb = nodeAt(c1.x, c1.z);
      if (na === nb) continue;
      line[0] = { x: na.x, z: na.z };
      line[line.length - 1] = { x: nb.x, z: nb.z };
      // no stacked points: they would give zero-length segments
      const tidy: V2[] = [line[0]!];
      for (let i = 1; i < line.length - 1; i++)
        if (dist(line[i]!, tidy[tidy.length - 1]!) >= 0.8 && dist(line[i]!, line[line.length - 1]!) >= 0.8)
          tidy.push(line[i]!);
      tidy.push(line[line.length - 1]!);
      line = tidy;
      // merging nodes can leave a hairpin at an end (the stroke's old end point lies behind the new node): drop it
      const back = (a: V2, b: V2, c: V2) => (b.x - a.x) * (c.x - b.x) + (b.z - a.z) * (c.z - b.z) < 0;
      while (line.length > 2 && back(line[0]!, line[1]!, line[2]!)) line.splice(1, 1);
      while (line.length > 2 && back(line[line.length - 3]!, line[line.length - 2]!, line[line.length - 1]!))
        line.splice(line.length - 2, 1);
      const cum = [0];
      for (let i = 1; i < line.length; i++) cum.push(cum[i - 1]! + dist(line[i - 1]!, line[i]!));
      const len = cum[cum.length - 1]!;
      if (len < 3) continue;
      const e: REdge = {
        id: edges.length,
        a: na.id,
        b: nb.id,
        pts: line,
        cum,
        len,
        cls: st.cls,
        name: st.name,
        half: ROAD_HALF[st.cls],
        oneway: st.ring,
        ring: st.ring,
        bridge: !st.ring && overWater(line),
        sid: st.id.replace(/\.\d+$/, ''),
        infill: st.infill
      };
      edges.push(e);
      na.edges.push(e.id);
      nb.edges.push(e.id);
    }
  });
  return { nodes, edges };
}

export class RoadNet {
  nodes: RNode[];
  edges: REdge[];
  private hash = new Hash<{ e: number; i: number }>(32);
  /** component index per node */
  comp: number[] = [];
  /** edges dropped because they were cut off from the main network (drawn streets should never be) */
  dropped: REdge[] = [];

  constructor(b: NetBuild = buildNet()) {
    this.nodes = b.nodes;
    this.edges = b.edges;
    this.unhook();
    this.prune();
    this.index();
    // generated streets that cut across another road, or lie on top of it, are dropped (drawn ones are fixed in the data).
    // Dropping streets never creates a new conflict, so one pass is enough.
    const victims = new Set<number>();
    for (const c of roadConflicts(this, true)) {
      const v = c.f.infill ? c.f : c.e.infill ? c.e : null;
      if (v) victims.add(v.id);
    }
    if (victims.size) {
      this.removeEdges(victims);
      this.prune();
      this.index();
    }
  }

  /**
   * Snapping a street onto a node can leave a short jog at its end (the line steps sideways and turns back): the car
   * following the street would steer into the kerb there. Drop such end points so every edge leaves its node cleanly.
   */
  private unhook() {
    const turn = (a: V2, b: V2, c: V2) => {
      const t1 = Math.atan2(b.x - a.x, b.z - a.z),
        t2 = Math.atan2(c.x - b.x, c.z - b.z);
      return Math.abs(Math.atan2(Math.sin(t2 - t1), Math.cos(t2 - t1)));
    };
    for (const e of this.edges) {
      const p = e.pts;
      let changed = false;
      while (p.length > 2 && dist(p[0]!, p[1]!) < 10 && turn(p[0]!, p[1]!, p[2]!) > 0.6) {
        p.splice(1, 1);
        changed = true;
      }
      while (
        p.length > 2 &&
        dist(p[p.length - 1]!, p[p.length - 2]!) < 10 &&
        turn(p[p.length - 3]!, p[p.length - 2]!, p[p.length - 1]!) > 0.6
      ) {
        p.splice(p.length - 2, 1);
        changed = true;
      }
      if (!changed) continue;
      e.cum = [0];
      for (let i = 1; i < p.length; i++) e.cum.push(e.cum[i - 1]! + dist(p[i - 1]!, p[i]!));
      e.len = e.cum[e.cum.length - 1]!;
    }
  }

  private index() {
    resetJunctions(this);
    resetShape(this);
    this.hash = new Hash<{ e: number; i: number }>(32);
    for (const e of this.edges)
      for (let i = 0; i + 1 < e.pts.length; i++) {
        const a = e.pts[i]!,
          c = e.pts[i + 1]!;
        const r = ROAD_HALF.arterial + PAVEMENT + 4;
        this.hash.add(Math.min(a.x, c.x) - r, Math.min(a.z, c.z) - r, Math.max(a.x, c.x) + r, Math.max(a.z, c.z) + r, {
          e: e.id,
          i
        });
      }
  }

  private removeEdges(ids: Set<number>) {
    const edges: REdge[] = [];
    for (const n of this.nodes) n.edges = [];
    for (const e of this.edges) {
      if (ids.has(e.id)) {
        this.dropped.push(e);
        continue;
      }
      const ne = { ...e, id: edges.length };
      edges.push(ne);
      this.nodes[ne.a]!.edges.push(ne.id);
      this.nodes[ne.b]!.edges.push(ne.id);
    }
    this.edges = edges;
  }

  /** Keep the largest connected piece of the network (leftovers of the infill would be islands nobody can reach). */
  private prune() {
    const comp = new Array<number>(this.nodes.length).fill(-1);
    const sizes: number[] = [];
    this.nodes.forEach((_n, s) => {
      if (comp[s] >= 0) return;
      const id = sizes.length;
      let count = 0;
      const stack = [s];
      comp[s] = id;
      while (stack.length) {
        const cur = stack.pop()!;
        count++;
        for (const eid of this.nodes[cur]!.edges) {
          const e = this.edges[eid]!;
          const o = e.a === cur ? e.b : e.a;
          if (comp[o]! < 0) {
            comp[o] = id;
            stack.push(o);
          }
        }
      }
      sizes.push(count);
    });
    if (sizes.length <= 1) {
      this.comp = comp;
      return;
    }
    const keep = sizes.indexOf(Math.max(...sizes));
    const remap = new Map<number, number>();
    const nodes: RNode[] = [];
    this.nodes.forEach((n, i) => {
      if (comp[i] === keep) {
        remap.set(i, nodes.length);
        nodes.push({ ...n, id: nodes.length, edges: [] });
      }
    });
    const edges: REdge[] = [];
    for (const e of this.edges) {
      const a = remap.get(e.a),
        b = remap.get(e.b);
      if (a === undefined || b === undefined) {
        this.dropped.push(e);
        continue;
      }
      const ne = { ...e, id: edges.length, a, b };
      edges.push(ne);
      nodes[a]!.edges.push(ne.id);
      nodes[b]!.edges.push(ne.id);
    }
    this.nodes = nodes;
    this.edges = edges;
    this.comp = nodes.map(() => 0);
  }

  private tmp: { e: number; i: number }[] = [];

  /** Nearest point on any road centre line within `r`, with the edge it is on. */
  nearest(x: number, z: number, r = 60): { e: REdge; s: number; x: number; z: number; d: number } | null {
    let best: { e: REdge; s: number; x: number; z: number; d: number } | null = null;
    const p = { x, z };
    for (const h of this.hash.near(x, z, r, this.tmp)) {
      const e = this.edges[h.e]!;
      const d = distToSeg(p, e.pts[h.i]!, e.pts[h.i + 1]!);
      if (d.d <= r && (!best || d.d < best.d)) {
        const seg = dist(e.pts[h.i]!, e.pts[h.i + 1]!);
        best = { e, s: e.cum[h.i]! + seg * d.t, x: d.x, z: d.z, d: d.d };
      }
    }
    return best;
  }

  /** Road segments (edge id and segment index) whose box lies within `r` of a point; for geometry checks. */
  segmentsNear(x: number, z: number, r = 0.1): { e: number; i: number }[] {
    return this.hash.near(x, z, r, []);
  }

  /** On a carriageway (pad = extra margin, e.g. the pavement for people on foot). */
  onRoad(x: number, z: number, pad = 0): boolean {
    // the exact drawn carriageway quads (mitred, flat ends) and the rounded corner fillets
    return inCarriage(this, x, z, pad);
  }

  /** Distance to the nearest carriageway edge over all roads except `skip` (for placing buildings). */
  clearance(x: number, z: number, skip?: number): number {
    let best = Infinity;
    const p = { x, z };
    for (const h of this.hash.near(x, z, 0.1, this.tmp)) {
      if (h.e === skip) continue;
      const e = this.edges[h.e]!;
      best = Math.min(best, distToSeg(p, e.pts[h.i]!, e.pts[h.i + 1]!).d - e.half);
    }
    return best;
  }

  /** Point and heading `s` metres along an edge. */
  at(e: REdge, s: number): { x: number; z: number; yaw: number } {
    const t = Math.max(0, Math.min(e.len, s));
    let i = 1;
    while (i < e.cum.length - 1 && e.cum[i]! < t) i++;
    const a = e.pts[i - 1]!,
      b = e.pts[i]!;
    const seg = e.cum[i]! - e.cum[i - 1]! || 1;
    const k = (t - e.cum[i - 1]!) / seg;
    return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
  }

  other(e: REdge, n: number) {
    return e.a === n ? e.b : e.a;
  }
  /** can an edge be driven away from node n? */
  canLeave(e: REdge, n: number) {
    return !e.oneway || e.a === n;
  }

  /** A* over the roads between two points; returns the way points to follow. */
  findPath(fx: number, fz: number, tx: number, tz: number): V2[] {
    const s = this.nearest(fx, fz, 400),
      g = this.nearest(tx, tz, 400);
    if (!s || !g) return [{ x: tx, z: tz }];
    const out: V2[] = [];
    const along = (e: REdge, from: number, to: number) => {
      // way points of edge e between distances from and to (either direction)
      const pts: V2[] = [];
      const dir = to >= from ? 1 : -1;
      if (dir > 0) {
        for (let i = 0; i < e.pts.length; i++) if (e.cum[i]! > from + 0.5 && e.cum[i]! < to - 0.5) pts.push(e.pts[i]!);
      } else {
        for (let i = e.pts.length - 1; i >= 0; i--)
          if (e.cum[i]! < from - 0.5 && e.cum[i]! > to + 0.5) pts.push(e.pts[i]!);
      }
      return pts;
    };
    if (s.e === g.e && (!s.e.oneway || g.s >= s.s)) {
      out.push({ x: s.x, z: s.z }, ...along(s.e, s.s, g.s), { x: g.x, z: g.z }, { x: tx, z: tz });
      return out;
    }
    const N = this.nodes.length;
    const gs = new Float64Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-2); // -1 = from the start edge, otherwise edge id used to arrive
    const from = new Int32Array(N).fill(-1);
    const open = new Set<number>();
    const goal = (n: number) => dist(this.nodes[n]!, g);
    const fs = new Float64Array(N).fill(Infinity);
    const seed = (n: number, c: number) => {
      if (c < gs[n]!) {
        gs[n] = c;
        came[n] = -1;
        fs[n] = c + goal(n);
        open.add(n);
      }
    };
    if (!s.e.oneway) seed(s.e.a, s.s);
    seed(s.e.b, s.e.len - s.s);
    // end nodes: arriving at them lets us walk onto the goal edge
    const endCost = (n: number) => {
      if (n === g.e.a) return g.e.oneway ? g.s : g.s;
      if (n === g.e.b) return g.e.oneway ? Infinity : g.e.len - g.s;
      return Infinity;
    };
    let bestEnd = -1,
      bestTotal = Infinity;
    while (open.size) {
      let cur = -1,
        cf = Infinity;
      for (const n of open)
        if (fs[n]! < cf) {
          cf = fs[n]!;
          cur = n;
        }
      if (cf >= bestTotal) break;
      open.delete(cur);
      const ec = endCost(cur);
      if (ec < Infinity && gs[cur]! + ec < bestTotal) {
        bestTotal = gs[cur]! + ec;
        bestEnd = cur;
      }
      for (const eid of this.nodes[cur]!.edges) {
        const e = this.edges[eid]!;
        if (!this.canLeave(e, cur)) continue;
        const o = this.other(e, cur);
        const c = gs[cur]! + e.len;
        if (c < gs[o]!) {
          gs[o] = c;
          came[o] = eid;
          from[o] = cur;
          fs[o] = c + goal(o);
          open.add(o);
        }
      }
    }
    if (bestEnd < 0) return [{ x: tx, z: tz }];
    // walk back
    const chain: { e: REdge; fromNode: number; toNode: number }[] = [];
    let n = bestEnd;
    while (came[n] !== -1 && came[n] !== -2) {
      const e = this.edges[came[n]!]!;
      chain.unshift({ e, fromNode: from[n]!, toNode: n });
      n = from[n]!;
    }
    out.push({ x: s.x, z: s.z });
    // from the start point to the first node
    if (n === s.e.a) out.push(...along(s.e, s.s, 0), { x: this.nodes[n]!.x, z: this.nodes[n]!.z });
    else out.push(...along(s.e, s.s, s.e.len), { x: this.nodes[n]!.x, z: this.nodes[n]!.z });
    for (const c of chain) {
      const fwd = c.e.a === c.fromNode;
      out.push(...along(c.e, fwd ? 0 : c.e.len, fwd ? c.e.len : 0), {
        x: this.nodes[c.toNode]!.x,
        z: this.nodes[c.toNode]!.z
      });
    }
    if (bestEnd === g.e.a) out.push(...along(g.e, 0, g.s));
    else out.push(...along(g.e, g.e.len, g.s));
    out.push({ x: g.x, z: g.z }, { x: tx, z: tz });
    return out;
  }

  /** A junction well away from (x, z), for fleeing. */
  farNode(x: number, z: number, minD = 160, maxD = 520, rnd = Math.random): RNode {
    const c = this.nodes.filter((n) => {
      const d = Math.hypot(n.x - x, n.z - z);
      return d > minD && d < maxD && n.edges.length >= 3;
    });
    return c[Math.floor(rnd() * c.length)] ?? this.nodes[Math.floor(rnd() * this.nodes.length)]!;
  }

  nearestNode(x: number, z: number): RNode {
    let best = this.nodes[0]!;
    let bd = Infinity;
    const p = this.nearest(x, z, 200);
    if (p) {
      for (const n of [this.nodes[p.e.a]!, this.nodes[p.e.b]!]) {
        const d = Math.hypot(n.x - x, n.z - z);
        if (d < bd) {
          bd = d;
          best = n;
        }
      }
      return best;
    }
    for (const n of this.nodes) {
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  /** A random point on a road (for patrol calls). */
  randomPoint(rnd = Math.random, filter?: (e: REdge) => boolean): { x: number; z: number; e: REdge; yaw: number } {
    for (let i = 0; i < 60; i++) {
      const e = this.edges[Math.floor(rnd() * this.edges.length)]!;
      if (e.len < 30 || e.ring || (filter && !filter(e))) continue;
      const p = this.at(e, 10 + rnd() * (e.len - 20));
      return { ...p, e };
    }
    const e = this.edges[0]!;
    return { ...this.at(e, e.len / 2), e };
  }

  /** The district look (and area name) that holds sway at a point; beyond the city it is the nearest one anyway. */
  area(x: number, z: number): { area: string; district: District } {
    let best = ANCHOR_W[0]!;
    let bd = Infinity;
    for (const a of ANCHOR_W) {
      const d = Math.hypot(a.x - x, a.z - z);
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    return { area: best.area, district: best.district };
  }
}

const ANCHOR_W = ANCHORS.map((a) => ({ ...toWorld(a.at), area: a.area, district: a.district }));

let shared: RoadNet | null = null;
/** The one network every system shares (built on first use). */
export function net(): RoadNet {
  return (shared ??= new RoadNet());
}
