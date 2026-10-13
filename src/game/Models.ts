import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Low-poly CC0 models (Kenney Car Kit, Mini Characters, City Kit Commercial).
 * Primitive placeholder meshes stay until the model is loaded, then get swapped.
 */
export type ModelKind =
  | 'police' | 'sedan' | 'taxi' | 'suv' | 'van' | 'sedan-sports'
  | 'character-male-a' | 'character-female-a' | 'character-male-c' | 'character-female-c'
  | 'building-a' | 'building-c' | 'building-e' | 'building-g'
  | 'building-skyscraper-a' | 'building-skyscraper-c' | 'building-skyscraper-e'
  | 'officer' | 'man-suit' | 'woman-a' | 'woman-b' | 'police-real' | 'challenger';

export const CARS: ModelKind[] = ['challenger', 'challenger', 'challenger', 'challenger', 'challenger'];
export const LOW_CARS: ModelKind[] = ['sedan', 'taxi', 'suv', 'van', 'sedan-sports'];
export const REAL_PEOPLE: ModelKind[] = ['man-suit', 'woman-a', 'woman-b', 'man-suit'];
export const PEOPLE: ModelKind[] = ['character-male-a', 'character-female-a', 'character-male-c', 'character-female-c'];
export const LOW_BUILDINGS: ModelKind[] = ['building-a', 'building-c', 'building-e', 'building-g'];
export const TOWERS: ModelKind[] = ['building-skyscraper-a', 'building-skyscraper-c', 'building-skyscraper-e'];

interface Loaded { scene: THREE.Group; clips: THREE.AnimationClip[]; size: THREE.Vector3 }
interface Pending { group: THREE.Object3D; kind: ModelKind; fit: Fit }
export interface Fit { length?: number; height?: number; box?: [number, number, number]; yaw?: number; tint?: number; noShadow?: boolean }
interface Actor {
  obj: THREE.Object3D; mixer: THREE.AnimationMixer; actions: Record<string, THREE.AnimationAction>;
  cur: string; last: THREE.Vector3; speed: number;
}

class ModelLib {
  private cache = new Map<ModelKind, Loaded>();
  private loading = new Map<ModelKind, Promise<Loaded | null>>();
  private pending: Pending[] = [];
  private actors: Actor[] = [];
  private loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  shadows = true;
  enabled = true;

  /** Loading progress of every model requested so far (for the loading screen). */
  progress() {
    return { done: this.cache.size + this.failed, total: this.loading.size };
  }
  private failed = 0;

