import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * Low-poly CC0 models (Kenney Car Kit, Mini Characters, City Kit Commercial).
 * Primitive placeholder meshes stay until the model is loaded, then get swapped.
 */
export type ModelKind =
  | 'police' | 'sedan' | 'taxi' | 'suv' | 'van' | 'sedan-sports'
  | 'character-male-a' | 'character-female-a' | 'character-male-c' | 'character-female-c'
  | 'building-a' | 'building-c' | 'building-e' | 'building-g'
  | 'building-skyscraper-a' | 'building-skyscraper-c' | 'building-skyscraper-e';

export const CARS: ModelKind[] = ['sedan', 'taxi', 'suv', 'van', 'sedan-sports'];
export const PEOPLE: ModelKind[] = ['character-male-a', 'character-female-a', 'character-male-c', 'character-female-c'];
export const LOW_BUILDINGS: ModelKind[] = ['building-a', 'building-c', 'building-e', 'building-g'];
export const TOWERS: ModelKind[] = ['building-skyscraper-a', 'building-skyscraper-c', 'building-skyscraper-e'];

interface Loaded { scene: THREE.Group; clips: THREE.AnimationClip[]; size: THREE.Vector3 }
interface Pending { group: THREE.Object3D; kind: ModelKind; fit: Fit }
export interface Fit { length?: number; height?: number; box?: [number, number, number]; yaw?: number }
interface Actor {
  obj: THREE.Object3D; mixer: THREE.AnimationMixer; actions: Record<string, THREE.AnimationAction>;
  cur: string; last: THREE.Vector3; speed: number;
}

class ModelLib {
  private cache = new Map<ModelKind, Loaded>();
  private loading = new Map<ModelKind, Promise<Loaded | null>>();
  private pending: Pending[] = [];
  private actors: Actor[] = [];
  private loader = new GLTFLoader();
  shadows = true;
  enabled = true;

