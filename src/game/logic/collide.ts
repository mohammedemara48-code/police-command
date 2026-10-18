/** Circle vs oriented box push-out (pure, unit-tested): the officer slides along cars instead of walking through. */
export interface OBB {
  x: number;
  z: number;
  yaw: number;
  hw: number;
  hl: number;
}

/** Returns the circle centre pushed out of the box (unchanged when not touching). */
export function pushOut(px: number, pz: number, r: number, b: OBB): { x: number; z: number; hit: boolean } {
  const c = Math.cos(b.yaw),
    s = Math.sin(b.yaw);
  // into box space (box forward = +z rotated by yaw, like three.js rotation.y)
  const dx = px - b.x,
    dz = pz - b.z;
  const lx = dx * c - dz * s,
    lz = dx * s + dz * c;
  const qx = Math.max(-b.hw, Math.min(b.hw, lx)),
    qz = Math.max(-b.hl, Math.min(b.hl, lz));
  let ox = lx - qx,
    oz = lz - qz;
  let d = Math.hypot(ox, oz);
  if (d >= r) return { x: px, z: pz, hit: false };
  let nx: number, nz: number;
  if (d < 1e-6) {
    // centre inside the box: leave through the nearest face
    const ex = b.hw - Math.abs(lx),
      ez = b.hl - Math.abs(lz);
    if (ex < ez) {
      nx = Math.sign(lx) || 1;
      nz = 0;
      d = -ex;
    } else {
      nx = 0;
      nz = Math.sign(lz) || 1;
      d = -ez;
    }
  } else {
    nx = ox / d;
    nz = oz / d;
  }
  const push = r - d;
  ox = nx * push;
  oz = nz * push;
  // back to world
  return { x: px + ox * c + oz * s, z: pz - ox * s + oz * c, hit: true };
}

export function resolve(px: number, pz: number, r: number, boxes: OBB[]) {
  let x = px,
    z = pz,
    hit = false;
  for (let k = 0; k < 2; k++)
    for (const b of boxes) {
      if (Math.abs(b.x - x) > 6 || Math.abs(b.z - z) > 6) continue;
      const o = pushOut(x, z, r, b);
      if (o.hit) {
        x = o.x;
        z = o.z;
        hit = true;
      }
    }
  return { x, z, hit };
}

/**
 * Push out of solids, then keep the result on the walkable pad when possible.
 * Always prefers leaving a solid over staying inside it (the old onFoot gate left the officer stuck in cars).
 */
export function resolveFoot(
  px: number,
  pz: number,
  r: number,
  boxes: OBB[],
  walkable: (x: number, z: number) => boolean
): { x: number; z: number; hit: boolean } {
  const o = resolve(px, pz, r, boxes);
  if (!o.hit) return o;
  if (walkable(o.x, o.z)) return o;
  if (walkable(o.x, pz)) return { x: o.x, z: pz, hit: true };
  if (walkable(px, o.z)) return { x: px, z: o.z, hit: true };
  return o;
}
