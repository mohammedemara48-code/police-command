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
  nextTarget,
  payout,
  restock,
  seatsFree,
  seatsUsed,
  seedQueues,
  spotOf,
  stopSpots,
  tickJob,
  TARIFF,
  sanitizeBook,
  type Payout,
  type Queues,
  type Rider,
  type TaxiJob,
  type TaxiVehicle,
  type Waiting
} from '../logic/taxi';
import { CHAT_TOPICS, PERSONA_LOOK, fill, pickTalk, type TalkId } from '../config/taxiTalk';
import { streetNameSign } from '../world/Egypt';
import type { Speaker } from '../ui/Barks';
import { progress, bookEarnings } from '../missions/Levels';

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
  /** fix a damaged vehicle a little (called after each fare) */
  repair: (amount: number) => void;
  /** a person model's clip */
  idle: (g: THREE.Object3D) => void;
}

interface Standing {
  w: Waiting;
  mesh: THREE.Group;
}

const BEAM = {
  waiting: { color: 0x3dff9a, opacity: 0.22 },
  pickup: { color: 0x3dff9a, opacity: 0.55 },
  drop: { color: 0xffd23d, opacity: 0.6 }
} as const;

const money = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)} ج`;

export class TaxiService {
  vehicle: TaxiVehicle = 'tuktuk';
  job: TaxiJob = newJob('tuktuk');
  queues: Queues = emptyQueues();
  /** earned since the shift started */
  session = { total: 0, tips: 0, trips: 0, bailed: 0 };
  private clock = { t: 4 };
  private standing = new Map<number, Standing>();
  private beams = new Map<string, THREE.Mesh>();
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
    this.session = { total: 0, tips: 0, trips: 0, bailed: 0 };
    this.clearStanding();
    this.boardT = 0;
    this.talkT = 8;
    if (!this.active) {
      this.active = true;
      this.buildWorld();
      this.mountHud();
    }
    this.root.visible = true;
    this.hudHtml = '';
    const car = this.host.car();
    this.cabSpeaker = { obj: car, role: 'driver', height: 2.2 };
    this.host.status(
      vehicle === 'tuktuk'
        ? 'اركب التوكتوك وروح أي موقف، الركاب مستنيين.'
        : 'اركب الميكروباص وروح أي موقف، املا الكراسي ووصّل الركاب.'
    );
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.clearStanding();
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
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(1.1, 1.1, 22, 14, 1, true),
          new THREE.MeshBasicMaterial({
            color: 0x3dff9a,
            transparent: true,
            opacity: 0.3,
            depthWrite: false,
            side: THREE.DoubleSide,
            fog: false
          })
        );
        beam.position.set(s.x, 11, s.z);
        beam.visible = false;
        this.beams.set(s.stop.id, beam);
        this.signs.add(beam);
      }
      this.root.add(this.signs);
    }
  }

  private mountHud() {
    const ui = this.host.uiRoot();
    if (!ui) return;
    const el = document.createElement('div');
    el.id = 'street-taxi';
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

    restock(this.queues, this.vehicle, this.clock, dt, Math.random);
    this.syncStanding(me);

    // riders: patience, comfort, complaints
    const gone = tickJob(this.job, dt, { g, hit });
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
      this.session.bailed++;
      this.cab(r, this.line('bail'));
      this.host.status(`😠 ${PERSONA_LOOK[r.persona].name} نزل غضبان قبل ما يوصل — بدون أجرة.`);
      this.feedback = '😠 راكب نزل غضبان';
    }

    // loading and unloading
    if (st.inCar) {
      this.dropOff(car);
      this.pickUp(car, dt);
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
    if (this.hailT <= 0 && st.inCar) {
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

    // beams and the objective arrow
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.12;
      this.refreshTargets(car);
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
    this.session.total += p.total;
    this.session.tips += p.tip;
    this.session.trips += 1;
    bookEarnings(this.vehicle, (e) => addPayout(e, p));
    this.host.repair(25);
    const stars = '★'.repeat(p.stars) + '☆'.repeat(5 - p.stars);
    const id: TalkId = p.tip > 0 ? 'tipDrop' : p.rider.persona === 'cheap' ? 'cheapDrop' : 'drop';
    this.cab(p.rider, this.line(id), 0);
    if (p.comfort > 0.85 && p.onTime) this.cab(p.rider, this.line('approve'), 1500);
    this.host.status(
      `💰 +${money(p.total)}${p.tip ? ` (بقشيش ${money(p.tip)})` : ''} · ${stars}${p.onTime ? '' : ' · اتأخرت'}`
    );
    this.toast = { text: `+${money(p.total)}`, until: performance.now() + 2600 };
    this.feedback = `نزل ${PERSONA_LOOK[p.rider.persona].name} · ${stars}`;
  }

  // ---------- markers and HUD
  private refreshTargets(car: { x: number; z: number }) {
    const t = nextTarget(this.job, this.queues, car);
    const dropIds = new Set(this.job.riders.map((r) => r.to));
    for (const [id, beam] of this.beams) {
      const waiting = this.queues[id]!.length > 0 && seatsFree(this.job) > 0;
      const kind = dropIds.has(id)
        ? 'drop'
        : t?.stop === id && t.kind === 'pickup'
          ? 'pickup'
          : waiting
            ? 'waiting'
            : null;
      beam.visible = !!kind;
      if (kind) {
        const m = beam.material as THREE.MeshBasicMaterial;
        m.color.setHex(BEAM[kind].color);
        m.opacity = BEAM[kind].opacity;
      }
    }
    const spot = t ? spotOf(t.stop) : null;
    this.host.target(spot ? { x: spot.x, z: spot.z } : null);
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

  private renderHud(car: { x: number; z: number; speed: number }) {
    if (!this.hud) return;
    const t = nextTarget(this.job, this.queues, car);
    const spot = t ? spotOf(t.stop) : null;
    const dist = spot ? Math.hypot(spot.x - car.x, spot.z - car.z) : 0;
    const distTxt = dist >= 1000 ? `${(dist / 1000).toFixed(1)} كم` : `${Math.round(dist)} م`;
    const total = this.job.riders.reduce((n, r) => n + payout(r).fare, 0);
    const book = sanitizeBook(progress.earnings)[this.vehicle];
    const seats = TARIFF[this.vehicle].seats;
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
    const state = this.job.riders.length
      ? `🏁 وصّل: <b>${spot ? this.nameOf(t!.stop) : ''}</b> · ${distTxt}`
      : t
        ? `🅿 روح: <b>${this.nameOf(t.stop)}</b> · ${distTxt}`
        : 'مفيش ركاب دلوقتي — استنى شوية';
    const html = `<div class="tx-head"><span>${this.vehicle === 'tuktuk' ? '🛺 توكتوك' : '🚐 ميكروباص'}</span><span class="tx-day">النهارده ${money(this.session.total)}</span></div>
      <div class="tx-state">${state}</div>
      <div class="tx-meter"><small>العداد</small><b>${money(total)}</b><span class="tx-seats">${seatIcons}</span></div>
      ${riderRows ? `<ul class="tx-riders">${riderRows}</ul>` : ''}
      <div class="tx-foot">${this.session.trips} مشوار · بقشيش ${money(this.session.tips)} · إجمالي ${this.vehicle === 'tuktuk' ? 'التوكتوك' : 'الميكروباص'}: ${money(book.total)}${this.feedback ? `<br>${this.feedback}` : ''}</div>
      ${this.toast && performance.now() < this.toast.until ? `<div class="tx-toast">${this.toast.text}</div>` : ''}`;
    if (html !== this.hudHtml) {
      this.hud.innerHTML = html;
      this.hudHtml = html;
    }
  }
}
