/**
 * Taxi and microbus work in the street game: passengers wait at ranks (مواقف), you pull in, they board and say
 * where they are going, you drive them there smoothly, and they pay (and tip). All rules are in logic/taxi.ts;
 * this file moves people, draws markers, the cab HUD and the passengers' bubbles.
 */
import * as THREE from 'three';
import {
  STOPS,
  addPayout,
  atSpot,
  boardAll,
  dropAt,
  emptyQueues,
  newJob,
  newWaiting,
  nextTarget,
  restock,
  seatsFree,
  seatsUsed,
  seedQueues,
  spotOf,
  stopSpots,
  tickJob,
  TARIFF,
  type Payout,
  type Queues,
  type Rider,
  type TaxiJob,
  type TaxiVehicle,
  type Waiting
} from '../logic/taxi';
import {
  addBailed,
  addDistance,
  addRepair,
  addTrip,
  finishShift,
  fuelCharge,
  hourLabel,
  newShift,
  nightBonusOf,
  type Shift,
  type ShiftRecord
} from '../logic/shift';
import { ALL_ZONES, ZONES, inZone, sanitizeZone, tripBoard, zoneById, type ZoneId } from '../logic/zones';
import { patienceMul, rideMul, tipMul } from '../logic/workshop';
import { sheet, type Sheet } from '../ui/Sheet';
import { CHAT_TOPICS, PERSONA_LOOK, fill, pickTalk, type TalkId } from '../config/taxiTalk';
import { streetNameSign } from '../world/Egypt';
import type { Speaker } from '../ui/Barks';
import {
  progress,
  bookEarnings,
  addWallet,
  bookShift,
  setZone,
  shiftsOf,
  tuningOf,
  wallet,
  setWallet
} from '../missions/Levels';

const SEEN = 150;
const HAIL_RANGE = 34;
const BOARD_SECS = 0.9;

export interface TaxiHost {
  group: THREE.Group;
  uiRoot: () => HTMLElement | null;
  makePerson: (female: boolean, dress: number, hair: number) => { g: THREE.Group };
  car: () => THREE.Object3D;
  /** the car's state: position, signed speed (m/s), heading */
  state: () => { x: number; z: number; speed: number; yaw: number; inCar: boolean };
  say: (who: Speaker, text: string, look: { name: string; icon: string; color: string }, delayMs?: number) => void;
  status: (text: string) => void;
  /** point the objective arrow, GPS line and edge marker at a place (or nothing) */
  target: (at: { x: number; z: number } | null) => void;
  /** distance by road to the current target, when it is known */
  routeLength: () => number | null;
  /** fix the vehicle's damage (percent points) */
  repair: (amount: number) => void;
  /** a person model's clip */
  idle: (g: THREE.Object3D) => void;
  /** the city hour (0-24) */
  hour: () => number;
}

interface Standing {
  w: Waiting;
  mesh: THREE.Group;
}

/** The marker over a rank: a small bobbing arrow, green for people waiting, bigger for the pickup you are heading to, yellow for a drop-off. */
const MARK = {
  waiting: { color: 0x3dff9a, scale: 0.75 },
  pickup: { color: 0x3dff9a, scale: 1.15 },
  drop: { color: 0xffd23d, scale: 1.15 }
} as const;
const ARROW_GEO = new THREE.ConeGeometry(0.42, 0.95, 4);
ARROW_GEO.rotateX(Math.PI); // point down

/** Where passengers sit in each vehicle (x right, z forward, in the body frame) and how high their seat cushion is. */
const SEAT_SPOTS: Record<TaxiVehicle, [number, number][]> = {
  tuktuk: [
    [-0.26, -0.5],
    [0.26, -0.5]
  ],
  microbus: [
    [-0.55, 0.45],
    [0.45, 0.45],
    [-0.55, -0.7],
    [0.45, -0.7],
    [-0.55, -1.85],
    [0.45, -1.85]
  ]
};
const SEAT_BASE: Record<TaxiVehicle, number> = { tuktuk: 0.75, microbus: 1.0 };
const SEAT_BODY = new THREE.BoxGeometry(0.42, 0.5, 0.26);
const SEAT_HEAD = new THREE.SphereGeometry(0.16, 8, 6);
const SHIRTS = [0x4a6fa5, 0xb55a4a, 0x6b8f71, 0xd8b45a, 0x8a5a9a, 0x3f3f46];
const SKINS = [0xc99a73, 0xa87550, 0xe0b48e, 0x8d5e3c];
const nightNow = (hour: number) => hour >= 20 || hour < 5;

