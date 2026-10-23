/**
 * Road surfaces of the open city: carriageway, kerb, pavement, corner fills at junctions, lane marks and zebra crossings.
 * Everything is poured per chunk (a segment belongs to the chunk holding its midpoint, so nothing is built twice).
 */
import { type V2 } from '../logic/cairo';
import { net, type REdge } from '../logic/roadnet';
import { junctionsOf } from '../logic/junctions';
import { Soup } from './Soup';
import { inFill, inPoly, paveRegion, triangulate, type PaveRegion } from './pavement';
import { shapeOf, type ProfPt } from '../logic/roadShape';

const J = () => junctionsOf(net());

export const ASPHALT_Y: Record<string, number> = { arterial: 0.05, collector: 0.046, local: 0.042 };
export const PAVE_Y = 0.15;
const PAINT_Y = 0.07;
const FILLET_Y = 0.04;
/** length of one yellow or black kerb stripe (m) */
export const STRIPE = 1.1;
const YELLOW: [number, number, number] = [0.97, 0.69, 0.04];
const BLACK: [number, number, number] = [0.03, 0.03, 0.03];
/** metres per pavement texture repeat (4 x 4 tiles of 0.5 m) */
export const TILE_REPEAT = 2;

type P = ProfPt;
function profile(e: REdge): P[] {
  return shapeOf(net()).prof[e.id]!;
}

