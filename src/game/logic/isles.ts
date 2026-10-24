/**
 * Kerbed splitter islands (pure): where a main street runs into a roundabout or a signalled junction, a raised island on
 * its centre line splits the lane coming in from the lane going out, the way Cairo's big junctions are laid out, so the
 * mouth of the junction is not one wide open sheet of asphalt. The island is not road: `RoadNet.onRoad` leaves it out,
 * the renderer pours it as pavement with a kerb all round, and a traffic light stands on its nose.
 */
import type { V2 } from './cairo';
import { junctionsOf } from './junctions';
import { net, type REdge, type RoadNet } from './roadnet';
import { signalNodes } from './signals';

export interface Isle {
  node: number;
  edge: number;
  /** outline, counter-clockwise (slab on the left of each side) */
  poly: V2[];
  /** where the traffic-light pole stands (the nose of the island) and the way it faces (towards the junction) */
  pole: V2;
  fx: number;
  fz: number;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** length of an island along the street and its width at the junction end and the far end (m) */
export const ISLE_LEN = 11;
export const ISLE_W0 = 2.4;
export const ISLE_W1 = 1.9;

let cache: { N: RoadNet; isles: Isle[]; grid: Map<number, Isle[]> } | null = null;
let building = false;
const G = 16;
const gk = (i: number, j: number) => i * 65536 + j;

/** Does this arm of the node get an island? Main streets (not local, not one-way) at roundabouts and signalled junctions. */
function wants(N: RoadNet, nodeId: number, e: REdge, signal: Set<number>): boolean {
  if (e.ring || e.oneway || e.bridge || e.cls !== 'arterial' || e.len < ISLE_LEN + 22) return false;
  const n = N.nodes[nodeId]!;
  const ring = n.edges.some((id) => N.edges[id]!.ring);
  return ring || signal.has(nodeId);
}

function build(N: RoadNet): Isle[] {
  const J = junctionsOf(N);
  const signal = new Set(signalNodes().map((n) => n.id));
  const out: Isle[] = [];
  for (const e of N.edges)
    for (const atA of [true, false]) {
      const nodeId = atA ? e.a : e.b;
      if (!wants(N, nodeId, e, signal)) continue;
      // the other end must not be another junction close by (the island would run into it)
      const t = J.trims.get(e.id);
      const tr = t ? Math.max(atA ? t.aL : t.bL, atA ? t.aR : t.bR) : 0;
      // from the zebra crossing (it runs through the island as a refuge) out along the street
      // (the island needs the street beyond the junction's trim to hold it, with room to spare before the far end)
      if (tr + 1.2 + ISLE_LEN + 6 > e.len / 2) continue;
      const s0 = atA ? tr + 1.2 : e.len - tr - 1.2;
      const dir = atA ? 1 : -1;
      const K = 6;
      const left: V2[] = [],
        right: V2[] = [];
      for (let k = 0; k <= K; k++) {
        const f = k / K;
        const p = N.at(e, s0 + dir * ISLE_LEN * f);
        // a rounded nose at the junction end, a long taper to the far end
        const w = (k === 0 ? ISLE_W0 * 0.55 : ISLE_W0 + (ISLE_W1 - ISLE_W0) * f) / 2;
        const nx = Math.cos(p.yaw),
          nz = -Math.sin(p.yaw);
        left.push({ x: p.x + nx * w, z: p.z + nz * w });
        right.push({ x: p.x - nx * w, z: p.z - nz * w });
      }
      let poly = [...left, ...right.reverse()];
      let a = 0;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
        a += (poly[j]!.x - poly[i]!.x) * (poly[j]!.z + poly[i]!.z);
      if (a < 0) poly = poly.reverse();
      const n = N.nodes[nodeId]!;
      const nose = N.at(e, s0 + dir * 1.4);
      const fl = Math.hypot(n.x - nose.x, n.z - nose.z) || 1;
      let x0 = Infinity,
        z0 = Infinity,
        x1 = -Infinity,
        z1 = -Infinity;
      for (const v of poly) {
        x0 = Math.min(x0, v.x);
        x1 = Math.max(x1, v.x);
        z0 = Math.min(z0, v.z);
        z1 = Math.max(z1, v.z);
      }
      out.push({
        node: nodeId,
        edge: e.id,
        poly,
        pole: { x: nose.x, z: nose.z },
        fx: (nose.x - n.x) / fl,
        fz: (nose.z - n.z) / fl,
        x0,
        z0,
        x1,
        z1
      });
    }
  // two islands that would touch (short arms facing each other) are both dropped
  return out.filter(
    (i) => !out.some((o) => o !== i && o.x0 < i.x1 + 1 && o.x1 > i.x0 - 1 && o.z0 < i.z1 + 1 && o.z1 > i.z0 - 1)
  );
}

function state() {
  const N = net();
  if (cache && cache.N === N) return cache;
  building = true;
  try {
    const isles = build(N);
    const grid = new Map<number, Isle[]>();
    for (const s of isles)
      for (let i = Math.floor(s.x0 / G); i <= Math.floor(s.x1 / G); i++)
        for (let j = Math.floor(s.z0 / G); j <= Math.floor(s.z1 / G); j++) {
          const l = grid.get(gk(i, j));
          if (l) l.push(s);
          else grid.set(gk(i, j), [s]);
        }
    cache = { N, isles, grid };
  } finally {
    building = false;
  }
  return cache;
}

/** Every island of the network. */
export function isles(): Isle[] {
  return state().isles;
}

function inside(p: readonly V2[], x: number, z: number): boolean {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i]!,
      b = p[j]!;
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) c = !c;
  }
  return c;
}
function edgeDist(p: readonly V2[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[j]!,
      b = p[i]!;
    const dx = b.x - a.x,
      dz = b.z - a.z;
    const L = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L));
    best = Math.min(best, Math.hypot(a.x + dx * t - x, a.z + dz * t - z));
  }
  return best;
}

/**
 * Is (x, z) on an island, the island grown by `grow` metres (negative = only that far inside)? While the islands are
 * being built (they read the junction trims, which read the road), nothing is an island.
 */
export function inIsle(x: number, z: number, grow = 0): boolean {
  if (building) return false;
  const l = state().grid.get(gk(Math.floor(x / G), Math.floor(z / G)));
  if (!l) return false;
  for (const s of l) {
    if (x < s.x0 - grow - 0.01 || x > s.x1 + grow + 0.01 || z < s.z0 - grow - 0.01 || z > s.z1 + grow + 0.01) continue;
    const ins = inside(s.poly, x, z);
    if (grow >= 0 ? ins || edgeDist(s.poly, x, z) < grow : ins && edgeDist(s.poly, x, z) > -grow) return true;
  }
  return false;
}

/** The islands whose middle lies in the box (each chunk pours its own). */
export function islesIn(x0: number, z0: number, x1: number, z1: number): Isle[] {
  return isles().filter((s) => {
    const cx = (s.x0 + s.x1) / 2,
      cz = (s.z0 + s.z1) / 2;
    return cx >= x0 && cx < x1 && cz >= z0 && cz < z1;
  });
}
