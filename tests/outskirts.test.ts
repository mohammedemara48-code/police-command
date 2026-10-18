import { describe, it, expect } from 'vitest';
import {
  BLOCK,
  BOULEVARD,
  CELL,
  GRID,
  PLATEAU,
  REACH,
  buildable,
  distToGrid,
  planOutskirts
} from '../src/game/logic/outskirts';
import { CROWD_DRAW_CAP, CROWD_RADIUS } from '../src/game/logic/crowd';

const Qs = ['low', 'medium', 'high'] as const;

describe('outskirts plan', () => {
  it('is deterministic', () => {
    expect(planOutskirts('high')).toEqual(planOutskirts('high'));
  });
  it('the city carries on around the grid: plenty of blocks, plots and palms on every preset', () => {
    for (const q of Qs) {
      const p = planOutskirts(q);
      expect(p.cells.length, q).toBeGreaterThan(80);
      expect(p.plots.length, q).toBeGreaterThan(200);
      expect(p.palms.length, q).toBeGreaterThan(40);
      expect(p.skyline.length, q).toBeGreaterThan(40);
    }
  });
  it('Low reaches less far than High and builds less', () => {
    const lo = planOutskirts('low'),
      hi = planOutskirts('high');
    expect(lo.cells.length).toBeLessThan(hi.cells.length);
    expect(lo.plots.length).toBeLessThan(hi.plots.length);
    expect(REACH.low).toBeLessThan(REACH.high);
    expect(CROWD_DRAW_CAP.low).toBeLessThan(CROWD_DRAW_CAP.high);
    expect(CROWD_RADIUS.low).toBeLessThan(CROWD_RADIUS.high);
  });
  it('never builds on the playable grid, the boulevard, the Nile bank or the open plateau', () => {
    for (const q of Qs) {
      const p = planOutskirts(q);
      for (const c of p.cells) {
        expect(buildable(c.x, c.z, CELL / 2), `${c.x},${c.z}`).toBe(true);
        expect(c.z + CELL / 2).toBeLessThanOrEqual(236);
      }
      for (const b of p.plots) {
        const inGrid =
          b.x + b.w / 2 > GRID.x0 && b.x - b.w / 2 < GRID.x1 && b.z + b.d / 2 > GRID.z0 && b.z - b.d / 2 < GRID.z1;
        expect(inGrid, `${b.x},${b.z}`).toBe(false);
        // clear of the boulevard carriageway and pavements
        const onBoulevard =
          Math.abs(b.x) - b.w / 2 < BOULEVARD.half + 3 && b.z < BOULEVARD.zBarrier && b.z > BOULEVARD.zWall;
        expect(onBoulevard, `${b.x},${b.z}`).toBe(false);
        // open ground in front of the pyramids
        const onPlateau =
          b.z - b.d / 2 < PLATEAU.z0 && b.z + b.d / 2 > PLATEAU.z1 && Math.abs(b.x) - b.w / 2 < PLATEAU.halfX;
        expect(onPlateau, `${b.x},${b.z}`).toBe(false);
      }
    }
  });
  it('plots stay inside their block', () => {
    const p = planOutskirts('high');
    for (const b of p.plots) {
      expect(b.w).toBeGreaterThan(5);
      expect(b.w).toBeLessThan(BLOCK / 2);
      expect(b.d).toBeLessThan(BLOCK / 2);
    }
  });
  it('is lower-rise near the grid and taller further out, with a few towers', () => {
    const p = planOutskirts('high');
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const near = p.plots.filter((b) => distToGrid(b.x, b.z) < 80 && !b.tower).map((b) => b.floors);
    const far = p.plots.filter((b) => distToGrid(b.x, b.z) > 250 && !b.tower).map((b) => b.floors);
    expect(avg(far)).toBeGreaterThan(avg(near));
    expect(p.plots.some((b) => b.tower)).toBe(true);
    expect(p.plots.filter((b) => b.tower).length).toBeLessThan(p.plots.length * 0.1);
  });
  it('mixes block, low housing, lots and groves, and the facade variety stays small', () => {
    const p = planOutskirts('high');
    const uses = new Set(p.cells.map((c) => c.use));
    for (const u of ['built', 'low', 'lot', 'green']) expect(uses.has(u as 'built'), u).toBe(true);
    const mats = new Set(p.plots.map((b) => `${b.style}:${b.tint}`));
    expect(mats.size).toBeLessThan(60);
  });
  it('the skyline never stands across the plateau or in the Nile', () => {
    const p = planOutskirts('high');
    for (const s of p.skyline) {
      expect(s.z).toBeLessThanOrEqual(225);
      expect(s.z < PLATEAU.z0 + 60 && Math.abs(s.x) < PLATEAU.halfX + 220).toBe(false);
    }
  });
});
