/**
 * Road surfaces of the open city: carriageway, kerb, pavement, corner fills at junctions, lane marks and zebra crossings.
 * Everything is poured per chunk (a segment belongs to the chunk holding its midpoint, so nothing is built twice).
 */
import { type V2 } from '../logic/cairo';
import { net, type REdge } from '../logic/roadnet';
import { junctionsOf } from '../logic/junctions';
import { Soup } from './Soup';
import {
  clipHalf,
  carrPolys,
  TAPER_E,
  fArea,
  near,
  shapeOf,
  subtract,
  area,
  type FPoly,
  type Fillet,
  type ProfPt
} from '../logic/roadShape';

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
    // pavements: the band beside the kerb, less every carriageway and fillet it would cover and less the bands poured
    // before it (so nothing overlaps and nothing is left bare), with kerbs wherever a piece meets asphalt
    for (let i = 0; i + 1 < P.length; i++) {
      if (P[i + 1]!.s - P[i]!.s < 1e-6 || !own(i)) continue;
      for (const side of [1, -1] as const) {
        const k = bandIndex(shapeOf(N)).get(`${e.id}:${i}:${side}`);
        if (k !== undefined) pourBand(acc, k, ya);
      }
    }
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
    acc.asphalt.flat(FILLET_Y, d.poly.p);
    const ring = bandIndex(SH).get(`${-1 - k}:0:1`)!;
    for (let j = 0; j < d.poly.p.length; j++) pourBand(acc, ring + j, FILLET_Y);
  });
  // tapers where a street narrows, with the pavement beside them
  SH.tapers.forEach((t, k) => {
    const n = N.nodes[t.node]!;
    if (!inside(n.x, n.z)) return;
    acc.asphalt.flat(FILLET_Y, t.poly.p);
    const bi = bandIndex(SH);
    for (let j = 0; j < 2; j++) {
      const b = bi.get(`${TAPER_E - k}:${j}:1`);
      if (b !== undefined) pourBand(acc, b, FILLET_Y);
    }
  });
  // rounded kerb fillets at junction corners (asphalt)
  for (const f of shapeOf(N).fillets) {
    if (!inside(f.P.x, f.P.z)) continue;
    for (const t of f.tris) acc.asphalt.flat(FILLET_Y, t.p);
    filletKerb(acc, f);
  }
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
      out.push({ node: n.id, edge: e.id, x: m.x, z: m.z, yaw: m.yaw, half: e.half });
    }
  }
  return out;
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

const bandIdx = new WeakMap<object, Map<string, number>>();
function bandIndex(S: ReturnType<typeof shapeOf>) {
  let m = bandIdx.get(S);
  if (!m) {
    m = new Map();
    S.bands.forEach((q, k) => m!.set(`${q.e}:${q.i}:${q.side}`, k));
    bandIdx.set(S, m);
  }
  return m;
}

/** The pieces of a pavement band region left after every carriageway, fillet, cap and earlier band is cut out. */
export function bandPieces(self: number): FPoly[] {
  const S = shapeOf(net());
  const band = S.bands[self]!;
  let pieces: FPoly[] = [{ p: band.f.p, t: band.f.t }];
  const { x0, z0, x1, z1 } = band.poly;
  for (const v of near(S.gridC, x0, z0, x1, z1)) {
    const c = v >= 0 ? S.carr[v]! : null;
    if (c && c.e === band.e && c.i === band.i) continue;
    const polys = carrPolys(S, v);
    for (const cp of polys) pieces = pieces.flatMap((q) => subtract(q, cp, true));
    if (!pieces.length) return pieces;
  }
  for (const v of near(S.gridB, x0, z0, x1, z1)) {
    if (v >= self) continue;
    pieces = pieces.flatMap((q) => subtract(q, S.bands[v]!.poly, false));
    if (!pieces.length) return pieces;
  }
  return pieces;
}

