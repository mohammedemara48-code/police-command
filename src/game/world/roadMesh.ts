/**
 * Road surfaces of the open city: carriageway, kerb, pavement, corner fills at junctions, lane marks and zebra crossings.
 * Everything is poured per chunk (a segment belongs to the chunk holding its midpoint, so nothing is built twice).
 */
import { PAVEMENT, type V2 } from '../logic/cairo';
import { net, type REdge, type RNode } from '../logic/roadnet';
import { Soup } from './Soup';

export const ASPHALT_Y: Record<string, number> = { arterial: 0.05, collector: 0.046, local: 0.042 };
export const PAVE_Y = 0.15;
const PAINT_Y = 0.07;

interface P {
  x: number;
  z: number;
  /** left normal (miter-scaled) */
  nx: number;
  nz: number;
  s: number;
}

const profiles = new Map<number, P[]>();
function profile(e: REdge): P[] {
  let p = profiles.get(e.id);
  if (p) return p;
  const pts = e.pts;
  p = [];
  let last = { x: 1, z: 0 };
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)]!,
      b = pts[i]!,
      c = pts[Math.min(pts.length - 1, i + 1)]!;
    const d1 = norm(b.x - a.x, b.z - a.z) ?? norm(c.x - b.x, c.z - b.z) ?? last;
    const d2 = norm(c.x - b.x, c.z - b.z) ?? d1;
    last = d2;
    const n1 = { x: -d1.z, z: d1.x },
      n2 = { x: -d2.z, z: d2.x };
    let mx = n1.x + n2.x,
      mz = n1.z + n2.z;
    const ml = Math.hypot(mx, mz) || 1;
    mx /= ml;
    mz /= ml;
    const k = 1 / Math.max(0.55, mx * n1.x + mz * n1.z);
    p.push({ x: b.x, z: b.z, nx: mx * k, nz: mz * k, s: e.cum[i]! });
  }
  profiles.set(e.id, p);
  return p;
}
function norm(x: number, z: number) {
  const l = Math.hypot(x, z);
  return l < 1e-9 ? null : { x: x / l, z: z / l };
}

interface Trim {
  /** trim at the a end and the b end for the left (+) and right (-) pavement */
  aL: number;
  aR: number;
  bL: number;
  bR: number;
}
interface Corner {
  poly: V2[];
}
const trims = new Map<number, Trim>();
const corners: Corner[] = [];
const cornersByNode = new Map<number, Corner[]>();
let analysed = false;

function analyse() {
  if (analysed) return;
  analysed = true;
  const N = net();
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
      if (th >= 2.95 || th < 0.12) continue;
      const hA = A.e.half,
        hB = B.e.half;
      const tA = clamp(hB / Math.sin(th) + hA / Math.tan(th), 0.6, 26);
      const tB = clamp(hA / Math.sin(th) + hB / Math.tan(th), 0.6, 26);
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
      corners.push(c);
      const l = cornersByNode.get(n.id);
      if (l) l.push(c);
      else cornersByNode.set(n.id, [c]);
    }
  }
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export interface Acc {
  asphalt: Soup;
  paving: Soup;
  paint: Soup;
}

/** Point `off` metres to the left of the centre line at segment i, fraction k. */
function at(P: P[], i: number, k: number, off: number): V2 {
  const a = P[i]!,
    b = P[i + 1]!;
  const x = a.x + (b.x - a.x) * k,
    z = a.z + (b.z - a.z) * k;
  const nx = a.nx + (b.nx - a.nx) * k,
    nz = a.nz + (b.nz - a.nz) * k;
  return { x: x + nx * off, z: z + nz * off };
}

/** Walk the part of an edge between s0 and s1 segment by segment, for the segments owned by this chunk. */
function each(
  e: REdge,
  s0: number,
  s1: number,
  own: (i: number) => boolean,
  f: (i: number, k0: number, k1: number, P: P[]) => void
) {
  const P = profile(e);
  for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i]!.s,
      b = P[i + 1]!.s;
    if (b <= s0 || a >= s1 || b - a < 1e-6) continue;
    if (!own(i)) continue;
    f(i, Math.max(0, (s0 - a) / (b - a)), Math.min(1, (s1 - a) / (b - a)), P);
  }
}

