import { describe, it, expect } from 'vitest';
import { routeAim, roadDistance } from '../src/game/logic/routeAim';
import {
  STOPS,
  stopSpots,
  baseFare,
  newJob,
  boardRider,
  boardAll,
  tickJob,
  dropAt,
  atSpot,
  payout,
  seatsFree,
  seatsUsed,
  nextTarget,
  emptyQueues,
  seedQueues,
  restock,
  newWaiting,
  TARIFF,
  QUEUE_CAP,
  comfortOf,
  punctuality,
  addPayout,
  emptyEarnings,
  sanitizeBook,
  destinationFor,
  distBetween,
  MIN_TRIP,
  type Waiting,
  type Rider
} from '../src/game/logic/taxi';
import { findPath } from '../src/game/world/City';
import { VEHICLE_IDS, modeOf, featuresOf, FEATURES, SEATS } from '../src/game/logic/vehicles';
import { TALK, PERSONA_LOOK, CHAT_TOPICS, pickTalk, fill } from '../src/game/config/taxiTalk';

const rng =
  (seed = 1) =>
  () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
const W = (stop: string, to: string, size = 1, persona: Waiting['persona'] = 'calm'): Waiting => ({
  id: 1,
  stop,
  to,
  persona,
  size
});

describe('mode gating by vehicle', () => {
  it('the vehicle decides the mode', () => {
    expect(modeOf('police')).toBe('police');
    expect(modeOf('tuktuk')).toBe('taxi');
    expect(modeOf('microbus')).toBe('taxi');
    expect(modeOf('private')).toBe('free');
  });
  it('missions, radio and the police HUD run only in the police car', () => {
    for (const id of VEHICLE_IDS) {
      const f = featuresOf(id);
      expect(f.missions).toBe(id === 'police');
      expect(f.policeHud).toBe(id === 'police');
      expect(f.station).toBe(id === 'police');
      expect(f.taxi).toBe(id === 'tuktuk' || id === 'microbus');
    }
    expect(FEATURES.free).toEqual({ missions: false, policeHud: false, taxi: false, station: false });
  });
  it('seats: microbus carries six, tuk-tuk two', () => {
    expect(SEATS.microbus).toBe(6);
    expect(SEATS.tuktuk).toBe(2);
    expect(TARIFF.microbus.seats).toBe(6);
    expect(TARIFF.tuktuk.seats).toBe(2);
  });
});

describe('ranks', () => {
  const spots = stopSpots();
  it('every rank sits on the street network, with a kerb beside it', () => {
    expect(spots.length).toBe(STOPS.length);
    for (const s of spots) {
      expect(Number.isFinite(s.x + s.z + s.px + s.pz), s.stop.id).toBe(true);
      const d = Math.hypot(s.px - s.x, s.pz - s.z);
      expect(d).toBeGreaterThan(1.5);
      expect(d).toBeLessThan(12);
    }
  });
  it('the named ranks exist: Haram, Dokki, Tahrir, Shubra, Ramses', () => {
    for (const id of ['haram', 'dokki', 'tahrir', 'shubra', 'ramses'])
      expect(STOPS.some((s) => s.id === id)).toBe(true);
  });
  it('every pair of ranks can be driven between', () => {
    const a = spots[0]!;
    for (const b of spots.slice(1)) {
      const p = findPath(a.x, a.z, b.x, b.z);
      expect(p.length, `${a.stop.id}->${b.stop.id}`).toBeGreaterThan(0);
    }
  });
  it('trips are long enough to be worth a fare', () => {
    for (let i = 0; i < STOPS.length; i++) {
      const to = destinationFor(STOPS[i]!.id, rng(i + 3));
      expect(distBetween(STOPS[i]!.id, to)).toBeGreaterThanOrEqual(MIN_TRIP * 0.999);
    }
  });
});

