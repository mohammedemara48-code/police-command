/**
 * Ambient traffic on the open street network (pure, unit-tested): a fixed number of cars drive the real streets in the
 * right-hand lane, stop at red lights, keep a gap to the car in front, take turns at junctions and are recycled when they
 * fall far behind the officer, so the count never grows.
 */
import { armAxis, axisGreen, signalNodes } from './signals';
import { net, type REdge } from './roadnet';

export interface Veh {
  id: number;
  e: number;
  s: number;
  /** +1 drives from node a to b, -1 the other way */
  dir: 1 | -1;
  /** speed along the road (m/s, always >= 0) and what it would like to do */
  v: number;
  cruise: number;
  /** next edge, chosen ahead of the junction */
  next: { e: number; dir: 1 | -1 } | null;
  /** pose to draw (world) */
  x: number;
  z: number;
  yaw: number;
  /** leftover jump from the last junction (fades out) and a shove after a crash */
  lx: number;
  lz: number;
  lyaw: number;
  px: number;
  pz: number;
  /** pulling over to the kerb for a siren (0..1), seconds frozen after a crash */
  side: number;
  bumpT: number;
  /** seconds spent waiting behind the officer */
  waitT: number;
}

export interface Obstacle {
  x: number;
  z: number;
}

const STOP_BEFORE = 8.5;
const LANE = 0.5;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class NetTraffic {
  cars: Veh[] = [];
  private sig = new Set<number>(signalNodes().map((n) => n.id));
  private axis = new Map<number, 0 | 1>();
  private spawnRnd: () => number;

  constructor(
    count: number,
    private px = 0,
    private pz = 0,
    rnd: () => number = Math.random
  ) {
    this.spawnRnd = rnd;
    for (let i = 0; i < count; i++) this.cars.push(this.place({ id: i } as Veh, 40, 300));
  }

  private arm(nodeId: number, e: REdge) {
    const k = nodeId * 100000 + e.id;
    let a = this.axis.get(k);
    if (a === undefined) {
      a = armAxis(net().nodes[nodeId]!, e);
      this.axis.set(k, a);
    }
    return a;
  }

  /** Put (or re-put) a car on a random street a given distance from the officer. */
  place(c: Veh, dMin: number, dMax: number): Veh {
    const N = net();
    const r = this.spawnRnd;
    let best: { e: REdge; s: number; x: number; z: number } | null = null;
    for (let t = 0; t < 60; t++) {
      const e = N.edges[Math.floor(r() * N.edges.length)]!;
      if (e.ring || e.len < 40) continue;
      const s = 12 + r() * (e.len - 24);
      const p = N.at(e, s);
      const d = Math.hypot(p.x - this.px, p.z - this.pz);
      best = { e, s, x: p.x, z: p.z };
      if (d >= dMin && d <= dMax) break;
    }
    const e = best!.e;
    c.e = e.id;
    c.s = best!.s;
    c.dir = e.oneway || r() < 0.5 ? 1 : -1;
    c.cruise = (e.cls === 'arterial' ? 10.5 : e.cls === 'collector' ? 8.6 : 6.9) * (0.85 + r() * 0.3);
    c.v = c.cruise * 0.6;
    c.next = null;
    c.lx = c.lz = c.lyaw = c.px = c.pz = 0;
    c.side = 0;
    c.bumpT = 0;
    c.waitT = 0;
    this.pose(c, true);
    return c;
  }

  private pickNext(c: Veh): { e: number; dir: 1 | -1 } {
    const N = net();
    const e = N.edges[c.e]!;
    const nid = c.dir > 0 ? e.b : e.a;
    const n = N.nodes[nid]!;
    const here = this.heading(e, c.dir, c.dir > 0 ? e.len : 0);
    const opts: { e: REdge; dir: 1 | -1; dot: number }[] = [];
    for (const id of n.edges) {
      if (id === e.id) continue;
      const o = N.edges[id]!;
      if (!N.canLeave(o, nid)) continue;
      const dir = o.a === nid ? 1 : -1;
      const h = this.heading(o, dir, dir > 0 ? 0 : o.len);
      opts.push({ e: o, dir, dot: Math.cos(h - here) });
    }
    if (!opts.length) return { e: e.id, dir: e.oneway ? 1 : (-c.dir as 1 | -1) };
    // mostly straight on, sometimes a turn
    const r = this.spawnRnd();
    const straight = opts.filter((o) => o.dot > 0.6);
    const pool =
      straight.length && r < 0.65
        ? straight
        : opts.filter((o) => o.dot > -0.5).length
          ? opts.filter((o) => o.dot > -0.5)
          : opts;
    const o = pool[Math.floor(this.spawnRnd() * pool.length)]!;
    return { e: o.e.id, dir: o.dir };
  }

  private heading(e: REdge, dir: 1 | -1, s: number) {
    const p = net().at(e, s);
    return dir > 0 ? p.yaw : p.yaw + Math.PI;
  }

  /** Draw pose of a car from its place on the road. `snap` drops the junction lag. */
  private pose(c: Veh, snap = false) {
    const N = net();
    const e = N.edges[c.e]!;
    const p = N.at(e, c.s);
    const yaw = c.dir > 0 ? p.yaw : p.yaw + Math.PI;
    // the right-hand lane (Egypt drives on the right): for heading yaw the right side is (-cos yaw, sin yaw)
    const off = e.half * LANE + c.side * (e.half * 0.4);
    const bx = p.x - Math.cos(yaw) * off,
      bz = p.z + Math.sin(yaw) * off;
    if (snap) {
      c.lx = c.lz = c.lyaw = 0;
    }
    c.x = bx + c.lx + c.px;
    c.z = bz + c.lz + c.pz;
    c.yaw = yaw + c.lyaw;
  }

  /** Advance the traffic. `me` is the officer, `obstacles` are things on the road to brake for (player car). */
  step(
    dt: number,
    clock: number,
    me: { x: number; z: number },
    o: { siren?: boolean; range?: number; obstacles?: readonly Obstacle[] } = {}
  ) {
    const N = net();
    this.px = me.x;
    this.pz = me.z;
    for (const c of this.cars) {
      const e = N.edges[c.e]!;
      if (Math.hypot(c.x - me.x, c.z - me.z) > 360) {
        this.place(c, 130, 300);
        continue;
      }
      const toEnd = c.dir > 0 ? e.len - c.s : c.s;
      const nid = c.dir > 0 ? e.b : e.a;
      if (!c.next && toEnd < 34) c.next = this.pickNext(c);

      // what we would like to do
      let target = c.cruise;
      if (e.ring) target = Math.min(target, 5);
      if (c.next && toEnd < 16) {
        const ne = N.edges[c.next.e]!;
        const turn = Math.cos(
          this.heading(ne, c.next.dir, c.next.dir > 0 ? 0 : ne.len) - this.heading(e, c.dir, c.dir > 0 ? e.len : 0)
        );
        if (turn < 0.9) target = Math.min(target, 4 + turn * 2 + 2);
        if (turn < 0) target = Math.min(target, 3.2);
      }
      let stop = false;
      // red light
      if (this.sig.has(nid)) {
        const gap = toEnd - (STOP_BEFORE + e.half * 0.25);
        if (gap > -0.5 && gap < 7 + c.v * 0.9 && !axisGreen(clock, this.arm(nid, e))) stop = true;
      }
      // keep a gap to the car in front (same street, same way)
      for (const d of this.cars) {
        if (d === c || d.e !== c.e || d.dir !== c.dir) continue;
        const ahead = (d.s - c.s) * c.dir;
        if (ahead > 0 && ahead < 7 + c.v * 0.8) {
          stop = stop || ahead < 6.2;
          target = Math.min(target, Math.max(0, d.v) + (ahead - 6.2) * 0.7);
        }
      }
      // the officer or the patrol car ahead
      const fx = Math.sin(c.yaw),
        fz = Math.cos(c.yaw);
      let blocked = false;
      for (const ob of o.obstacles ?? []) {
        const dx = ob.x - c.x,
          dz = ob.z - c.z;
        const along = dx * fx + dz * fz,
          lat = Math.abs(dx * fz - dz * fx);
        if (lat < 1.5 && along > 2.6 && along < 8) {
          blocked = true;
          stop = true;
        }
      }
      c.waitT = blocked ? c.waitT + dt : 0;
      // siren: ease to the kerb and stop to let the patrol through
      const near = Math.hypot(c.x - me.x, c.z - me.z);
      const kerb = !!o.siren && near < (o.range ?? 40);
      c.side += ((kerb ? 1 : 0) - c.side) * Math.min(1, dt * 2);
      if (o.siren && near < 22) stop = true;
      if (c.bumpT > 0) {
        c.bumpT -= dt;
        stop = true;
      }
      if (stop) target = 0;

      // accelerate / brake
      c.v += Math.max(-9 * dt, Math.min(3.2 * dt, target - c.v));
      if (c.v < 0.01) c.v = 0;
      c.s += c.dir * c.v * dt;

      // arrive at the junction: hand over to the next street
      const over = c.dir > 0 ? c.s - e.len : -c.s;
      if (over >= 0) {
        const nx = c.next ?? this.pickNext(c);
        const ne = N.edges[nx.e]!;
        // wait while another car is still near the start of the street we want to join
        const start = nx.dir > 0 ? 0 : ne.len;
        const busy = this.cars.some((d) => d !== c && d.e === nx.e && d.dir === nx.dir && Math.abs(d.s - start) < 7.5);
        if (busy) {
          c.s = c.dir > 0 ? e.len : 0;
          c.v = 0;
        } else {
          const oldX = c.x,
            oldZ = c.z,
            oldYaw = c.yaw;
          c.e = nx.e;
          c.dir = nx.dir;
          c.s = Math.max(0, Math.min(ne.len, nx.dir > 0 ? Math.abs(over) : ne.len - Math.abs(over)));
          c.next = null;
          c.cruise =
            (ne.cls === 'arterial' ? 10.5 : ne.cls === 'collector' ? 8.6 : 6.9) * (0.85 + this.spawnRnd() * 0.3);
          // keep the picture continuous: the jump to the new lane fades out
          c.lx = c.lz = c.lyaw = 0;
          this.pose(c, true);
          c.lx = oldX - c.x;
          c.lz = oldZ - c.z;
          c.lyaw = wrap(oldYaw - c.yaw);
        }
      }
      const k = Math.exp(-dt * 4);
      c.lx *= k;
      c.lz *= k;
      c.lyaw *= k;
      const pk = Math.exp(-dt * 2.5);
      c.px *= pk;
      c.pz *= pk;
      this.pose(c);
    }
  }
}