const bboxes = new Map<number, { x0: number; z0: number; x1: number; z1: number }>();
function bbox(e: REdge) {
  let b = bboxes.get(e.id);
  if (!b) {
    b = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
    for (const p of e.pts) {
      b.x0 = Math.min(b.x0, p.x);
      b.x1 = Math.max(b.x1, p.x);
      b.z0 = Math.min(b.z0, p.z);
      b.z1 = Math.max(b.z1, p.z);
    }
    bboxes.set(e.id, b);
  }
  return b;
}

export function edgesIn(x0: number, z0: number, x1: number, z1: number): REdge[] {
  return net().edges.filter((e) => {
    const b = bbox(e);
    return b.x1 > x0 - 2 && b.x0 < x1 + 2 && b.z1 > z0 - 2 && b.z0 < z1 + 2;
  });
}

export interface RoadStats {
  crossings: number;
}

/** Pour the roads of one chunk. */
export function pourRoads(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  acc: Acc,
  edges = edgesIn(x0, z0, x1, z1)
): RoadStats {
  analyse();
  const N = net();
  const inside = (x: number, z: number) => x >= x0 && x < x1 && z >= z0 && z < z1;
  let crossings = 0;
  for (const e of edges) {
    const P = profile(e);
    const own = (i: number) => inside((P[i]!.x + P[i + 1]!.x) / 2, (P[i]!.z + P[i + 1]!.z) / 2);
    const h = e.half;
    const ya = ASPHALT_Y[e.cls]!;
    const t = trims.get(e.id) ?? { aL: 0, aR: 0, bL: 0, bR: 0 };
    // carriageway
    each(e, 0, e.len, own, (i, k0, k1) => {
      const l0 = at(P, i, k0, h),
        r0 = at(P, i, k0, -h),
        l1 = at(P, i, k1, h),
        r1 = at(P, i, k1, -h);
      acc.asphalt.flat(ya, [l0, r0, r1, l1]);
    });
    // pavements with their kerb faces and outer skirts
    for (const side of [1, -1]) {
      const s0 = side > 0 ? t.aL : t.aR,
        s1 = e.len - (side > 0 ? t.bL : t.bR);
      if (s1 - s0 < 0.3) continue;
      each(e, s0, s1, own, (i, k0, k1) => {
        const a0 = at(P, i, k0, side * h),
          a1 = at(P, i, k1, side * h);
        const b0 = at(P, i, k0, side * (h + PAVEMENT)),
          b1 = at(P, i, k1, side * (h + PAVEMENT));
        acc.paving.flat(PAVE_Y, [a0, b0, b1, a1]);
        // kerb face (towards the road) and the outer skirt (towards the lots)
        const nx = (P[i]!.nx + P[i + 1]!.nx) / 2,
          nz = (P[i]!.nz + P[i + 1]!.nz) / 2;
        const nl = Math.hypot(nx, nz) || 1;
        acc.paving.wall(a0.x, a0.z, a1.x, a1.z, ya - 0.002, PAVE_Y, (-side * nx) / nl, (-side * nz) / nl);
        acc.paving.wall(b0.x, b0.z, b1.x, b1.z, 0, PAVE_Y, (side * nx) / nl, (side * nz) / nl);
      });
    }
    // lane marks
    if (e.ring || e.cls === 'local' || e.len < 20) continue;
    const m0 = Math.max(t.aL, t.aR) + 5,
      m1 = e.len - Math.max(t.bL, t.bR) - 5;
    if (m1 - m0 < 4) continue;
    const line = (off: number, w: number, a: number, b: number, dash: number, gap: number) => {
      for (let s = a; s < b; s += dash + gap) {
        const se = Math.min(b, s + dash);
        each(e, s, se, own, (i, k0, k1) => {
          acc.paint.flat(PAINT_Y + (e.cls === 'arterial' ? 0 : 0), [
            at(P, i, k0, off + w / 2),
            at(P, i, k0, off - w / 2),
            at(P, i, k1, off - w / 2),
            at(P, i, k1, off + w / 2)
          ]);
        });
      }
    };
    if (e.cls === 'arterial') {
      line(0.14, 0.12, m0, m1, m1 - m0, 1);
      line(-0.14, 0.12, m0, m1, m1 - m0, 1);
      line(h / 2, 0.12, m0, m1, 3, 5);
      line(-h / 2, 0.12, m0, m1, 3, 5);
    } else line(0, 0.13, m0, m1, 3, 5);
  }
  // corner fills and zebra crossings at junctions
  for (const n of N.nodes) {
    if (n.edges.length < 3 || n.x < x0 - 30 || n.x >= x1 + 30 || n.z < z0 - 30 || n.z >= z1 + 30) continue;
    for (const c of cornersByNode.get(n.id) ?? []) {
      const cx = c.poly.reduce((s, p) => s + p.x, 0) / c.poly.length,
        cz = c.poly.reduce((s, p) => s + p.z, 0) / c.poly.length;
      if (!inside(cx, cz)) continue;
      acc.paving.flat(PAVE_Y, c.poly);
      // outer skirts of the corner
      const [, oa, q, ob] = c.poly as [V2, V2, V2, V2, V2];
      for (const [p, r] of [
        [oa, q],
        [q, ob]
      ] as const) {
        const dx = r.x - p.x,
          dz = r.z - p.z;
        const mx = (p.x + r.x) / 2 - (c.poly[0]!.x + c.poly[4]!.x) / 2,
          mz = (p.z + r.z) / 2 - (c.poly[0]!.z + c.poly[4]!.z) / 2;
        const sgn = -dz * mx + dx * mz > 0 ? 1 : -1;
        void sgn;
        acc.paving.wall(p.x, p.z, r.x, r.z, 0, PAVE_Y, mx, mz);
      }
    }
    for (const id of n.edges) {
      const e = N.edges[id]!;
      if (e.cls === 'local' && n.edges.length < 4) continue;
      if (e.len < 28 || e.ring) continue;
      const atA = e.a === n.id;
      const t = trims.get(e.id);
      const tr = t ? Math.max(atA ? t.aL : t.bL, atA ? t.aR : t.bR) : 0;
      const sc = atA ? tr + 1.2 : e.len - tr - 1.2 - 3;
      const P = profile(e);
      const mid = N.at(e, sc + 1.5);
      if (!inside(mid.x, mid.z)) continue;
      crossings++;
      const h = e.half - 0.7;
      for (let o = -h; o <= h; o += 1.15) {
        // locate segment containing sc..sc+3
        each(
          e,
          sc,
          sc + 3,
          () => true,
          (i, k0, k1) => {
            acc.paint.flat(PAINT_Y, [
              at(P, i, k0, o - 0.25),
              at(P, i, k0, o + 0.25),
              at(P, i, k1, o + 0.25),
              at(P, i, k1, o - 0.25)
            ]);
          }
        );
      }
    }
  }
  return { crossings };
}

