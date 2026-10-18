/**
 * Geometry audit of the generated city (pure, no rendering): finds everything that overlaps something it must not.
 * It runs over the whole planned world (road network, building lots, street furniture, bridges, river), which is exactly the
 * data the chunk streamer pours, and reports a count per kind and per district. The test suite requires every count to be 0.
 *
 *   lot-road       a building footprint on a carriageway
 *   lot-sidewalk   a building footprint on a pavement (or a junction corner)
 *   lot-bridge     a building footprint on a bridge deck or its parapets
 *   lot-square     a building footprint inside a roundabout garden
 *   lot-water      a building footprint in the Nile or on its quay
 *   lot-lot        two buildings (or a building and a monument) overlapping
 *   prop-road      a pole, tree, palm or lamp on a carriageway
 *   prop-lot       a prop inside a building
 *   prop-water     a prop in the water or on the quay edge (not on a bridge deck)
 *   prop-prop      two props on top of each other
 *   road-cross     two roads crossing without a junction
 *   road-overlap   two carriageways overlapping away from a junction
 *   sidewalk-road  a pavement running over another road's carriageway
 *   road-water     a road or its pavement in the water (not on a bridge)
 *   bridge-land    a bridge that never touches water, or one whose ramp ends in the river
 */
import { PAVEMENT, SQUARES, toWorld, type District, type V2 } from './cairo';
import { OUTLINE_STEP, lots, obbOverlap, type Lot } from './lots';
import { inPoly, inRiver, net, type REdge } from './roadnet';
import { nearWater, onDeck, planProps } from './props';
import { cornersAt, pavementSpan } from './junctions';
import { pavementConflicts, roadConflicts } from './netcheck';

export const KINDS = [
  'lot-road',
  'lot-sidewalk',
  'lot-bridge',
  'lot-square',
  'lot-water',
  'lot-lot',
  'prop-road',
  'prop-lot',
  'prop-water',
  'prop-prop',
  'road-cross',
  'road-overlap',
  'sidewalk-road',
  'road-water',
  'bridge-land'
] as const;
export type Kind = (typeof KINDS)[number];

export interface Finding {
  kind: Kind;
  x: number;
  z: number;
  district: District;
  /** what it is (lot id, street name, prop kind) */
  what: string;
}

export interface AuditReport {
  findings: Finding[];
  counts: Record<Kind, number>;
  byDistrict: Record<District, Record<Kind, number>>;
  total: number;
  /** sizes of what was audited */
  audited: { lots: number; props: number; edges: number };
}

const DISTRICTS: District[] = ['downtown', 'port', 'corniche', 'suburb'];
const zero = () => Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<Kind, number>;

function dseg(p: V2, a: V2, b: V2) {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2)) : 0;
  const x = a.x + dx * t,
    z = a.z + dz * t;
  return { d: Math.hypot(p.x - x, p.z - z), t, cross: dx * (p.z - a.z) - dz * (p.x - a.x) };
}

/** What lies at a point: the carriageway of an edge, a rendered pavement, or nothing. */
function surfaceAt(x: number, z: number, skip = -1): { kind: 'road' | 'walk'; e: REdge } | null {
  const N = net();
  const p = { x, z };
  let walk: REdge | null = null;
  for (const h of N.segmentsNear(x, z, PAVEMENT + 0.5)) {
    if (h.e === skip) continue;
    const e = N.edges[h.e]!;
    const q = dseg(p, e.pts[h.i]!, e.pts[h.i + 1]!);
    if (q.d < e.half) return { kind: 'road', e };
    if (q.d < e.half + PAVEMENT) {
      const side: 1 | -1 = q.cross < 0 ? 1 : -1;
      const s = e.cum[h.i]! + q.t * (e.cum[h.i + 1]! - e.cum[h.i]!);
      const span = pavementSpan(e, side);
      if (s >= span.s0 - 0.01 && s <= span.s1 + 0.01) walk = e;
    }
  }
  if (walk) return { kind: 'walk', e: walk };
  return null;
}