export interface Acc {
  asphalt: Soup;
  paving: Soup;
  /** the pale stone kerb: its top strip and the face towards the road */
  kerb?: Soup;
  paint: Soup;
}
/** Width of the kerb's top strip (m). */
export const KERB_W = 0.42;

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
  const N = net();
  const inside = (x: number, z: number) => x >= x0 && x < x1 && z >= z0 && z < z1;
  let crossings = 0;
  for (const e of edges) {
    const P = profile(e);
    const own = (i: number) => inside((P[i]!.x + P[i + 1]!.x) / 2, (P[i]!.z + P[i + 1]!.z) / 2);
    const h = e.half;
    const ya = ASPHALT_Y[e.cls]!;
    const t = J().trims.get(e.id) ?? { aL: 0, aR: 0, bL: 0, bR: 0 };
    // carriageway (the exact regions the car drives on)
    for (const c of carrOf(e.id)) if (own(c.i)) acc.asphalt.flat(ya, c.poly.p);
    // lane marks and edge lines
    if (e.ring || e.len < 14) continue;
    const m0 = Math.max(t.aL, t.aR) + (e.cls === 'local' ? 2.5 : 5),
      m1 = e.len - Math.max(t.bL, t.bR) - (e.cls === 'local' ? 2.5 : 5);
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
    // solid edge lines a little inside each kerb, so the drivable asphalt ends visibly
    line(h - 0.42, 0.14, m0, m1, m1 - m0, 1);
    line(-(h - 0.42), 0.14, m0, m1, m1 - m0, 1);
    if (e.cls === 'local') {
      if (e.len >= 20) line(0, 0.13, m0, m1, 3, 5);
    } else if (e.cls === 'arterial') {
      line(0.14, 0.12, m0, m1, m1 - m0, 1);
      line(-0.14, 0.12, m0, m1, m1 - m0, 1);
      line(h / 2, 0.12, m0, m1, 3, 5);
      line(-h / 2, 0.12, m0, m1, 3, 5);
    } else line(0, 0.13, m0, m1, 3, 5);
  }
  // round caps where a node leaves an open wedge, with their pavement rings
  const SH = shapeOf(N);
  SH.discs.forEach((d, k) => {
    if (!inside(d.x, d.z)) return;
    void k;
    acc.asphalt.flat(FILLET_Y, d.poly.p);
  });
  // tapers where a street narrows, with the pavement beside them
  SH.tapers.forEach((t, k) => {
    const n = N.nodes[t.node]!;
    if (!inside(n.x, n.z)) return;
    void k;
    acc.asphalt.flat(FILLET_Y, t.poly.p);
  });
  // rounded kerb fillets at junction corners (asphalt)
  for (const f of shapeOf(N).fillets) {
    if (!inside(f.P.x, f.P.z)) continue;
    for (const t of f.tris) acc.asphalt.flat(FILLET_Y, t.p);
  }
  // pavements, kerbs and the asphalt poured where a thin tip or crumb of pavement was taken out
  const reg = paveRegion(x0, z0, x1, z1);
  pourPavement(acc, reg, x0, z0, x1, z1);
  // zebra crossings at junctions
  for (const n of N.nodes) {
    if (n.edges.length < 3 || n.x < x0 - 30 || n.x >= x1 + 30 || n.z < z0 - 30 || n.z >= z1 + 30) continue;
    for (const id of n.edges) {
      const e = N.edges[id]!;
      if (e.cls === 'local' && n.edges.length < 4) continue;
      if (e.len < 28 || e.ring) continue;
      const atA = e.a === n.id;
      const t = J().trims.get(e.id);
      const tr = t ? Math.max(atA ? t.aL : t.bL, atA ? t.aR : t.bR) : 0;
      const sc = atA ? tr + 1.2 : e.len - tr - 1.2 - 3;
      const P = profile(e);
      const mid = N.at(e, sc + 1.5);
      if (!inside(mid.x, mid.z) || !zebraKeys().has(`${n.id}:${e.id}`)) continue;
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
            const q = [at(P, i, k0, o - 0.25), at(P, i, k0, o + 0.25), at(P, i, k1, o + 0.25), at(P, i, k1, o - 0.25)];
            // never paint a stripe onto an island or a pavement corner
            if (q.some((v) => onPave(v.x, v.z))) return;
            acc.paint.flat(PAINT_Y, q);
          }
        );
      }
    }
  }
  return { crossings };
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
  const N = net();
  const out: Zebra[] = [];
  for (const n of N.nodes) {
    if (n.edges.length < 3) continue;
    for (const id of n.edges) {
      const e = N.edges[id]!;
      if (e.cls === 'local' && n.edges.length < 4) continue;
      if (e.len < 28 || e.ring) continue;
      const atA = e.a === n.id;
      const t = J().trims.get(e.id);
      const tr = t ? Math.max(atA ? t.aL : t.bL, atA ? t.aR : t.bR) : 0;
      const sc = atA ? tr + 1.2 : e.len - tr - 1.2 - 3;
      const m = N.at(e, sc + 1.5);
      const z: Zebra = { node: n.id, edge: e.id, x: m.x, z: m.z, yaw: m.yaw, half: e.half };
      // a crossing that would lie over another one (short arms at a busy junction) is left out
      if (out.some((o) => zebraOverlap(o, z))) continue;
      out.push(z);
    }
  }
  return out;
}

/** Do two crossings' stripe rectangles (3 m along the street, the carriageway across) overlap? */
function zebraOverlap(a: Zebra, b: Zebra): boolean {
  if (Math.hypot(a.x - b.x, a.z - b.z) > a.half + b.half + 4) return false;
  const corners = (z: Zebra) => {
    const fx = Math.sin(z.yaw),
      fz = Math.cos(z.yaw),
      rx = fz,
      rz = -fx;
    const h = z.half - 0.4;
    return [
      [-1.6, -h],
      [1.6, -h],
      [1.6, h],
      [-1.6, h]
    ].map(([f, r]) => ({ x: z.x + fx * f! + rx * r!, z: z.z + fz * f! + rz * r! }));
  };
  const A = corners(a),
    B = corners(b);
  for (const poly of [A, B])
    for (let k = 0; k < 4; k++) {
      const p = poly[k]!,
        q = poly[(k + 1) % 4]!;
      const nx = -(q.z - p.z),
        nz = q.x - p.x;
      const pa = A.map((v) => v.x * nx + v.z * nz),
        pb = B.map((v) => v.x * nx + v.z * nz);
      if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
    }
  return true;
}

