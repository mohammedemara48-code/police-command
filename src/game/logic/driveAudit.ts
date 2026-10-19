/**
 * Drive audit (pure, runs in the tests): an autopilot drives every vehicle along every road edge (both ways where
 * allowed) and through every turn at every junction, at the speed a driver would hold (top speed, slowed only for the
 * curve), with the real handling model and the real road-edge step. Any spot where the car scrapes a kerb, gets wedged,
 * leaves the asphalt or loses speed it should not is reported.
 */
import { moveCar, ROAD_QUERY, type RoadQuery } from './carMove';
import { ACCEL, BRAKE, STEER_RATE, stepCar, smoothSteer, steerAuth } from './driving';
import { wrapAngle } from './locomotion';
import { net, type REdge, type RoadNet } from './roadnet';
import { shapeOf } from './roadShape';
import { VEHICLES, baseTop, type VehicleId } from './vehicles';
import type { V2 } from './cairo';

export type DriveIssue = 'wedged' | 'scrape' | 'offroad' | 'slow' | 'stuck';
export interface DriveSpot {
  kind: DriveIssue;
  vehicle: VehicleId;
  x: number;
  z: number;
  route: string;
}
export interface DriveReport {
  runs: number;
  counts: Record<DriveIssue, number>;
  spots: DriveSpot[];
}

const DT = 1 / 30;

/** Lane line `off` metres right of an edge's centre, from node `from` (edge points in driving order). */
function lane(N: RoadNet, e: REdge, from: number, off: number): V2[] {
  const P = shapeOf(N).prof[e.id]!;
  const pts = P.map((q) => ({ x: q.x - q.nx * off, z: q.z - q.nz * off }));
  if (from === e.a) return pts;
  // driving b -> a: the right-hand side is the edge's left
  return P.map((q) => ({ x: q.x + q.nx * off, z: q.z + q.nz * off })).reverse();
}
const laneOff = (e: REdge) => (e.oneway ? 0 : e.half * 0.45);

function resample(pts: V2[], step: number): V2[] {
  const out: V2[] = [pts[0]!];
  let carry = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!,
      b = pts[i + 1]!;
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    let s = step - carry;
    while (s <= L) {
      out.push({ x: a.x + ((b.x - a.x) * s) / L, z: a.z + ((b.z - a.z) * s) / L });
      s += step;
    }
    carry = L - (s - step);
  }
  const last = pts[pts.length - 1]!;
  if (Math.hypot(out[out.length - 1]!.x - last.x, out[out.length - 1]!.z - last.z) > 0.2) out.push(last);
  return out;
}

/** Drop points where a centre line doubles back on itself (a hook of the street data): a driver goes straight on. */
function straighten(p: V2[]): V2[] {
  const out: V2[] = [p[0]!];
  for (let i = 1; i < p.length; i++) {
    const q = p[i]!;
    if (out.length >= 2) {
      const a = out[out.length - 2]!,
        b = out[out.length - 1]!;
      const t1 = Math.atan2(b.x - a.x, b.z - a.z),
        t2 = Math.atan2(q.x - b.x, q.z - b.z);
      if (Math.abs(wrapAngle(t2 - t1)) > 1.2 && i + 1 < p.length) continue;
    }
    if (Math.hypot(q.x - out[out.length - 1]!.x, q.z - out[out.length - 1]!.z) > 0.3) out.push(q);
  }
  return out;
}

/** Planned speed along a path: top speed, the curve limit (lateral grip and steering authority), braking ahead. */
function plan(path: V2[], vmax: number, v: VehicleId): number[] {
  const h = VEHICLES[v].handling;
  const n = path.length;
  const lim = new Array<number>(n).fill(vmax);
  for (let i = 1; i + 1 < n; i++) {
    const a = path[Math.max(0, i - 2)]!,
      b = path[i]!,
      c = path[Math.min(n - 1, i + 2)]!;
    const t1 = Math.atan2(b.x - a.x, b.z - a.z),
      t2 = Math.atan2(c.x - b.x, c.z - b.z);
    const d = Math.abs(wrapAngle(t2 - t1));
    const L = (Math.hypot(b.x - a.x, b.z - a.z) + Math.hypot(c.x - b.x, c.z - b.z)) / 2;
    const R = d < 1e-4 ? 1e9 : L / d;
    // keep to 55% of the yaw rate the wheel gives at that speed, and ~6 m/s² sideways
    let s = Math.min(vmax, Math.sqrt(6 * h.grip * R));
    for (let k = 0; k < 8; k++) s = Math.min(s, STEER_RATE * h.steer * 0.55 * Math.max(0.35, steerAuth(s, vmax)) * R);
    lim[i] = Math.max(4, s);
  }
  // brake in time: v^2 <= v_next^2 + 2 a d
  const dec = 10 * (BRAKE / 22) * h.brake;
  for (let i = n - 2; i >= 0; i--) {
    const d = Math.hypot(path[i + 1]!.x - path[i]!.x, path[i + 1]!.z - path[i]!.z);
    lim[i] = Math.min(lim[i]!, Math.sqrt(lim[i + 1]! ** 2 + 2 * dec * d));
  }
  // and speed back up no faster than the car can (acceleration fades towards top speed)
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.z - path[i - 1]!.z);
    const a = ACCEL * h.accel * Math.max(0.3, 1 - (0.65 * lim[i - 1]!) / vmax) * 0.85;
    lim[i] = Math.min(lim[i]!, Math.sqrt(lim[i - 1]! ** 2 + 2 * a * d));
  }
  return lim;
}

