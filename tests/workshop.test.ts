import { describe, it, expect } from 'vitest';
import {
  MAX_LEVEL,
  UPGRADE_IDS,
  WORKSHOPS,
  buyUpgrade,
  catalogFor,
  damageMul,
  emptyBook,
  emptyTuning,
  inWorkshop,
  patienceMul,
  payRepair,
  priceOf,
  repairCost,
  rideMul,
  sanitizeTuning,
  tipMul,
  tunedHandling,
  workshopSpots
} from '../src/game/logic/workshop';
import { VEHICLES, handlingOf } from '../src/game/logic/vehicles';
import { net } from '../src/game/logic/roadnet';

describe('upgrade effects reach the handling presets', () => {
  it('an untuned vehicle keeps its preset exactly', () => {
    for (const v of Object.keys(VEHICLES) as (keyof typeof VEHICLES)[])
      expect(tunedHandling(v, emptyTuning())).toEqual(handlingOf(v));
  });
  it('engine raises top speed, accel raises acceleration, brakes raise brake and grip', () => {
    const h0 = handlingOf('tuktuk');
    const e = tunedHandling('tuktuk', { ...emptyTuning(), engine: 3 });
    expect(e.top).toBeCloseTo(h0.top * 1.15, 6);
    expect(e.accel).toBe(h0.accel);
    const a = tunedHandling('tuktuk', { ...emptyTuning(), accel: 2 });
    expect(a.accel).toBeCloseTo(h0.accel * 1.12, 6);
    const b = tunedHandling('tuktuk', { ...emptyTuning(), brakes: 5 });
    expect(b.brake).toBeCloseTo(h0.brake * 1.35, 6);
    expect(b.grip).toBeCloseTo(h0.grip * 1.15, 6);
  });
  it('the special part is vehicle specific: the tuk-tuk steers better, the microbus rides softer', () => {
    const t = { ...emptyTuning(), special: 5 };
    expect(tunedHandling('tuktuk', t).steer).toBeCloseTo(handlingOf('tuktuk').steer * 1.2, 6);
    expect(tunedHandling('microbus', t).steer).toBe(handlingOf('microbus').steer);
    expect(rideMul('microbus', t)).toBeCloseTo(0.5, 6);
    expect(rideMul('tuktuk', t)).toBe(1);
    expect(catalogFor('tuktuk')[5]!.name).not.toBe(catalogFor('microbus')[5]!.name);
  });
  it('armour and comfort shrink damage and patience loss and raise tips', () => {
    const t = { ...emptyTuning(), armor: 5, comfort: 5 };
    expect(damageMul(t)).toBeCloseTo(0.5, 6);
    expect(patienceMul(t)).toBeCloseTo(0.5, 6);
    expect(tipMul(t)).toBeCloseTo(1.3, 6);
    expect(damageMul(emptyTuning())).toBe(1);
  });
});

describe('prices and buying', () => {
  it('every level costs more than the one before, and the top has no price', () => {
    for (const v of ['tuktuk', 'microbus'] as const) {
      for (const id of UPGRADE_IDS) {
        let last = 0;
        for (let l = 0; l < MAX_LEVEL; l++) {
          const p = priceOf(v, id, l)!;
          expect(p).toBeGreaterThan(last);
          last = p;
        }
        expect(priceOf(v, id, MAX_LEVEL)).toBeNull();
      }
    }
    expect(priceOf('tuktuk', 'engine', 0)!).toBeLessThan(priceOf('microbus', 'engine', 0)!);
  });
  it('buying takes the money and raises one level; being broke or maxed buys nothing', () => {
    const t = emptyTuning();
    const p = priceOf('microbus', 'engine', 0)!;
    const r = buyUpgrade('microbus', t, 'engine', p + 5);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.wallet).toBe(5);
      expect(r.tuning.engine).toBe(1);
      expect(r.cost).toBe(p);
    }
    expect(t.engine).toBe(0);
    expect(buyUpgrade('microbus', t, 'engine', p - 1)).toEqual({ ok: false, reason: 'broke' });
    expect(buyUpgrade('microbus', { ...t, engine: MAX_LEVEL }, 'engine', 1e9)).toEqual({ ok: false, reason: 'max' });
  });
  it('repairs cost by the percent of damage, and a short wallet fixes only a part', () => {
    expect(repairCost('tuktuk', 0)).toBe(0);
    expect(repairCost('tuktuk', 40)).toBe(20);
    expect(repairCost('microbus', 100)).toBe(110);
    const full = payRepair('tuktuk', 40, 100);
    expect(full).toEqual({ fixed: 40, cost: 20, wallet: 80 });
    const part = payRepair('tuktuk', 40, 10);
    expect(part.fixed).toBe(20);
    expect(part.cost).toBe(10);
    expect(part.wallet).toBe(0);
    expect(payRepair('tuktuk', 40, 0).fixed).toBe(0);
    expect(payRepair('tuktuk', 0, 50)).toEqual({ fixed: 0, cost: 0, wallet: 50 });
  });
});

describe('saving', () => {
  it('round trips and clamps levels', () => {
    const b = emptyBook();
    b.tuktuk.engine = 3;
    b.microbus.special = 5;
    expect(sanitizeTuning(JSON.parse(JSON.stringify(b)))).toEqual(b);
    const bad = sanitizeTuning({ tuktuk: { engine: 99, accel: -4, brakes: 'x', armor: 2.7 }, junk: {} });
    expect(bad.tuktuk.engine).toBe(MAX_LEVEL);
    expect(bad.tuktuk.accel).toBe(0);
    expect(bad.tuktuk.brakes).toBe(0);
    expect(bad.tuktuk.armor).toBe(2);
    expect(sanitizeTuning(null)).toEqual(emptyBook());
  });
});

describe('the workshops on the map', () => {
  it('there are several, each on a road, away from the ranks side and from each other', () => {
    expect(WORKSHOPS.length).toBeGreaterThanOrEqual(5);
    const spots = workshopSpots();
    expect(spots).toHaveLength(WORKSHOPS.length);
    const N = net();
    for (const s of spots) {
      expect(N.onRoad(s.x, s.z, 0), s.shop.id).toBe(true);
      expect(N.onRoad(s.px, s.pz, 0), s.shop.id).toBe(false);
    }
    for (let i = 0; i < spots.length; i++)
      for (let j = i + 1; j < spots.length; j++)
        expect(Math.hypot(spots[i]!.x - spots[j]!.x, spots[i]!.z - spots[j]!.z)).toBeGreaterThan(200);
  });
  it('driving in slowly is entering; speeding past is not', () => {
    const s = workshopSpots()[0]!;
    expect(inWorkshop({ x: s.x + 3, z: s.z, speed: 2 }, s)).toBe(true);
    expect(inWorkshop({ x: s.x + 3, z: s.z, speed: 15 }, s)).toBe(false);
    expect(inWorkshop({ x: s.x + 60, z: s.z, speed: 1 }, s)).toBe(false);
  });
});
