/** The ground and the Nile banks of the open city, poured per chunk: the ground has the river cut out, a stone quay wall drops to the water. */
import * as THREE from 'three';
import { inPoly, inRiver, net, RIVER } from '../logic/roadnet';
import { PAVEMENT, toWorld } from '../logic/cairo';
import { hash01 } from '../logic/districts';
import { Q } from '../config/Quality';
import { surface, tex } from './Environment';
import { Soup } from './Soup';

export const WATER_Y = -4.2;
export const QUAY_Y = 0.11;

export function onIsland(x: number, z: number): boolean {
  for (const isl of RIVER.islands) if (inPoly({ x, z }, isl)) return true;
  return false;
}

const DUST: [number, number, number] = [0.98, 0.93, 0.84];
const GRASS: [number, number, number] = [0.66, 0.82, 0.52];
/** Bare city ground between the buildings: paved yard / concrete, not sand. */
const YARD: [number, number, number] = [0.6, 0.58, 0.54];
/** Planted blocks share the yard material (a green tint on it), so they cost no extra draw call. */
const LAWN: [number, number, number] = [0.46, 0.64, 0.36];

/** Sand belongs to the Giza plateau; everywhere else the ground is city ground. */
const PLATEAU = toWorld([31.1342, 29.9792]);
const SAND_FULL = 420,
  SAND_NONE = 650;
/** 'sand' | 'lawn' | 'yard' for the ground at a point (a patchy edge where the plateau ends). */
export function groundAt(x: number, z: number): 'sand' | 'lawn' | 'yard' {
  const d = Math.hypot(x - PLATEAU.x, z - PLATEAU.z);
  const w = Math.max(0, Math.min(1, (SAND_NONE - d) / (SAND_NONE - SAND_FULL)));
  if (w > 0 && hash01(Math.floor(x / 12) * 733 + Math.floor(z / 12) * 31 + 5) < w) return 'sand';
  // a few planted blocks among the paved yards (never in the dense centre)
  if (hash01(Math.floor(x / 26) * 1291 + Math.floor(z / 26) * 17 + 9) < 0.16) return 'lawn';
  return 'yard';
}

/** Ground of one chunk: coarse cells away from the water, fine cells along the banks. */
export function pourGround(x0: number, z0: number, x1: number, z1: number, desert: Soup, park: Soup, yard: Soup) {
  const C = 16,
    F = 2;
  for (let cx = x0; cx < x1; cx += C)
    for (let cz = z0; cz < z1; cz += C) {
      let wet = 0;
      for (let i = 0; i <= 2; i++) for (let j = 0; j <= 2; j++) if (inRiver(cx + (i * C) / 2, cz + (j * C) / 2)) wet++;
      if (wet === 9) continue;
      const cell = (x: number, z: number, s: number) => {
        const mx = x + s / 2,
          mz = z + s / 2;
        const isl = onIsland(mx, mz);
        const k = 0.9 + 0.14 * hash01(Math.floor(mx / 5) * 977 + Math.floor(mz / 5));
        const kind = isl ? 'lawn' : groundAt(mx, mz);
        const base = isl ? GRASS : kind === 'sand' ? DUST : kind === 'lawn' ? LAWN : YARD;
        const col: [number, number, number] = [base[0] * k, base[1] * k, base[2] * k];
        (isl ? park : kind === 'sand' ? desert : yard).flat(
          0,
          [
            { x, z },
            { x: x + s, z },
            { x: x + s, z: z + s },
            { x, z: z + s }
          ],
          col
        );
      };
      if (wet === 0) {
        // a coarse cell may still hide an island's edge: check the centre against islands only (cheap)
        cell(cx, cz, C);
      } else {
        for (let x = cx; x < cx + C; x += F)
          for (let z = cz; z < cz + C; z += F) if (!inRiver(x + F / 2, z + F / 2)) cell(x, z, F);
      }
    }
}

