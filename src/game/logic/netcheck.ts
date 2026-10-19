/**
 * Road against road geometry checks. They live next to the network because the network uses them while it is built (generated
 * streets that cut across or lie on top of another road are dropped) and the city audit uses the very same checks to prove
 * that nothing is left.
 */
import { PAVEMENT } from './cairo';
import { junctionsOf } from './junctions';
import type { REdge, RoadNet } from './roadnet';
import type { V2 } from './cairo';

/** Longest stretch beside a junction where two narrow-angled roads may share asphalt (and pavements are cut back). */
export const MAX_TRIM = 130;

export interface RoadConflict {
  kind: 'road-cross' | 'road-overlap';
  e: REdge;
  f: REdge;
  x: number;
  z: number;
}

function segCross(a: V2, b: V2, c: V2, d: V2): V2 | null {
  const r = { x: b.x - a.x, z: b.z - a.z },
    q = { x: d.x - c.x, z: d.z - c.z };
  const den = r.x * q.z - r.z * q.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * q.z - (c.z - a.z) * q.x) / den;
  const u = ((c.x - a.x) * r.z - (c.z - a.z) * r.x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.x + r.x * t, z: a.z + r.z * t };
}
function dseg(p: V2, a: V2, b: V2) {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
}

const nodeOf = (e: REdge, f: REdge) => [e.a, e.b].filter((n) => n === f.a || n === f.b);

/** Is a point on `e` close enough to a junction `e` shares with `f` for their carriageways to legitimately merge? */
export function inWedge(N: RoadNet, e: REdge, f: REdge, x: number, z: number): boolean {
  for (const n of nodeOf(e, f)) {
    const nd = N.nodes[n]!;
    const da = Math.hypot(nd.x - x, nd.z - z);
    const dir = (q: REdge) => {
      const a = q.a === n ? q.pts[1]! : q.pts[q.pts.length - 2]!;
      return Math.atan2(a.z - nd.z, a.x - nd.x);
    };
    const th = Math.abs(((dir(e) - dir(f) + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    const ang = Math.PI - th;
    const w = Math.min(MAX_TRIM, (e.half + f.half + 1) / Math.max(0.05, Math.sin(ang)) + 3);
    if (da <= w) return true;
  }
  return false;
}

/**
 * Short stubs of a big junction cluster (a square, a flyover foot) end at nodes a few metres from each other without sharing one;
 * their carriageways legitimately merge around those nodes.
 */
export function inCluster(N: RoadNet, e: REdge, f: REdge, x: number, z: number): boolean {
  const r = e.half + f.half + 3;
  for (const q of [e, f]) {
    if (q.len > 70) continue;
    for (const n of [q.a, q.b]) {
      const nd = N.nodes[n]!;
      if (Math.hypot(nd.x - x, nd.z - z) < r) return true;
    }
  }
  return false;
}

/** Roads crossing without a junction, and carriageways lying on top of each other away from a shared junction. */
export function roadConflicts(N: RoadNet, onlyInfill = false): RoadConflict[] {
  const out: RoadConflict[] = [];
  const seen = new Set<string>();
  for (const e of N.edges) {
    for (let i = 0; i + 1 < e.pts.length; i++) {
      const a = e.pts[i]!,
        b = e.pts[i + 1]!;
      const mx = (a.x + b.x) / 2,
        mz = (a.z + b.z) / 2;
      for (const h of N.segmentsNear(mx, mz, Math.hypot(b.x - a.x, b.z - a.z) / 2 + 1)) {
        const f = N.edges[h.e]!;
        if (f.id < e.id || (f.id === e.id && h.i <= i + 1)) continue;
        if (onlyInfill && !e.infill && !f.infill) continue;
        const hit = segCross(a, b, f.pts[h.i]!, f.pts[h.i + 1]!);
        if (!hit) continue;
        const nodes = f.id === e.id ? [] : nodeOf(e, f);
        if (nodes.some((n) => Math.hypot(N.nodes[n]!.x - hit.x, N.nodes[n]!.z - hit.z) < 2.5)) continue;
        const key = `${e.id}:${f.id}:${Math.round(hit.x / 3)}:${Math.round(hit.z / 3)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ kind: 'road-cross', e, f, x: hit.x, z: hit.z });
      }
    }
    // (a drawn street is probed for generated streets lying on it too)
    for (let s = 0; s <= e.len; s += 2) {
      const p = N.at(e, s);
      const nx = Math.cos(p.yaw),
        nz = -Math.sin(p.yaw);
      for (const off of [0, e.half * 0.8, -e.half * 0.8]) {
        const x = p.x + nx * off,
          z = p.z + nz * off;
        for (const h of N.segmentsNear(x, z, 0.1)) {
          const f = N.edges[h.e]!;
          if (f === e) continue;
          if (onlyInfill && !e.infill && !f.infill) continue;
          if (dseg({ x, z }, f.pts[h.i]!, f.pts[h.i + 1]!) >= f.half - 0.3) continue;
          if (inWedge(N, e, f, p.x, p.z)) continue;
          if (inCluster(N, e, f, p.x, p.z)) continue;
          const key = `o${Math.min(e.id, f.id)}:${Math.max(e.id, f.id)}:${Math.round(x / 6)}:${Math.round(z / 6)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ kind: 'road-overlap', e, f, x, z });
        }
      }
    }
  }
  return out;
}

export interface WalkConflict {
  /** the edge whose rendered pavement it is, and the road it runs over */
  e: REdge;
  f: REdge;
  x: number;
  z: number;
  side: 1 | -1;
  /** distance along `e` */
  s: number;
}

/** Pavements (as the junction geometry leaves them) running over the carriageway of another road. */
export function pavementConflicts(N: RoadNet, onlyInfill = false, only?: Set<number>): WalkConflict[] {
  const out: WalkConflict[] = [];
  const seen = new Set<string>();
  const J = junctionsOf(N);
  for (const e of N.edges) {
    if (only && !only.has(e.id)) continue;
    const t = J.trims.get(e.id) ?? { aL: 0, aR: 0, bL: 0, bR: 0 };
    for (let s = 0; s <= e.len; s += 2) {
      const p = N.at(e, s);
      const nx = Math.cos(p.yaw),
        nz = -Math.sin(p.yaw);
      for (const side of [1, -1] as const) {
        const s0 = side > 0 ? t.aL : t.aR,
          s1 = e.len - (side > 0 ? t.bL : t.bR);
        if (s < s0 + 0.5 || s > s1 - 0.5) continue;
        const off = side * (e.half + PAVEMENT / 2);
        // (nx, nz) is the right-hand normal: the left of travel is -n
        const lx = p.x - nx * off,
          lz = p.z - nz * off;
        for (const h of N.segmentsNear(lx, lz, 0.1)) {
          const f = N.edges[h.e]!;
          if (f === e) continue;
          if (onlyInfill && !e.infill && !f.infill) continue;
          if (dseg({ x: lx, z: lz }, f.pts[h.i]!, f.pts[h.i + 1]!) >= f.half - 0.3) continue;
          const key = `w${e.id}:${f.id}:${Math.round(lx / 6)}:${Math.round(lz / 6)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ e, f, x: lx, z: lz, side, s });
        }
      }
    }
  }
  return out;
}
