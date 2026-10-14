/**
 * Gunman behaviour around cover (pure, unit-tested). States:
 * advance (no cover: walk in, sometimes sidestep) ↔ move (run to a cover spot) → hide ↔ peek (shoots);
 * after a couple of peeks, or when the officer has worked round the crate, change cover or flank sideways.
 * Moving and flanking gunmen are out in the open, so pushing them out of cover is a good time to shoot.
 */
export type FootMode = 'advance' | 'move' | 'hide' | 'peek' | 'flank';

/** A crate on the ground (axis aligned). `by` = index of the gunman using it, -1 when free. */
export interface Cover {
  x: number;
  z: number;
  by: number;
}

export interface Gunman {
  mode: FootMode;
  t: number;
  /** cover index in use, -1 = none */
  cover: number;
  /** where he's running to */
  tx: number;
  tz: number;
  peeks: number;
  /** flank direction: +1 / -1 around the officer */
  side: number;
  /** stays with a hostage: hides and peeks but never leaves his crate */
  anchored: boolean;
}

export const CRATE_HW = 0.85;
export const CRATE_HD = 0.4;
const SPOT_PAD = 0.5; // m between the crate edge and the gunman's centre
export const RUN_SPEED = 3.4; // m/s between covers
export const FLANK_SPEED = 2.6;
export const PEEK_T = 1.3;
const MAX_HOP = 14; // m: farthest cover worth running to
const MIN_OFFICER = 5; // m: never pick a crate the officer is standing next to

export const newGunman = (anchored = false): Gunman => ({
  mode: 'advance',
  t: 0.6,
  cover: -1,
  tx: 0,
  tz: 0,
  peeks: 0,
  side: 1,
  anchored
});

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Chance of sidestepping round the officer instead of just swapping crates. */
export const flankChance = (skill: number) => 0.15 + 0.35 * clamp01(skill);
/** Chance of leaving cover after two peeks. */
export const moveChance = (skill: number) => 0.35 + 0.35 * clamp01(skill);
/** Hit chance multiplier by state: steady when peeking, poor on the move. */
export const aimFactor = (m: FootMode) => (m === 'peek' || m === 'advance' ? 1 : m === 'flank' ? 0.55 : 0);

/** How far behind the crate centre to crouch, seen along unit direction (ux, uz): clears the crate edge. */
const gap = (ux: number, uz: number) => CRATE_HW * Math.abs(ux) + CRATE_HD * Math.abs(uz) + SPOT_PAD;

/** Spot behind crate `c` as seen from the officer at (px, pz). */
export function spotX(c: Cover, px: number, pz: number) {
  const dx = c.x - px,
    dz = c.z - pz,
    d = Math.hypot(dx, dz) || 1;
  return c.x + (dx / d) * gap(dx / d, dz / d);
}
export function spotZ(c: Cover, px: number, pz: number) {
  const dx = c.x - px,
    dz = c.z - pz,
    d = Math.hypot(dx, dz) || 1;
  return c.z + (dz / d) * gap(dx / d, dz / d);
}

/** True when crate `c` sits between the gunman at (sx, sz) and the officer at (px, pz). */
export function shielded(c: Cover, sx: number, sz: number, px: number, pz: number) {
  const lx = px - sx,
    lz = pz - sz,
    len = Math.hypot(lx, lz);
  if (len < 2.2) return false; // officer is right on top of him
  const cx = c.x - sx,
    cz = c.z - sz;
  if (cx * cx + cz * cz > 2.4 * 2.4) return false; // not close enough to duck behind it
  const along = (cx * lx + cz * lz) / len;
  if (along <= 0 || along >= len) return false;
  const off = Math.abs(cx * lz - cz * lx) / len;
  // crate half-size across the line of fire (it's wider than it is deep)
  const half = (CRATE_HW * Math.abs(lz) + CRATE_HD * Math.abs(lx)) / len;
  return off < half + 0.15;
}

/**
 * Best free crate for gunman `me`: the nearest one he can hide behind that isn't next to the officer,
 * skipping `avoid` (the one he's leaving). Returns -1 when there's none.
 */