const money = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)} ج`;

export class TaxiService {
  vehicle: TaxiVehicle = 'tuktuk';
  job: TaxiJob = newJob('tuktuk');
  queues: Queues = emptyQueues();
  private clock = { t: 4 };
  private standing = new Map<number, Standing>();
  private beams = new Map<string, THREE.Mesh>();
  private boarding: { mesh: THREE.Group; t: number; from: THREE.Vector3 }[] = [];
  private seated = new THREE.Group();
  private seatKey = '';
  private lastPos: { x: number; z: number } | null = null;
  /** off shift: no pickups until the driver clocks in at a rank */
  onShift = false;
  shift: Shift = newShift('tuktuk', 12);
  private sheetEl: Sheet | null = null;
  /** the fare accepted on the trip board (a waiting party's id) */
  accepted: number | null = null;
  zone: ZoneId = ALL_ZONES;
  private signs = new THREE.Group();
  private root = new THREE.Group();
  private hud: HTMLElement | null = null;
  private hudHtml = '';
  private hudT = 0;
  private boardT = 0;
  private lastSpeed = 0;
  private lastYaw = 0;
  private hit = 0;
  private talkT = 8;
  private hailT = 3;
  private lastTalk = new Map<TalkId, number>();
  private complainT = 0;
  private cabSpeaker: Speaker | null = null;
  private active = false;
  private toast: { text: string; until: number } | null = null;
  /** how many riders were handled last, for the HUD's feedback line */
  private feedback = '';

  constructor(private host: TaxiHost) {}

  get on() {
    return this.active;
  }

  start(vehicle: TaxiVehicle) {
    this.vehicle = vehicle;
    this.job = newJob(vehicle);
    this.queues = emptyQueues();
    seedQueues(this.queues, vehicle, Math.random);
    this.zone = sanitizeZone(progress.zone);
    this.accepted = null;
    // clocking in happens at the rank where the shift starts
    this.shift = newShift(vehicle, this.host.hour());
    this.onShift = true;
    this.clearStanding();
    this.boarding = [];
    this.boardT = 0;
    this.talkT = 8;
    this.seatKey = '';
    this.lastPos = null;
    this.sheetEl?.close();
    if (!this.active) {
      this.active = true;
      this.buildWorld();
      this.mountHud();
      window.addEventListener('pc:end-shift', this.onEndShift);
      window.addEventListener('pc:flush-shift', this.onFlush);
      window.addEventListener('pagehide', this.onFlush);
    }
    this.root.visible = true;
    this.hudHtml = '';
    const car = this.host.car();
    this.seated.removeFromParent();
    car.add(this.seated);
    this.cabSpeaker = { obj: car, role: 'driver', height: 2.2 };
    this.host.status(
      vehicle === 'tuktuk'
        ? 'بدأت الوردية — الركاب مستنيين في المواقف، افتح 🧾 عشان تختار مشوار.'
        : 'بدأت الوردية — املا الكراسي ووصّل الركاب، افتح 🧾 عشان تختار مشوار.'
    );
  }

  private onEndShift = () => this.endShift();
  /** the page is closing or going back to the menu: a shift that did some work is written down */
  private onFlush = () => {
    if (this.active && this.onShift && this.shift.trips > 0) {
      this.closeShift(true);
      this.shift = newShift(this.vehicle, this.host.hour());
    }
  };

  stop() {
    if (!this.active) return;
    // leaving the taxi (another vehicle, back to the menu) closes a shift that did some work
    if (this.onShift && this.shift.trips > 0) this.closeShift(true);
    this.onShift = false;
    this.active = false;
    window.removeEventListener('pc:end-shift', this.onEndShift);
    window.removeEventListener('pc:flush-shift', this.onFlush);
    window.removeEventListener('pagehide', this.onFlush);
    this.sheetEl?.close();
    this.clearStanding();
    for (const b of this.boarding) b.mesh.removeFromParent();
    this.boarding = [];
    this.seated.removeFromParent();
    this.root.visible = false;
    this.hud?.remove();
    this.hud = null;
    this.host.target(null);
  }

  private clearStanding() {
    for (const s of this.standing.values()) s.mesh.removeFromParent();
    this.standing.clear();
  }

  private buildWorld() {
    if (!this.root.parent) this.host.group.add(this.root);
    if (!this.signs.children.length) {
      for (const s of stopSpots()) {
        const sign = streetNameSign('موقف', s.stop.name.replace(/^موقف /, ''));
        sign.position.set(s.px, 0, s.pz);
        this.signs.add(sign);
        const arrow = new THREE.Mesh(ARROW_GEO, new THREE.MeshBasicMaterial({ color: 0x3dff9a, fog: false }));
        arrow.position.set(s.px + (s.x - s.px) * 0.3, 3.0, s.pz + (s.z - s.pz) * 0.3);
        arrow.userData.baseY = 3.0;
        arrow.visible = false;
        this.beams.set(s.stop.id, arrow);
        this.signs.add(arrow);
      }
      this.root.add(this.signs);
    }
  }

  private mountHud() {
    const ui = this.host.uiRoot();
    if (!ui) return;
    const el = document.createElement('div');
    el.id = 'street-taxi';
    // small screens start as a slim strip; a tap opens or closes the details
    el.classList.toggle('open', !window.matchMedia('(max-width: 560px), (max-height: 520px)').matches);
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-tx]');
      if (b) {
        e.stopPropagation();
        this.act(b.dataset.tx!);
      } else el.classList.toggle('open');
    });
    ui.appendChild(el);
    this.hud = el;
  }

  /** The HUD is built when the street UI mounts after us (the first call may come before it). */
  remount() {
    if (this.active && !this.hud?.isConnected) {
      this.hud = null;
      this.mountHud();
      this.hudHtml = '';
    }
  }

  crash(v: number) {
    this.hit = Math.max(this.hit, v);
  }

  // ---------- people at the ranks
  private makeStanding(w: Waiting, index: number): Standing {
    const female = (w.id * 7) % 3 === 0;
    const dress = [0x6b8f71, 0xb55a4a, 0x4a6fa5, 0xd8b45a, 0x8a5a9a, 0x3f3f46][w.id % 6]!;
    const hair = [0x1b1410, 0x2c1e14, 0x0d0d0d][w.id % 3]!;
    const p = this.host.makePerson(female, dress, hair);
    const spot = spotOf(w.stop)!;
    const dx = spot.x - spot.px,
      dz = spot.z - spot.pz;
    const len = Math.hypot(dx, dz) || 1;
    // spread along the kerb, facing the road
    const ax = -dz / len,
      az = dx / len;
    const off = (index - 1) * 1.1;
    p.g.position.set(spot.px + ax * off, 0, spot.pz + az * off);
    p.g.rotation.y = Math.atan2(dx, dz);
    this.host.idle(p.g);
    this.root.add(p.g);
    return { w, mesh: p.g };
  }

  private syncStanding(me: { x: number; z: number }) {
    for (const [id, s] of this.standing) {
      const q = this.queues[s.w.stop]!;
      if (!q.includes(s.w)) {
        s.mesh.removeFromParent();
        this.standing.delete(id);
      }
    }
    for (const sp of stopSpots()) {
      const near = Math.hypot(sp.x - me.x, sp.z - me.z) < SEEN;
      const q = this.queues[sp.stop.id]!;
      q.forEach((w, i) => {
        const has = this.standing.get(w.id);
        if (near && !has) this.standing.set(w.id, this.makeStanding(w, i));
        else if (!near && has) {
          has.mesh.removeFromParent();
          this.standing.delete(w.id);
        }
      });
    }
  }

  // ---------- talk
  private bubbleOf(r: { persona: Rider['persona'] }) {
    return PERSONA_LOOK[r.persona];
  }
  private cab(r: { persona: Rider['persona'] }, text: string, delay = 0) {
    if (this.cabSpeaker) this.host.say(this.cabSpeaker, text, this.bubbleOf(r), delay);
  }
  private line(id: TalkId, vars: { to?: string; from?: string } = {}) {
    return fill(pickTalk(id, this.lastTalk, Math.random), vars);
  }
  private nameOf(id: string) {
    return STOPS.find((s) => s.id === id)?.name ?? '';
  }

  // ---------- main tick
  update(dt: number) {
    if (!this.active) return;
    const st = this.host.state();
    const me = { x: st.x, z: st.z };
    const car = { x: st.x, z: st.z, speed: st.speed };

    // how rough the last moments were: braking/accelerating and cornering, in m/s²
    const accel = Math.abs(st.speed - this.lastSpeed) / Math.max(dt, 1e-3);
    let dy = st.yaw - this.lastYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    const lateral = Math.abs(st.speed) * (Math.abs(dy) / Math.max(dt, 1e-3));
    this.lastSpeed = st.speed;
    this.lastYaw = st.yaw;
    const g = st.inCar && dt < 0.2 ? Math.hypot(accel, lateral) : 0;
    const hit = this.hit;
    this.hit = 0;

    // distance for the shift (fuel is charged by the kilometre)
    if (this.lastPos && st.inCar && this.onShift) {
      const d = Math.hypot(me.x - this.lastPos.x, me.z - this.lastPos.z);
      if (d < 40) this.shift = addDistance(this.shift, d);
    }
    this.lastPos = me;

    const zoneOnly = this.zone === ALL_ZONES ? null : (id: string) => inZone(this.zone, id);
    if (this.onShift) restock(this.queues, this.vehicle, this.clock, dt, Math.random, zoneOnly);
    this.syncStanding(me);
    this.stepBoarding(dt);
    // a pickup that someone else took is no longer on offer
    if (this.accepted !== null && !Object.values(this.queues).some((q) => q.some((w) => w.id === this.accepted)))
      this.accepted = null;
    const tune = tuningOf(this.vehicle);

    // riders: patience, comfort, complaints
    const gone = tickJob(this.job, dt, { g: g * rideMul(this.vehicle, tune), hit, calm: patienceMul(tune) });
    if (hit > 3 && this.job.riders.length) {
      const r = this.job.riders[Math.floor(Math.random() * this.job.riders.length)]!;
      this.cab(r, this.line('crash'));
    } else if (g > 9 && this.job.riders.length) {
      this.complainT -= dt;
      if (this.complainT <= 0) {
        this.complainT = 4;
        this.cab(this.job.riders[0]!, this.line('complainRough'));
      }
    }
    for (const r of gone) {
      this.shift = addBailed(this.shift);
      this.cab(r, this.line('bail'));
      this.host.status(`😠 ${PERSONA_LOOK[r.persona].name} نزل غضبان قبل ما يوصل — بدون أجرة.`);
      this.feedback = '😠 راكب نزل غضبان';
    }

    // loading and unloading
    if (st.inCar) {
      this.dropOff(car);
      if (this.onShift) this.pickUp(car, dt);
    } else this.boardT = 0;

    // late riders grumble
    if (this.job.riders.length) {
      this.talkT -= dt;
      if (this.talkT <= 0) {
        this.talkT = 9 + Math.random() * 7;
        this.chat();
      }
    }
    // people waiting call out when you roll up
    this.hailT -= dt;
    if (this.hailT <= 0 && st.inCar && this.onShift) {
      this.hailT = 6;
      for (const sp of stopSpots()) {
        const q = this.queues[sp.stop.id]!;
        const d = Math.hypot(sp.x - st.x, sp.z - st.z);
        if (q.length && d < HAIL_RANGE && d > 6 && seatsFree(this.job) > 0) {
          const stand = this.standing.get(q[0]!.id);
          if (stand)
            this.host.say(
              { obj: stand.mesh, role: 'pedestrian', height: 2.0 },
              this.line('hail', { to: this.nameOf(q[0]!.to) }),
              this.bubbleOf(q[0]!)
            );
          break;
        }
      }
    }

    // rank markers bob; the objective arrow and the HUD refresh a few times a second
    const tt = performance.now() / 1000;
    for (const a of this.beams.values())
      if (a.visible) {
        a.position.y = (a.userData.baseY as number) + Math.sin(tt * 4) * 0.22;
        a.rotation.y += dt * 2;
      }
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.12;
      this.refreshTargets(car);
      this.syncSeated();
      this.renderHud(car);
    }
  }

  private chat() {
    const riders = this.job.riders;
    const r = riders[Math.floor(Math.random() * riders.length)]!;
    const late = r.elapsed > r.expected * 1.1;
    let id: TalkId;
    if (late && Math.random() < 0.7) id = 'complainSlow';
    else {
      const topics = CHAT_TOPICS[r.persona];
      id = topics[Math.floor(Math.random() * topics.length)]!;
    }
    // a microbus also passes the fare along now and then
    if (this.vehicle === 'microbus' && riders.length > 2 && Math.random() < 0.25) id = 'microPay';
    this.cab(r, this.line(id, { to: this.nameOf(r.to) }));
  }

  private pickUp(car: { x: number; z: number; speed: number }, dt: number) {
    if (seatsFree(this.job) <= 0) {
      this.boardT = 0;
      return;
    }
    const sp = stopSpots().find((s) => this.queues[s.stop.id]!.length > 0 && atSpot(car, s));
    if (!sp) {
      this.boardT = 0;
      return;
    }
    this.boardT += dt;
    if (this.boardT < BOARD_SECS) return;
    this.boardT = 0;
    const q = this.queues[sp.stop.id]!;
    const { boarded, left } = boardAll(this.job, q);
    if (!boarded.length) {
      this.host.status('العربية مليانة.');
      return;
    }
    this.queues[sp.stop.id] = left;
    // the people who got in walk to the car and vanish into it
    for (const w of q.filter((x) => !left.includes(x))) {
      const stand = this.standing.get(w.id);
      if (!stand) continue;
      this.standing.delete(w.id);
      this.boarding.push({ mesh: stand.mesh, t: 0, from: stand.mesh.position.clone() });
      if (this.accepted === w.id) this.accepted = null;
    }
    boarded.forEach((r, i) => {
      this.cab(r, this.line('board', { to: this.nameOf(r.to) }), i * 900);
      if (r.persona === 'cheap' || (r.persona === 'chatty' && Math.random() < 0.4))
        this.cab(r, this.line('haggle'), 1800 + i * 900);
    });
    if (left.length && seatsFree(this.job) <= 0 && this.vehicle === 'microbus') {
      const stand = this.standing.get(left[0]!.id);
      if (stand)
        this.host.say(
          { obj: stand.mesh, role: 'pedestrian', height: 2.0 },
          this.line('full'),
          this.bubbleOf(left[0]!),
          1200
        );
    }
    const dests = [...new Set(boarded.map((r) => this.nameOf(r.to).replace(/^موقف /, '')))].join(' و');
    this.host.status(`🙋 ركب ${boarded.reduce((n, r) => n + r.size, 0)} — رايحين ${dests}`);
    this.feedback = `ركب ${boarded.length} من ${this.nameOf(sp.stop.id)}`;
  }

  private dropOff(car: { x: number; z: number; speed: number }) {
    for (const r of [...this.job.riders]) {
      const sp = spotOf(r.to);
      if (!sp || !atSpot(car, sp)) continue;
      const paid = dropAt(this.job, r.to);
      for (const p of paid) this.settle(p);
      return;
    }
  }

  private settle(p: Payout) {
    const tune = tuningOf(this.vehicle);
    const hour = this.host.hour();
    const tipExtra = Math.round(p.tip * (tipMul(tune) - 1));
    const bonus = nightBonusOf(p.fare + p.tip + tipExtra, hour);
    const total = p.total + tipExtra + bonus;
    this.shift = addTrip(
      this.shift,
      { fare: p.fare, tip: p.tip + tipExtra, stars: p.stars, size: p.rider.size },
      bonus
    );
    bookEarnings(this.vehicle, (e) => addPayout(e, p));
    addWallet(total);
    const stars = '★'.repeat(p.stars) + '☆'.repeat(5 - p.stars);
    const id: TalkId = p.tip > 0 ? 'tipDrop' : p.rider.persona === 'cheap' ? 'cheapDrop' : 'drop';
    this.cab(p.rider, this.line(id), 0);
    if (p.comfort > 0.85 && p.onTime) this.cab(p.rider, this.line('approve'), 1500);
    this.host.status(
      `💰 +${money(total)}${p.tip + tipExtra ? ` (بقشيش ${money(p.tip + tipExtra)})` : ''}${bonus ? ` · 🌙 +${money(bonus)}` : ''} · ${stars}${p.onTime ? '' : ' · اتأخرت'}`
    );
    this.toast = { text: `+${money(total)}`, until: performance.now() + 2600 };
    this.feedback = `نزل ${PERSONA_LOOK[p.rider.persona].name} · ${stars}`;
  }

  // ---------- markers and HUD
  private refreshTargets(car: { x: number; z: number }) {
    const t = this.onShift ? this.pickTarget(car) : null;
    const dropIds = new Set(this.job.riders.map((r) => r.to));
    for (const [id, arrow] of this.beams) {
      const waiting = this.onShift && this.queues[id]!.length > 0 && seatsFree(this.job) > 0;
      const kind = !this.onShift
        ? null
        : dropIds.has(id)
          ? 'drop'
          : t?.stop === id && t.kind === 'pickup'
            ? 'pickup'
            : waiting && (this.zone === ALL_ZONES || inZone(this.zone, id))
              ? 'waiting'
              : null;
      arrow.visible = !!kind;
      if (kind) {
        (arrow.material as THREE.MeshBasicMaterial).color.setHex(MARK[kind].color);
        arrow.scale.setScalar(MARK[kind].scale);
      }
    }
    const spot = t ? spotOf(t.stop) : null;
    this.host.target(spot ? { x: spot.x, z: spot.z } : null);
  }

  /** Where to head: the drop-off of a rider, the fare accepted on the board, else the nearest pickup in the chosen zone. */
  private pickTarget(car: { x: number; z: number }) {
    return nextTarget(this.job, this.queues, car, {
      allow: this.zone === ALL_ZONES ? null : (id) => inZone(this.zone, id),
      accepted: this.accepted
    });
  }

  /** Make sure at least `n` people wait at a rank (the shift starts there). */
  ensureQueue(id: string, n: number) {
    const q = this.queues[id];
    if (!q) return;
    while (q.length < n) q.push(newWaiting(id, this.vehicle, Math.random));
  }

  /** What the map and radar show: every rank, with a colour for its role right now. */
  pins(): { id: string; name: string; x: number; z: number; color: string; badge: string }[] {
    const dropIds = new Set(this.job.riders.map((r) => r.to));
    return stopSpots().map((s) => {
      const id = s.stop.id;
      const n = this.queues[id]!.length;
      const drop = dropIds.has(id);
      return {
        id,
        name: s.stop.name,
        x: s.x,
        z: s.z,
        color: drop ? '#ffd23d' : n ? '#3dff9a' : '#7f8ea3',
        badge: drop ? '↓' : n ? String(n) : ''
      };
    });
  }

  // ---------- the cab HUD
  private renderHud(car: { x: number; z: number; speed: number }) {
    if (!this.hud) return;
    const t = this.onShift ? this.pickTarget(car) : null;
    const spot = t ? spotOf(t.stop) : null;
    const straight = spot ? Math.hypot(spot.x - car.x, spot.z - car.z) : 0;
    const dist = Math.max(straight, spot ? (this.host.routeLength() ?? 0) : 0);
    const distTxt = dist >= 1000 ? `${(dist / 1000).toFixed(1)} كم` : `${Math.round(dist)} م`;
    const seats = TARIFF[this.vehicle].seats;
    const sh = this.shift;
    const shiftTotal = sh.fares + sh.tips + sh.bonus;
    const riderRows = this.job.riders
      .map((r) => {
        const pct = Math.max(0, Math.min(100, Math.round(r.patience)));
        const cls = pct < 30 ? 'low' : pct < 60 ? 'mid' : '';
        const left = Math.max(0, Math.round(r.expected - r.elapsed));
        return `<li>${PERSONA_LOOK[r.persona].icon}${r.size > 1 ? `×${r.size}` : ''} ← <b>${this.nameOf(r.to).replace(/^موقف /, '')}</b> <em>${left > 0 ? `${left}ث` : 'متأخر'}</em><i class="pat ${cls}"><u style="width:${pct}%"></u></i></li>`;
      })
      .join('');
    const used = seatsUsed(this.job);
    const seatIcons = Array.from({ length: seats }, (_, i) => (i < used ? '🧍' : '💺')).join('');
    const short = (id: string) => this.nameOf(id).replace(/^موقف /, '');
    const zoneName = this.zone === ALL_ZONES ? 'كل المناطق' : (zoneById(this.zone)?.name ?? '');
    const mine = this.accepted !== null && t?.kind === 'pickup';
    const go = !this.onShift
      ? '<span class="tx-name">⏸ <b>بره الوردية</b></span>'
      : `<span class="tx-name">${this.job.riders.length ? '🏁' : mine ? '✅' : '🅿'} <b>${t ? short(t.stop) : this.zone === ALL_ZONES ? 'استنى شوية' : 'مفيش ركاب هنا'}</b></span>${t ? `<em>${distTxt}</em>` : ''}`;
    const strip = `<div class="tx-strip"><button type="button" class="tx-bd" data-tx="${this.onShift ? 'board' : 'start'}" aria-label="${this.onShift ? 'الرحلات' : 'ابدأ وردية'}">${this.onShift ? '🧾' : '▶'}</button><span class="tx-go">${go}</span><span class="tx-fare">${money(shiftTotal)}</span><span class="tx-seats">${seatIcons}</span><span class="tx-more-btn" aria-hidden="true">▾</span></div>`;
    const hour = this.host.hour();
    const state = !this.onShift
      ? 'اضغط ▶ عند أي موقف عشان تبدأ وردية جديدة.'
      : this.job.riders.length
        ? `🏁 وصّل: <b>${spot ? this.nameOf(t!.stop) : ''}</b> · ${distTxt}`
        : t
          ? `${mine ? '✅ مشوارك' : '🅿 روح'}: <b>${this.nameOf(t.stop)}</b> · ${distTxt}`
          : this.zone === ALL_ZONES
            ? 'مفيش ركاب دلوقتي — استنى شوية'
            : `مفيش ركاب في ${zoneName} دلوقتي — غيّر المنطقة أو استنى`;
    const more = `<div class="tx-more"><div class="tx-head"><span>${this.vehicle === 'tuktuk' ? '🛺 توكتوك' : '🚐 ميكروباص'} · ${sh.night ? '🌙 وردية ليلية' : '☀️ وردية نهارية'}</span><span class="tx-day">${hourLabel(hour)}</span></div>
      <div class="tx-state">${state}</div>
      ${riderRows ? `<ul class="tx-riders">${riderRows}</ul>` : ''}
      <div class="tx-foot">${sh.trips} مشوار · ${sh.km.toFixed(1)} كم · بقشيش ${money(sh.tips)} · 📍 ${zoneName} · محفظتك ${money(Math.round(wallet()))}${nightNow(hour) ? ' · 🌙 +15%' : ''}${this.feedback ? `<br>${this.feedback}` : ''}</div>
      <div class="tx-btns"><button type="button" data-tx="board">🧾 الرحلات</button><button type="button" data-tx="history">📒 الورديات</button>${this.onShift ? '<button type="button" data-tx="end" class="end">🏁 إنهاء الوردية</button>' : '<button type="button" data-tx="start" class="go">▶ ابدأ وردية</button>'}</div></div>`;
    const html = `${strip}${more}${this.toast && performance.now() < this.toast.until ? `<div class="tx-toast">${this.toast.text}</div>` : ''}`;
    if (html !== this.hudHtml) {
      this.hud.innerHTML = html;
      this.hudHtml = html;
    }
  }

  private act(what: string) {
    if (what === 'board') this.openBoard();
    else if (what === 'history') this.openHistory(this.vehicle);
    else if (what === 'end') this.endShift();
    else if (what === 'start') this.clockIn();
  }

  // ---------- shifts
  /** Clock in: only at a rank. */
  clockIn(): boolean {
    if (this.onShift) return true;
    const st = this.host.state();
    const car = { x: st.x, z: st.z, speed: st.speed };
    if (!stopSpots().some((s) => atSpot(car, s))) {
      this.host.status('📍 روح أي موقف الأول وقف عنده عشان تبدأ الوردية.');
      return false;
    }
    this.shift = newShift(this.vehicle, this.host.hour());
    this.onShift = true;
    this.accepted = null;
    this.sheetEl?.close();
    this.hudHtml = '';
    this.host.status(`▶ بدأت وردية ${this.shift.night ? 'ليلية 🌙 (الأجرة +15%)' : 'نهارية ☀️'}.`);
    return true;
  }

  /** Clock out from the HUD or the menu. Riders on board have to be dropped first. */
  endShift(): ShiftRecord | null {
    if (!this.active || !this.onShift) return null;
    if (this.job.riders.length) {
      this.host.status('🙋 وصّل الركاب اللي معاك الأول وبعدين أنهي الوردية.');
      return null;
    }
    const rec = this.closeShift(false);
    this.openSummary(rec);
    return rec;
  }

  /** Write the shift down (history, fuel charge) and go off shift. */
  private closeShift(quiet: boolean): ShiftRecord {
    const rec = finishShift(this.shift, this.host.hour());
    setWallet(Math.max(0, wallet() - fuelCharge(rec)));
    bookShift(this.vehicle, rec);
    this.onShift = false;
    this.accepted = null;
    this.host.target(null);
    for (const a of this.beams.values()) a.visible = false;
    this.hudHtml = '';
    if (!quiet) this.feedback = '';
    return rec;
  }

  /** The workshop took money for repairs: it counts against this shift. */
  repairPaid(cost: number) {
    if (this.onShift) this.shift = addRepair(this.shift, cost);
  }

  private openSummary(rec: ShiftRecord) {
    const stars = (n: number) => `${'★'.repeat(Math.round(n))}${'☆'.repeat(5 - Math.round(n))}`;
    const row = (k: string, v: string, cls = '') => `<div class="tx-row ${cls}"><span>${k}</span><b>${v}</b></div>`;
    const html = `<h2>🏁 خلصت الوردية ${rec.night ? '🌙' : '☀️'}</h2>
      <p class="tx-sub">${this.vehicle === 'tuktuk' ? 'توكتوك' : 'ميكروباص'} · ${hourLabel(rec.startHour)} → ${hourLabel(rec.endHour)}${rec.minutes ? ` · ${rec.minutes} دقيقة لعب` : ''}</p>
      <div class="tx-grid">
        ${row('المشاوير', `${rec.trips} (${rec.riders} راكب)`)}
        ${row('المسافة', `${rec.km.toFixed(1)} كم`)}
        ${row('الأجرة', money(rec.fares))}
        ${row('البقشيش', money(rec.tips))}
        ${rec.bonus ? row('زيادة الليل 🌙', money(rec.bonus)) : ''}
        ${row('البنزين', `− ${money(rec.fuel)}`, 'minus')}
        ${row('التصليحات', `− ${money(rec.repairs)}`, 'minus')}
        ${row('أحسن مشوار', money(rec.best))}
        ${row('التقييم', rec.trips ? `${stars(rec.rating)} ${rec.rating.toFixed(1)}` : '—')}
        ${rec.bailed ? row('ركاب نزلوا زعلانين', String(rec.bailed), 'minus') : ''}
      </div>
      <div class="tx-net ${rec.net >= 0 ? 'plus' : 'minus'}"><span>الصافي</span><b>${rec.net >= 0 ? '+' : '−'}${money(Math.abs(rec.net))}</b></div>
      <div class="tx-actions"><button type="button" data-a="new">▶ وردية جديدة</button><button type="button" data-a="hist">📒 سجل الورديات</button><button type="button" data-close>تمام</button></div>`;
    this.sheetEl?.close();
    this.sheetEl = sheet('tx-summary', html, (card, sh) => {
      card.querySelector('[data-a="new"]')?.addEventListener('click', () => {
        if (this.clockIn()) sh.close();
      });
      card.querySelector('[data-a="hist"]')?.addEventListener('click', () => this.openHistory(this.vehicle));
    });
  }

  openHistory(v: TaxiVehicle) {
    const list = shiftsOf(v);
    const stars = (n: number) => (n ? `★ ${n.toFixed(1)}` : '—');
    const rows = list.length
      ? list
          .map((r) => {
            const d = new Date(r.at);
            return `<li><span class="h-k">${r.night ? '🌙' : '☀️'}</span><span class="h-d">${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</span><span class="h-t">${r.trips} مشوار · ${r.km.toFixed(1)} كم</span><span class="h-r">${stars(r.rating)}</span><b class="${r.net >= 0 ? 'plus' : 'minus'}">${r.net >= 0 ? '+' : '−'}${money(Math.abs(r.net))}</b></li>`;
          })
          .join('')
      : '<li class="empty">لسه ما خلصتش ولا وردية.</li>';
    const total = list.reduce((n, r) => n + r.net, 0);
    const html = `<h2>📒 سجل الورديات</h2>
      <div class="tx-tabs"><button type="button" data-v="tuktuk" class="${v === 'tuktuk' ? 'on' : ''}">🛺 توكتوك</button><button type="button" data-v="microbus" class="${v === 'microbus' ? 'on' : ''}">🚐 ميكروباص</button></div>
      <p class="tx-sub">آخر ${list.length} وردية · الصافي الكلي ${total >= 0 ? '+' : '−'}${money(Math.abs(Math.round(total)))}</p>
      <ul class="tx-hist">${rows}</ul>
      <div class="tx-actions"><button type="button" data-close>تمام</button></div>`;
    this.sheetEl?.close();
    this.sheetEl = sheet('tx-summary', html, (card) => {
      card
        .querySelectorAll<HTMLElement>('[data-v]')
        .forEach((b) => b.addEventListener('click', () => this.openHistory(b.dataset.v as TaxiVehicle)));
    });
  }

  // ---------- the trip board
  openBoard() {
    const render = () => {
      const car = this.host.state();
      const offers = this.onShift ? tripBoard(this.queues, this.job, this.zone, car) : [];
      const sig = `${this.zone}|${this.onShift}|${this.accepted}|${seatsFree(this.job)}|${offers.map((o) => o.id).join(',')}`;
      return { offers, sig };
    };
    const html = (offers: ReturnType<typeof render>['offers']) => {
      const chips = [{ id: ALL_ZONES, name: 'كل المناطق' }, ...ZONES]
        .map(
          (z) =>
            `<button type="button" class="chip ${z.id === this.zone ? 'on' : ''}" data-zone="${z.id}">${z.name}</button>`
        )
        .join('');
      const rows = !this.onShift
        ? '<li class="empty">انت بره الوردية — اضغط ▶ عند موقف عشان تبدأ.</li>'
        : offers.length
          ? offers
              .map((o) => {
                const look = PERSONA_LOOK[o.persona];
                const near = o.away >= 1000 ? `${(o.away / 1000).toFixed(1)} كم` : `${Math.round(o.away)} م`;
                const on = this.accepted === o.id;
                return `<li class="${on ? 'on' : ''}"><span class="o-who">${look.icon}${o.size > 1 ? `×${o.size}` : ''}</span><span class="o-route"><b>${this.nameOf(o.from).replace(/^موقف /, '')}</b> ← ${this.nameOf(o.to).replace(/^موقف /, '')}<small>${o.km.toFixed(1)} كم · الموقف بعيد عنك ${near}</small></span><span class="o-fare">${money(o.fare)}</span><button type="button" data-acc="${o.id}">${on ? 'اتقبل ✓' : 'اقبل'}</button></li>`;
              })
              .join('')
          : `<li class="empty">${seatsFree(this.job) <= 0 ? 'العربية مليانة.' : 'مفيش ركاب مستنيين هنا دلوقتي — جرّب منطقة تانية أو استنى شوية.'}</li>`;
      return `<h2>🧾 الرحلات المتاحة</h2><div class="tx-chips">${chips}</div><ul class="tx-offers">${rows}</ul><p class="tx-sub">اختار منطقة وبعدين اقبل مشوار، أو سوق لأي موقف والركاب بيركبوا لوحدهم.</p><div class="tx-actions"><button type="button" data-close>تمام</button></div>`;
    };
    let last = '';
    let timer = 0;
    this.sheetEl?.close();
    const bind = (card: HTMLElement, sh: Sheet) => {
      card.querySelectorAll<HTMLElement>('[data-zone]').forEach((b) =>
        b.addEventListener('click', () => {
          this.zone = sanitizeZone(b.dataset.zone);
          setZone(this.zone);
          this.accepted = null;
          last = '';
          refresh(sh);
        })
      );
      card.querySelectorAll<HTMLElement>('[data-acc]').forEach((b) =>
        b.addEventListener('click', () => {
          this.accepted = Number(b.dataset.acc);
          const o = render().offers.find((x) => x.id === this.accepted);
          if (o)
            this.host.status(
              `✅ اتقبل: ${this.nameOf(o.from)} ← ${this.nameOf(o.to)} · ${money(o.fare)} — الموقف متعلّم على الخريطة.`
            );
          sh.close();
        })
      );
    };
    const refresh = (sh: Sheet) => {
      const { offers, sig } = render();
      if (sig === last) return;
      last = sig;
      sh.set(html(offers));
    };
    this.sheetEl = sheet('tx-board', '', bind, () => window.clearInterval(timer));
    refresh(this.sheetEl);
    const sh = this.sheetEl;
    timer = window.setInterval(() => refresh(sh), 1500);
  }

  // ---------- who is in the cab
  /** Small seated people in the windows, one per rider (a party of two shows two). */
  private syncSeated() {
    const key = this.job.riders.map((r) => `${r.persona}${r.size}`).join(',');
    if (key === this.seatKey) return;
    this.seatKey = key;
    for (const c of [...this.seated.children]) c.removeFromParent();
    const spots = SEAT_SPOTS[this.vehicle];
    let i = 0;
    this.job.riders.forEach((r, ri) => {
      for (let k = 0; k < r.size && i < spots.length; k++, i++) {
        const [x, z] = spots[i]!;
        const g = new THREE.Group();
        const shirt = SHIRTS[(ri * 2 + k) % SHIRTS.length]!;
        const skin = SKINS[(r.id + k) % SKINS.length]!;
        const body = new THREE.Mesh(SEAT_BODY, new THREE.MeshLambertMaterial({ color: shirt }));
        body.position.y = 0.15;
        const head = new THREE.Mesh(SEAT_HEAD, new THREE.MeshLambertMaterial({ color: skin }));
        head.position.y = 0.55;
        g.add(body, head);
        g.position.set(x, SEAT_BASE[this.vehicle], z);
        this.seated.add(g);
      }
    });
  }

  /** People who just got in walk to the vehicle, shrink and are gone. */
  private stepBoarding(dt: number) {
    if (!this.boarding.length) return;
    const car = this.host.car().position;
    for (const b of this.boarding) {
      b.t += dt / 0.6;
      const k = Math.min(1, b.t);
      b.mesh.position.set(b.from.x + (car.x - b.from.x) * k, b.from.y + 0.2 * k, b.from.z + (car.z - b.from.z) * k);
      b.mesh.scale.setScalar(1 - 0.7 * k);
    }
    for (const b of this.boarding) if (b.t >= 1) b.mesh.removeFromParent();
    this.boarding = this.boarding.filter((b) => b.t < 1);
  }
}
