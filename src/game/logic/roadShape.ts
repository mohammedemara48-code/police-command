/**
 * The exact drawn shape of the road network (pure): the centre-line profile of every edge with its miters (shared with the
 * continuing street at a node, so bends have no wedges), the carriageway quads, the rounded kerb fillets at junction corners
 * and the pavement band quads. The renderer pours these shapes and `RoadNet.onRoad` tests against the very same ones, so what
 * the car may drive on is exactly the asphalt that is drawn.
 */
import { PAVEMENT, type V2 } from './cairo';
import type { REdge, RoadNet } from './roadnet';

export interface ProfPt {
  x: number;
  z: number;
  /** left normal, miter-scaled (its component across each neighbouring segment is 1) */
  nx: number;
  nz: number;
  s: number;
}

/** A convex polygon (counter-clockwise in x-z, i.e. positive signed area) with a flag per edge k (p[k] -> p[k+1]). */
export interface Poly {
  p: V2[];
  /** edge is a kerb line (the carriageway or fillet ends there) */
  kerb: boolean[];
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export interface Fillet {
  node: number;
  /** kerb corner, tangent points, arc centre and radius */
  P: V2;
  TA: V2;
  TB: V2;
  dA: V2;
  dB: V2;
  L: number;
  c: V2;
  r: number;
  /** the fan of triangles drawn as asphalt (P first) */
  tris: Poly[];
  arc: V2[];
}

export interface Disc {
  node: number;
  x: number;
  z: number;
  r: number;
  poly: Poly;
}

export interface Taper {
  node: number;
  poly: Poly;
}

export interface Band {
  e: number;
  i: number;
  side: 1 | -1;
  poly: Poly;
  /** the same region with edge tags (inner kerb, outer line, ends) */
  f: FPoly;
}

export interface Shape {
  prof: ProfPt[][];
  carr: { e: number; i: number; poly: Poly }[];
  fillets: Fillet[];
  /** round asphalt caps at nodes whose arms leave an open wedge (forks, sharp bends), each with a pavement ring */
  discs: Disc[];
  /** where a street narrows at a node: a tapered wedge of asphalt on each side, so the kerb has no step */
  tapers: Taper[];
  bands: Band[];
  /** grid over carriageway quads (index into carr), fillets (-1 - index) */
  gridC: Map<number, number[]>;
  /** grid over band quads (index into bands) */
  gridB: Map<number, number[]>;
}

/** Fillet radius at junction corners (m). */
export const FILLET_R = 2.4;
const CELL = 16;
const key = (i: number, j: number) => i * 65536 + j;

function norm(x: number, z: number) {
  const l = Math.hypot(x, z);
  return l < 1e-9 ? null : { x: x / l, z: z / l };
}
export function area(p: V2[]) {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j]!.x * p[i]!.z - p[i]!.x * p[j]!.z) / 2;
  // x-z with z "up" in the formula: positive = counter-clockwise seen from above with x right, z down... keep one convention
  return a;
}
export function mkPoly(p: V2[], kerb: boolean[]): Poly {
  if (area(p) < 0) {
    // reverse, keeping each flag on its edge
    const n = p.length;
    const q = p.slice().reverse();
    const k: boolean[] = [];
    for (let i = 0; i < n; i++) k.push(kerb[(n - 2 - i + n) % n]!);
    p = q;
    kerb = k;
  }
  let x0 = Infinity,
    z0 = Infinity,
    x1 = -Infinity,
    z1 = -Infinity;
  for (const v of p) {
    x0 = Math.min(x0, v.x);
    x1 = Math.max(x1, v.x);
    z0 = Math.min(z0, v.z);
    z1 = Math.max(z1, v.z);
  }
  return { p, kerb, x0, z0, x1, z1 };
}

const cache = new WeakMap<RoadNet, Shape>();
export function resetShape(N: RoadNet) {
  cache.delete(N);
}

