import { reducedMotion } from './Motion';
import { buildCity, onRoad, nearCross, drawCityMap, CROSS_Z, findPath, farNode, followPath } from './City';
import { newCall } from './Dispatch';
import { Squad } from './Npc';
import { addStat, checkAch } from './Achievements';
import * as THREE from 'three';
import { models, CARS, LOW_CARS, REAL_PEOPLE, PEOPLE, LOW_BUILDINGS, TOWERS, fx } from './Models';
import { audio } from './AudioManager';
import { Q } from './Quality';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { tutorialHint, TUT_KEY, TUT_STEPS, type TutAct } from './logic/tutorial';
import { LEVELS, levelById, completeLevel, progress, rank, isPatrol, type LevelDef, type Line, type Behaviour } from './Levels';

export interface StreetPlace {
  id: string;
  name: string;
  z: number;
  blurb: string;
}

export const STREET_PLACES: StreetPlace[] = [
  { id: 'downtown', name: 'وسط البلد', z: 0, blurb: 'أبراج ونوافذ مضيئة' },
  { id: 'port', name: 'الميناء', z: 100, blurb: 'أرصفة وحاويات' },
  { id: 'corniche', name: 'الكورنيش', z: 190, blurb: 'واجهة مائية' },
  { id: 'suburb', name: 'الضاحية', z: -72, blurb: 'بيوت وشوارع هادئة' }
];

export interface ChaseReport {
  success: boolean;
  placeName: string;
  summary: string;
  money: number;
  rep: number;
  title?: string;
  events?: string[];
  durationSec?: number;
  arrests?: number;
  escaped?: number;
  injuries?: number;
  score?: number;
  kindLabel?: string;
}

export type MissionKind = 'chase' | 'robbery' | 'drugs' | 'assault' | 'traffic';

export interface MissionDef {
  id: string;
  placeId: string;
  kind: MissionKind;
  title: string;
  blurb: string;
}

const MISSION_POOL: MissionDef[] = [
  { id: 'm-port-chase', placeId: 'port', kind: 'chase', title: 'مطاردة هاربين', blurb: 'سيارة سودا هاربة من الميناء' },
  { id: 'm-down-rob', placeId: 'downtown', kind: 'robbery', title: 'سطو على محل', blurb: 'مسلحون داخل محل وسط البلد' },
  { id: 'm-corn-drug', placeId: 'corniche', kind: 'drugs', title: 'تفتيش مخدرات', blurb: 'صفقة مشبوهة على الكورنيش' },
  { id: 'm-sub-assault', placeId: 'suburb', kind: 'assault', title: 'اعتداء في الشارع', blurb: 'مشاجرة وعنف في الضاحية' },
  { id: 'm-port-traffic', placeId: 'port', kind: 'traffic', title: 'حادث مروري', blurb: 'تصادم وإغلاق طريق بالميناء' },
  { id: 'm-down-chase', placeId: 'downtown', kind: 'chase', title: 'مطاردة وسط البلد', blurb: 'هارب يقطع الإشارات' },
  { id: 'm-corn-rob', placeId: 'corniche', kind: 'robbery', title: 'سرقة على الكورنيش', blurb: 'سطو على كشك ليلي' },
  { id: 'm-sub-drugs', placeId: 'suburb', kind: 'drugs', title: 'مداهمة بيت', blurb: 'بلاغ مخدرات في الضاحية' }
];

const KIND_LABEL: Record<MissionKind, string> = {
  chase: 'مطاردة',
  robbery: 'سطو',
  drugs: 'مخدرات',
  assault: 'اعتداء',
  traffic: 'حادث'
};

type Ped = {
  mesh: THREE.Group;
  female: boolean;
  phase: number;
  speed: number;
  dir: number;
  z0: number;
  z1: number;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
};

type Traffic = {
  mesh: THREE.Group;
  speed: number;
  laneX: number;
};

type Hold = { f: boolean; b: boolean; l: boolean; r: boolean; run: boolean };

/**
 * Wet night avenue: third-person walk/drive, mixed pedestrians, mission pins.
 */
export class StreetPlay {
  active = false;
  onReport: ((r: ChaseReport) => void) | null = null;

  private group = new THREE.Group();
  private player = new THREE.Group();
  private car = new THREE.Group();
  private suspect: THREE.Group | null = null;
  private rain: THREE.Points | null = null;
  private rainVel: Float32Array | null = null;
  private peds: Ped[] = [];
  private traffic: Traffic[] = [];
  private flash: THREE.PointLight[] = [];
  private inCar = false;
  private squad!: Squad;
  private gangOn = false;
  // ---- mission runner (docs/GAME_DESIGN.md §2)
  private msIdx = -1;
  private msTime = 0;
  private msText = '';
  private msTarget = new THREE.Vector3();
  private msHasTarget = false;
  private chaseThen: Behaviour | null = null;
  private chaseArrest = false;
  private chaseLimit = 45;
  private chaseSpeed = 1;
  private chaseDir = 1;
  private radioQ: Line[] = [];
  private radioDone: (() => void) | null = null;
  private radioT = 0;
  private radioEl: HTMLElement | null = null;
  // first-call interactive tutorial (mission 1, until finished or skipped)
  private tutOn = false;
  private tutEl: HTMLElement | null = null;
  private tutT = 0;
  private tutHtml = '';
  private tutAct: TutAct = null;
  private retEl: HTMLElement | null = null;
  private hudEl: HTMLElement | null = null;
  private hudHtml = '';
  private flags = '';
  private gun = new THREE.Group();
  private recoil = 0;
  private panicAt = new THREE.Vector3();
  private panicT = 0;
  private lights: { z: number; mats: THREE.MeshBasicMaterial[] }[] = [];
  private lightT = 0;
  private avenueGreen = true;
  private tmpV = new THREE.Vector3();
  private chasePath: { x: number; z: number }[] = [];
  private route: { x: number; z: number }[] = [];
  private routeT = 0;
  private firing = false;
  private aimRay = new THREE.Raycaster();
  private aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private aimPt = new THREE.Vector3();
  private distAcc = 0;
  private driver: THREE.Group | null = null;
  level: LevelDef = levelById(progress.current);
  private stepT = 0;
  private uiT = 0;
  lastResult: { success: boolean; levelId: number } | null = null;
  onResultClosed: (() => void) | null = null;
  private yaw = 0;
  private speed = 0;
  private placeId = 'downtown';
  private missionId = 'port';
  private missions: MissionDef[] = [];
  private missionIndex = 0;
  private activeMission: MissionDef | null = null;
  private phase: 'idle' | 'travel' | 'on_scene' | 'acting' | 'chasing' | 'result' = 'idle';
  private chasing = false;
  private chaseTime = 0;
  private actTime = 0;
  private actNeed = 4;
  private sceneCenter = new THREE.Vector3();
  private eventGroup = new THREE.Group();
  private neonMats: THREE.MeshStandardMaterial[] = [];
  private promptEl: HTMLElement | null = null;
  private opStartedAt = 0;
  private travel: { z: number; fast: boolean } | null = null;
  private hold: Hold = { f: false, b: false, l: false, r: false, run: false };
  private keys = new Set<string>();
  private ui: HTMLElement | null = null;
  private mapEl: HTMLElement | null = null;
  private resultEl: HTMLElement | null = null;
  private mini: HTMLCanvasElement | null = null;
  private statusEl: HTMLElement | null = null;
  private camPos = new THREE.Vector3(0, 3, -8);
  private look = new THREE.Vector3();
  private camDest = new THREE.Vector3();
  private mounted = false;
  private boundKeyDown = (e: KeyboardEvent) => this.onKey(e, true);
  private boundKeyUp = (e: KeyboardEvent) => this.onKey(e, false);
  /** Desktop: left-click on the 3D view aims at the cursor and fires. */
  private boundMouse = (e: MouseEvent) => {
    if (this.inCar || e.button !== 0 || (e.target as HTMLElement).tagName !== 'CANVAS' || (e.target as HTMLElement).id === 'street-mini') return;
    const r = (e.target as HTMLElement).getBoundingClientRect();
    this.aimRay.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    if (this.aimRay.ray.intersectPlane(this.aimPlane, this.aimPt)) {
      this.yaw = Math.atan2(this.aimPt.x - this.player.position.x, this.aimPt.z - this.player.position.z);
      this.player.rotation.y = this.yaw;
    }
    this.firing = true;
  };
  private boundMouseUp = () => { if (!this.hold.run) this.firing = false; };

  constructor(
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    private root: THREE.Group,
    private carRoot: THREE.Group,
    private markerRoot: THREE.Group
  ) {
    this.buildWorld();
    this.scene.add(this.group);
    this.group.visible = false;
    this.reshuffleMissions();
  }

  private reshuffleMissions() {
    const copy = [...MISSION_POOL];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    this.missions = copy.slice(0, 4);
    this.missionIndex = 0;
    this.activeMission = this.missions[0] || null;
    this.missionId = this.activeMission?.placeId || 'port';
  }

  private currentMission() {
    return this.missions[this.missionIndex] || this.activeMission;
  }