describe('fares', () => {
  it('grow with distance and respect the minimum', () => {
    expect(baseFare('tuktuk', 0)).toBe(TARIFF.tuktuk.min);
    expect(baseFare('tuktuk', 10)).toBeGreaterThan(baseFare('tuktuk', 5));
    expect(baseFare('microbus', 10)).toBeLessThan(baseFare('tuktuk', 10));
    expect(baseFare('tuktuk', 7.3) * 2).toBe(Math.round(baseFare('tuktuk', 7.3) * 2));
  });
  it('a microbus is paid per seat, a tuk-tuk once per party', () => {
    const m = newJob('microbus');
    const a = boardRider(m, W('haram', 'dokki', 1))!;
    const b = newJob('tuktuk');
    const t1 = boardRider(b, W('haram', 'dokki', 1))!;
    const t2 = boardRider(newJob('tuktuk'), W('haram', 'dokki', 2))!;
    expect(a.fare).toBeCloseTo(baseFare('microbus', a.km), 5);
    expect(t2.fare).toBe(t1.fare);
  });
  it('smooth, on-time driving pays full fare plus a tip; crashes and late arrival pay less', () => {
    const base = boardRider(newJob('tuktuk'), W('haram', 'dokki', 1, 'generous'))!;
    const good = payout({ ...base, elapsed: base.expected * 0.9 });
    expect(good.comfort).toBe(1);
    expect(good.tip).toBeGreaterThan(0);
    expect(good.stars).toBe(5);
    const rough = payout({ ...base, elapsed: base.expected * 0.9, rough: 6, crashes: 1 });
    expect(rough.total).toBeLessThan(good.total);
    expect(rough.tip).toBeLessThan(good.tip);
    const late = payout({ ...base, elapsed: base.expected * 2 });
    expect(late.total).toBeLessThan(good.total);
    expect(late.onTime).toBe(false);
    expect(late.fare).toBeGreaterThan(0);
  });
  it('a cheap passenger pays less and never tips; a generous one tips most', () => {
    const j = newJob('tuktuk');
    const mk = (p: Waiting['persona']) => ({ ...boardRider(j, W('haram', 'dokki', 1, p))!, elapsed: 1 });
    j.riders = [];
    const cheap = payout(mk('cheap'));
    j.riders = [];
    const calm = payout(mk('calm'));
    j.riders = [];
    const gen = payout(mk('generous'));
    expect(cheap.tip).toBe(0);
    expect(cheap.fare).toBeLessThan(calm.fare);
    expect(gen.tip).toBeGreaterThan(calm.tip);
  });
  it('comfort and punctuality stay in range', () => {
    expect(comfortOf({ rough: 0, crashes: 0 })).toBe(1);
    expect(comfortOf({ rough: 100, crashes: 9 })).toBe(0);
    expect(punctuality({ elapsed: 5, expected: 10 })).toBe(1);
    expect(punctuality({ elapsed: 1000, expected: 10 })).toBe(0.6);
  });
});

describe('boarding and dropping', () => {
  it('needs to be at the rank and nearly stopped', () => {
    const s = stopSpots()[0]!;
    expect(atSpot({ x: s.x + 3, z: s.z, speed: 1 }, s)).toBe(true);
    expect(atSpot({ x: s.x + 3, z: s.z, speed: 9 }, s)).toBe(false);
    expect(atSpot({ x: s.x + 40, z: s.z, speed: 0 }, s)).toBe(false);
  });
  it('the tuk-tuk takes two seats at most; the microbus fills six and leaves the rest waiting', () => {
    const t = newJob('tuktuk');
    const r = boardAll(t, [W('haram', 'dokki', 2), W('haram', 'tahrir', 1)]);
    expect(r.boarded.length).toBe(1);
    expect(r.left.length).toBe(1);
    expect(seatsFree(t)).toBe(0);
    const m = newJob('microbus');
    const q = Array.from({ length: 8 }, (_, i) => W('haram', i % 2 ? 'dokki' : 'tahrir'));
    const rm = boardAll(m, q);
    expect(rm.boarded.length).toBe(6);
    expect(rm.left.length).toBe(2);
    expect(seatsUsed(m)).toBe(6);
  });
  it('microbus riders get out at their own stops and each pays per seat', () => {
    const m = newJob('microbus');
    boardAll(m, [W('haram', 'dokki'), W('haram', 'tahrir'), W('haram', 'dokki')]);
    const d = dropAt(m, 'dokki');
    expect(d.length).toBe(2);
    expect(m.riders.length).toBe(1);
    expect(d[0]!.total).toBeGreaterThan(0);
    expect(dropAt(m, 'dokki').length).toBe(0);
    expect(dropAt(m, 'tahrir').length).toBe(1);
    expect(m.riders.length).toBe(0);
  });
  it("the next target is a rider's stop first, else a rank with people waiting", () => {
    const q = emptyQueues();
    const j = newJob('microbus');
    expect(nextTarget(j, q, { x: 0, z: 0 })).toBeNull();
    q.ramses!.push(W('ramses', 'dokki'));
    expect(nextTarget(j, q, { x: 0, z: 0 })).toEqual({ stop: 'ramses', kind: 'pickup' });
    boardAll(j, [W('haram', 'shubra')]);
    expect(nextTarget(j, q, { x: 0, z: 0 })).toEqual({ stop: 'shubra', kind: 'drop' });
  });
});

