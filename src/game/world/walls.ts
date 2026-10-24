/**
 * Boundary walls (سور) on the back edge of the pavement wherever a street has no building: the open ground behind a
 * pavement was read as a field you could drive into, with houses floating in it. Dead ends get a wall across the end.
 * A wall only ever stands right behind a real pavement slab, never on asphalt, a junction fill or the slab itself.
 * By the Nile it drops to a low parapet so the river still shows.
 */
import { PAVEMENT, WORLD_BOX } from '../logic/cairo';
import { lots } from '../logic/lots';
import { inRiver, net, type REdge } from '../logic/roadnet';
import { onPave, wallSpot, WALL_T } from './roadMesh';

export interface WallPiece {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** height (m) */
  h: number;
  /** texture offset along the run */
  u: number;
  /** thickness (m) */
  t: number;
}

/** The wall pieces whose middle lies in the box (each chunk builds its own). */
export function planWalls(x0: number, z0: number, x1: number, z1: number, edges: readonly REdge[]): WallPiece[] {
  const N = net();
  const L = lots();
  const T = WALL_T;
  const res: WallPiece[] = [];
  const push = (ax: number, az: number, bx: number, bz: number, h: number, u: number, t = T) => {
    if (Math.hypot(bx - ax, bz - az) < 0.2) return;
    // every end and the middle must be off the road, the junction fills and the slab
    if (!wallSpot(ax, az) || !wallSpot(bx, bz) || !wallSpot((ax + bx) / 2, (az + bz) / 2)) return;
    res.push({ ax, az, bx, bz, h, u, t });
  };
  const inside = (x: number, z: number) => x >= x0 && x < x1 && z >= z0 && z < z1;
  const W = WORLD_BOX;
  const height = (x: number, z: number) => (inRiver(x, z, 18) ? 1.0 : 2.4);
  const STEP = 2;
  for (const e of edges) {
    if (e.bridge || e.ring) continue;
    // right on the back edge of the pavement: no strip of bare ground between slab and wall
    const off = e.half + PAVEMENT + WALL_T / 2 + 0.02;
    for (const side of [1, -1]) {
      for (let s = 0; s < e.len; s += STEP) {
        const s1 = Math.min(e.len, s + STEP);
        const a = N.at(e, s),
          b = N.at(e, s1);
        const ax = a.x + Math.cos(a.yaw) * side * off,
          az = a.z - Math.sin(a.yaw) * side * off,
          bx = b.x + Math.cos(b.yaw) * side * off,
          bz = b.z - Math.sin(b.yaw) * side * off;
        const mx = (ax + bx) / 2,
          mz = (az + bz) / 2;
        if (!inside(mx, mz)) continue;
        if (mx < W.x0 + 4 || mx > W.x1 - 4 || mz < W.z0 + 4 || mz > W.z1 - 4) continue;
        // other streets, their pavements and corner fills stay open; buildings already close the line
        const ok = (x: number, z: number) =>
          N.clearance(x, z) >= PAVEMENT && !L.blocked(x, z, 0.35) && !inRiver(x, z, 1.5) && wallSpot(x, z);
        if (!ok(ax, az) || !ok(bx, bz) || !ok(mx, mz)) continue;
        // and only behind a real pavement: the slab must run right up to the wall from the road side
        const ix = mx - Math.cos(N.at(e, (s + s1) / 2).yaw) * side * 0.6,
          iz = mz + Math.sin(N.at(e, (s + s1) / 2).yaw) * side * 0.6;
        if (!onPave(ix, iz)) continue;
        const h = height(mx, mz);
        push(ax, az, bx, bz, h, s);
        // a plastered pier every 6 m breaks up the long runs
        if (h > 2 && Math.round(s / STEP) % 3 === 0) {
          const dx = (bx - ax) / STEP,
            dz = (bz - az) / STEP;
          push(ax - dx * 0.25, az - dz * 0.25, ax + dx * 0.25, az + dz * 0.25, h + 0.3, 0, 0.5);
        }
      }
    }
    // a dead end: wall across the end of the pavement (the map edge has its barrier arm instead)
    for (const atA of [true, false]) {
      const nd = N.nodes[atA ? e.a : e.b]!;
      if (nd.edges.length !== 1 || !inside(nd.x, nd.z)) continue;
      if (Math.min(nd.x - W.x0, W.x1 - nd.x, nd.z - W.z0, W.z1 - nd.z) < 40) continue;
      const q = N.at(e, atA ? 0 : e.len);
      const dir = atA ? -1 : 1;
      const fx = Math.sin(q.yaw) * dir,
        fz = Math.cos(q.yaw) * dir;
      const cx = nd.x + fx * (PAVEMENT + WALL_T / 2 + 0.02),
        cz = nd.z + fz * (PAVEMENT + WALL_T / 2 + 0.02);
      if (
        inRiver(cx, cz, 1.5) ||
        !wallSpot(cx, cz) ||
        !onPave(nd.x + fx * (PAVEMENT - 0.6), nd.z + fz * (PAVEMENT - 0.6))
      )
        continue;
      const rx = Math.cos(q.yaw),
        rz = -Math.sin(q.yaw);
      const w = off + T / 2;
      push(cx - rx * w, cz - rz * w, cx + rx * w, cz + rz * w, height(cx, cz), 0);
    }
  }
  return res;
}
