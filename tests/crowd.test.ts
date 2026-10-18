import { describe, it, expect } from 'vitest';
import {
  CROWD_COUNTS,
  CROWD_RADIUS,
  DISTRICT_DENSITY,
  OLD_CROWD,
  crossings,
  crowdTotal,
  lanePose,
  nextLane,
  pickCrossing,
  pickLane,
  planCrowd,
  type CrowdQuality
} from '../src/game/logic/crowd';
import { CHATTER, ON_FOOT, VOICES } from '../src/game/config/barks';
import { inRiver, net, rng } from '../src/game/logic/roadnet';
import { lots } from '../src/game/logic/lots';
import { signalNodes } from '../src/game/logic/signals';
import { PAVEMENT } from '../src/game/logic/cairo';

const Qs: CrowdQuality[] = ['low', 'medium', 'high'];
const tahrir = { x: 0, z: 0 };

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
      const plan = planCrowd(q);
      const want = crowdTotal(q);
      expect(plan.length, q).toBeGreaterThanOrEqual(want);
      expect(plan.length, q).toBeLessThanOrEqual(want + 1);
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
  const plan = planCrowd('high');
  const kinds = (k: string) => plan.filter((p) => p.kind === k);

  it('is deterministic', () => {
    expect(planCrowd('high')).toEqual(plan);
  });
  it('is varied: roles, women, kids, elders, vendors, shopkeepers, ahwa', () => {
    const roles = new Set(plan.map((p) => p.role));
    for (const r of ['pedestrian', 'woman', 'kid', 'elder', 'student', 'vendor', 'shopkeeper', 'ahwa'] as const)
      expect(roles.has(r), r).toBe(true);
    for (const p of plan) {
      expect(ON_FOOT.includes(p.role), p.role).toBe(true);
      expect(VOICES[p.role]).toBeDefined();
    }
    expect(plan.some((p) => p.female)).toBe(true);
    expect(new Set(plan.map((p) => p.top)).size).toBeGreaterThan(6);
  });
  it('kids are small and elders are slow', () => {
    for (const p of plan) {
      if (p.role === 'kid') expect(p.scale).toBeLessThan(0.8);
      if (p.role === 'elder' && p.kind === 'walk') expect(p.speed).toBeLessThan(0.8);
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
  it('ahwa customers sit in sets of up to three, one cart per vendor', () => {
    const sets = new Map<number, number>();
    for (const p of kinds('ahwa')) sets.set(p.set, (sets.get(p.set) ?? 0) + 1);
    expect(sets.size).toBeGreaterThanOrEqual(3);
    for (const n of sets.values()) expect(n).toBeLessThanOrEqual(3);
    expect(new Set(kinds('vendor').map((p) => p.set)).size).toBe(kinds('vendor').length);
  });
});

describe('placing people on the open street network', () => {
  const N = net();
  it('pavement walkers stand on the pavement, never in a building, the river or the carriageway', () => {
    const r = rng(3);
    let n = 0;
    for (const at of [tahrir, { x: -1500, z: -600 }, { x: -300, z: 700 }, { x: 150, z: -900 }, { x: -900, z: 200 }]) {
      for (let i = 0; i < 120; i++) {
        const lane = pickLane(at, r, { rMin: 8, rMax: 60 });
        if (!lane) continue;
        n++;
        const p = lanePose(lane);
        expect(N.onRoad(p.x, p.z, 0.1)).toBe(false);
        expect(lots().blocked(p.x, p.z, 0.3)).toBe(false);
        expect(inRiver(p.x, p.z)).toBe(false);
        const e = N.edges[lane.e]!;
        expect(N.nearest(p.x, p.z, 30)!.d).toBeLessThan(e.half + PAVEMENT + 6);
        const d = Math.hypot(p.x - at.x, p.z - at.z);
        expect(d).toBeGreaterThanOrEqual(8);
        expect(d).toBeLessThanOrEqual(60);
      }
    }
    expect(n).toBeGreaterThan(300);
  });
  it('walkers carry on through junctions: the next lane starts on a street leaving the same junction', () => {
    const r = rng(9);
    let n = 0;
    for (let i = 0; i < 200; i++) {
      const lane = pickLane(tahrir, r, { rMin: 5, rMax: 300 });
      if (!lane) continue;
      const e = N.edges[lane.e]!;
      lane.s = lane.dir > 0 ? e.len - 0.3 : 0.3;
      const nid = lane.dir > 0 ? e.b : e.a;
      const next = nextLane(lane, r);
      const ne = N.edges[next.e]!;
      expect(ne.a === nid || ne.b === nid).toBe(true);
      n++;
    }
    expect(n).toBeGreaterThan(100);
  });
  it('the promenade is on the corniche', () => {
    const r = rng(4);
    let n = 0;
    for (let i = 0; i < 60; i++) {
      const lane = pickLane({ x: -60, z: 200 }, r, { rMin: 0, rMax: 400, sid: 'corniche' });
      if (!lane) continue;
      n++;
      expect(N.edges[lane.e]!.sid.startsWith('corniche')).toBe(true);
    }
    expect(n).toBeGreaterThan(5);
  });
  it('people cross at zebras at the lit junctions, with room on both kerbs', () => {
    const sig = new Set(signalNodes().map((s) => s.id));
    const list = crossings(sig);
    expect(list.length).toBeGreaterThan(80);
    for (const z of list) expect(sig.has(z.node)).toBe(true);
    const pick = pickCrossing(tahrir, rng(2), list, 0, 400);
    expect(pick).not.toBeNull();
    for (const sgn of [-1, 1]) {
      const x = pick!.x + Math.cos(pick!.yaw) * sgn * (pick!.half + 1.2),
        z = pick!.z - Math.sin(pick!.yaw) * sgn * (pick!.half + 1.2);
      expect(inRiver(x, z)).toBe(false);
    }
  });
  it('Shubra and Downtown are busier than the Haram end', () => {
    expect(DISTRICT_DENSITY.port).toBeGreaterThan(DISTRICT_DENSITY.suburb);
    expect(DISTRICT_DENSITY.downtown).toBeGreaterThan(DISTRICT_DENSITY.corniche);
  });
});
