/**
 * Pavement as one region per chunk, built with polygon booleans (Clipper2): the union of every pavement band near the
 * chunk, less the union of every carriageway, fillet, cap and taper. Parts thinner than OPEN x 2 (the tips of the
 * wedges at forks) and pieces smaller than MIN_AREA are taken out and poured as asphalt instead, so no crumb of slab
 * or loose kerb is left on the road. Kerbs are derived from the final boundary only: every stretch of it with
 * carriageway right outside gets the striped kerb, the rest gets a plain edge face.
 */
import * as THREE from 'three';
import ClipperLib from 'clipper-lib';

type Path64 = ClipperLib.IntPoint[];
type Paths64 = Path64[];
const CL = ClipperLib;
const run = (type: ClipperLib.ClipType, a: Paths64, b?: Paths64): Paths64 => {
  const c = new CL.Clipper();
  // strictly simple output: no ring touches itself or another, so every ring has one clear inside (and earcut copes)
  c.StrictlySimple = true;
  c.AddPaths(a, CL.PolyType.ptSubject, true);
  if (b) c.AddPaths(b, CL.PolyType.ptClip, true);
  const out: Paths64 = [];
  c.Execute(type, out, CL.PolyFillType.pftNonZero, CL.PolyFillType.pftNonZero);
  return out;
};
/** The few boolean and offset operations used here, on Clipper (6.4.2, Angus Johnson) integer paths. */
const Clipper = {
  area: (p: Path64) => CL.Clipper.Area(p),
  Union: (a: Paths64) => run(CL.ClipType.ctUnion, a),
  Difference: (a: Paths64, b: Paths64) => run(CL.ClipType.ctDifference, a, b),
  Intersect: (a: Paths64, b: Paths64) => run(CL.ClipType.ctIntersection, a, b),
  /** offset of closed polygons (mitred, or round) */
  inflate: (a: Paths64, d: number, miter: number, round = false) => {
    const o = new CL.ClipperOffset(miter, 0.03 * SC);
    o.AddPaths(a, round ? CL.JoinType.jtRound : CL.JoinType.jtMiter, CL.EndType.etClosedPolygon);
    const out: Paths64 = [];
    o.Execute(out, d);
    return out;
  },
  clean: (a: Paths64, d: number) => CL.Clipper.CleanPolygons(a, d)
};
import { type V2 } from '../logic/cairo';
import { net } from '../logic/roadnet';
import { carrPolys, near, shapeOf } from '../logic/roadShape';
import baked from './paveBake.json';

/** Chunk size the bake is keyed on (OpenWorld CHUNK). */
export const BAKE_CHUNK = 128;
type Ring = number[];
type Poly = Ring[];
interface Bake {
  hash: string;
  chunks: Record<string, [Poly[], Poly[]]>;
}

/** Fingerprint of everything the pavement is built from, so a stale bake is never used. */
export function shapeHash(): string {
  const S = shapeOf(net());
  let h = 2166136261 >>> 0;
  const mix = (n: number) => {
    h = Math.imul(h ^ (n | 0), 16777619) >>> 0;
  };
  for (const b of S.bands) for (const v of b.poly.p) (mix(Math.round(v.x * 100)), mix(Math.round(v.z * 100)));
  for (let c = 0; c < S.carr.length; c++) for (const q of carrPolys(S, c)) for (const v of q.p) (mix(Math.round(v.x * 100)), mix(Math.round(v.z * 100)));
  mix(OPEN * 1000);
  mix(MIN_AREA * 1000);
  return (h >>> 0).toString(16) + ':' + S.bands.length + ':' + S.carr.length;
}

let bake: Bake | null | undefined;
function bakeOk(): Bake | null {
  if (bake === undefined) {
    const b = baked as unknown as Bake;
    bake = b && b.hash === shapeHash() ? b : null;
    if (!bake) console.warn('paveBake.json is stale: run npm run bake:pave');
  }
  return bake;
}
const unpack = (ps: Poly[]) =>
  ps.map((rs) => {
    const ring = (r: Ring) => {
      const o: V2[] = [];
      for (let i = 0; i < r.length; i += 2) o.push({ x: r[i]! / 100, z: r[i + 1]! / 100 });
      return o;
    };
    return { outer: ring(rs[0]!), holes: rs.slice(1).map(ring) };
  });
export const packRegion = (r: PaveRegion): [Poly[], Poly[]] => {
  const pk = (gs: PaveRegion['pave']) => gs.map((g) => [g.outer, ...g.holes].map((rg) => rg.flatMap((v) => [Math.round(v.x * 100), Math.round(v.z * 100)])));
  return [pk(r.pave), pk(r.fill)];
};

const SC = 1000;
/** half the thinnest pavement kept (m) */
export const OPEN = 1.0;
/** smallest pavement piece kept (m²) */
export const MIN_AREA = 3;
const MARGIN = 6;

export interface PaveRegion {
  /** pavement polygons: outer ring (CCW in x-z) and its holes */
  pave: { outer: V2[]; holes: V2[][] }[];
  /** what was taken out (thin tips, crumbs): poured as asphalt */
  fill: { outer: V2[]; holes: V2[][] }[];
}

/** As a clipper path, always wound positive: the road pieces come in both windings, and under a winding rule an overlap of
 *  opposite windings would cancel out to nothing. */
