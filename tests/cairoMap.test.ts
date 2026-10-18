import { describe, expect, it } from 'vitest';
import {
  BOUNDS,
  LINES,
  NILE_EAST,
  NILE_WEST,
  PLACES,
  PLAY_AREAS,
  areaCentre,
  clampView,
  fitView,
  gameToMap,
  mapHeading,
  project,
  toKm,
  toScreen,
  zoomAt
} from '../src/game/logic/cairoMap';
import { DISTRICT_STYLES } from '../src/game/logic/districts';

const inBounds = (p: { x: number; y: number }) =>
  p.x >= BOUNDS.w && p.x <= BOUNDS.e && p.y >= BOUNDS.s && p.y <= BOUNDS.n;

describe('cairo map data', () => {
  it('projects Tahrir Square to the origin and keeps north up and east right', () => {
    const o = project([31.2357, 30.0444]);
    expect(Math.hypot(o.x, o.y)).toBeLessThan(1e-9);
    expect(project([31.2457, 30.0444]).x).toBeGreaterThan(0);
    expect(project([31.2357, 30.0544]).y).toBeGreaterThan(0);
  });

  it('puts the districts where they really are', () => {
    const c = (id: Parameters<typeof areaCentre>[0]) => areaCentre(id);
    // Haram is far south-west of the centre; Shubra is north-east of Tahrir; Dokki is across the Nile to the west
    expect(c('suburb').x).toBeLessThan(-4);
    expect(c('suburb').y).toBeLessThan(-2);
    expect(c('port').y).toBeGreaterThan(c('downtown').y + 1.5);
    expect(c('corniche').x).toBeLessThan(c('downtown').x - 1);
    // the Nile runs between Dokki and Downtown
    const nileX = (y: number) => {
      const e = NILE_EAST.map(project);
      const w = NILE_WEST.map(project);
      const at = (pts: { x: number; y: number }[]) => {
        for (let i = 1; i < pts.length; i++)
          if (pts[i - 1]!.y <= y && pts[i]!.y >= y) {
            const t = (y - pts[i - 1]!.y) / (pts[i]!.y - pts[i - 1]!.y);
            return pts[i - 1]!.x + t * (pts[i]!.x - pts[i - 1]!.x);
          }
        return NaN;
      };
      return [at(w), at(e)];
    };
    const [wBank, eBank] = nileX(c('downtown').y);
    expect(c('corniche').x).toBeLessThan(wBank!);
    expect(c('downtown').x).toBeGreaterThan(eBank!);
  });

  it('has an area for every playable district and covers the avenue without gaps', () => {
    for (const id of Object.keys(DISTRICT_STYLES)) expect(PLAY_AREAS.some((a) => a.id === id)).toBe(true);
    for (let i = 1; i < PLAY_AREAS.length; i++) expect(PLAY_AREAS[i]!.z0).toBe(PLAY_AREAS[i - 1]!.z1);
    expect(PLAY_AREAS[0]!.z0).toBeLessThanOrEqual(-100);
  });

  it('keeps every shape and label inside the map box', () => {
    for (const l of LINES) for (const p of l.pts) expect(inBounds(project(p))).toBe(true);
    for (const p of PLACES) expect(inBounds(project(p.at))).toBe(true);
    for (const p of [...NILE_EAST, ...NILE_WEST]) expect(inBounds(project(p))).toBe(true);
  });

  it('names the streets and places in Arabic', () => {
    const arabic = /[\u0600-\u06ff]/;
    for (const l of LINES) expect(l.name).toMatch(arabic);
    for (const p of PLACES) expect(p.name).toMatch(arabic);
    const names = LINES.map((l) => l.name).join(' ');
    for (const need of [
      'شارع الهرم',
      'شارع فيصل',
      'الطريق الدائري',
      'شارع شبرا',
      'كوبري ٦ أكتوبر',
      'كوبري قصر النيل',
      'شارع طلعت حرب'
    ])
      expect(names).toContain(need);
    const places = PLACES.map((p) => p.name).join(' ');
    for (const need of ['ميدان التحرير', 'ميدان المساحة', 'برج القاهرة', 'الأهرامات', 'الزمالك'])
      expect(places).toContain(need);
  });

  it('draws the Nile with the east bank to the east of the west bank', () => {
    expect(NILE_EAST.length).toBe(NILE_WEST.length);
    NILE_EAST.forEach((e, i) => expect(e[0]).toBeGreaterThan(NILE_WEST[i]![0]));
  });
});

describe('game to map', () => {
  it('moves continuously inside a district and ends on the next district start', () => {
    for (const a of PLAY_AREAS) {
      const p = gameToMap(0, a.z0);
      const q = gameToMap(0, a.z1 - 0.001);
      const start = project(a.a),
        end = project(a.b);
      expect(Math.hypot(p.x - start.x, p.y - start.y)).toBeLessThan(0.01);
      expect(Math.hypot(q.x - end.x, q.y - end.y)).toBeLessThan(0.01);
    }
  });

  it('clamps outside the playable range and keeps it on the map', () => {
    expect(inBounds(gameToMap(0, -500))).toBe(true);
    expect(inBounds(gameToMap(0, 5000))).toBe(true);
    for (let z = -100; z <= 920; z += 20) expect(inBounds(gameToMap(40, z))).toBe(true);
  });

  it('points the arrow along the street and turns it left with positive yaw', () => {
    const base = mapHeading(0, 0);
    expect(mapHeading(0, Math.PI / 2) - base).toBeCloseTo(Math.PI / 2);
    expect(mapHeading(0, Math.PI) - base).toBeCloseTo(Math.PI);
    const a = project(PLAY_AREAS[1]!.a),
      b = project(PLAY_AREAS[1]!.b);
    expect(base).toBeCloseTo(Math.atan2(b.y - a.y, b.x - a.x));
  });
});

describe('map view', () => {
  const W = 600,
    H = 400;
  it('fits the whole map and round-trips screen and km', () => {
    const v = fitView(W, H);
    const s = toScreen(v, W, H, { x: BOUNDS.w, y: BOUNDS.s });
    expect(s.x).toBeGreaterThanOrEqual(0);
    expect(s.y).toBeLessThanOrEqual(H);
    const k = toKm(v, W, H, 123, 77);
    const back = toScreen(v, W, H, k);
    expect(back.x).toBeCloseTo(123);
    expect(back.y).toBeCloseTo(77);
  });

  it('zooms about the pointer and stays within limits', () => {
    const v = fitView(W, H);
    const before = toKm(v, W, H, 400, 100);
    const z = zoomAt(v, W, H, 400, 100, 2);
    const after = toKm(z, W, H, 400, 100);
    expect(after.x).toBeCloseTo(before.x, 1);
    expect(z.scale).toBeCloseTo(v.scale * 2);
    expect(zoomAt(v, W, H, 0, 0, 0.1).scale).toBeCloseTo(v.scale);
    expect(clampView({ ...v, scale: v.scale * 1000 }, W, H).scale).toBeCloseTo(v.scale * 24);
    expect(clampView({ ...v, cx: 1e6, cy: -1e6 }, W, H).cx).toBe(BOUNDS.e);
  });
});
