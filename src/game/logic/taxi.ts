/**
 * Taxi and microbus service (pure, unit-tested): ranks (مواقف), waiting passengers, boarding, fares, tips,
 * patience and earnings. The street game only moves the vehicle and draws; every rule lives here.
 */
import { toWorld, type LonLat } from './cairo';
import { net } from './roadnet';

export type TaxiVehicle = 'tuktuk' | 'microbus';
export const isTaxiVehicle = (v: string): v is TaxiVehicle => v === 'tuktuk' || v === 'microbus';

/** 1 world metre is 5 real metres. */
export const WORLD_TO_KM = 0.005;
/** Typical cruising speed (world m/s) used to say how long a trip should take, and a factor for bends. */
export const CRUISE = 11;
export const ROUTE_FACTOR = 1.35;
/** Within this distance of a rank (m) and slower than this (m/s) the vehicle can load or unload. */
export const STOP_RADIUS = 13;
export const STOP_SPEED = 3.5;
/** Shortest trip we hand out (world m): about 3 real km. */
export const MIN_TRIP = 600;

export interface Stop {
  id: string;
  name: string;
  at: LonLat;
}

/** The ranks: a stand where passengers wait. */
export const STOPS: readonly Stop[] = [
  { id: 'haram', name: 'موقف الهرم', at: [31.1752, 29.9988] },
  { id: 'faisal', name: 'موقف فيصل', at: [31.1735, 30.0105] },
  { id: 'giza', name: 'موقف ميدان الجيزة', at: [31.2089, 30.0131] },
  { id: 'dokki', name: 'موقف الدقي', at: [31.2128, 30.0376] },
  { id: 'mohandessin', name: 'موقف المهندسين', at: [31.2, 30.0585] },
  { id: 'imbaba', name: 'موقف إمبابة', at: [31.2025, 30.0795] },
  { id: 'zamalek', name: 'موقف الزمالك', at: [31.2252, 30.0625] },
  { id: 'tahrir', name: 'موقف التحرير', at: [31.2376, 30.0467] },
  { id: 'ramses', name: 'موقف رمسيس', at: [31.2469, 30.0614] },
  { id: 'shubra', name: 'موقف شبرا', at: [31.247, 30.0735] }
];

export interface StopSpot {
  stop: Stop;
  /** the road point where vehicles pull in */
  x: number;
  z: number;
  /** where passengers stand: the pavement beside it */
  px: number;
  pz: number;
}

let spots: StopSpot[] | null = null;
/** Ranks placed on the street network: the nearest carriageway point and the kerb beside it. */
export function stopSpots(): StopSpot[] {
  if (spots) return spots;
  const N = net();
  spots = STOPS.map((stop) => {
    const w = toWorld(stop.at);
    const n = N.nearest(w.x, w.z, 400)!;
    const a = N.at(n.e, n.s);
    // stand on the right-hand kerb of the carriageway (heading yaw: +z forward, right = -x rotated)
    const side = n.e.half + 1.6;
    return {
      stop,
      x: n.x,
      z: n.z,
      px: n.x - Math.cos(a.yaw) * side,
      pz: n.z + Math.sin(a.yaw) * side
    };
  });
  return spots;
}
export const spotOf = (id: string) => stopSpots().find((s) => s.stop.id === id);

export interface Tariff {
  base: number;
  perKm: number;
  /** minimum fare */
  min: number;
  /** microbus fares are per seat, a tuk-tuk is one fare for the party */
  perSeat: boolean;
  seats: number;
}
/** Egyptian pounds. */
export const TARIFF: Record<TaxiVehicle, Tariff> = {
  tuktuk: { base: 6, perKm: 3.2, min: 10, perSeat: false, seats: 2 },
  microbus: { base: 2.5, perKm: 1.1, min: 4, perSeat: true, seats: 6 }
};

export const round05 = (v: number) => Math.round(v * 2) / 2;

/** The meter fare for one party over `km` real kilometres, before comfort, time and tips. */
export function baseFare(vehicle: TaxiVehicle, km: number): number {
  const t = TARIFF[vehicle];
  return round05(Math.max(t.min, t.base + t.perKm * Math.max(0, km)));
}