let zk: Set<string> | null = null;
const zebraKeys = () => (zk ??= new Set(zebras().map((z) => `${z.node}:${z.edge}`)));

const CH = 128;
/** On the final pavement (in whichever chunk holds the point)? */
export function onPave(x: number, z: number): boolean {
  const i = Math.floor(x / CH),
    j = Math.floor(z / CH);
  const r = paveRegion(i * CH, j * CH, (i + 1) * CH, (j + 1) * CH);
  for (const g of r.pave) if (inPoly(g.outer, x, z) && !g.holes.some((h) => inPoly(h, x, z))) return true;
  return false;
}

const carrIdx = new WeakMap<object, Map<number, ReturnType<typeof shapeOf>['carr']>>();
function carrOf(e: number) {
  const S = shapeOf(net());
  let m = carrIdx.get(S);
  if (!m) {
    m = new Map();
    for (const c of S.carr) {
      const l = m.get(c.e);
      if (l) l.push(c);
      else m.set(c.e, [c]);
    }
    carrIdx.set(S, m);
  }
  return m.get(e) ?? [];
}


/**
 * Pour the chunk's pavement region: the slab (triangulated with its holes), the asphalt in place of what was taken
 * out, and along the boundary either the striped kerb (where carriageway lies right outside) or a plain edge face.
 */
