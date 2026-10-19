/**
 * Road-edge audit (no rendering, runs in the tests): pours the road surfaces of the whole world exactly as the chunk
 * streamer does, rasterises the up-facing triangles, and checks every road edge against them.
 *
 *   gap        a point that should be road or pavement (within a road's carriageway + pavement band, junction corners
 *              included) where nothing is drawn, so bare ground shows between asphalt and pavement
 *   sliver     a raised pavement / kerb slab drawn on the drivable carriageway
 *   phantom    asphalt drawn where the car may not drive (an invisible wall on a visible road)
 *   hidden     drivable carriageway that is not drawn as asphalt (the car drives over pavement or ground)
 *   bare       pavement right at the asphalt edge with no kerb on it (the slab's raw edge shows as a dark wedge, and
 *              the striped kerb is missing there)
 *
 * Every count must be 0. `spots` clusters the findings (one per ~6 m) for screenshots and debugging.
 */
import { PAVEMENT, SQUARES, WORLD_BOX, toWorld, type V2 } from '../logic/cairo';
import { inRiver, net, type REdge } from '../logic/roadnet';
import { pourRoads, edgesIn } from './roadMesh';
import { shapeOf } from '../logic/roadShape';
import { Soup } from './Soup';

export const EDGE_KINDS = ['gap', 'sliver', 'phantom', 'hidden', 'bare'] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

export interface EdgeSpot {
  kind: EdgeKind;
  x: number;
  z: number;
  /** samples in this cluster */
  n: number;
  edge: number;
}
export interface EdgeReport {
  counts: Record<EdgeKind, number>;
  spots: EdgeSpot[];
  samples: number;
}

const CELL = 4;
class TriGrid {
  private cells = new Map<number, number[]>();
  constructor(private tris: number[]) {
    for (let t = 0; t < tris.length; t += 6) {
      const ar =
        (tris[t + 2]! - tris[t]!) * (tris[t + 5]! - tris[t + 1]!) -
        (tris[t + 4]! - tris[t]!) * (tris[t + 3]! - tris[t + 1]!);
      if (Math.abs(ar) < 1e-9) continue;
      const x0 = Math.min(tris[t]!, tris[t + 2]!, tris[t + 4]!),
        x1 = Math.max(tris[t]!, tris[t + 2]!, tris[t + 4]!);
      const z0 = Math.min(tris[t + 1]!, tris[t + 3]!, tris[t + 5]!),
        z1 = Math.max(tris[t + 1]!, tris[t + 3]!, tris[t + 5]!);
      for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
        for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
          const k = i * 65536 + j;
          const l = this.cells.get(k);
          if (l) l.push(t);
          else this.cells.set(k, [t]);
        }
    }
  }
  has(x: number, z: number): boolean {
    const l = this.cells.get(Math.floor(x / CELL) * 65536 + Math.floor(z / CELL));
    if (!l) return false;
    const T = this.tris;
    for (const t of l) {
      const ax = T[t]!,
        az = T[t + 1]!,
        bx = T[t + 2]!,
        bz = T[t + 3]!,
        cx = T[t + 4]!,
        cz = T[t + 5]!;
      const d1 = (x - bx) * (az - bz) - (ax - bx) * (z - bz);
      const d2 = (x - cx) * (bz - cz) - (bx - cx) * (z - cz);
      const d3 = (x - ax) * (cz - az) - (cx - ax) * (z - az);
      const neg = d1 < -1e-9 || d2 < -1e-9 || d3 < -1e-9;
      const pos = d1 > 1e-9 || d2 > 1e-9 || d3 > 1e-9;
      if (!(neg && pos)) return true;
    }
    return false;
  }
}

/** Up-facing triangles of a soup, flattened to (x,z) triples. */
function upTris(s: Soup, out: number[]) {
  const P = s.pos,
    Nr = s.nor,
    I = s.idx;
  for (let k = 0; k < I.length; k += 3) {
    const a = I[k]!,
      b = I[k + 1]!,
      c = I[k + 2]!;
    if (Nr[a * 3 + 1]! < 0.5) continue;
    out.push(P[a * 3]!, P[a * 3 + 2]!, P[b * 3]!, P[b * 3 + 2]!, P[c * 3]!, P[c * 3 + 2]!);
  }
}

let poured: { asphalt: TriGrid; paving: TriGrid; kerb: TriGrid } | null = null;
/** Pour every chunk of the world (cached). */
export function pouredSurfaces() {
  if (poured) return poured;
  const asphalt: number[] = [],
    paving: number[] = [],
    kerb: number[] = [];
  const C = 128;
  for (let x = Math.floor(WORLD_BOX.x0 / C) * C; x < WORLD_BOX.x1; x += C)
    for (let z = Math.floor(WORLD_BOX.z0 / C) * C; z < WORLD_BOX.z1; z += C) {
      const edges = edgesIn(x, z, x + C, z + C);
      if (!edges.length) continue;
      const acc = { asphalt: new Soup(5), paving: new Soup(2.2), kerb: new Soup(1.6, true), paint: new Soup(4) };
      pourRoads(x, z, x + C, z + C, acc, edges);
      upTris(acc.asphalt, asphalt);
      upTris(acc.paving, paving);
      upTris(acc.kerb, paving);
      upTris(acc.kerb, kerb);
    }
  poured = { asphalt: new TriGrid(asphalt), paving: new TriGrid(paving), kerb: new TriGrid(kerb) };
  return poured;
}
export function resetEdgeAudit() {
  poured = null;
}

