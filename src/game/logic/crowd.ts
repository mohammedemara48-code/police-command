/**
 * Street crowd plan (pure, unit-tested): who is in the city, per quality preset, and where they can be put.
 * Pavement walkers, groups that chat, shopkeepers at their doors, ahwa tables, vendors, people waiting at a zebra to cross
 * and walkers along the Nile corniche. The city is far larger than the crowd, so people are placed on the pavements around the
 * officer and picked up again when they fall behind (core/Crowd.ts turns this into skinned people); the counts are the same caps as before.
 */
import type { VoiceId, ChatterId } from '../config/barks';
import { CHATTER } from '../config/barks';
import { hash01, type District } from './districts';
import { inRiver, net, type REdge } from './roadnet';
import { lots } from './lots';
import { zebras, type Zebra } from '../world/roadMesh';
import { cornerFrom, pavementSpan } from './junctions';

export type CrowdQuality = 'low' | 'medium' | 'high';
export type CrowdKind = 'walk' | 'group' | 'shop' | 'ahwa' | 'vendor' | 'cross' | 'side' | 'promenade';

/** People per kind and preset. The old street had about 39 people (22 on Low). */
export const CROWD_COUNTS: Record<CrowdQuality, Record<CrowdKind, number>> = {
  low: { walk: 18, group: 8, shop: 4, ahwa: 5, vendor: 3, cross: 6, side: 4, promenade: 4 },
  medium: { walk: 31, group: 12, shop: 7, ahwa: 8, vendor: 4, cross: 10, side: 8, promenade: 8 },
  high: { walk: 40, group: 16, shop: 9, ahwa: 10, vendor: 5, cross: 12, side: 8, promenade: 10 }
};
export const OLD_CROWD = { low: 22, medium: 39, high: 39 } as const;

/** How far from the officer people are drawn and animated, in metres. */
export const CROWD_RADIUS: Record<CrowdQuality, number> = { low: 40, medium: 58, high: 74 };

/** Most people drawn at once (the nearest ones win): each skinned person costs several draw calls. */
export const CROWD_DRAW_CAP: Record<CrowdQuality, number> = { low: 16, medium: 34, high: 56 };
/** Beyond this distance the eyes, brows and lashes are not drawn (saves three draw calls per far person). */
export const FACE_LOD_DIST = 16;

export function crowdTotal(q: CrowdQuality): number {
  return Object.values(CROWD_COUNTS[q]).reduce((a, b) => a + b, 0);
}

/** Pedestrian density by district (Shubra and Downtown busiest). */
export const DISTRICT_DENSITY: Record<District, number> = { port: 1.5, downtown: 1.4, corniche: 0.9, suburb: 0.8 };

export interface ShopSpot {
  x: number;
  z: number;
  side: number;
  name: string;
  /** facing of the shop front (three.js rotation.y), pointing into the building */
  yaw?: number;
}

export interface CrowdSpec {
  id: number;
  kind: CrowdKind;
  role: VoiceId;
  female: boolean;
  scale: number;
  speed: number;
  /** chatting group, and the set (table or cart) people of one table share */
  group: number;
  set: number;
  chat: ChatterId | null;
  /** shop sign for shopkeepers */
  shop: string | null;
  /** shirt colour */
  top: number;
}

const TOPS = [
  0x8d2f45, 0x1f6f6a, 0xe7d7c1, 0x3d4d8a, 0x4a4038, 0x6b7f3a, 0xb5651d, 0x2f4858, 0xc9b27c, 0x7a3b69, 0xd8d8d0, 0x9c2a2a
];

function rng(seed: number) {
  let n = seed;
  return () => hash01(n++);
}