/** Direction leaving node n along edge e (first segment). */
function away(e: REdge, n: number): V2 {
  const p = e.pts;
  return e.a === n
    ? (norm(p[1]!.x - p[0]!.x, p[1]!.z - p[0]!.z) ?? { x: 1, z: 0 })
    : (norm(p[p.length - 2]!.x - p[p.length - 1]!.x, p[p.length - 2]!.z - p[p.length - 1]!.z) ?? { x: 1, z: 0 });
}
/** How far an edge runs straight (within 2 cm of its first direction) from node n, capped at 45% of its length. */
function straightRun(e: REdge, n: number, d: V2) {
  const pts = e.a === n ? e.pts : e.pts.slice().reverse();
  const o = pts[0]!;
  let run = 0;
  for (let k = 1; k < pts.length; k++) {
    const rx = pts[k]!.x - o.x,
      rz = pts[k]!.z - o.z;
    if (Math.abs(rx * -d.z + rz * d.x) > 0.02) break;
    run = rx * d.x + rz * d.z;
  }
  return Math.min(run, e.len * 0.45);
}

/** The partner an edge continues into at node n (shared miter), or null. */
function partners(N: RoadNet, n: number): Map<number, number> {
  const node = N.nodes[n]!;
  const out = new Map<number, number>();
  const ids = node.edges.filter((id, k, a) => a.indexOf(id) === k);
  if (ids.length < 2 || node.edges.length !== ids.length) return out;
  const d = ids.map((id) => away(N.edges[id]!, n));
  const best = ids.map((_, i) => {
    let b = -1,
      bd = -0.7;
    ids.forEach((_, j) => {
      if (j === i) return;
      const dot = d[i]!.x * d[j]!.x + d[i]!.z * d[j]!.z;
      if (dot < bd) {
        bd = dot;
        b = j;
      }
    });
    return b;
  });
  best.forEach((j, i) => {
    if (j >= 0 && best[j] === i) out.set(ids[i]!, ids[j]!);
  });
  return out;
}

function buildProfiles(N: RoadNet, part: Map<number, number>[]): ProfPt[][] {
  return N.edges.map((e) => {
    const pts = e.pts;
    const P: ProfPt[] = [];
    let last = { x: 1, z: 0 };
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)]!,
        b = pts[i]!,
        c = pts[Math.min(pts.length - 1, i + 1)]!;
      let d1 = norm(b.x - a.x, b.z - a.z) ?? norm(c.x - b.x, c.z - b.z) ?? last;
      let d2 = norm(c.x - b.x, c.z - b.z) ?? d1;
      // ends: continue into the partner street
      if (i === 0) {
        const o = part[e.a]!.get(e.id);
        if (o !== undefined && o !== e.id) {
          const w = away(N.edges[o]!, e.a);
          d1 = { x: -w.x, z: -w.z };
        }
      }
      if (i === pts.length - 1) {
        const o = part[e.b]!.get(e.id);
        if (o !== undefined && o !== e.id) d2 = away(N.edges[o]!, e.b);
      }
      last = d2;
      const n1 = { x: -d1.z, z: d1.x },
        n2 = { x: -d2.z, z: d2.x };
      let mx = n1.x + n2.x,
        mz = n1.z + n2.z;
      const ml = Math.hypot(mx, mz) || 1;
      mx /= ml;
      mz /= ml;
      const k = 1 / Math.max(0.55, mx * n1.x + mz * n1.z);
      P.push({ x: b.x, z: b.z, nx: mx * k, nz: mz * k, s: e.cum[i]! });
    }
    // a dead end is cut parallel to the last joint's miter, so a short last segment never pinches its pavement off
    const dead = (n: number) => N.nodes[n]!.edges.length === 1;
    const lean = (q: ProfPt, ref: ProfPt, seg: V2 | null) => {
      if (!seg) return;
      const l = Math.hypot(ref.nx, ref.nz) || 1;
      const ux = ref.nx / l,
        uz = ref.nz / l;
      const across = ux * -seg.z + uz * seg.x;
      if (Math.abs(across) < 0.55) return;
      q.nx = ux / across;
      q.nz = uz / across;
    };
    if (P.length >= 3 && dead(e.a)) lean(P[0]!, P[1]!, norm(P[1]!.x - P[0]!.x, P[1]!.z - P[0]!.z));
    if (P.length >= 3 && dead(e.b)) {
      const n = P.length;
      lean(P[n - 1]!, P[n - 2]!, norm(P[n - 1]!.x - P[n - 2]!.x, P[n - 1]!.z - P[n - 2]!.z));
    }
    return P;
  });
}