describe('patience', () => {
  const rider = (): { j: ReturnType<typeof newJob>; r: Rider } => {
    const j = newJob('tuktuk');
    return { j, r: boardRider(j, W('haram', 'dokki'))! };
  };
  it('smooth driving on time keeps it full', () => {
    const { j, r } = rider();
    for (let t = 0; t < r.expected * 0.9; t += 0.5) tickJob(j, 0.5, { g: 2, hit: 0 });
    expect(r.patience).toBe(100);
  });
  it('running late wears it down until the passenger gets out', () => {
    const { j, r } = rider();
    let gone = 0;
    for (let t = 0; t < r.expected * 5 && !gone; t += 0.5) gone += tickJob(j, 0.5, { g: 2, hit: 0 }).length;
    expect(gone).toBe(1);
    expect(j.riders.length).toBe(0);
  });
  it('a rushing passenger runs out sooner than a calm one', () => {
    const run = (p: Waiting['persona']) => {
      const j = newJob('tuktuk');
      const r = boardRider(j, W('haram', 'dokki', 1, p))!;
      let t = 0;
      while (j.riders.length && t < 5000) {
        tickJob(j, 0.5, { g: 0, hit: 0 });
        t += 0.5;
      }
      return { t, r };
    };
    expect(run('rush').t).toBeLessThan(run('calm').t);
  });
  it('crashes and harsh driving cost patience and comfort', () => {
    const { j, r } = rider();
    tickJob(j, 0.1, { g: 12, hit: 0 });
    const afterRough = r.patience;
    expect(afterRough).toBeLessThan(100);
    expect(r.rough).toBeGreaterThan(0);
    tickJob(j, 0.1, { g: 1, hit: 8 });
    expect(r.crashes).toBe(1);
    expect(r.patience).toBeLessThan(afterRough);
    expect(tickJob(j, 0.1, { g: 1, hit: 2 }).length).toBe(0);
    expect(r.crashes).toBe(1);
  });
});

describe('ranks fill up over time', () => {
  it('seeding gives every rank someone, capped by the vehicle', () => {
    for (const v of ['tuktuk', 'microbus'] as const) {
      const q = emptyQueues();
      seedQueues(q, v, rng(5));
      for (const s of STOPS) {
        expect(q[s.id]!.length).toBeGreaterThanOrEqual(1);
        expect(q[s.id]!.length).toBeLessThanOrEqual(QUEUE_CAP[v]);
      }
    }
  });
  it('new passengers keep arriving but never past the cap, and never want to go nowhere', () => {
    const q = emptyQueues();
    const clock = { t: 0 };
    const r = rng(9);
    for (let i = 0; i < 600; i++) restock(q, 'tuktuk', clock, 1, r);
    for (const s of STOPS) {
      expect(q[s.id]!.length).toBeLessThanOrEqual(QUEUE_CAP.tuktuk);
      for (const w of q[s.id]!) expect(w.to).not.toBe(s.id);
    }
    expect(Object.values(q).flat().length).toBeGreaterThan(5);
    expect(newWaiting('haram', 'microbus', r).size).toBe(1);
  });
});

describe('earnings per vehicle', () => {
  it('add up and survive a bad save', () => {
    const j = newJob('tuktuk');
    const r = boardRider(j, W('haram', 'dokki', 2, 'generous'))!;
    const p = payout({ ...r, elapsed: 1 });
    const e = addPayout(emptyEarnings(), p);
    expect(e.total).toBe(p.total);
    expect(e.trips).toBe(1);
    expect(e.riders).toBe(2);
    expect(e.best).toBe(p.total);
    const book = sanitizeBook({
      tuktuk: { total: 'x', trips: 3.7, best: -4 },
      microbus: { total: 12, tips: 2 },
      boat: {}
    });
    expect(book.tuktuk.total).toBe(0);
    expect(book.tuktuk.trips).toBe(3);
    expect(book.tuktuk.best).toBe(0);
    expect(book.microbus.total).toBe(12);
    expect(Object.keys(book)).toEqual(['tuktuk', 'microbus']);
    expect(sanitizeBook(null).tuktuk.total).toBe(0);
  });
});

