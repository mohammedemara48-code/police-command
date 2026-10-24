/** The corner radar: the streets and the river around the officer, drawn from the same network the world is built from. */
import { net, RIVER } from '../logic/roadnet';

export interface Dot {
  x: number;
  z: number;
  c: string;
  r: number;
  /** a wrench badge (workshop) instead of a plain dot */
  k?: 'wrench';
}

/** A small wrench in a round badge, drawn as vector shapes so it never depends on an emoji font. */
export function drawWrench(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ring = '#ffffff') {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#ff9f1a';
  ctx.strokeStyle = ring;
  ctx.lineWidth = Math.max(1.5, r * 0.18);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.rotate(-Math.PI / 4);
  ctx.strokeStyle = '#1b1204';
  ctx.fillStyle = '#1b1204';
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 0.28;
  ctx.beginPath();
  ctx.moveTo(0, r * 0.62);
  ctx.lineTo(0, -r * 0.1);
  ctx.stroke();
  // the open jaw
  ctx.lineWidth = r * 0.26;
  ctx.beginPath();
  ctx.arc(0, -r * 0.34, r * 0.3, Math.PI * 0.85, Math.PI * 2.15, false);
  ctx.stroke();
  ctx.restore();
}

/** Metres from the centre to the edge of the radar. */
export const RADAR_R = 170;

const WIDTH = { arterial: 4.2, collector: 3.2, local: 2.2 } as const;
const COLOR = { arterial: '#aab6c6', collector: '#8794a6', local: '#667386' } as const;

export function drawMiniMap(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cx: number,
  cz: number,
  dots: Dot[],
  route?: readonly { x: number; z: number }[]
) {
  const k = Math.min(w, h) / 2 / RADAR_R;
  const sx = (x: number) => w / 2 + (x - cx) * k;
  const sz = (z: number) => h / 2 + (z - cz) * k;
  ctx.save();
  ctx.fillStyle = 'rgba(8,14,22,0.88)';
  ctx.fillRect(0, 0, w, h);
  // the river, with its islands left dry
  const poly = (pts: { x: number; z: number }[]) => {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(sx(p.x), sz(p.z)) : ctx.moveTo(sx(p.x), sz(p.z))));
    ctx.closePath();
  };
  const b = RIVER.box;
  if (cx > b.x0 - RADAR_R && cx < b.x1 + RADAR_R && cz > b.z0 - RADAR_R && cz < b.z1 + RADAR_R) {
    ctx.fillStyle = '#2b78c2';
    poly(RIVER.outline);
    ctx.fill();
    ctx.fillStyle = '#1a2a22';
    for (const isl of RIVER.islands) {
      poly(isl);
      ctx.fill();
    }
  }
  const N = net();
  const r = RADAR_R + 40;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const pass of ['local', 'collector', 'arterial'] as const) {
    ctx.strokeStyle = COLOR[pass];
    ctx.lineWidth = WIDTH[pass] * k * 2.2;
    ctx.beginPath();
    for (const e of N.edges) {
      if (e.cls !== pass) continue;
      const m = e.pts[Math.floor(e.pts.length / 2)]!;
      if (Math.abs(m.x - cx) > r + e.len * 0.5 || Math.abs(m.z - cz) > r + e.len * 0.5) continue;
      e.pts.forEach((p, i) => (i ? ctx.lineTo(sx(p.x), sz(p.z)) : ctx.moveTo(sx(p.x), sz(p.z))));
    }
    ctx.stroke();
  }
  // the route to the objective, along the streets
  if (route && route.length) {
    ctx.strokeStyle = 'rgba(61,165,255,0.95)';
    ctx.lineWidth = Math.max(2, 3.2 * k * 2);
    ctx.beginPath();
    ctx.moveTo(w / 2, h / 2);
    for (const p of route) ctx.lineTo(sx(p.x), sz(p.z));
    ctx.stroke();
  }
  // names of the main streets in view: one label per street, along the road, upright
  ctx.font = `bold ${Math.round(Math.max(8, w / 18))}px Cairo, Tahoma, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const named = new Set<string>();
  const boxes: [number, number, number, number][] = [];
  const near = N.edges
    .filter((e) => e.cls !== 'local' && !e.ring && e.len > 50 && e.name)
    .map((e) => ({ e, m: e.pts[Math.floor(e.pts.length / 2)]! }))
    .filter(({ m }) => Math.abs(m.x - cx) < RADAR_R * 0.8 && Math.abs(m.z - cz) < RADAR_R * 0.8)
    .sort((a, b) => (a.e.cls === b.e.cls ? 0 : a.e.cls === 'arterial' ? -1 : 1));
  for (const { e, m } of near) {
    if (named.has(e.name)) continue;
    const i = Math.floor(e.pts.length / 2);
    const a = e.pts[Math.max(0, i - 1)]!,
      bb = e.pts[Math.min(e.pts.length - 1, i + 1)]!;
    let ang = Math.atan2(sz(bb.z) - sz(a.z), sx(bb.x) - sx(a.x));
    if (ang > Math.PI / 2) ang -= Math.PI;
    if (ang < -Math.PI / 2) ang += Math.PI;
    const x = sx(m.x),
      y = sz(m.z);
    const tw = ctx.measureText(e.name).width / 2 + 2;
    if (boxes.some(([bx, by, bw]) => Math.abs(bx - x) < bw + tw && Math.abs(by - y) < 12)) continue;
    boxes.push([x, y, tw, 0]);
    named.add(e.name);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(8,14,22,0.9)';
    ctx.strokeText(e.name, 0, 0);
    ctx.fillStyle = '#e8f1ff';
    ctx.fillText(e.name, 0, 0);
    ctx.restore();
  }
  // markers that are beyond the radar sit on its rim, pointing the way
  for (const p of dots) {
    let x = sx(p.x),
      y = sz(p.z);
    const dx = x - w / 2,
      dy = y - h / 2;
    const d = Math.hypot(dx, dy);
    const rim = Math.min(w, h) / 2 - 6;
    if (d > rim) {
      if (p.r < 4 || p.k) continue;
      x = w / 2 + (dx / d) * rim;
      y = h / 2 + (dy / d) * rim;
    }
    if (p.k === 'wrench') {
      drawWrench(ctx, x, y, p.r);
      continue;
    }
    ctx.fillStyle = p.c;
    ctx.beginPath();
    ctx.arc(x, y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  return { sx, sz };
}
