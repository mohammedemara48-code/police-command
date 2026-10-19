/**
 * The street crowd at runtime: turns the plan (logic/crowd.ts) into skinned people, walks them along the pavements,
 * has them wait at the kerb and cross when the avenue is red, and hides the ones the camera cannot see.
 */
import * as THREE from 'three';
import { models, MEN, WOMEN } from './Models';
import {
  CROWD_DRAW_CAP,
  CROWD_RADIUS,
  FACE_LOD_DIST,
  crossings,
  advanceLane,
  dodgeRoom,
  lanePose,
  pickCrossing,
  pickLane,
  planCrowd,
  type Crossing,
  type CrowdQuality,
  type CrowdSpec,
  type Lane,
  type ShopSpot
} from '../logic/crowd';
import { armAxis, axisGreen, signalNodes } from '../logic/signals';
import { net } from '../logic/roadnet';
import { rng } from '../logic/roadnet';
import type { VoiceId } from '../config/barks';
import type { Speaker } from '../ui/Barks';

type State = 'away' | 'walk' | 'stand' | 'wait' | 'cross' | 'sit';

interface Person {
  spec: CrowdSpec;
  g: THREE.Group;
  state: State;
  lane: Lane | null;
  speed: number;
  /** seconds spent waiting at the kerb / before looking for a new place */
  waitT: number;
  /** when a bystander last spoke */
  talkT: number;
  /** eyes, brows and lashes (hidden on far people) */
  face: THREE.Object3D[] | null;
  far: boolean;
  d2: number;
  /** where a standing person stands */
  x: number;
  z: number;
  yaw: number;
  /** a zebra crossing and the position across the street (m from the middle, negative = right pavement) */
  zebra: Crossing | null;
  tc: number;
  tcDir: 1 | -1;
  /** jump left over from the last junction (fades out) and the step aside for the officer */
  lx: number;
  lz: number;
  dodge: number;
}

const HAIRS = [0x16100c, 0x2a1a10, 0x0e0e0e, 0x4a2f1c];
/** height a seated customer is lifted by (the drive clip sits the hips low) */
const SEAT_Y = 0.02;

export interface CrowdWorld {
  shopsNear(x: number, z: number, r: number): ShopSpot[];
}

export class Crowd {
  readonly people: Person[] = [];
  private props = new THREE.Group();
  private radius: number;
  private cap: number;
  private cand: Person[] = [];
  private fwd = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private rnd = rng(77);
  private sig = new Set<number>(signalNodes().map((n) => n.id));
  private groups = new Map<number, Person[]>();
  private sets = new Map<number, { people: Person[]; prop: THREE.Group }>();
  /** people currently drawn (for the cost report) */
  drawn = 0;

  constructor(
    parent: THREE.Object3D,
    quality: CrowdQuality,
    private world: CrowdWorld,
    private mat: (color: number, o?: THREE.MeshStandardMaterialParameters) => THREE.MeshStandardMaterial
  ) {
    this.radius = CROWD_RADIUS[quality];
    this.cap = CROWD_DRAW_CAP[quality];
    parent.add(this.props);
    for (const spec of planCrowd(quality)) this.person(spec);
  }