function pourPavement(acc: Acc, reg: PaveRegion, x0: number, z0: number, x1: number, z1: number) {
  const N = net();
  for (const f of reg.fill) {
    const pts = [...f.outer, ...f.holes.flat()];
    for (const t of triangulate(f.outer, f.holes)) upTri(acc.asphalt, FILLET_Y - 0.003, pts, t, 5);
  }
  const onBox = (a: V2, b: V2) => {
    const e = 1e-3;
    return (
      (Math.abs(a.x - x0) < e && Math.abs(b.x - x0) < e) ||
      (Math.abs(a.x - x1) < e && Math.abs(b.x - x1) < e) ||
      (Math.abs(a.z - z0) < e && Math.abs(b.z - z0) < e) ||
      (Math.abs(a.z - z1) < e && Math.abs(b.z - z1) < e)
    );
  };
  const asphaltAt = (x: number, z: number) => N.onRoad(x, z, 0) || inFill(x, z);
  // slab test over the pieces of the chunk (inside an outer and none of its holes), independent of ring winding
  const pieces = reg.pave.map((g) => {
    let rx0 = Infinity,
      rz0 = Infinity,
      rx1 = -Infinity,
      rz1 = -Infinity;
    for (const v of g.outer) {
      rx0 = Math.min(rx0, v.x);
      rx1 = Math.max(rx1, v.x);
      rz0 = Math.min(rz0, v.z);
      rz1 = Math.max(rz1, v.z);
    }
    return { g, x0: rx0, z0: rz0, x1: rx1, z1: rz1 };
  });
  const slabAt = (x: number, z: number) =>
    pieces.some((q) => x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1 && inPoly(q.g.outer, x, z) && !q.g.holes.some((h) => inPoly(h, x, z)));
  for (const g of reg.pave) {
    const pts = [...g.outer, ...g.holes.flat()];
    for (const t of triangulate(g.outer, g.holes)) upTri(acc.paving, PAVE_Y, pts, t, TILE_REPEAT);
    for (const ring of [g.outer, ...g.holes]) {
      // split the ring into short pieces, each tagged kerb / edge / chunk border
      const pcs: { a: V2; b: V2; kind: 0 | 1 | 2 | 3 | 4 }[] = [];
      for (let k = 0; k < ring.length; k++) {
        const a = ring[k]!,
          b = ring[(k + 1) % ring.length]!;
        const L = Math.hypot(b.x - a.x, b.z - a.z);
        if (L < 1e-4) continue;
        if (onBox(a, b)) {
          pcs.push({ a, b, kind: 2 });
          continue;
        }
        // the slab lies on the left of each ring piece (outers CCW, holes CW): outward is the right-hand normal
        const nx = (b.z - a.z) / L,
          nz = -(b.x - a.x) / L;
        const n = Math.max(1, Math.ceil(L / 0.3));
        for (let i = 0; i < n; i++) {
          const p = { x: a.x + ((b.x - a.x) * i) / n, z: a.z + ((b.z - a.z) * i) / n },
            q = { x: a.x + ((b.x - a.x) * (i + 1)) / n, z: a.z + ((b.z - a.z) * (i + 1)) / n };
          const mx = (p.x + q.x) / 2,
            mz = (p.z + q.z) / 2;
          // the kerb goes on the side away from the slab, wherever asphalt is right outside
          const rgt = { x: mx + nx * 0.12, z: mz + nz * 0.12 },
            lft = { x: mx - nx * 0.12, z: mz - nz * 0.12 };
          // (a test point over the chunk border falls back on the ring's winding: slab on the left)
          const out = (v: V2) => v.x < x0 || v.x > x1 || v.z < z0 || v.z > z1;
          const sl = out(lft) || out(rgt) ? true : slabAt(lft.x, lft.z),
            sr = out(lft) || out(rgt) ? false : slabAt(rgt.x, rgt.z);
          if (sl && !sr) pcs.push({ a: p, b: q, kind: asphaltAt(rgt.x, rgt.z) ? 1 : 0 });
          else if (sr && !sl) pcs.push({ a: q, b: p, kind: asphaltAt(lft.x, lft.z) ? 3 : 4 });
          else pcs.push({ a: p, b: q, kind: 2 });
        }
      }
      if (!pcs.length) continue;
      // start the walk at a change of kind so runs do not wrap
      let s0 = pcs.findIndex((p, i) => p.kind !== pcs[(i + pcs.length - 1) % pcs.length]!.kind);
      if (s0 < 0) s0 = 0;
      let run: V2[] = [];
      const flush = () => {
        if (run.length >= 2) {
          const r = rev ? run.reverse() : run;
          const closed = !rev && run.length === pcs.length + 1 && s0 === 0;
          // an open run runs on 2 cm at each end, so it meets the next run (or the next chunk's) without a crack
          const ext = (v: V2, w: V2) => {
            const L = Math.hypot(v.x - w.x, v.z - w.z) || 1;
            return { x: v.x + ((v.x - w.x) / L) * 0.02, z: v.z + ((v.z - w.z) / L) * 0.02 };
          };
          if (!closed) {
            r[0] = ext(r[0]!, r[1]!);
            r[r.length - 1] = ext(r[r.length - 1]!, r[r.length - 2]!);
          }
          kerbRun(acc, r, closed);
        }
        run = [];
      };
      // kind 3 pieces are reversed (slab on the right of the ring here): they run backwards along the ring
      let rev = false;
      for (let k = 0; k < pcs.length; k++) {
        const pc = pcs[(s0 + k) % pcs.length]!;
        if (pc.kind === 1 || pc.kind === 3) {
          if (run.length && rev !== (pc.kind === 3)) flush();
          rev = pc.kind === 3;
          if (rev) {
            if (!run.length) run.push(pc.b);
            run.push(pc.a);
          } else {
            if (!run.length) run.push(pc.a);
            run.push(pc.b);
          }
          continue;
        }
        flush();
        if (pc.kind === 0 || pc.kind === 4) {
          const L = Math.hypot(pc.b.x - pc.a.x, pc.b.z - pc.a.z);
          acc.paving.wall(pc.a.x, pc.a.z, pc.b.x, pc.b.z, 0, PAVE_Y, (pc.b.z - pc.a.z) / L, -(pc.b.x - pc.a.x) / L);
        }
      }
      flush();
    }
  }
}

