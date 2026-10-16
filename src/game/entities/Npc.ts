/**
 * Scripted suspects + officer weapon. Suspect state machine (docs/GAME_DESIGN.md §3):
 * idle → (alerted) → surrender | flee | fight(cover) ; ordered → hands ; cuffed ; down. Non-gory: suspects tip over.
 * Inside `fight`, the gunman's cover/flank behaviour comes from logic/cover.ts.
 */
import * as THREE from 'three';
import { character } from './Character';
import { weaponStats } from '../logic/character';
import { audio } from '../systems/AudioManager';
import { addStat } from '../systems/Achievements';
import { rank, type Behaviour, type SuspectSpec } from '../missions/Levels';
import { findPath, farNode, followPath, onFoot } from '../world/City';
import {
  newGunman,
  stepGunman,
  footStep,
  isHidden,
  pushFromCrate,
  aimFactor,
  type Cover,
  type Gunman,
  type FootSense
} from '../logic/cover';
import type { OBB } from '../logic/collide';
import {
  rollHitZone,
  zoneDamage,
  applyArmor,
  coverDamage,
  officerCovered,
  refillArmor,
  takeAmmoPickup,
  reloadFromReserve,
  nearPickup,
  ARMOR_MAX,
  AMMO_PACK
} from '../logic/combat';

export type SState = 'idle' | 'flee' | 'fight' | 'hands' | 'cuffed' | 'down' | 'hostage' | 'free';
export interface Suspect {
  g: THREE.Group;
  b: Behaviour;
  state: SState;
  hp: number;
  boss: boolean;
  cd: number;
  hidden: boolean;
  ai: Gunman;
  flash: number;
  down: number;
  mats: THREE.MeshStandardMaterial[];
  icon: THREE.Sprite;
  flinch: number;
  cuffT: number;
  path: { x: number; z: number }[];
}

const tA = new THREE.Vector3();
const tB = new THREE.Vector3();

function iconTex(txt: string, bg: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.beginPath();
  g.arc(32, 32, 30, 0, Math.PI * 2);
  g.fill();
  g.font = '34px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(txt, 32, 35);
  return new THREE.CanvasTexture(c);
}

