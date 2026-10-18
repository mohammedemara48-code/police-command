/**
 * Street furniture of the open city, planned once for the whole world (pure): lamps, trees, palms and traffic-light poles.
 * Every item is placed on a pavement and checked against the roads, the building lots, the quay and the other items, so
 * nothing stands on a carriageway, inside a building, on the water's edge or on top of another prop.
 */
import { PAVEMENT, type V2 } from './cairo';
import { lots } from './lots';
import { inRiver, net, rng } from './roadnet';
import { signalNodes } from './signals';
import { cornersAt, endMargins } from './junctions';

export type PropKind = 'lamp' | 'tree' | 'palm' | 'signal';
export interface Prop {
  kind: PropKind;
  x: number;
  z: number;
  /** footprint radius (trunk or pole) */
  r: number;
  edge: number;
  seed: number;
  /** palm height */
  h: number;
  /** lamps and signals: which way they face (unit vector, towards the road) */
  fx: number;
  fz: number;
  /** signals: the node the pole belongs to and its corner polygon */
  node?: number;
}

export const PROP_R: Record<PropKind, number> = { lamp: 0.3, tree: 0.55, palm: 0.5, signal: 0.3 };

/** Water within `pad` metres (the quay wall and cap need about 2.2 m of dry ground). */
export function nearWater(x: number, z: number, pad: number): boolean {
  return inRiver(x, z) || inRiver(x + pad, z) || inRiver(x - pad, z) || inRiver(x, z + pad) || inRiver(x, z - pad);
}

/** Is a point on a bridge deck (so that "over water" is right for it)? */
export function onDeck(x: number, z: number): boolean {
  const n = net().nearest(x, z, 24);
  return !!n && n.e.bridge && n.d < n.e.half + PAVEMENT + 1;
}

/** May a prop of radius r stand here? Not on a carriageway, not in a building, not at the water's edge. */
export function propFits(x: number, z: number, r: number): boolean {
  const N = net();
  if (N.onRoad(x, z, r + 0.25)) return false;
  if (lots().blocked(x, z, r + 0.2)) return false;
  if (nearWater(x, z, 2.4) && !onDeck(x, z)) return false;
  return true;
}

let cache: Prop[] | null = null;
let raw: Prop[] | null = null;

/** All props of the world. `filter = false` gives the unchecked placement (used by the audit to show what the guard prevents). */
export function planProps(filter = true): Prop[] {
  if (filter && cache) return cache;
  if (!filter && raw) return raw;
  const N = net();
  const out: Prop[] = [];
  for (const e of N.edges) {
    if (e.ring) continue;
    const r = rng(e.id * 131 + 7);
    const mg = endMargins(e);
    const spacing = e.cls === 'arterial' ? 26 : e.cls === 'collector' ? 30 : 42;
    const corniche = e.name.includes('كورنيش');
    for (let s = mg.a + 5 + r() * 6, k = 0; s < e.len - mg.b - 5; s += spacing, k++) {
      const p = N.at(e, s);
      const sg = k % 2 ? 1 : -1;
      const nx = Math.cos(p.yaw),
        nz = -Math.sin(p.yaw);
      const off = (e.half + 0.95) * sg;
      if (e.cls === 'local' && r() < 0.35) continue;
      out.push({
        kind: 'lamp',
        x: p.x + nx * off,
        z: p.z + nz * off,
        r: PROP_R.lamp,
        edge: e.id,
        seed: 0,
        h: 0,
        fx: -nx * sg,
        fz: -nz * sg
      });
    }
    // (no trees or palms on a bridge deck: lamps only)
    if (e.bridge) continue;
    const mid = N.at(e, e.len / 2);
    const d = N.area(mid.x, mid.z).district;
    const step = corniche ? 11 : d === 'downtown' ? 19 : d === 'port' ? 13 : d === 'corniche' ? 15 : 24;
    const dens = e.cls === 'local' ? 0.45 : 1;
    for (let s = mg.a + 6 + r() * 4, k = 0; s < e.len - mg.b - 6; s += step * (0.85 + r() * 0.3), k++) {
      if (r() > dens) continue;
      const p = N.at(e, s);
      const sg = k % 2 ? 1 : -1;
      const nx = Math.cos(p.yaw),
        nz = -Math.sin(p.yaw);
      const off = (e.half + 2.1) * sg;
      const seed = Math.floor(e.id * 17 + s);
      const palm = corniche || (d === 'corniche' && k % 3 === 1);
      out.push({
        kind: palm ? 'palm' : 'tree',
        x: p.x + nx * off,
        z: p.z + nz * off,
        r: palm ? PROP_R.palm : PROP_R.tree,
        edge: e.id,
        seed,
        h: 7.5 + r() * 2,
        fx: 0,
        fz: 0
      });
    }
  }
  // traffic-light poles on the pavement corners of junctions
  for (const n of signalNodes()) {
    for (const poly of cornersAt(n.id)) {
      const cx = (poly[0]!.x + poly[1]!.x + poly[3]!.x + poly[4]!.x) / 4,
        cz = (poly[0]!.z + poly[1]!.z + poly[3]!.z + poly[4]!.z) / 4;
      const q = poly[2]!;
      const cands: V2[] = [
        { x: cx, z: cz },
        { x: (cx + q.x) / 2, z: (cz + q.z) / 2 },
        { x: q.x, z: q.z }
      ];
      let pick = cands[0]!;
      if (filter) pick = cands.find((c) => propFits(c.x, c.z, PROP_R.signal)) ?? { x: NaN, z: NaN };
      if (!Number.isFinite(pick.x)) continue;
      const dx = pick.x - n.x,
        dz = pick.z - n.z,
        dl = Math.hypot(dx, dz) || 1;
      out.push({
        kind: 'signal',
        x: pick.x,
        z: pick.z,
        r: PROP_R.signal,
        edge: n.edges[0]!,
        seed: 0,
        h: 0,
        fx: dx / dl,
        fz: dz / dl,
        node: n.id
      });
    }
  }
  if (!filter) return (raw = out);
  // keep the ones that fit, and keep props a metre and a half apart
  const kept: Prop[] = [];
  const grid = new Map<number, Prop[]>();
  const gk = (i: number, j: number) => (i + 4096) * 8192 + (j + 4096);
  // poles first, then lamps, then trees, so the furniture that matters wins a crowded spot
  const rank: Record<PropKind, number> = { signal: 0, lamp: 1, palm: 2, tree: 3 };
  for (const p of [...out].sort((a, b) => rank[a.kind] - rank[b.kind])) {
    if (p.kind !== 'signal' && !propFits(p.x, p.z, p.r)) continue;
    const i = Math.floor(p.x / 4),
      j = Math.floor(p.z / 4);
    let clash = false;
    for (let a = i - 1; a <= i + 1 && !clash; a++)
      for (let b = j - 1; b <= j + 1 && !clash; b++)
        for (const o of grid.get(gk(a, b)) ?? [])
          if (Math.hypot(o.x - p.x, o.z - p.z) < p.r + o.r + 1.0) {
            clash = true;
            break;
          }
    if (clash) continue;
    kept.push(p);
    const k = gk(i, j);
    const l = grid.get(k);
    if (l) l.push(p);
    else grid.set(k, [p]);
  }
  return (cache = kept);
}

/** Props whose position lies in the box (a chunk builds its own). */
export function propsIn(x0: number, z0: number, x1: number, z1: number): Prop[] {
  return planProps().filter((p) => p.x >= x0 && p.x < x1 && p.z >= z0 && p.z < z1);
}