/** Drive one path; returns the issues found (one per kind per ~8 m). */
export function drivePath(
  path0: V2[],
  v: VehicleId,
  route: string,
  Q: RoadQuery = ROAD_QUERY,
  vmax = baseTop(v),
  trace?: (t: number, c: { x: number; z: number; speed: number }, want: number, hit: string) => void
): DriveSpot[] {
  const path = straighten(resample(path0, 1));
  if (path.length < 6) return [];
  const want = plan(path, vmax, v);
  const H = VEHICLES[v].handling;
  const yaw0 = Math.atan2(path[1]!.x - path[0]!.x, path[1]!.z - path[0]!.z);
  const c = { x: path[0]!.x, z: path[0]!.z, speed: want[0]!, yaw: yaw0, velYaw: yaw0 };
  let steerCur = 0;
  let k = 0;
  const out: DriveSpot[] = [];
  const seen = new Set<string>();
  const flag = (kind: DriveIssue) => {
    const key = `${kind}:${Math.round(c.x / 8)}:${Math.round(c.z / 8)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kind, vehicle: v, x: c.x, z: c.z, route });
  };
  let slowT = 0,
    t = 0,
    lastK = 0,
    sinceK = 0;
  const end = path.length - 1;
  const maxT = (path.length / Math.max(3, vmax * 0.3)) * 2 + 5;
  while (k < end - 1 && t < maxT) {
    t += DT;
    // progress along the path: nearest point ahead
    while (
      k < end &&
      (Math.hypot(path[k + 1]!.x - c.x, path[k + 1]!.z - c.z) <= Math.hypot(path[k]!.x - c.x, path[k]!.z - c.z) ||
        Math.hypot(path[k]!.x - c.x, path[k]!.z - c.z) < 2)
    )
      k++;
    const look = Math.max(4, Math.abs(c.speed) * 0.55);
    let j = k;
    while (j < end && Math.hypot(path[j]!.x - c.x, path[j]!.z - c.z) < look) j++;
    const tgt = path[j]!;
    const err = wrapAngle(Math.atan2(tgt.x - c.x, tgt.z - c.z) - c.yaw);
    steerCur = smoothSteer(steerCur, Math.max(-1, Math.min(1, err * 2.6)), c.speed, DT);
    const vt = want[Math.min(end, k + 2)]!;
    const thr = c.speed < vt - 0.3 ? 1 : c.speed > vt + 1.5 ? -0.6 : c.speed > vt + 0.3 ? 0 : 0.4;
    const s = stepCar(
      { speed: c.speed, yaw: c.yaw, velYaw: c.velYaw },
      { throttle: thr, steer: steerCur, handbrake: false, max: vmax },
      DT,
      H
    );
    c.speed = s.speed;
    c.yaw = s.yaw;
    c.velYaw = s.velYaw;
    const hit = moveCar(c, v, DT, Q);
    trace?.(t, c, vt, hit.kind + (hit.offRoad ? '+off' : ''));
    if (hit.kind === 'wedged') flag('wedged');
    else if (hit.kind === 'slide' && hit.head > 0.25) flag('scrape');
    if (hit.offRoad) flag('offroad');
    // slower than planned for a while (the plan already includes braking for curves)
    if (t > 1 && c.speed < Math.min(vt, want[k]!) * 0.6) slowT += DT;
    else slowT = 0;
    if (slowT > 0.5) {
      flag('slow');
      slowT = 0;
    }
    if (k > lastK) {
      lastK = k;
      sinceK = 0;
    } else if ((sinceK += DT) > 2.5) {
      flag('stuck');
      break;
    }
  }
  return out;
}

/** Every route of the network: each edge both ways (where allowed) and each turn at each junction (no U-turns). */
export function routes(N: RoadNet = net()): { name: string; path: V2[] }[] {
  const out: { name: string; path: V2[] }[] = [];
  for (const e of N.edges) {
    for (const from of [e.a, e.b]) {
      if (e.oneway && from !== e.a) continue;
      if (e.len < 8) continue;
      // a dead end is where a driver stops: the run ends (or starts) a car length short of it
      const p = lane(N, e, from, laneOff(e));
      const to = N.other(e, from);
      const s0 = N.nodes[from]!.edges.length === 1 ? 6 : 0,
        s1 = len(p) - (N.nodes[to]!.edges.length === 1 ? 6 : 0);
      if (s1 - s0 < 8) continue;
      out.push({ name: `e${e.id}:${from}`, path: cut(p, s0, s1) });
    }
  }
  for (const n of N.nodes) {
    if (n.edges.length < 2) continue;
    for (const ia of n.edges)
      for (const ib of n.edges) {
        if (ia === ib) continue;
        const A = N.edges[ia]!,
          B = N.edges[ib]!;
        const fromA = N.other(A, n.id);
        if (A.oneway && A.b !== n.id) continue;
        if (B.oneway && B.a !== n.id) continue;
        const pa = lane(N, A, fromA, laneOff(A)),
          pb = lane(N, B, n.id, laneOff(B));
        // the last 30 m in and the first 30 m out, stopping short of the junction box, joined by a smooth curve
        const m = Math.max(...n.edges.map((id) => N.edges[id]!.half)) + 1;
        const deadIn = N.nodes[fromA]!.edges.length === 1 ? 6 : 0,
          deadOut = N.nodes[N.other(B, n.id)]!.edges.length === 1 ? 6 : 0;
        const tail = cut(pa, Math.max(deadIn, len(pa) - 30), Math.max(0, len(pa) - m)),
          head = cut(pb, Math.min(m, len(pb)), Math.min(30, len(pb) - deadOut));
        if (tail.length < 2 || head.length < 2 || len(tail) < 4 || len(head) < 4) continue;
        const p0 = tail[tail.length - 1]!,
          q0 = tail[tail.length - 2]!,
          p2 = head[0]!,
          q2 = head[1]!;
        const ta = Math.atan2(p0.x - q0.x, p0.z - q0.z),
          tb = Math.atan2(q2.x - p2.x, q2.z - p2.z);
        if (Math.abs(wrapAngle(tb - ta)) > 2.1) continue;
        const d0 = { x: Math.sin(ta), z: Math.cos(ta) },
          d2 = { x: Math.sin(tb), z: Math.cos(tb) };
        const den = d0.x * d2.z - d0.z * d2.x;
        let ctl = { x: (p0.x + p2.x) / 2, z: (p0.z + p2.z) / 2 };
        if (Math.abs(den) > 0.05) {
          const u = ((p2.x - p0.x) * d2.z - (p2.z - p0.z) * d2.x) / den;
          if (u > 0 && u < 40) ctl = { x: p0.x + d0.x * u, z: p0.z + d0.z * u };
        }
        const curve: V2[] = [];
        for (let k = 1; k < 10; k++) {
          const t = k / 10;
          curve.push({
            x: (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * ctl.x + t * t * p2.x,
            z: (1 - t) * (1 - t) * p0.z + 2 * (1 - t) * t * ctl.z + t * t * p2.z
          });
        }
        out.push({ name: `n${n.id}:${ia}>${ib}`, path: [...tail, ...curve, ...head] });
      }
  }
  return out;
}

function len(p: V2[]) {
  let s = 0;
  for (let i = 0; i + 1 < p.length; i++) s += Math.hypot(p[i + 1]!.x - p[i]!.x, p[i + 1]!.z - p[i]!.z);
  return s;
}
function cut(p: V2[], s0: number, s1: number): V2[] {
  const out: V2[] = [];
  let s = 0;
  for (let i = 0; i + 1 < p.length; i++) {
    const a = p[i]!,
      b = p[i + 1]!;
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const at = (u: number) => ({
      x: a.x + ((b.x - a.x) * (u - s)) / (L || 1),
      z: a.z + ((b.z - a.z) * (u - s)) / (L || 1)
    });
    if (s + L >= s0 && s <= s1) {
      if (!out.length) out.push(at(Math.max(s, s0)));
      if (s + L <= s1) out.push(b);
      else {
        out.push(at(s1));
        break;
      }
    }
    s += L;
  }
  return out;
}

/** Drive everything for the given vehicles. `every` > 1 samples every n-th route (quick test runs). */
export function auditDriving(vehicles: VehicleId[], every = 1): DriveReport {
  const R = routes();
  const counts: Record<DriveIssue, number> = { wedged: 0, scrape: 0, offroad: 0, slow: 0, stuck: 0 };
  const spots: DriveSpot[] = [];
  let runs = 0;
  for (const v of vehicles)
    R.forEach((r, i) => {
      if (i % every) return;
      runs++;
      for (const s of drivePath(r.path, v, r.name)) {
        counts[s.kind]++;
        spots.push(s);
      }
    });
  return { runs, counts, spots };
}
