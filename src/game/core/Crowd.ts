/**
 * The street crowd at runtime: turns the plan (logic/crowd.ts) into skinned people, walks them along the pavements,
 * has them wait at the kerb and cross when the avenue is red, and hides the ones the camera cannot see.
 */
import * as THREE from 'three';
import { models, MEN, WOMEN } from './Models';
import { CROWD_DRAW_CAP, CROWD_RADIUS, DISTRICT_DENSITY, FACE_LOD_DIST, avenueSegments, planCrowd, type CrowdQuality, type CrowdSpec, type ShopSpot } from '../logic/crowd';
import type { VoiceId } from '../config/barks';
import type { Speaker } from '../ui/Barks';

type State = 'walk' | 'stand' | 'wait' | 'cross' | 'sit';

interface Person {
  spec: CrowdSpec;
  g: THREE.Group;
  state: State;
  dir: number;
  /** pavement lane (x for walkers on the avenue, z for walkers on a cross street) */
  lane: number;
  speed: number;
  /** seconds spent waiting at the kerb */
  waitT: number;
  /** when a bystander last spoke */
  talkT: number;
  /** eyes, brows and lashes (hidden on far people) */
  face: THREE.Object3D[] | null;
  far: boolean;
  d2: number;
}

const HAIRS = [0x16100c, 0x2a1a10, 0x0e0e0e, 0x4a2f1c];
/** height a seated customer is lifted by (the drive clip sits the hips low) */
const SEAT_Y = 0.02;

export class Crowd {
  readonly people: Person[] = [];
  private props = new THREE.Group();
  private radius: number;
  private cap: number;
  private cand: Person[] = [];
  private segs = avenueSegments();
  private fwd = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  /** people currently drawn (for the cost report) */
  drawn = 0;

  constructor(
    parent: THREE.Object3D,
    quality: CrowdQuality,
    shops: ShopSpot[],
    promenadeZ: number,
    private mat: (color: number, o?: THREE.MeshStandardMaterialParameters) => THREE.MeshStandardMaterial
  ) {
    this.radius = CROWD_RADIUS[quality];
    this.cap = CROWD_DRAW_CAP[quality];
    const plan = planCrowd(quality, shops, promenadeZ);
    parent.add(this.props);
    for (const p of plan.props) this.prop(p.kind, p.x, p.z, p.yaw);
    for (const spec of plan.people) this.person(spec);
  }