  private load(kind: ModelKind) {
    let p = this.loading.get(kind);
    if (!p) {
      p = this.loader.loadAsync(`/models/${kind}.gltf`).then((g) => {
        const lights: THREE.Object3D[] = [];
        g.scene.traverse((o) => { if ((o as THREE.Light).isLight) lights.push(o); });
        lights.forEach((o) => o.removeFromParent());
        g.scene.traverse((o) => {
          // skinned meshes have bind-pose bounds that do not follow animation; keep them unculled, cull everything else
          if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.Mesh).frustumCulled = false;
          const m = o as THREE.Mesh;
          if (m.isMesh) { m.castShadow = this.shadows; m.receiveShadow = true; }
        });
        const size = new THREE.Box3().setFromObject(g.scene).getSize(new THREE.Vector3());
        const l = { scene: g.scene, clips: g.animations, size };
        this.cache.set(kind, l);
        return l;
      }).catch(() => { this.failed++; return null; });
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
      const vary = 0.85 + ((Math.abs(group.position.x * 3 + group.position.z * 5) % 10) / 10) * 0.6;
      const ky = Math.min(Math.max(k, by / s.y), k * 1.6) * (kind.includes('skyscraper') ? vary : 1);
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
    if (fit.tint !== undefined || fit.noShadow || !this.shadows) {
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        if (fit.noShadow || !this.shadows) m.castShadow = false;
        if (fit.tint !== undefined) m.material = this.tintMat(m.material as THREE.Material, fit.tint);
      });
    }
    group.add(holder);
    if (kind.startsWith('building')) this.decorate(group, holder, kind);
    if (l.clips.length) {
      const mixer = new THREE.AnimationMixer(model);
      const actions: Record<string, THREE.AnimationAction> = {};
      for (const c of l.clips) actions[c.name] = mixer.clipAction(c);
      // normalise clip names across packs (Kenney: idle/walk/sprint/drive; Quaternius: Armature|Idle, Walk, Run, Sitting...)
      const find = (re: RegExp, not?: RegExp) => l.clips.find((c) => re.test(c.name) && !(not && not.test(c.name)));
      const alias: Record<string, THREE.AnimationClip | undefined> = {
        idle: find(/(^|\|)(female_)?idle(_neutral)?$/i) ?? find(/idle/i, /gun|sword|sit/i),
        walk: find(/walk(ing)?$/i),
        sprint: find(/(^|\||_)run(ning)?$/i) ?? find(/sprint/i),
        gun: find(/idle_gun_shoot/i) ?? find(/gun_?shoot|shoot|pistol|gun/i, /run|walk/i),
        aim: find(/gun_pointing/i) ?? find(/idle_gun/i),
        hit: find(/hitrec/i),
        down: find(/death|die|dead/i),
        drive: find(/^drive$/i) ?? find(/sit(ting|idle)?$/i) ?? find(/idle/i, /gun|sword/i)
      };
      for (const [k, c] of Object.entries(alias)) if (c && !actions[k]) actions[k] = mixer.clipAction(c);
      for (const k of ['down', 'hit']) { const x = actions[k]; if (x) { x.setLoop(THREE.LoopOnce, 1); x.clampWhenFinished = true; } }
      group.userData.clips = Object.keys(actions);
      const a: Actor = { obj: group, mixer, actions, cur: 'idle', last: group.getWorldPosition(new THREE.Vector3()), speed: 0 };
      actions.idle?.play();
      mixer.update(Math.random());
      this.actors.push(a);
      group.userData.actor = a;
    }
  }

  private tints = new Map<string, THREE.Material>();
  /** Cached tinted copy of a material (multiplies the palette texture), shared by all cars of that colour. */
  private tintMat(src: THREE.Material, tint: number) {
    const key = src.uuid + ':' + tint;
    let m = this.tints.get(key);
    if (!m) {
      m = src.clone();
      (m as THREE.MeshStandardMaterial).color?.multiply(new THREE.Color(tint));
      this.tints.set(key, m);
    }
    return m;
  }

  /** Shared night-window material; CityScene drives its emissive by time of day. */
  windowMat = new THREE.MeshStandardMaterial({ color: 0x55606a, emissive: 0xffc46b, emissiveIntensity: 0.05, roughness: 0.4 });
  private roofMat = new THREE.MeshStandardMaterial({ color: 0x5b636b, roughness: 0.8, metalness: 0.3 });
  private signMats = [0xff3d7f, 0x3dd9ff, 0xffd23d, 0x7dff6a].map((c) =>
    new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.2, roughness: 0.3 }));
  private seed = 1;
  private rnd() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }

  /** Lit windows (merged into one mesh), rooftop units and neon signs, fitted to the real model bounds. */
  private decorate(group: THREE.Object3D, holder: THREE.Object3D, kind: ModelKind) {
    group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
    const bb = new THREE.Box3().setFromObject(holder).applyMatrix4(inv);
    const size = bb.getSize(new THREE.Vector3());
    const c = bb.getCenter(new THREE.Vector3());
    this.seed = Math.abs(Math.floor(group.position.x * 131 + group.position.z * 71)) + 7;
    const geos: THREE.BufferGeometry[] = [];
    const ww = 0.42, wh = 0.55, gapX = 1.1, gapY = 1.25;
    const addFace = (len: number, axis: 'x' | 'z', side: number) => {
      const cols = Math.max(1, Math.floor((len - 0.6) / gapX));
      const rows = Math.max(1, Math.floor((size.y - 1.2) / gapY));
      for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
        if (this.rnd() < 0.45) continue;
        const g = new THREE.PlaneGeometry(ww, wh);
        const off = -len / 2 + (len / cols) * (k + 0.5);
        const y = bb.min.y + 1.0 + r * gapY;
        if (axis === 'z') { if (side < 0) g.rotateY(Math.PI); g.translate(c.x + off, y, side > 0 ? bb.max.z + 0.04 : bb.min.z - 0.04); }
        else { g.rotateY(side > 0 ? Math.PI / 2 : -Math.PI / 2); g.translate(side > 0 ? bb.max.x + 0.04 : bb.min.x - 0.04, y, c.z + off); }
        geos.push(g);
      }
    };
    addFace(size.x, 'z', 1); addFace(size.x, 'z', -1); addFace(size.z, 'x', 1); addFace(size.z, 'x', -1);
    if (geos.length) {
      const m = new THREE.Mesh(mergeGeometries(geos), this.windowMat);
      geos.forEach((g) => g.dispose());
      m.userData.keep = true;
      group.add(m);
    }
    // rooftop: AC units / water tank
    const n = 1 + Math.floor(this.rnd() * 3);
    for (let i = 0; i < n; i++) {
      const tank = this.rnd() < 0.3;
      const geo = tank ? new THREE.CylinderGeometry(0.5, 0.5, 1.1, 10) : new THREE.BoxGeometry(0.9, 0.5, 0.7);
      const u = new THREE.Mesh(geo, this.roofMat);
      u.position.set(c.x + (this.rnd() - 0.5) * size.x * 0.6, bb.max.y + (tank ? 0.55 : 0.25), c.z + (this.rnd() - 0.5) * size.z * 0.6);
      u.castShadow = false;
      u.userData.keep = true;
      group.add(u);
    }
    // neon sign on some low buildings
    if (!kind.includes('skyscraper') && this.rnd() < 0.55) {
      const sign = new THREE.Mesh(new THREE.BoxGeometry(Math.min(2.6, size.x * 0.7), 0.45, 0.08), this.signMats[Math.floor(this.rnd() * 4)]);
      sign.position.set(c.x, bb.min.y + Math.min(size.y * 0.55, 3.2), bb.max.z + 0.12);
      sign.userData.keep = true;
      group.add(sign);
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
