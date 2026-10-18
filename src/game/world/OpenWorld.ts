/**
 * The open city at runtime: a streamed set of square chunks around the officer. Every chunk holds its own ground (with the river
 * cut out), roads, pavements, junction corners, lane marks, quay walls, bridges, rows of buildings with shop fronts, lamps and trees.
 * The road network and the building lots are planned once for the whole map (logic/roadnet.ts, logic/lots.ts), so chunks agree at their borders.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { quality, Q } from '../config/Quality';
import { PAVEMENT, ROAD_HALF, SQUARES, WORLD_BOX, toWorld } from '../logic/cairo';
import { blockLook, hash01 } from '../logic/districts';
import { lots } from '../logic/lots';
import { inRiver, net, rng } from '../logic/roadnet';
import { armAxis, axisGreen, signalNodes } from '../logic/signals';
import { Batch, PROP_MATS as M, surface } from './Environment';
import { wallGeo } from './Egypt';
import { facadeMaterial } from './Facade';
import { Soup } from './Soup';
import { PAVE_Y, cornersAt, edgesIn, endMargins, pourRoads } from './roadMesh';
import { buildWater, groundMats, pourBanks, pourGround } from './riverMesh';
import { SHOP_COLS, SHOP_ROWS, SHOPS, TreeKit, lampAt, shopAtlas } from './streetKit';
import { palmInstances, type PalmSpot } from './Trees';
import type { OBB } from '../logic/collide';
import type { ShopSpot } from '../logic/crowd';

export const CHUNK = 128;
const RADIUS = { low: 3, medium: 4, high: 4 }[quality];

export interface WorldShop extends ShopSpot {
  /** facing of the shop front (radians, three.js rotation.y) */
  yaw: number;
}

interface Chunk {
  i: number;
  j: number;
  group: THREE.Group;
  geos: THREE.BufferGeometry[];
  palms: THREE.Group | null;
  lamps: THREE.Vector3[];
  shops: WorldShop[];
}

const key = (i: number, j: number) => i * 4096 + j;

let mats: {
  asphalt: THREE.MeshStandardMaterial;
  paving: THREE.MeshStandardMaterial;
  paint: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  concrete: THREE.MeshStandardMaterial;
  awning: THREE.MeshStandardMaterial;
  light: [THREE.MeshBasicMaterial, THREE.MeshBasicMaterial];
} | null = null;
function materials() {
  if (mats) return mats;
  const po = (m: THREE.MeshStandardMaterial, f: number) => {
    m.polygonOffset = true;
    m.polygonOffsetFactor = f;
    m.polygonOffsetUnits = f;
    return m;
  };
  mats = {
    asphalt: po(surface('asphalt', Q.hdri ? 0x9a9a9a : 0xb8b8b8).clone(), -1),
    paving: po(surface('paving', 0xd8d2c8).clone(), -1),
    paint: po(M.paint.clone(), -3),
    stone: surface('stone', 0xcfc4ae),
    concrete: surface('concrete', 0xcfcac2),
    awning: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }),
    light: [new THREE.MeshBasicMaterial({ color: 0x33ff66 }), new THREE.MeshBasicMaterial({ color: 0xff3030 })]
  };
  return mats;
}

/** Where the road network leaves the world: closed by a barrier arm and a guard hut. */
export interface Barrier {
  x: number;
  z: number;
  yaw: number;
  half: number;
}

export class OpenWorld {
  readonly group = new THREE.Group();
  readonly barriers: Barrier[] = [];
  readonly signalLamps: [THREE.MeshBasicMaterial, THREE.MeshBasicMaterial];
  private chunks = new Map<number, Chunk>();
  private kit = new TreeKit();
  private water = buildWater();
  private signals = signalNodes();
  private clock = 0;
  /** extra solid boxes (monuments, barrier arms, the tower) */
  readonly solids: OBB[] = [];
  lastBuildMs = 0;
  builtTotal = 0;