/** Who is in the city: kinds, roles, looks. Positions come from the placement helpers below, around the officer. */
export function planCrowd(q: CrowdQuality, seed = 31): CrowdSpec[] {
  const r = rng(seed);
  const n = CROWD_COUNTS[q];
  const people: CrowdSpec[] = [];
  let id = 0;
  let group = 0;
  let set = 0;
  const make = (p: Partial<CrowdSpec> & Pick<CrowdSpec, 'kind' | 'role'>): CrowdSpec => {
    const spec: CrowdSpec = {
      id: id++,
      female: p.role === 'woman' || (p.role === 'kid' && r() < 0.5),
      scale: 1,
      speed: 0,
      group: -1,
      set: -1,
      chat: null,
      shop: null,
      top: TOPS[Math.floor(r() * TOPS.length)]!,
      ...p
    };
    people.push(spec);
    return spec;
  };
  const walkerRole = (): { role: VoiceId; scale: number; speed: number } => {
    const k = r();
    if (k < 0.1) return { role: 'kid', scale: 0.66 + r() * 0.1, speed: 1.1 + r() * 0.5 };
    if (k < 0.2) return { role: 'elder', scale: 0.94 + r() * 0.04, speed: 0.5 + r() * 0.25 };
    if (k < 0.32) return { role: 'student', scale: 0.98 + r() * 0.06, speed: 1 + r() * 0.35 };
    if (k < 0.62) return { role: 'woman', scale: 0.96 + r() * 0.06, speed: 0.8 + r() * 0.45 };
    return { role: 'pedestrian', scale: 0.97 + r() * 0.08, speed: 0.8 + r() * 0.5 };
  };
  for (const kind of ['walk', 'side', 'promenade', 'cross'] as const)
    for (let i = 0; i < n[kind]; i++) make({ kind, ...walkerRole() });

  // chatting groups: 2 or 3 people standing close, facing each other
  const chatIds = Object.keys(CHATTER) as ChatterId[];
  let left = n.group;
  while (left > 0) {
    const chat = chatIds[Math.floor(r() * chatIds.length)]!;
    const size = left >= 3 && r() < 0.35 ? 3 : 2;
    const roles = CHATTER[chat].who;
    for (let k = 0; k < size; k++) {
      const role = roles[k % 2]!;
      make({
        kind: 'group',
        role,
        scale: role === 'kid' ? 0.7 : role === 'elder' ? 0.95 : 0.97 + r() * 0.07,
        group,
        chat
      });
    }
    group++;
    left -= size;
  }
  for (let i = 0; i < n.shop; i++) make({ kind: 'shop', role: 'shopkeeper', female: false });
  // ahwa tables with up to three customers each
  let ahwaLeft = n.ahwa;
  while (ahwaLeft > 0) {
    const size = Math.min(ahwaLeft, 3);
    for (let k = 0; k < size; k++) make({ kind: 'ahwa', role: 'ahwa', female: false, scale: 0.98 + r() * 0.06, set });
    set++;
    ahwaLeft -= size;
  }
  for (let v = 0; v < n.vendor; v++) make({ kind: 'vendor', role: 'vendor', female: false, set: set++ });
  return people;
}

// ---------------------------------------------------------------- placement on the street network

/** A place on a pavement: edge, distance along it, which way the person walks and on which side of it. */
export interface Lane {
  e: number;
  s: number;
  /** +1 walks from node a towards b */
  dir: 1 | -1;
  /** +1 the pavement on the right of the walking direction, -1 on the left */
  rel: 1 | -1;
  /** distance from the kerb edge across the pavement (0..PAVEMENT) */
  off: number;
}

export interface Pose {
  x: number;
  z: number;
  /** walking heading (three.js rotation.y) */
  yaw: number;
}

export function lanePose(l: Lane): Pose {
  const N = net();
  const e = N.edges[l.e]!;
  const p = N.at(e, l.s);
  const h = l.dir > 0 ? p.yaw : p.yaw + Math.PI;
  const d = l.rel * (e.half + l.off);
  return { x: p.x + Math.cos(h) * d, z: p.z - Math.sin(h) * d, yaw: h };
}

/** Walkable pavement ground: not in a building, the river or the carriageway. */
function fitForPeople(x: number, z: number) {
  return !inRiver(x, z, 0.2) && !lots().blocked(x, z, 0.4) && !net().onRoad(x, z, 0.1);
}

export interface PickOpts {
  rMin: number;
  rMax: number;
  /** camera heading: places ahead of the officer are preferred */
  ahead?: { x: number; z: number };
  /** only streets whose id starts with this (the corniche promenade) */
  sid?: string;
  /** offset across the pavement (default random in 0.8..2.4) */
  off?: number;
  /** keep the district density: busy districts accept more picks */
  dense?: boolean;
}

