/** Gang shootouts: officer pistol with auto-aim, armed gang NPCs that shoot back, health/armor, hit effects (non-gory). */
import * as THREE from 'three';
import { audio } from './AudioManager';
import { addStat } from './Achievements';

export interface Gangster { g: THREE.Group; hp: number; cd: number; down: number; flash: number; mats: THREE.MeshStandardMaterial[] }

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

export class Combat {
  hp = 100;
  armor = 50;
  active = false;
  gang: Gangster[] = [];
  private cool = 0;
  private hurtT = 0;
  private tracers: { line: THREE.Line; t: number }[] = [];
  private tracerMat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true });
  private flashLight = new THREE.PointLight(0xffc860, 0, 6, 2);
  hud: HTMLElement | null = null;
  onEnd: ((win: boolean) => void) | null = null;

  constructor(private group: THREE.Group, private makeGangster: () => THREE.Group) {
    group.add(this.flashLight);
  }

  start(cx: number, cz: number, count: number) {
    this.clear();
    this.hp = 100;
    this.armor = 50;
    this.active = true;
    for (let i = 0; i < count; i++) {
      const g = this.makeGangster();
      const side = i % 2 ? 1 : -1;
      g.position.set(side * (2 + Math.random() * 4), 0, cz + 10 + i * 3.2 + Math.random() * 2);
      g.rotation.y = Math.PI;
      this.group.add(g);
      const mats: THREE.MeshStandardMaterial[] = [];
      g.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial; if (m && m.emissive && !mats.includes(m)) mats.push(m); });
      this.gang.push({ g, hp: 3, cd: 1.5 + Math.random() * 1.5, down: 0, flash: 0, mats });
    }
    void cx;
    this.renderHud();
  }

  clear() {
    for (const m of this.gang) m.g.removeFromParent();
    this.gang = [];
    this.active = false;
    this.renderHud();
  }

  alive() { return this.gang.filter((m) => m.hp > 0); }

  /** Shoot from `from` (facing yaw). Auto-aims at the closest living gangster inside a forward cone. */
  shoot(from: THREE.Vector3, yaw: number) {
    if (this.cool > 0) return null;
    this.cool = 0.32;
    audio.gunshot();
    addStat('shots');
    let best: Gangster | null = null;
    let bestD = 26;
    for (const m of this.gang) {
      if (m.hp <= 0) continue;
      const dx = m.g.position.x - from.x;
      const dz = m.g.position.z - from.z;
      const d = Math.hypot(dx, dz);
      const ang = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - yaw), Math.cos(Math.atan2(dx, dz) - yaw)));
      if (d < bestD && ang < 0.9) { best = m; bestD = d; }
    }
    tmpA.set(from.x + Math.sin(yaw) * 0.5, 1.35, from.z + Math.cos(yaw) * 0.5);
    if (best) tmpB.set(best.g.position.x, 1.2, best.g.position.z);
    else tmpB.set(from.x + Math.sin(yaw) * 20, 1.3, from.z + Math.cos(yaw) * 20);
    this.tracer(tmpA, tmpB);
    this.flashLight.position.copy(tmpA);
    this.flashLight.intensity = 6;
    if (best && Math.random() < 0.85) {
      best.hp--;
      best.flash = 0.15;
      addStat('hits');
      if (best.hp <= 0) {
        best.down = 0.001;
        best.g.userData.forceClip = 'down';
        addStat('gang');
        audio.click();
      }
      this.renderHud();
    }
    return best;
  }

  private tracer(a: THREE.Vector3, b: THREE.Vector3) {
    const geo = new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()]);
    const line = new THREE.Line(geo, this.tracerMat.clone());
    this.group.add(line);
    this.tracers.push({ line, t: 0.09 });
  }

  /** Returns false if the player was taken down. */
  update(dt: number, player: THREE.Vector3, inCar: boolean) {
    this.cool = Math.max(0, this.cool - dt);
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 60);
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.t -= dt;
      if (t.t <= 0) { t.line.removeFromParent(); t.line.geometry.dispose(); (t.line.material as THREE.Material).dispose(); this.tracers.splice(i, 1); }
    }
    if (this.hurtT > 0) { this.hurtT -= dt; if (this.hurtT <= 0) document.body.classList.remove('hurt'); }
    if (!this.active) return;
    for (const m of this.gang) {
      if (m.flash > 0) {
        m.flash -= dt;
        for (const mt of m.mats) mt.emissive.setHex(m.flash > 0 ? 0xff3030 : 0x000000);
      }
      if (m.hp <= 0) {
        // non-gory knockdown: tip over, fade into a "neutralized" pose
        if (m.down < 1) { m.down = Math.min(1, m.down + dt * 3); if (!m.g.userData.hasDown) m.g.rotation.x = -m.down * Math.PI / 2 * 0.95; }
        continue;
      }
      const dx = player.x - m.g.position.x;
      const dz = player.z - m.g.position.z;
      const d = Math.hypot(dx, dz);
      m.g.rotation.y = Math.atan2(dx, dz);
      if (d > 4 && d < 30) {
        m.g.position.x += (dx / d) * dt * 0.8;
        m.g.position.z += (dz / d) * dt * 0.8;
      }
      m.g.userData.forceClip = d < 22 ? 'gun' : null;
      m.cd -= dt;
      if (m.cd <= 0 && d < 22) {
        m.cd = 1.3 + Math.random() * 1.4;
        tmpA.set(m.g.position.x, 1.35, m.g.position.z);
        const hit = Math.random() < (inCar ? 0.18 : 0.38);
        tmpB.set(player.x + (hit ? 0 : (Math.random() - 0.5) * 3), 1.2, player.z + (hit ? 0 : (Math.random() - 0.5) * 3));
        this.tracer(tmpA, tmpB);
        audio.sample('gunshot', 0.35, 1.1);
        if (hit) this.damage(inCar ? 5 : 9);
      }
    }
    if (!this.alive().length) { this.active = false; this.onEnd?.(true); }
    else if (this.hp <= 0) { this.active = false; this.onEnd?.(false); }
  }

  private damage(n: number) {
    const a = Math.min(this.armor, n * 0.7);
    this.armor -= a;
    this.hp = Math.max(0, this.hp - (n - a));
    document.body.classList.add('hurt');
    this.hurtT = 0.25;
    this.renderHud();
  }

  renderHud() {
    if (!this.hud) return;
    if (!this.active && !this.gang.length) { this.hud.style.display = 'none'; return; }
    this.hud.style.display = 'block';
    this.hud.innerHTML = `<div class="bar hp"><i style="width:${this.hp}%"></i><span>❤ ${Math.round(this.hp)}</span></div>
      <div class="bar ar"><i style="width:${this.armor * 2}%"></i><span>🛡 ${Math.round(this.armor)}</span></div>
      <div class="gang-left">العصابة: ${this.alive().length}/${this.gang.length}</div>`;
  }
}
