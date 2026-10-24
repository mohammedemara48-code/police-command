import * as THREE from 'three';
import { rigModelWheels } from '../world/Egypt';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { wear } from './Outfits';
import type { Outfit } from '../logic/outfits';
import { humanMatRole, shouldBrightenRecolor, LOCO_CROSSFADE, LOCO_SPEED_EMA } from '../logic/humanMaterials';

/**
 * Low-poly CC0 models (Kenney Car Kit, Mini Characters, City Kit Commercial).
 * Primitive placeholder meshes stay until the model is loaded, then get swapped.
 */
export type ModelKind =
  | 'police'
  | 'sedan'
  | 'taxi'
  | 'suv'
  | 'van'
  | 'sedan-sports'
  | 'character-male-a'
  | 'character-female-a'
  | 'character-male-c'
  | 'character-female-c'
  | 'building-a'
  | 'building-c'
  | 'building-e'
  | 'building-g'
  | 'building-skyscraper-a'
  | 'building-skyscraper-c'
  | 'building-skyscraper-e'
  | 'officer'
  | 'officer-female'
  | 'man-suit'
  | 'woman-a'
  | 'woman-b'
  | 'police-real'
  | 'challenger'
  | HumanKind;

/** Realistic MakeHuman (CC0) people, rigged + animated with the Universal Animation Library (CC0). */
export type HumanKind =
  | 'cop_m'
  | 'cop_f'
  | 'civ_m1'
  | 'civ_m2'
  | 'civ_m3'
  | 'civ_f1'
  | 'civ_f2'
  | 'car-sedan2'
  | 'car-hatch'
  | 'car-van'
  | 'car-police'
  | 'tuktuk';
const GLB = new Set<string>([
  'tuktuk',
  'cop_m',
  'cop_f',
  'civ_m1',
  'civ_m2',
  'civ_m3',
  'civ_f1',
  'civ_f2',
  'car-sedan2',
  'car-hatch',
  'car-van',
  'car-police'
]);
const CAR_GLB = new Set<string>(['car-sedan2', 'car-hatch', 'car-van', 'car-police']);
/** Cars with a light `-lo.glb` version (fewer triangles, smaller textures) used on low quality. */
/** loose parts in the car files (see apply) */
export const STRAY_CAR_PART = /brake|rotor|caliper/i;
const LOD = new Set<string>(['car-sedan2', 'car-hatch', 'car-van']);
export const MEN: ModelKind[] = ['civ_m1', 'civ_m2', 'civ_m3'];
export const WOMEN: ModelKind[] = ['civ_f1', 'civ_f2'];

export const CARS: ModelKind[] = ['car-sedan2', 'car-hatch', 'car-sedan2', 'car-hatch', 'challenger'];
export const LOW_CARS: ModelKind[] = ['sedan', 'taxi', 'suv', 'van', 'sedan-sports'];
export const REAL_PEOPLE: ModelKind[] = ['civ_m1', 'civ_f1', 'civ_m2', 'civ_f2', 'civ_m3'];
export const PEOPLE: ModelKind[] = ['character-male-a', 'character-female-a', 'character-male-c', 'character-female-c'];
export const LOW_BUILDINGS: ModelKind[] = ['building-a', 'building-c', 'building-e', 'building-g'];
export const TOWERS: ModelKind[] = ['building-skyscraper-a', 'building-skyscraper-c', 'building-skyscraper-e'];