/** A random spot on a pavement between rMin and rMax of the officer, or null when none was found. */
export function pickLane(me: { x: number; z: number }, rnd: () => number, o: PickOpts): Lane | null {
  const N = net();
  const near: REdge[] = [];
  for (const e of N.edges) {
    if (e.ring || e.len < 16) continue;
    if (o.sid && !e.sid.startsWith(o.sid)) continue;
    const m = e.pts[Math.floor(e.pts.length / 2)]!;
    if (Math.hypot(m.x - me.x, m.z - me.z) < o.rMax + e.len * 0.5) near.push(e);
  }
  if (!near.length) return null;
  for (let t = 0; t < 40; t++) {
    const e = near[Math.floor(rnd() * near.length)]!;
    const lane: Lane = {
      e: e.id,
      s: 0,
      dir: rnd() < 0.5 ? 1 : -1,
      rel: rnd() < 0.5 ? 1 : -1,
      off: o.off ?? 0.8 + rnd() * 1.6
    };
    if (e.oneway) lane.dir = 1;
    // only where this side of the street really has a pavement (junctions cut it back)
    const span = laneSpan(lane);
    if (span.s1 - span.s0 < 6) continue;
    lane.s = span.s0 + 2 + rnd() * (span.s1 - span.s0 - 4);
    const p = lanePose(lane);
    const d = Math.hypot(p.x - me.x, p.z - me.z);
    if (d < o.rMin || d > o.rMax || !fitForPeople(p.x, p.z)) continue;
    if (o.ahead && (p.x - me.x) * o.ahead.x + (p.z - me.z) * o.ahead.z < 0 && rnd() < 0.75) continue;
    if (o.dense && rnd() > DISTRICT_DENSITY[N.area(p.x, p.z).district] / 1.5) continue;
    return lane;
  }
  return null;
}

/** The stretch of the edge where the lane's own side has a pavement (the junction boxes at both ends are cut out). */
export function laneSpan(l: Lane): { s0: number; s1: number } {
  const e = net().edges[l.e]!;
  // pavement side in the edge's frame: right of the walking direction is -1 when walking from a to b
  return pavementSpan(e, (-l.rel * l.dir) as 1 | -1);
}

/**
 * A walker has reached the end of its pavement. At a junction with a pavement corner it turns the corner onto the neighbouring street
 * (never straight across the carriageway: crossing is only done at the zebras); otherwise it turns back. Between two streets with no
 * junction box (a bend) it just carries on.
 */
export function turnAtEnd(l: Lane, rnd: () => number, sid?: string): Lane {
  const N = net();
  const e = N.edges[l.e]!;
  const nid = l.dir > 0 ? e.b : e.a;
  const n = N.nodes[nid]!;
  const back: Lane = { ...l, dir: -l.dir as 1 | -1, rel: -l.rel as 1 | -1 };
  if (n.edges.length < 3) {
    const nx = nextLane(l, rnd, sid);
    const sp = laneSpan(nx);
    return sp.s1 - sp.s0 >= 2 ? { ...nx, s: Math.max(sp.s0 + 0.4, Math.min(sp.s1 - 0.4, nx.s)) } : back;
  }
  if (rnd() < 0.2) return back;
  const side = (-l.rel * l.dir) as 1 | -1;
  const to = cornerFrom(nid, e.id, side);
  if (!to) return back;
  const t = N.edges[to.edge]!;
  if (sid && !t.sid.startsWith(sid)) return back;
  const sp = pavementSpan(t, to.side);
  if (sp.s1 - sp.s0 < 2) return back;
  const atStart = t.a === nid;
  const dir: 1 | -1 = atStart ? 1 : -1;
  return {
    e: t.id,
    s: atStart ? sp.s0 + 0.4 : sp.s1 - 0.4,
    dir,
    rel: (-to.side * dir) as 1 | -1,
    off: l.off
  };
}

/** Is the pose ground a person can stand on, and is the short way from one pose to the next clear too? */
export function clearWalk(from: Pose, to: Pose): boolean {
  if (!fitForPeople(to.x, to.z)) return false;
  for (let q = 1; q < 16; q++)
    if (!fitForPeople(from.x + ((to.x - from.x) * q) / 16, from.z + ((to.z - from.z) * q) / 16)) return false;
  return true;
}