export type Persona = 'calm' | 'chatty' | 'rush' | 'cheap' | 'generous';
export const PERSONAS: readonly Persona[] = ['calm', 'chatty', 'rush', 'cheap', 'generous'];
interface PersonaRule {
  /** share of the meter fare actually paid */
  pay: number;
  /** tip as a share of the fare, at full comfort and on time */
  tip: number;
  /** how fast patience runs out when late */
  fuss: number;
}
export const PERSONA_RULES: Record<Persona, PersonaRule> = {
  calm: { pay: 1, tip: 0.1, fuss: 0.7 },
  chatty: { pay: 1, tip: 0.15, fuss: 1 },
  rush: { pay: 1, tip: 0.06, fuss: 1.7 },
  cheap: { pay: 0.85, tip: 0, fuss: 1.1 },
  generous: { pay: 1, tip: 0.3, fuss: 0.9 }
};

export interface Waiting {
  id: number;
  stop: string;
  to: string;
  persona: Persona;
  /** people in the party (a tuk-tuk may carry two together) */
  size: number;
}

export interface Rider {
  id: number;
  persona: Persona;
  size: number;
  from: string;
  to: string;
  /** world metres between the two ranks and the real kilometres of the trip */
  dist: number;
  km: number;
  /** seconds the trip should take, seconds since boarding */
  expected: number;
  elapsed: number;
  /** 0..100, the passenger gets out angry at 0 */
  patience: number;
  /** accumulated harsh driving and number of crashes */
  rough: number;
  crashes: number;
  /** meter fare for this party */
  fare: number;
  /** what the party already paid getting in (a microbus seat is paid on boarding); undefined = pays at the drop */
  prepaid?: number;
}

export interface Payout {
  rider: Rider;
  fare: number;
  tip: number;
  total: number;
  comfort: number;
  /** 1..5 */
  stars: number;
  onTime: boolean;
  /** paid earlier, on boarding (not part of fare/total here) */
  prepaid: number;
}

export interface TaxiJob {
  vehicle: TaxiVehicle;
  riders: Rider[];
  nextId: number;
}

export const newJob = (vehicle: TaxiVehicle): TaxiJob => ({ vehicle, riders: [], nextId: 1 });

export const seatsUsed = (job: TaxiJob) => job.riders.reduce((n, r) => n + r.size, 0);
export const seatsFree = (job: TaxiJob) => TARIFF[job.vehicle].seats - seatsUsed(job);

export const distBetween = (a: string, b: string): number => {
  const A = spotOf(a),
    B = spotOf(b);
  return A && B ? Math.hypot(A.x - B.x, A.z - B.z) : 0;
};

export const expectedSecs = (dist: number) => (dist * ROUTE_FACTOR) / CRUISE;

/** Smoothness 0..1: harsh braking, hard cornering and crashes lower it. */
export const comfortOf = (r: Pick<Rider, 'rough' | 'crashes'>) =>
  Math.max(0, Math.min(1, 1 - r.rough / 12 - r.crashes * 0.25));

/** Share of the fare kept for being on time: 1 until the trip runs late, then falls to 0.6. */
export const punctuality = (r: Pick<Rider, 'elapsed' | 'expected'>) =>
  r.elapsed <= r.expected ? 1 : Math.max(0.6, 1 - ((r.elapsed - r.expected) / (r.expected * 1.2)) * 0.4);

/** What the rider pays when dropped at the right rank now. */
export function payout(r: Rider): Payout {
  const rule = PERSONA_RULES[r.persona];
  const comfort = comfortOf(r);
  const time = punctuality(r);
  // a seat paid on boarding is paid: only the tip still depends on the ride
  const fare = r.prepaid !== undefined ? 0 : round05(r.fare * rule.pay * (0.75 + 0.25 * comfort) * (0.6 + 0.4 * time));
  const early = r.elapsed < r.expected * 0.85 && r.persona === 'rush' ? 2 : 1;
  const tip = Math.round(r.fare * rule.tip * comfort * comfort * time * early);
  const score = comfort * 0.6 + time * 0.4;
  const stars = Math.max(1, Math.min(5, Math.round(1 + score * 4)));
  return {
    rider: r,
    fare,
    tip,
    total: fare + tip,
    comfort,
    stars,
    onTime: r.elapsed <= r.expected,
    prepaid: r.prepaid ?? 0
  };
}

/** The microbus is paid per seat as people get in ("الأجرة يا جماعة"), the tuk-tuk at the drop. */
export const paysOnBoarding = (v: TaxiVehicle): boolean => TARIFF[v].perSeat;

/** Take a party's seat fare now (the line's fixed fare, what the persona pays). Returns 0 if already paid. */
export function collectFare(r: Rider): number {
  if (r.prepaid !== undefined) return 0;
  r.prepaid = round05(r.fare * PERSONA_RULES[r.persona].pay);
  return r.prepaid;
}