function addGrid(g: Map<number, number[]>, p: Poly, v: number) {
  for (let i = Math.floor(p.x0 / CELL); i <= Math.floor(p.x1 / CELL); i++)
    for (let j = Math.floor(p.z0 / CELL); j <= Math.floor(p.z1 / CELL); j++) {
      const k = key(i, j);
      const l = g.get(k);
      if (l) l.push(v);
      else g.set(k, [v]);
    }
}

function buildFillets(N: RoadNet, prof: ProfPt[][]): Fillet[] {
  const out: Fillet[] = [];
  void prof;
  for (const n of N.nodes) {
    if (n.edges.length < 3) continue;
    const arms = n.edges.map((id) => {
      const e = N.edges[id]!;
      const d = away(e, n.id);
      return { e, d, ang: Math.atan2(d.z, d.x) };
    });
    arms.sort((a, b) => a.ang - b.ang);
    for (let i = 0; i < arms.length; i++) {
      const A = arms[i]!,
        B = arms[(i + 1) % arms.length]!;
      if (A.e === B.e) continue;
      let th = B.ang - A.ang;
      if (th <= 0) th += Math.PI * 2;
      if (th < 0.75 || th > 2.5) continue;
      const pA = { x: -A.d.z, z: A.d.x },
        pB = { x: -B.d.z, z: B.d.x };
      // kerb lines: n + pA*hA + t*dA and n - pB*hB + u*dB
      const a0 = { x: n.x + pA.x * A.e.half, z: n.z + pA.z * A.e.half },
        b0 = { x: n.x - pB.x * B.e.half, z: n.z - pB.z * B.e.half };
      const den = A.d.x * B.d.z - A.d.z * B.d.x;
      if (Math.abs(den) < 1e-6) continue;
      const t = ((b0.x - a0.x) * B.d.z - (b0.z - a0.z) * B.d.x) / den;
      const u = ((b0.x - a0.x) * A.d.z - (b0.z - a0.z) * A.d.x) / den;
      if (t < 0 || u < 0) continue;
      const P = { x: a0.x + A.d.x * t, z: a0.z + A.d.z * t };
      const tn = Math.tan(th / 2);
      let r = FILLET_R;
      let L = r / tn;
      const room = Math.min(straightRun(A.e, n.id, A.d) - t, straightRun(B.e, n.id, B.d) - u) - 0.5;
      if (L > room) {
        L = room;
        r = L * tn;
      }
      if (r < 0.6 || L < 0.4) continue;
      const TA = { x: P.x + A.d.x * L, z: P.z + A.d.z * L },
        TB = { x: P.x + B.d.x * L, z: P.z + B.d.z * L };
      const bis = norm(A.d.x + B.d.x, A.d.z + B.d.z)!;
      const cd = r / Math.sin(th / 2);
      const c = { x: P.x + bis.x * cd, z: P.z + bis.z * cd };
      // arc from TA to TB around c, the short way
      const a1 = Math.atan2(TA.z - c.z, TA.x - c.x);
      let a2 = Math.atan2(TB.z - c.z, TB.x - c.x);
      let da = a2 - a1;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      a2 = a1 + da;
      const segs = Math.max(3, Math.ceil(Math.abs(da) / 0.2));
      const arc: V2[] = [];
      for (let k = 0; k <= segs; k++) {
        const an = a1 + (da * k) / segs;
        arc.push(k === 0 ? TA : k === segs ? TB : { x: c.x + Math.cos(an) * r, z: c.z + Math.sin(an) * r });
      }
      const tris: Poly[] = [];
      for (let k = 0; k + 1 < arc.length; k++) tris.push(mkPoly([P, arc[k]!, arc[k + 1]!], [false, true, false]));
      out.push({ node: n.id, P, TA, TB, dA: A.d, dB: B.d, L, c, r, tris, arc });
    }
  }
  return out;
}

/** Band `e` of the pavement pieces beside a taper (k-th) is TAPER_E - k. */
export const TAPER_E = -100000;

