import { describe, expect, it } from 'vitest';
import { outfitFor } from '../src/game/logic/outfits';

describe('street outfits', () => {
  it('is stable per person', () => {
    expect(outfitFor({ id: 5, role: 'woman', female: true })).toEqual(
      outfitFor({ id: 5, role: 'woman', female: true })
    );
  });
  it('dresses a varied Cairo crowd', () => {
    const men = Array.from({ length: 400 }, (_, id) => outfitFor({ id, role: 'pedestrian', female: false }));
    const women = Array.from({ length: 400 }, (_, id) => outfitFor({ id, role: 'woman', female: true }));
    const elders = Array.from({ length: 200 }, (_, id) => outfitFor({ id, role: 'elder', female: false }));
    const robes = men.filter((o) => o.robe !== null).length / men.length;
    expect(robes).toBeGreaterThan(0.15);
    expect(robes).toBeLessThan(0.45);
    const hijab = women.filter((o) => o.hijab !== null).length / women.length;
    expect(hijab).toBeGreaterThan(0.6);
    expect(hijab).toBeLessThan(0.95);
    expect(women.some((o) => o.robe !== null)).toBe(true);
    expect(women.some((o) => o.robe === null && o.hijab !== null)).toBe(true);
    expect(elders.filter((o) => o.cane).length).toBeGreaterThan(100);
    expect(men.every((o) => o.hijab === null)).toBe(true);
    expect(new Set(men.map((o) => o.skin)).size).toBeGreaterThan(4);
    const students = Array.from({ length: 50 }, (_, id) => outfitFor({ id, role: 'student', female: id % 2 === 0 }));
    expect(students.every((o) => o.backpack !== null)).toBe(true);
  });
});
