/**
 * Pavement as one region per chunk, built with polygon booleans (Clipper2): the union of every pavement band near the
 * chunk, less the union of every carriageway, fillet, cap and taper. Parts thinner than OPEN x 2 (the tips of the
 * wedges at forks) and pieces smaller than MIN_AREA are taken out and poured as asphalt instead, so no crumb of slab
 * or loose kerb is left on the road. Kerbs are derived from the final boundary only: every stretch of it with
 * carriageway right outside gets the striped kerb, the rest gets a plain edge face.
 */
import * as THREE from 'three';
import { Clipper, EndType, FillRule, JoinType, type Path64, type Paths64 } from 'clipper2-js';
import { type V2 } from '../logic/cairo';
import { net } from '../logic/roadnet';
import { carrPolys, near, shapeOf } from '../logic/roadShape';

const SC = 1000;
/** half the thinnest pavement kept (m) */
export const OPEN = 0.6;
/** smallest pavement piece kept (m²) */
export const MIN_AREA = 3;
const MARGIN = 6;

export interface PaveRegion {
  /** pavement polygons: outer ring (CCW in x-z) and its holes */
  pave: { outer: V2[]; holes: V2[][] }[];
  /** what was taken out (thin tips, crumbs): poured as asphalt */
  fill: { outer: V2[]; holes: V2[][] }[];
}

const toPath = (p: readonly V2[]): Path64 => p.map((v) => ({ x: Math.round(v.x * SC), y: Math.round(v.z * SC) })) as Path64;
const toV2 = (p: Path64): V2[] => p.map((q) => ({ x: q.x / SC, z: q.y / SC }));

/** Group clipper output into outers with their holes. */
function group(paths: Paths64): { outer: Path64; holes: Path64[] }[] {
  const outs: { outer: Path64; holes: Path64[]; a: number }[] = [];
  const holes: Path64[] = [];
  for (const p of paths) {
    if (p.length < 3) continue;
    const a = Clipper.area(p);
    if (a > 0) outs.push({ outer: p, holes: [], a });
    else if (a < 0) holes.push(p);
  }
  outs.sort((x, y) => x.a - y.a);
  for (const h of holes) {
    const hp = h[0]!;
    const o = outs.find((g) => inPoly(toV2(g.outer), hp.x / SC, hp.y / SC));
    if (o) o.holes.push(h);
  }
  return outs.map(({ outer, holes: hs }) => ({ outer, holes: hs }));
}

const cache = new Map<string, PaveRegion>();
/** Every fill polygon built so far, for the edge audit. */
const fills = new Map<number, { x0: number; z0: number; x1: number; z1: number; outer: V2[] }[]>();
const FC = 8;
const fkey = (i: number, j: number) => i * 100003 + j;

export function paveRegion(x0: number, z0: number, x1: number, z1: number): PaveRegion {
  const k = `${x0}:${z0}:${x1}:${z1}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const S = shapeOf(net());
  const bx0 = x0 - MARGIN,
    bz0 = z0 - MARGIN,
    bx1 = x1 + MARGIN,
    bz1 = z1 + MARGIN;
  const bands: Paths64 = [] as unknown as Paths64;
  for (const b of near(S.gridB, bx0, bz0, bx1, bz1)) bands.push(toPath(S.bands[b]!.poly.p));
  const carr: Paths64 = [] as unknown as Paths64;
  for (const c of near(S.gridC, bx0, bz0, bx1, bz1)) for (const p of carrPolys(S, c)) carr.push(toPath(p.p));
  const U = Clipper.Union(bands, undefined, FillRule.NonZero);
  const C = Clipper.Union(carr, undefined, FillRule.NonZero);
  const P = Clipper.Difference(U, C, FillRule.NonZero);
  // opening: shrink then grow back (mitred, so ordinary corners come back square and only thin tips are lost)
  const E = Clipper.InflatePaths(P, -OPEN * SC, JoinType.Miter, EndType.Polygon, 2);
  const O = Clipper.Intersect(Clipper.InflatePaths(E, OPEN * SC, JoinType.Miter, EndType.Polygon, 4), P, FillRule.NonZero);
  // what the opening took off: the thin tips (and rounding dust along every edge, which is ignored)
  const cut: Paths64 = [] as unknown as Paths64;
  for (const g of group(Clipper.Difference(P, O, FillRule.NonZero))) {
    const a = (Clipper.area(g.outer) + g.holes.reduce((s, h) => s + Clipper.area(h), 0)) / (SC * SC);
    if (a > 0.05) cut.push(g.outer, ...g.holes);
  }
  const P2 = cut.length ? Clipper.Difference(P, cut, FillRule.NonZero) : P;
  // drop small pieces (before the chunk cut, so a big piece crossing the chunk border is not mistaken for a crumb)
  const kept: Paths64 = [] as unknown as Paths64;
  for (const g of group(P2)) {
    const a = (Clipper.area(g.outer) + g.holes.reduce((s, h) => s + Clipper.area(h), 0)) / (SC * SC);
    if (a < MIN_AREA) continue;
    kept.push(g.outer, ...g.holes);
  }
  const box = toPath([
    { x: x0, z: z0 },
    { x: x1, z: z0 },
    { x: x1, z: z1 },
    { x: x0, z: z1 }
  ]);
  const boxes = [box] as unknown as Paths64;
  const pave = Clipper.Intersect(kept, boxes, FillRule.NonZero);
  const fill = Clipper.Intersect(Clipper.Difference(P, kept, FillRule.NonZero), boxes, FillRule.NonZero);
  const conv = (ps: Paths64) => group(ps).map((g) => ({ outer: toV2(g.outer), holes: g.holes.map(toV2) }));
  const r: PaveRegion = { pave: conv(pave), fill: conv(fill) };
  for (const f of r.fill) {
    let fx0 = Infinity,
      fz0 = Infinity,
      fx1 = -Infinity,
      fz1 = -Infinity;
    for (const v of f.outer) {
      fx0 = Math.min(fx0, v.x);
      fx1 = Math.max(fx1, v.x);
      fz0 = Math.min(fz0, v.z);
      fz1 = Math.max(fz1, v.z);
    }
    const it = { x0: fx0, z0: fz0, x1: fx1, z1: fz1, outer: f.outer };
    for (let i = Math.floor(fx0 / FC); i <= Math.floor(fx1 / FC); i++)
      for (let j = Math.floor(fz0 / FC); j <= Math.floor(fz1 / FC); j++) {
        const l = fills.get(fkey(i, j));
        if (l) l.push(it);
        else fills.set(fkey(i, j), [it]);
      }
  }
  cache.set(k, r);
  return r;
}

export function resetPave() {
  cache.clear();
  fills.clear();
}

export function inPoly(p: readonly V2[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i]!,
      b = p[j]!;
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

/** Is (x, z) on asphalt poured in place of a thin tip or a crumb of pavement? */
export function inFill(x: number, z: number): boolean {
  for (const f of fills.get(fkey(Math.floor(x / FC), Math.floor(z / FC))) ?? []) if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1 && inPoly(f.outer, x, z)) return true;
  return false;
}

/** Triangles of a polygon with holes (indices into outer ++ holes). */
export function triangulate(outer: V2[], holes: V2[][]): number[][] {
  const v = (p: V2[]) => p.map((q) => new THREE.Vector2(q.x, q.z));
  return THREE.ShapeUtils.triangulateShape(v(outer), holes.map(v));
}