describe('passenger talk', () => {
  const all = Object.values(TALK).flat();
  it('has plenty of variants and no police talk', () => {
    expect(all.length).toBeGreaterThan(120);
    for (const k of Object.keys(TALK) as (keyof typeof TALK)[]) expect(TALK[k].length, k).toBeGreaterThanOrEqual(3);
    for (const l of all) expect(/شرط|ظاب|بلاغ|لاسلك|دورية|مباحث|عصاب|مجرم|سلاح/.test(l), l).toBe(false);
    expect(new Set(all).size).toBe(all.length);
  });
  it('is everyday speech: short, no formal fillers', () => {
    for (const l of all) {
      expect(l.length, l).toBeLessThanOrEqual(60);
      expect(/لقد|سوف|حضرتك|يرجى|عفواً|من فضلكم/.test(l), l).toBe(false);
    }
  });
  it('includes the stock phrases', () => {
    const t = all.join(' | ');
    expect(t).toContain('على جنب يا اسطى');
    expect(t).toContain('ميّة ميّة');
  });
  it('fills in the destination and never repeats a line twice in a row', () => {
    expect(fill('على {to} يا اسطى', { to: 'موقف الدقي' })).toBe('على الدقي يا اسطى');
    const last = new Map();
    const r = rng(2);
    let prev = '';
    for (let i = 0; i < 40; i++) {
      const l = pickTalk('crash', last, r);
      expect(l).not.toBe(prev);
      prev = l;
    }
  });
  it('every personality has a look and topics that exist', () => {
    for (const p of Object.keys(PERSONA_LOOK) as (keyof typeof PERSONA_LOOK)[]) {
      expect(PERSONA_LOOK[p].name.length).toBeGreaterThan(0);
      for (const t of CHAT_TOPICS[p]) expect(TALK[t]).toBeDefined();
    }
  });
});

describe('the objective arrow follows the road route', () => {
  const route = [
    { x: 0, z: 0 },
    { x: 0, z: 100 },
    { x: 100, z: 100 },
    { x: 100, z: 300 }
  ];
  const target = { x: 100, z: 300 };
  it('aims at a waypoint along the street, not straight at the destination', () => {
    const a = routeAim(route, { x: 0, z: 10 }, target);
    expect(a.x).toBe(0);
    expect(a.z).toBe(100);
  });
  it('goes round the corner as the car passes it', () => {
    const a = routeAim(route, { x: 0, z: 98 }, target);
    expect(a).toEqual({ x: 100, z: 100 });
  });
  it('points at the destination itself once it is close, or when there is no route', () => {
    expect(routeAim(route, { x: 100, z: 290 }, target)).toEqual(target);
    expect(routeAim([], { x: 0, z: 0 }, target)).toEqual(target);
  });
});

describe('distance by road', () => {
  const route = [
    { x: 0, z: 0 },
    { x: 0, z: 100 },
    { x: 100, z: 100 }
  ];
  it('follows the streets, never less than the straight line', () => {
    const d = roadDistance(route, { x: 0, z: 0 }, { x: 100, z: 100 });
    expect(d).toBeCloseTo(200, 5);
    expect(roadDistance([], { x: 0, z: 0 }, { x: 30, z: 40 })).toBe(50);
    expect(roadDistance(route, { x: 100, z: 100 }, { x: 100, z: 100 })).toBe(0);
  });
});

import { fill as fillTalk } from '../src/game/config/taxiTalk';
import { describe as d2, expect as e2, it as i2 } from 'vitest';
d2('taxi talk placeholders', () => {
  i2('replaces every occurrence of a placeholder', () => {
    e2(fillTalk('{to} لا لا، قصدي {to} و{from}', { to: 'موقف الدقي', from: 'موقف الهرم' })).toBe(
      'الدقي لا لا، قصدي الدقي والهرم'
    );
  });
});