function boundary(l: Lot, step: number): V2[] {
  const out: V2[] = [];
  const c = Math.cos(l.yaw),
    s = Math.sin(l.yaw);
  const put = (a: number, b: number) => out.push({ x: l.x + a * c + b * s, z: l.z - a * s + b * c });
  const nx = Math.max(1, Math.ceil((l.hw * 2) / step)),
    nz = Math.max(1, Math.ceil((l.hl * 2) / step));
  for (let i = 0; i <= nx; i++) {
    const a = -l.hw + (i / nx) * l.hw * 2;
    put(a, -l.hl);
    put(a, l.hl);
  }
  for (let j = 1; j < nz; j++) {
    const b = -l.hl + (j / nz) * l.hl * 2;
    put(-l.hw, b);
    put(l.hw, b);
  }
  return out;
}
const inLot = (l: Lot, x: number, z: number, pad = 0) => {
  const c = Math.cos(l.yaw),
    s = Math.sin(l.yaw);
  const dx = x - l.x,
    dz = z - l.z;
  return Math.abs(dx * c - dz * s) < l.hw + pad && Math.abs(dx * s + dz * c) < l.hl + pad;
};

export function auditCity(opts: { rawProps?: boolean } = {}): AuditReport {
  const N = net();
  const L = lots();
  const findings: Finding[] = [];
  const add = (kind: Kind, x: number, z: number, what: string) =>
    findings.push({ kind, x, z, district: N.area(x, z).district, what });

  // ---- buildings against roads, pavements, squares, water
  const corners = N.nodes.flatMap((n) => cornersAt(n.id).map((poly) => ({ poly, node: n.id })));
  for (const l of L.lots) {
    const monument = !!l.reserved && l.edge === -1;
    const lion = monument && l.hw < 3;
    const what = `lot ${l.id || (l.ghost ? 'plaza' : lion ? 'lion' : 'station')}`;
    let road = false,
      walk = false,
      bridge = false;
    for (const p of boundary(l, OUTLINE_STEP)) {
      const s = surfaceAt(p.x, p.z);
      if (!s) continue;
      if (s.kind === 'road') {
        if (s.e.bridge) bridge = true;
        else road = true;
      } else if (!lion && !l.ghost) {
        if (s.e.bridge) bridge = true;
        else walk = true;
      }
      if (road && (walk || lion)) break;
    }
    // pavement corner fills at junctions
    if (!lion && !l.ghost && !walk)
      for (const c of corners) {
        if (Math.hypot(c.poly[2]!.x - l.x, c.poly[2]!.z - l.z) > 60) continue;
        if (c.poly.some((q) => inLot(l, q.x, q.z, 0)) || boundary(l, 1).some((p) => inPoly(p, c.poly))) {
          walk = true;
          break;
        }
      }
    if (road) add('lot-road', l.x, l.z, what);
    if (walk) add('lot-sidewalk', l.x, l.z, what);
    if (bridge) add('lot-bridge', l.x, l.z, what);
    // roundabout gardens
    for (const q of SQUARES) {
      const c = toWorld(q.at);
      if (Math.hypot(c.x - l.x, c.z - l.z) > Math.max(l.hw, l.hl) + q.r) continue;
      if (inLot(l, c.x, c.z, q.r - 1) || boundary(l, 1).some((p) => Math.hypot(p.x - c.x, p.z - c.z) < q.r - 1)) {
        add('lot-square', l.x, l.z, `${what} @ ${q.id}`);
        break;
      }
    }
    // water and quay
    if (!l.ghost) {
      const wet = boundary(l, 1.5).some((p) => nearWater(p.x, p.z, 2.4)) || nearWater(l.x, l.z, 2.4);
      if (wet) add('lot-water', l.x, l.z, what);
    }
  }
  // buildings against buildings (and monuments)
  const all = L.lots;
  for (let i = 0; i < all.length; i++) {
    const a = all[i]!;
    const ra = Math.hypot(a.hw, a.hl);
    for (const b of L.inBox(a.x - ra - 2, a.z - ra - 2, a.x + ra + 2, a.z + ra + 2)) {
      if (b === a || all.indexOf(b) < i) continue;
      if (Math.hypot(a.x - b.x, a.z - b.z) > ra + Math.hypot(b.hw, b.hl)) continue;
      if (obbOverlap(a, b, -0.05)) add('lot-lot', (a.x + b.x) / 2, (a.z + b.z) / 2, `lot ${a.id} x lot ${b.id}`);
    }
  }

  // ---- street furniture
  const props = planProps(!opts.rawProps);
  for (const p of props) {
    const what = `${p.kind} (${N.edges[p.edge]?.name ?? '?'})`;
    if (N.onRoad(p.x, p.z, p.r)) add('prop-road', p.x, p.z, what);
    if (L.blocked(p.x, p.z, p.r)) add('prop-lot', p.x, p.z, what);
    if (nearWater(p.x, p.z, 2.4) && !onDeck(p.x, p.z)) add('prop-water', p.x, p.z, what);
  }
  const cell = new Map<number, number[]>();
  const ck = (i: number, j: number) => (i + 4096) * 8192 + (j + 4096);
  props.forEach((p, n) => {
    const i = Math.floor(p.x / 4),
      j = Math.floor(p.z / 4);
    for (let a = i - 1; a <= i + 1; a++)
      for (let b = j - 1; b <= j + 1; b++)
        for (const o of cell.get(ck(a, b)) ?? []) {
          const q = props[o]!;
          if (Math.hypot(q.x - p.x, q.z - p.z) < p.r + q.r + 0.5)
            add('prop-prop', (p.x + q.x) / 2, (p.z + q.z) / 2, `${p.kind} x ${q.kind}`);
        }
    const k = ck(i, j);
    const l = cell.get(k);
    if (l) l.push(n);
    else cell.set(k, [n]);
  });

  // ---- roads against roads
  const tag = (e: REdge) => `${e.name}#${e.id}${e.infill ? '*' : ''}${e.bridge ? '^' : ''}`;
  for (const c of roadConflicts(N)) add(c.kind, c.x, c.z, `${tag(c.e)} x ${tag(c.f)}`);
  for (const c of pavementConflicts(N)) add('sidewalk-road', c.x, c.z, `${tag(c.e)} pavement over ${tag(c.f)}`);
  for (const e of N.edges) {
    // water on the road or its pavement
    const wet = new Set<string>();
    for (let s = 0; s <= e.len; s += 2) {
      const p = N.at(e, s);
      const nx = Math.cos(p.yaw),
        nz = -Math.sin(p.yaw);
      {
        // (bridges excepted)
        if (!e.bridge) {
          for (const o of [0, e.half + PAVEMENT / 2, -(e.half + PAVEMENT / 2)]) {
            const wx = p.x - nx * o,
              wz = p.z - nz * o;
            if (inRiver(wx, wz) && !onDeck(wx, wz)) {
              const key = `r${e.id}:${Math.round(wx / 8)}:${Math.round(wz / 8)}`;
              if (!wet.has(key)) {
                wet.add(key);
                add('road-water', wx, wz, e.name);
              }
            }
          }
        }
      }
    }
    // bridges
    if (e.bridge) {
      let over = false;
      for (let s = 0; s <= e.len; s += 3) {
        const p = N.at(e, s);
        // (the approach counts: parapets and piers start 9 m before the bank)
        if (
          [
            [0, 0],
            [9, 0],
            [-9, 0],
            [0, 9],
            [0, -9]
          ].some(([dx, dz]) => inRiver(p.x + dx!, p.z + dz!))
        )
          over = true;
      }
      const a = e.pts[0]!,
        b = e.pts[e.pts.length - 1]!;
      const endWet = (q: V2) => inRiver(q.x, q.z) && N.nodes[q === a ? e.a : e.b]!.edges.length <= 1;
      if (!over || endWet(a) || endWet(b)) add('bridge-land', (a.x + b.x) / 2, (a.z + b.z) / 2, e.name);
    }
  }

  const counts = zero();
  const byDistrict = Object.fromEntries(DISTRICTS.map((d) => [d, zero()])) as Record<District, Record<Kind, number>>;
  for (const f of findings) {
    counts[f.kind]++;
    byDistrict[f.district][f.kind]++;
  }
  return {
    findings,
    counts,
    byDistrict,
    total: findings.length,
    audited: { lots: L.lots.length, props: props.length, edges: N.edges.length }
  };
}

/** A readable table of the report (for the test output and for humans). */
export function formatReport(r: AuditReport): string {
  const rows = [['kind', 'total', ...DISTRICTS].join('\t')];
  for (const k of KINDS) rows.push([k, r.counts[k], ...DISTRICTS.map((d) => r.byDistrict[d][k])].join('\t'));
  rows.push(['TOTAL', r.total].join('\t'));
  return rows.join('\n');
}