function gardens(): { c: V2; r: number }[] {
  const N = net();
  return SQUARES.map((sq) => {
    const c = toWorld(sq.at);
    const ring = N.edges.find((e) => e.ring && Math.abs(Math.hypot(e.pts[0]!.x - c.x, e.pts[0]!.z - c.z) - sq.r) < 3);
    return { c, r: sq.r - (ring?.half ?? 8) - PAVEMENT + 0.2 };
  });
}

/**
 * Is p within `w` of an edge: across one of its segments between the segment's end (miter) lines, or within w of an end
 * node that joins other streets (the junction box and the outside of bends)?
 */
function within(e: REdge, x: number, z: number, w: number) {
  const N = net();
  const P = shapeOf(N).prof[e.id]!;
  for (const id of [e.a, e.b]) {
    const n = N.nodes[id]!;
    if (n.edges.length >= 2 && Math.hypot(x - n.x, z - n.z) <= w) return true;
  }
  for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i]!,
      b = P[i + 1]!;
    const dx = b.x - a.x,
      dz = b.z - a.z;
    const L = Math.hypot(dx, dz);
    if (L < 1e-9) continue;
    if (Math.abs((dx * (z - a.z) - dz * (x - a.x)) / L) > w) continue;
    const fa = (a.nx * (z - a.z) - a.nz * (x - a.x)) * (a.nx * dz - a.nz * dx);
    const fb = (b.nx * (z - b.z) - b.nz * (x - b.x)) * -(b.nx * dz - b.nz * dx);
    if (fa >= 0 && fb >= 0) return true;
  }
  return false;
}

/**
 * Run the audit. `step` is the sample spacing along each road (m); across the road the samples sit 0.3 m apart in the
 * kerb and pavement band (where the problems live) and every 1.5 m over the carriageway.
 */
export function auditEdges(step = 0.6): EdgeReport {
  const N = net();
  const S = pouredSurfaces();
  const G = gardens();
  const inGarden = (x: number, z: number) => G.some((g) => Math.hypot(x - g.c.x, z - g.c.z) < g.r);
  const counts: Record<EdgeKind, number> = { gap: 0, sliver: 0, phantom: 0, hidden: 0, bare: 0 };
  const spots: EdgeSpot[] = [];
  const seen = new Map<string, EdgeSpot>();
  let samples = 0;
  const flag = (kind: EdgeKind, x: number, z: number, edge: number) => {
    counts[kind]++;
    const k = `${kind}:${Math.round(x / 6)}:${Math.round(z / 6)}`;
    const s = seen.get(k);
    if (s) s.n++;
    else {
      const n: EdgeSpot = { kind, x, z, n: 1, edge };
      seen.set(k, n);
      spots.push(n);
    }
  };
  // within the band of some road (pavement outer edge less a margin)?
  const near = (x: number, z: number, margin: number) => {
    for (const e of edgesIn(x - 1, z - 1, x + 1, z + 1))
      if (within(e, x, z, e.half + PAVEMENT - margin) && !(inRiver(x, z) && !e.bridge)) return true;
    return false;
  };
  const check = (x: number, z: number, edge: number) => {
    samples++;
    if (x < WORLD_BOX.x0 + 3 || x > WORLD_BOX.x1 - 3 || z < WORLD_BOX.z0 + 3 || z > WORLD_BOX.z1 - 3) return;
    if (inGarden(x, z)) return;
    const drive = N.onRoad(x, z, -0.35);
    const driveLoose = N.onRoad(x, z, 0.35);
    const asph = S.asphalt.has(x, z);
    const pave = S.paving.has(x, z);
    if (drive && pave) flag('sliver', x, z, edge);
    if (drive && !asph && !pave) flag('hidden', x, z, edge);
    if (asph && !pave && !driveLoose) flag('phantom', x, z, edge);
    if (!asph && !pave && near(x, z, 0.3)) flag('gap', x, z, edge);
    // within 0.25 m of the asphalt on the pavement side: that is the kerb's top strip
    if (pave && !N.onRoad(x, z, 0) && N.onRoad(x, z, 0.25) && !S.kerb.has(x, z)) flag('bare', x, z, edge);
  };
  for (const e of N.edges) {
    const h = e.half;
    const offs: number[] = [];
    for (let o = 0; o <= h - 1; o += 1.5) offs.push(o);
    // (never exactly on the kerb line: a point on a boundary belongs to both sides)
    for (let o = h - 0.95; o <= h + PAVEMENT - 0.3 + 1e-6; o += 0.3) offs.push(o);
    const ext = h + PAVEMENT;
    const nodeDeg = (id: number) => N.nodes[id]!.edges.length;
    // past the ends into the junction (not at dead ends): catches bend wedges and junction corners
    const s0 = nodeDeg(e.a) >= 2 ? -ext : 0,
      s1 = nodeDeg(e.b) >= 2 ? e.len + ext : e.len;
    // (offset a little so no sample sits exactly on an end line)
    for (let s = s0 + 0.05; s <= s1; s += step) {
      const p = N.at(e, s);
      // beyond the ends, extend along the end direction
      let x = p.x,
        z = p.z;
      if (s < 0 || s > e.len) {
        x += Math.sin(p.yaw) * (s < 0 ? s : s - e.len);
        z += Math.cos(p.yaw) * (s < 0 ? s : s - e.len);
      }
      const nx = Math.cos(p.yaw),
        nz = -Math.sin(p.yaw);
      for (const o of offs) {
        if (o === 0) {
          check(x, z, e.id);
          continue;
        }
        check(x + nx * o, z + nz * o, e.id);
        check(x - nx * o, z - nz * o, e.id);
      }
    }
  }
  return { counts, spots: spots.sort((a, b) => b.n - a.n), samples };
}
