/**
 * Street crowd plan (pure, unit-tested): who stands or walks where, per quality preset.
 * Pavement walkers, groups that chat, shopkeepers at their doors, ahwa tables, vendors, people waiting at the kerb
 * to cross, walkers on the cross streets and the Nile promenade. The runtime (core/Crowd.ts) only turns specs into people.
 */
import type { VoiceId, ChatterId } from '../config/barks';
import { CHATTER } from '../config/barks';
import { districtAt, hash01, type District } from './districts';

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

const CROSS = [-96, -45, 50, 145, 236];
const HALF = 4.6;
/** Cross streets with traffic lights (people cross the avenue there when the avenue is red). */
export const LIGHT_CROSS = CROSS.slice(1, 4);

export interface ShopSpot {
  x: number;
  z: number;
  side: number;
  name: string;
}

export interface CrowdSpec {
  id: number;
  kind: CrowdKind;
  role: VoiceId;
  female: boolean;
  x: number;
  z: number;
  /** facing (radians, 0 = +z) when standing */
  yaw: number;
  scale: number;
  speed: number;
  axis: 'x' | 'z';
  /** walk range along the axis */
  lo: number;
  hi: number;
  dir: number;
  group: number;
  chat: ChatterId | null;
  /** shop sign for shopkeepers */
  shop: string | null;
  /** shirt colour */
  top: number;
}

export interface PropSpec {
  kind: 'table' | 'cart';
  x: number;
  z: number;
  yaw: number;
}

export interface CrowdPlan {
  people: CrowdSpec[];
  props: PropSpec[];
}

const TOPS = [
  0x8d2f45, 0x1f6f6a, 0xe7d7c1, 0x3d4d8a, 0x4a4038, 0x6b7f3a, 0xb5651d, 0x2f4858, 0xc9b27c, 0x7a3b69, 0xd8d8d0, 0x9c2a2a
];

function rng(seed: number) {
  let n = seed;
  return () => hash01(n++);
}

/** Pavement stretches of the main avenue between the cross streets. */
export function avenueSegments(): { a: number; b: number; d: District; w: number }[] {
  const pts = [-112, ...CROSS.flatMap((c) => [c - HALF - 0.8, c + HALF + 0.8]), 232];
  const out: { a: number; b: number; d: District; w: number }[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    const a = pts[i]!,
      b = pts[i + 1]!;
    if (b - a < 6) continue;
    const d = districtAt((a + b) / 2);
    out.push({ a, b, d, w: (b - a) * DISTRICT_DENSITY[d] });
  }
  return out;
}

