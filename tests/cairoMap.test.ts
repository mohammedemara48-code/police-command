import { describe, expect, it } from 'vitest';
import {
  BOUNDS,
  LINES,
  NILE_EAST,
  NILE_WEST,
  PLACES,
  playAreas,
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
import { STREETS, toWorld } from '../src/game/logic/cairo';
import { net } from '../src/game/logic/roadnet';

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

  it('has an area for every playable district, each sitting on a real street of the network', () => {
    for (const id of Object.keys(DISTRICT_STYLES)) expect(playAreas().some((a) => a.id === id)).toBe(true);
    for (const a of playAreas()) {
      const w = toWorld(a.at);
      expect(net().onRoad(w.x, w.z, 1)).toBe(true);
    }
  });

  it('draws every hand-drawn game street, so the map and the world cannot disagree', () => {
    expect(LINES.length).toBe(STREETS.length);
    expect(LINES.filter((l) => l.kind === 'bridge').length).toBeGreaterThanOrEqual(6);
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
  it('puts the world origin on Tahrir Square and keeps north up', () => {
    const o = gameToMap(0, 0);
    expect(Math.hypot(o.x, o.y)).toBeLessThan(1e-9);
    expect(gameToMap(0, -100).y).toBeGreaterThan(0);
    expect(gameToMap(100, 0).x).toBeGreaterThan(0);
  });

  it('is a scaled copy of the world: 1 world metre is 5 real metres', () => {
    const p = gameToMap(100, 0);
    expect(p.x * 1000).toBeCloseTo(500, -1);
  });

  it('keeps every point of the playable world on the map', () => {
    for (const n of net().nodes) expect(inBounds(gameToMap(n.x, n.z))).toBe(true);
  });

  it('points the arrow where the officer faces and turns it left with positive yaw', () => {
    // yaw 0 faces south (+z), which is down on the map
    expect(mapHeading(0)).toBeCloseTo(-Math.PI / 2);
    // turning left from facing south means facing east: counter-clockwise on the map is +pi/2
    expect(mapHeading(Math.PI / 2)).toBeCloseTo(0);
    expect(mapHeading(Math.PI)).toBeCloseTo(Math.PI / 2);
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