  private prop(kind: 'table' | 'cart', x: number, z: number, yaw: number) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = yaw;
    const wood = this.mat(0x6b4a2b, { roughness: 0.8 });
    const metal = this.mat(0x8a9098, { metalness: 0.5, roughness: 0.5 });
    if (kind === 'table') {
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 14), metal);
      top.position.y = 0.74;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.72, 6), metal);
      leg.position.y = 0.37;
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.09, 8), this.mat(0xd9c28a, { roughness: 0.2 }));
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
  }

  private person(spec: CrowdSpec) {
    const g = new THREE.Group();
    g.position.set(spec.x, 0, spec.z);
    const pool = spec.female ? WOMEN : MEN;
    const kind = pool[(spec.id * 7 + (spec.top >> 4)) % pool.length]!;
    const hair = spec.role === 'elder' ? 0xc4c4c4 : HAIRS[spec.id % HAIRS.length]!;
    models.dress(g, kind, {
      height: (spec.female ? 1.68 : 1.8) * spec.scale,
      recolor: { Top: spec.top, Hair: hair }
    });
    const moving = spec.kind === 'walk' || spec.kind === 'side' || spec.kind === 'promenade';
    const seated = spec.kind === 'ahwa';
    const state: State = moving ? 'walk' : spec.kind === 'cross' ? 'wait' : seated ? 'sit' : 'stand';
    const p: Person = {
      spec,
      g,
      state,
      dir: spec.dir,
      lane: spec.axis === 'z' ? spec.x : spec.z,
      speed: spec.speed,
      waitT: Math.random() * 2,
      talkT: 0,
      face: null,
      far: false,
      d2: 0
    };
    if (seated) {
      models.setClip(g, 'drive');
      g.position.y = SEAT_Y;
    }
    g.rotation.y = this.facing(p);
    g.visible = false;
    this.people.push(p);
    this.props.parent!.add(g);
  }

  private facing(p: Person): number {
    if (p.state === 'walk' || p.state === 'cross') return p.spec.axis === 'z' ? (p.dir > 0 ? 0 : Math.PI) : p.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    return p.spec.yaw;
  }

  /**
   * Advance everyone near the officer; far people stay frozen and hidden.
   * `panic` is a gunshot place: walkers within 30 m run away from it.
   */
  update(
    dt: number,
    me: THREE.Vector3,
    cam: THREE.Camera,
    green: boolean,
    panic: { x: number; z: number; t: number }
  ) {
    cam.getWorldDirection(this.fwd);
    const fl = Math.hypot(this.fwd.x, this.fwd.z) || 1;
    const fx = this.fwd.x / fl,
      fz = this.fwd.z / fl;
    const R2 = this.radius * this.radius;
    const cand = this.cand;
    cand.length = 0;
    for (const p of this.people) {
      const g = p.g;
      const pos = g.position;
      const dx = pos.x - me.x,
        dz = pos.z - me.z;
      const d2 = dx * dx + dz * dz;
      p.d2 = d2;
      // avenue walkers that fell far behind are moved ahead of the officer, so the pavements around them stay busy
      if (p.spec.kind === 'walk' && d2 > R2 * 1.3) this.recycle(p, me, fz);
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
      this.step(p, dt, me, green, panic);
    }
    this.drawn = cand.length;
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

  /** Put a walker on a pavement 30-38 m ahead (or sometimes behind), more often in the busy districts. */
  private recycle(p: Person, me: THREE.Vector3, fz: number) {
    const ahead = Math.abs(fz) > 0.2 ? Math.sign(fz) : Math.random() < 0.5 ? 1 : -1;
    const dir = Math.random() < 0.75 ? ahead : -ahead;
    const z = me.z + dir * this.radius * (0.7 + Math.random() * 0.22);
    const seg = this.segs.find((g) => z > g.a + 1 && z < g.b - 1);
    if (!seg || Math.random() > DISTRICT_DENSITY[seg.d] / 1.5) return;
    const side = Math.random() < 0.5 ? -1 : 1;
    const lane = side * (5.3 + Math.random() * 2);
    p.lane = lane;
    p.spec.lo = seg.a;
    p.spec.hi = seg.b;
    p.dir = Math.random() < 0.5 ? -1 : 1;
    p.g.position.set(lane, p.g.position.y, z);
    p.g.rotation.y = this.facing(p);
    models.snap(p.g, p.speed);
  }

  private step(p: Person, dt: number, me: THREE.Vector3, green: boolean, panic: { x: number; z: number; t: number }) {
    const s = p.spec;
    const pos = p.g.position;
    if (p.talkT > 0) p.talkT -= dt;
    if (p.state === 'stand' || p.state === 'sit') return;
    let speed = p.speed;
    const scared = panic.t > 0 && Math.abs(pos.z - panic.z) < 30 && Math.abs(pos.x - panic.x) < 30;
    if (p.state === 'wait') {
      p.waitT += dt;
      if (!green && p.waitT > 0.8) {
        p.state = 'cross';
        p.dir = pos.x > 0 ? -1 : 1;
      } else {
        // face across the avenue
        p.g.rotation.y = pos.x > 0 ? -Math.PI / 2 : Math.PI / 2;
        return;
      }
    }
    if (scared) {
      speed = 4.2;
      p.dir = s.axis === 'z' ? (pos.z >= panic.z ? 1 : -1) : pos.x >= panic.x ? 1 : -1;
    } else if (p.state === 'cross') speed = green ? 3.1 : 1.9;
    if (s.axis === 'z') {
      pos.z += p.dir * speed * dt;
      if (pos.z > s.hi - 0.5) p.dir = -1;
      else if (pos.z < s.lo + 0.5) p.dir = 1;
      // step aside for the officer on foot
      let target = p.lane;
      if (Math.abs(me.z - pos.z) < 1.8 && Math.abs(me.x - pos.x) < 1.1) target = pos.x + (pos.x >= me.x ? 1.6 : -1.6);
      pos.x += (Math.max(4.9, Math.min(7.9, Math.abs(target))) * Math.sign(p.lane) - pos.x) * Math.min(1, dt * 1.2);
    } else {
      pos.x += p.dir * speed * dt;
      if (p.state === 'cross') {
        if ((p.dir > 0 && pos.x >= s.hi) || (p.dir < 0 && pos.x <= s.lo)) {
          pos.x = p.dir > 0 ? s.hi : s.lo;
          p.state = 'wait';
          p.waitT = 0;
        }
      } else if (pos.x > s.hi) p.dir = -1;
      else if (pos.x < s.lo) p.dir = 1;
    }
    p.g.rotation.y = this.facing(p);
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

  /** The nearest person within `d` metres (officer-on-foot encounters). */
  nearest(from: THREE.Vector3, d: number): CrowdSpec | null {
    let best: CrowdSpec | null = null;
    let bd = d;
    for (const p of this.people) {
      if (!p.g.visible) continue;
      const k = Math.hypot(p.g.position.x - from.x, p.g.position.z - from.z);
      if (k < bd) {
        bd = k;
        best = p.spec;
      }
    }
    return best;
  }
}