  private mat(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.12, ...opts });
  }

  private box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private buildWorld() {
    const roadMat = this.mat(0x3b4048, { roughness: 0.82, metalness: 0.05 });
    const road = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.08, 340), roadMat);
    road.position.set(0, 0.04, 60);
    road.receiveShadow = true;
    this.group.add(road);

    const wet = new THREE.Mesh(
      new THREE.PlaneGeometry(8.4, 330),
      new THREE.MeshStandardMaterial({
        color: 0x6a8aa8,
        roughness: 0.15,
        metalness: 0.2,
        transparent: true,
        opacity: 0.12
      })
    );
    wet.rotation.x = -Math.PI / 2;
    wet.position.set(0, 0.09, 60);
    this.group.add(wet);

    const walkMat = this.mat(0x9a9ea4, { roughness: 0.8, metalness: 0.02 });
    for (const side of [-1, 1]) {
      const sw = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.14, 340), walkMat);
      sw.position.set(side * 6.4, 0.07, 60);
      sw.receiveShadow = true;
      this.group.add(sw);
    }

    const line = this.mat(0xf0d060, { emissive: 0x886600, emissiveIntensity: 0.55, roughness: 0.4 });
    for (let z = -90; z < 230; z += 8) {
      this.group.add(this.box(0.16, 0.02, 3.2, line, 0, 0.1, z));
    }

    this.buildStreetRows();
    for (const place of STREET_PLACES) {
      this.buildBlock(place);
      this.addCrosswalk(place.z + 12);
    }
    for (let z = -90; z < 230; z += 20) {
      this.addLamp(-5.2, z);
      this.addLamp(5.2, z + 10);
    }
    for (let z = -80; z < 220; z += 40) this.addProps(z);

    this.buildLights();
    this.buildBeacon();
    this.player = this.makeOfficer();
    this.player.position.set(0.9, 0, 0);
    this.group.add(this.player);
    this.car = this.makePoliceCar(true);
    this.car.position.set(-1.4, 0, 2);
    this.group.add(this.car);
    this.driver = this.makeOfficer();
    this.driver.scale.setScalar(0.62);
    this.driver.position.set(0.32, 0.12, -0.15);
    models.setClip(this.driver, 'drive');
    this.driver.visible = false;
    this.car.add(this.driver);
    this.group.add(this.eventGroup);
    this.mergeStatic();
    buildCity(this.group, Q.lowDetailPeople);
    this.spawnCrossTraffic();
    this.squad = new Squad(this.group, (hostage) => {
      const g = hostage
        ? this.makePerson(true, 0xe7d7c1, 0x3a2416).g
        : this.makePerson(false, [0x2a2a2a, 0x7a1f1f, 0x3a2a4a, 0x1f3a2a][Math.floor(Math.random() * 4)], 0x0e0e0e).g;
      models.setClip(g, 'idle');
      return g;
    });
    this.squad.onGunfire = (x, z) => { this.panicAt.set(x, 0, z); this.panicT = 6; };
    this.squad.onShot = () => { this.recoil = 1; };
    this.buildGun();
    this.buildTrafficLights();
    this.spawnPeople();
    this.spawnTraffic();
    this.buildRain();
  }

  /** Merge all static street meshes (road, lines, lamps, props, shop fronts) into one mesh per material: ~400 draw calls -> ~30. */
  private mergeStatic() {
    this.group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.group.matrixWorld).invert();
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const remove: THREE.Object3D[] = [];
    const take = (m: THREE.Mesh) => {
      const g = m.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.index) return null;
      const mat = m.material as THREE.Material;
      if (!byMat.has(mat)) byMat.set(mat, []);
      byMat.get(mat)!.push(g);
      return true;
    };
    for (const c of [...this.group.children]) {
      const m = c as THREE.Mesh;
      if (m.isMesh && !c.userData.dynamic && !Array.isArray(m.material) && m.geometry.index) {
        if (take(m)) remove.push(c);
      } else if (c.userData.static) {
        c.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh && mm.geometry.index) take(mm); });
        remove.push(c);
      }
    }
    for (const c of remove) c.removeFromParent();
    for (const [mat, geos] of byMat) {
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      this.group.add(mesh);
    }
  }

  private buildBlock(place: StreetPlace) {
    const sign = this.makeSign(place.name);
    sign.position.set(-8, 0, place.z);
    this.group.add(sign);
  }

  /** Continuous rows of buildings with ground-floor shops along the whole street. */
  private buildStreetRows() {
    const shops: Array<[string, string]> = [
      ['صيدلية', '#2ecc71'], ['مخبز', '#f39c12'], ['كافيه', '#a0522d'], ['سوبر ماركت', '#e74c3c'],
      ['مطعم', '#e67e22'], ['ملابس', '#9b59b6'], ['موبايلات', '#3498db'], ['حلويات', '#ff6fa8'], ['بنك', '#16a085'], ['مكتبة', '#c0a050']
    ];
    let n = 0;
    for (const side of [-1, 1]) {
      for (let z = -96; z <= 232; z += 9) {
        if (nearCross(z, 8)) continue;
        const near = STREET_PLACES.reduce((a, p) => (Math.abs(p.z - z) < Math.abs(a.z - z) ? p : a));
        const seed = Math.abs(Math.floor(z * 7 + side * 13));
        const h = near.id === 'downtown' ? 9 + (seed % 12) : near.id === 'suburb' ? 4 + (seed % 3) : 5 + (seed % 7);
        const w = 6 + (seed % 3);
        const bg = new THREE.Group();
        bg.position.set(side * (8.4 + w / 2), 0, z);
        bg.add(this.box(w, h, 8.4, this.mat(0x8a94a0), 0, h / 2, 0));
        const kinds = h > 10 ? TOWERS : LOW_BUILDINGS;
        models.dress(bg, kinds[seed % kinds.length], { box: [w, h, 8.4], yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2, noShadow: true });
        this.group.add(bg);
        if (near.id !== 'suburb' || seed % 2 === 0) this.addShop(side, z, shops[n++ % shops.length]);
      }
    }
  }

  private shopMats = new Map<string, THREE.Material>();
  private addShop(side: number, z: number, [name, color]: [string, string]) {
    const fx0 = side * 8.25;
    const rot = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    const g = new THREE.Group();
    g.position.set(fx0, 0, z);
    g.rotation.y = rot;
    g.userData.static = true;
    // lit shop window
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 2.2),
      new THREE.MeshStandardMaterial({ color: 0xfff4dc, emissive: 0xffe2b0, emissiveIntensity: 0.9, roughness: 0.2 }));
    glass.position.set(0, 1.35, 0.06);
    g.add(glass);
    // awning
    let aw = this.shopMats.get(color);
    if (!aw) { aw = this.mat(new THREE.Color(color).getHex(), { roughness: 0.6 }); this.shopMats.set(color, aw); }
    const awning = new THREE.Mesh(new THREE.BoxGeometry(6, 0.12, 1.4), aw);
    awning.position.set(0, 2.75, 0.7);
    awning.rotation.x = 0.25;
    g.add(awning);
    // sign
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const x = c.getContext('2d')!;
    x.fillStyle = color; x.fillRect(0, 0, 256, 64);
    x.fillStyle = '#fff'; x.font = 'bold 40px Cairo, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.direction = 'rtl'; x.fillText(name, 128, 34);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.05),
      new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0.25 }));
    (sign.material as THREE.MeshStandardMaterial).emissiveMap = (sign.material as THREE.MeshStandardMaterial).map;
    sign.position.set(0, 3.55, 0.1);
    g.add(sign);
    this.group.add(g);
  }

  private makeSign(text: string) {
    const g = new THREE.Group();
    const pole = this.mat(0x5a6470, { metalness: 0.6, roughness: 0.4 });
    g.add(this.box(0.14, 3.2, 0.14, pole, 0, 1.6, 0));
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 160;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#102033';
    ctx.fillRect(0, 0, 512, 160);
    ctx.strokeStyle = '#7ec8ff';
    ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, 496, 144);
    ctx.fillStyle = '#f4f7ff';
    ctx.font = 'bold 72px Cairo, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = 'rtl';
    ctx.fillText(text, 256, 80);
    const tex = new THREE.CanvasTexture(canvas);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 1.05),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    board.position.set(0, 3.15, 0);
    board.rotation.y = Math.PI / 2;
    g.add(board);
    return g;
  }

  private addCrosswalk(z: number) {
    const m = this.mat(0xd8dde6, { roughness: 0.4, emissive: 0x8899aa, emissiveIntensity: 0.15 });
    for (let i = -3; i <= 3; i++) {
      this.group.add(this.box(0.45, 0.02, 7.6, m, i * 0.7, 0.11, z));
    }
  }

  private addLamp(x: number, z: number) {
    const pole = this.mat(0x2a2e34, { metalness: 0.6, roughness: 0.35 });
    this.group.add(this.box(0.12, 4.4, 0.12, pole, x, 2.2, z));
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 10, 8),
      new THREE.MeshStandardMaterial({
        color: 0xfff1c4,
        emissive: 0xffc56a,
        emissiveIntensity: 2.2,
        roughness: 0.3
      })
    );
    head.position.set(x, 4.45, z);
    this.group.add(head);
    // No per-lamp PointLight (dozens of them break/slow mobile GPUs): glow halo + warm light pool on the ground.
    const halo = new THREE.Object3D() as THREE.PointLight;
    (halo as unknown as { intensity: number }).intensity = 2.5;
    halo.position.set(x, 4.45, z);
    this.group.add(halo);
    fx.glow(halo, 0xffc56a, 1.8);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(3.2, 20), this.poolMat());
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x * 0.7, 0.12, z);
    this.group.add(pool);
  }

  private _pool: THREE.MeshBasicMaterial | null = null;
  private poolMat() {
    if (this._pool) return this._pool;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,200,120,0.55)');
    gr.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    this._pool = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    return this._pool;
  }

  /** Bright evening light rig for street mode (hemisphere + moon/sun key light with shadows that follow the player). */
  private key: THREE.DirectionalLight | null = null;
  private beacon = new THREE.Group();
  private arrow: THREE.Mesh | null = null;
  private buildBeacon() {
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 40, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 20;
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 2.2, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    this.beacon.add(beam, ring);
    this.group.add(this.beacon);
    // floating chevron above the target (suspect during chase)
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 4),
      new THREE.MeshBasicMaterial({ color: 0xff3355 }));
    this.arrow.rotation.x = Math.PI;
    this.arrow.userData.dynamic = true;
    this.group.add(this.arrow);
  }

  /** GTA-style objective list + target marker + on-screen direction arrow. */
  private objectiveWorld() {
    if (!this.arrow || !this.arrow.visible) return;
    this.arrow.position.set(this.msTarget.x, (this.chasing ? 3 : 4.5) + Math.sin(performance.now() / 250) * 0.3, this.msTarget.z);
    this.arrow.rotation.y += 0.04;
  }


  /** Current objective card (8 Hz): big step text + distance + timer; drives beacon, 3D chevron and edge arrow. */
  private objective() {
    const pos = this.inCar ? this.car.position : this.player.position;
    const has = this.msHasTarget && !this.resultEl;
    const dist = has ? Math.hypot(this.msTarget.x - pos.x, this.msTarget.z - pos.z) : 0;
    if (this.objEl) {
      const timer = this.msIdx >= 0 ? `<span class="timer">⏱ ${Math.max(0, Math.ceil(this.level.limit - this.msTime))}ث</span>` : '';
      const html = `<small>${isPatrol(this.level.id) ? '🚨' : `مهمة ${this.level.id}/${LEVELS.length}`} · ${this.level.title} ${timer}</small><div class="now">➤ ${this.msText || '...'}${has ? ` <em>${Math.round(dist)} م</em>` : ''}</div>`;
      if (html !== this.objHtml) { this.objEl.innerHTML = html; this.objHtml = html; }
    }
    const step = this.level.steps[this.msIdx];
    this.beacon.visible = has && step?.t === 'goto';
    this.beacon.position.set(this.msTarget.x, 0, this.msTarget.z);
    if (this.arrow) this.arrow.visible = has && step?.t !== 'goto';
    if (this.dirEl) {
      this.dirEl.dataset.d = `${Math.round(dist)} م`;
      const v = this.tmpV.copy(this.msTarget).setY(1.5).project(this.camera);
      const on = Math.abs(v.x) < 0.9 && Math.abs(v.y) < 0.85 && v.z < 1;
      this.dirEl.style.display = has && dist > 4 ? 'block' : 'none';
      this.dirEl.classList.toggle('onscreen', on);
      if (on) {
        this.dirEl.style.left = `${(v.x * 0.5 + 0.5) * 100}%`;
        this.dirEl.style.top = `${(-v.y * 0.5 + 0.5) * 100}%`;
        this.dirEl.style.transform = 'translate(-50%,-100%)';
      } else {
        let ang = Math.atan2(v.y, v.x);
        if (v.z > 1) ang += Math.PI;
        this.dirEl.style.left = `${50 + Math.cos(ang) * 38}%`;
        this.dirEl.style.top = `${50 - Math.sin(ang) * 30}%`;
        this.dirEl.style.transform = `translate(-50%,-50%) rotate(${-ang}rad)`;
      }
    }
    this.renderHud();
  }

  // ===================== mission runner =====================
  private startMission() {
    this.msIdx = 0;
    this.msTime = 0;
    this.squad.resetPlayer();
    let seen = false;
    try { seen = !!localStorage.getItem(TUT_KEY); } catch { /* private mode */ }
    this.tutOn = this.level.id === 1 && !seen;
    this.tutHtml = '';
    this.enterStep();
  }

  private endTutorial(save: boolean) {
    if (save) { try { localStorage.setItem(TUT_KEY, '1'); } catch { /* ignore */ } }
    this.tutOn = false;
    this.setTutGlow(null);
    if (this.tutEl) { this.tutEl.classList.remove('show'); this.tutEl.innerHTML = ''; }
    this.tutHtml = '';
  }

  private setTutGlow(act: TutAct) {
    if (act === this.tutAct) return;
    this.ui?.querySelectorAll('.tut-glow').forEach((e) => e.classList.remove('tut-glow'));
    this.tutAct = act;
    if (!act || !this.ui) return;
    const sel = act === 'move' ? '.street-stick, .street-pad' : `[data-act="${act}"]`;
    this.ui.querySelectorAll(sel).forEach((e) => e.classList.add('tut-glow'));
  }

  private stepTutorial(dt: number) {
    if (!this.tutOn || !this.tutEl) return;
    this.tutT -= dt;
    if (this.tutT > 0) return;
    this.tutT = 0.25;
    const st = this.msIdx >= 0 ? this.level.steps[this.msIdx] : undefined;
    const me = this.player.position;
    let best: { state: string; d: number } | undefined;
    for (const x of this.squad.list) {
      if (x.state === 'cuffed' || x.state === 'down') continue;
      const d = Math.hypot(x.g.position.x - me.x, x.g.position.z - me.z);
      if (!best || d < best.d) best = { state: x.state, d };
    }
    const hint = this.resultEl ? null : tutorialHint({
      step: st ? st.t : 'done', inCar: this.inCar, radioShowing: !!this.radioEl?.classList.contains('show'),
      targetState: best?.state, targetDist: best?.d, touch: matchMedia('(pointer:coarse)').matches
    });
    this.setTutGlow(hint?.act ?? null);
    const html = hint ? `<b>تعليم ${hint.n}/${TUT_STEPS}</b><span>${hint.text}</span><button type="button" data-tut="skip">تخطي</button>` : '';
    if (html !== this.tutHtml) {
      this.tutHtml = html;
      this.tutEl.innerHTML = html;
      this.tutEl.classList.toggle('show', !!html);
    }
  }

  private nextStep() {
    if (this.msIdx < 0) return;
    this.msIdx++;
    this.enterStep();
  }

  private enterStep() {
    const st = this.level.steps[this.msIdx];
    this.msHasTarget = false;
    if (!st) { this.finishMission(true); return; }
    switch (st.t) {
      case 'radio': this.msText = 'اسمع اللاسلكي'; this.radio(st.lines, () => this.nextStep()); break;
      case 'car': this.msText = st.text ?? 'اركب الدورية'; if (this.inCar) this.nextStep(); break;
      case 'goto': this.msText = st.text; this.msTarget.set(st.x, 0, st.z); this.msHasTarget = true; break;
      case 'chase': this.msText = st.text ?? 'الحق العربية'; this.chaseThen = st.then ?? null; this.chaseLimit = st.limit; this.chaseSpeed = st.speed; this.beginChase(); break;
      case 'suspects': {
        this.msText = st.text;
        const prev = [...this.level.steps].slice(0, this.msIdx).reverse().find((x) => x.t === 'goto');
        const approachZ = prev && prev.t === 'goto' ? prev.z : this.player.position.z;
        this.squad.spawn(st.x, st.z, st.list, { cover: st.cover, hostage: st.hostage, approachZ });
        if (st.list.some((x) => x.b === 'fight')) { audio.setTrack('music'); this.setStatus('⚠ مسلحين! اتحامى واضرب.'); }
        break;
      }
    }
  }

  /** per-frame mission logic: cheap distance checks only */
  private tickMission(dt: number) {
    if (this.msIdx < 0 || this.resultEl) return;
    const st = this.level.steps[this.msIdx];
    if (!st) return;
    this.msTime += dt;
    const pos = this.inCar ? this.car.position : this.player.position;
    switch (st.t) {
      case 'car':
        this.msTarget.copy(this.car.position); this.msHasTarget = !this.inCar;
        if (this.inCar) this.nextStep();
        break;
      case 'goto':
        // 2D distance from whatever the player controls (car or on foot): fixes the old "1 m" stall
        if (Math.hypot(st.x - pos.x, st.z - pos.z) < (st.r ?? 9)) { this.setStatus('وصلت.'); this.nextStep(); }
        break;
      case 'chase':
        if (this.chaseArrest) {
          const t = this.squad.list.find((x) => x.state !== 'cuffed' && x.state !== 'down');
          if (t) { this.msTarget.copy(t.g.position); this.msHasTarget = true; }
          this.msText = this.inCar ? 'انزل واقبض على السواق' : 'اقبض على السواق';
          if (this.squad.done()) { this.chaseArrest = false; this.nextStep(); }
        } else if (this.suspect) { this.msTarget.copy(this.suspect.position); this.msHasTarget = true; }
        break;
      case 'suspects': {
        const left = this.squad.remaining();
        const t = this.squad.list.find((x) => x.state !== 'cuffed' && x.state !== 'down');
        if (t) { this.msTarget.copy(t.g.position); this.msHasTarget = true; }
        this.msText = `${st.text} (${left} باقيين)`;
        if (this.squad.done() && !this.squad.hostage) this.nextStep();
        else if (this.squad.done() && this.squad.hostage?.state === 'free') this.nextStep();
        break;
      }
      case 'radio': break;
    }
    if (this.squad.failed) this.finishMission(false, this.squad.failed);
    else if (!this.tutOn && this.msTime > this.level.limit) this.finishMission(false, 'الوقت خلص.');
  }

  // ---- radio dialogue
  private static WHO: Record<string, [string, string]> = {
    mona: ['الرقيب منى · العمليات', '#3aa0ff'], hamed: ['النقيب حامد', '#ffd23d'], yasser: ['ياسر', '#7dff9a'],
    suspect: ['المشتبه به', '#ff6b81'], informant: ['الواشي', '#c39bff'], boss: ['الزعيم', '#ff3b3b']
  };
  private radio(lines: Line[], done: (() => void) | null) {
    this.radioQ = [...lines];
    this.radioDone = done;
    this.showRadio();
  }
  private showRadio() {
    const l = this.radioQ.shift();
    if (!l) {
      this.radioEl?.classList.remove('show');
      const d = this.radioDone; this.radioDone = null; d?.();
      return;
    }
    const [name, col] = StreetPlay.WHO[l.who] ?? ['', '#fff'];
    if (this.radioEl) {
      this.radioEl.innerHTML = `<i style="background:${col}">📻</i><div><b style="color:${col}">${name}</b><p>${l.text}</p></div><span>اضغط ▶</span>`;
      this.radioEl.classList.add('show');
    }
    audio.click();
    this.radioT = 2.6 + l.text.length * 0.045;
  }
  private tickRadio(dt: number) {
    if (this.radioT <= 0) return;
    this.radioT -= dt;
    if (this.radioT <= 0) this.showRadio();
  }

  // ---- HUD: weapon, health, threat, rank (8 Hz, string-compared)
  private renderHud() {
    const q = this.squad;
    const stars = Math.round(q.threat);
    const html = `<div class="gun">🔫 <b>${q.reloading ? 'تعمير…' : `${q.ammo}/${q.mag}`}</b></div>
      <div class="bar hp"><i style="width:${q.hp}%"></i><span>❤ ${Math.round(q.hp)}</span></div>
      <div class="bar ar"><i style="width:${q.armor * 2}%"></i><span>🛡 ${Math.round(q.armor)}</span></div>
      <div class="threat">${stars ? 'تهديد ' + '★'.repeat(stars) + '☆'.repeat(5 - stars) : `رتبة: ${rank().name}`}</div>`;
    if (this.hudEl && html !== this.hudHtml) { this.hudEl.innerHTML = html; this.hudHtml = html; }
    // contextual buttons
    const me = this.player.position;
    const t = this.inCar ? null : q.target(me, this.yaw, 18);
    const can = (t && t.state !== 'hands' && t.state !== 'hostage' ? 'o' : '') + (!this.inCar && q.cuffable(me) ? 'c' : '');
    if (can !== this.flags) {
      this.flags = can;
      document.documentElement.classList.toggle('can-order', can.includes('o'));
      document.documentElement.classList.toggle('can-cuff', can.includes('c'));
    }
  }

  /** reticle on the locked target (per frame, one projection) */
  private tickReticle() {
    if (!this.retEl) return;
    const t = this.inCar || this.resultEl ? null : this.squad.target(this.player.position, this.yaw, 24);
    if (!t) { if (this.retEl.style.display !== 'none') this.retEl.style.display = 'none'; return; }
    const v = this.tmpV.set(t.g.position.x, 1.25 + t.g.position.y, t.g.position.z).project(this.camera);
    this.retEl.style.display = 'block';
    this.retEl.style.left = `${(v.x * 0.5 + 0.5) * 100}%`;
    this.retEl.style.top = `${(-v.y * 0.5 + 0.5) * 100}%`;
    const cls = t.state === 'hands' ? 'cuff' : t.hidden ? 'cover' : 'hot';
    if (this.retEl.dataset.c !== cls) { this.retEl.dataset.c = cls; this.retEl.className = cls; }
  }

  private orderSurrender() {
    if (this.inCar) return;
    audio.sample('door', 0.01);
    this.setStatus('📢 «شرطة! ارفع إيدك!» — ' + this.squad.order(this.player.position, this.yaw));
  }
  private cuffNow() {
    const s = this.squad.cuffable(this.player.position);
    if (!s) { this.setStatus('قرّب من المشتبه به المستسلم.'); return; }
    this.squad.cuff(s);
    this.setStatus('🔗 اتكلبش.');
  }

  // ---- visible pistol in the officer's hand + recoil
  private buildGun() {
    const m = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.4, metalness: 0.6 });
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.055, 0.22), m);
    slide.position.z = 0.06;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.06), m);
    grip.position.set(0, -0.07, -0.02); grip.rotation.x = 0.25;
    this.gun.add(slide, grip);
    this.gun.userData.dynamic = true;
    this.player.add(this.gun);
  }
  private tickGun(dt: number) {
    const aiming = !this.inCar && (this.firing || !!this.squad.target(this.player.position, this.yaw, 24));
    this.recoil = Math.max(0, this.recoil - dt * 8);
    // arm extended forward when aiming, holstered at the hip otherwise
    if (aiming) this.gun.position.set(0.22, 1.36, 0.55 - this.recoil * 0.06);
    else this.gun.position.set(0.24, 0.95, 0.05);
    this.gun.rotation.set(aiming ? -this.recoil * 0.5 : 1.2, 0, 0);
    this.player.userData.forceClip = this.inCar ? null : this.firing ? 'gun' : aiming ? 'aim' : null;
  }

  // ---- traffic lights at the three avenue intersections
  private buildTrafficLights() {
    const pole = new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.6 });
    const ave = new THREE.MeshBasicMaterial({ color: 0x33ff66 });
    const cross = new THREE.MeshBasicMaterial({ color: 0xff3030 });
    for (const z of CROSS_Z.slice(1, 4)) {
      for (const sx of [-1, 1]) {
        const g = new THREE.Group();
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.16, 4.2, 0.16), pole); p.position.y = 2.1;
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.9, 0.35), pole); head.position.y = 4.2;
        const la = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), ave); la.position.set(0, 4.2, 0.2 * -sx);
        const lc = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), cross); lc.position.set(0.24 * sx, 4.2, 0);
        g.add(p, head, la, lc);
        g.position.set(sx * 5.4, 0, z - sx * 5.6);
        g.userData.dynamic = true;
        this.group.add(g);
      }
      this.lights.push({ z, mats: [ave, cross] });
    }
  }
  private tickLights(dt: number) {
    this.lightT += dt;
    const green = this.lightT % 16 < 10;
    if (green === this.avenueGreen) return;
    this.avenueGreen = green;
    for (const l of this.lights) { l.mats[0].color.setHex(green ? 0x33ff66 : 0xff3030); l.mats[1].color.setHex(green ? 0xff3030 : 0x33ff66); }
  }

  private objEl: HTMLElement | null = null;
  private dirEl: HTMLElement | null = null;
  private objHtml = '';

  /** Mission start card; blocks input until "start". */
  private briefing() {
    this.closeResultSilently();
    const steps = this.level.steps.filter((x) => x.t !== 'radio').map((x) =>
      x.t === 'car' ? 'اركب الدورية' : x.t === 'goto' ? x.text + ' (اتبع الـGPS الأصفر)' : x.t === 'chase' ? x.text ?? 'الحق العربية' : x.text);
    const el = document.createElement('div');
    el.id = 'street-result';
    el.innerHTML = `<div class="street-result-card mission-card"><div class="mc-tag">${isPatrol(this.level.id) ? '🚨 بلاغ دورية' : `مهمة ${this.level.id} من ${LEVELS.length}`} · رتبتك: ${rank().name}</div><h2>${this.level.title}</h2>
      <p>${this.level.brief}</p>
      <ol class="mc-steps">${steps.map((t, i) => `<li><span>${i + 1}</span>${t}</li>`).join('')}</ol>
      <p class="mc-help">🔫 اضرب · 📢 «استسلم!» لما توجّه على مشتبه به · 🔗 «كلبش» لما يرفع إيده</p>
      <p class="mc-reward">المكافأة: $${this.level.reward.toLocaleString('en')} · ⭐ لو خلصت بسرعة</p>
      <button type="button" data-ok>ابدأ المهمة</button></div>`;
    document.getElementById('app')!.appendChild(el);
    this.resultEl = el;
    el.querySelector('[data-ok]')!.addEventListener('click', () => { audio.click(); this.closeResultSilently(); this.startMission(); });
  }


  private buildLights() {
    this.group.add(new THREE.HemisphereLight(0xcfe0ff, 0x56606c, 1.7));
    this.group.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffe2c0, 1.6);
    key.castShadow = Q.shadows;
    key.shadow.mapSize.set(Q.shadowMap, Q.shadowMap);
    const sc = key.shadow.camera;
    sc.left = -25; sc.right = 25; sc.top = 25; sc.bottom = -25; sc.near = 1; sc.far = 90;
    key.shadow.bias = -0.0004;
    this.group.add(key, key.target);
    this.key = key;
  }

  private addProps(z: number) {
    const bin = this.mat(0x1e6b45, { roughness: 0.6 });
    this.group.add(this.box(0.7, 1.0, 0.7, bin, 7.4, 0.5, z + 4));
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.55, 8),
      this.mat(0xff7a1a, { emissive: 0xff5500, emissiveIntensity: 0.25 })
    );
    cone.position.set(3.6, 0.28, z - 3);
    this.group.add(cone);
    const hydrant = this.mat(0xc42828, { roughness: 0.45 });
    this.group.add(this.box(0.28, 0.7, 0.28, hydrant, -7.2, 0.4, z + 14));
    const bench = this.mat(0x6b4a32, { roughness: 0.7 });
    this.group.add(this.box(1.4, 0.12, 0.45, bench, 7.1, 0.48, z - 10));
  }

  private makeOfficer() {
    const g = new THREE.Group();
    const navy = this.mat(0x142033, { roughness: 0.55 });
    const skin = this.mat(0xd7a679);
    g.add(this.box(0.46, 0.62, 0.28, navy, 0, 1.15, 0));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), skin);
    head.position.y = 1.62;
    g.add(head);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 10), this.mat(0x0c1420));
    cap.position.y = 1.76;
    g.add(cap);
    const legL = this.box(0.14, 0.7, 0.16, navy, -0.12, 0.35, 0);
    const legR = this.box(0.14, 0.7, 0.16, navy, 0.12, 0.35, 0);
    g.add(legL, legR);
    g.userData.legs = [legL, legR];
    models.dress(g, 'officer', { height: 1.8 });
    return g;
  }

  private makePerson(female: boolean, dress: number, hair: number) {
    const g = new THREE.Group();
    const skinC = female ? 0xf0c2a4 : 0xc68658;
    const skin = this.mat(skinC);
    const cloth = this.mat(dress, { roughness: 0.6 });
    const hairMat = this.mat(hair, { roughness: 0.45 });
    const legMat = this.mat(female ? 0x2a2428 : 0x243044);

    const legL = new THREE.Group();
    const legR = new THREE.Group();
    legL.position.set(female ? -0.07 : -0.09, 0.78, 0);
    legR.position.set(female ? 0.07 : 0.09, 0.78, 0);
    legL.add(this.box(female ? 0.09 : 0.12, 0.74, 0.12, legMat, 0, -0.37, 0));
    legR.add(this.box(female ? 0.09 : 0.12, 0.74, 0.12, legMat, 0, -0.37, 0));
    g.add(legL, legR);

    if (female) {
      const dressMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.26, 0.62, 8), cloth);
      dressMesh.position.y = 1.12;
      g.add(dressMesh);
    } else {
      g.add(this.box(0.42, 0.55, 0.24, cloth, 0, 1.16, 0));
    }

    const armL = new THREE.Group();
    const armR = new THREE.Group();
    armL.position.set(female ? -0.2 : -0.26, 1.32, 0);
    armR.position.set(female ? 0.2 : 0.26, 1.32, 0);
    armL.add(this.box(0.08, 0.46, 0.08, cloth, 0, -0.22, 0));
    armR.add(this.box(0.08, 0.46, 0.08, cloth, 0, -0.22, 0));
    g.add(armL, armR);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), skin);
    head.position.y = female ? 1.58 : 1.6;
    g.add(head);
    const eye = this.mat(0x1a1a1a);
    const eL = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 6), eye);
    const eR = eL.clone();
    eL.position.set(-0.05, head.position.y + 0.01, 0.13);
    eR.position.set(0.05, head.position.y + 0.01, 0.13);
    g.add(eL, eR);

    if (female) {
      const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), hairMat);
      hairMesh.scale.set(1, 1.15, 1.2);
      hairMesh.position.set(0, 1.64, -0.02);
      g.add(hairMesh);
      const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.32, 3, 6), hairMat);
      tail.position.set(0.02, 1.38, -0.12);
      g.add(tail);
    } else {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.155, 10, 8), hairMat);
      cap.scale.set(1, 0.55, 1);
      cap.position.set(0, 1.7, 0);
      g.add(cap);
    }
    // always the realistic (Quaternius) set — the blocky Kenney people looked like toys on phones
    const pool = REAL_PEOPLE;
    const pick = female ? pool[1 + ((hair >> 4) % 2)] : pool[0];
    models.dress(g, pick, { height: female ? 1.68 : 1.8 });
    return { g, legL, legR, armL, armR };
  }

  private spawnPeople() {
    const dresses = [0x8d2f45, 0x1f6f6a, 0xe7d7c1, 0x111111, 0x3d4d8a];
    const hairs = [0x1a120e, 0x3a2416, 0x0e0e0e, 0x5a3820];
    const jackets = [0x1c2430, 0x4a4038, 0x202228, 0x16324a];
    let n = 0;
    for (const place of STREET_PLACES) {
      for (let i = 0; i < (Q.lowDetailPeople ? 4 : 6); i++) {
        const female = i % 2 === 0;
        const col = female ? dresses[n % dresses.length] : jackets[n % jackets.length];
        const built = this.makePerson(female, col, hairs[n % hairs.length]);
        const side = i < 3 ? 1 : -1;
        const z = place.z - 18 + (i % 3) * 12;
        built.g.position.set(side * 6.5, 0, z);
        this.group.add(built.g);
        this.peds.push({
          mesh: built.g,
          female,
          phase: Math.random() * Math.PI * 2,
          speed: 0.7 + Math.random() * 0.55,
          dir: i % 2 === 0 ? 1 : -1,
          z0: place.z - 28,
          z1: place.z + 28,
          legL: built.legL,
          legR: built.legR,
          armL: built.armL,
          armR: built.armR
        });
        n++;
      }
    }
  }

  private makePoliceCar(lights: boolean) {
    const g = new THREE.Group();
    const body = this.mat(0x0e1624, { metalness: 0.55, roughness: 0.28 });
    const white = this.mat(0xe8eef6, { metalness: 0.3, roughness: 0.35 });
    g.add(this.box(1.7, 0.45, 4.1, body, 0, 0.55, 0));
    g.add(this.box(1.55, 0.42, 2.0, white, 0, 0.95, -0.15));
    const glass = new THREE.MeshStandardMaterial({
      color: 0x173044,
      roughness: 0.05,
      metalness: 0.2,
      transparent: true,
      opacity: 0.75
    });
    g.add(this.box(1.4, 0.32, 1.7, glass, 0, 0.98, -0.15));
    const wheel = this.mat(0x111111, { roughness: 0.9 });
    for (const [x, z] of [[-0.75, 1.25], [0.75, 1.25], [-0.75, -1.25], [0.75, -1.25]] as const) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.22, 10), wheel);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.28, z);
      g.add(w);
    }
    if (lights) {
      const red = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.12, 0.18),
        new THREE.MeshStandardMaterial({ color: 0xff2244, emissive: 0xff0033, emissiveIntensity: 2 })
      );
      const blue = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.12, 0.18),
        new THREE.MeshStandardMaterial({ color: 0x2266ff, emissive: 0x0044ff, emissiveIntensity: 2 })
      );
      red.position.set(-0.22, 1.22, -0.1);
      blue.position.set(0.22, 1.22, -0.1);
      g.add(red, blue);
      const lr = new THREE.PointLight(0xff2244, 0, 10, 2);
      const lb = new THREE.PointLight(0x2266ff, 0, 10, 2);
      lr.position.copy(red.position);
      lb.position.copy(blue.position);
      g.add(lr, lb);
      g.userData.lights = [lr, lb];
      this.flash.push(lr, lb);
      fx.glow(lr, 0xff2244);
      fx.glow(lb, 0x2266ff);
    }
    models.dress(g, 'police-real', { length: 4.6 });
    return g;
  }

  private makeSuspectCar() {
    const g = new THREE.Group();
    const body = this.mat(0x1a1a1a, { metalness: 0.65, roughness: 0.25 });
    g.add(this.box(1.65, 0.4, 4.0, body, 0, 0.5, 0));
    g.add(this.box(1.45, 0.35, 1.6, this.mat(0x111111, { metalness: 0.4 }), 0, 0.88, -0.2));
    const tail = new THREE.PointLight(0xff2200, 1.4, 6, 2);
    tail.position.set(0, 0.55, -1.9);
    g.add(tail);
    models.dress(g, 'challenger', { length: 4.7 });
    return g;
  }

  private cross: { mesh: THREE.Group; speed: number }[] = [];
  private spawnCrossTraffic() {
    const tints = [0xd94a4a, 0xffffff, 0x4a7bd6, 0x3a3a3a, 0xd9b44a, 0x3f9a5a];
    CROSS_Z.slice(1, 4).forEach((z, i) => {
      for (let k = 0; k < 2; k++) {
        const mesh = new THREE.Group();
        const dir = k ? 1 : -1;
        mesh.position.set(-100 + i * 70 + k * 40, 0, z + dir * 1.7);
        mesh.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        models.dress(mesh, (Q.lowDetailPeople ? LOW_CARS : CARS)[0], { length: 4.5, tint: Q.lowDetailPeople ? undefined : tints[(i * 2 + k) % tints.length] });
        this.group.add(mesh);
        this.cross.push({ mesh, speed: dir * (5 + i) });
      }
    });
  }

  private spawnTraffic() {
    const colors = [0x2a2e33, 0x4a4038, 0x1a3348, 0x33302c, 0x20242a];
    for (let i = 0; i < 7; i++) {
      const mesh = new THREE.Group();
      const c = this.mat(colors[i % colors.length], { metalness: 0.45, roughness: 0.35 });
      mesh.add(this.box(1.5, 0.4, 3.4, c, 0, 0.48, 0));
      mesh.add(this.box(1.3, 0.32, 1.5, this.mat(0x0e1824, { roughness: 0.15 }), 0, 0.85, -0.1));
      const laneX = i % 2 === 0 ? -1.7 : 1.7;
      mesh.position.set(laneX, 0, -60 + i * 38);
      mesh.rotation.y = i % 2 === 0 ? 0 : Math.PI;
      const tints = [0xffffff, 0x4a7bd6, 0xbfc4cc, 0x3a3a3a, 0x3f9a5a, 0xf2f2f2, 0xd9b44a];
      models.dress(mesh, (Q.lowDetailPeople ? LOW_CARS : CARS)[i % CARS.length], { length: 4.5, tint: Q.lowDetailPeople ? undefined : tints[i % tints.length] });
      this.group.add(mesh);
      this.traffic.push({ mesh, speed: (i % 2 === 0 ? 1 : -1) * (4 + (i % 3)), laneX });
    }
  }

  private buildRain() {
    const count = Q.rain;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    this.rainVel = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 28;
      pos[i * 3 + 1] = Math.random() * 14;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 28;
      this.rainVel[i] = 10 + Math.random() * 8;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xb9c7d6, size: 0.06, transparent: true, opacity: 0.55 })
    );
    this.scene.add(this.rain);
    this.rain.visible = false;
  }

  /** Start (or restart) a campaign level: resets positions and points the mission at the level's district. */
  setLevel(id: number) {
    const here = this.inCar ? this.car.position : this.player.position;
    if (id < 0) id = newCall(here.x, here.z).id;
    const patrol = isPatrol(id);
    const keep = patrol && this.mounted && this.level && isPatrol(this.level.id);
    this.level = levelById(id);
    if (!patrol) progress.current = this.level.id;
    this.missionId = this.level.placeId;
    this.chasing = false;
    this.chaseArrest = false;
    this.msIdx = -1;
    this.msText = 'اقرا المهمة واضغط «ابدأ»';
    this.msHasTarget = false;
    this.endGang();
    this.radioQ = []; this.radioT = 0; this.radioEl?.classList.remove('show');
    if (this.suspect) { this.group.remove(this.suspect); this.suspect = null; }
    this.closeResultSilently();
    const place = STREET_PLACES.find((p) => p.id === this.level.placeId)!;
    const startZ = place.z - 48 < -95 ? place.z + 48 : place.z - 48;
    if (keep) { this.setStatus(this.level.brief); this.briefing(); return; }
    this.car.position.set(-1.4, 0, startZ);
    this.car.rotation.y = startZ < place.z ? 0 : Math.PI;
    this.player.position.set(0.9, 0, startZ);
    if (this.inCar) this.toggleCar();
    this.setStatus(`روح ${place.name} — ${this.level.brief}`);
    this.briefing();
  }

  private closeResultSilently() {
    this.resultEl?.remove();
    this.resultEl = null;
  }

  disengage() {
    this.active = false;
    this.group.visible = false;
    this.root.visible = true;
    this.carRoot.visible = true;
    this.markerRoot.visible = true;
    if (this.rain) this.rain.visible = false;
    delete document.body.dataset.play;
    document.documentElement.classList.remove('onfoot', 'armed');
    audio.engine(false);
    audio.sirenLoop(false);
    this.closeMap();
    this.closeResultSilently();
    this.ui?.remove();
    this.ui = null;
    this.mounted = false;
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('mousedown', this.boundMouse);
    window.removeEventListener('mouseup', this.boundMouseUp);
    this.endGang();
    window.removeEventListener('keyup', this.boundKeyUp);
    this.keys.clear();
  }

  engage() {
    // test hook for headless play-throughs (only with ?autotest)
    if (location.search.includes('autotest')) (window as unknown as { __sp: unknown }).__sp = this;
    this.active = true;
    this.group.visible = true;
    this.root.visible = false;
    this.carRoot.visible = false;
    this.markerRoot.visible = false;
    if (this.rain) this.rain.visible = true;
    document.body.dataset.play = 'street';
    document.documentElement.classList.toggle('onfoot', !this.inCar);
    this.mountUi();
    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('mousedown', this.boundMouse);
    window.addEventListener('mouseup', this.boundMouseUp);
    window.addEventListener('keyup', this.boundKeyUp);
    this.snapCamera(1);
  }

  private mountUi() {
    if (this.mounted) return;
    this.mounted = true;
    const ui = document.createElement('div');
    ui.id = 'street-ui';
    ui.innerHTML = `
      <canvas id="street-mini" width="180" height="180"></canvas>
      <div id="street-status"></div>
      <div id="street-obj"></div>
      <div id="street-tut" role="status" aria-live="polite"></div>
      <div id="street-dir"><i>➤</i></div>
      <div class="street-stick" dir="ltr"><div class="street-knob"></div></div>
      <div class="street-pad" dir="ltr">
        <button type="button" data-k="f">▲</button>
        <div class="street-mid">
          <button type="button" data-k="l">◀</button>
          <button type="button" data-k="r">▶</button>
        </div>
        <button type="button" data-k="b">▼</button>
      </div>
      <div class="street-actions">
        <button type="button" data-act="car">ركب الدورية</button>
        <button type="button" data-act="run">ركض</button>
        <button type="button" data-act="map">خريطة المهام</button>
        <button type="button" data-act="shoot">🔫<br>اضرب</button>
        <button type="button" data-act="order">📢 استسلم!</button>
        <button type="button" data-act="cuff">🔗 كلبش</button>
      </div>
      <div id="street-radio"></div>
      <div id="street-ret"></div>
      <div id="street-hp"></div>
    `;
    document.getElementById('app')!.appendChild(ui);
    this.ui = ui;
    this.mini = ui.querySelector('#street-mini');
    this.statusEl = ui.querySelector('#street-status');
    this.objEl = ui.querySelector('#street-obj');
    this.tutEl = ui.querySelector('#street-tut');
    this.tutEl?.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('[data-tut="skip"]')) this.endTutorial(true); });
    this.dirEl = ui.querySelector('#street-dir');
    this.objHtml = '';
    const press = (k: keyof Hold, on: boolean) => {
      this.hold[k] = on;
    };
    // Multi-touch safe hold buttons: each pointer is captured by its button and released on up/cancel anywhere.
    const holdBtn = (btn: HTMLElement, on: (v: boolean) => void) => {
      const active = new Set<number>();
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        active.add(e.pointerId);
        try { btn.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        btn.classList.add('held');
        on(true);
      });
      const up = (e: PointerEvent) => {
        if (!active.delete(e.pointerId)) return;
        if (!active.size) { btn.classList.remove('held'); on(false); }
      };
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('lostpointercapture', up);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    ui.querySelectorAll<HTMLElement>('[data-k]').forEach((btn) => {
      const k = btn.dataset.k as keyof Hold;
      holdBtn(btn, (v) => press(k, v));
    });
    this.mountStick(ui.querySelector('.street-stick') as HTMLElement);
    holdBtn(ui.querySelector('[data-act="run"]') as HTMLElement, (v) => (this.hold.run = v));
    holdBtn(ui.querySelector('[data-act="shoot"]') as HTMLElement, (v) => (this.firing = v));
    this.hudEl = ui.querySelector('#street-hp');
    this.hudHtml = '';
    this.radioEl = ui.querySelector('#street-radio');
    this.retEl = ui.querySelector('#street-ret');
    this.radioEl!.addEventListener('click', () => { this.radioT = 0; this.showRadio(); });
    ui.querySelector('[data-act="order"]')!.addEventListener('click', () => this.orderSurrender());
    ui.querySelector('[data-act="cuff"]')!.addEventListener('click', () => this.cuffNow());
    // Stop the browser from turning touches on the controls into scroll/zoom/long-press.
    ui.addEventListener('touchstart', (e) => { if ((e.target as HTMLElement).closest('[data-k], [data-act="run"], [data-act="shoot"], .street-stick')) e.preventDefault(); }, { passive: false });
    ui.querySelector('[data-act="car"]')!.addEventListener('click', () => this.toggleCar());
    ui.querySelector('[data-act="map"]')!.addEventListener('click', () => this.openMap());
    this.mini!.addEventListener('click', () => this.openMap());
    this.setStatus('ليل ممطر — امشِ أو اركب الدورية. الخريطة فيها المهام.');
  }

  /** Analog virtual joystick for touch screens; maps to the same hold flags as the D-pad. */
  private mountStick(el: HTMLElement) {
    const knob = el.firstElementChild as HTMLElement;
    let id: number | null = null;
    const R = 50;
    const set = (dx: number, dy: number) => {
      const m = Math.hypot(dx, dy);
      const k = m > R ? R / m : 1;
      dx *= k; dy *= k;
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const nx = dx / R, ny = dy / R;
      this.hold.f = ny < -0.3; this.hold.b = ny > 0.3;
      this.hold.l = nx < -0.35; this.hold.r = nx > 0.35;
      this.hold.run = m * k / R > 0.92 && !this.inCar;
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); if (id !== null) return; id = e.pointerId; try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      const r = el.getBoundingClientRect();
      set(e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      const r = el.getBoundingClientRect();
      set(e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2);
    });
    const end = (e: PointerEvent) => { if (e.pointerId !== id) return; id = null; set(0, 0); this.hold.run = false; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
  }

  private onKey(e: KeyboardEvent, down: boolean) {
    if (!this.active) return;
    this.keys[down ? 'add' : 'delete'](e.code);
    if (down && (e.code === 'KeyE' || e.code === 'Enter')) this.toggleCar();
    if (e.code === 'KeyF' || e.code === 'Space') this.firing = down;
    if (down && e.code === 'KeyQ') this.orderSurrender();
    if (down && e.code === 'KeyC') this.cuffNow();
    if (down && e.code === 'KeyM') {
      if (this.mapEl) this.closeMap();
      else this.openMap();
    }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  }

  private wants() {
    const f = this.hold.f || this.keys.has('KeyW') || this.keys.has('ArrowUp');
    const b = this.hold.b || this.keys.has('KeyS') || this.keys.has('ArrowDown');
    const l = this.hold.l || this.keys.has('KeyA') || this.keys.has('ArrowLeft');
    const r = this.hold.r || this.keys.has('KeyD') || this.keys.has('ArrowRight');
    const run = this.hold.run || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    return { f, b, l, r, run };
  }

  private toggleCar() {
    if (this.chasing && this.inCar) return;
    if (this.inCar) {
      this.inCar = false;
      if (this.driver) this.driver.visible = false;
      audio.sample('door');
      audio.engine(false);
      this.player.visible = true;
      const cy = this.car.rotation.y;
      const ex = this.car.position.x + Math.cos(cy) * 2.2, ez = this.car.position.z - Math.sin(cy) * 2.2;
      if (onRoad(ex, ez, 3.6)) this.player.position.set(ex, 0, ez);
      else this.player.position.set(this.car.position.x, 0, this.car.position.z);
      this.yaw = cy;
      document.documentElement.classList.add('onfoot');
      this.setStatus('نزلت من الدورية.');
      const btn = this.ui?.querySelector('[data-act="car"]');
      if (btn) btn.textContent = 'ركب الدورية';
      return;
    }
    const d = this.player.position.distanceTo(this.car.position);
    if (d > 4.2) {
      this.setStatus('اقترب من سيارة الشرطة ثم اركب.');
      return;
    }
    this.inCar = true;
    document.documentElement.classList.remove('onfoot');
    audio.sample('door');
    this.player.visible = false;
    if (this.driver) this.driver.visible = true;
    this.yaw = this.car.rotation.y;
    this.setStatus('داخل الدورية. امشِ بالأسهم أو الأزرار. صفارة المطاردة لما توصل المهمة.');
    const btn = this.ui?.querySelector('[data-act="car"]');
    if (btn) btn.textContent = 'انزل';
  }

  private statusT = 0;
  private setStatus(text: string) {
    if (!this.statusEl) return;
    this.statusEl.textContent = text;
    this.statusEl.classList.add('show');
    clearTimeout(this.statusT);
    this.statusT = window.setTimeout(() => this.statusEl?.classList.remove('show'), 3500);
  }

  private currentPlace() {
    let best = STREET_PLACES[0];
    let bestD = Infinity;
    const z = this.inCar ? this.car.position.z : this.player.position.z;
    for (const p of STREET_PLACES) {
      const d = Math.abs(p.z - z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  /** Fast travel or drive toward a world point on the avenue. */
  goToWorld(x: number, z: number, fast: boolean) {
    const place = STREET_PLACES.reduce((a, b) => (Math.abs(b.z - z) < Math.abs(a.z - z) ? b : a));
    this.travelTo(place.id, fast);
  }

  travelTo(id: string, fast: boolean) {
    const place = STREET_PLACES.find((p) => p.id === id);
    if (!place || !this.active) return;
    this.closeMap();
    if (fast || !this.inCar) {
      const z = place.z + 2;
      this.car.position.set(-1.4, 0, z);
      this.player.position.set(this.inCar ? -1.4 : 0.9, 0, z);
      this.yaw = 0;
      this.car.rotation.y = 0;
      this.travel = null;
      this.placeId = place.id;
      this.setStatus(`وصلت إلى ${place.name}.`);
      this.maybeStartChase(place);
      return;
    }
    this.travel = { z: place.z, fast: false };
    this.placeId = place.id;
    this.yaw = this.car.position.z < place.z ? 0 : Math.PI;
    this.setStatus(`بتسوق نحو ${place.name}…`);
  }

  private maybeStartChase(_place: StreetPlace) {
    /* legacy trigger: missions are driven by the step runner now */
  }


  private beginChase() {
    this.chasing = true;
    this.chaseTime = 0;
    this.chaseArrest = false;
    this.travel = null;
    if (this.suspect) this.group.remove(this.suspect);
    this.suspect = this.makeSuspectCar();
    this.chaseDir = this.car.position.z < 120 ? 1 : -1;
    const ax = Math.round(this.car.position.x / 60) * 60;
    this.suspect.position.set(ax - 1.6, 0, this.car.position.z + this.chaseDir * 18);
    this.suspect.rotation.y = this.chaseDir > 0 ? 0 : Math.PI;
    const far = farNode(this.suspect.position.x, this.suspect.position.z);
    this.chasePath = findPath(this.suspect.position.x, this.suspect.position.z, far.x, far.z);
    this.group.add(this.suspect);
    audio.sirenLoop(true);
    audio.setTrack('music');
    this.setStatus(this.inCar ? '🚨 مطاردة! الحق العربية السودا.' : '🚨 اركب الدورية بسرعة — العربية هربت!');
  }


  private beginGang() { /* replaced by 'suspects' steps */ }


  private endGang() {
    this.gangOn = false;
    this.firing = false;
    this.squad?.clear();
    document.documentElement.classList.remove('armed', 'can-order', 'can-cuff');
    this.flags = '';
  }


  private finishChase(success: boolean) { this.finishMission(success); }

  private finishMission(success: boolean, reason = '') {
    if (this.msIdx < 0 || this.resultEl) return;
    if (this.tutOn) this.endTutorial(success);
    this.msIdx = -1;
    this.chasing = false;
    this.chaseArrest = false;
    this.firing = false;
    audio.sirenLoop(false);
    if (success) audio.success(); else audio.fail();
    const lv = this.level;
    const place = STREET_PLACES.find((p) => p.id === lv.placeId) || STREET_PLACES[0];
    const before = rank().name;
    const stars = completeLevel(lv.id, success, this.msTime);
    if (success) addStat('missions'); else checkAch();
    const after = rank().name;
    const report: ChaseReport = {
      success,
      placeName: place.name,
      title: isPatrol(lv.id) ? lv.title : `مهمة ${lv.id}: ${lv.title}`,
      durationSec: Math.round(this.msTime),
      money: success ? lv.reward : 0,
      rep: success ? lv.rep : -3,
      summary: success
        ? `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)} في ${Math.round(this.msTime)} ثانية. +${100 + 50 * stars} خبرة.${after !== before ? ` 🎖 ترقية: بقيت ${after}!` : ''}`
        : `${reason || 'المهمة فشلت.'} جرّب تاني.`
    };
    this.lastResult = { success, levelId: lv.id };
    setTimeout(() => this.squad.clear(), 1500);
    if (this.suspect) { this.group.remove(this.suspect); this.suspect = null; }
    this.onReport?.(report);
    if (success && lv.ending) this.radio(lv.ending, null);
    this.showResult(report);
  }


  private showResult(r: ChaseReport) {
    this.closeMap();
    if (this.resultEl) this.resultEl.remove();
    const el = document.createElement('div');
    el.id = 'street-result';
    el.innerHTML = `
      <div class="street-result-card ${r.success ? 'ok' : 'bad'}">
        <div class="mc-tag" style="background:${r.success ? '#7dff9a' : '#ff6b81'}">${r.success ? 'المهمة اكتملت' : 'المهمة فشلت'}</div>
        <h2>${r.title ?? (r.success ? 'نجحت المطاردة' : 'المطاردة فشلت')}</h2>
        <p class="where">${r.placeName}</p>
        <p>${r.summary}</p>
        <p class="nums">${r.money ? `+$${r.money}` : 'بدون مكافأة'} · سمعة ${r.rep > 0 ? '+' : ''}${r.rep}</p>
        <button type="button" data-ok>${r.success ? 'المهمة الجاية ▶' : 'حاول تاني'}</button>
      </div>
    `;
    document.getElementById('app')!.appendChild(el);
    this.resultEl = el;
    el.querySelector('[data-ok]')!.addEventListener('click', () => {
      el.remove();
      this.resultEl = null;
      const r = this.lastResult;
      if (r) this.setLevel(isPatrol(r.levelId) || (r.success && r.levelId >= LEVELS.length) ? -1 : r.success ? r.levelId + 1 : r.levelId);
      this.onResultClosed?.();
    });
  }

  openMap() {
    if (this.mapEl) return;
    const here = this.currentPlace();
    const el = document.createElement('div');
    el.id = 'street-map';
    const pins = STREET_PLACES.map((p) => {
      const top = 78 - ((p.z + 80) / 280) * 70;
      const mission = p.id === this.missionId;
      return `<button type="button" class="pin ${mission ? 'mission' : ''} ${p.id === here.id ? 'here' : ''}" style="top:${top}%" data-id="${p.id}">
        <span class="dot"></span>
        <span class="lab">${p.name}${mission ? ' · مطاردة' : ''}</span>
      </button>`;
    }).join('');
    el.innerHTML = `
      <div class="map-card">
        <header>
          <h2>خريطة المهام</h2>
          <button type="button" data-close>إغلاق</button>
        </header>
        <p class="map-help">اختَر دبوس حي، وبعدين انتقل أو سوق إليه. المطاردة بتبدأ لما توصل وأنت في الدورية.</p>
        <div class="map-board">
          <div class="avenue"></div>
          ${pins}
        </div>
        <div class="map-actions">
          <button type="button" data-go="fast">انتقال سريع</button>
          <button type="button" data-go="drive">سوق إلى المكان</button>
        </div>
      </div>
    `;
    document.getElementById('app')!.appendChild(el);
    this.mapEl = el;
    let picked = this.missionId;
    el.querySelectorAll('.pin').forEach((pin) => {
      pin.addEventListener('click', () => {
        picked = (pin as HTMLElement).dataset.id || picked;
        el.querySelectorAll('.pin').forEach((p) => p.classList.remove('picked'));
        pin.classList.add('picked');
      });
    });
    const missionPin = el.querySelector(`.pin[data-id="${this.missionId}"]`);
    missionPin?.classList.add('picked');
    el.querySelector('[data-close]')!.addEventListener('click', () => this.closeMap());
    el.querySelector('[data-go="fast"]')!.addEventListener('click', () => this.travelTo(picked, true));
    el.querySelector('[data-go="drive"]')!.addEventListener('click', () => {
      if (!this.inCar) {
        this.setStatus('اركب الدورية الأول عشان تسوق، أو استخدم انتقال سريع.');
        this.closeMap();
        return;
      }
      this.travelTo(picked, false);
    });
  }

  private closeMap() {
    this.mapEl?.remove();
    this.mapEl = null;
  }

  private snapCamera(k: number) {
    const target = this.inCar ? this.car : this.player;
    const back = this.inCar ? 8.2 : 5.2;
    const up = this.inCar ? 3.1 : 2.25;
    const yaw = this.inCar ? this.car.rotation.y : this.yaw;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    let b = back;
    // pull the camera in when the spot behind the player is inside a building block
    while (b > 1.6 && !onRoad(target.position.x - sin * b, target.position.z - cos * b, 4.5)) b -= 1.2;
    const dest = this.camDest.set(
      target.position.x - sin * b,
      b < back ? up + 1.6 : up,
      target.position.z - cos * b
    );
    if (!Number.isFinite(this.camPos.x + this.camPos.y + this.camPos.z)) this.camPos.copy(dest);
    this.camPos.lerp(dest, k);
    this.camera.position.copy(this.camPos);
    this.look.set(target.position.x, this.inCar ? 1.1 : 1.3, target.position.z);
    this.camera.lookAt(this.look);
  }

  update(dt: number) {
    if (!this.active) return;
    if (!Number.isFinite(dt) || dt <= 0) return;
    const P = this.player.position, C = this.car.position;
    if (!Number.isFinite(P.x + P.z + C.x + C.z + this.yaw + this.speed)) {
      // never leave the player stranded in an invalid spot (blank screen): snap back to the avenue
      this.speed = 0; this.yaw = 0;
      C.set(-1.4, 0, Number.isFinite(C.z) ? THREE.MathUtils.clamp(C.z, -95, 235) : 0);
      P.set(0.9, 0, C.z);
    }
    const input = this.wants();
    this.stepActor(dt, input);
    this.stepPeds(dt);
    this.stepTraffic(dt);
    this.stepChase(dt);
    this.stepTutorial(dt);
    if (this.firing && !this.inCar && !this.resultEl) this.squad.shoot(this.player.position, this.yaw);
    this.squad.update(dt, this.inCar ? this.car.position : this.player.position, this.inCar);
    this.tickMission(dt);
    this.routeT -= dt;
    if (this.routeT <= 0) {
      this.routeT = 0.5;
      const me = this.inCar ? this.car.position : this.player.position;
      this.route = this.msHasTarget ? findPath(me.x, me.z, this.msTarget.x, this.msTarget.z) : [];
    }
    this.tickRadio(dt);
    this.tickGun(dt);
    this.tickReticle();
    this.tickLights(dt);
    if (this.panicT > 0) this.panicT -= dt;
    this.stepRain(dt);
    this.stepLights();
    if (this.key) {
      const a = this.inCar ? this.car.position : this.player.position;
      this.key.position.set(a.x + 18, 30, a.z - 14);
      this.key.target.position.set(a.x, 0, a.z);
    }
    const sp = Math.abs(this.speed);
    audio.engine(this.inCar, Math.min(1, sp / 18));
    if (this.inCar && sp > 2 && Math.random() < dt * 30) {
      fx.smoke(this.group, this.car.position.x - Math.sin(this.yaw) * 2.1, 0.35, this.car.position.z - Math.cos(this.yaw) * 2.1);
    }
    this.snapCamera(1 - Math.pow(0.0008, dt));
    if (this.recoil > 0 && !reducedMotion) { this.camera.position.y += this.recoil * 0.05; this.camera.rotation.x += this.recoil * 0.012; }
    this.uiT += dt;
    if (this.uiT > 0.12) { this.uiT = 0; this.drawMini(); this.objective(); }
    else this.objectiveWorld();
    const here = this.currentPlace();
    if (here.id !== this.placeId && !this.travel && !this.chasing) {
      this.placeId = here.id;
    }
  }

  private stepActor(dt: number, input: { f: boolean; b: boolean; l: boolean; r: boolean; run: boolean }) {
    if (this.resultEl) return;
    let turn = (input.l ? 1 : 0) - (input.r ? 1 : 0);
    let throttle = (input.f ? 1 : 0) - (input.b ? 1 : 0);

    if (this.travel && this.inCar) {
      const dz = this.travel.z - this.car.position.z;
      this.yaw = dz >= 0 ? 0 : Math.PI;
      if (Math.abs(dz) < 3) {
        const place = STREET_PLACES.find((p) => p.id === this.placeId);
        this.travel = null;
        if (place) {
          this.setStatus(`وصلت إلى ${place.name}.`);
          this.maybeStartChase(place);
        }
      } else {
        throttle = Math.sign(dz);
        turn = 0;
      }
    }

    if (this.inCar) {
      this.yaw += turn * dt * 1.5;
      const max = (this.chasing ? 18 : 12) + rank().car;
      const target = throttle * max;
      this.speed += (target - this.speed) * Math.min(1, dt * 2.2);
      this.car.rotation.y = this.yaw;
      this.car.position.x += Math.sin(this.yaw) * this.speed * dt;
      this.car.position.z += Math.cos(this.yaw) * this.speed * dt;
      this.distAcc += Math.abs(this.speed) * dt;
      if (this.distAcc > 25) { addStat('distance', this.distAcc); this.distAcc = 0; }
      if (!onRoad(this.car.position.x, this.car.position.z, 0.4)) {
        // hit a kerb/building: back out and bleed speed
        this.car.position.x -= Math.sin(this.yaw) * this.speed * dt * 1.5;
        this.car.position.z -= Math.cos(this.yaw) * this.speed * dt * 1.5;
        this.speed *= -0.25;
      }
    } else {
      const moving = throttle !== 0 || turn !== 0;
      if (turn !== 0 && throttle === 0) this.yaw += turn * dt * 2.2;
      if (throttle !== 0) {
        const aim = Math.atan2(turn, throttle);
        this.yaw = approachAngle(this.yaw, aim, dt * 6);
      }
      const spd = (input.run ? 5.2 : 2.6) * (throttle || (turn ? 0.8 : 0));
      const nx = this.player.position.x + Math.sin(this.yaw) * spd * dt;
      const nz = this.player.position.z + Math.cos(this.yaw) * spd * dt;
      if (onRoad(nx, nz, 3.6)) this.player.position.set(nx, this.player.position.y, nz);
      this.player.rotation.y = this.yaw;
      if (spd !== 0) {
        this.stepT -= dt * Math.abs(spd);
        if (this.stepT <= 0) { this.stepT = 1.5; audio.sample(Math.random() < 0.5 ? 'step1' : 'step2', 0.5, 0.9 + Math.random() * 0.2); }
      }
      const legs = (this.player.userData.legs || []) as THREE.Object3D[];
      const swing = moving ? Math.sin(performance.now() / 140) * 0.6 : 0;
      if (legs[0]) legs[0].rotation.x = swing;
      if (legs[1]) legs[1].rotation.x = -swing;
      if (this.missionId) {
        const place = STREET_PLACES.find((p) => p.id === this.missionId);
        if (place && Math.abs(this.player.position.z - place.z) < 8 && !this.chasing && !this.resultEl) {
          this.maybeStartChase(place);
        }
      }
    }
  }

  private stepPeds(dt: number) {
    const me = this.inCar ? this.car.position : this.player.position;
    const n = this.peds.length;
    for (let i = 0; i < n; i++) {
      const p = this.peds[i];
      const m = p.mesh.position;
      let speed = p.speed;
      // flee from gunfire: run along the sidewalk away from the shots
      if (this.panicT > 0 && Math.abs(m.z - this.panicAt.z) < 30 && Math.abs(m.x - this.panicAt.x) < 30) {
        p.dir = m.z >= this.panicAt.z ? 1 : -1;
        speed = 4.2;
      }
      m.z += p.dir * speed * dt;
      if (m.z > p.z1) p.dir = -1;
      if (m.z < p.z0) p.dir = 1;
      // collision avoidance: sidestep other pedestrians and the officer
      let side = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const o = this.peds[j].mesh.position;
        const dz = o.z - m.z, dx = o.x - m.x;
        if (Math.abs(dz) < 1.4 && Math.abs(dx) < 0.8 && Math.sign(dz) === p.dir) side += dx >= 0 ? -1 : 1;
      }
      if (!this.inCar && Math.abs(me.z - m.z) < 1.6 && Math.abs(me.x - m.x) < 1) side += me.x >= m.x ? -1.5 : 1.5;
      const home = m.x > 0 ? 6.5 : -6.5;
      m.x += (side ? side * 1.6 * dt : (home - m.x) * dt * 0.8);
      m.x = m.x > 0 ? THREE.MathUtils.clamp(m.x, 5, 7.9) : THREE.MathUtils.clamp(m.x, -7.9, -5);
      p.mesh.rotation.y = p.dir > 0 ? 0 : Math.PI;
      p.phase += dt * speed * 6;
      const swing = Math.sin(p.phase) * 0.65;
      p.legL.rotation.x = swing;
      p.legR.rotation.x = -swing;
      p.armL.rotation.x = -swing * 0.6;
      p.armR.rotation.x = swing * 0.6;
    }
  }


  private stepTraffic(dt: number) {
    const red = !this.avenueGreen;
    for (const t of this.cross) {
      const x = t.mesh.position.x;
      // cross traffic waits while the avenue is green
      const ahead = t.speed > 0 ? -8 - x : x - 8;
      const stop = this.avenueGreen && ahead > 0 && ahead < 6;
      if (!stop) t.mesh.position.x += t.speed * dt;
      if (t.mesh.position.x > 122) t.mesh.position.x = -122;
      if (t.mesh.position.x < -122) t.mesh.position.x = 122;
    }
    for (const t of this.traffic) {
      const z = t.mesh.position.z;
      let stop = false;
      if (red) for (const l of this.lights) {
        const ahead = t.speed > 0 ? (l.z - 6) - z : z - (l.z + 6);
        if (ahead > 0 && ahead < 7) { stop = true; break; }
      }
      // don't drive through the officer or the patrol car
      const me = this.inCar ? this.car.position : this.player.position;
      const dz = (me.z - z) * Math.sign(t.speed);
      if (Math.abs(me.x - t.mesh.position.x) < 1.8 && dz > 0 && dz < 6) stop = true;
      if (!stop) t.mesh.position.z += t.speed * dt;
      if (t.mesh.position.z > 250) t.mesh.position.z = -110;
      if (t.mesh.position.z < -110) t.mesh.position.z = 250;
    }
  }


  private stepChase(dt: number) {
    if (!this.chasing || !this.suspect) return;
    this.chaseTime += dt;
    const flee = (9.5 + Math.min(4, this.chaseTime * 0.15)) * this.chaseSpeed;
    // suspect AI drives the road graph (A*) toward a far intersection, then picks another
    const sp = this.suspect.position;
    let head = followPath(sp, this.chasePath, flee * dt);
    if (head === null) {
      const far = farNode(sp.x, sp.z);
      this.chasePath = findPath(sp.x, sp.z, far.x, far.z);
      head = followPath(sp, this.chasePath, flee * dt);
    }
    if (head !== null) this.suspect.rotation.y = approachAngle(this.suspect.rotation.y, head, dt * 5);
    const dist = sp.distanceTo(this.car.position);
    if (this.inCar && dist < 3.8) this.caught();
    else if (dist > 140 || this.chaseTime > this.chaseLimit) this.finishMission(false, 'العربية هربت.');
  }

  /** chase won: the car stops, the driver steps out with the scripted behaviour */
  private caught() {
    this.chasing = false;
    audio.sirenLoop(false);
    this.speed = 0;
    const p = this.suspect!.position;
    if (this.chaseThen) {
      const b = this.chaseThen;
      this.squad.spawnOne(b, p.x + 2.2, p.z);
      if (b === 'fight') this.squad.spawnOne('fight', p.x - 2.4, p.z + 1);
      this.chaseArrest = true;
      this.setStatus(b === 'flee' ? 'السواق نزل يجري! انزل والحقه.' : b === 'fight' ? '⚠ نزلوا مسلحين! انزل واتعامل.' : 'العربية وقفت. انزل واقبض على السواق.');
    } else this.nextStep();
  }


  private stepRain(dt: number) {
    if (!this.rain || !this.rainVel) return;
    const anchor = this.inCar ? this.car.position : this.player.position;
    this.rain.position.set(anchor.x, 0, anchor.z);
    const pos = this.rain.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < this.rainVel.length; i++) {
      let y = pos.getY(i) - this.rainVel[i] * dt;
      if (y < 0) y = 12 + Math.random() * 2;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
  }

  private stepLights() {
    const pulse = (Math.sin(performance.now() / 90) + 1) * 0.5;
    this.flash.forEach((L, i) => {
      const on = i % 2 === 0 ? pulse > 0.5 : pulse <= 0.5;
      L.intensity = on ? 4.5 : 0.05;
    });
  }

  private drawMini() {
    const c = this.mini;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const pos = this.inCar ? this.car.position : this.player.position;
    const target = STREET_PLACES.find((p) => p.id === this.level.placeId);
    const dots: { x: number; z: number; c: string; r: number }[] = STREET_PLACES.map((p) => ({ x: 0, z: p.z, c: p.id === this.missionId ? '#ff4d6d' : '#3aa0ff', r: p.id === this.missionId ? 5 : 3 }));
    for (const m of this.squad.list) if (m.state !== 'down' && m.state !== 'cuffed') dots.push({ x: m.g.position.x, z: m.g.position.z, c: m.state === 'hands' ? '#7dff9a' : '#ff3b3b', r: 2.5 });
    if (this.msHasTarget) dots.push({ x: this.msTarget.x, z: this.msTarget.z, c: '#ffd23d', r: 4 });
    if (this.chasing && this.suspect) dots.push({ x: this.suspect.position.x, z: this.suspect.position.z, c: '#ffd23d', r: 4 });

    dots.push({ x: pos.x, z: pos.z, c: '#ffffff', r: 4 });
    const m = drawCityMap(ctx, c.width, c.height, dots);
    if (this.route.length > 1) {
      ctx.strokeStyle = '#ffd23d'; ctx.lineWidth = 2.5; ctx.setLineDash([5, 3]);
      ctx.beginPath(); ctx.moveTo(m.sx(pos.x), m.sz(pos.z));
      for (const w of this.route) ctx.lineTo(m.sx(w.x), m.sz(w.z));
      ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1;
    }
  }

}

function approachAngle(current: number, target: number, maxStep: number) {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return current + THREE.MathUtils.clamp(d, -maxStep, maxStep);
}