/** How far an edge's pavements are cut back at each end (the junction box) and the larger of the two sides. */
export function endMargins(e: REdge): { a: number; b: number } {
  analyse();
  const t = trims.get(e.id);
  return t ? { a: Math.max(t.aL, t.aR), b: Math.max(t.bL, t.bR) } : { a: 0, b: 0 };
}

/** The pavement corners at a junction (poles and signs stand on them). */
export function cornersAt(node: number): V2[][] {
  analyse();
  return (cornersByNode.get(node) ?? []).map((c) => c.poly);
}

/** Where the zebra crossings lie: the centre of the stripes across a junction arm and the arm's heading there. */
export interface Zebra {
  node: number;
  edge: number;
  x: number;
  z: number;
  /** heading of the street at the crossing (the stripes run across it) */
  yaw: number;
  half: number;
}
export function zebras(): Zebra[] {
  analyse();
  const N = net();
  const out: Zebra[] = [];
  for (const n of N.nodes) {
    if (n.edges.length < 3) continue;
    for (const id of n.edges) {
      const e = N.edges[id]!;
      if (e.cls === 'local' && n.edges.length < 4) continue;
      if (e.len < 28 || e.ring) continue;
      const atA = e.a === n.id;
      const t = trims.get(e.id);
      const tr = t ? Math.max(atA ? t.aL : t.bL, atA ? t.aR : t.bR) : 0;
      const sc = atA ? tr + 1.2 : e.len - tr - 1.2 - 3;
      const m = N.at(e, sc + 1.5);
      out.push({ node: n.id, edge: e.id, x: m.x, z: m.z, yaw: m.yaw, half: e.half });
    }
  }
  return out;
}
