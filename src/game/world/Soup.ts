/** A growing triangle soup: the open city's roads, pavements and walls are poured into these and turned into one mesh each. */
import * as THREE from 'three';

export class Soup {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  constructor(
    /** metres per texture repeat */
    public size = 4,
    public colours = false
  ) {}

  get empty() {
    return this.idx.length === 0;
  }

  vert(
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    u: number,
    v: number,
    c?: readonly [number, number, number]
  ) {
    const i = this.pos.length / 3;
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.uv.push(u, v);
    if (this.colours) this.col.push(c?.[0] ?? 1, c?.[1] ?? 1, c?.[2] ?? 1);
    return i;
  }

  /** A flat convex polygon at height y (points in the x-z plane), facing up. Texture is planar in world space. */
  flat(y: number, pts: readonly { x: number; z: number }[], c?: readonly [number, number, number]) {
    if (pts.length < 3) return;
    const a = pts[0]!,
      b = pts[1]!,
      d = pts[2]!;
    const up = (b.z - a.z) * (d.x - a.x) - (b.x - a.x) * (d.z - a.z) > 0;
    const base = this.pos.length / 3;
    for (const p of pts) this.vert(p.x, y, p.z, 0, 1, 0, p.x / this.size, p.z / this.size, c);
    for (let k = 1; k < pts.length - 1; k++) {
      if (up) this.idx.push(base, base + k, base + k + 1);
      else this.idx.push(base, base + k + 1, base + k);
    }
  }

  /** A strip between two polylines (same length) at height y, facing up. */
  strip(
    y: number,
    l: readonly { x: number; z: number }[],
    r: readonly { x: number; z: number }[],
    c?: readonly [number, number, number]
  ) {
    for (let i = 0; i + 1 < l.length; i++) this.flat(y, [l[i]!, r[i]!, r[i + 1]!, l[i + 1]!], c);
  }

  /** A vertical quad from (x0,z0) to (x1,z1), y0..y1, facing the side of (nx, nz). */
  wall(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    y0: number,
    y1: number,
    nx: number,
    nz: number,
    c?: readonly [number, number, number],
    u0 = 0
  ) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const base = this.pos.length / 3;
    const s = this.size;
    this.vert(x0, y0, z0, nx, 0, nz, u0 / s, y0 / s, c);
    this.vert(x1, y0, z1, nx, 0, nz, (u0 + len) / s, y0 / s, c);
    this.vert(x1, y1, z1, nx, 0, nz, (u0 + len) / s, y1 / s, c);
    this.vert(x0, y1, z0, nx, 0, nz, u0 / s, y1 / s, c);
    // winding: (v1-v0) x (v2-v0) must point along (nx, nz)
    const dx = x1 - x0,
      dz = z1 - z0;
    const cx = -dz * (y1 - y0); // x component of (dx,0,dz) x (dx,h,dz)
    const cz = dx * (y1 - y0); // z component = dx*h - 0*dx
    const facing = cx * nx + cz * nz > 0;
    if (facing) this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else this.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }

  geometry(): THREE.BufferGeometry | null {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.colours) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