  private load(kind: ModelKind) {
    let p = this.loading.get(kind);
    if (!p) {
      p = this.loader.loadAsync(`/models/${kind}.gltf`).then((g) => {
        g.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) { m.castShadow = this.shadows; m.receiveShadow = true; }
        });
        const size = new THREE.Box3().setFromObject(g.scene).getSize(new THREE.Vector3());
        const l = { scene: g.scene, clips: g.animations, size };
        this.cache.set(kind, l);
        return l;
      }).catch(() => null);
      this.loading.set(kind, p);
    }
    return p;
  }

  /** Swap the placeholder meshes in `group` for a real model once it is loaded. */
  dress(group: THREE.Object3D, kind: ModelKind, fit: Fit) {
    if (!this.enabled) return;
    const l = this.cache.get(kind);
    if (l) { this.apply(group, l, kind, fit); return; }
    this.pending.push({ group, kind, fit });
    void this.load(kind).then((ld) => {
      if (!ld) return;
      this.pending = this.pending.filter((p) => {
        if (p.kind !== kind) return true;
        this.apply(p.group, ld, kind, p.fit);
        return false;
      });
    });
  }

  private apply(group: THREE.Object3D, l: Loaded, kind: ModelKind, fit: Fit) {
    if (group.userData.dressed) return;
    group.userData.dressed = kind;
    // Hide placeholder meshes except glowing light bars / markers.
    for (const c of group.children) {
      const m = c as THREE.Mesh;
      const mat = m.material as THREE.MeshStandardMaterial | undefined;
      const glowing = !!mat && 'emissiveIntensity' in mat && mat.emissiveIntensity >= 1.5;
      if ((m.isMesh || (c as THREE.Group).isGroup) && !glowing && !c.userData.keep) c.visible = false;
    }
    const model = (l.clips.length ? SkeletonUtils.clone(l.scene) : l.scene.clone()) as THREE.Object3D;
    const s = l.size;
    if (fit.box) {
      const swap = Math.abs(Math.sin(fit.yaw ?? 0)) > 0.5;
      const [bx, by, bz] = swap ? [fit.box[2], fit.box[1], fit.box[0]] : fit.box;
      // uniform scale keeps facade proportions; mild vertical stretch only for towers
      const k = Math.min(bx / s.x, bz / s.z);
      const ky = Math.min(Math.max(k, by / s.y), k * 1.6);
      model.scale.set(k, ky, k);
    } else if (fit.length) {
      const k = fit.length / Math.max(s.x, s.z);
      model.scale.setScalar(k);
    } else if (fit.height) {
      model.scale.setScalar(fit.height / s.y);
    }
    const holder = new THREE.Group();
    holder.add(model);
    // center on x/z, base on ground
    const bb = new THREE.Box3().setFromObject(model);
    const c = bb.getCenter(new THREE.Vector3());
    model.position.set(-c.x, -bb.min.y, -c.z);
    holder.rotation.y = fit.yaw ?? 0;
    holder.userData.keep = true;
    group.add(holder);
    if (l.clips.length) {
      const mixer = new THREE.AnimationMixer(model);
      const actions: Record<string, THREE.AnimationAction> = {};
      for (const c of l.clips) actions[c.name] = mixer.clipAction(c);
      const a: Actor = { obj: group, mixer, actions, cur: 'idle', last: group.getWorldPosition(new THREE.Vector3()), speed: 0 };
      actions.idle?.play();
      mixer.update(Math.random());
      this.actors.push(a);
      group.userData.actor = a;
    }
  }

  /** Force a clip (e.g. 'drive' when seated). */
  setClip(group: THREE.Object3D, name: string | null) { group.userData.forceClip = name; }

  private tmp = new THREE.Vector3();
  update(dt: number) {
    if (dt <= 0) return;
    for (const a of this.actors) {
      if (!a.obj.visible || !a.obj.parent) continue;
      a.obj.getWorldPosition(this.tmp);
      const v = Math.hypot(this.tmp.x - a.last.x, this.tmp.z - a.last.z) / dt;
      a.last.copy(this.tmp);
      a.speed += (v - a.speed) * Math.min(1, dt * 8);
      const want = (a.obj.userData.forceClip as string | null) ?? (a.speed > 3.2 ? 'sprint' : a.speed > 0.25 ? 'walk' : 'idle');
      if (want !== a.cur && a.actions[want]) {
        const next = a.actions[want];
        next.reset().play();
        a.actions[a.cur]?.crossFadeTo(next, 0.2, false);
        a.cur = want;
      }
      const act = a.actions[a.cur];
      if (act && a.cur === 'walk') act.timeScale = Math.max(0.6, Math.min(1.6, a.speed / 1.4));
      a.mixer.update(dt);
    }
  }
}

export const models = new ModelLib();

/** Glow halos for emergency lights and pooled exhaust smoke. */
function radialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

class Fx {
  private tex: THREE.Texture | null = null;
  private glows: Array<{ light: THREE.PointLight; sprite: THREE.Sprite }> = [];
  private puffs: Array<{ s: THREE.Sprite; life: number }> = [];
  private pool: THREE.Sprite[] = [];
  particles = 1;
  private t() { return (this.tex ??= radialTexture()); }

  glow(light: THREE.PointLight, color: number, size = 2.2) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.t(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0
    }));
    sprite.scale.setScalar(size);
    light.add(sprite);
    this.glows.push({ light, sprite });
  }

  smoke(parent: THREE.Object3D, x: number, y: number, z: number) {
    if (Math.random() > this.particles || this.puffs.length > 60) return;
    const s = this.pool.pop() ?? new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.t(), color: 0x9aa4ae, depthWrite: false, transparent: true, opacity: 0.35
    }));
    s.position.set(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3);
    s.scale.setScalar(0.4);
    parent.add(s);
    this.puffs.push({ s, life: 1 });
  }

  update(dt: number) {
    for (const g of this.glows) {
      (g.sprite.material as THREE.SpriteMaterial).opacity = Math.min(1, g.light.intensity / 2.5);
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life -= dt * 0.9;
      p.s.position.y += dt * 0.6;
      p.s.scale.setScalar(0.4 + (1 - p.life) * 1.6);
      (p.s.material as THREE.SpriteMaterial).opacity = Math.max(0, p.life * 0.35);
      if (p.life <= 0) {
        p.s.removeFromParent();
        this.pool.push(p.s);
        this.puffs.splice(i, 1);
      }
    }
  }
}

export const fx = new Fx();