/** Pour one pavement band region (a street segment's side, or a sector of a node ring) after clipping it. */
function pourBand(acc: Acc, self: number, ya: number) {
  const N = net();
  const S = shapeOf(N);
  const band = S.bands[self]!;
  const pieces = bandPieces(self);
  if (!pieces.length) return;
  // texture frame: along the segment and across from the centre line (node rings: the world grid)
  let uv = (v: V2): [number, number] => [v.x / TILE_REPEAT, v.z / TILE_REPEAT];
  if (band.e >= 0) {
    const P = S.prof[band.e]!;
    const a = P[band.i]!,
      b = P[band.i + 1]!;
    const dx = b.x - a.x,
      dz = b.z - a.z;
    const L = Math.hypot(dx, dz) || 1;
    const ux = dx / L,
      uz = dz / L;
    uv = (v: V2): [number, number] => {
      const rx = v.x - a.x,
        rz = v.z - a.z;
      return [(a.s + rx * ux + rz * uz) / TILE_REPEAT, (rx * -uz + rz * ux) / TILE_REPEAT];
    };
  }
  for (const q of pieces) {
    if (q.p.length < 3 || fArea(q.p) < 1e-5) continue;
    acc.paving.flatUV(PAVE_Y, q.p, q.p.map(uv));
    const cx = q.p.reduce((s, v) => s + v.x, 0) / q.p.length,
      cz = q.p.reduce((s, v) => s + v.z, 0) / q.p.length;
    for (let k = 0; k < q.p.length; k++) {
      const t = q.t[k]!;
      if (t === 'end' || t === 'cut' || t === 'side') continue;
      const v0 = q.p[k]!,
        v1 = q.p[(k + 1) % q.p.length]!;
      if (Math.hypot(v1.x - v0.x, v1.z - v0.z) < 1e-3) continue;
      if (t === 'outer') {
        const [nx, nz] = outward(v0, v1, cx, cz);
        acc.paving.wall(v0.x, v0.z, v1.x, v1.z, 0, PAVE_Y, nx, nz);
        continue;
      }
      if (t === 'inner') {
        kerbEdge(acc, q, v0, v1, cx, cz, ya - 0.002);
        continue;
      }
      // the rounded corner draws its own kerb along the whole arc (see filletKerb)
      if (typeof t !== 'string' && filletTris(S).has(t.c)) continue;
      // any other edge gets a kerb exactly where drivable asphalt lies just outside it
      for (const [w0, w1] of asphaltRuns(v0, v1, cx, cz)) kerbEdge(acc, q, w0, w1, cx, cz, 0.035);
    }
    for (let k = 0; k < q.p.length; k++) {
      const t = q.t[k]!;
      if (t !== 'end' && t !== 'cut' && t !== 'side') continue;
      const v0 = q.p[k]!,
        v1 = q.p[(k + 1) % q.p.length]!;
      if (Math.hypot(v1.x - v0.x, v1.z - v0.z) < 1e-3) continue;
      for (const [w0, w1] of asphaltRuns(v0, v1, cx, cz)) kerbEdge(acc, q, w0, w1, cx, cz, 0.035);
    }
  }
}

const filletSet = new WeakMap<object, Set<object>>();
function filletTris(S: ReturnType<typeof shapeOf>) {
  let m = filletSet.get(S);
  if (!m) {
    m = new Set();
    for (const f of S.fillets) for (const t of f.tris) m.add(t);
    filletSet.set(S, m);
  }
  return m;
}

/**
 * The kerb round a junction corner, drawn once along the arc: one face, one top strip of constant width and stripes by
 * arc length (per-piece kerbs on the short chords came out ragged, each chord with its own stripe phase).
 */
function filletKerb(acc: Acc, f: Fillet) {
  const N = net();
  const S = shapeOf(N);
  const own = new Set<object>(f.tris);
  const K = acc.kerb ?? acc.paving;
  const a = f.arc;
  const tot: number[] = [0];
  for (let k = 1; k < a.length; k++) tot.push(tot[k - 1]! + Math.hypot(a[k]!.x - a[k - 1]!.x, a[k]!.z - a[k - 1]!.z));
  const L = tot[tot.length - 1]!;
  // whole stripes, so the corner starts and ends on a stripe edge
  // short stripes round the corner (at least yellow-black-yellow), so the bend always reads as a striped kerb
  const n = Math.max(3, Math.round(L / (STRIPE * 0.6)) | 1);
  const inward = (v: V2): V2 => {
    const dx = f.c.x - v.x,
      dz = f.c.z - v.z;
    const l = Math.hypot(dx, dz) || 1;
    return { x: v.x + (dx / l) * KERB_W, z: v.z + (dz / l) * KERB_W };
  };
  for (let k = 0; k + 1 < a.length; k++) {
    const v0 = a[k]!,
      v1 = a[k + 1]!;
    const g = Math.floor((((tot[k]! + tot[k + 1]!) / 2) * n) / L);
    const c = acc.kerb ? (g & 1 ? BLACK : YELLOW) : undefined;
    const [nx, nz] = outward(v0, v1, f.c.x, f.c.z);
    // where another street runs into the corner the arc is not a kerb there
    const mid = { x: (v0.x + v1.x) / 2 - nx * 0.05, z: (v0.z + v1.z) / 2 - nz * 0.05 };
    if (N.onRoad(mid.x, mid.z, 0)) continue;
    K.wall(v0.x, v0.z, v1.x, v1.z, FILLET_Y - 0.005, PAVE_Y, nx, nz, c);
    if (acc.kerb) {
      const q = [v0, v1, inward(v1), inward(v0)];
      let pieces: FPoly[] = [{ p: area(q) < 0 ? q.reverse() : q, t: ['cut', 'cut', 'cut', 'cut'] }];
      const xs = q.map((v) => v.x),
        zs = q.map((v) => v.z);
      for (const v of near(S.gridC, Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)))
        for (const cp of carrPolys(S, v)) if (!own.has(cp)) pieces = pieces.flatMap((r) => subtract(r, cp, false));
      for (const r of pieces) if (r.p.length >= 3 && fArea(r.p) > 1e-5) acc.kerb.flat(PAVE_Y + 0.004, r.p, c);
    }
  }
}