/** A passenger counts as boarding: fixes the destination, fare and the time allowed. */
export function boardRider(job: TaxiJob, w: Waiting): Rider | null {
  if (w.size > seatsFree(job)) return null;
  const dist = distBetween(w.stop, w.to);
  const km = dist * WORLD_TO_KM * ROUTE_FACTOR;
  const t = TARIFF[job.vehicle];
  const per = baseFare(job.vehicle, km);
  const r: Rider = {
    id: job.nextId++,
    persona: w.persona,
    size: w.size,
    from: w.stop,
    to: w.to,
    dist,
    km,
    expected: expectedSecs(dist),
    elapsed: 0,
    patience: 100,
    rough: 0,
    crashes: 0,
    fare: t.perSeat ? per * w.size : per
  };
  job.riders.push(r);
  return r;
}

/** Board every waiting party at the rank that fits, in queue order. Returns the new riders. */
export function boardAll(job: TaxiJob, queue: Waiting[]): { boarded: Rider[]; left: Waiting[] } {
  const boarded: Rider[] = [];
  const left: Waiting[] = [];
  for (const w of queue) {
    const r = boardRider(job, w);
    if (r) boarded.push(r);
    else left.push(w);
  }
  return { boarded, left };
}

export interface Motion {
  /** how hard the vehicle is accelerating, braking or turning (m/s², any direction) */
  g: number;
  /** a collision this step (closing speed, m/s; 0 for none) */
  hit: number;
  /** share of the patience loss that applies (1 by default; a comfortable car lowers it) */
  calm?: number;
}

/** Harsh-driving threshold (m/s²): above this the ride gets rough. */
export const ROUGH_G = 7;

/** Advance every rider; returns those who lost patience and got out (they pay nothing). */
export function tickJob(job: TaxiJob, dt: number, m: Motion): Rider[] {
  const gone: Rider[] = [];
  for (const r of job.riders) {
    r.elapsed += dt;
    const rule = PERSONA_RULES[r.persona];
    const calm = m.calm ?? 1;
    if (m.g > ROUGH_G) {
      const e = (m.g - ROUGH_G) * dt;
      r.rough += e;
      r.patience -= e * 6 * calm;
    }
    if (m.hit > 3) {
      r.crashes += 1;
      r.patience -= 12 + Math.min(20, m.hit * 1.5);
    }
    if (r.elapsed > r.expected) r.patience -= ((dt * 100 * rule.fuss) / (r.expected * 1.1)) * calm;
  }
  job.riders = job.riders.filter((r) => {
    if (r.patience > 0) return true;
    gone.push(r);
    return false;
  });
  return gone;
}

export interface Car {
  x: number;
  z: number;
  /** m/s along the heading */
  speed: number;
}

export function atSpot(car: Car, spot: { x: number; z: number }): boolean {
  return Math.hypot(car.x - spot.x, car.z - spot.z) <= STOP_RADIUS && Math.abs(car.speed) <= STOP_SPEED;
}

/** Everyone whose destination is this rank gets out and pays. */
export function dropAt(job: TaxiJob, stopId: string): Payout[] {
  const out: Payout[] = [];
  job.riders = job.riders.filter((r) => {
    if (r.to !== stopId) return true;
    out.push(payout(r));
    return false;
  });
  return out;
}

// ---- who is waiting at the ranks

export type Queues = Record<string, Waiting[]>;
export const QUEUE_CAP: Record<TaxiVehicle, number> = { tuktuk: 2, microbus: 5 };
export const RESTOCK_EVERY = 14;

export interface Rng {
  (): number;
}

export function destinationFor(from: string, rng: Rng): string {
  const far = STOPS.filter((s) => s.id !== from && distBetween(from, s.id) >= MIN_TRIP);
  const pool = far.length ? far : STOPS.filter((s) => s.id !== from);
  return pool[Math.floor(rng() * pool.length)]!.id;
}

let waitId = 1;
export function newWaiting(stop: string, vehicle: TaxiVehicle, rng: Rng): Waiting {
  const persona = PERSONAS[Math.floor(rng() * PERSONAS.length)]!;
  return {
    id: waitId++,
    stop,
    to: destinationFor(stop, rng),
    persona,
    size: vehicle === 'tuktuk' && rng() < 0.3 ? 2 : 1
  };
}

