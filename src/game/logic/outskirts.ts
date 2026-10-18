/**
 * The city beyond the playable grid (pure, unit-tested): a lattice of built-up blocks, empty lots, palm groves and low
 * informal housing around the avenues, the boulevard that carries the Haram end of the avenue towards the Giza plateau,
 * and a hazy skyline further out. The world builder (world/Outskirts.ts) only turns this plan into meshes.
 */
import { blockLook, districtAt, hash01, type District, type FacadeStyle } from './districts';
import type { CrowdQuality } from './crowd';

/** The playable grid (avenues, cross streets, blocks), with a margin. */
export const GRID = { x0: -133, x1: 133, z0: -110, z1: 242 };
/** The Haram end of the avenue: a boulevard (visual only) from the barrier to the plateau wall. */
export const BOULEVARD = { zBarrier: -101.5, zWall: -216, half: 4.6 };
/** Nothing is built in front of the pyramids: this strip stays open ground beyond the plateau wall. */
export const PLATEAU = { halfX: 150, z0: -216, z1: -470 };
/** Lattice cell: 31 m of block inside a 38 m cell (7 m of street). */
export const CELL = 38;
export const BLOCK = 31;
/** Farthest built-up edge; beyond it only the hazy skyline. */
export const REACH = { low: 330, medium: 460, high: 520 } as const;

export type LandUse = 'built' | 'low' | 'lot' | 'green';
export interface Cell {
  x: number;
  z: number;
  use: LandUse;
  d: District;
}
export interface Plot {
  x: number;
  z: number;
  w: number;
  d: number;
  floors: number;
  style: FacadeStyle;
  tint: number;
  tower: boolean;
  /** small stairwell / tank house on the roof */
  roofBox: boolean;
}
export interface Spot {
  x: number;
  z: number;
  h: number;
}
export interface SkylineBox {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
}
export interface OutskirtsPlan {
  cells: Cell[];
  plots: Plot[];
  palms: Spot[];
  skyline: SkylineBox[];
}

/** Distance from a point to the playable grid rectangle (0 inside). */
export function distToGrid(x: number, z: number): number {
  const dx = Math.max(GRID.x0 - x, 0, x - GRID.x1);
  const dz = Math.max(GRID.z0 - z, 0, z - GRID.z1);
  return Math.hypot(dx, dz);
}

/** May a block of half-size `h` stand at (x, z)? Never on the grid, the Nile bank, the boulevard or the open plateau. */
export function buildable(x: number, z: number, h: number): boolean {
  const overlapsGrid = x + h > GRID.x0 && x - h < GRID.x1 && z + h > GRID.z0 && z - h < GRID.z1;
  if (overlapsGrid) return false;
  if (z + h > 236) return false;
  // the plateau in front of the pyramids stays open
  if (z - h < PLATEAU.z0 && z + h > PLATEAU.z1 && Math.abs(x) - h < PLATEAU.halfX) return false;
  if (z - h < PLATEAU.z1) return false;
  return true;
}

function useFor(d: number, r: number, zone: District): LandUse {
  // nearer the grid is denser; the edge thins out into lots and groves
  const far = Math.min(1, d / 420);
  const built = 0.72 - 0.22 * far;
  const low = 0.12 + (zone === 'suburb' ? 0.06 : 0) + 0.06 * far;
  const lot = 0.07 + 0.08 * far;
  if (r < built) return 'built';
  if (r < built + low) return 'low';
  if (r < built + low + lot) return 'lot';
  return 'green';
}