export function pickCover(covers: Cover[], me: number, sx: number, sz: number, px: number, pz: number, avoid = -1) {
  let best = -1,
    bd = MAX_HOP;
  for (let i = 0; i < covers.length; i++) {
    const c = covers[i]!;
    if (i === avoid || (c.by !== -1 && c.by !== me)) continue;
    if (Math.hypot(c.x - px, c.z - pz) < MIN_OFFICER) continue;
    const d = Math.hypot(spotX(c, px, pz) - sx, spotZ(c, px, pz) - sz);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

function take(g: Gunman, covers: Cover[], me: number, i: number, px: number, pz: number) {
  if (g.cover !== -1 && g.cover !== i) covers[g.cover]!.by = -1;
  g.cover = i;
  const c = covers[i]!;
  c.by = me;
  g.tx = spotX(c, px, pz);
  g.tz = spotZ(c, px, pz);
  g.mode = 'move';
  g.t = 6; // give up the run after a while
}

function leave(g: Gunman, covers: Cover[]) {
  if (g.cover !== -1) covers[g.cover]!.by = -1;
  g.cover = -1;
}

export interface FootSense {
  sx: number;
  sz: number;
  px: number;
  pz: number;
  skill: number;
}

/** Advance the state machine one frame. Movement itself is done by the caller (see `footStep`). */
export function stepGunman(
  g: Gunman,
  me: number,
  covers: Cover[],
  s: FootSense,
  dt: number,
  rnd: () => number = Math.random
): FootMode {
  g.t -= dt;
  const c = g.cover !== -1 ? covers[g.cover]! : null;
  switch (g.mode) {
    case 'advance':
      if (g.t > 0) break;
      g.t = 2 + rnd();
      {
        const i = pickCover(covers, me, s.sx, s.sz, s.px, s.pz);
        if (i !== -1) take(g, covers, me, i, s.px, s.pz);
        else if (!g.anchored && rnd() < flankChance(s.skill)) {
          g.mode = 'flank';
          g.side = rnd() < 0.5 ? -1 : 1;
          g.t = 1.2 + rnd() * 0.6;
        }
      }
      break;
    case 'move':
      if (Math.hypot(g.tx - s.sx, g.tz - s.sz) < 0.3) {
        g.mode = 'hide';
        g.t = 0.7 + rnd() * 0.5;
      } else if (g.t <= 0) {
        leave(g, covers);
        g.mode = 'advance';
        g.t = 1;
      }
      break;
    case 'hide':
      if (c && !shielded(c, s.sx, s.sz, s.px, s.pz) && g.t < 1.2) {
        // the officer worked round the crate: find the other side of it, or another one
        if (g.anchored) {
          g.mode = 'peek';
          g.t = PEEK_T;
          break;
        }
        const i = pickCover(covers, me, s.sx, s.sz, s.px, s.pz);
        if (i !== -1) take(g, covers, me, i, s.px, s.pz);
        else {
          leave(g, covers);
          g.mode = 'advance';
          g.t = 0.5;
        }
        break;
      }
      if (g.t <= 0) {
        g.mode = 'peek';
        g.t = PEEK_T;
      }
      break;
    case 'peek':
      if (g.t > 0) break;
      g.peeks++;
      if (!g.anchored && g.peeks >= 2 && rnd() < moveChance(s.skill)) {
        g.peeks = 0;
        if (rnd() < flankChance(s.skill)) {
          leave(g, covers);
          g.mode = 'flank';
          g.side = rnd() < 0.5 ? -1 : 1;
          g.t = 1.2 + rnd() * 0.6;
          break;
        }
        const i = pickCover(covers, me, s.sx, s.sz, s.px, s.pz, g.cover);
        if (i !== -1) {
          take(g, covers, me, i, s.px, s.pz);
          break;
        }
      }
      g.mode = 'hide';
      g.t = 1.6 + rnd() * 0.8;
      break;
    case 'flank':
      if (g.t > 0) break;
      {
        const i = pickCover(covers, me, s.sx, s.sz, s.px, s.pz);
        if (i !== -1) take(g, covers, me, i, s.px, s.pz);
        else {
          g.mode = 'advance';
          g.t = 2 + rnd();
        }
      }
      break;
  }
  return g.mode;
}

/** Hidden from the officer's bullets right now. */
export const isHidden = (g: Gunman, covers: Cover[], s: FootSense) =>
  g.mode === 'hide' && g.cover !== -1 && shielded(covers[g.cover]!, s.sx, s.sz, s.px, s.pz);

/**
 * Where the gunman goes this frame (writes into `out`, no allocations). `d` = distance to the officer.
 * Run to the spot, sidestep round the officer, or walk in when he's out of range; otherwise stay put.
 */
export function footStep(
  g: Gunman,
  covers: Cover[],
  s: FootSense,
  d: number,
  dt: number,
  out: { x: number; z: number }
) {
  out.x = s.sx;
  out.z = s.sz;
  if (g.mode === 'move') {
    let ax = g.tx,
      az = g.tz;
    const c = g.cover !== -1 ? covers[g.cover]! : null;
    if (c && segHitsCrate(s.sx, s.sz, ax, az, c)) {
      // run round the crate via its nearest corner instead of into it
      const hx = CRATE_HW + 0.5,
        hz = CRATE_HD + 0.5;
      let best = Infinity;
      for (let k = 0; k < 4; k++) {
        const cx = c.x + (k & 1 ? hx : -hx),
          cz = c.z + (k & 2 ? hz : -hz);
        const hop = Math.hypot(cx - s.sx, cz - s.sz);
        if (hop < 0.05 || segHitsCrate(s.sx, s.sz, cx, cz, c)) continue;
        // a corner that still leaves the crate in the way costs an extra side's worth of running
        const cost = hop + Math.hypot(g.tx - cx, g.tz - cz) + (segHitsCrate(cx, cz, g.tx, g.tz, c) ? 2 : 0);
        if (cost < best) {
          best = cost;
          ax = cx;
          az = cz;
        }
      }
    }
    const dx = ax - s.sx,
      dz = az - s.sz,
      l = Math.hypot(dx, dz);
    const k = l > 1e-6 ? Math.min(l, RUN_SPEED * dt) / l : 0;
    out.x += dx * k;
    out.z += dz * k;
  } else if (g.mode === 'flank' && d > 0.1) {
    // perpendicular to the officer, closing in a little
    const ux = (s.px - s.sx) / d,
      uz = (s.pz - s.sz) / d;
    const v = FLANK_SPEED * dt;
    out.x += (uz * g.side + ux * 0.25) * v;
    out.z += (-ux * g.side + uz * 0.25) * v;
  } else if (g.mode === 'advance' && d > 9 && d < 40) {
    out.x += ((s.px - s.sx) / d) * dt * 1.1;
    out.z += ((s.pz - s.sz) / d) * dt * 1.1;
  }
  return out;
}

/** Keep a person of radius `r` out of a crate (writes into `p`). */
export function pushFromCrate(p: { x: number; z: number }, c: Cover, r = 0.35) {
  const dx = p.x - c.x,
    dz = p.z - c.z;
  const ex = CRATE_HW + r - Math.abs(dx),
    ez = CRATE_HD + r - Math.abs(dz);
  if (ex <= 0 || ez <= 0) return false;
  if (ex < ez) p.x += Math.sign(dx || 1) * ex;
  else p.z += Math.sign(dz || 1) * ez;
  return true;
}

/** Does the segment (ax, az) → (bx, bz) cut through the crate (grown by a body radius)? */
export function segHitsCrate(ax: number, az: number, bx: number, bz: number, c: Cover, r = 0.35) {
  const hx = CRATE_HW + r,
    hz = CRATE_HD + r;
  let t0 = 0,
    t1 = 1;
  const dx = bx - ax,
    dz = bz - az;
  // slab test on x then z
  for (let k = 0; k < 2; k++) {
    const p = k === 0 ? ax - c.x : az - c.z,
      v = k === 0 ? dx : dz,
      h = k === 0 ? hx : hz;
    if (Math.abs(v) < 1e-9) {
      if (Math.abs(p) >= h) return false;
      continue;
    }
    let a = (-h - p) / v,
      b = (h - p) / v;
    if (a > b) {
      const t = a;
      a = b;
      b = t;
    }
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 >= t1) return false;
  }
  return true;
}