export function emptyQueues(): Queues {
  const q: Queues = {};
  for (const s of STOPS) q[s.id] = [];
  return q;
}

/** Fill every rank up to a share of the cap straight away (when the shift starts). */
export function seedQueues(q: Queues, vehicle: TaxiVehicle, rng: Rng) {
  for (const s of STOPS) {
    const n = 1 + Math.floor(rng() * QUEUE_CAP[vehicle]);
    while (q[s.id]!.length < n) q[s.id]!.push(newWaiting(s.id, vehicle, rng));
  }
}

/** Someone new turns up at a random rank that is not full, every few seconds. Returns the new passenger. */
export function restock(
  q: Queues,
  vehicle: TaxiVehicle,
  clock: { t: number },
  dt: number,
  rng: Rng,
  prefer?: ((stop: string) => boolean) | null
): Waiting | null {
  clock.t -= dt;
  if (clock.t > 0) return null;
  clock.t = RESTOCK_EVERY * (0.6 + rng() * 0.8);
  let open = STOPS.filter((s) => q[s.id]!.length < QUEUE_CAP[vehicle]);
  // most new passengers turn up in the area the driver chose
  if (prefer && rng() < 0.7) {
    const near = open.filter((s) => prefer(s.id));
    if (near.length) open = near;
  }
  if (!open.length) return null;
  const s = open[Math.floor(rng() * open.length)]!;
  const w = newWaiting(s.id, vehicle, rng);
  q[s.id]!.push(w);
  return w;
}

/** Which pickups count: a zone filter (ids of the ranks allowed, null for all) and a fare the driver accepted on the trip board. */
export interface TargetOpts {
  allow?: ((stop: string) => boolean) | null;
  accepted?: number | null;
}

/**
 * The rank to head for: the nearest destination of a rider, else the rank of the accepted fare, else (with seats free)
 * the nearest allowed rank with people waiting.
 */
export function nextTarget(
  job: TaxiJob,
  q: Queues,
  car: { x: number; z: number },
  opts: TargetOpts = {}
): { stop: string; kind: 'drop' | 'pickup' } | null {
  const d = (id: string) => {
    const s = spotOf(id);
    return s ? Math.hypot(s.x - car.x, s.z - car.z) : Infinity;
  };
  let best: { stop: string; kind: 'drop' | 'pickup' } | null = null;
  let bd = Infinity;
  for (const r of job.riders) {
    const x = d(r.to);
    if (x < bd) {
      bd = x;
      best = { stop: r.to, kind: 'drop' };
    }
  }
  if (best) return best;
  if (opts.accepted != null) {
    for (const s of STOPS) {
      const w = q[s.id]!.find((x) => x.id === opts.accepted);
      if (w && w.size <= seatsFree(job)) return { stop: s.id, kind: 'pickup' };
    }
  }
  for (const s of STOPS) {
    if (!q[s.id]!.length || seatsFree(job) <= 0) continue;
    if (opts.allow && !opts.allow(s.id)) continue;
    const x = d(s.id);
    if (x < bd) {
      bd = x;
      best = { stop: s.id, kind: 'pickup' };
    }
  }
  return best;
}

// ---- earnings per vehicle

export interface Earnings {
  total: number;
  tips: number;
  trips: number;
  riders: number;
  best: number;
}
export const emptyEarnings = (): Earnings => ({ total: 0, tips: 0, trips: 0, riders: 0, best: 0 });

export type EarningsBook = Record<TaxiVehicle, Earnings>;
export const emptyBook = (): EarningsBook => ({ tuktuk: emptyEarnings(), microbus: emptyEarnings() });

export function addPayout(e: Earnings, p: Payout): Earnings {
  return {
    total: e.total + p.total + p.prepaid,
    tips: e.tips + p.tip,
    trips: e.trips + 1,
    riders: e.riders + p.rider.size,
    best: Math.max(e.best, p.total + p.prepaid)
  };
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
/** Clean up a saved book: unknown keys are dropped, bad numbers become 0. */
export function sanitizeBook(raw: unknown): EarningsBook {
  const out = emptyBook();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, Record<string, unknown> | undefined>;
  for (const v of ['tuktuk', 'microbus'] as const) {
    const e = r[v];
    if (!e || typeof e !== 'object') continue;
    out[v] = {
      total: num(e.total),
      tips: num(e.tips),
      trips: Math.floor(num(e.trips)),
      riders: Math.floor(num(e.riders)),
      best: num(e.best)
    };
  }
  return out;
}
