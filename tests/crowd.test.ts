import { describe, it, expect } from 'vitest';
import {
  CROWD_COUNTS,
  CROWD_RADIUS,
  LIGHT_CROSS,
  OLD_CROWD,
  avenueSegments,
  crowdTotal,
  planCrowd,
  type CrowdQuality,
  type ShopSpot
} from '../src/game/logic/crowd';
import { CHATTER, ON_FOOT, VOICES } from '../src/game/config/barks';
import { districtAt } from '../src/game/logic/districts';

const names = ['صيدلية', 'مخبز', 'كافيه', 'سوبر ماركت', 'مطعم', 'ملابس', 'موبايلات', 'حلويات', 'بنك', 'مكتبة'];
const shops: ShopSpot[] = [];
for (const side of [-1, 1])
  for (let z = -96, n = 0; z <= 232; z += 9, n++)
    shops.push({ x: side * 8.25, z, side, name: names[n % names.length]! });
const Qs: CrowdQuality[] = ['low', 'medium', 'high'];

describe('crowd size per preset', () => {
  it('Low stays light, High is the busiest, and every preset has 2-3x the old crowd', () => {
    expect(crowdTotal('low')).toBeLessThan(crowdTotal('medium'));
    expect(crowdTotal('medium')).toBeLessThan(crowdTotal('high'));
    for (const q of Qs) {
      expect(crowdTotal(q) / OLD_CROWD[q], q).toBeGreaterThanOrEqual(2);
      expect(crowdTotal(q) / OLD_CROWD[q], q).toBeLessThanOrEqual(3);
    }
    expect(crowdTotal('low')).toBeLessThanOrEqual(56);
  });
  it('the plan holds exactly the people the table says (groups may round up to a whole group)', () => {
    for (const q of Qs) {
      const plan = planCrowd(q, shops, 240.6);
      const want = crowdTotal(q);
      expect(plan.people.length, q).toBeGreaterThanOrEqual(want);
      expect(plan.people.length, q).toBeLessThanOrEqual(want + 1);
    }
  });
  it('light presets draw a smaller radius', () => {
    expect(CROWD_RADIUS.low).toBeLessThan(CROWD_RADIUS.medium);
    expect(CROWD_RADIUS.medium).toBeLessThan(CROWD_RADIUS.high);
  });
  it('every kind of street life is present on every preset', () => {
    for (const q of Qs) for (const [k, v] of Object.entries(CROWD_COUNTS[q])) expect(v, `${q}:${k}`).toBeGreaterThan(0);
  });
});

describe('the plan', () => {
  const plan = planCrowd('high', shops, 240.6);
  const kinds = (k: string) => plan.people.filter((p) => p.kind === k);

  it('is deterministic', () => {
    expect(planCrowd('high', shops, 240.6)).toEqual(plan);
  });
  it('is varied: roles, women, kids, elders, vendors, shopkeepers, ahwa', () => {
    const roles = new Set(plan.people.map((p) => p.role));
    for (const r of ['pedestrian', 'woman', 'kid', 'elder', 'student', 'vendor', 'shopkeeper', 'ahwa'] as const)
      expect(roles.has(r), r).toBe(true);
    for (const p of plan.people) {
      expect(ON_FOOT.includes(p.role), p.role).toBe(true);
      expect(VOICES[p.role]).toBeDefined();
    }
    expect(plan.people.some((p) => p.female)).toBe(true);
    expect(new Set(plan.people.map((p) => p.top)).size).toBeGreaterThan(6);
  });
  it('kids are small and elders are slow', () => {
    for (const p of plan.people) {
      if (p.role === 'kid') expect(p.scale).toBeLessThan(0.8);
      if (p.role === 'elder' && p.kind === 'walk') expect(p.speed).toBeLessThan(0.8);
    }
  });
  it('avenue walkers keep to the pavements, between the cross streets', () => {
    const segs = avenueSegments();
    for (const p of kinds('walk')) {
      expect(Math.abs(p.x)).toBeGreaterThanOrEqual(5.2);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(7.4);
      expect(
        segs.some((s) => p.z >= s.a && p.z <= s.b),
        `z=${p.z}`
      ).toBe(true);
    }
  });
  it('nobody is placed inside a building or in the carriageway (except crossers)', () => {
    for (const p of plan.people) {
      if (p.kind === 'cross' || p.kind === 'side' || p.kind === 'promenade') continue;
      expect(Math.abs(p.x), `${p.kind}`).toBeGreaterThanOrEqual(4.9);
      expect(Math.abs(p.x), `${p.kind}`).toBeLessThanOrEqual(8.2);
    }
  });
  it('chatting groups stand in twos and threes and have a chatter kind', () => {
    const groups = new Map<number, number>();
    for (const p of kinds('group')) {
      groups.set(p.group, (groups.get(p.group) ?? 0) + 1);
      expect(CHATTER[p.chat!], p.chat ?? '').toBeDefined();
    }
    for (const n of groups.values()) expect(n === 2 || n === 3).toBe(true);
  });
  it('shopkeepers stand at the doors of real shops, with that shop’s sign', () => {
    for (const p of kinds('shop')) {
      const s = shops.find((x) => x.name === p.shop && Math.abs(x.z - p.z) < 1.1 && x.side === Math.sign(p.x));
      expect(s, `${p.shop} z=${p.z}`).toBeDefined();
      expect(Math.sign(p.x)).toBe(s!.side);
    }
  });
  it('people waiting to cross are at the lit junctions, on the kerb', () => {
    for (const p of kinds('cross')) {
      expect(Math.abs(Math.abs(p.x) - 5.35)).toBeLessThan(0.01);
      expect(LIGHT_CROSS.some((c) => Math.abs(p.z - c) < 6.5 && Math.abs(p.z - c) > 4.5)).toBe(true);
      expect(p.axis).toBe('x');
    }
  });
  it('ahwa tables have customers, vendors have carts', () => {
    expect(plan.props.filter((p) => p.kind === 'table').length).toBeGreaterThanOrEqual(3);
    expect(plan.props.filter((p) => p.kind === 'cart').length).toBe(kinds('vendor').length);
  });
  it('the Nile promenade has walkers on the corniche', () => {
    for (const p of kinds('promenade')) expect(p.z).toBeGreaterThan(240.6);
  });
  it('Shubra and Downtown are the busiest stretches of pavement', () => {
    const perMetre = (d: string) => {
      const segs = avenueSegments().filter((s) => s.d === d);
      const len = segs.reduce((a, s) => a + (s.b - s.a), 0);
      const n = kinds('walk').filter((p) => districtAt(p.z) === d).length;
      return n / len;
    };
    expect(perMetre('port')).toBeGreaterThan(perMetre('suburb'));
    expect(perMetre('downtown')).toBeGreaterThan(perMetre('corniche'));
    expect(perMetre('port')).toBeGreaterThan(perMetre('corniche'));
  });
});