interface Loaded {
  scene: THREE.Group;
  clips: THREE.AnimationClip[];
  size: THREE.Vector3;
}
interface Pending {
  group: THREE.Object3D;
  kind: ModelKind;
  fit: Fit;
}
export interface Fit {
  length?: number;
  height?: number;
  box?: [number, number, number];
  yaw?: number;
  tint?: number;
  noShadow?: boolean;
  recolor?: Record<string, number>;
  /** Cairo street clothes for a MakeHuman person */
  outfit?: Outfit;
  /** extra vertical scale after fitting (a model that came out too tall) */
  squashY?: number;
}
interface Actor {
  obj: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Record<string, THREE.AnimationAction>;
  cur: string;
  last: THREE.Vector3;
  speed: number;
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
      p = this.loader
        .loadAsync(`/models/${kind}${LOD.has(kind) && !this.hiQuality ? '-lo' : ''}.${GLB.has(kind) ? 'glb' : 'gltf'}`)
        .then((g) => {
          const lights: THREE.Object3D[] = [];
          g.scene.traverse((o) => {
            if ((o as THREE.Light).isLight) lights.push(o);
          });
          lights.forEach((o) => o.removeFromParent());
          g.scene.traverse((o) => {
            // skinned meshes have bind-pose bounds that do not follow animation; keep them unculled, cull everything else
            if ((o as THREE.SkinnedMesh).isSkinnedMesh) (o as THREE.Mesh).frustumCulled = false;
            const m = o as THREE.Mesh;
            if (m.isMesh) {
              m.castShadow = this.shadows;
              m.receiveShadow = true;
              if (CAR_GLB.has(kind))
                m.material = this.carMat(m.material as THREE.MeshStandardMaterial, kind === 'car-van');
              else if (GLB.has(kind) && !CAR_GLB.has(kind) && kind !== 'tuktuk') {
                m.material = this.humanMat(m.material as THREE.MeshStandardMaterial);
              }
            }
          });
          const size = new THREE.Box3().setFromObject(g.scene).getSize(new THREE.Vector3());
          // bones never need animated scale: dropping those tracks lets a child keep its larger head
          for (const c of g.animations) c.tracks = c.tracks.filter((t) => !t.name.endsWith('.scale'));
          const l = { scene: g.scene, clips: g.animations, size };
          this.cache.set(kind, l);
          return l;
        })
        .catch(() => {
          this.failed++;
          return null;
        });
      this.loading.set(kind, p);
    }
    return p;
  }

  /** Swap the placeholder meshes in `group` for a real model once it is loaded. */
  dress(group: THREE.Object3D, kind: ModelKind, fit: Fit) {
    if (!this.enabled) return;
    const l = this.cache.get(kind);
    if (l) {
      this.apply(group, l, kind, fit);
      return;
    }
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
      if (fit.squashY) model.scale.y *= fit.squashY;
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
    holder.userData.model = true;
    if (fit.recolor) {
      const rc = fit.recolor;
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const src = m.material as THREE.MeshStandardMaterial;
        const c = rc[src.name];
        if (c === undefined) return;
        const mm = src.clone();
        mm.color.setHex(c);
        if (shouldBrightenRecolor(!!mm.map, GLB.has(kind))) mm.color.multiplyScalar(1.2);
        m.material = mm;
      });
    }
    // the high-detail car files carry loose brake parts that the export left far from the wheels: thin black
    // rods poking up behind the roof and wire-like bits under the bumper. Nothing of them shows when they sit right.
    if (CAR_GLB.has(kind))
      model.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && STRAY_CAR_PART.test(o.name)) o.visible = false;
      });
    if (fit.tint !== undefined || fit.noShadow || !this.shadows) {
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        if (fit.noShadow || !this.shadows) m.castShadow = false;
        if (fit.tint === undefined) return;
        if (CAR_GLB.has(kind)) {
          if ((m.material as THREE.Material).name === 'Paint')
            m.material = this.paintMat(m.material as THREE.Material, fit.tint);
        } else m.material = this.tintMat(m.material as THREE.Material, fit.tint);
      });
    }
    if (kind.startsWith('cop_')) this.policeGear(model);
    if (fit.outfit) wear(model, fit.outfit, this.shadows && !fit.noShadow);
    group.add(holder);
    if (LOD.has(kind)) {
      // these models ship each wheel as its own node (wheel_*), pivoting on the axle
      const wheels: THREE.Object3D[] = [];
      model.traverse((o) => {
        if (!o.name.startsWith('wheel_')) return;
        o.userData.axis = 'z';
        o.userData.r = ((o.userData.r as number) || 0.33) * model.scale.x;
        wheels.push(o);
      });
      if (wheels.length) group.userData.wheels = wheels;
    } else if (CAR_GLB.has(kind)) rigModelWheels(group, model);
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
      for (const k of ['down', 'hit']) {
        const x = actions[k];
        if (x) {
          x.setLoop(THREE.LoopOnce, 1);
          x.clampWhenFinished = true;
        }
      }
      group.userData.clips = Object.keys(actions);
      const a: Actor = {
        obj: group,
        mixer,
        actions,
        cur: 'idle',
        last: group.getWorldPosition(new THREE.Vector3()),
        speed: 0
      };
      actions.idle?.play();
      mixer.update(Math.random());
      this.actors.push(a);
      group.userData.actor = a;
    }
  }

  /** Duty belt, badge and shoulder patches, bound to the bones in bind pose so they move with the body. */
  private gearMats: THREE.Material[] | null = null;
  private policeGear(model: THREE.Object3D) {
    const bone = (n: string) => model.getObjectByName(n) as THREE.Bone | undefined;
    const pelvis = bone('pelvis');
    const chest = bone('spine_03');
    const sh = [bone('upperarm_l'), bone('upperarm_r')];
    if (!pelvis || !chest) return;
    const [black, gold, patch] = (this.gearMats ??= [
      new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.4, metalness: 0.1 }),
      new THREE.MeshStandardMaterial({ color: 0xd6b04a, roughness: 0.3, metalness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: 0x0c1730, roughness: 0.7 })
    ]) as [THREE.Material, THREE.Material, THREE.Material];
    model.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
    const local = (o: THREE.Object3D) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).applyMatrix4(inv);
    // body extents around the waist / chest from the skinned meshes (bind pose)
    const box = new THREE.Box3().setFromObject(model);
    const H = box.max.y - box.min.y;
    const hip = local(pelvis);
    const ch = local(chest);
    const place = (mesh: THREE.Mesh, at: THREE.Vector3, parent: THREE.Bone) => {
      mesh.position.copy(at).applyMatrix4(model.matrixWorld);
      parent.updateMatrixWorld(true);
      model.add(mesh);
      mesh.updateMatrixWorld(true);
      parent.attach(mesh);
      mesh.castShadow = this.shadows;
    };
    const belt = new THREE.Mesh(new THREE.TorusGeometry(1, 0.045, 6, 28), black);
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(H * 0.098, H * 0.07, 1.1);
    place(belt, new THREE.Vector3(hip.x, hip.y + H * 0.045, hip.z), pelvis);
    const holster = new THREE.Mesh(new THREE.BoxGeometry(H * 0.03, H * 0.08, H * 0.05), black);
    place(holster, new THREE.Vector3(hip.x - H * 0.1, hip.y, hip.z), pelvis);
    const radio = new THREE.Mesh(new THREE.BoxGeometry(H * 0.025, H * 0.05, H * 0.02), black);
    place(radio, new THREE.Vector3(ch.x - H * 0.06, ch.y + H * 0.06, ch.z + H * 0.075), chest);
    const badge = new THREE.Mesh(new THREE.CylinderGeometry(H * 0.012, H * 0.012, 0.004, 6), gold);
    badge.rotation.x = Math.PI / 2;
    place(badge, new THREE.Vector3(ch.x + H * 0.055, ch.y + H * 0.045, ch.z + H * 0.072), chest);
    sh.forEach((b, i) => {
      if (!b) return;
      const p = local(b);
      const m = new THREE.Mesh(new THREE.BoxGeometry(H * 0.012, H * 0.04, H * 0.035), patch);
      place(m, new THREE.Vector3(p.x + (i ? -1 : 1) * H * 0.045, p.y - H * 0.025, p.z), b);
    });
  }

  /** Cached skin/hair/eye polish for MakeHuman GLBs; shared across clones of the same source mat. */
  private humanMats = new Map<string, THREE.Material>();
  private humanMat(src: THREE.MeshStandardMaterial): THREE.Material {
    const role = humanMatRole(src.name);
    const key = src.uuid + ':' + role;
    let out = this.humanMats.get(key);
    if (out) return out;
    if (role === 'skin') {
      out = new THREE.MeshPhysicalMaterial({
        name: src.name,
        map: src.map,
        normalMap: src.normalMap,
        color: src.color.clone(),
        metalness: 0,
        roughness: 0.52,
        clearcoat: 0.16,
        clearcoatRoughness: 0.55,
        sheen: 0.32,
        sheenRoughness: 0.58,
        sheenColor: new THREE.Color(0xf0c4a8),
        envMapIntensity: 0.55
      });
    } else if (role === 'hair') {
      const mm = src.clone();
      mm.roughness = 0.32;
      mm.metalness = 0.08;
      mm.color.multiplyScalar(0.82);
      out = mm;
    } else if (role === 'eye') {
      const mm = src.clone();
      mm.roughness = 0.1;
      mm.metalness = 0.12;
      mm.envMapIntensity = 1.25;
      out = mm;
    } else if (role === 'shoes') {
      const mm = src.clone();
      mm.roughness = 0.45;
      mm.metalness = Math.min(mm.metalness, 0.15);
      out = mm;
    } else {
      const mm = src.clone();
      mm.roughness = 0.9;
      out = mm;
    }
    this.humanMats.set(key, out);
    return out;
  }

  private tints = new Map<string, THREE.Material>();
  /** Cached tinted copy of a material (multiplies the palette texture), shared by all cars of that colour. */
  /** Car paint gets a clear coat (high quality), lamps glow, glass reflects. */
  hiQuality = true;
  private carMat(src: THREE.MeshStandardMaterial, van = false): THREE.Material {
    const n = src.name;
    if ((n === 'Paint' || n === 'Livery') && this.hiQuality) {
      const m = new THREE.MeshPhysicalMaterial({
        name: n,
        color: src.color,
        metalness: 0.55,
        roughness: 0.38,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
        envMapIntensity: 1.5
      });
      return m;
    }
    // paint colour comes from the per-car tint, not a baked texture
    if (n === 'Paint' && src.map && src.name === 'Paint' && src.roughness < 0.5) {
      src.map = null;
      src.color.setHex(0xffffff);
    }
    // low quality has no environment map: fully metallic paint/chrome would render near-black
    if (!this.hiQuality && src.metalness > 0.4) {
      src.metalness = 0.35;
      src.roughness = Math.max(src.roughness, 0.35);
    }
    if (n === 'Headlight') {
      src.emissive.setHex(0xfff1d6);
      src.emissiveIntensity = 0.9;
    } else if (n === 'Taillight') {
      src.emissive.setHex(0xff1a10);
      src.emissiveIntensity = 0.8;
    } else if (n === 'Beacon') {
      src.emissive.setHex(0x2a6bff);
      src.emissiveIntensity = 0.6;
    } else if (/rubber|black/i.test(n)) {
      src.color.setHex(n.includes('rubber') ? 0x141414 : 0x101012);
      src.roughness = 0.85;
      src.metalness = 0.05;
    } else if (/glaz|glass/i.test(n)) {
      // tinted glass: readable cabin silhouette, not a hole in the car
      src.color.setHex(0x0e1418);
      src.transparent = true;
      src.opacity = 0.93;
      src.metalness = 0.6;
      src.roughness = 0.06;
      src.envMapIntensity = 1.6;
      src.depthWrite = false;
      // the microbus: light clear glass, so the passengers sitting inside show from the street
      if (van) {
        src.color.setHex(0x5a6a72);
        src.opacity = 0.42;
        src.metalness = 0.2;
        src.envMapIntensity = 0.8;
      }
    }
    return src;
  }
  private paintMat(src: THREE.Material, tint: number) {
    const key = src.uuid + ':p' + tint;
    let m = this.tints.get(key);
    if (!m) {
      m = src.clone();
      (m as THREE.MeshStandardMaterial).color.setHex(tint);
      this.tints.set(key, m);
    }
    return m;
  }

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
  windowMat = new THREE.MeshStandardMaterial({
    color: 0x55606a,
    emissive: 0xffc46b,
    emissiveIntensity: 0.05,
    roughness: 0.4
  });
  private roofMat = new THREE.MeshStandardMaterial({ color: 0x5b636b, roughness: 0.8, metalness: 0.3 });
  private signMats = [0xff3d7f, 0x3dd9ff, 0xffd23d, 0x7dff6a].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.2, roughness: 0.3 })
  );
  private seed = 1;
  private rnd() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  /** Lit windows (merged into one mesh), rooftop units and neon signs, fitted to the real model bounds. */
  private decorate(group: THREE.Object3D, holder: THREE.Object3D, kind: ModelKind) {
    group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
    const bb = new THREE.Box3().setFromObject(holder).applyMatrix4(inv);
    const size = bb.getSize(new THREE.Vector3());
    const c = bb.getCenter(new THREE.Vector3());
    this.seed = Math.abs(Math.floor(group.position.x * 131 + group.position.z * 71)) + 7;
    const geos: THREE.BufferGeometry[] = [];
    const ww = 0.42,
      wh = 0.55,
      gapX = 1.1,
      gapY = 1.25;
    const addFace = (len: number, axis: 'x' | 'z', side: number) => {
      const cols = Math.max(1, Math.floor((len - 0.6) / gapX));
      const rows = Math.max(1, Math.floor((size.y - 1.2) / gapY));
      for (let r = 0; r < rows; r++)
        for (let k = 0; k < cols; k++) {
          if (this.rnd() < 0.45) continue;
          const g = new THREE.PlaneGeometry(ww, wh);
          const off = -len / 2 + (len / cols) * (k + 0.5);
          const y = bb.min.y + 1.0 + r * gapY;
          if (axis === 'z') {
            if (side < 0) g.rotateY(Math.PI);
            g.translate(c.x + off, y, side > 0 ? bb.max.z + 0.04 : bb.min.z - 0.04);
          } else {
            g.rotateY(side > 0 ? Math.PI / 2 : -Math.PI / 2);
            g.translate(side > 0 ? bb.max.x + 0.04 : bb.min.x - 0.04, y, c.z + off);
          }
          geos.push(g);
        }
    };
    addFace(size.x, 'z', 1);
    addFace(size.x, 'z', -1);
    addFace(size.z, 'x', 1);
    addFace(size.z, 'x', -1);
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
      u.position.set(
        c.x + (this.rnd() - 0.5) * size.x * 0.6,
        bb.max.y + (tank ? 0.55 : 0.25),
        c.z + (this.rnd() - 0.5) * size.z * 0.6
      );
      u.castShadow = false;
      u.userData.keep = true;
      group.add(u);
    }
    // neon sign on some low buildings
    if (!kind.includes('skyscraper') && this.rnd() < 0.55) {
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(Math.min(2.6, size.x * 0.7), 0.45, 0.08),
        this.signMats[Math.floor(this.rnd() * 4)]
      );
      sign.position.set(c.x, bb.min.y + Math.min(size.y * 0.55, 3.2), bb.max.z + 0.12);
      sign.userData.keep = true;
      group.add(sign);
    }
  }

  /** Swap a dressed group's model (e.g. after the player edits their character). */
  redress(group: THREE.Object3D, kind: ModelKind, fit: Fit) {
    const old = group.children.filter((c) => c.userData.keep && c.userData.model);
    old.forEach((c) => c.removeFromParent());
    this.actors = this.actors.filter((a) => a.obj !== group);
    this.pending = this.pending.filter((p) => p.group !== group);
    group.userData.dressed = undefined;
    this.dress(group, kind, fit);
  }

  /** Force a clip (e.g. 'drive' when seated). */
  setClip(group: THREE.Object3D, name: string | null) {
    group.userData.forceClip = name;
  }

  private tmp = new THREE.Vector3();
  /** Call after moving an actor instantly, so the move is not read as a sprint. */
  snap(obj: THREE.Object3D, speed = 0) {
    const a = this.actors.find((x) => x.obj === obj);
    if (!a) return;
    obj.getWorldPosition(a.last);
    a.speed = speed;
  }
  update(dt: number) {
    if (dt <= 0) return;
    for (const a of this.actors) {
      if (!a.obj.visible || !a.obj.parent) continue;
      a.obj.getWorldPosition(this.tmp);
      const v = Math.hypot(this.tmp.x - a.last.x, this.tmp.z - a.last.z) / dt;
      a.last.copy(this.tmp);
      a.speed += (v - a.speed) * Math.min(1, dt * LOCO_SPEED_EMA);
      const want =
        (a.obj.userData.forceClip as string | null) ?? (a.speed > 3.2 ? 'sprint' : a.speed > 0.25 ? 'walk' : 'idle');
      if (want !== a.cur && a.actions[want]) {
        const next = a.actions[want];
        next.reset().play();
        // start each person's walk cycle at its own step, so a crowd does not march in step
        if (want === 'walk') next.time = Math.random() * next.getClip().duration;
        a.actions[a.cur]?.crossFadeTo(next, LOCO_CROSSFADE, false);
        a.cur = want;
      }
      const act = a.actions[a.cur];
      // keep feet in sync with ground speed (no sliding)
      if (act && a.cur === 'walk') act.timeScale = Math.max(0.6, Math.min(1.6, a.speed / 1.4));
      if (act && a.cur === 'sprint') act.timeScale = Math.max(0.75, Math.min(1.35, a.speed / 5));
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
  private t() {
    return (this.tex ??= radialTexture());
  }

  glow(light: THREE.PointLight, color: number, size = 2.2) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.t(),
        color,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0
      })
    );
    sprite.scale.setScalar(size);
    light.add(sprite);
    this.glows.push({ light, sprite });
  }

  smoke(parent: THREE.Object3D, x: number, y: number, z: number) {
    if (Math.random() > this.particles || this.puffs.length > 60) return;
    const s =
      this.pool.pop() ??
      new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.t(),
          color: 0x9aa4ae,
          depthWrite: false,
          transparent: true,
          opacity: 0.35
        })
      );
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