export class Squad {
  hp = 100;
  armor = ARMOR_MAX;
  ammo = 12;
  mag = 12;
  /** spare rounds in the pouch (ammo pickups top this up) */
  reserve = AMMO_PACK;
  dmg = 1;
  list: Suspect[] = [];
  hostage: Suspect | null = null;
  failed: string | null = null;
  threat = 0;
  private cool = 0;
  private reloadT = 0;
  private fireCool = 0.3;
  private hurtT = 0;
  /** difficulty 0..1: how often gunmen change cover and flank */
  skill = 0;
  private crates: THREE.Object3D[] = [];
  private covers: Cover[] = [];
  private pickups: { x: number; z: number; mesh: THREE.Object3D }[] = [];
  private crateGeo = new THREE.BoxGeometry(1.7, 1.15, 0.8);
  private ammoGeo = new THREE.BoxGeometry(0.45, 0.28, 0.32);
  private ammoMat = new THREE.MeshStandardMaterial({
    color: 0x2d6a3e,
    emissive: 0x1a5c2a,
    emissiveIntensity: 0.45,
    roughness: 0.55
  });
  private sense: FootSense = { sx: 0, sz: 0, px: 0, pz: 0, skill: 0 };
  private next = { x: 0, z: 0 };
  private tracers: { line: THREE.Line; t: number }[] = [];
  private tracerMat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true });
  private flashLight = new THREE.PointLight(0xffc860, 0, 7, 2);
  private crateMat = new THREE.MeshStandardMaterial({ color: 0x7a5a32, roughness: 0.9 });
  private icons = {
    hands: iconTex('🙌', '#ffd23dcc'),
    cuffed: iconTex('🔗', '#3aa0ffcc'),
    alert: iconTex('❗', '#ff3b3bcc'),
    hostage: iconTex('🆘', '#ffffffcc')
  };
  onGunfire: ((x: number, z: number) => void) | null = null;
  onShot: (() => void) | null = null;

  constructor(
    private group: THREE.Group,
    private makePerson: (hostage: boolean) => THREE.Group
  ) {
    group.add(this.flashLight);
  }

  resetPlayer() {
    const r = rank();
    const w = weaponStats(character(), r.mag, r.dmg);
    this.mag = w.mag;
    this.dmg = w.dmg;
    this.fireCool = w.cool;
    this.ammo = this.mag;
    this.reserve = AMMO_PACK;
    this.hp = 100;
    this.armor = ARMOR_MAX;
    this.reloadT = 0;
    this.failed = null;
  }

  /** Armory locker: put on a full vest. */
  equipVest() {
    this.armor = refillArmor(this.armor);
  }

  /** Armory / locker: fill mag + a spare pack. */
  restockAmmo() {
    this.ammo = this.mag;
    this.reserve = Math.max(this.reserve, AMMO_PACK * 2);
    this.reloadT = 0;
  }

  private make(spec: { b: Behaviour; boss?: boolean }, x: number, z: number, hostage = false, anchored = false): Suspect {
    const g = this.makePerson(hostage);
    if (spec.boss) g.scale.setScalar(1.12);
    g.position.set(x, 0, z);
    this.group.add(g);
    const mats: THREE.MeshStandardMaterial[] = [];
    g.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
      if (m && m.emissive && !mats.includes(m)) mats.push(m);
    });
    const icon = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.icons.alert, depthTest: false, transparent: true })
    );
    icon.scale.setScalar(0.55);
    icon.position.y = 2.25;
    icon.visible = false;
    icon.renderOrder = 10;
    g.add(icon);
    return {
      g,
      b: spec.b,
      state: hostage ? 'hostage' : 'idle',
      hp: spec.boss ? 8 : 3,
      boss: !!spec.boss,
      cd: 1 + Math.random() * 1.5,
      hidden: false,
      ai: newGunman(anchored),
      flash: 0,
      down: 0,
      mats,
      icon,
      flinch: 0,
      cuffT: 0,
      path: []
    };
  }


  /** Cover crates as oriented boxes for on-foot collision (mutates `out`). */
  appendCrateBoxes(out: OBB[]) {
    for (const c of this.covers) out.push({ x: c.x, z: c.z, yaw: 0, hw: 0.85, hl: 0.4 });
  }

  private addCrate(x: number, z: number) {
    const crate = new THREE.Mesh(this.crateGeo, this.crateMat);
    crate.position.set(x, 0.575, z);
    crate.castShadow = false;
    this.group.add(crate);
    this.crates.push(crate);
    this.covers.push({ x, z, by: -1 });
    return this.covers.length - 1;
  }

  spawn(x: number, z: number, specs: SuspectSpec[], opts: { cover?: boolean; hostage?: boolean; approachZ: number }) {
    const dir = Math.sign(opts.approachZ - z) || -1;
    // hostage takers stay with the hostage: they hide and peek but never leave their crate
    const anchored = !!opts.hostage;
    for (const sp of specs) {
      const s = this.make(sp, x + sp.dx, z + sp.dz, false, anchored);
      s.g.rotation.y = dir > 0 ? 0 : Math.PI;
      if (opts.cover && sp.b === 'fight') {
        const i = this.addCrate(s.g.position.x, s.g.position.z + dir * 1.3);
        this.covers[i]!.by = this.list.length;
        s.ai.cover = i;
        s.ai.mode = 'hide';
        s.ai.t = 0.6 + Math.random();
      }
      this.list.push(s);
    }
    const armed = this.list.filter((s) => s.b === 'fight' && s.ai.cover !== -1);
    if (!anchored && armed.length) {
      // two spare crates out to the sides of the group, so gunmen have somewhere to move to
      const mx = armed.reduce((a, s) => a + s.g.position.x, 0) / armed.length,
        mz = armed.reduce((a, s) => a + s.g.position.z, 0) / armed.length;
      for (const k of [-1, 1]) {
        const cx = mx + k * 6.5,
          cz = mz;
        if (onFoot(cx, cz) && this.covers.every((c) => Math.hypot(c.x - cx, c.z - cz) > 3)) this.addCrate(cx, cz);
      }
    }
    if (opts.hostage) {
      this.hostage = this.make({ b: 'surrender' }, x, z + dir * 0.6, true);
      this.hostage.icon.material.map = this.icons.hostage;
      this.hostage.icon.visible = true;
    }
    if (opts.cover) this.seedAmmoNearScene(x, z, dir);
  }

  /** A couple of ground ammo packs near a shootout / gang / hostage scene. */
  private seedAmmoNearScene(x: number, z: number, dir: number) {
    const spots = [
      { x: x + 3.2, z: z + dir * 2.4 },
      { x: x - 3.5, z: z + dir * 1.2 },
      { x: x + 0.5, z: z - dir * 3.5 }
    ];
    for (const s of spots) {
      if (onFoot(s.x, s.z)) this.addAmmoPickup(s.x, s.z);
    }
  }

  /** Precinct courtyard pack (called from street mode near the station). */
  seedStationAmmo(x: number, z: number) {
    if (this.pickups.some((p) => Math.hypot(p.x - x, p.z - z) < 4)) return;
    this.addAmmoPickup(x, z);
  }

  private addAmmoPickup(x: number, z: number) {
    const mesh = new THREE.Mesh(this.ammoGeo, this.ammoMat);
    mesh.position.set(x, 0.16, z);
    mesh.rotation.y = 0.4;
    // small marker pole so it's readable at a glance
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.55, 6),
      new THREE.MeshStandardMaterial({ color: 0xe8c84a, emissive: 0x886600, emissiveIntensity: 0.35 })
    );
    pole.position.set(0, 0.45, 0);
    mesh.add(pole);
    this.group.add(mesh);
    this.pickups.push({ x, z, mesh });
  }

  /** a single suspect (e.g. the driver after a chase) */
  spawnOne(b: Behaviour, x: number, z: number) {
    const s = this.make({ b }, x, z);
    s.state = b === 'fight' ? 'fight' : b === 'flee' ? 'flee' : 'idle';
    this.list.push(s);
    return s;
  }

  clear() {
    for (const s of this.list) s.g.removeFromParent();
    this.hostage?.g.removeFromParent();
    for (const c of this.crates) c.removeFromParent();
    for (const p of this.pickups) p.mesh.removeFromParent();
    this.list = [];
    this.crates = [];
    this.covers = [];
    this.pickups = [];
    this.hostage = null;
    this.threat = 0;
  }

  /** all suspects arrested or neutralised (and the hostage is safe) */
  done() {
    return this.list.length > 0 && this.list.every((s) => s.state === 'cuffed' || s.state === 'down');
  }
  remaining() {
    return this.list.filter((s) => s.state !== 'cuffed' && s.state !== 'down').length;
  }

  /** closest suspect in front of the officer */
  target(from: THREE.Vector3, yaw: number, range = 24, skipSurrendered = false): Suspect | null {
    let best: Suspect | null = null;
    let bd = range;
    for (const s of this.list) {
      if (s.state === 'down' || s.state === 'cuffed' || (skipSurrendered && s.state === 'hands')) continue;
      const dx = s.g.position.x - from.x,
        dz = s.g.position.z - from.z;
      const d = Math.hypot(dx, dz);
      const a = Math.atan2(dx, dz) - yaw;
      const ang = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
      if (d < bd && (ang < 0.75 || d < 3)) {
        best = s;
        bd = d;
      }
    }
    return best;
  }

  get reloading() {
    return this.reloadT > 0;
  }

  shoot(from: THREE.Vector3, yaw: number) {
    if (this.cool > 0 || this.reloadT > 0) return;
    if (this.ammo <= 0) {
      this.reloadT = 1.3;
      return;
    }
    this.cool = this.fireCool;
    this.ammo--;
    if (this.ammo <= 0) this.reloadT = 1.3;
    audio.gunshot();
    addStat('shots');
    this.onShot?.();
    this.onGunfire?.(from.x, from.z);
    // auto-aim never locks onto someone with hands up (the officer lowers the gun instead)
    const t = this.target(from, yaw, 28, true);
    tA.set(from.x + Math.sin(yaw) * 0.6, 1.35, from.z + Math.cos(yaw) * 0.6);
    this.flashLight.position.copy(tA);
    this.flashLight.intensity = 7;
    // hostage in the line of fire?
    const h = this.hostage;
    if (h && h.state === 'hostage' && t) {
      const hd = Math.hypot(h.g.position.x - from.x, h.g.position.z - from.z);
      const td = Math.hypot(t.g.position.x - from.x, t.g.position.z - from.z);
      const ha = Math.atan2(h.g.position.x - from.x, h.g.position.z - from.z),
        ta = Math.atan2(t.g.position.x - from.x, t.g.position.z - from.z);
      if (hd < td && Math.abs(Math.atan2(Math.sin(ha - ta), Math.cos(ha - ta))) < 0.12 && Math.random() < 0.5) {
        this.tracer(tA, tB.set(h.g.position.x, 1.2, h.g.position.z));
        this.failed = 'الرهينة اتصابت.';
        return;
      }
    }
    if (!t) {
      this.tracer(tA, tB.set(from.x + Math.sin(yaw) * 22, 1.3, from.z + Math.cos(yaw) * 22));
      return;
    }
    if (t.hidden) {
      // bullet hits the cover
      const c = this.covers[t.ai.cover]!;
      this.tracer(tA, tB.set(c.x, 0.9, c.z));
      return;
    }
    this.tracer(tA, tB.set(t.g.position.x, 1.2, t.g.position.z));
    if (Math.random() > 0.88) return;
    if (t.state === 'hands') {
      this.failed = 'ضربت مشتبه به مستسلم — استخدام مفرط للقوة.';
      return;
    }
    // body-zone hit (torso / limbs only — no headshot insta-kill)
    t.hp -= zoneDamage(this.dmg, rollHitZone());
    t.flash = 0.15;
    t.flinch = 0.25;
    addStat('hits');
    if (t.b === 'flee' && t.state === 'flee') {
      this.surrender(t);
      return;
    }
    if (t.boss && t.hp <= 2) {
      this.surrender(t);
      return;
    }
    if (t.hp <= 0) {
      this.release(t);
      t.state = 'down';
      t.down = 0.001;
      t.icon.visible = false;
      addStat('gang');
    } else if (t.state === 'idle') t.state = t.b === 'fight' ? 'fight' : t.b === 'flee' ? 'flee' : 'hands';
  }

  /** frees the gunman's crate for the others */
  private release(s: Suspect) {
    if (s.ai.cover !== -1) this.covers[s.ai.cover]!.by = -1;
    s.ai.cover = -1;
    s.hidden = false;
  }

  private surrender(s: Suspect) {
    this.release(s);
    s.state = 'hands';
    s.g.position.y = 0;
    s.icon.material.map = this.icons.hands;
    s.icon.material.needsUpdate = true;
    s.icon.visible = true;
  }

  /** «استسلم!» — order the targeted suspect to give up */
  order(from: THREE.Vector3, yaw: number) {
    const s = this.target(from, yaw, 18);
    if (!s) return 'مفيش مشتبه به قدامك.';
    if (s.state === 'hands') return 'مستسلم — قرّب وكلبشه.';
    if (s.b === 'surrender' || (s.state === 'idle' && s.b !== 'fight')) {
      if (s.b === 'flee' && Math.random() < 0.5) {
        s.state = 'flee';
        return 'بيجري! الحقه.';
      }
      this.surrender(s);
      return 'رفع إيده. قرّب وكلبشه.';
    }
    if (s.b === 'flee') {
      if (Math.random() < 0.5) {
        this.surrender(s);
        return 'استسلم!';
      }
      s.state = 'flee';
      return 'بيجري! الحقه.';
    }
    s.state = 'fight';
    return 'رافض يستسلم ومسلح!';
  }

  /** suspect with hands up within reach */
  cuffable(from: THREE.Vector3) {
    for (const s of this.list)
      if (s.state === 'hands' && Math.hypot(s.g.position.x - from.x, s.g.position.z - from.z) < 2.6) return s;
    return null;
  }

  cuff(s: Suspect) {
    s.state = 'cuffed';
    s.icon.material.map = this.icons.cuffed;
    s.icon.material.needsUpdate = true;
    s.icon.visible = true;
    addStat('arrests');
    audio.click();
  }

  private tracer(a: THREE.Vector3, b: THREE.Vector3) {
    const geo = new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()]);
    const line = new THREE.Line(geo, this.tracerMat.clone());
    this.group.add(line);
    this.tracers.push({ line, t: 0.08 });
  }

  update(dt: number, player: THREE.Vector3, inCar: boolean) {
    this.cool = Math.max(0, this.cool - dt);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const r = reloadFromReserve(this.ammo, this.mag, this.reserve);
        if (r) {
          this.ammo = r.ammo;
          this.reserve = r.reserve;
        } else {
          // no reserve left: same free mag chamber as before (pickups are a bonus, not a soft-lock)
          this.ammo = this.mag;
        }
      }
    }
    this.collectPickups(player);
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 70);
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.t -= dt;
      if (t.t <= 0) {
        t.line.removeFromParent();
        t.line.geometry.dispose();
        (t.line.material as THREE.Material).dispose();
        this.tracers.splice(i, 1);
      }
    }
    if (this.hurtT > 0) {
      this.hurtT -= dt;
      if (this.hurtT <= 0) document.body.classList.remove('hurt');
    }
    let armed = 0;
    for (let i = 0; i < this.list.length; i++) {
      const s = this.list[i];
      const p = s.g.position;
      if (s.flash > 0) {
        s.flash -= dt;
        for (const m of s.mats) m.emissive.setHex(s.flash > 0 ? 0xff3030 : 0x000000);
      }
      if (s.flinch > 0) {
        s.flinch -= dt;
        s.g.rotation.z = Math.sin(s.flinch * 40) * 0.12;
      } else s.g.rotation.z = 0;
      const dx = player.x - p.x,
        dz = player.z - p.z,
        d = Math.hypot(dx, dz);
      switch (s.state) {
        case 'down':
          s.g.userData.forceClip = 'down';
          p.y = 0;
          if (s.down < 1 && !(s.g.userData.clips as string[] | undefined)?.includes('down')) {
            s.down = Math.min(1, s.down + dt * 3);
            s.g.rotation.x = -s.down * 1.45;
          }
          break;
        case 'cuffed':
          s.g.userData.forceClip = 'idle';
          break;
        case 'hands':
          s.g.rotation.y = Math.atan2(dx, dz);
          s.g.userData.forceClip = 'idle';
          break;
        case 'idle':
          if ((s.b === 'fight' && d < 26) || (s.b === 'flee' && d < 12)) {
            s.state = s.b;
            s.icon.visible = true;
          }
          break;
        case 'flee': {
          if (d < 2.5) {
            this.surrender(s);
            break;
          }
          if (d > 90) {
            this.failed = 'المشتبه به هرب.';
            break;
          }
          // flee AI: A* over the road graph to an intersection far from the officer
          if (!s.path.length) {
            const f = farNode(player.x, player.z);
            s.path = findPath(p.x, p.z, f.x, f.z);
          }
          const head = followPath(p, s.path, 4.1 * dt);
          if (head !== null) s.g.rotation.y = head;
          s.g.userData.forceClip = null;
          break;
        }
        case 'fight': {
          armed++;
          const ai = s.ai,
            fs = this.sense;
          fs.sx = p.x;
          fs.sz = p.z;
          fs.px = player.x;
          fs.pz = player.z;
          fs.skill = this.skill;
          stepGunman(ai, i, this.covers, fs, dt);
          const q = footStep(ai, this.covers, fs, d, dt, this.next);
          if (q.x !== p.x || q.z !== p.z) {
            for (const c of this.covers) pushFromCrate(q, c);
            if (onFoot(q.x, q.z)) {
              if (ai.mode === 'move') s.g.rotation.y = Math.atan2(q.x - p.x, q.z - p.z);
              p.x = q.x;
              p.z = q.z;
            } else if (ai.mode === 'flank') ai.side = -ai.side; // ran into a wall: sidestep the other way
          }
          if (ai.mode !== 'move') s.g.rotation.y = Math.atan2(dx, dz);
          fs.sx = p.x;
          fs.sz = p.z;
          s.hidden = isHidden(ai, this.covers, fs);
          const crouch = ai.mode === 'hide' && ai.cover !== -1;
          p.y += ((crouch ? -0.75 : 0) - p.y) * Math.min(1, dt * 10);
          const running = ai.mode === 'move' || ai.mode === 'flank';
          s.g.userData.forceClip = s.flinch > 0 ? 'hit' : running ? null : crouch ? 'idle' : 'gun';
          s.cd -= dt;
          const aim = aimFactor(ai.mode);
          if (aim > 0 && !s.hidden && s.cd <= 0 && d < 24) {
            s.cd = 1.2 + Math.random() * 1.3;
            const hit = Math.random() < (inCar ? 0.12 : 0.3) * aim;
            tA.set(p.x, 1.35 + p.y, p.z);
            this.tracer(
              tA,
              tB.set(
                player.x + (hit ? 0 : (Math.random() - 0.5) * 3),
                1.2,
                player.z + (hit ? 0 : (Math.random() - 0.5) * 3)
              )
            );
            audio.sample('gunshot', 0.35, 1.1);
            this.onGunfire?.(p.x, p.z);
            if (hit) this.damage(inCar ? 5 : 9, p.x, p.z, player);
          }
          break;
        }
      }
    }
    const h = this.hostage;
    if (h) {
      if (h.state === 'hostage' && this.list.every((s) => s.state !== 'fight' && s.state !== 'idle')) {
        h.state = 'free';
        h.icon.visible = false;
        h.cd = 4;
      }
      if (h.state === 'free') {
        h.cd -= dt;
        h.g.position.z -= dt * 3.5;
        h.g.userData.forceClip = null;
        if (h.cd <= 0) {
          h.g.removeFromParent();
          this.hostage = null;
        }
      }
    }
    const want = Math.min(5, armed + (this.list.some((s) => s.state === 'flee') ? 1 : 0));
    this.threat += (want - this.threat) * Math.min(1, dt * 1.5);
    if (this.hp <= 0 && !this.failed) this.failed = 'الضابط اتصاب.';
  }

  private damage(n: number, fromX?: number, fromZ?: number, player?: THREE.Vector3) {
    let incoming = n;
    if (player && fromX !== undefined && fromZ !== undefined) {
      const covered = officerCovered(this.covers, player.x, player.z, fromX, fromZ);
      incoming = coverDamage(incoming, covered);
    }
    const r = applyArmor(incoming, this.armor);
    this.armor = r.armor;
    this.hp = Math.max(0, this.hp - r.hp);
    document.body.classList.add('hurt');
    this.hurtT = 0.25;
  }

  private collectPickups(player: THREE.Vector3) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i]!;
      if (!nearPickup(player.x, player.z, p.x, p.z)) continue;
      const got = takeAmmoPickup(this.ammo, this.mag, this.reserve);
      if (!got) continue;
      this.ammo = got.ammo;
      this.reserve = got.reserve;
      p.mesh.removeFromParent();
      this.pickups.splice(i, 1);
      audio.sample('confirm', 0.55);
    }
  }
}