  private prop(kind: 'table' | 'cart') {
    const g = new THREE.Group();
    g.visible = false;
    const wood = this.mat(0x6b4a2b, { roughness: 0.8 });
    const metal = this.mat(0x8a9098, { metalness: 0.5, roughness: 0.5 });
    if (kind === 'table') {
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 14), metal);
      top.position.y = 0.74;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.72, 6), metal);
      leg.position.y = 0.37;
      const glass = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.03, 0.09, 8),
        this.mat(0xd9c28a, { roughness: 0.2 })
      );
      glass.position.set(0.1, 0.8, 0.06);
      const glass2 = glass.clone();
      glass2.position.set(-0.12, 0.8, -0.08);
      g.add(top, leg, glass, glass2);
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + 0.6;
        const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.44, 8), wood);
        stool.position.set(Math.cos(a) * 0.95, 0.22, Math.sin(a) * 0.95);
        g.add(stool);
      }
    } else {
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 0.75), this.mat(0x2f6e8a, { roughness: 0.6 }));
      body.position.y = 0.85;
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.06, 0.8), wood);
      top.position.y = 1.28;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 6), metal);
      pole.position.set(0, 1.8, 0);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.35, 10), this.mat(0xd6452f, { roughness: 0.7 }));
      shade.position.y = 2.45;
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 10), this.mat(0x111111));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(0, 0.28, 0.42);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 0.5), this.mat(0xe0b341, { roughness: 0.7 }));
      stock.position.y = 1.4;
      g.add(body, top, pole, shade, wheel, stock);
    }
    this.props.add(g);
    return g;
  }

  private person(spec: CrowdSpec) {
    const g = new THREE.Group();
    const pool = spec.female ? WOMEN : MEN;
    const kind = pool[(spec.id * 7 + (spec.top >> 4)) % pool.length]!;
    const hair = spec.role === 'elder' ? 0xc4c4c4 : HAIRS[spec.id % HAIRS.length]!;
    models.dress(g, kind, {
      height: (spec.female ? 1.68 : 1.8) * spec.scale,
      recolor: { Top: spec.top, Hair: hair }
    });
    const p: Person = {
      spec,
      g,
      state: 'away',
      lane: null,
      speed: spec.speed,
      waitT: Math.random() * 2,
      talkT: 0,
      face: null,
      far: false,
      d2: 1e9,
      x: 0,
      z: 0,
      yaw: 0,
      zebra: null,
      tc: 0,
      tcDir: 1,
      lx: 0,
      lz: 0,
      dodge: 0
    };
    if (spec.kind === 'ahwa') {
      models.setClip(g, 'drive');
      g.position.y = SEAT_Y;
    }
    g.visible = false;
    this.people.push(p);
    this.props.parent!.add(g);
    if (spec.group >= 0) {
      const list = this.groups.get(spec.group) ?? [];
      list.push(p);
      this.groups.set(spec.group, list);
    }
    if (spec.set >= 0) {
      let st = this.sets.get(spec.set);
      if (!st)
        this.sets.set(spec.set, (st = { people: [], prop: this.prop(spec.kind === 'vendor' ? 'cart' : 'table') }));
      st.people.push(p);
    }
  }

  /**
   * Advance everyone near the officer; far people stay frozen and hidden and are put on a pavement near the officer when they
   * fall behind. `panic` is a gunshot place: walkers within 30 m run away from it. `clock` is the signal clock.
   */
  update(dt: number, me: THREE.Vector3, cam: THREE.Camera, clock: number, panic: { x: number; z: number; t: number }) {
    cam.getWorldDirection(this.fwd);
    const fl = Math.hypot(this.fwd.x, this.fwd.z) || 1;
    const fx = this.fwd.x / fl,
      fz = this.fwd.z / fl;
    const R2 = this.radius * this.radius;
    const cand = this.cand;
    cand.length = 0;
    let budget = 3; // placements per frame: choosing a spot scans the streets nearby
    // after a teleport most people are out of range at once: spread them over the whole circle instead of one band
    let lost = 0;
    for (const p of this.people) {
      const dx = p.g.position.x - me.x,
        dz = p.g.position.z - me.z;
      if (p.state === 'away' || dx * dx + dz * dz > R2 * 1.3) lost++;
    }
    const spread = lost > this.people.length * 0.5;
    for (const p of this.people) {
      const g = p.g;
      const pos = g.position;
      const dx = pos.x - me.x,
        dz = pos.z - me.z;
      let d2 = dx * dx + dz * dz;
      const left = p.state === 'away' || d2 > R2 * 1.3;
      if (
        left &&
        !(p.spec.group >= 0 && p.spec.group !== this.leaderOf(p, 'group')) &&
        !(p.spec.set >= 0 && p !== this.leaderOf(p, 'set'))
      ) {
        p.waitT -= dt;
        if (p.waitT <= 0 && budget > 0) {
          budget--;
          p.waitT = 0.4 + Math.random() * 0.6;
          this.place(p, me, fx, fz, spread);
          d2 = (pos.x - me.x) ** 2 + (pos.z - me.z) ** 2;
        }
      }
      p.d2 = d2;
      if (p.state === 'away') {
        if (g.visible) g.visible = false;
        continue;
      }
      // skinned meshes are never frustum-culled by three, so people behind the camera are hidden here
      const behind = (pos.x - cam.position.x) * fx + (pos.z - cam.position.z) * fz < -3 && d2 > 25;
      if (d2 < R2 && !behind) cand.push(p);
      else if (g.visible) g.visible = false;
    }
    // only the nearest few are drawn
    if (cand.length > this.cap) {
      cand.sort((a, b) => a.d2 - b.d2);
      for (let i = this.cap; i < cand.length; i++) cand[i]!.g.visible = false;
      cand.length = this.cap;
    }
    for (const p of cand) {
      if (!p.g.visible) p.g.visible = true;
      this.lod(p);
      this.step(p, dt, me, clock, panic);
    }
    for (const st of this.sets.values()) {
      const lead = st.people[0]!;
      st.prop.visible = lead.state !== 'away' && lead.d2 < R2 * 1.1;
    }
    this.drawn = cand.length;
  }

  /** The first person of a chat group or table: it decides when the whole set moves. */
  private leaderOf(p: Person, by: 'group' | 'set'): number | Person {
    if (by === 'group') {
      const list = this.groups.get(p.spec.group);
      return list ? list[0]!.spec.id : -1;
    }
    return this.sets.get(p.spec.set)?.people[0] ?? p;
  }

  private lod(p: Person) {
    if (!p.face) {
      if (!p.g.userData.dressed) return;
      p.face = [];
      p.g.traverse((o) => {
        const m = o as THREE.Mesh;
        const n = (m.material as THREE.Material | undefined)?.name;
        if (m.isMesh && (n === 'Brows' || n === 'Eyes' || n === 'Human.eyelashes01')) p.face!.push(o);
      });
    }
    const far = p.d2 > FACE_LOD_DIST * FACE_LOD_DIST;
    if (far === p.far && p.face.length) return;
    p.far = far;
    for (const o of p.face) o.visible = !far;
  }

  // ---------------------------------------------------------------- placement
  private put(p: Person, x: number, z: number, yaw: number) {
    p.g.position.x = x;
    p.g.position.z = z;
    p.g.rotation.y = yaw;
    p.lx = p.lz = p.dodge = 0;
    models.snap(p.g, p.speed);
  }

  private place(p: Person, me: THREE.Vector3, fx: number, fz: number, spread: boolean) {
    const R = this.radius;
    const o = {
      rMin: R * (spread ? 0.15 : 0.7),
      rMax: R * (spread ? 0.95 : 0.94),
      ahead: { x: fx, z: fz }
    };
    const k = p.spec.kind;
    p.zebra = null;
    if (k === 'walk' || k === 'side' || k === 'promenade') {
      const lane = pickLane(me, this.rnd, {
        ...o,
        dense: k !== 'promenade',
        sid: k === 'promenade' ? 'corniche' : undefined
      });
      if (!lane) return void (p.state = 'away');
      p.lane = lane;
      p.state = 'walk';
      const q = lanePose(lane);
      this.put(p, q.x, q.z, q.yaw);
    } else if (k === 'cross') {
      const z = pickCrossing(me, this.rnd, crossings(this.sig), o.rMin * 0.6, o.rMax);
      if (!z) return void (p.state = 'away');
      p.zebra = z;
      p.state = 'wait';
      p.waitT = 0;
      p.tc = (this.rnd() < 0.5 ? -1 : 1) * z.reach;
      this.crossPose(p);
      this.put(p, p.g.position.x, p.g.position.z, p.g.rotation.y);
    } else if (k === 'shop') {
      const shops = this.world.shopsNear(me.x, me.z, R * 0.9).filter((s) => {
        const d = Math.hypot(s.x - me.x, s.z - me.z);
        if (d < o.rMin * 0.5) return false;
        return !this.people.some(
          (q) => q !== p && q.spec.kind === 'shop' && q.state === 'stand' && Math.hypot(q.x - s.x, q.z - s.z) < 4
        );
      });
      const s = shops[Math.floor(this.rnd() * shops.length)];
      if (!s) return void (p.state = 'away');
      p.state = 'stand';
      p.spec.shop = s.name;
      p.x = s.x;
      p.z = s.z;
      p.yaw = (s.yaw ?? 0) + Math.PI;
      this.put(p, p.x, p.z, p.yaw);
    } else if (k === 'group') {
      const list = this.groups.get(p.spec.group)!;
      const lane = pickLane(me, this.rnd, { ...o, off: 1.3 + this.rnd() * 0.9, dense: true });
      if (!lane) return void list.forEach((m) => (m.state = 'away'));
      const q = lanePose(lane);
      const fwd = { x: Math.sin(q.yaw), z: Math.cos(q.yaw) };
      list.forEach((m, i) => {
        const a = (i - (list.length - 1) / 2) * 1.0;
        m.state = 'stand';
        m.x = q.x + fwd.x * a;
        m.z = q.z + fwd.z * a;
        // face the middle of the group
        m.yaw = a === 0 ? q.yaw + Math.PI / 2 : a < 0 ? q.yaw : q.yaw + Math.PI;
        this.put(m, m.x, m.z, m.yaw);
      });
    } else if (k === 'ahwa' || k === 'vendor') {
      const st = this.sets.get(p.spec.set)!;
      const lane = pickLane(me, this.rnd, { ...o, off: k === 'ahwa' ? 2.0 : 0.95, dense: true });
      if (!lane) return void st.people.forEach((m) => (m.state = 'away'));
      const q = lanePose(lane);
      const nx = Math.cos(q.yaw) * lane.rel,
        nz = -Math.sin(q.yaw) * lane.rel; // towards the carriageway is the negative of this
      st.prop.position.set(q.x, 0, q.z);
      if (k === 'ahwa') {
        st.prop.rotation.y = 0;
        st.people.forEach((m, i) => {
          const a = (i / st.people.length) * Math.PI * 2 + 0.6;
          m.state = 'sit';
          m.x = q.x + Math.cos(a) * 0.95;
          m.z = q.z + Math.sin(a) * 0.95;
          m.yaw = Math.atan2(-Math.cos(a), -Math.sin(a));
          this.put(m, m.x, m.z, m.yaw);
          m.g.position.y = SEAT_Y;
        });
      } else {
        st.prop.rotation.y = q.yaw + Math.PI / 2;
        st.people.forEach((m) => {
          m.state = 'stand';
          // the vendor stands behind the cart, on the building side, facing the street
          m.x = q.x + nx * 0.95;
          m.z = q.z + nz * 0.95;
          m.yaw = Math.atan2(-nx, -nz);
          this.put(m, m.x, m.z, m.yaw);
        });
      }
    }
  }

  /** Where a person crossing at a zebra is, from their position across the street. */
  private crossPose(p: Person) {
    const z = p.zebra!;
    const ax = Math.cos(z.yaw),
      az = -Math.sin(z.yaw);
    p.g.position.x = z.x + ax * p.tc;
    p.g.position.z = z.z + az * p.tc;
    const d = p.state === 'cross' ? p.tcDir : p.tc > 0 ? -1 : 1;
    p.g.rotation.y = Math.atan2(ax * d, az * d);
  }

  private step(p: Person, dt: number, me: THREE.Vector3, clock: number, panic: { x: number; z: number; t: number }) {
    const pos = p.g.position;
    if (p.talkT > 0) p.talkT -= dt;
    if (p.state === 'stand' || p.state === 'sit') return;
    const scared = panic.t > 0 && Math.abs(pos.z - panic.z) < 30 && Math.abs(pos.x - panic.x) < 30;
    if (p.state === 'wait' || p.state === 'cross') {
      const z = p.zebra!;
      // the cars on this arm have a red light: it is safe to cross
      const red = !axisGreen(clock, armAxis(net().nodes[z.node]!, net().edges[z.edge]!));
      if (p.state === 'wait') {
        p.waitT += dt;
        if ((red && p.waitT > 0.8) || scared) {
          p.state = 'cross';
          p.tcDir = p.tc > 0 ? -1 : 1;
        }
      } else {
        const speed = scared ? 4.2 : red ? 1.9 : 3.1;
        p.tc += p.tcDir * speed * dt;
        if ((p.tcDir > 0 && p.tc >= z.reach) || (p.tcDir < 0 && p.tc <= -z.reach)) {
          p.tc = p.tcDir * z.reach;
          p.state = 'wait';
          p.waitT = 0;
        }
      }
      this.crossPose(p);
      return;
    }
    // walking along a pavement
    const lane = p.lane;
    if (!lane) return;
    let speed = p.speed;
    if (scared) {
      speed = 4.2;
      // run away from the shot
      const q = lanePose(lane);
      const away = (q.x - panic.x) * Math.sin(q.yaw) + (q.z - panic.z) * Math.cos(q.yaw);
      if (away < 0) {
        lane.dir = -lane.dir as 1 | -1;
        lane.rel = -lane.rel as 1 | -1;
      }
    }
    {
      const sid = p.spec.kind === 'promenade' ? 'corniche' : undefined;
      const before = lanePose(lane);
      const step = advanceLane(lane, speed * dt, this.rnd, sid);
      p.lane = step.lane;
      if (step.stuck) {
        p.state = 'away';
        return;
      }
      if (step.turned) {
        const after = lanePose(p.lane);
        p.lx = before.x - after.x;
        p.lz = before.z - after.z;
      }
    }
    const q = lanePose(p.lane!);
    // step aside for the officer on foot
    const rx = Math.cos(q.yaw),
      rz = -Math.sin(q.yaw);
    const ox = me.x - pos.x,
      oz = me.z - pos.z;
    let want = 0;
    if (ox * ox + oz * oz < 2.2 * 2.2 && Math.abs(ox * Math.sin(q.yaw) + oz * Math.cos(q.yaw)) < 1.8)
      want = ox * rx + oz * rz > 0 ? -1.3 : 1.3;
    // never step into the road to let the officer pass: towards the carriageway is -rel along the right-hand vector
    if (want * p.lane!.rel < 0) want = Math.sign(want) * Math.min(Math.abs(want), dodgeRoom(p.lane!));
    p.dodge += (want - p.dodge) * Math.min(1, dt * 3);
    const k = Math.exp(-dt * 3);
    p.lx *= k;
    p.lz *= k;
    pos.x = q.x + p.lx + rx * p.dodge;
    pos.z = q.z + p.lz + rz * p.dodge;
    p.g.rotation.y = q.yaw;
  }

  /** On-screen test in normalised device coordinates. */
  onScreen(obj: THREE.Object3D, h: number, cam: THREE.Camera): boolean {
    obj.getWorldPosition(this.tmp);
    this.tmp.y += h;
    this.tmp.project(cam);
    return this.tmp.z < 1 && Math.abs(this.tmp.x) < 0.85 && this.tmp.y > -0.8 && this.tmp.y < 0.85;
  }

  /** A visible person with one of these roles near `from`, nearest to `focus` first. */
  speakerFor(
    who: readonly VoiceId[],
    cam: THREE.Camera,
    from: THREE.Vector3,
    maxD: number,
    focus: THREE.Vector3 = from,
    only?: (s: CrowdSpec) => boolean
  ): Speaker | null {
    let best: Person | null = null;
    let bestD = Infinity;
    for (const p of this.people) {
      if (!p.g.visible || !who.includes(p.spec.role)) continue;
      if (only && !only(p.spec)) continue;
      const pos = p.g.position;
      if (Math.hypot(pos.x - from.x, pos.z - from.z) > maxD) continue;
      const d = Math.hypot(pos.x - focus.x, pos.z - focus.z) + who.indexOf(p.spec.role) * 1.5;
      if (d >= bestD) continue;
      if (!this.onScreen(p.g, 1.9 * p.spec.scale, cam)) continue;
      best = p;
      bestD = d;
    }
    return best ? { obj: best.g, role: best.spec.role, height: 1.95 * best.spec.scale } : null;
  }

  /** Two visible, on-screen members of one chatting group (closest to the officer). */
  chatPair(cam: THREE.Camera, from: THREE.Vector3, maxD: number) {
    const byGroup = new Map<number, Person[]>();
    for (const p of this.people) {
      if (p.spec.group < 0 || !p.g.visible) continue;
      const list = byGroup.get(p.spec.group) ?? [];
      list.push(p);
      byGroup.set(p.spec.group, list);
    }
    let best: { a: Person; b: Person; d: number } | null = null;
    for (const list of byGroup.values()) {
      if (list.length < 2) continue;
      const a = list[0]!,
        b = list[1]!;
      const d = Math.hypot(a.g.position.x - from.x, a.g.position.z - from.z);
      if (d > maxD || (best && d >= best.d)) continue;
      if (!this.onScreen(a.g, 1.9, cam) || !this.onScreen(b.g, 1.9, cam)) continue;
      best = { a, b, d };
    }
    if (!best) return null;
    const sp = (p: Person): Speaker => ({ obj: p.g, role: p.spec.role, height: 1.95 * p.spec.scale });
    return { chat: best.a.spec.chat!, a: sp(best.a), b: sp(best.b) };
  }

  /** The nearest person within `d` metres (officer-on-foot encounters), with where they stand now. */
  nearest(from: THREE.Vector3, d: number): (CrowdSpec & { x: number; z: number }) | null {
    let best: Person | null = null;
    let bd = d;
    for (const p of this.people) {
      if (!p.g.visible) continue;
      const k = Math.hypot(p.g.position.x - from.x, p.g.position.z - from.z);
      if (k < bd) {
        bd = k;
        best = p;
      }
    }
    return best ? { ...best.spec, x: best.g.position.x, z: best.g.position.z } : null;
  }
}