  constructor(parent: THREE.Object3D) {
    parent.add(this.group);
    this.group.add(this.water.mesh);
    this.signalLamps = materials().light;
    for (const n of net().nodes) {
      if (n.edges.length !== 1) continue;
      const e = net().edges[n.edges[0]!]!;
      const nearEdge = Math.min(n.x - WORLD_BOX.x0, WORLD_BOX.x1 - n.x, n.z - WORLD_BOX.z0, WORLD_BOX.z1 - n.z) < 40;
      if (!nearEdge) continue;
      const atA = e.a === n.id;
      const p = net().at(e, atA ? 6 : e.len - 6);
      this.barriers.push({ x: p.x, z: p.z, yaw: p.yaw, half: e.half + PAVEMENT });
      this.solids.push({ x: p.x, z: p.z, yaw: p.yaw + Math.PI / 2, hw: 0.3, hl: e.half + 0.5 });
    }
    this.buildGardens();
  }

  /** Round gardens with a low kerb in the middle of every square's roundabout. */
  private buildGardens() {
    const b = new Batch();
    const m = materials();
    const park = surface('park', 0xa8c48a);
    const kit = this.kit;
    const r = rng(9);
    for (const sq of SQUARES) {
      const c = toWorld(sq.at);
      const ring = net().edges.find(
        (e) => e.ring && Math.abs(Math.hypot(e.pts[0]!.x - c.x, e.pts[0]!.z - c.z) - sq.r) < 3
      );
      const rin = sq.r - (ring?.half ?? ROAD_HALF.arterial) - PAVEMENT - 0.3;
      if (rin < 2) continue;
      const rim = new THREE.CylinderGeometry(rin, rin, 0.34, 40);
      rim.translate(c.x, 0.17, c.z);
      b.add(rim, m.concrete, 1.5);
      const top = new THREE.CylinderGeometry(rin - 0.45, rin - 0.45, 0.05, 40);
      top.translate(c.x, 0.36, c.z);
      b.add(top, park, 6);
      this.solids.push({ x: c.x, z: c.z, yaw: 0, hw: rin * 0.72, hl: rin * 0.72 });
      const n = Math.max(3, Math.floor(rin / 2.6));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + r();
        const rr = rin * (0.35 + r() * 0.4);
        if (k % 2 === 0) kit.tree(b, c.x + Math.cos(a) * rr, c.z + Math.sin(a) * rr, 3 + k);
        else if (!kit.palm(b, c.x + Math.cos(a) * rr, c.z + Math.sin(a) * rr, k)) {
          this.palmSpots.push({ x: c.x + Math.cos(a) * rr, z: c.z + Math.sin(a) * rr, h: 8 });
        }
      }
      if (sq.id === 'tahrir') {
        // the obelisk and its stepped plinth
        const st = surface('stone', 0xe3d8c0);
        b.box(st, 7, 0.6, 7, c.x, 0.65, c.z, 0, 3);
        b.box(st, 4.4, 0.6, 4.4, c.x, 1.25, c.z, 0, 3);
        const ob = new THREE.CylinderGeometry(0.55, 1.05, 17, 4);
        ob.rotateY(Math.PI / 4);
        ob.translate(c.x, 10, c.z);
        b.add(ob, st, 3);
        const tip = new THREE.ConeGeometry(0.56, 1.4, 4);
        tip.rotateY(Math.PI / 4);
        tip.translate(c.x, 19.2, c.z);
        b.add(tip, surface('stone', 0xd2b96a), 3);
      }
    }
    b.flush(this.group, Q.shadows);
    if (this.palmSpots.length) this.group.add(palmInstances(this.palmSpots.splice(0)));
  }
  private palmSpots: PalmSpot[] = [];

  /** Build every chunk around a point at once (mission start, fast travel). */
  prime(x: number, z: number) {
    const ci = Math.floor(x / CHUNK),
      cj = Math.floor(z / CHUNK);
    for (const [i, j] of this.wanted(ci, cj)) if (!this.chunks.has(key(i, j))) this.build(i, j);
    this.unload(ci, cj);
  }

  private wanted(ci: number, cj: number): [number, number][] {
    const out: [number, number][] = [];
    for (let i = ci - RADIUS; i <= ci + RADIUS; i++)
      for (let j = cj - RADIUS; j <= cj + RADIUS; j++)
        if ((i - ci) ** 2 + (j - cj) ** 2 <= (RADIUS + 0.4) ** 2) out.push([i, j]);
    return out.sort((a, b) => (a[0] - ci) ** 2 + (a[1] - cj) ** 2 - ((b[0] - ci) ** 2 + (b[1] - cj) ** 2));
  }

  private unload(ci: number, cj: number) {
    for (const [k, c] of this.chunks) {
      if ((c.i - ci) ** 2 + (c.j - cj) ** 2 > (RADIUS + 1.6) ** 2) {
        this.free(c);
        this.chunks.delete(k);
      }
    }
  }

  private free(c: Chunk) {
    c.group.removeFromParent();
    for (const g of c.geos) g.dispose();
    c.palms?.traverse((o) => (o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).dispose());
  }

  /** Stream: one new chunk per call at most, nearest first. Also runs the signal clock. */
  update(x: number, z: number, dt: number) {
    this.clock += dt;
    this.water.update(dt);
    const ci = Math.floor(x / CHUNK),
      cj = Math.floor(z / CHUNK);
    for (const [i, j] of this.wanted(ci, cj)) {
      if (this.chunks.has(key(i, j))) continue;
      this.build(i, j);
      break;
    }
    this.unload(ci, cj);
    const g0 = axisGreen(this.clock, 0),
      g1 = axisGreen(this.clock, 1);
    this.signalLamps[0].color.setHex(g0 ? 0x33ff66 : 0xff3030);
    this.signalLamps[1].color.setHex(g1 ? 0x33ff66 : 0xff3030);
  }

  /** Signal clock in seconds (traffic and pedestrians read it). */
  get time() {
    return this.clock;
  }
  get loaded() {
    return this.chunks.size;
  }

  /** Lamp heads of the chunks around a point (for the night glow). */
  lampsNear(x: number, z: number, r: number, out: THREE.Vector3[] = []): THREE.Vector3[] {
    out.length = 0;
    for (const c of this.chunks.values())
      for (const l of c.lamps) if (Math.abs(l.x - x) < r && Math.abs(l.z - z) < r) out.push(l);
    return out;
  }
  shopsNear(x: number, z: number, r: number, out: WorldShop[] = []): WorldShop[] {
    out.length = 0;
    for (const c of this.chunks.values())
      for (const s of c.shops) if (Math.abs(s.x - x) < r && Math.abs(s.z - z) < r) out.push(s);
    return out;
  }

  private build(i: number, j: number) {
    const t0 = performance.now();
    const x0 = i * CHUNK,
      z0 = j * CHUNK,
      x1 = x0 + CHUNK,
      z1 = z0 + CHUNK;
    const m = materials();
    const gm = groundMats();
    const chunk: Chunk = { i, j, group: new THREE.Group(), geos: [], palms: null, lamps: [], shops: [] };
    const out = (soup: Soup, mat: THREE.Material, shadow = false) => {
      const g = soup.geometry();
      if (!g) return;
      chunk.geos.push(g);
      const mesh = new THREE.Mesh(g, mat);
      mesh.receiveShadow = true;
      mesh.castShadow = shadow;
      chunk.group.add(mesh);
    };

    // ground and the Nile quay
    const desert = new Soup(9, true),
      park = new Soup(9, true),
      wall = new Soup(3.4),
      cap = new Soup(1.6);
    pourGround(x0, z0, x1, z1, desert, park);
    pourBanks(x0, z0, x1, z1, wall, cap);
    out(desert, gm.desert);
    out(park, gm.park);
    out(wall, m.stone);
    out(cap, m.concrete);

    const inside = (x: number, z: number) => x >= x0 && x < x1 && z >= z0 && z < z1;
    const inWorld = x1 > WORLD_BOX.x0 && x0 < WORLD_BOX.x1 && z1 > WORLD_BOX.z0 && z0 < WORLD_BOX.z1;
    const edges = inWorld ? edgesIn(x0, z0, x1, z1) : [];
    if (inWorld) {
      // roads
      const acc = { asphalt: new Soup(5), paving: new Soup(2.2), paint: new Soup(4) };
      pourRoads(x0, z0, x1, z1, acc, edges);
      out(acc.asphalt, m.asphalt);
      out(acc.paving, m.paving);
      out(acc.paint, m.paint);
      this.bridges(edges, inside, chunk, out);
      this.buildings(x0, z0, x1, z1, chunk);
      this.props(edges, inside, chunk, x0, z0);
      this.perimeter(x0, z0, x1, z1, chunk, out);
    }
    this.group.add(chunk.group);
    this.chunks.set(key(i, j), chunk);
    this.lastBuildMs = performance.now() - t0;
    this.builtTotal++;
  }

  /** Bridge fascia, underside, parapets and piers over the water. */
  private bridges(
    edges: ReturnType<typeof edgesIn>,
    inside: (x: number, z: number) => boolean,
    chunk: Chunk,
    out: (s: Soup, m: THREE.Material, shadow?: boolean) => void
  ) {
    const m = materials();
    const side = new Soup(3.4),
      top = new Soup(1.6),
      pier = new Soup(3);
    for (const e of edges) {
      if (!e.bridge) continue;
      const W = e.half + PAVEMENT;
      for (let k = 0; k + 1 < e.pts.length; k++) {
        const a = e.pts[k]!,
          b = e.pts[k + 1]!;
        const mx = (a.x + b.x) / 2,
          mz = (a.z + b.z) / 2;
        if (!inside(mx, mz)) continue;
        const near =
          inRiver(mx, mz) || inRiver(mx + 9, mz) || inRiver(mx - 9, mz) || inRiver(mx, mz + 9) || inRiver(mx, mz - 9);
        if (!near) continue;
        const dx = b.x - a.x,
          dz = b.z - a.z;
        const len = Math.hypot(dx, dz) || 1;
        const nx = -dz / len,
          nz = dx / len;
        const wet = inRiver(mx, mz);
        const y0 = wet ? -1.5 : -0.5;
        for (const sgn of [1, -1]) {
          const ax = a.x + nx * W * sgn,
            az = a.z + nz * W * sgn,
            bx = b.x + nx * W * sgn,
            bz = b.z + nz * W * sgn;
          side.wall(ax, az, bx, bz, y0, PAVE_Y, nx * sgn, nz * sgn, undefined, e.cum[k]!);
          const px = a.x + nx * (W - 0.18) * sgn,
            pz = a.z + nz * (W - 0.18) * sgn,
            qx = b.x + nx * (W - 0.18) * sgn,
            qz = b.z + nz * (W - 0.18) * sgn;
          const rx = a.x + nx * (W - 0.5) * sgn,
            rz = a.z + nz * (W - 0.5) * sgn,
            sx = b.x + nx * (W - 0.5) * sgn,
            sz = b.z + nz * (W - 0.5) * sgn;
          top.wall(px, pz, qx, qz, PAVE_Y, 1.05, nx * sgn, nz * sgn, undefined, e.cum[k]!);
          top.wall(rx, rz, sx, sz, PAVE_Y, 1.05, -nx * sgn, -nz * sgn, undefined, e.cum[k]!);
          top.flat(1.05, [
            { x: rx, z: rz },
            { x: px, z: pz },
            { x: qx, z: qz },
            { x: sx, z: sz }
          ]);
        }
        // underside
        const under = [
          { x: a.x + nx * W, z: a.z + nz * W },
          { x: b.x + nx * W, z: b.z + nz * W },
          { x: b.x - nx * W, z: b.z - nz * W },
          { x: a.x - nx * W, z: a.z - nz * W }
        ];
        const base = side.pos.length / 3;
        for (const p of under) side.vert(p.x, y0, p.z, 0, -1, 0, p.x / 3.4, p.z / 3.4);
        side.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
        // piers in the river every ~36 m
        if (inRiver(mx, mz, 4) && Math.floor(e.cum[k]! / 36) !== Math.floor(e.cum[k + 1]! / 36)) {
          const yaw = Math.atan2(dx, dz);
          const g = new THREE.BoxGeometry(2.4, 4.6 + 1.2, W * 2 - 1.5);
          g.rotateY(yaw + Math.PI / 2);
          // the top stays under the deck: a pier that reached above the asphalt showed as a stone bar across the bridge
          g.translate(mx, -0.3 - 2.9, mz);
          chunk.geos.push(g);
          const mesh = new THREE.Mesh(g, m.stone);
          chunk.group.add(mesh);
        }
      }
    }
    out(side, m.stone);
    out(top, m.concrete);
    void pier;
  }

  private buildings(x0: number, z0: number, x1: number, z1: number, chunk: Chunk) {
    const L = lots().inBox(x0, z0, x1, z1);
    const m = materials();
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const shops = new Soup(1, false);
    const awn = new Soup(1, true);
    const col = new THREE.Color();
    for (const l of L) {
      if (l.reserved || l.x < x0 || l.x >= x1 || l.z < z0 || l.z >= z1) continue;
      const look = blockLook(l.district, l.seed);
      const g = wallGeo(l.hw * 2, l.h, l.hl * 2, l.seed);
      const nrm = g.attributes.normal,
        c = g.attributes.color as THREE.BufferAttribute;
      col.setHex(look.style === 'brick' ? 0xffffff : look.tint);
      for (let v = 0; v < nrm.count; v++) {
        if (nrm.getY(v) > 0.5) c.setXYZ(v, 0.42, 0.41, 0.4);
        else c.setXYZ(v, c.getX(v) * col.r, c.getY(v) * col.g, c.getZ(v) * col.b);
      }
      g.rotateY(l.yaw);
      g.translate(l.x, l.h / 2, l.z);
      const mat = facadeMaterial(look.style, 0xffffff, l.seed);
      const a = byMat.get(mat);
      if (a) a.push(g);
      else byMat.set(mat, [g]);
      // shop front on the street side
      if (l.shop && l.w >= 9) {
        const cs = Math.cos(l.yaw),
          sn = Math.sin(l.yaw);
        // local x axis points away from the road on side -1 ... the street is on the -side direction of local x
        const sx = -l.side;
        const fx = l.x + sx * (l.hw + 0.05) * cs,
          fz = l.z - sx * (l.hw + 0.05) * sn;
        const nx = sx * cs,
          nz = -sx * sn;
        // along-wall direction (local z)
        const tx = sn,
          tz = cs;
        const k = Math.floor(hash01(l.seed * 3 + 1) * SHOPS.length);
        const w2 = 3.6;
        const u0 = (k % SHOP_COLS) / SHOP_COLS,
          u1 = u0 + 1 / SHOP_COLS;
        const v1 = 1 - Math.floor(k / SHOP_COLS) / SHOP_ROWS,
          v0 = v1 - 1 / SHOP_ROWS;
        const H = 3.6;
        const base = shops.pos.length / 3;
        // the texture reads left-to-right as seen from the street: look at the wall with the street behind you
        const rt = { x: tx * (sx > 0 ? -1 : 1), z: tz * (sx > 0 ? -1 : 1) };
        const p = (s: number, y: number) => [fx + rt.x * s * w2, y, fz + rt.z * s * w2] as const;
        const quad = [p(-1, 0), p(1, 0), p(1, H), p(-1, H)];
        const uv = [
          [u0, v0],
          [u1, v0],
          [u1, v1],
          [u0, v1]
        ];
        quad.forEach((q, n2) => {
          shops.pos.push(q[0], q[1], q[2]);
          shops.nor.push(nx, 0, nz);
          shops.uv.push(uv[n2]![0]!, uv[n2]![1]!);
        });
        // winding so that the front faces the street normal
        const cx =
          (quad[1]![1] - quad[0]![1]) * (quad[2]![2] - quad[0]![2]) -
          (quad[1]![2] - quad[0]![2]) * (quad[2]![1] - quad[0]![1]);
        const cz =
          (quad[1]![0] - quad[0]![0]) * (quad[2]![1] - quad[0]![1]) -
          (quad[1]![1] - quad[0]![1]) * (quad[2]![0] - quad[0]![0]);
        if (cx * nx + cz * nz > 0) shops.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        else shops.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
        // awning over the window
        const ac = new THREE.Color(SHOPS[k]![1]);
        ac.offsetHSL(0, -0.15, -0.08);
        const ab = awn.pos.length / 3;
        const pts = [
          [fx - rt.x * 3.4 * 1, 2.95, fz - rt.z * 3.4],
          [fx + rt.x * 3.4, 2.95, fz + rt.z * 3.4],
          [fx + rt.x * 3.4 + nx * 1.3, 2.55, fz + rt.z * 3.4 + nz * 1.3],
          [fx - rt.x * 3.4 + nx * 1.3, 2.55, fz - rt.z * 3.4 + nz * 1.3]
        ];
        pts.forEach((q) => {
          awn.pos.push(q[0]!, q[1]!, q[2]!);
          awn.nor.push(nx * 0.4, 0.9, nz * 0.4);
          awn.uv.push(0, 0);
          awn.col.push(ac.r, ac.g, ac.b);
        });
        awn.idx.push(ab, ab + 1, ab + 2, ab, ab + 2, ab + 3);
        chunk.shops.push({
          x: fx + nx * 1.1,
          z: fz + nz * 1.1,
          side: l.side,
          name: SHOPS[k]![0],
          yaw: Math.atan2(-nx, -nz)
        });
      }
    }
    for (const [mat, geos] of byMat) {
      for (const g of geos)
        for (const k of Object.keys(g.attributes))
          if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      chunk.geos.push(merged);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = Q.shadows;
      mesh.receiveShadow = Q.shadows;
      chunk.group.add(mesh);
    }
    const sg = shops.geometry();
    if (sg) {
      chunk.geos.push(sg);
      chunk.group.add(new THREE.Mesh(sg, shopAtlas()));
    }
    const ag = awn.geometry();
    if (ag) {
      chunk.geos.push(ag);
      chunk.group.add(new THREE.Mesh(ag, m.awning));
    }
  }

  /** Lamps, trees, palms and traffic-light poles along the streets of the chunk. */
  private props(
    edges: ReturnType<typeof edgesIn>,
    inside: (x: number, z: number) => boolean,
    chunk: Chunk,
    x0: number,
    z0: number
  ) {
    const N = net();
    const b = new Batch();
    const palms: PalmSpot[] = [];
    const L = lots();
    for (const e of edges) {
      const r = rng(e.id * 131 + 7);
      const mg = endMargins(e);
      const spacing = e.cls === 'arterial' ? 26 : e.cls === 'collector' ? 30 : 42;
      const corniche = e.name.includes('كورنيش');
      for (let s = mg.a + 5 + r() * 6, k = 0; s < e.len - mg.b - 5; s += spacing, k++) {
        const p = N.at(e, s);
        const sg = k % 2 ? 1 : -1;
        const nx = -Math.cos(p.yaw) * 0 + Math.cos(p.yaw),
          nz = -Math.sin(p.yaw);
        const off = (e.half + 0.95) * sg;
        const lx = p.x + nx * off,
          lz = p.z + nz * off;
        if (e.ring || !inside(lx, lz)) continue;
        if (e.cls === 'local' && r() < 0.35) continue;
        chunk.lamps.push(lampAt(b, lx, lz, -nx * sg, -nz * sg));
      }
      if (e.ring) continue;
      const area = N.area(...(Object.values(N.at(e, e.len / 2)).slice(0, 2) as [number, number]));
      const d = area.district;
      const step = corniche ? 11 : d === 'downtown' ? 19 : d === 'port' ? 13 : d === 'corniche' ? 15 : 24;
      const dens = e.cls === 'local' ? 0.45 : 1;
      for (let s = mg.a + 6 + r() * 4, k = 0; s < e.len - mg.b - 6; s += step * (0.85 + r() * 0.3), k++) {
        if (r() > dens) continue;
        const p = N.at(e, s);
        const sg = corniche ? (k % 2 ? 1 : -1) : k % 2 ? 1 : -1;
        const nx = Math.cos(p.yaw),
          nz = -Math.sin(p.yaw);
        const off = (e.half + 2.1) * sg;
        const tx = p.x + nx * off,
          tz = p.z + nz * off;
        if (!inside(tx, tz) || L.blocked(tx, tz, 0.4) || inRiver(tx, tz)) continue;
        const seed = Math.floor(e.id * 17 + s);
        if (corniche || (d === 'corniche' && k % 3 === 1)) {
          if (!this.kit.palm(b, tx, tz, seed)) palms.push({ x: tx, z: tz, h: 7.5 + r() * 2 });
        } else this.kit.tree(b, tx, tz, seed);
      }
    }
    // traffic lights at junctions
    const m = materials();
    for (const n of this.signals) {
      if (!inside(n.x, n.z)) continue;
      for (const poly of cornersAt(n.id)) {
        // a pole on every corner that touches a real street, facing the traffic that approaches along it
        const cx = (poly[0]!.x + poly[1]!.x + poly[3]!.x + poly[4]!.x) / 4,
          cz = (poly[0]!.z + poly[1]!.z + poly[3]!.z + poly[4]!.z) / 4;
        const dx = cx - n.x,
          dz = cz - n.z;
        const dl = Math.hypot(dx, dz) || 1;
        // pick the arm closest in direction (the arm whose pavement owns this corner side)
        let best = N.edges[n.edges[0]!]!;
        let bd = -2;
        for (const id of n.edges) {
          const e = N.edges[id]!;
          const q = e.a === n.id ? e.pts[1]! : e.pts[e.pts.length - 2]!;
          const ax = q.x - n.x,
            az = q.z - n.z;
          const al = Math.hypot(ax, az) || 1;
          const dot = (ax * dx + az * dz) / (al * dl);
          if (dot > bd) {
            bd = dot;
            best = e;
          }
        }
        const axis = armAxis(n, best);
        const yaw = Math.atan2(-dx, -dz);
        b.box(M.metal, 0.16, 4.4, 0.16, cx, 2.2, cz);
        b.box(M.metal, 0.4, 0.9, 0.34, cx - (dx / dl) * 0.1, 4.4, cz - (dz / dl) * 0.1, yaw);
        b.box(
          m.light[axis],
          0.26,
          0.26,
          0.04,
          cx - (dx / dl) * 0.1 - Math.sin(yaw) * 0.19,
          4.55,
          cz - (dz / dl) * 0.1 - Math.cos(yaw) * 0.19,
          yaw
        );
      }
    }
    void x0;
    void z0;
    b.flush(chunk.group, Q.shadows);
    chunk.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && !(mesh as THREE.InstancedMesh).isInstancedMesh && !chunk.geos.includes(mesh.geometry))
        chunk.geos.push(mesh.geometry);
    });
    if (palms.length) {
      chunk.palms = palmInstances(palms);
      chunk.group.add(chunk.palms);
    }
  }

  /** The fence around the playable map, with gaps for the roads that leave it (a barrier arm closes each one). */
  private perimeter(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    chunk: Chunk,
    out: (s: Soup, m: THREE.Material, shadow?: boolean) => void
  ) {
    const W = WORLD_BOX;
    const m = materials();
    const fence = new Soup(3);
    const N = net();
    const step = 8,
      H = 2.6;
    const run = (ax: number, az: number, bx: number, bz: number, nx: number, nz: number) => {
      const len = Math.hypot(bx - ax, bz - az);
      for (let s = 0; s < len; s += step) {
        const t0 = s / len,
          t1 = Math.min(1, (s + step) / len);
        const px = ax + (bx - ax) * t0,
          pz = az + (bz - az) * t0,
          qx = ax + (bx - ax) * t1,
          qz = az + (bz - az) * t1;
        const mx = (px + qx) / 2,
          mz = (pz + qz) / 2;
        if (mx < x0 || mx >= x1 || mz < z0 || mz >= z1) continue;
        if (N.onRoad(mx, mz, PAVEMENT + 2) || inRiver(mx, mz)) continue;
        fence.wall(px, pz, qx, qz, 0, H, nx, nz, undefined, s);
        fence.wall(px, pz, qx, qz, 0, H, -nx, -nz, undefined, s);
        fence.flat(H, [
          { x: px - nx * 0.25, z: pz - nz * 0.25 },
          { x: px + nx * 0.25, z: pz + nz * 0.25 },
          { x: qx + nx * 0.25, z: qz + nz * 0.25 },
          { x: qx - nx * 0.25, z: qz - nz * 0.25 }
        ]);
      }
    };
    if (x0 <= W.x0 && W.x0 < x1) run(W.x0, Math.max(z0, W.z0), W.x0, Math.min(z1, W.z1), 1, 0);
    if (x0 <= W.x1 && W.x1 < x1) run(W.x1, Math.max(z0, W.z0), W.x1, Math.min(z1, W.z1), 1, 0);
    if (z0 <= W.z0 && W.z0 < z1) run(Math.max(x0, W.x0), W.z0, Math.min(x1, W.x1), W.z0, 0, 1);
    if (z0 <= W.z1 && W.z1 < z1) run(Math.max(x0, W.x0), W.z1, Math.min(x1, W.x1), W.z1, 0, 1);
    out(fence, m.concrete, false);
    // barrier arms
    const b = new Batch();
    for (const br of this.barriers) {
      if (br.x < x0 || br.x >= x1 || br.z < z0 || br.z >= z1) continue;
      const nx = Math.cos(br.yaw),
        nz = -Math.sin(br.yaw);
      const n = 8;
      const wid = br.half * 2 - 1;
      for (let k = 0; k < n; k++) {
        const o = -wid / 2 + ((k + 0.5) * wid) / n;
        b.box(
          k % 2 ? M.white : M.signRed,
          wid / n,
          0.16,
          0.16,
          br.x + nx * o,
          1.05,
          br.z + nz * o,
          br.yaw + Math.PI / 2
        );
      }
      for (const sg of [-1, 1]) {
        b.box(M.metal, 0.3, 1.5, 0.3, br.x + nx * (wid / 2 + 0.4) * sg, 0.75, br.z + nz * (wid / 2 + 0.4) * sg);
        b.box(
          m.concrete,
          1.2,
          0.9,
          3,
          br.x + nx * (wid / 2 + 1.6) * sg - Math.sin(br.yaw) * 2,
          0.45,
          br.z + nz * (wid / 2 + 1.6) * sg - Math.cos(br.yaw) * 2,
          br.yaw,
          1.5
        );
      }
      // guard hut
      b.box(m.concrete, 2.4, 2.4, 2.4, br.x + nx * (wid / 2 + 2.6), 1.2, br.z + nz * (wid / 2 + 2.6), br.yaw, 1.5);
    }
    b.flush(chunk.group, false);
    chunk.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && !(mesh as THREE.InstancedMesh).isInstancedMesh && !chunk.geos.includes(mesh.geometry))
        chunk.geos.push(mesh.geometry);
    });
  }

  /** Lists for the minimap or debug: where the chunks are. */
  chunkList() {
    return [...this.chunks.values()].map((c) => [c.i, c.j]);
  }
}