/** Quay wall, cap and parapet along every bank line that passes through the chunk. */
export function pourBanks(x0: number, z0: number, x1: number, z1: number, wall: Soup, cap: Soup) {
  const N = net();
  const lines = [RIVER.east, RIVER.west, ...RIVER.islands];
  for (const line of lines) {
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i]!,
        b = line[i + 1]!;
      const mx = (a.x + b.x) / 2,
        mz = (a.z + b.z) / 2;
      if (mx < x0 || mx >= x1 || mz < z0 || mz >= z1) continue;
      const dx = b.x - a.x,
        dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      let nx = -dz / len,
        nz = dx / len;
      if (!inRiver(mx + nx * 4, mz + nz * 4) && !inRiver(mx - nx * 4, mz - nz * 4)) continue;
      if (!inRiver(mx + nx * 4, mz + nz * 4)) {
        nx = -nx;
        nz = -nz;
      }
      const u0 = (i * 8) % 3000;
      const o = 1.6;
      const ax = a.x + nx * o,
        az = a.z + nz * o,
        bx = b.x + nx * o,
        bz = b.z + nz * o;
      // the wall drops into the water
      const crossing =
        [a, { x: mx, z: mz }, b].some((q) => N.onRoad(q.x, q.z, PAVEMENT + 2.5)) ||
        N.onRoad(a.x - nx * 3, a.z - nz * 3, PAVEMENT + 1.5);
      // where a road meets the bank the wall stops below the carriageway, so no stone lip shows across the asphalt
      wall.wall(ax, az, bx, bz, WATER_Y - 1, crossing ? -0.12 : QUAY_Y, nx, nz, undefined, u0);
      if (crossing) continue;
      // quay cap and a low parapet on the water side
      cap.flat(QUAY_Y, [
        { x: a.x - nx * o, z: a.z - nz * o },
        { x: ax, z: az },
        { x: bx, z: bz },
        { x: b.x - nx * o, z: b.z - nz * o }
      ]);
      const pa = { x: a.x + nx * (o - 0.2), z: a.z + nz * (o - 0.2) },
        pb = { x: b.x + nx * (o - 0.2), z: b.z + nz * (o - 0.2) };
      const qa = { x: a.x + nx * (o - 0.55), z: a.z + nz * (o - 0.55) },
        qb = { x: b.x + nx * (o - 0.55), z: b.z + nz * (o - 0.55) };
      cap.wall(pa.x, pa.z, pb.x, pb.z, QUAY_Y, 0.78, nx, nz, undefined, u0);
      cap.wall(qa.x, qa.z, qb.x, qb.z, QUAY_Y, 0.78, -nx, -nz, undefined, u0);
      cap.flat(0.78, [qa, pa, pb, qb]);
    }
  }
}

/** One big water surface under the whole map, reaching far past the edges of the world. */
export function buildWater(): { mesh: THREE.Mesh; update(dt: number): void } {
  const b = RIVER.box;
  const w = b.x1 - b.x0 + 900,
    h = 14000;
  const geo = new THREE.PlaneGeometry(w, h);
  geo.rotateX(-Math.PI / 2);
  const n2 = tex('river_normal.webp', false).clone();
  n2.repeat.set(w / 30, h / 30);
  n2.needsUpdate = true;
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: 0x4d7f83,
      emissive: 0x10282c,
      roughness: 0.16,
      metalness: 0.05,
      normalMap: n2,
      normalScale: new THREE.Vector2(0.35, 0.35),
      envMapIntensity: Q.hdri ? 1.6 : 1
    })
  );
  mesh.position.set((b.x0 + b.x1) / 2, WATER_Y, (b.z0 + b.z1) / 2);
  mesh.frustumCulled = false;
  mesh.userData.dynamic = true;
  return {
    mesh,
    update(dt) {
      n2.offset.x += dt * 0.0035;
      n2.offset.y += dt * 0.0008;
    }
  };
}

export const groundMats = () => ({
  desert: surface('desert', 0xfffffe, { vertexColors: true }),
  yard: surface('concrete', 0xfffffc, { vertexColors: true }),
  park: surface('park', 0xfffffd, { vertexColors: true })
});