/** The convex polygons a carriageway grid value stands for (segment quad, fillet fan, cap, taper). */
export function carrPolys(S: Shape, v: number): Poly[] {
  if (v >= 0) return [S.carr[v]!.poly];
  const k = -1 - v;
  if (k < S.fillets.length) return S.fillets[k]!.tris;
  if (k < S.fillets.length + S.discs.length) return [S.discs[k - S.fillets.length]!.poly];
  return [S.tapers[k - S.fillets.length - S.discs.length]!.poly];
}

/** In a convex polygon, its kerb edges moved by pad (negative = inwards); the other edges only grow with a positive pad. */
function inPolyPad(c: Poly, x: number, z: number, pad: number) {
  const n = c.p.length;
  for (let k = 0; k < n; k++) {
    const a = c.p[k]!,
      b = c.p[(k + 1) % n]!;
    const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const d = ((b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x)) / L; // inside (left) positive
    const need = c.kerb[k] ? -pad : -Math.max(0, pad);
    if (d < need) return false;
  }
  return true;
}

/** Width changes at a continuing node: the narrower street widens over a few metres to meet the wider one. */
function buildTapers(N: RoadNet, part: Map<number, number>[], prof: ProfPt[][]) {
  const out: { node: number; poly: Poly; bands: FPoly[] }[] = [];
  const seen = new Set<string>();
  for (const n of N.nodes) {
    for (const [ea, eb] of part[n.id]!) {
      const k = ea < eb ? `${ea}:${eb}` : `${eb}:${ea}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const A = N.edges[ea]!,
        B = N.edges[eb]!;
      if (Math.abs(A.half - B.half) < 0.05) continue;
      const W = A.half > B.half ? A : B,
        nE = W === A ? B : A;
      const hw = W.half,
        hn = nE.half;
      // narrow edge frame leaving the node
      const d = away(nE, n.id);
      const Pn = prof[nE.id]!;
      const end = nE.a === n.id ? Pn[0]! : Pn[Pn.length - 1]!;
      const run = straightRun(nE, n.id, d);
      const T = Math.min(Math.max(4, (hw - hn) * 5), run - 0.5);
      if (T < 1.5) continue;
      const lft = { x: -d.z, z: d.x };
      // the miter at the node, as a unit vector pointing to the left of the narrow edge leaving the node
      let mx = end.nx,
        mz = end.nz;
      if (mx * lft.x + mz * lft.z < 0) {
        mx = -mx;
        mz = -mz;
      }
      const ml = Math.hypot(mx, mz);
      const k1 = 1 / Math.max(0.3, (mx * lft.x + mz * lft.z) / ml); // offset along the miter per metre across
      for (const side of [1, -1]) {
        const at = (o: number) => ({ x: n.x + (mx / ml) * o * k1 * side, z: n.z + (mz / ml) * o * k1 * side });
        const Wc = at(hw),
          Nc = at(hn);
        const NT = { x: n.x + d.x * T + lft.x * hn * side, z: n.z + d.z * T + lft.z * hn * side };
        // triangle Wc, Nc, NT: only the hypotenuse NT -> Wc is a kerb
        const tri = mkPoly([Wc, Nc, NT], [false, false, true]);
        // the pavement beside the hypotenuse (with the wedge at the wide corner)
        const hx = NT.x - Wc.x,
          hz = NT.z - Wc.z;
        const hl = Math.hypot(hx, hz) || 1;
        let ux = -hz / hl,
          uz = hx / hl;
        // outward: away from the narrow centre line
        if ((ux * lft.x + uz * lft.z) * side < 0) {
          ux = -ux;
          uz = -uz;
        }
        const mo = { x: (mx / ml) * side, z: (mz / ml) * side };
        const quad: FPoly = {
          p: [
            Wc,
            { x: Wc.x + ux * PAVEMENT, z: Wc.z + uz * PAVEMENT },
            { x: NT.x + ux * PAVEMENT, z: NT.z + uz * PAVEMENT },
            NT
          ],
          t: ['end', 'outer', 'end', 'inner']
        };
        const wedge: FPoly = {
          p: [
            Wc,
            { x: Wc.x + mo.x * PAVEMENT, z: Wc.z + mo.z * PAVEMENT },
            { x: Wc.x + ux * PAVEMENT, z: Wc.z + uz * PAVEMENT }
          ],
          t: ['end', 'outer', 'end']
        };
        const fix = (f: FPoly): FPoly =>
          area(f.p) >= 0
            ? f
            : { p: f.p.slice().reverse(), t: f.p.map((_, i) => f.t[(f.p.length - 2 - i + f.p.length) % f.p.length]!) };
        const bands = [fix(quad)];
        if (fArea(wedge.p) > 1e-4) bands.push(fix(wedge));
        out.push({ node: n.id, poly: tri, bands });
      }
    }
  }
  return out;
}

/** Nodes whose arms leave an open wedge wider than a half turn that no continuing pair closes get a round cap. */
function buildDiscs(N: RoadNet, part: Map<number, number>[]): Disc[] {
  const out: Disc[] = [];
  for (const n of N.nodes) {
    if (n.edges.length < 2) continue;
    if (new Set(n.edges).size !== n.edges.length) continue;
    const arms = n.edges.map((id) => {
      const e = N.edges[id]!;
      const d = away(e, n.id);
      return { e, ang: Math.atan2(d.z, d.x) };
    });
    arms.sort((a, b) => a.ang - b.ang);
    let need = false;
    for (let i = 0; i < arms.length; i++) {
      const A = arms[i]!,
        B = arms[(i + 1) % arms.length]!;
      let th = B.ang - A.ang;
      if (th <= 0) th += Math.PI * 2;
      if (th > Math.PI + 0.05 && part[n.id]!.get(A.e.id) !== B.e.id) need = true;
    }
    if (!need) continue;
    const r = Math.min(...arms.map((a) => a.e.half));
    const K = 32;
    const p: V2[] = [];
    for (let k = 0; k < K; k++)
      p.push({ x: n.x + Math.cos((k / K) * Math.PI * 2) * r, z: n.z + Math.sin((k / K) * Math.PI * 2) * r });
    out.push({
      node: n.id,
      x: n.x,
      z: n.z,
      r,
      poly: mkPoly(
        p,
        p.map(() => true)
      )
    });
  }
  return out;
}

export function shapeOf(N: RoadNet): Shape {
  let S = cache.get(N);
  if (S) return S;
  const part = N.nodes.map((n) => partners(N, n.id));
  const prof = buildProfiles(N, part);
  const carr: Shape['carr'] = [];
  const bands: Band[] = [];
  const gridC = new Map<number, number[]>();
  const gridB = new Map<number, number[]>();
  for (const e of N.edges) {
    const P = prof[e.id]!;
    const h = e.half;
    for (let i = 0; i + 1 < P.length; i++) {
      const a = P[i]!,
        b = P[i + 1]!;
      if (b.s - a.s < 1e-6) continue;
      const dA = i === 0 && N.nodes[e.a]!.edges.length === 1,
        dB = i + 2 === P.length && N.nodes[e.b]!.edges.length === 1;
      // a dead end's end line is a kerb too
      const cq = segRegion(a, b, -h, h, 'side', 'side', dA ? 'side' : 'end', dB ? 'side' : 'end');
      if (cq.p.length >= 3) {
        const poly = mkPoly(
          cq.p,
          cq.t.map((t) => t === 'side')
        );
        addGrid(gridC, poly, carr.length);
        carr.push({ e: e.id, i, poly });
      }
      for (const side of [1, -1] as const) {
        const lo = side > 0 ? h : -h - PAVEMENT,
          hi = side > 0 ? h + PAVEMENT : -h;
        const deadA = i === 0 && N.nodes[e.a]!.edges.length === 1,
          deadB = i + 2 === P.length && N.nodes[e.b]!.edges.length === 1;
        const f = segRegion(
          a,
          b,
          lo,
          hi,
          side > 0 ? 'inner' : 'outer',
          side > 0 ? 'outer' : 'inner',
          deadA ? 'outer' : 'end',
          deadB ? 'outer' : 'end'
        );
        if (f.p.length < 3) continue;
        const poly = mkPoly(
          f.p,
          f.p.map(() => false)
        );
        addGrid(gridB, poly, bands.length);
        bands.push({ e: e.id, i, side, poly, f });
      }
    }
  }
  const fillets = buildFillets(N, prof);
  fillets.forEach((f, k) => {
    for (const t of f.tris) addGrid(gridC, t, -1 - k);
  });
  const discs = buildDiscs(N, part);
  discs.forEach((d, k) => {
    addGrid(gridC, d.poly, -1 - fillets.length - k);
    // the pavement ring around it, in sectors (convex), poured after every street's own band
    const n = d.poly.p.length;
    for (let j = 0; j < n; j++) {
      const a = d.poly.p[j]!,
        b = d.poly.p[(j + 1) % n]!;
      const out = (v: V2) => {
        const k2 = (d.r + PAVEMENT) / d.r;
        return { x: d.x + (v.x - d.x) * k2, z: d.z + (v.z - d.z) * k2 };
      };
      const f: FPoly = { p: [a, out(a), out(b), b], t: ['end', 'outer', 'end', 'inner'] };
      const ff = f;
      const poly = mkPoly(
        ff.p,
        ff.p.map(() => false)
      );
      addGrid(gridB, poly, bands.length);
      bands.push({ e: -1 - k, i: j, side: 1, poly, f: ff });
    }
  });
  const tapers: Taper[] = [];
  for (const t of buildTapers(N, part, prof)) {
    addGrid(gridC, t.poly, -1 - fillets.length - discs.length - tapers.length);
    const k = tapers.length;
    tapers.push({ node: t.node, poly: t.poly });
    t.bands.forEach((f, j) => {
      const poly = mkPoly(
        f.p,
        f.p.map(() => false)
      );
      addGrid(gridB, poly, bands.length);
      bands.push({ e: TAPER_E - k, i: j, side: 1, poly, f });
    });
  }
  S = { prof, carr, fillets, discs, tapers, bands, gridC, gridB };
  cache.set(N, S);
  return S;
}

/** Is (x,z) on a drawn carriageway (or a corner fillet), with an extra margin `pad` (negative = that far inside)? */
export function inCarriage(N: RoadNet, x: number, z: number, pad = 0): boolean {
  const S = shapeOf(N);
  const ci = Math.floor(x / CELL),
    cj = Math.floor(z / CELL);
  const r = Math.max(0, pad);
  const span = Math.ceil(r / CELL);
  for (let i = ci - span; i <= ci + span; i++)
    for (let j = cj - span; j <= cj + span; j++) {
      const l = S.gridC.get(key(i, j));
      if (!l) continue;
      for (const v of l) {
        if (v >= 0) {
          const c = S.carr[v]!;
          if (inSeg(N, S, c.e, c.i, x, z, pad)) return true;
        } else if (-1 - v < S.fillets.length) {
          if (inFillet(S.fillets[-1 - v]!, x, z, pad)) return true;
        } else if (-1 - v < S.fillets.length + S.discs.length) {
          const d = S.discs[-1 - v - S.fillets.length]!;
          if (Math.hypot(x - d.x, z - d.z) <= d.r + pad) return true;
        } else if (inPolyPad(S.tapers[-1 - v - S.fillets.length - S.discs.length]!.poly, x, z, pad)) return true;
      }
    }
  return false;
}

function inSeg(N: RoadNet, S: Shape, e: number, i: number, x: number, z: number, pad: number) {
  const P = S.prof[e]!;
  const a = P[i]!,
    b = P[i + 1]!;
  const w = N.edges[e]!.half + pad;
  if (w <= 0) return false;
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const L = Math.hypot(dx, dz);
  if (L < 1e-9) return false;
  // across: signed distance from the centre line
  const cr = (dx * (z - a.z) - dz * (x - a.x)) / L;
  if (Math.abs(cr) > w) return false;
  // between the two end (miter) lines
  // between the two end (miter) lines; a positive pad pushes the ends out too, a negative one pulls a dead end in
  const ed = N.edges[e]!;
  const P2 = S.prof[e]!;
  const ma = pad > 0 || (i === 0 && N.nodes[ed.a]!.edges.length === 1) ? pad : 0,
    mb = pad > 0 || (i + 2 === P2.length && N.nodes[ed.b]!.edges.length === 1) ? pad : 0;
  const fa = a.nx * (z - a.z) - a.nz * (x - a.x),
    fa0 = a.nx * dz - a.nz * dx;
  if (fa * Math.sign(fa0) < -ma * Math.hypot(a.nx, a.nz)) return false;
  const fb = b.nx * (z - b.z) - b.nz * (x - b.x),
    fb0 = -(b.nx * dz - b.nz * dx);
  if (fb * Math.sign(fb0) < -mb * Math.hypot(b.nx, b.nz)) return false;
  return true;
}

function inFillet(f: Fillet, x: number, z: number, pad: number) {
  // in the triangle P, TA, TB (basis dA, dB) and outside the arc's circle
  const rx = x - f.P.x,
    rz = z - f.P.z;
  const det = f.dA.x * f.dB.z - f.dA.z * f.dB.x;
  const al = (rx * f.dB.z - rz * f.dB.x) / det,
    be = (f.dA.x * rz - f.dA.z * rx) / det;
  const m = Math.max(0, pad);
  if (al < -m || be < -m || al + be > f.L + m) return false;
  return Math.hypot(x - f.c.x, z - f.c.z) >= f.r - pad;
}

// ---- convex clipping with edge flags
export interface FPoly {
  p: V2[];
  /** per edge tag: 'inner' own kerb, 'outer' pavement outer line, 'end', 'cut' (internal), or a kerb of another
   * carriageway: { c: Poly, j } (the line of edge j of carriageway poly c) */
  t: Tag[];
}
export type Tag = 'inner' | 'outer' | 'end' | 'cut' | 'side' | { c: Poly; j: number };

/** Keep the part of a polygon where f(v) >= 0 for the line through q0 -> q1 (left side kept); new edge gets tag `nt`. */
export function clipHalf(poly: FPoly, q0: V2, q1: V2, keepLeft: boolean, nt: Tag): FPoly {
  const p = poly.p,
    t = poly.t;
  const f = (v: V2) => {
    const s = (q1.x - q0.x) * (v.z - q0.z) - (q1.z - q0.z) * (v.x - q0.x);
    return keepLeft ? s : -s;
  };
  const op: V2[] = [],
    ot: Tag[] = [];
  const n = p.length;
  for (let k = 0; k < n; k++) {
    const a = p[k]!,
      b = p[(k + 1) % n]!;
    const fa = f(a),
      fb = f(b);
    if (fa >= 0) {
      op.push(a);
      ot.push(t[k]!);
      if (fb < 0) {
        const s = fa / (fa - fb);
        op.push({ x: a.x + (b.x - a.x) * s, z: a.z + (b.z - a.z) * s });
        ot.push(nt);
      }
    } else if (fb >= 0) {
      const s = fa / (fa - fb);
      op.push({ x: a.x + (b.x - a.x) * s, z: a.z + (b.z - a.z) * s });
      ot.push(t[k]!);
    }
  }
  // drop repeated points (an edge of zero length keeps the tag of the edge after it)
  const rp: V2[] = [],
    rt: Tag[] = [];
  for (let k = 0; k < op.length; k++) {
    const v = op[k]!;
    const l = rp[rp.length - 1];
    if (l && Math.abs(l.x - v.x) < 1e-7 && Math.abs(l.z - v.z) < 1e-7) {
      rt[rt.length - 1] = ot[k]!;
      continue;
    }
    rp.push(v);
    rt.push(ot[k]!);
  }
  while (
    rp.length > 1 &&
    Math.abs(rp[0]!.x - rp[rp.length - 1]!.x) < 1e-7 &&
    Math.abs(rp[0]!.z - rp[rp.length - 1]!.z) < 1e-7
  ) {
    rp.pop();
    rt.pop();
  }
  return { p: rp, t: rt };
}

export function fArea(p: V2[]) {
  return Math.abs(area(p));
}

/** poly minus convex c (CCW): convex pieces. Pieces of tiny overlap are left untouched. */
export function subtract(poly: FPoly, c: Poly, asKerb: boolean): FPoly[] {
  let x0 = Infinity,
    x1 = -Infinity,
    z0 = Infinity,
    z1 = -Infinity;
  for (const v of poly.p) {
    x0 = Math.min(x0, v.x);
    x1 = Math.max(x1, v.x);
    z0 = Math.min(z0, v.z);
    z1 = Math.max(z1, v.z);
  }
  if (x1 <= c.x0 || x0 >= c.x1 || z1 <= c.z0 || z0 >= c.z1) return [poly];
  const ccw = area(c.p) > 0;
  const out: FPoly[] = [];
  let rem = poly;
  const n = c.p.length;
  for (let j = 0; j < n; j++) {
    const q0 = c.p[j]!,
      q1 = c.p[(j + 1) % n]!;
    const tag: Tag = asKerb && c.kerb[j] ? { c, j } : 'cut';
    const outside = clipHalf(rem, q0, q1, !ccw, tag);
    rem = clipHalf(rem, q0, q1, ccw, tag);
    if (outside.p.length >= 3 && fArea(outside.p) > 1e-5) out.push(outside);
    if (rem.p.length < 3) break;
  }
  if (rem.p.length < 3 || fArea(rem.p) < 1e-7) return [poly];
  return out;
}

/** The part of segment v0-v1 inside convex c except across its edge j (where the segment lies). */
export function clipSegToPoly(v0: V2, v1: V2, c: Poly, j: number): [V2, V2] | null {
  let t0 = 0,
    t1 = 1;
  const ccw = area(c.p) > 0;
  const n = c.p.length;
  for (let k = 0; k < n; k++) {
    if (k === j) continue;
    const q0 = c.p[k]!,
      q1 = c.p[(k + 1) % n]!;
    const f = (v: V2) => {
      const s = (q1.x - q0.x) * (v.z - q0.z) - (q1.z - q0.z) * (v.x - q0.x);
      return ccw ? s : -s;
    };
    const fa = f(v0),
      fb = f(v1);
    const tol = 1e-6;
    if (fa < -tol && fb < -tol) return null;
    if (fa < -tol) t0 = Math.max(t0, fa / (fa - fb));
    else if (fb < -tol) t1 = Math.min(t1, fa / (fa - fb));
  }
  if (t1 - t0 < 1e-4) return null;
  const P = (t: number) => ({ x: v0.x + (v1.x - v0.x) * t, z: v0.z + (v1.z - v0.z) * t });
  return [P(t0), P(t1)];
}

/** Grid neighbours of a box. */
export function near(g: Map<number, number[]>, x0: number, z0: number, x1: number, z1: number): number[] {
  const out = new Set<number>();
  for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
    for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++)
      for (const v of g.get(key(i, j)) ?? []) out.add(v);
  return [...out];
}

/**
 * The region of segment a-b between lateral offsets lo..hi (left positive) and between the two end (miter) lines:
 * an intersection of half-planes, so always convex, and neighbouring segments share their end line exactly.
 */
export function segRegion(
  a: ProfPt,
  b: ProfPt,
  lo: number,
  hi: number,
  tagLo: Tag,
  tagHi: Tag,
  tagA: Tag = 'end',
  tagB: Tag = 'end'
): FPoly {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const L = Math.hypot(dx, dz);
  const ux = dx / L,
    uz = dz / L;
  const nx = -uz,
    nz = ux;
  const E = Math.max(Math.abs(lo), Math.abs(hi)) * 3 + 1;
  const P = (s: number, o: number) => ({ x: a.x + ux * s + nx * o, z: a.z + uz * s + nz * o });
  // counter-clockwise: lo side forward, then up to hi, back along hi
  let f: FPoly = { p: [P(-E, lo), P(L + E, lo), P(L + E, hi), P(-E, hi)], t: [tagLo, 'end', tagHi, 'end'] };
  if (area(f.p) < 0) f = { p: f.p.slice().reverse(), t: [f.t[2]!, f.t[1]!, f.t[0]!, f.t[3]!] };
  // end line through a (direction of its miter), keep the side of b; same at b
  const side = (q: ProfPt, to: V2) => q.nx * (to.z - q.z) - q.nz * (to.x - q.x) > 0;
  const qa1 = { x: a.x + a.nx, z: a.z + a.nz },
    qb1 = { x: b.x + b.nx, z: b.z + b.nz };
  f = clipHalf(f, a, qa1, side(a, b), tagA);
  if (f.p.length >= 3) f = clipHalf(f, b, qb1, side(b, a), tagB);
  return f;
}