/** One up-facing triangle of a polygon (planar texture, `size` m per repeat). */
function upTri(S: Soup, y: number, pts: V2[], t: number[], size: number) {
  const a = pts[t[0]!]!,
    b = pts[t[1]!]!,
    c = pts[t[2]!]!;
  const base = S.pos.length / 3;
  for (const v of [a, b, c]) S.vert(v.x, y, v.z, 0, 1, 0, v.x / size, v.z / size);
  // counter-clockwise seen from above (+y): (b-a) x (c-a) has a positive y component
  const up = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z) > 0;
  if (up) S.idx.push(base, base + 1, base + 2);
  else S.idx.push(base, base + 2, base + 1);
}

/**
 * The striped kerb along a polyline of the pavement boundary (slab on its left): the face down to the road and the
 * top strip, mitred at the bends so it runs on without wedges, with whole stripes along its length.
 */
function kerbRun(acc: Acc, pl: V2[], closed: boolean) {
  const K = acc.kerb ?? acc.paving;
  const n = pl.length;
  // inward (left) normal per piece and the mitred inner line
  const nrm = (i: number) => {
    const a = pl[i]!,
      b = pl[i + 1]!;
    const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: -(b.z - a.z) / L, z: (b.x - a.x) / L };
  };
  const inner: V2[] = [];
  for (let i = 0; i < n; i++) {
    const n0 = i > 0 ? nrm(i - 1) : closed ? nrm(n - 2) : nrm(0);
    const n1 = i < n - 1 ? nrm(i) : closed ? nrm(0) : nrm(n - 2);
    let mx = n0.x + n1.x,
      mz = n0.z + n1.z;
    const ml = Math.hypot(mx, mz);
    if (ml < 1e-6) {
      mx = n1.x;
      mz = n1.z;
    } else {
      mx /= ml;
      mz /= ml;
    }
    const cos = Math.max(0.5, mx * n1.x + mz * n1.z);
    inner.push({ x: pl[i]!.x + (mx * KERB_W) / cos, z: pl[i]!.z + (mz * KERB_W) / cos });
  }
  const cum: number[] = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1]! + Math.hypot(pl[i]!.x - pl[i - 1]!.x, pl[i]!.z - pl[i - 1]!.z));
  const L = cum[n - 1]!;
  const stripes = Math.max(1, Math.round(L / STRIPE));
  const len = L / stripes;
  const lerp = (p: V2, q: V2, k: number): V2 => ({ x: p.x + (q.x - p.x) * k, z: p.z + (q.z - p.z) * k });
  for (let i = 0; i + 1 < n; i++) {
    const a = pl[i]!,
      b = pl[i + 1]!;
    const seg = cum[i + 1]! - cum[i]!;
    if (seg < 1e-5) continue;
    const o = nrm(i);
    // cut the piece at stripe boundaries
    const cuts = [0];
    for (let g = Math.floor(cum[i]! / len) + 1; g * len < cum[i + 1]! - 1e-6; g++) cuts.push((g * len - cum[i]!) / seg);
    cuts.push(1);
    for (let c = 0; c + 1 < cuts.length; c++) {
      const k0 = cuts[c]!,
        k1 = cuts[c + 1]!;
      const g = Math.floor((cum[i]! + ((k0 + k1) / 2) * seg) / len);
      const col = acc.kerb ? (g & 1 ? BLACK : YELLOW) : undefined;
      const p0 = lerp(a, b, k0),
        p1 = lerp(a, b, k1);
      K.wall(p0.x, p0.z, p1.x, p1.z, 0.035, PAVE_Y, -o.x, -o.z, col);
      if (acc.kerb) acc.kerb.flat(PAVE_Y + 0.004, [p0, p1, lerp(inner[i]!, inner[i + 1]!, k1), lerp(inner[i]!, inner[i + 1]!, k0)], col);
    }
  }
}
