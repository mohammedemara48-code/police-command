import { describe, expect, it } from 'vitest';
import { ANCHORS, LANDMARKS, SQUARES, STREETS, WORLD_BOX, toWorld } from '../src/game/logic/cairo';
import { RIVER, inRiver, net, type RNode } from '../src/game/logic/roadnet';

const N = net();

/** nodes reachable from `start` driving the right way down one-way roundabouts */
function reach(start: number, skip?: (e: (typeof N.edges)[number]) => boolean, rev = false) {
  const seen = new Set<number>([start]);
  const stack = [start];
  while (stack.length) {
    const n = stack.pop()!;
    for (const eid of N.nodes[n]!.edges) {
      const e = N.edges[eid]!;
      if (skip?.(e)) continue;
      // reverse search follows edges against their direction
      const ok = rev ? !e.oneway || e.b === n : N.canLeave(e, n);
      if (!ok) continue;
      const o = N.other(e, n);
      if (!seen.has(o)) {
        seen.add(o);
        stack.push(o);
      }
    }
  }
  return seen;
}

describe('open city road network', () => {
  it('is one connected network: every drawn street is part of it', () => {
    expect(N.dropped.filter((e) => !e.infill)).toEqual([]);
    expect(N.nodes.length).toBeGreaterThan(500);
    expect(N.edges.length).toBeGreaterThan(900);
  });

  it('can be driven from any junction to any other (one-way roundabouts included)', () => {
    const fwd = reach(0);
    const back = reach(0, undefined, true);
    expect(fwd.size).toBe(N.nodes.length);
    expect(back.size).toBe(N.nodes.length);
  });

  it('puts every district within reach of every other by a road path', () => {
    const pts = ANCHORS.map((a) => toWorld(a.at));
    const failures: string[] = [];
    for (let i = 0; i < pts.length; i++)
      for (let j = 0; j < pts.length; j++) {
        if (i === j) continue;
        const a = pts[i]!,
          b = pts[j]!;
        const path = N.findPath(a.x, a.z, b.x, b.z);
        const straight = Math.hypot(a.x - b.x, a.z - b.z);
        let len = 0;
        for (let k = 1; k < path.length; k++)
          len += Math.hypot(path[k]!.x - path[k - 1]!.x, path[k]!.z - path[k - 1]!.z);
        // a real route, not a teleport line, and not absurdly long
        if (path.length < 3 || len < straight * 0.98 || len > straight * 3.2 + 300)
          failures.push(`${ANCHORS[i]!.area} -> ${ANCHORS[j]!.area}: ${Math.round(len)} vs ${Math.round(straight)}`);
        // consecutive way points never jump over a gap
        for (let k = 1; k < path.length; k++)
          if (Math.hypot(path[k]!.x - path[k - 1]!.x, path[k]!.z - path[k - 1]!.z) > 80)
            failures.push(`gap in ${ANCHORS[i]!.area} -> ${ANCHORS[j]!.area}`);
      }
    expect(failures).toEqual([]);
  });

  it('reaches the pyramids from Tahrir Square along Haram Street, and Shubra and Dokki from Downtown', () => {
    const t = toWorld([31.2357, 30.0444]);
    for (const name of ['الأهرامات', 'ميدان المساحة', 'ميدان رمسيس']) {
      const l = LANDMARKS.find((x) => x.name === name)!;
      const w = toWorld(l.at);
      const path = N.findPath(t.x, t.z, w.x, w.z);
      expect(path.length).toBeGreaterThan(5);
      const end = path[path.length - 1]!;
      expect(Math.hypot(end.x - w.x, end.z - w.z)).toBeLessThan(1);
      const last = path[path.length - 2]!;
      expect(Math.hypot(last.x - w.x, last.z - w.z)).toBeLessThan(40);
    }
    const route = new Set(
      N.findPath(t.x, t.z, toWorld([31.1342, 29.9792]).x, toWorld([31.1342, 29.9792]).z).map(
        (p) => N.nearest(p.x, p.z, 20)?.e.name
      )
    );
    expect(route.has('شارع الهرم')).toBe(true);
  });

  it('only crosses the Nile on bridges, and the bridges are what joins the banks', () => {
    const bad = N.edges.filter((e) => !e.bridge && e.pts.some((p) => inRiver(p.x, p.z, 3)));
    expect(bad.map((e) => e.name)).toEqual([]);
    const bridges = N.edges.filter((e) => e.bridge);
    const names = new Set(bridges.map((e) => e.name));
    for (const n of ['كوبري قصر النيل', 'كوبري التحرير', 'كوبري ٦ أكتوبر', 'كوبري الجامعة', 'كوبري الجلاء'])
      expect(names.has(n)).toBe(true);
    // without the bridges the network falls apart into several banks; with them it is one piece
    const without = reach(0, (e) => e.bridge);
    expect(without.size).toBeLessThan(N.nodes.length * 0.9);
    // the west bank (Dokki) and the east bank (Downtown) are linked only through bridges
    const dokki = N.nearestNode(toWorld([31.2105, 30.0405]).x, toWorld([31.2105, 30.0405]).z);
    const down = N.nearestNode(toWorld([31.2395, 30.0455]).x, toWorld([31.2395, 30.0455]).z);
    expect(reach(dokki.id, (e) => e.bridge).has(down.id)).toBe(false);
    expect(reach(dokki.id).has(down.id)).toBe(true);
  });

  it('has a roundabout at every square with several streets joining it', () => {
    for (const q of SQUARES) {
      const c = toWorld(q.at);
      const ring = N.edges.filter((e) => e.ring && e.sid === `sq.${q.id}`);
      expect(ring.length, q.name).toBeGreaterThanOrEqual(3);
      const nodes = new Set<RNode>();
      for (const e of ring) {
        nodes.add(N.nodes[e.a]!);
        nodes.add(N.nodes[e.b]!);
      }
      const arms = [...nodes].reduce((s, n) => s + n.edges.filter((id) => !N.edges[id]!.ring).length, 0);
      expect(arms, q.name).toBeGreaterThanOrEqual(3);
      // the middle of the square is a garden, not road
      expect(N.onRoad(c.x, c.z, 0)).toBe(false);
    }
  });

  it('leaves no drawn street stopping dead in the middle of the city', () => {
    const inner = { x0: WORLD_BOX.x0 + 150, x1: WORLD_BOX.x1 - 150, z0: WORLD_BOX.z0 + 150, z1: WORLD_BOX.z1 - 150 };
    const pyramids = toWorld([31.1376, 29.9756]);
    const dead = N.nodes.filter((n) => {
      if (n.edges.length !== 1) return false;
      const e = N.edges[n.edges[0]!]!;
      if (e.infill) return false;
      if (Math.hypot(n.x - pyramids.x, n.z - pyramids.z) < 60) return false;
      return n.x > inner.x0 && n.x < inner.x1 && n.z > inner.z0 && n.z < inner.z1;
    });
    expect(dead.map((n) => `${Math.round(n.x)},${Math.round(n.z)}`)).toEqual([]);
  });

  it('runs the roads to the edge of the world', () => {
    const edge = (n: RNode) =>
      n.x < WORLD_BOX.x0 + 160 || n.x > WORLD_BOX.x1 - 160 || n.z < WORLD_BOX.z0 + 160 || n.z > WORLD_BOX.z1 - 160;
    const ends = N.nodes.filter((n) => edge(n) && n.edges.length >= 1);
    // the north, south and east sides each have drawn roads reaching them
    expect(ends.some((n) => n.z < WORLD_BOX.z0 + 160)).toBe(true);
    expect(ends.some((n) => n.z > WORLD_BOX.z1 - 160)).toBe(true);
    expect(ends.some((n) => n.x > WORLD_BOX.x1 - 160)).toBe(true);
    expect(ends.some((n) => n.x < WORLD_BOX.x0 + 600)).toBe(true);
  });

  it('answers road questions quickly and consistently', () => {
    const e = N.edges.find((x) => x.name === 'شارع طلعت حرب')!;
    const m = N.at(e, e.len / 2);
    expect(N.onRoad(m.x, m.z, 0)).toBe(true);
    expect(N.onRoad(WORLD_BOX.x0 + 50, WORLD_BOX.z0 + 50, 0)).toBe(false);
    const p = N.nearest(m.x + 3, m.z + 3, 30)!;
    expect(p.d).toBeLessThan(6);
    expect(RIVER.outline.length).toBeGreaterThan(20);
  });

  it('knows which district look holds sway where', () => {
    const at = (lon: number, lat: number) => {
      const w = toWorld([lon, lat]);
      return N.area(w.x, w.z);
    };
    expect(at(31.158, 29.99).district).toBe('suburb');
    expect(at(31.2395, 30.0455).district).toBe('downtown');
    expect(at(31.2455, 30.083).district).toBe('port');
    expect(at(31.2105, 30.0405).district).toBe('corniche');
    expect(STREETS.length).toBeGreaterThan(40);
  });
});