/**
 * The stretches of a pavement piece's edge v0-v1 that have drivable asphalt right outside them (a kerb belongs
 * there), found by sampling every 20 cm and refining each end by bisection.
 */
function asphaltRuns(v0: V2, v1: V2, cx: number, cz: number): [V2, V2][] {
  const N = net();
  const [nx, nz] = outward(v0, v1, cx, cz);
  const L = Math.hypot(v1.x - v0.x, v1.z - v0.z);
  const at = (f: number): V2 => ({ x: v0.x + (v1.x - v0.x) * f, z: v0.z + (v1.z - v0.z) * f });
  const road = (f: number) => {
    const p = at(f);
    const x = p.x + nx * 0.08,
      z = p.z + nz * 0.08;
    // a rounded corner's asphalt gets its kerb from filletKerb, along the arc
    return N.onRoad(x, z, 0) && !inFillet(x, z, 0);
  };
  const n = Math.max(2, Math.ceil(L / 0.2));
  const on: boolean[] = [];
  for (let i = 0; i <= n; i++) on.push(road(i / n));
  const edge = (a: number, b: number) => {
    // a is on one side, b on the other: find the switch point
    const ra = road(a);
    for (let k = 0; k < 7; k++) {
      const m = (a + b) / 2;
      if (road(m) === ra) a = m;
      else b = m;
    }
    return (a + b) / 2;
  };
  const out: [V2, V2][] = [];
  let i = 0;
  while (i <= n) {
    if (!on[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 <= n && on[j + 1]) j++;
    const f0 = i === 0 ? 0 : edge((i - 1) / n, i / n),
      f1 = j === n ? 1 : edge(j / n, (j + 1) / n);
    if ((f1 - f0) * L > 0.02) out.push([at(f0), at(f1)]);
    i = j + 1;
  }
  return out;
}

function outward(v0: V2, v1: V2, cx: number, cz: number): [number, number] {
  const dx = v1.x - v0.x,
    dz = v1.z - v0.z;
  const l = Math.hypot(dx, dz) || 1;
  let nx = -dz / l,
    nz = dx / l;
  if (nx * ((v0.x + v1.x) / 2 - cx) + nz * ((v0.z + v1.z) / 2 - cz) < 0) {
    nx = -nx;
    nz = -nz;
  }
  return [nx, nz];
}

/** A kerb along w0-w1 of a pavement piece: the face down to the road and the striped top strip (clipped to the piece). */
function kerbEdge(acc: Acc, _q: FPoly, w0: V2, w1: V2, cx: number, cz: number, y0: number) {
  const K = acc.kerb ?? acc.paving;
  const [nx, nz] = outward(w0, w1, cx, cz);
  const dx = w1.x - w0.x,
    dz = w1.z - w0.z;
  const len = Math.hypot(dx, dz);
  const ux = dx / len,
    uz = dz / len;
  // stripes on a world grid along the kerb's direction, so neighbouring pieces of one kerb line up
  const p0 = w0.x * ux + w0.z * uz;
  let s = 0;
  while (s < len - 1e-4) {
    const g = Math.floor((p0 + s) / STRIPE + 1e-6);
    const e = Math.min(len, (g + 1) * STRIPE - p0);
    const c = acc.kerb ? (g & 1 ? BLACK : YELLOW) : undefined;
    const a0 = { x: w0.x + ux * s, z: w0.z + uz * s },
      a1 = { x: w0.x + ux * e, z: w0.z + uz * e };
    K.wall(a0.x, a0.z, a1.x, a1.z, y0, PAVE_Y, nx, nz, c);
    if (acc.kerb) {
      let r: FPoly = {
        p: [a0, a1, { x: a1.x - nx * KERB_W, z: a1.z - nz * KERB_W }, { x: a0.x - nx * KERB_W, z: a0.z - nz * KERB_W }],
        t: ['cut', 'cut', 'cut', 'cut']
      };
      if (area(r.p) < 0) r = { p: r.p.slice().reverse(), t: r.t };
      // the full strip width, minus any carriageway it would cover (clipping it to its own piece left it a sliver
      // wherever a thin piece runs along the kerb)
      for (const piece of offCarriage(r)) acc.kerb.flat(PAVE_Y + 0.004, piece.p, c);
    }
    s = e;
  }
  // round the strip's ends: where the kerb line turns, the next run's strip starts at an angle and would leave a
  // little wedge of bare slab between the two (the cap stays on the pavement side and off the carriageways)
  if (acc.kerb && len > 0.05) {
    const colAt = (d: number) => (Math.floor((p0 + d) / STRIPE + 1e-6) & 1 ? BLACK : YELLOW);
    for (const [v, d] of [
      [w0, 0.01],
      [w1, len - 0.01]
    ] as const)
      // (not where the run meets a rounded corner: the arc's own strip carries on there)
      if (!inFillet(v.x, v.z, KERB_W + 0.1)) kerbCap(acc.kerb, v, nx, nz, colAt(d));
  }
}

/** Is (x, z) on a rounded corner's asphalt, or within `pad` of its arc? */
function inFillet(x: number, z: number, pad: number): boolean {
  const S = shapeOf(net());
  const nf = S.fillets.length;
  for (const id of near(S.gridC, x - pad, z - pad, x + pad, z + pad)) {
    if (id >= 0 || -1 - id >= nf) continue;
    const f = S.fillets[-1 - id]!;
    if (pad > 0) {
      for (const v of f.arc) if (Math.hypot(v.x - x, v.z - z) < pad) return true;
      continue;
    }
    for (const t of f.tris) {
      const p = t.p;
      let sg = 0;
      for (let k = 0; k < p.length; k++) {
        const a = p[k]!,
          b = p[(k + 1) % p.length]!;
        const c = (b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x);
        if (c > 1e-9) sg |= 1;
        if (c < -1e-9) sg |= 2;
      }
      if (sg !== 3) return true;
    }
  }
  return false;
}

/** A disc of kerb-strip radius at a run end, on the pavement side of the run, minus any carriageway it touches. */
function kerbCap(K: Soup, v: V2, nx: number, nz: number, c: [number, number, number]) {
  const p: V2[] = [];
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    p.push({ x: v.x + Math.cos(a) * KERB_W, z: v.z + Math.sin(a) * KERB_W });
  }
  let r: FPoly = { p, t: p.map(() => 'cut' as const) };
  if (area(r.p) < 0) r = { p: r.p.slice().reverse(), t: r.t };
  // keep the side away from the road: the line through v along the run, normal (nx, nz) pointing at the road
  r = clipHalf(r, v, { x: v.x - nz, z: v.z + nx }, true, 'cut');
  if (r.p.length >= 3) for (const q of offCarriage(r)) K.flat(PAVE_Y + 0.003, q.p, c);
}

/** A convex polygon less every carriageway (and fillet, cap, taper) it touches. */
function offCarriage(r: FPoly): FPoly[] {
  const S = shapeOf(net());
  let x0 = Infinity,
    z0 = Infinity,
    x1 = -Infinity,
    z1 = -Infinity;
  for (const v of r.p) {
    x0 = Math.min(x0, v.x);
    x1 = Math.max(x1, v.x);
    z0 = Math.min(z0, v.z);
    z1 = Math.max(z1, v.z);
  }
  let pieces: FPoly[] = [r];
  for (const id of near(S.gridC, x0, z0, x1, z1))
    for (const cp of carrPolys(S, id)) pieces = pieces.flatMap((q) => subtract(q, cp, false));
  return pieces.filter((q) => q.p.length >= 3 && fArea(q.p) > 1e-5);
}
