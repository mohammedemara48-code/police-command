/**
 * Junction geometry of the road network (pure): where each junction cuts the pavements back, the pavement corner fills, and the
 * bits of the network that build on them. The renderer pours exactly these shapes and the city audit checks them.
 */
import { PAVEMENT, type V2 } from './cairo';
import { MAX_TRIM, pavementConflicts } from './netcheck';
import { net, type REdge, type RNode, type RoadNet } from './roadnet';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
function norm(x: number, z: number) {
  const l = Math.hypot(x, z);
  return l < 1e-9 ? null : { x: x / l, z: z / l };
}

export interface Trim {
  /** trim at the a end and the b end for the left (+) and right (-) pavement */
  aL: number;
  aR: number;
  bL: number;
  bR: number;
}
export interface Corner {
  poly: V2[];
}
export interface Junctions {
  trims: Map<number, Trim>;
  cornersByNode: Map<number, Corner[]>;
}
const cache = new WeakMap<RoadNet, Junctions>();
/** Forget the junction geometry of a network whose edges changed. */
export function resetJunctions(N: RoadNet) {
  cache.delete(N);
}

/** Pavement trims and corner fills of every junction of a network (computed once per network). */
export function junctionsOf(N: RoadNet): Junctions {
  let J = cache.get(N);
  if (J) return J;
  const trims = new Map<number, Trim>();
  const cornersByNode = new Map<number, Corner[]>();
  J = { trims, cornersByNode };
  cache.set(N, J);
  const away = (e: REdge, n: RNode) => {
    const pts = e.pts;
    return e.a === n.id
      ? norm(pts[1]!.x - pts[0]!.x, pts[1]!.z - pts[0]!.z)!
      : norm(pts[pts.length - 2]!.x - pts[pts.length - 1]!.x, pts[pts.length - 2]!.z - pts[pts.length - 1]!.z)!;
  };
  const tr = (e: REdge) => {
    let t = trims.get(e.id);
    if (!t) trims.set(e.id, (t = { aL: 0, aR: 0, bL: 0, bR: 0 }));
    return t;
  };
  for (const n of N.nodes) {
    if (n.edges.length < 3) continue;
    const arms = n.edges.map((id) => {
      const e = N.edges[id]!;
      const d = away(e, n);
      return { e, d, ang: Math.atan2(d.z, d.x) };
    });
    arms.sort((a, b) => a.ang - b.ang);
    for (let i = 0; i < arms.length; i++) {
      const A = arms[i]!,
        B = arms[(i + 1) % arms.length]!;
      if (A.e === B.e) continue;
      let th = B.ang - A.ang;
      if (th <= 0) th += Math.PI * 2;
      if (th >= 2.95 || th < 0.05) continue;
      const hA = A.e.half,
        hB = B.e.half;
      // two roads leaving a junction at a narrow angle share a wedge of asphalt: the pavements between them start where the kerbs part
      // (kerbs meet at t0; with no corner polygon the two pavements also need room side by side beyond that)
      const gap = th < 0.7 ? (PAVEMENT * 2 + 0.4) / Math.sin(th) : 0;
      const tA = clamp(hB / Math.sin(th) + hA / Math.tan(th) + gap, 0.6, MAX_TRIM);
      const tB = clamp(hA / Math.sin(th) + hB / Math.tan(th) + gap, 0.6, MAX_TRIM);
      // side (in each edge's own frame) that faces the other arm
      const sideA = A.e.a === n.id ? 1 : -1;
      const sideB = B.e.a === n.id ? -1 : 1;
      const ta = tr(A.e),
        tb = tr(B.e);
      if (A.e.a === n.id) {
        if (sideA > 0) ta.aL = Math.max(ta.aL, tA);
        else ta.aR = Math.max(ta.aR, tA);
      } else if (sideA > 0) ta.bL = Math.max(ta.bL, tA);
      else ta.bR = Math.max(ta.bR, tA);
      // B's facing side is the opposite sign of A's in the away frame
      if (B.e.a === n.id) {
        if (sideB < 0) tb.aR = Math.max(tb.aR, tB);
        else tb.aL = Math.max(tb.aL, tB);
      } else if (sideB > 0) tb.bL = Math.max(tb.bL, tB);
      else tb.bR = Math.max(tb.bR, tB);
      if (th < 0.7) continue;
      // corner polygon
      const pA = { x: -A.d.z, z: A.d.x },
        pB = { x: -B.d.z, z: B.d.x };
      const ia = { x: n.x + A.d.x * tA + pA.x * hA, z: n.z + A.d.z * tA + pA.z * hA };
      const oa = { x: ia.x + pA.x * PAVEMENT, z: ia.z + pA.z * PAVEMENT };
      const ib = { x: n.x + B.d.x * tB - pB.x * hB, z: n.z + B.d.z * tB - pB.z * hB };
      const ob = { x: ib.x - pB.x * PAVEMENT, z: ib.z - pB.z * PAVEMENT };
      const den = A.d.x * B.d.z - A.d.z * B.d.x;
      let q = { x: (oa.x + ob.x) / 2, z: (oa.z + ob.z) / 2 };
      if (Math.abs(den) > 0.12) {
        const u = ((ob.x - oa.x) * B.d.z - (ob.z - oa.z) * B.d.x) / den;
        const c = { x: oa.x + A.d.x * u, z: oa.z + A.d.z * u };
        if (Math.hypot(c.x - oa.x, c.z - oa.z) < PAVEMENT * 4 && Math.hypot(c.x - ob.x, c.z - ob.z) < PAVEMENT * 4)
          q = c;
      }
      const c: Corner = { poly: [ia, oa, q, ob, ib] };
      const l = cornersByNode.get(n.id);
      if (l) l.push(c);
      else cornersByNode.set(n.id, [c]);
    }
  }
  // whatever pavement still runs over another road after the junction cuts (merging streets, flyover feet) is cut back too
  // (cutting pavements back never makes a new conflict, so later passes only recheck the edges that had one)
  let recheck: Set<number> | undefined;
  for (let pass = 0; pass < 6; pass++) {
    const cs = pavementConflicts(N, false, recheck);
    if (!cs.length) break;
    recheck = new Set(cs.map((c) => c.e.id));
    const mid = new Map<string, { e: REdge; side: 1 | -1; a: number; b: number }>();
    for (const c of cs) {
      const k = `${c.e.id}:${c.side}`;
      let m = mid.get(k);
      if (!m) mid.set(k, (m = { e: c.e, side: c.side, a: 0, b: 0 }));
      if (c.s < c.e.len / 2) m.a = Math.max(m.a, c.s + 3);
      else m.b = Math.max(m.b, c.e.len - c.s + 3);
    }
    for (const m of mid.values()) {
      let t = trims.get(m.e.id);
      if (!t) trims.set(m.e.id, (t = { aL: 0, aR: 0, bL: 0, bR: 0 }));
      if (m.side > 0) {
        t.aL = Math.max(t.aL, m.a);
        t.bL = Math.max(t.bL, m.b);
      } else {
        t.aR = Math.max(t.aR, m.a);
        t.bR = Math.max(t.bR, m.b);
      }
    }
  }
  return J;
}

const J = () => junctionsOf(net());

/** Pavement start/end of an edge on each side (the junction box cuts the pavement back). */
export function pavementSpan(e: REdge, side: 1 | -1): { s0: number; s1: number } {
  const t = J().trims.get(e.id) ?? { aL: 0, aR: 0, bL: 0, bR: 0 };
  return side > 0 ? { s0: t.aL, s1: e.len - t.bL } : { s0: t.aR, s1: e.len - t.bR };
}

/** How far an edge's pavements are cut back at each end (the junction box) and the larger of the two sides. */
export function endMargins(e: REdge): { a: number; b: number } {
  const t = J().trims.get(e.id);
  return t ? { a: Math.max(t.aL, t.aR), b: Math.max(t.bL, t.bR) } : { a: 0, b: 0 };
}

/** The pavement corners at a junction (poles and signs stand on them). */
export function cornersAt(node: number): V2[][] {
  return (J().cornersByNode.get(node) ?? []).map((c) => c.poly);
}
