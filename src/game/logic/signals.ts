/** Traffic lights of the open city (pure): two axes per junction share one clock, with an all-red gap between them. */
import { net, type REdge, type RNode } from './roadnet';

export const SIGNAL_CYCLE = 24;
const GREEN = 10;

/** Which axis (0 or 1) an arm belongs to: the junction's first real street defines axis 0. */
export function armAxis(n: RNode, e: REdge): 0 | 1 {
  const N = net();
  const dir = (x: REdge) => {
    const p = x.pts;
    return x.a === n.id
      ? { x: p[1]!.x - p[0]!.x, z: p[1]!.z - p[0]!.z }
      : { x: p[p.length - 2]!.x - p[p.length - 1]!.x, z: p[p.length - 2]!.z - p[p.length - 1]!.z };
  };
  const ref = n.edges.map((id) => N.edges[id]!).find((x) => x.cls !== 'local' && !x.ring) ?? N.edges[n.edges[0]!]!;
  const r = dir(ref),
    d = dir(e);
  const c = (r.x * d.x + r.z * d.z) / (Math.hypot(r.x, r.z) * Math.hypot(d.x, d.z) || 1);
  return Math.abs(c) > 0.7 ? 0 : 1;
}

/** Is this axis green at clock time t (seconds)? */
export function axisGreen(t: number, axis: 0 | 1): boolean {
  const k = ((t % SIGNAL_CYCLE) + SIGNAL_CYCLE) % SIGNAL_CYCLE;
  return axis === 0 ? k < GREEN : k >= 12 && k < 12 + GREEN;
}

/** Junctions with lights: where at least two real streets (not local lanes) cross. */
export function signalNodes(): RNode[] {
  const N = net();
  return N.nodes.filter((n) => {
    if (n.edges.length < 3) return false;
    const big = n.edges.filter((id) => N.edges[id]!.cls !== 'local' && !N.edges[id]!.ring && !N.edges[id]!.oneway);
    return big.length >= 3 || (big.length >= 2 && n.edges.length >= 4);
  });
}
