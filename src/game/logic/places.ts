/**
 * The four mission districts on the real map, and the bridge from the old avenue coordinates that the story missions were
 * written in (x across the street, z along it) to streets of the open city: each district's old avenue is laid onto its main street.
 */
import { DISTRICT_STYLES } from './districts';
import { toWorld, type District, type LonLat } from './cairo';
import { inRiver, net } from './roadnet';
import { lots } from './lots';
import type { LevelDef, Step } from '../missions/Levels';

export interface Place {
  id: District;
  name: string;
  blurb: string;
  /** a point on the district's main street, the heading of that street, and what the old avenue's z = 0 was there */
  x: number;
  z: number;
  yaw: number;
  legacyZ: number;
  /** the street it lies on */
  street: string;
}

const SPEC: Record<District, { at: LonLat; legacyZ: number; flipX?: boolean }> = {
  downtown: { at: [31.2376, 30.0467], legacyZ: 0 },
  port: { at: [31.2452, 30.0735], legacyZ: 100 },
  corniche: { at: [31.2105, 30.0405], legacyZ: 190 },
  suburb: { at: [31.1752, 29.9988], legacyZ: -72, flipX: true }
};

let cache: Place[] | null = null;
export function places(): Place[] {
  if (cache) return cache;
  const N = net();
  cache = (Object.keys(SPEC) as District[]).map((id) => {
    const sp = SPEC[id];
    const w = toWorld(sp.at);
    const n = N.nearest(w.x, w.z, 400)!;
    let yaw = N.at(n.e, n.s).yaw;
    // the old avenue grew southwards (+z); on the Haram road it grew away from the pyramids (eastwards)
    const south = Math.cos(yaw) > 0;
    const east = Math.sin(yaw) > 0;
    if (sp.flipX ? !east : !south) yaw += Math.PI;
    const st = DISTRICT_STYLES[id];
    return { id, name: st.name, blurb: st.blurb, x: n.x, z: n.z, yaw, legacyZ: sp.legacyZ, street: n.e.name };
  });
  return cache;
}
export const placeById = (id: string) => places().find((p) => p.id === id) ?? places()[0]!;

/** Which place's district the point lies in. */
export function placeAt(x: number, z: number): Place {
  return placeById(net().area(x, z).district);
}

/** A point is fit for people: not water, not inside a building. */
export function walkable(x: number, z: number): boolean {
  return !inRiver(x, z) && !lots().blocked(x, z, 0.35);
}

/** Street frame at a point: forward (sin, cos of yaw) and the right-hand normal. */
export function frameAt(x: number, z: number): { yaw: number; fx: number; fz: number; nx: number; nz: number } {
  const n = net().nearest(x, z, 300);
  const yaw = n ? net().at(n.e, n.s).yaw : 0;
  return { yaw, fx: Math.sin(yaw), fz: Math.cos(yaw), nx: Math.cos(yaw), nz: -Math.sin(yaw) };
}

/** Old avenue coordinates (x across, z along) of a district on to its street, kept on a road. */
export function legacyToWorld(placeId: string, x: number, z: number): { x: number; z: number } {
  const p = placeById(placeId);
  const along = z - p.legacyZ;
  const fx = Math.sin(p.yaw),
    fz = Math.cos(p.yaw),
    nx = Math.cos(p.yaw),
    nz = -Math.sin(p.yaw);
  const tx = p.x + fx * along + nx * x,
    tz = p.z + fz * along + nz * x;
  const r = net().nearest(tx, tz, 300);
  return r ? { x: r.x, z: r.z } : { x: tx, z: tz };
}

/**
 * The story missions with their points laid on the open city. Suspect offsets (dx across the street, dz along it) become
 * world offsets and are pulled back to the road when they would end up inside a building.
 */
export function openLevel(lv: LevelDef): LevelDef {
  if (lv.world) return lv;
  const m = (x: number, z: number) => legacyToWorld(lv.placeId, x, z);
  const steps: Step[] = lv.steps.map((st) => {
    switch (st.t) {
      case 'goto': {
        const p = m(st.x, st.z);
        return { ...st, x: p.x, z: p.z };
      }
      case 'trap': {
        const p = m(st.x, st.z);
        return { ...st, x: p.x, z: p.z };
      }
      case 'escort': {
        const a = m(st.x, st.z),
          b = m(st.tx, st.tz);
        return { ...st, x: a.x, z: a.z, tx: b.x, tz: b.z };
      }
      case 'checkpoints':
        return { ...st, pts: st.pts.map((q) => m(q.x, q.z)) };
      case 'suspects': {
        const p = m(st.x, st.z);
        const f = frameAt(p.x, p.z);
        return {
          ...st,
          x: p.x,
          z: p.z,
          list: st.list.map((s) => {
            // legacy: dx across, dz along; world offsets along the street here
            let dx = f.nx * s.dx + f.fx * s.dz,
              dz = f.nz * s.dx + f.fz * s.dz;
            if (!walkable(p.x + dx, p.z + dz)) {
              dx *= 0.4;
              dz *= 0.4;
            }
            if (!walkable(p.x + dx, p.z + dz)) {
              dx = 0;
              dz = 0;
            }
            return { ...s, dx, dz };
          })
        };
      }
      default:
        return st;
    }
  });
  return { ...lv, steps, world: true };
}

/**
 * A point `gap` metres ahead along the road from (x, z) in the direction the heading `yaw` points, in the right-hand lane, with the
 * heading to drive on at that point. Follows the street through junctions (straight on) when the edge ends.
 */
export function aheadOnRoad(
  x: number,
  z: number,
  yaw: number,
  gap: number,
  lane = 1.7
): { x: number; z: number; yaw: number } {
  const N = net();
  const n = N.nearest(x, z, 80);
  if (!n) return { x: x + Math.sin(yaw) * gap, z: z + Math.cos(yaw) * gap, yaw };
  let e = n.e;
  let s = n.s;
  let dir: 1 | -1 = Math.cos(yaw - N.at(e, s).yaw) >= 0 ? 1 : -1;
  let left = gap;
  for (let k = 0; k < 8; k++) {
    const toEnd = dir > 0 ? e.len - s : s;
    if (left <= toEnd) {
      s += dir * left;
      left = 0;
      break;
    }
    left -= toEnd;
    s = dir > 0 ? e.len : 0;
    const nid = dir > 0 ? e.b : e.a;
    const here = dir > 0 ? N.at(e, e.len).yaw : N.at(e, 0).yaw + Math.PI;
    let best: { e: typeof e; dir: 1 | -1; dot: number } | null = null;
    for (const id of N.nodes[nid]!.edges) {
      const o = N.edges[id]!;
      if (o === e || !N.canLeave(o, nid)) continue;
      const d: 1 | -1 = o.a === nid ? 1 : -1;
      const h = d > 0 ? N.at(o, 0).yaw : N.at(o, o.len).yaw + Math.PI;
      const dot = Math.cos(h - here);
      if (!best || dot > best.dot) best = { e: o, dir: d, dot };
    }
    if (!best) break;
    e = best.e;
    dir = best.dir;
    s = dir > 0 ? 0 : e.len;
  }
  const p = N.at(e, s);
  const h = dir > 0 ? p.yaw : p.yaw + Math.PI;
  return { x: p.x - Math.cos(h) * lane, z: p.z + Math.sin(h) * lane, yaw: h };
}