export function planOutskirts(q: CrowdQuality | 'low' | 'medium' | 'high', seed = 5): OutskirtsPlan {
  const reach = REACH[q];
  const cells: Cell[] = [];
  const add = (cx: number, cz: number) => {
    if (!buildable(cx, cz, CELL / 2)) return;
    const d = distToGrid(cx, cz);
    if (d > reach) return;
    const zone = districtAt(Math.max(-100, Math.min(240, cz)));
    const k = Math.round(cx * 7 + cz * 13);
    cells.push({ x: cx, z: cz, use: useFor(d, hash01(seed * 977 + k), zone), d: zone });
  };
  // flanks of the grid: columns start 2 m beyond the outer avenue, rows from the Haram end down to the Nile bank
  for (let j = 0; j < 10; j++)
    for (let i = 0; i < 12; i++)
      for (const s of [-1, 1]) add(s * (GRID.x1 + 2 + CELL / 2 + i * CELL), GRID.z0 + 2 + CELL / 2 + j * CELL - 2);
  // the Haram end: columns line the boulevard, rows run north towards the plateau
  for (let j = 0; j < 9; j++)
    for (let i = 0; i < 14; i++)
      for (const s of [-1, 1]) add(s * (BOULEVARD.half + 3.4 + CELL / 2 + i * CELL), GRID.z0 - 2 - CELL / 2 - j * CELL);

  const plots: Plot[] = [];
  const palms: Spot[] = [];
  const dm = (n: number) => hash01(n);
  cells.forEach((c, ci) => {
    const base = seed * 100003 + ci * 31;
    const near = Math.min(1, distToGrid(c.x, c.z) / 360);
    const edge = BLOCK / 2;
    if (c.use === 'green') {
      // grove: rows of palms
      const n = 6 + Math.floor(dm(base + 1) * 6);
      for (let k = 0; k < n; k++)
        palms.push({
          x: c.x - edge + 2 + dm(base + 10 + k) * (BLOCK - 4),
          z: c.z - edge + 2 + dm(base + 40 + k) * (BLOCK - 4),
          h: 6.5 + dm(base + 70 + k) * 3
        });
      return;
    }
    if (c.use === 'lot') {
      // an empty plot: a few palms along the wall and nothing else
      for (let k = 0; k < 3; k++)
        palms.push({ x: c.x - edge + 3 + k * 12, z: c.z - edge + 2, h: 6 + dm(base + k) * 3 });
      return;
    }
    const split = c.use === 'low' ? 3 : 2;
    const pw = BLOCK / split;
    for (let a = 0; a < split; a++)
      for (let b = 0; b < split; b++) {
        const n = base + a * 7 + b * 13;
        if (dm(n + 2) < (c.use === 'low' ? 0.12 : 0.06)) continue;
        const gap = 1.4 + dm(n + 3) * 1.2;
        const w = pw - gap - dm(n + 4) * 2.2;
        const d = pw - gap - dm(n + 5) * 2.2;
        const look = blockLook(c.d, n);
        let floors: number;
        let tower = false;
        if (c.use === 'low') floors = 2 + Math.floor(dm(n + 6) * 3);
        else {
          floors = 3 + Math.floor(dm(n + 6) * (3 + near * 5)) + (near > 0.5 ? Math.floor(dm(n + 8) * 3) : 0);
          if (near > 0.45 && dm(n + 9) < 0.07) {
            floors = 14 + Math.floor(dm(n + 11) * 9);
            tower = true;
          }
        }
        const style: FacadeStyle = tower ? 'modern' : look.style === 'khedival' ? 'informal' : look.style;
        plots.push({
          x: c.x - edge + pw * (a + 0.5),
          z: c.z - edge + pw * (b + 0.5),
          w,
          d,
          floors,
          style,
          tint: look.tint,
          tower,
          roofBox: !tower && dm(n + 12) < 0.6
        });
      }
    // street trees: a palm at a corner of some blocks
    if (dm(base + 3) < 0.45) palms.push({ x: c.x + edge + 1.5, z: c.z + edge + 1.5, h: 7 + dm(base + 4) * 2.5 });
  });

  // hazy skyline: tall dark boxes on a ring beyond the built-up edge, never across the plateau or the Nile
  const skyline: SkylineBox[] = [];
  const N = q === 'low' ? 90 : 220;
  for (let i = 0; i < N; i++) {
    const a = dm(seed * 31 + i * 3) * Math.PI * 2;
    const r = reach + 30 + dm(seed * 37 + i * 5) * 380;
    const x = Math.cos(a) * r * 1.35,
      z = -50 + Math.sin(a) * r;
    if (z > 225) continue;
    if (z < PLATEAU.z0 + 60 && Math.abs(x) < PLATEAU.halfX + 220) continue;
    skyline.push({
      x,
      z,
      w: 16 + dm(seed + i * 7) * 24,
      d: 16 + dm(seed + i * 11) * 24,
      h: 22 + dm(seed + i * 13) * 55
    });
  }
  return { cells, plots, palms, skyline };
}