const toPath = (p: readonly V2[]): Path64 => {
  const q = p.map((v) => ({ X: Math.round(v.x * SC), Y: Math.round(v.z * SC) }));
  return Clipper.area(q) < 0 ? q.reverse() : q;
};
const toV2 = (p: Path64): V2[] => p.map((q) => ({ x: q.X / SC, z: q.Y / SC }));

/** Group clipper output into outers with their holes (nesting from Clipper's poly tree). */
function group(paths: Paths64): { outer: Path64; holes: Path64[] }[] {
  const out: { outer: Path64; holes: Path64[] }[] = [];
  if (!paths.length) return out;
  const c = new CL.Clipper();
  c.StrictlySimple = true;
  c.AddPaths(paths, CL.PolyType.ptSubject, true);
  const tree = new CL.PolyTree();
  c.Execute(CL.ClipType.ctUnion, tree, CL.PolyFillType.pftNonZero, CL.PolyFillType.pftNonZero);
  const walk = (n: ClipperLib.PolyNode) => {
    for (const o of n.Childs()) {
      const holes: Path64[] = [];
      for (const h of o.Childs()) {
        holes.push(h.Contour());
        walk(h);
      }
      out.push({ outer: o.Contour(), holes });
    }
  };
  walk(tree);
  return out;
}

/** Union of many small polygons, a few at a time and then pairwise (much faster than one big union). */
function treeUnion(ps: Paths64): Paths64 {
  if (ps.length <= 8) return Clipper.Union(ps);
  const m = ps.length >> 1;
  return Clipper.Union([...treeUnion(ps.slice(0, m)), ...treeUnion(ps.slice(m))]);
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
  let r: PaveRegion;
  const C0 = BAKE_CHUNK;
  if (x1 - x0 === C0 && z1 - z0 === C0 && x0 % C0 === 0 && z0 % C0 === 0 && bakeOk()) {
    const e = bake!.chunks[`${x0}:${z0}`];
    r = e ? { pave: unpack(e[0]), fill: unpack(e[1]) } : { pave: [], fill: [] };
  } else r = computeRegion(x0, z0, x1, z1);
  register(r);
  cache.set(k, r);
  return r;
}

function register(r: PaveRegion) {
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
}

/** Build one region from the road shape (slow: used by the bake and for boxes the bake does not cover). */
export function computeRegion(x0: number, z0: number, x1: number, z1: number, eps = 5): PaveRegion {
  const S = shapeOf(net());
  const bx0 = x0 - MARGIN,
    bz0 = z0 - MARGIN,
    bx1 = x1 + MARGIN,
    bz1 = z1 + MARGIN;
  const bands: Paths64 = [];
  for (const b of near(S.gridB, bx0, bz0, bx1, bz1)) bands.push(toPath(S.bands[b]!.poly.p));
  const carr: Paths64 = [];
  for (const c of near(S.gridC, bx0, bz0, bx1, bz1)) for (const p of carrPolys(S, c)) carr.push(toPath(p.p));
  const U = treeUnion(bands);
  const C = treeUnion(carr);
  // cleaned (eps, in mm): drops near-duplicate vertices and micro-edges before the offset
  const D = Clipper.Difference(U, C);
  const P = eps ? Clipper.clean(D, eps) : D;
  // opening: shrink, then grow back round: thin tips are lost and sharp corners come back rounded (radius OPEN), so
  // no corner is narrower than the two kerbs that meet in it
  const E0 = Clipper.inflate(P, -OPEN * SC, 2);
  const E = eps ? Clipper.clean(E0, eps) : E0;
  const O = Clipper.inflate(E, OPEN * SC, 4, true);
  // what the opening took off: the thin tips (and rounding dust along every edge, which is ignored)
  const cut: Paths64 = [];
  for (const g of group(Clipper.Difference(P, O))) {
    const a = (Clipper.area(g.outer) + g.holes.reduce((s, h) => s + Clipper.area(h), 0)) / (SC * SC);
    if (a > 0.05) cut.push(g.outer, ...g.holes);
  }
  const P2 = cut.length ? Clipper.Difference(P, cut) : P;
  // drop small pieces (before the chunk cut, so a big piece crossing the chunk border is not mistaken for a crumb)
  const kept: Paths64 = [];
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
  const boxes = [box];
  // a last clean (2 cm) takes out the hair-thin spikes the booleans can leave where edges nearly coincide
  const tidy = (ps: Paths64) => Clipper.Union(Clipper.clean(ps, 20));
  const pave = tidy(Clipper.Intersect(kept, boxes));
  const fill = tidy(Clipper.Intersect(Clipper.Difference(P, kept), boxes));
  // outers counter-clockwise in (x, z), holes clockwise: the slab is always on the left of a ring
  const wind = (r: V2[], ccw: boolean) => {
    let a = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j]!.x - r[i]!.x) * (r[j]!.z + r[i]!.z);
    return a > 0 === ccw ? r : r.reverse();
  };
  const conv = (ps: Paths64) => group(ps).map((g) => ({ outer: wind(toV2(g.outer), true), holes: g.holes.map((h) => wind(toV2(h), false)) }));
  return { pave: conv(pave), fill: conv(fill) };
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