export function planCrowd(q: CrowdQuality, shops: ShopSpot[], promenadeZ: number, seed = 31): CrowdPlan {
  const r = rng(seed);
  const n = CROWD_COUNTS[q];
  const people: CrowdSpec[] = [];
  const props: PropSpec[] = [];
  const segs = avenueSegments();
  const segTotal = segs.reduce((s, g) => s + g.w, 0);
  let id = 0;
  let group = 0;

  const make = (p: Partial<CrowdSpec> & Pick<CrowdSpec, 'kind' | 'role' | 'x' | 'z'>): CrowdSpec => {
    const spec: CrowdSpec = {
      id: id++,
      female: p.role === 'woman' || (p.role === 'kid' && r() < 0.5),
      yaw: 0,
      scale: 1,
      speed: 0,
      axis: 'z',
      lo: 0,
      hi: 0,
      dir: 1,
      group: -1,
      chat: null,
      shop: null,
      top: TOPS[Math.floor(r() * TOPS.length)]!,
      ...p
    };
    people.push(spec);
    return spec;
  };
  /** which walker this is, by chance */
  const walkerRole = (): { role: VoiceId; scale: number; speed: number } => {
    const k = r();
    if (k < 0.1) return { role: 'kid', scale: 0.66 + r() * 0.1, speed: 1.1 + r() * 0.5 };
    if (k < 0.2) return { role: 'elder', scale: 0.94 + r() * 0.04, speed: 0.5 + r() * 0.25 };
    if (k < 0.32) return { role: 'student', scale: 0.98 + r() * 0.06, speed: 1 + r() * 0.35 };
    if (k < 0.62) return { role: 'woman', scale: 0.96 + r() * 0.06, speed: 0.8 + r() * 0.45 };
    return { role: 'pedestrian', scale: 0.97 + r() * 0.08, speed: 0.8 + r() * 0.5 };
  };
  const pickSeg = () => {
    let t = r() * segTotal;
    for (const s of segs) {
      t -= s.w;
      if (t <= 0) return s;
    }
    return segs[segs.length - 1]!;
  };

  // walkers on the main avenue pavements
  for (let i = 0; i < n.walk; i++) {
    const s = pickSeg();
    const side = r() < 0.5 ? -1 : 1;
    const w = walkerRole();
    make({
      kind: 'walk',
      ...w,
      x: side * (5.3 + r() * 2),
      z: s.a + 1 + r() * (s.b - s.a - 2),
      axis: 'z',
      lo: s.a,
      hi: s.b,
      dir: r() < 0.5 ? -1 : 1
    });
  }

  // chatting groups: 2 or 3 people standing close, facing each other
  const chatIds = Object.keys(CHATTER) as ChatterId[];
  let left = n.group;
  while (left > 0) {
    const s = pickSeg();
    const side = r() < 0.5 ? -1 : 1;
    const chat = chatIds[Math.floor(r() * chatIds.length)]!;
    const size = left >= 3 && r() < 0.35 ? 3 : 2;
    const gz = s.a + 2 + r() * Math.max(0.5, s.b - s.a - 4);
    const gx = side * (5.6 + r() * 1.4);
    const roles = CHATTER[chat].who;
    for (let k = 0; k < size; k++) {
      const role = roles[k % 2]!;
      const dz = (k - (size - 1) / 2) * 0.95;
      make({
        kind: 'group',
        role,
        x: gx + (k % 2 ? 0.25 : -0.25),
        z: gz + dz,
        yaw: k % 2 ? -Math.PI / 2 - (side > 0 ? 0 : Math.PI) : Math.PI / 2 - (side > 0 ? 0 : Math.PI),
        scale: role === 'kid' ? 0.7 : role === 'elder' ? 0.95 : 0.97 + r() * 0.07,
        group,
        chat
      });
    }
    group++;
    left -= size;
  }

  // shopkeepers at their doors
  const doors = shops
    .map((s) => ({ s, k: r() }))
    .sort((a, b) => a.k - b.k)
    .slice(0, n.shop);
  for (const { s } of doors)
    make({
      kind: 'shop',
      role: 'shopkeeper',
      female: false,
      x: s.side * 7.4,
      z: s.z + (r() - 0.5) * 2,
      yaw: s.side > 0 ? -Math.PI / 2 : Math.PI / 2,
      scale: 1,
      shop: s.name
    });

  // ahwa: tables against the facade, customers around them
  const ahwaZ = [-72, -10, 28, 78, 122, 168, -30, 102];
  let ahwaLeft = n.ahwa;
  for (let c = 0; ahwaLeft > 0 && c < ahwaZ.length; c++) {
    const side = c % 2 ? 1 : -1;
    const z = ahwaZ[c]! + (r() - 0.5) * 4;
    const x = side * 7.1;
    props.push({ kind: 'table', x, z, yaw: 0 });
    const size = Math.min(ahwaLeft, 3);
    for (let k = 0; k < size; k++) {
      const a = (k / size) * Math.PI * 2 + 0.6;
      make({
        kind: 'ahwa',
        role: 'ahwa',
        female: false,
        x: x + Math.cos(a) * 0.95,
        z: z + Math.sin(a) * 0.95,
        yaw: Math.atan2(-Math.cos(a), -Math.sin(a)),
        scale: 0.98 + r() * 0.06
      });
    }
    ahwaLeft -= size;
  }

  // vendors with a cart at the kerb
  const vendorZ = [20, 85, -20, 112, -75, 160];
  for (let v = 0; v < n.vendor; v++) {
    const side = v % 2 ? 1 : -1;
    const z = vendorZ[v % vendorZ.length]! + (r() - 0.5) * 6;
    props.push({ kind: 'cart', x: side * 5.35, z, yaw: Math.PI / 2 });
    make({
      kind: 'vendor',
      role: 'vendor',
      female: false,
      x: side * 6.2,
      z: z + 0.4,
      yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2,
      scale: 1
    });
  }

  // people waiting at the kerb to cross the avenue, and crossing when it is red
  for (let c = 0; c < n.cross; c++) {
    const cz = LIGHT_CROSS[c % LIGHT_CROSS.length]!;
    const s = c % 2 ? 1 : -1;
    const w = walkerRole();
    const startSide = c % 3 === 0 ? 1 : -1;
    make({
      kind: 'cross',
      ...w,
      x: startSide * 5.35,
      z: cz + s * (HALF + 1.3) + (r() - 0.5) * 0.8,
      axis: 'x',
      lo: -5.35,
      hi: 5.35,
      dir: -startSide
    });
  }

  // walkers on the cross streets near the avenue
  for (let i = 0; i < n.side; i++) {
    const cz = CROSS[1 + (i % 3)]!;
    const side = i % 2 ? 1 : -1;
    const w = walkerRole();
    const xs = r() < 0.5 ? -1 : 1;
    make({
      kind: 'side',
      ...w,
      x: xs * (12 + r() * 24),
      z: cz + side * (HALF + 1.3),
      axis: 'x',
      lo: xs > 0 ? 9 : -42,
      hi: xs > 0 ? 42 : -9,
      dir: r() < 0.5 ? -1 : 1
    });
  }

  // along the Nile promenade
  for (let i = 0; i < n.promenade; i++) {
    const w = walkerRole();
    make({
      kind: 'promenade',
      ...w,
      x: -110 + r() * 220,
      z: promenadeZ + 2.5 + (i % 4) * 1.6,
      axis: 'x',
      lo: -118,
      hi: 118,
      dir: i % 3 === 0 ? -1 : 1
    });
  }
  return { people, props };
}