/**
 * Walk a lane forward by `ds` metres along its pavement; at the end of the pavement turn the corner (or back). A step (or corner) that
 * would put the walker on the roadway, in a building or in the water turns it back instead; `stuck` means even that is no good
 * (the caller should put the person somewhere else).
 */
export function advanceLane(
  l: Lane,
  ds: number,
  rnd: () => number,
  sid?: string
): { lane: Lane; turned: boolean; stuck: boolean } {
  const here = lanePose(l);
  const sp = laneSpan(l);
  const s = l.s + l.dir * ds;
  let next: Lane;
  let turned = false;
  if (s > sp.s1 - 0.4 || s < sp.s0 + 0.4) {
    next = turnAtEnd({ ...l, s: Math.max(sp.s0, Math.min(sp.s1, s)) }, rnd, sid);
    turned = true;
  } else next = { ...l, s };
  if (clearWalk(here, lanePose(next))) return { lane: next, turned, stuck: false };
  const back: Lane = { ...l, dir: -l.dir as 1 | -1, rel: -l.rel as 1 | -1, s: l.s - l.dir * ds };
  if (clearWalk(here, lanePose(back))) return { lane: back, turned: false, stuck: false };
  return { lane: l, turned: false, stuck: true };
}

/** How far a walker may step sideways towards the carriageway and still be on the pavement. */
export function dodgeRoom(l: Lane): number {
  return Math.max(0, l.off - 0.35);
}

/** The lane a walker takes when it reaches the end of its edge: through the junction on a random street. */
export function nextLane(l: Lane, rnd: () => number, sid?: string): Lane {
  const N = net();
  const e = N.edges[l.e]!;
  const nid = l.dir > 0 ? e.b : e.a;
  const n = N.nodes[nid]!;
  const here = l.dir > 0 ? N.at(e, e.len).yaw : N.at(e, 0).yaw + Math.PI;
  let opts = n.edges.filter((id) => id !== e.id && !N.edges[id]!.ring && N.edges[id]!.len > 12);
  if (sid) {
    const same = opts.filter((id) => N.edges[id]!.sid.startsWith(sid));
    if (same.length) opts = same;
  }
  if (!opts.length) return { ...l, dir: -l.dir as 1 | -1, rel: -l.rel as 1 | -1 };
  // prefer going straight on
  const scored = opts.map((id) => {
    const o = N.edges[id]!;
    const dir = o.a === nid ? 1 : -1;
    const h = dir > 0 ? N.at(o, 0).yaw : N.at(o, o.len).yaw + Math.PI;
    return { o, dir: dir as 1 | -1, dot: Math.cos(h - here) };
  });
  const straight = scored.filter((s) => s.dot > 0.5);
  const pool = straight.length && rnd() < 0.7 ? straight : scored;
  const c = pool[Math.floor(rnd() * pool.length)]!;
  return { e: c.o.id, dir: c.dir, s: c.dir > 0 ? 0.5 : c.o.len - 0.5, rel: l.rel, off: l.off };
}

// ---- zebra crossings
export interface Crossing extends Zebra {
  /** the walker's pavement offset on either side of the stripes, across the street */
  reach: number;
}
let zebraList: Crossing[] | null = null;
/** Crossings at signalled junctions (people cross when the cars on that arm have a red light). */
export function crossings(sig: ReadonlySet<number>): Crossing[] {
  return (zebraList ??= zebras()
    .filter((z) => sig.has(z.node))
    .map((z) => ({ ...z, reach: z.half + 0.9 })));
}

export function pickCrossing(
  me: { x: number; z: number },
  rnd: () => number,
  list: readonly Crossing[],
  rMin: number,
  rMax: number
): Crossing | null {
  const c = list.filter((z) => {
    const d = Math.hypot(z.x - me.x, z.z - me.z);
    return (
      d >= rMin &&
      d <= rMax &&
      fitForPeople(z.x + Math.cos(z.yaw) * (z.half + 1.2), z.z - Math.sin(z.yaw) * (z.half + 1.2))
    );
  });
  return c.length ? c[Math.floor(rnd() * c.length)]! : null;
}
