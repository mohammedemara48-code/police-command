import { reducedMotion } from '../config/Motion';
import { stepLoco, followCamYaw, wrapAngle } from '../logic/locomotion';
import {
  stepCar,
  driftOf,
  kmh,
  hitDamage,
  pullOver,
  smoothSteer,
  camRig,
  topSpeed,
  smokeLevel,
  type CamRig
} from '../logic/driving';
import {
  overlap,
  bounce,
  pitSpin,
  spinRate,
  SPIN_T,
  type CarBox,
  type Contact,
  type Motion,
  type PitInput
} from '../logic/crash';
import { fleeSpeed, trimBehind, chaseOutcome, stepLock, WARN_R, GRACE, LOCK_T, START_GAP } from '../logic/chase';
import { newCarAi, stepCarAi, carCmd, ramLanded, type CarSense, type CarCmd } from '../logic/suspectCar';
import { character, onCharacter, setCharacter } from '../entities/Character';
import { STATION, hubAllowed, repairTime } from '../logic/station';
import {
  WEAPON_PRICE,
  GARAGE,
  buyWeapon,
  buyUpgrade,
  equipOwned,
  buyFailAr,
  missionBoardRow,
  engineBonus,
  armoredHit,
  brakeMul,
  sirenRangeBonus,
  type GarageId
} from '../logic/hub';
import { ARMOR_MAX } from '../logic/combat';
import { resolveFoot, avenueBuildingBoxes, type OBB } from '../logic/collide';
import { stepPull, speederSpeed, passCheckpoint, PULL_T, TICKET_R } from '../logic/missions';
import {
  duiWeave,
  stepPullDui,
  duiDriver,
  DUI_TALK_R,
  stepTrap,
  radarKmh,
  TRAP_R,
  TRAP_PARK_V,
  TRAP_WAIT,
  TRAP_LIMIT_KMH
} from '../logic/calls';
import {
  vipSpeed,
  ambushSpot,
  routeLength,
  vipShotDamage,
  vipCrashDamage,
  VIP_HP,
  VIP_LANE,
  VIP_ARRIVE_R,
  ESCORT_NEAR,
  ESCORT_FAR,
  type Pt,
  type Ambush
} from '../logic/escort';
import { openCreator } from '../ui/CharacterCreator';
import { CutscenePlayer, type CutsceneFrames } from '../ui/Cutscene';
import type { Pose } from '../logic/cutscene';
import { storyCutscene } from '../../story/cutscenes';
import { SPEAKERS } from '../../story/speakers';
import { modelFor, recolorFor, WEAPONS, type WeaponId } from '../logic/character';
import {
  buildCity,
  onRoad,
  onFoot,
  nearCross,
  drawCityMap,
  CROSS_Z,
  ROAD_W,
  districtAt,
  findPath,
  farNode,
  followPath,
  nearestNode
} from '../world/City';
import { palm, tree, flushPalms } from '../world/Trees';
import { setPyramidHaze, updatePyramids } from '../world/Pyramids';
import { egyptBlock, gantry, streetNameSign, kerbStripeMat, roofRack, taxiSign, rollWheels, type SignDest } from '../world/Egypt';
import {
  surface,
  worldUV,
  segments,
  Batch,
  PROP_MATS,
  lamp,
  bin,
  bench,
  roadSign,
  buildSea,
  corniche,
  CORNICHE,
  type Sea
} from '../world/Environment';
import { newCall, type Kind } from '../missions/Dispatch';
import { Squad } from '../entities/Npc';
import { addStat, checkAch } from '../systems/Achievements';
import * as THREE from 'three';
import { models, CARS, MEN, WOMEN, fx } from './Models';
import { DISTRICT_STYLES, blockLook, signNames } from '../logic/districts';
import { audio } from '../systems/AudioManager';
import { Q } from '../config/Quality';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { tutorialHint, TUT_KEY, TUT_STEPS, type TutAct } from '../logic/tutorial';
import {
  LEVELS,
  levelById,
  completeLevel,
  progress,
  rank,
  isPatrol,
  RANKS,
  setOwnedWeapons,
  setGarage,
  type LevelDef,
  type Line,
  type Behaviour
} from '../missions/Levels';

export interface StreetPlace {
  id: string;
  name: string;
  z: number;
  blurb: string;
}

export const STREET_PLACES: StreetPlace[] = [
  { id: 'downtown', name: DISTRICT_STYLES.downtown.name, z: 0, blurb: DISTRICT_STYLES.downtown.blurb },
  { id: 'port', name: DISTRICT_STYLES.port.name, z: 100, blurb: DISTRICT_STYLES.port.blurb },
  { id: 'corniche', name: DISTRICT_STYLES.corniche.name, z: 190, blurb: DISTRICT_STYLES.corniche.blurb },
  { id: 'suburb', name: DISTRICT_STYLES.suburb.name, z: -72, blurb: DISTRICT_STYLES.suburb.blurb }
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
  { id: 'm-port-chase', placeId: 'port', kind: 'chase', title: 'مطاردة هاربين', blurb: 'سيارة سودا هاربة من شارع شبرا' },
  { id: 'm-down-rob', placeId: 'downtown', kind: 'robbery', title: 'سطو على محل', blurb: 'مسلحون داخل محل في شارع التحرير' },
  { id: 'm-corn-drug', placeId: 'corniche', kind: 'drugs', title: 'تفتيش مخدرات', blurb: 'صفقة مشبوهة على كورنيش الجيزة' },
  {
    id: 'm-sub-assault',
    placeId: 'suburb',
    kind: 'assault',
    title: 'اعتداء في الشارع',
    blurb: 'مشاجرة وعنف في شارع الهرم'
  },
  { id: 'm-port-traffic', placeId: 'port', kind: 'traffic', title: 'حادث مروري', blurb: 'تصادم وإغلاق طريق في شارع الخلفاوي' },
  { id: 'm-down-chase', placeId: 'downtown', kind: 'chase', title: 'مطاردة وسط البلد', blurb: 'هارب يقطع الإشارات' },
  { id: 'm-corn-rob', placeId: 'corniche', kind: 'robbery', title: 'سرقة في الدقي', blurb: 'سطو على كشك ليلي' },
  { id: 'm-sub-drugs', placeId: 'suburb', kind: 'drugs', title: 'مداهمة بيت', blurb: 'بلاغ مخدرات في الهرم' }
];

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
  waitT?: number;
  mesh: THREE.Group;
  speed: number;
  laneX: number;
  /** pull-over offset toward the kerb (siren) and knock-back after a hit */
  side?: number;
  bumpT?: number;
};

type Hold = { f: boolean; b: boolean; l: boolean; r: boolean; run: boolean };

/**
 * Wet night avenue: third-person walk/drive, mixed pedestrians, mission pins.
 */
let decalMat: THREE.MeshStandardMaterial | null = null;
function policeDecal() {
  if (decalMat) return decalMat;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 68;
  const x = c.getContext('2d')!;
  x.fillStyle = '#1f4fa8';
  x.fillRect(0, 22, 512, 26);
  x.fillStyle = '#ffffff';
  x.font = 'bold 22px Arial';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('POLICE   الشرطة', 256, 36);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  decalMat = new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 });
  return decalMat;
}

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
  /** story intro/outro cutscenes (src/story/cutscenes.ts) */
  private cut!: CutscenePlayer;
  /** intros already shown this session: retries go straight to the mission */
  private introSeen = new Set<number>();
  private outroCleanup: (() => void) | null = null;
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
  /** Mobile: second finger / drag on the 3D canvas aims without using the shoot button. */
  private aimDragId: number | null = null;
  private aimDragging = false;
  /** Armory locker: free vest once per hub visit. */
  private vestTaken = false;
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
  private activeMission: MissionDef | null = null;
  private chasing = false;
  private chaseTime = 0;
  /** chase clock: only runs once you're in the car (or after a short grace on foot) */
  private chaseClock = 0;
  private chaseTurn = 0;
  private chaseLock = 0;
  private chaseText = '';
  private camB = 7;
  private velYaw = 0;
  private siren = false;
  private damage = 0;
  private hitCool = 0;
  /** smoothed steering wheel, -1..1 */
  private steerCur = 0;
  private carMax = 16;
  private offRoadT = 0;
  private stuckT = 0;
  private stuckX = 0;
  private stuckZ = 0;
  private rig: CamRig = { lag: 0.0008, ahead: 0, fov: 0 };
  // scratch objects for car contacts (reused every frame)
  private myBox: CarBox = { x: 0, z: 0, yaw: 0, hw: 0.95, hl: 2.35 };
  private otherBox: CarBox = { x: 0, z: 0, yaw: 0, hw: 0.95, hl: 2.25 };
  private contact: Contact = { nx: 0, nz: 0, depth: 0 };
  private motion: Motion = { speed: 0, velYaw: 0 };
  /** PIT spin-out of the suspect car */
  private spinT = 0;
  private spinDir = 0;
  private pitCool = 0;
  private pitHead = 0;
  private pitIn: PitInput = { px: 0, pz: 0, pVelYaw: 0, pSpeed: 0, sx: 0, sz: 0, sYaw: 0, sSpeed: 0, sHl: 2.35 };
  /** suspect driver: flee / evade / ram / spun / boxed / surrender */
  private carAi = newCarAi();
  private carSense: CarSense = {
    lx: 0,
    lz: 0,
    inCar: false,
    pSpeed: 0,
    lock: 0,
    spun: false,
    caught: false,
    skill: 0
  };
  private carOut: CarCmd = { speedMul: 1, lat: 0, yawOff: 0 };
  private speedoEl: HTMLElement | null = null;
  private speedoTxt = '';
  private camFov = 48;
  private eventGroup = new THREE.Group();
  private travel: { z: number; fast: boolean } | null = null;
  private hold: Hold = { f: false, b: false, l: false, r: false, run: false };
  /** analog joystick (x right, y forward, 0..1) for camera-relative on-foot movement */
  private stick = { x: 0, y: 0 };
  private camYaw = 0;
  private legPhase = 0;
  private vel = { x: 0, z: 0 };
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
    if (
      this.inCar ||
      e.button !== 0 ||
      (e.target as HTMLElement).tagName !== 'CANVAS' ||
      (e.target as HTMLElement).id === 'street-mini'
    )
      return;
    this.aimAtClient(e.clientX, e.clientY, e.target as HTMLElement);
    this.firing = true;
  };
  private boundMouseUp = () => {
    if (!this.hold.run) this.firing = false;
  };

  /** Aim yaw at a screen point over the ground plane (desktop click + mobile drag). */
  private aimAtClient(clientX: number, clientY: number, target: HTMLElement) {
    const r = target.getBoundingClientRect();
    this.aimRay.setFromCamera(
      new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1),
      this.camera
    );
    if (this.aimRay.ray.intersectPlane(this.aimPlane, this.aimPt)) {
      this.yaw = Math.atan2(this.aimPt.x - this.player.position.x, this.aimPt.z - this.player.position.z);
      this.player.rotation.y = this.yaw;
    }
  }

  private isHudChrome(el: EventTarget | null) {
    const h = el as HTMLElement | null;
    if (!h || !h.closest) return false;
    return !!h.closest(
      '#street-ui, #street-hub, #street-result, #street-map, [data-k], [data-act], .street-stick, #street-mini'
    );
  }

  /** Touch / pen drag on the canvas (not HUD) to aim while on foot. */
  private boundAimDown = (e: PointerEvent) => {
    if (this.inCar || this.resultEl || this.hubEl || e.pointerType === 'mouse') return;
    if (this.isHudChrome(e.target)) return;
    const t = e.target as HTMLElement;
    if (t.tagName !== 'CANVAS' || t.id === 'street-mini') return;
    e.preventDefault();
    this.aimDragId = e.pointerId;
    this.aimDragging = true;
    try {
      t.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    this.aimAtClient(e.clientX, e.clientY, t);
  };
  private boundAimMove = (e: PointerEvent) => {
    if (!this.aimDragging || e.pointerId !== this.aimDragId || this.inCar) return;
    const t = e.target as HTMLElement;
    if (t.tagName !== 'CANVAS') return;
    this.aimAtClient(e.clientX, e.clientY, t);
  };
  private boundAimUp = (e: PointerEvent) => {
    if (e.pointerId !== this.aimDragId) return;
    this.aimDragId = null;
    this.aimDragging = false;
  };

  constructor(
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    private root: THREE.Group,
    private carRoot: THREE.Group,
    private markerRoot: THREE.Group
  ) {
    this.cut = new CutscenePlayer(this.camera);
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
    this.activeMission = this.missions[0] || null;
    this.missionId = this.activeMission?.placeId || 'port';
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
    // main avenue: PBR asphalt, paved sidewalks broken at the cross streets, concrete kerbs and painted lines
    const roadMat = surface('asphalt', Q.hdri ? 0x9a9a9a : 0xb8b8b8);
    roadMat.userData.uvSize = 5;
    const road = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.08, 340), roadMat);
    road.position.set(0, 0.04, 60);
    road.receiveShadow = true;
    this.group.add(road);

    const walkMat = surface('paving', 0xd8d2c8);
    walkMat.userData.uvSize = 2;
    const kerbMat = kerbStripeMat();
    for (const side of [-1, 1]) {
      for (const [a, b] of segments(-110, 230, CROSS_Z, ROAD_W / 2)) {
        const sw = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.14, b - a), walkMat);
        sw.position.set(side * 6.4, 0.07, (a + b) / 2);
        this.group.add(sw);
        this.group.add(this.box(0.22, 0.2, b - a, kerbMat, side * 4.62, 0.1, (a + b) / 2));
        this.group.add(this.box(0.12, 0.012, b - a - 2, PROP_MATS.paint, side * 4.15, 0.086, (a + b) / 2));
      }
    }

    for (const [a, b] of segments(-110, 230, CROSS_Z, ROAD_W / 2 + 1))
      for (const x of [-0.13, 0.13]) this.group.add(this.box(0.1, 0.012, b - a, PROP_MATS.paint, x, 0.086, (a + b) / 2));
    for (let z = -90; z < 230; z += 8) {
      if (nearCross(z, 7)) continue;
      for (const x of [-2.3, 2.3]) this.group.add(this.box(0.13, 0.012, 3, PROP_MATS.paint, x, 0.086, z));
    }
    this.buildGantries();


    this.buildStreetRows();
    this.buildStreetNames();
    this.buildingBoxes = avenueBuildingBoxes(STATION);
    for (const place of STREET_PLACES) {
      this.buildBlock(place);
      this.addCrosswalk(place.z + 12);
    }
    const props = new Batch();
    for (let z = -90; z < 230; z += 20) {
      this.addLamp(-5.0, z, props, 1);
      this.addLamp(5.0, z + 10, props, -1);
    }
    for (let z = -80; z < 220; z += 40) this.addProps(z, props);
    for (let z = -100; z < 232; z += 10) {
      if (nearCross(z, 7) || Math.abs(z - STATION.z) < 8) continue;
      for (const side of [-1, 1]) {
        const zz = z + (side > 0 ? 5 : 0);
        const dd = districtAt(zz);
        const slot = Math.floor(zz / 10);
        if (dd === 'corniche') {
          if (slot % 3 === 0) tree(props, side * 5.1, zz);
          else palm(props, side * 5.1, zz + 2.5);
        } else if (dd === 'port') tree(props, side * 5.1, zz); // Shubra Street is the old tree-lined avenue
        else if (dd === 'downtown' ? (slot & 1) === 0 : (slot & 3) === 0) tree(props, side * 5.1, zz);
      }
    }
    props.flush(this.group, Q.shadows);
    this.sea = buildSea(this.group, new THREE.Vector3(-0.4, 0.35, 1));
    for (const h of corniche(this.group)) {
      const halo = new THREE.Object3D() as THREE.PointLight;
      (halo as unknown as { intensity: number }).intensity = 2.5;
      this.halos.push(halo);
      halo.position.copy(h);
      this.group.add(halo);
      fx.glow(halo, 0xffc56a, 1.8);
    }
    flushPalms(this.group);

    this.buildLights();
    this.buildBeacon();
    this.player = this.makeOfficer();
    this.player.position.set(0.9, 0, 0);
    this.group.add(this.player);
    this.car = this.makePoliceCar(true);
    this.car.position.set(-2.6, 0, 11);
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
    this.squad.onGunfire = (x, z) => {
      this.panicAt.set(x, 0, z);
      this.panicT = 6;
    };
    this.squad.onShot = () => {
      this.recoil = 1;
    };
    this.buildGun();
    this.buildTrafficLights();
    this.spawnPeople();
    this.spawnStrollers();
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
      const mat = m.material as THREE.Material;
      const keep = (mat as THREE.MeshStandardMaterial).vertexColors
        ? ['position', 'normal', 'uv', 'color']
        : ['position', 'normal', 'uv'];
      for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k);
      if (!g.index) return null;
      if (!byMat.has(mat)) byMat.set(mat, []);
      byMat.get(mat)!.push(g);
      return true;
    };
    for (const c of [...this.group.children]) {
      const m = c as THREE.Mesh;
      if (m.isMesh && !c.userData.dynamic && !Array.isArray(m.material) && m.geometry.index) {
        if (take(m)) remove.push(c);
      } else if (c.userData.static) {
        c.traverse((o) => {
          const mm = o as THREE.Mesh;
          if (mm.isMesh && mm.geometry.index) take(mm);
        });
        remove.push(c);
      }
    }
    for (const c of remove) c.removeFromParent();
    for (const [mat, geos] of byMat) {
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      if (mat.userData.uvSize) worldUV(merged, mat.userData.uvSize as number);
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
      ['صيدلية', '#2ecc71'],
      ['مخبز', '#f39c12'],
      ['كافيه', '#a0522d'],
      ['سوبر ماركت', '#e74c3c'],
      ['مطعم', '#e67e22'],
      ['ملابس', '#9b59b6'],
      ['موبايلات', '#3498db'],
      ['حلويات', '#ff6fa8'],
      ['بنك', '#16a085'],
      ['مكتبة', '#c0a050']
    ];
    let n = 0;
    for (const side of [-1, 1]) {
      for (let z = -96; z <= 232; z += 9) {
        if (nearCross(z, 8)) continue;
        if (side > 0 && Math.abs(z - STATION.z) < 5) {
          if (!this.stationBuilt) this.buildStation();
          continue;
        }
        const dist = districtAt(z);
        const seed = Math.abs(Math.floor(z * 7 + side * 13));
        const look = blockLook(dist, seed);
        const w = 6 + (seed % 3);
        // Cairo apartment block: plastered in the district's colours or bare red brick with rebar on the roof
        const eb = egyptBlock(w, look.floors * 3, 8.4, side, seed, look);
        eb.position.set(side * (8.4 + w / 2), 0, z);
        this.group.add(eb);
        if (dist !== 'suburb' || seed % 2 === 0) this.addShop(side, z, shops[n++ % shops.length]);
      }
    }
  }

  /** Green street-name boards at the cross streets with the real names of each district. */
  private buildStreetNames() {
    CROSS_Z.forEach((cz, i) => {
      if (Math.abs(cz - STATION.z) < 10) return;
      const [avenue, cross] = signNames(districtAt(cz), i);
      for (const side of [-1, 1]) {
        const sign = streetNameSign(avenue, cross);
        sign.position.set(side * 6.6, 0, cz - side * (ROAD_W / 2 + 1.6));
        this.group.add(sign);
      }
    });
  }

  /** Blue overhead direction signs (Arabic + English, distance to the next places in that direction). */
  private buildGantries() {
    const places: { ar: string; en: string; z: number }[] = [
      { ar: 'الأهرامات', en: 'Pyramids', z: -900 },
      { ar: DISTRICT_STYLES.suburb.name, en: DISTRICT_STYLES.suburb.en, z: -72 },
      { ar: DISTRICT_STYLES.downtown.name, en: DISTRICT_STYLES.downtown.en, z: 0 },
      { ar: 'قسم الشرطة', en: 'Police Station', z: STATION.z },
      { ar: DISTRICT_STYLES.port.name, en: DISTRICT_STYLES.port.en, z: 100 },
      { ar: DISTRICT_STYLES.corniche.name, en: DISTRICT_STYLES.corniche.en, z: 190 }
    ];
    const km = (d: number) => Math.round(d / 10) / 10 + 0.3; // map scale: 100 m on the avenue reads as ~1 km
    const put = (z: number, dir: number) => {
      const ahead = places
        .filter((p) => (p.z - z) * dir > 25)
        .sort((a, b) => Math.abs(a.z - z) - Math.abs(b.z - z));
      if (!ahead.length) return;
      const dests: SignDest[] = ahead.slice(0, 2).map((p) => ({ ar: p.ar, en: p.en, km: km(Math.abs(p.z - z)) }));
      const g = gantry(z, dir, dests);
      g.userData.static = true;
      this.group.add(g);
    };
    for (const z of [-55, 35, 125]) put(z, 1);
    for (const z of [-25, 75, 175]) put(z, -1);
  }

  // ---- traffic stop (siren pull-over)
  private speeder: THREE.Group | null = null;
  private spPath: { x: number; z: number }[] = [];
  private pullM = 0;
  private pullStopped = false;
  private spTurn = 0;
  /** drunk driver: weaves, reacts slowly to the siren and has to be arrested, not ticketed */
  private spDui = false;
  private spT = 0;
  private spW = 0;
  private duiArrest = false;
  /** reused per-frame inputs for the pull-over and radar meters (no allocations in the tick) */
  private pullSense = { siren: false, inCar: false, dist: 0 };
  private trapSense = { inCar: false, speed: 0, dist: 0 };
  private freeSuspect() {
    for (const x of this.squad.list) if (x.state !== 'cuffed' && x.state !== 'down') return x;
    return null;
  }
  private beginPullover(dui = false, gap = 30) {
    this.endPullover();
    const g = this.makeSuspectCar();
    const dir = this.car.position.z < 120 ? 1 : -1;
    const ax = Math.round(this.car.position.x / 60) * 60;
    g.position.set(ax + 1.6 * -dir, 0, this.car.position.z + dir * gap);
    g.rotation.y = dir > 0 ? 0 : Math.PI;
    const far = farNode(g.position.x, g.position.z);
    this.spPath = trimBehind(
      findPath(g.position.x, g.position.z, far.x, far.z),
      g.position.x,
      g.position.z,
      g.rotation.y
    );
    this.group.add(g);
    this.speeder = g;
    this.pullM = 0;
    this.pullStopped = false;
    this.spDui = dui;
    this.spT = 0;
    this.spW = 0;
    this.duiArrest = false;
    this.setStatus(
      dui
        ? '⚠ العربية اللي بتتمايل قدامك. شغّل السارينة 🚨 وخليك وراها — السواق رد فعله بطيء.'
        : '🚗💨 العربية المسرعة قدامك. شغّل السارينة 🚨 وقرّب منها.'
    );
  }
  private endPullover() {
    if (this.speeder) this.group.remove(this.speeder);
    this.speeder = null;
    this.duiArrest = false;
  }
  /** returns true once the stop is finished (ticket written or drunk driver arrested) */
  private tickPullover(dt: number, text: string): boolean {
    const g = this.speeder;
    if (!g) return false;
    const me = this.inCar ? this.car.position : this.player.position;
    const dist = Math.hypot(g.position.x - me.x, g.position.z - me.z);
    this.msTarget.copy(g.position);
    this.msHasTarget = true;
    if (!this.pullStopped) {
      const v = speederSpeed(18 + rank().car + engineBonus(progress.garage ?? { engine: 0, armor: 0, brakes: 0 }), this.spTurn, dist) * (this.inCar ? 1 : 0.3);
      let head = followPath(g.position, this.spPath, v * dt);
      if (head === null) {
        const f = farNode(g.position.x, g.position.z);
        this.spPath = findPath(g.position.x, g.position.z, f.x, f.z);
        head = followPath(g.position, this.spPath, v * dt);
      }
      if (head !== null) {
        this.spTurn = wrapAngle(head - g.rotation.y);
        // a drunk driver's nose wanders with the swerve
        const wob = this.spDui ? Math.cos(this.spT * 2) * 0.12 : 0;
        g.rotation.y = approachAngle(g.rotation.y, head + wob, dt * 5);
      }
      if (this.spDui && v > 0.5) {
        this.spT += dt;
        const w = duiWeave(this.spT);
        const d = w - this.spW;
        this.spW = w;
        g.position.x += Math.cos(g.rotation.y) * d;
        g.position.z -= Math.sin(g.rotation.y) * d;
      }
      if (this.inCar) this.carVsCar(g, Math.sin(g.rotation.y) * v, Math.cos(g.rotation.y) * v, 1, 2.35);
      const sense = this.pullSense;
      sense.siren = this.siren;
      sense.inCar = this.inCar;
      sense.dist = dist;
      this.pullM = this.spDui ? stepPullDui(this.pullM, sense, dt) : stepPull(this.pullM, sense, dt);
      if (this.pullM >= PULL_T) {
        this.pullStopped = true;
        // ease to the kerb (the car's right-hand side)
        g.position.x -= Math.cos(g.rotation.y) * 1.2;
        g.position.z += Math.sin(g.rotation.y) * 1.2;
        audio.sample('confirm', 0.6);
        this.setStatus(
          this.spDui ? 'العربية وقفت. انزل وروح للسواق — خلي بالك.' : 'العربية وقفت على جنب. انزل واكتب المخالفة 📝'
        );
      }
      const pct = Math.round((this.pullM / PULL_T) * 100);
      this.msText = !this.inCar
        ? 'اركب الدورية'
        : !this.siren
          ? '🚨 شغّل السارينة!'
          : pct > 0
            ? `🚨 خليك وراها… ${pct}%`
            : text;
    } else if (this.duiArrest) {
      if (this.inCar) this.carVsCar(g, 0, 0, 1, 2.35);
      const t = this.freeSuspect();
      if (t) this.msTarget.copy(t.g.position);
      this.msText = this.inCar ? 'انزل واقبض على السواق السكران' : 'اقبض على السواق السكران';
      if (this.squad.done()) {
        audio.sample('success', 0.6);
        this.setStatus('🚔 السواق السكران اتقبض عليه قبل ما يأذي حد.');
        if (this.siren) this.toggleSiren(false);
        this.endPullover();
        return true;
      }
    } else {
      if (this.inCar) this.carVsCar(g, 0, 0, 1, 2.35);
      if (this.spDui) {
        this.msText = this.inCar ? 'انزل وروح للسواق' : 'روح للسواق';
        if (!this.inCar && dist < DUI_TALK_R) {
          // the driver stumbles out on the kerb side: gives up, or tries to run off on foot
          const b = duiDriver(RANKS.indexOf(rank()) + 1, Math.random());
          const c = Math.cos(g.rotation.y),
            sn = Math.sin(g.rotation.y);
          this.squad.spawnOne(b, g.position.x - c * 1.9, g.position.z + sn * 1.9);
          this.duiArrest = true;
          this.setStatus(
            b === 'flee'
              ? '⚠ السواق نزل يجري وهو بيترنح! الحقه.'
              : 'السواق سكران ومش قادر يقف. اضغط «استسلم!» وبعدين كلبشه.'
          );
        }
        return false;
      }
      this.msText = this.inCar ? 'انزل واكتب المخالفة' : 'روح للسواق واكتب المخالفة';
      if (!this.inCar && dist < TICKET_R) {
        audio.sample('success', 0.6);
        this.setStatus('📝 المخالفة اتكتبت. شغل نضيف!');
        if (this.siren) this.toggleSiren(false);
        this.endPullover();
        return true;
      }
    }
    return false;
  }

  // ---- patrol checkpoints
  private cpIdx = 0;
  private cpRing: THREE.Mesh | null = null;
  private showCheckpoint(pts: { x: number; z: number }[]) {
    const p = pts[this.cpIdx];
    if (!p) {
      this.clearCheckpoint();
      return;
    }
    this.showRing(p.x, p.z);
  }
  private showRing(x: number, z: number) {
    if (!this.cpRing) {
      this.cpRing = new THREE.Mesh(
        new THREE.TorusGeometry(3.2, 0.25, 8, 40),
        new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.85 })
      );
      this.cpRing.rotation.x = -Math.PI / 2;
      this.group.add(this.cpRing);
    }
    this.cpRing.position.set(x, 0.3, z);
    this.cpRing.visible = true;
  }
  private clearCheckpoint() {
    if (this.cpRing) this.cpRing.visible = false;
  }

  // ---- speed trap: park on the radar spot, then pull over each speeder it clocks
  private trapT = 0;
  private trapCaught = 0;
  private tickTrap(dt: number, st: { x: number; z: number; n: number; text: string }) {
    if (this.speeder) {
      if (!this.tickPullover(dt, '🚨 الحق المسرع ووقّفه')) return;
      this.trapCaught++;
      if (this.trapCaught >= st.n) {
        this.clearCheckpoint();
        this.nextStep();
        return;
      }
      this.showRing(st.x, st.z);
      this.setStatus(`✔ مخالفة ${this.trapCaught}/${st.n}. ارجع لنقطة الرادار.`);
      return;
    }
    const c = this.car.position;
    const d = Math.hypot(st.x - c.x, st.z - c.z);
    const sense = this.trapSense;
    sense.inCar = this.inCar;
    sense.speed = this.speed;
    sense.dist = d;
    this.trapT = stepTrap(this.trapT, sense, dt);
    this.msTarget.set(st.x, 0, st.z);
    this.msHasTarget = true;
    this.msText = !this.inCar
      ? 'اركب الدورية'
      : d >= TRAP_R
        ? `${st.text} (${this.trapCaught}/${st.n})`
        : Math.abs(this.speed) >= TRAP_PARK_V
          ? 'وقّف العربية — الرادار شغال'
          : `📡 الرادار بيقيس… ${Math.max(0, Math.ceil(TRAP_WAIT - this.trapT))}ث`;
    if (this.trapT >= TRAP_WAIT) {
      this.trapT = 0;
      this.clearCheckpoint();
      const kmh = radarKmh(RANKS.indexOf(rank()) + 1, Math.random());
      this.beginPullover(false, 18);
      audio.sample('confirm', 0.7);
      this.setStatus(`📡 الرادار قفش عربية بـ ${kmh} كم/س (الحد ${TRAP_LIMIT_KMH})! الحقها ووقّفها.`);
    }
  }

  // ---- VIP escort: the VIP car follows the road graph to its destination; ambushes spring on the way
  private vip: THREE.Group | null = null;
  /** road-centre track point the car follows (the mesh sits one lane to its right) */
  private vipPt = { x: 0, z: 0 };
  private vipPath: Pt[] = [];
  private vipRoute: Pt[] = [];
  private vipTotal = 1;
  private vipS = 0;
  private vipTurn = 0;
  private vipHp = VIP_HP;
  private vipHitT = 0;
  private vipCrashT = 0;
  private ambIdx = 0;
  private ambLive = false;
  private vipSense = { escort: 0, ambush: false, toGo: 0, turn: 0, blocked: false };
  private static vipTex: THREE.CanvasTexture | null = null;
  private makeVipCar() {
    const g = new THREE.Group();
    g.add(this.box(1.75, 0.45, 4.3, this.mat(0x0b0d10, { metalness: 0.7, roughness: 0.2 }), 0, 0.55, 0));
    // two small Egyptian pennants on the front wings (red / white / black)
    const flagC = document.createElement('canvas');
    flagC.width = 24;
    flagC.height = 18;
    const fc = flagC.getContext('2d')!;
    ['#ce1126', '#ffffff', '#111111'].forEach((c, i) => {
      fc.fillStyle = c;
      fc.fillRect(0, i * 6, 24, 6);
    });
    fc.fillStyle = '#c09300';
    fc.fillRect(10, 7, 4, 4);
    const flagT = new THREE.CanvasTexture(flagC);
    flagT.colorSpace = THREE.SRGBColorSpace;
    const flagM = new THREE.MeshBasicMaterial({ map: flagT, side: THREE.DoubleSide });
    const poleM = this.mat(0xd8d8d8, { metalness: 0.8, roughness: 0.3 });
    for (const sx of [-0.78, 0.78]) {
      const pole = this.box(0.03, 0.42, 0.03, poleM, sx, 1.02, 1.75);
      pole.userData.keep = true;
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.24), flagM);
      flag.position.set(sx, 1.12, 1.58);
      flag.rotation.y = Math.PI / 2;
      flag.userData.keep = true;
      g.add(pole, flag);
    }
    // gold star marker over the roof so the car reads at a glance
    if (!StreetPlay.vipTex) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const x = c.getContext('2d')!;
      x.fillStyle = '#ffc93ccc';
      x.beginPath();
      x.arc(32, 32, 30, 0, Math.PI * 2);
      x.fill();
      x.font = '34px sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText('⭐', 32, 35);
      StreetPlay.vipTex = new THREE.CanvasTexture(c);
    }
    const star = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: StreetPlay.vipTex, depthTest: false, transparent: true })
    );
    star.scale.setScalar(0.95);
    star.position.y = 2.9;
    star.renderOrder = 10;
    star.userData.keep = true;
    g.add(star);
    // graphite black: official-looking but still readable on dark asphalt
    models.dress(g, 'car-sedan2', { length: 4.9, tint: 0x2b3038 });
    return g;
  }
  /** park the VIP car at the pickup (shown while you drive there, so it never pops in next to you) */
  private parkVip(st: { x: number; z: number; tx: number; tz: number }) {
    this.endEscort();
    this.vipPath = findPath(st.x, st.z, st.tx, st.tz);
    this.vipRoute = [{ x: st.x, z: st.z }, ...this.vipPath];
    this.vipTotal = Math.max(1, routeLength(this.vipRoute));
    this.vipPt.x = st.x;
    this.vipPt.z = st.z;
    const g = this.makeVipCar();
    const n = this.vipPath[0] ?? { x: st.tx, z: st.tz };
    g.rotation.y = Math.atan2(n.x - st.x, n.z - st.z);
    this.placeVip(g);
    this.group.add(g);
    this.vip = g;
    this.vipHp = VIP_HP;
  }
  private beginEscort(st: { x: number; z: number; tx: number; tz: number }) {
    if (!this.vip) this.parkVip(st);
    const g = this.vip!;
    this.vipS = 0;
    this.vipTurn = 0;
    this.vipHp = VIP_HP;
    this.vipHitT = 0;
    this.vipCrashT = 0;
    this.ambIdx = 0;
    this.ambLive = false;
    this.squad.ward = g.position;
    this.squad.wardShot = vipShotDamage(RANKS.indexOf(rank()) + 1);
    this.squad.wardDmg = 0;
    audio.sample('confirm', 0.6);
    this.setStatus('⭐ الموكب اتحرك. خليك جنبه — لو بعدت العربية هتقف تستناك.');
  }
  /** VIP car mesh = track point + one lane to the right of its heading */
  private placeVip(g: THREE.Object3D) {
    const h = g.rotation.y;
    g.position.set(this.vipPt.x - Math.cos(h) * VIP_LANE, 0, this.vipPt.z + Math.sin(h) * VIP_LANE);
  }
  private endEscort() {
    if (this.vip) this.group.remove(this.vip);
    this.vip = null;
    this.ambLive = false;
    this.squad.ward = null;
    this.squad.wardDmg = 0;
  }
  private tickEscort(dt: number, st: { tx: number; tz: number; dest: string; ambush: Ambush[]; text: string }) {
    const g = this.vip;
    if (!g) return;
    const me = this.inCar ? this.car.position : this.player.position;
    const escort = Math.hypot(g.position.x - me.x, g.position.z - me.z);
    // ambushes: spring ahead of the car at their route fraction, clear when every attacker is down or cuffed
    if (this.ambLive && this.squad.done()) {
      this.ambLive = false;
      audio.sample('success', 0.5);
      this.setStatus('✔ الكمين اتأمن. كمّل مع الموكب.');
    } else if (!this.ambLive && this.ambIdx < st.ambush.length && this.vipS / this.vipTotal >= st.ambush[this.ambIdx]!.at) {
      const amb = st.ambush[this.ambIdx]!;
      const spot = ambushSpot(this.vipRoute, this.vipS);
      // attackers on both sidewalks of the avenue, staggered, each with a crate between him and the convoy
      const specs = amb.roles.map((b, k) => ({ b, dx: (k % 2 ? 1 : -1) * (6.1 + (k >> 1) * 0.5), dz: (k >> 1) * 3.2 * Math.sign(spot.z - this.vipPt.z || 1) }));
      this.squad.spawn(spot.x, spot.z, specs, { cover: true, approachZ: this.vipPt.z });
      this.ambIdx++;
      this.ambLive = true;
      audio.setTrack('music');
      this.radio(
        [{ who: 'mona', text: `كمين قدام الموكب! ${specs.length} من رجالة العقرب — احمي العربية.` }],
        null
      );
      this.setStatus('💥 كمين! الموكب وقف. حيّد المهاجمين قبل ما يصيبوا العربية.');
    }
    // movement along the road graph
    const sense = this.vipSense;
    sense.escort = escort;
    sense.ambush = this.ambLive;
    sense.toGo = this.vipTotal - this.vipS;
    sense.turn = this.vipTurn;
    // the driver brakes for the patrol car or the officer standing in front of it
    const h0 = g.rotation.y,
      ax = me.x - g.position.x,
      az = me.z - g.position.z,
      ahead = ax * Math.sin(h0) + az * Math.cos(h0);
    sense.blocked = ahead > 0 && ahead < 7.5 && Math.abs(ax * Math.cos(h0) - az * Math.sin(h0)) < 2.4;
    const v = vipSpeed(sense);
    if (v > 0) {
      const ox = this.vipPt.x,
        oz = this.vipPt.z;
      const head = followPath(this.vipPt, this.vipPath, v * dt);
      this.vipS += Math.hypot(this.vipPt.x - ox, this.vipPt.z - oz);
      if (head !== null) {
        this.vipTurn = wrapAngle(head - g.rotation.y);
        g.rotation.y = approachAngle(g.rotation.y, head, dt * 2.6);
      }
      this.placeVip(g);
      rollWheels(g, v * dt);
    }
    if (this.inCar) {
      const closing = this.carVsCar(g, Math.sin(g.rotation.y) * v, Math.cos(g.rotation.y) * v, 1, 2.45);
      this.vipCrashT -= dt;
      const hurt = this.vipCrashT <= 0 ? vipCrashDamage(closing) : 0;
      if (hurt) {
        this.vipCrashT = 1;
        this.vipHp = Math.max(0, this.vipHp - hurt);
        this.setStatus('⚠ خبطت عربية الموكب! خلي بالك.');
      }
    }
    this.vipHitT -= dt;
    if (this.squad.wardDmg > 0) {
      this.vipHp = Math.max(0, this.vipHp - this.squad.wardDmg);
      this.squad.wardDmg = 0;
      if (this.vipHitT <= 0) {
        // throttled so a burst of hits doesn't spam the status line
        this.vipHitT = 2.5;
        this.setStatus(`⚠ عربية الموكب بتضرب! ⭐ ${Math.round(this.vipHp)}%`);
      }
    }
    if (this.vipHp <= 0) {
      this.finishMission(false, 'الشخصية المهمة اتصابت — الموكب وقع.');
      return;
    }
    // objective: the attackers during an ambush, the car when you fall behind, otherwise the destination
    const left = this.squad.remaining();
    if (this.ambLive) {
      const t = this.freeSuspect();
      if (t) this.msTarget.copy(t.g.position);
      this.msText = `💥 كمين! حيّد المهاجمين (${left} باقيين) · ⭐ ${Math.round(this.vipHp)}%`;
    } else if (escort > ESCORT_NEAR) {
      this.msTarget.copy(g.position);
      this.msText =
        escort > ESCORT_FAR
          ? this.inCar
            ? 'ارجع جنب الموكب — العربية واقفة مستنياك'
            : 'اركب الدورية وارجع للموكب'
          : 'قرّب من الموكب';
    } else {
      this.msTarget.set(st.tx, 0, st.tz);
      this.msText = `${st.text} · ⭐ ${Math.round(this.vipHp)}%`;
    }
    this.msHasTarget = true;
    if (!this.ambLive && Math.hypot(st.tx - this.vipPt.x, st.tz - this.vipPt.z) < VIP_ARRIVE_R) {
      audio.sample('success', 0.6);
      this.setStatus(`⭐ الموكب وصل ${st.dest} بالسلامة. شغل محترم!`);
      this.endEscort();
      this.nextStep();
    }
  }

  private boxes: OBB[] = [];
  private buildingBoxes: OBB[] = [];
  /** cars, cover crates and avenue fronts the officer cannot walk through */
  private solidBoxes() {
    const b = this.boxes;
    b.length = 0;
    for (const o of this.buildingBoxes) b.push(o);
    const add = (g: THREE.Object3D | null | undefined, hw = 1.0, hl = 2.3) => {
      if (g && g.visible) b.push({ x: g.position.x, z: g.position.z, yaw: g.rotation.y, hw, hl });
    };
    if (!this.inCar) add(this.car, 1.05, 2.4);
    for (const t of this.traffic) add(t.mesh);
    for (const t of this.cross) add(t.mesh);
    add(this.suspect);
    add(this.speeder);
    this.squad.appendCrateBoxes(b);
    return b;
  }

  private faded = new Set<THREE.Object3D>();
  private fadeT = 0;
  /** make a vehicle see-through while it sits between the camera and the officer */
  private setFade(g: THREE.Object3D, on: boolean) {
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (on) {
        if (!m.userData.solidMat) {
          m.userData.solidMat = m.material;
          const c = (m.material as THREE.Material).clone();
          c.transparent = true;
          c.opacity = 0.15;
          c.depthWrite = false;
          m.userData.fadeMat = c;
        }
        m.material = m.userData.fadeMat as THREE.Material;
      } else if (m.userData.solidMat) m.material = m.userData.solidMat as THREE.Material;
    });
    if (on) this.faded.add(g);
    else this.faded.delete(g);
  }
  private hiddenOcc = new Set<THREE.Object3D>();
  private tickOcclusion(dt: number) {
    this.fadeT -= dt;
    if (this.fadeT > 0) return;
    this.fadeT = 0.1;
    const T = this.inCar ? this.car.position : this.player.position;
    const C = this.camera.position;
    const sx = T.x - C.x,
      sz = T.z - C.z,
      L2 = sx * sx + sz * sz || 1;
    const now = new Set<THREE.Object3D>();
    const hide = new Set<THREE.Object3D>();
    const test = (g: THREE.Object3D | null | undefined) => {
      if (!g || (!g.visible && !this.hiddenOcc.has(g)) || g === (this.inCar ? this.car : null)) return;
      const t = ((g.position.x - C.x) * sx + (g.position.z - C.z) * sz) / L2;
      // a car right at the lens would fill the screen even when faded: hide it outright
      if (Math.hypot(g.position.x - C.x, g.position.z - C.z) < 4.6) {
        hide.add(g);
        return;
      }
      if (t <= 0 || t >= 0.92) return;
      const px = C.x + sx * t - g.position.x,
        pz = C.z + sz * t - g.position.z;
      if (px * px + pz * pz < 2.6 * 2.6) now.add(g);
      // or simply right next to the lens
      else if (Math.hypot(g.position.x - C.x, g.position.z - C.z) < 3.4) now.add(g);
    };
    test(this.car);
    for (const t of this.traffic) test(t.mesh);
    for (const t of this.cross) test(t.mesh);
    test(this.suspect);
    test(this.speeder);
    for (const g of [...this.hiddenOcc])
      if (!hide.has(g)) {
        g.visible = true;
        this.hiddenOcc.delete(g);
      }
    for (const g of hide) {
      g.visible = false;
      this.hiddenOcc.add(g);
    }
    for (const g of [...this.faded]) if (!now.has(g)) this.setFade(g, false);
    for (const g of now) if (!this.faded.has(g)) this.setFade(g, true);
  }

  private stationBuilt = false;
  private canHub = false;
  /** The police station (hub): blue-white facade, lit sign, beacon lights and a glowing door ring. */
  private buildStation() {
    this.stationBuilt = true;
    const g = new THREE.Group();
    g.position.set(STATION.x, 0, STATION.z);
    const w = 8,
      h = 8,
      d = 8.4;
    g.add(this.box(d, h, w, this.mat(0xe8edf3, { roughness: 0.7 }), 0, h / 2, 0));
    g.add(this.box(d + 0.1, 1.1, w + 0.1, this.mat(0x1d4fa3), 0, 2.9, 0));
    g.add(this.box(0.2, 2.6, 2.4, this.mat(0x1b2230, { roughness: 0.3, metalness: 0.4 }), -d / 2 - 0.05, 1.3, 0));
    // lit sign
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const x = c.getContext('2d')!;
    x.fillStyle = '#0d2c66';
    x.fillRect(0, 0, 512, 128);
    x.fillStyle = '#fff';
    x.font = 'bold 54px Cairo, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('قسم الشرطة  POLICE', 256, 66);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 1.5),
      new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.6 })
    );
    sign.position.set(-d / 2 - 0.12, 4.4, 0);
    sign.rotation.y = -Math.PI / 2;
    g.add(sign);
    for (const s of [-1, 1]) {
      const l = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 10, 8),
        new THREE.MeshStandardMaterial({
          color: s > 0 ? 0xff3355 : 0x3377ff,
          emissive: s > 0 ? 0xff3355 : 0x3377ff,
          emissiveIntensity: 2
        })
      );
      l.position.set(-d / 2 - 0.2, 3.1, s * 1.6);
      l.userData.blink = s;
      g.add(l);
      this.stationLights.push(l);
    }
    this.group.add(g);
    // door ring on the sidewalk
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 1.45, 36),
      new THREE.MeshBasicMaterial({ color: 0x5ab0ff, transparent: true, opacity: 0.75, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(STATION.door.x, 0.04, STATION.door.z);
    this.stationRing = ring;
    this.group.add(ring);
  }
  private stationLights: THREE.Mesh[] = [];
  private stationRing: THREE.Mesh | null = null;
  private hubEl: HTMLElement | null = null;

  /** Station hub: missions board, garage, armory, locker room. */
  private openHub(tab: 'main' | 'missions' | 'armory' | 'garage' = 'main') {
    if (!this.hubEl && tab === 'main') this.vestTaken = false;
    if (this.hubEl) this.hubEl.remove();
    const el = document.createElement('div');
    el.id = 'street-hub';
    const c = character();
    const money = progress.money ?? 0;
    const owned = progress.ownedWeapons ?? ['pistol'];
    const garage = progress.garage ?? { engine: 0, armor: 0, brakes: 0 };
    let body: string;
    if (tab === 'missions') {
      const rows = LEVELS.map((l) => {
        const row = missionBoardRow({
          id: l.id,
          title: l.title,
          reward: l.reward,
          unlocked: progress.unlocked,
          stars: progress.stars[l.id] ?? 0
        });
        return `<button type="button" data-lv="${l.id}" class="${row.locked ? 'locked' : ''}" ${row.locked ? 'disabled' : ''}>${row.locked ? '🔒' : '▶'} ${l.id}. ${l.title} <small>${row.starText} · ${row.hint}</small></button>`;
      }).join('');
      body = `<h2>📋 لوحة المهام</h2><p class="hub-sub">💵 $${money.toLocaleString()} · رتبتك: ${rank().name}</p><div class="hub-list">${rows}<button type="button" data-lv="-1">🚨 بلاغ عشوائي (دورية) <small>مكافأة متغيرة</small></button><button type="button" data-call="speeder">🚗💨 مخالفة سرعة <small>سارينة ووقّف العربية</small></button><button type="button" data-call="route">🗺 دورية تفقدية <small>عدّي على نقط التفتيش</small></button><button type="button" data-call="dui">🚘 سواق سكران <small>وقّف العربية اللي بتتمايل واقبض عليه</small></button><button type="button" data-call="trap">📡 كمين رادار <small>اركن واقفش المسرعين</small></button><button type="button" data-call="raid">🏚 مداهمة وكر <small>موجات مسلحين ورا بعض</small></button><button type="button" data-call="vip">⭐ تأمين موكب <small>رافق الشخصية المهمة واحميها من الكمين</small></button></div>`;
    } else if (tab === 'armory') {
      const guns = (Object.keys(WEAPONS) as WeaponId[])
        .map((k) => {
          const have = owned.includes(k);
          const eq = c.weapon === k;
          const price = WEAPON_PRICE[k];
          const label = !have
            ? `اشترِ · $${price.toLocaleString()}`
            : eq
              ? 'مجهّز'
              : 'تجهيز (مجاناً)';
          return `<button type="button" data-wp="${k}" class="${eq ? 'on' : ''}" ${!have && money < price ? 'data-broke="1"' : ''}>${WEAPONS[k].name} <small>${WEAPONS[k].desc} · ${label}</small></button>`;
        })
        .join('');
      body = `<h2>🔫 مخزن السلاح</h2><p class="hub-sub">💵 $${money.toLocaleString()}</p><div class="hub-list">${guns}<button type="button" data-vest="1" ${this.vestTaken ? 'disabled' : ''}>🛡 سترة واقية <small>${this.vestTaken ? 'أخذت في هذه الزيارة' : 'درع كامل — مجاناً مرة كل زيارة'}</small></button><button type="button" data-ammo="1">📦 تعبئة ذخيرة <small>مخزن + احتياطي — مجاناً</small></button></div>`;
    } else if (tab === 'garage') {
      const dmg = this.damage;
      const ups = GARAGE.map((g) => {
        const lv = garage[g.id] ?? 0;
        if (lv >= g.max) {
          return `<button type="button" disabled data-up="${g.id}">${g.name} <small>المستوى ${lv}/${g.max} · ${g.desc}</small></button>`;
        }
        const price = g.costs[lv]!;
        return `<button type="button" data-up="${g.id}" ${money < price ? 'data-broke="1"' : ''}>${g.name} <small>المستوى ${lv}→${lv + 1} · $${price.toLocaleString()} · ${g.desc}</small></button>`;
      }).join('');
      const wait = repairTime(dmg);
      body = `<h2>🔧 الجراج</h2><p class="hub-sub">💵 $${money.toLocaleString()} · الدورية ${100 - dmg}%</p><div class="hub-list"><button type="button" data-repair="1" ${dmg ? '' : 'disabled'}>🩹 تصليح مجاني <small>${dmg ? (wait ? `جاهز خلال ~${wait} ث` : 'تصليح فوري') : 'الدورية سليمة'}</small></button>${ups}</div>`;
    } else {
      body = `<h2>🏢 قسم الشرطة</h2><p class="hub-sub">رتبتك: ${rank().name} · 💵 $${money.toLocaleString()} · الدورية ${100 - this.damage}%</p>
          <div class="hub-grid">
            <button type="button" data-hub="missions">📋<b>لوحة المهام</b><small>اختار مهمتك</small></button>
            <button type="button" data-hub="garage">🔧<b>الجراج</b><small>${this.damage ? 'تصليح وتحسينات' : 'تحسينات الدورية'}</small></button>
            <button type="button" data-hub="armory">🔫<b>مخزن السلاح</b><small>${WEAPONS[c.weapon].name} · ذخيرة كاملة</small></button>
            <button type="button" data-hub="locker">👮<b>غرفة الملابس</b><small>غيّر شكلك</small></button>
          </div>`;
    }
    el.innerHTML = `<div class="street-result-card hub-card">${body}<button type="button" class="hub-close" data-hub="${tab === 'main' ? 'close' : 'main'}">${tab === 'main' ? 'اطلع للشارع' : 'رجوع'}</button></div>`;
    document.getElementById('app')!.appendChild(el);
    this.hubEl = el;
    audio.sample('door', 0.6);
    el.querySelectorAll<HTMLButtonElement>('[data-hub]').forEach((b) =>
      b.addEventListener('click', () => {
        audio.click();
        const a = b.dataset.hub!;
        if (a === 'close') this.closeHub();
        else if (a === 'main' || a === 'missions' || a === 'armory' || a === 'garage') this.openHub(a);
        else if (a === 'locker') {
          el.innerHTML = '';
          openCreator(el, { first: false, done: () => this.openHub('main') });
        }
      })
    );
    el.querySelectorAll<HTMLButtonElement>('[data-wp]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.wp as WeaponId;
        const have = (progress.ownedWeapons ?? ['pistol']).includes(id);
        if (have) {
          const eq = equipOwned(progress.ownedWeapons ?? ['pistol'], id);
          if (!eq) return;
          setCharacter({ ...character(), weapon: eq });
          this.squad.resetPlayer();
          this.squad.restockAmmo();
          audio.sample('confirm', 0.7);
          this.setStatus(`🔫 جهّزت: ${WEAPONS[id].name}`);
          this.openHub('armory');
          return;
        }
        const res = buyWeapon(
          {
            money: progress.money ?? 0,
            ownedWeapons: progress.ownedWeapons ?? ['pistol'],
            garage: progress.garage ?? { engine: 0, armor: 0, brakes: 0 }
          },
          id
        );
        if (!res.ok) {
          this.setStatus(`❌ ${buyFailAr(res.reason, res.need ?? 0)}`);
          audio.click();
          return;
        }
        progress.money = res.money;
        setOwnedWeapons(res.ownedWeapons);
        setCharacter({ ...character(), weapon: res.weapon });
        this.squad.resetPlayer();
        this.squad.restockAmmo();
        audio.sample('confirm', 0.7);
        this.setStatus(`✅ اشتريت ${WEAPONS[id].name} واتجهّز — الذخيرة مليانة.`);
        this.openHub('armory');
      })
    );
    el.querySelectorAll<HTMLButtonElement>('[data-up]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.up as GarageId;
        const res = buyUpgrade(
          {
            money: progress.money ?? 0,
            ownedWeapons: progress.ownedWeapons ?? ['pistol'],
            garage: progress.garage ?? { engine: 0, armor: 0, brakes: 0 }
          },
          id
        );
        if (!res.ok) {
          this.setStatus(`❌ ${buyFailAr(res.reason, res.need ?? 0)}`);
          audio.click();
          return;
        }
        progress.money = res.money;
        setGarage(res.garage);
        audio.sample('confirm', 0.7);
        const def = GARAGE.find((g) => g.id === id)!;
        this.setStatus(`✅ ${def.name} → مستوى ${res.level}`);
        this.openHub('garage');
      })
    );
    el.querySelectorAll<HTMLButtonElement>('[data-repair]').forEach((b) =>
      b.addEventListener('click', () => {
        if (!this.damage) return;
        this.damage = 0;
        this.car.position.set(STATION.parking.x, 0, STATION.parking.z);
        this.car.rotation.y = 0;
        this.speed = 0;
        this.squad.resetPlayer();
        audio.sample('confirm', 0.7);
        this.setStatus('🔧 الدورية اتصلحت ومركونة قدام القسم.');
        this.openHub('garage');
      })
    );
    el.querySelectorAll<HTMLButtonElement>('[data-vest]').forEach((b) =>
      b.addEventListener('click', () => {
        if (this.vestTaken) return;
        this.squad.equipVest();
        this.vestTaken = true;
        audio.sample('confirm', 0.7);
        this.setStatus('🛡 لبست السترة الواقية — الدرع ممتلئ.');
        this.openHub('armory');
      })
    );
    el.querySelectorAll<HTMLButtonElement>('[data-ammo]').forEach((b) =>
      b.addEventListener('click', () => {
        this.squad.restockAmmo();
        audio.sample('confirm', 0.7);
        this.setStatus('📦 الذخيرة اتملت من المخزن.');
        this.openHub('armory');
      })
    );
    el.querySelectorAll<HTMLButtonElement>('[data-call]').forEach((b) =>
      b.addEventListener('click', () => {
        this.closeHub();
        const me = this.player.position;
        this.setLevel(newCall(me.x, me.z, Date.now(), b.dataset.call as Kind).id);
      })
    );
    el.querySelectorAll<HTMLButtonElement>('[data-lv]').forEach((b) =>
      b.addEventListener('click', () => {
        this.closeHub();
        this.setLevel(Number(b.dataset.lv));
      })
    );
  }
    private closeHub() {
    this.hubEl?.remove();
    this.hubEl = null;
  }

  private shopMats = new Map<string, THREE.Material>();
  private goods = new Map<number, THREE.Material>();
  /** lit display goods: slightly emissive so they read as lit from inside at night */
  private goodsMat(c: number) {
    let m = this.goods.get(c);
    if (!m) {
      m = this.mat(c, { roughness: 0.55, metalness: 0.05, emissive: c, emissiveIntensity: 0.28 });
      this.goods.set(c, m);
    }
    return m;
  }
  private _shopGlass: THREE.Material | null = null;
  private shopGlass() {
    return (this._shopGlass ??= new THREE.MeshStandardMaterial({
      color: 0xa9c4d0,
      roughness: 0.04,
      metalness: 0.9,
      transparent: true,
      opacity: 0.16,
      envMapIntensity: 2,
      depthWrite: false
    }));
  }
  private _shopIn: THREE.Material[] = [];
  /** Display window with shelves, mannequins or fruit crates behind real glass, depending on the shop. */
  private addDisplay(g: THREE.Group, name: string) {
    const [back, ceil, frame, shelf] = this._shopIn.length
      ? this._shopIn
      : (this._shopIn = [
          this.mat(0xf3e6cc, { emissive: 0xffe2b0, emissiveIntensity: 0.55, roughness: 0.8 }),
          this.mat(0xffffff, { emissive: 0xfff4dc, emissiveIntensity: 2.2 }),
          this.mat(0x23272d, { metalness: 0.7, roughness: 0.35 }),
          this.mat(0xb08a62, { roughness: 0.6, emissive: 0x402a10, emissiveIntensity: 0.3 })
        ]);
    const D = 0.9; // depth of the display box in front of the facade
    g.add(this.box(5.8, 2.5, 0.05, back, 0, 1.3, 0.02));
    g.add(this.box(5.8, 0.05, D, ceil, 0, 2.5, D / 2));
    g.add(this.box(5.8, 0.4, D, frame, 0, 0.2, D / 2));
    for (const fx0 of [-2.95, 2.95]) g.add(this.box(0.12, 2.6, D + 0.05, frame, fx0, 1.3, D / 2));
    g.add(this.box(0.08, 2.1, 0.06, frame, -0.9, 1.45, D));
    g.add(this.box(6, 0.14, D + 0.1, frame, 0, 2.6, D / 2));
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 2.1), this.shopGlass());
    glass.position.set(0, 1.45, D);
    g.add(glass);
    const rnd = (k: number) => Math.abs(Math.sin(k * 91.7 + name.length * 13.3)) % 1;
    const palette = [0xd84a3a, 0x3a8ad8, 0xf0c040, 0x45b06a, 0xf2f2f2, 0x9b59b6, 0xe67e22];
    if (name === 'ملابس') {
      for (let i = 0; i < 3; i++) {
        const x = -2 + i * 1.7;
        g.add(this.box(0.05, 0.9, 0.05, frame, x, 0.85, 0.45));
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.55, 3, 8), this.goodsMat(palette[i * 2]));
        body.position.set(x, 1.55, 0.45);
        g.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), this.goodsMat(0xe8e2da));
        head.position.set(x, 2.05, 0.45);
        g.add(head);
      }
    } else if (name === 'سوبر ماركت' || name === 'حلويات' || name === 'مخبز') {
      const fruit =
        name === 'سوبر ماركت'
          ? [0xf08a1a, 0xd8262a, 0x8cc63e, 0xf2d33a]
          : name === 'حلويات'
            ? [0xff8fb8, 0xc9873e, 0xfff0d0, 0x7a3a1a]
            : [0xd9a35a, 0xb8793a, 0xf0d9a0, 0xc9873e];
      const ball = new THREE.SphereGeometry(0.09, 6, 4);
      for (let row = 0; row < 2; row++)
        for (let c = 0; c < 4; c++) {
          const x = -2.1 + c * 1.4,
            y = 0.55 + row * 0.75,
            z = 0.35 + row * 0.15;
          g.add(this.box(1.2, 0.22, 0.5, shelf, x, y, z));
          for (let k = 0; k < 10; k++) {
            const m = new THREE.Mesh(ball, this.goodsMat(fruit[(c + row) % fruit.length]));
            m.position.set(
              x - 0.48 + (k % 5) * 0.24,
              y + 0.18 + Math.floor(k / 5) * 0.1,
              z - 0.1 + Math.floor(k / 5) * 0.12
            );
            g.add(m);
          }
        }
    } else {
      for (let row = 0; row < 3; row++) {
        const y = 0.6 + row * 0.6;
        g.add(this.box(5.4, 0.05, 0.4, shelf, 0, y, 0.25));
        for (let k = 0; k < 9; k++) {
          const h = 0.18 + rnd(row * 9 + k) * 0.25;
          g.add(
            this.box(
              0.3,
              h,
              0.24,
              this.goodsMat(palette[(row * 3 + k) % palette.length]),
              -2.4 + k * 0.6,
              y + h / 2 + 0.03,
              0.25
            )
          );
        }
      }
    }
  }
  private addShop(side: number, z: number, [name, rawColor]: [string, string]) {
    // street-level shop colours are sun-faded paint, not plastic
    const hsl = { h: 0, s: 0, l: 0 };
    new THREE.Color(rawColor).getHSL(hsl);
    const color = '#' + new THREE.Color().setHSL(hsl.h, hsl.s * 0.62, hsl.l * 0.86).getHexString();
    const fx0 = side * 8.25;
    const rot = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    const g = new THREE.Group();
    g.position.set(fx0, 0, z);
    g.rotation.y = rot;
    g.userData.static = true;
    this.addDisplay(g, name);
    // awning
    let aw = this.shopMats.get(color);
    if (!aw) {
      aw = this.mat(new THREE.Color(color).getHex(), { roughness: 0.6 });
      this.shopMats.set(color, aw);
    }
    const awning = new THREE.Mesh(new THREE.BoxGeometry(6, 0.12, 1.4), aw);
    awning.position.set(0, 2.85, 1.35);
    awning.rotation.x = 0.25;
    g.add(awning);
    // sign
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const x = c.getContext('2d')!;
    x.fillStyle = color;
    x.fillRect(0, 0, 256, 64);
    x.fillStyle = '#fff';
    x.font = 'bold 40px Cairo, Arial';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.direction = 'rtl';
    x.fillText(name, 128, 34);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(4.2, 1.05),
      new THREE.MeshStandardMaterial({
        map: new THREE.CanvasTexture(c),
        emissive: 0xffffff,
        emissiveMap: null,
        emissiveIntensity: 0.25
      })
    );
    (sign.material as THREE.MeshStandardMaterial).emissiveMap = (sign.material as THREE.MeshStandardMaterial).map;
    sign.position.set(0, 3.6, 0.1);
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
    const board = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.05), new THREE.MeshBasicMaterial({ map: tex }));
    board.position.set(0, 3.15, 0);
    board.rotation.y = Math.PI / 2;
    g.add(board);
    return g;
  }

  private addCrosswalk(z: number) {
    const m = this.mat(0x8f8c84, { roughness: 0.9, emissive: 0x222222, emissiveIntensity: 0.08 });
    for (let i = -3; i <= 3; i++) {
      this.group.add(this.box(0.45, 0.02, 7.6, m, i * 0.7, 0.11, z));
    }
  }

  private addLamp(x: number, z: number, b: Batch, dir: number) {
    const [hp] = lamp(b, x, z, dir);
    const hx = hp.x;
    // No per-lamp PointLight (dozens of them break/slow mobile GPUs): glow halo + warm light pool on the ground.
    const halo = new THREE.Object3D() as THREE.PointLight;
    (halo as unknown as { intensity: number }).intensity = 2.5;
    this.halos.push(halo);
    halo.position.copy(hp);
    this.group.add(halo);
    fx.glow(halo, 0xffc56a, 1.8);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(3.2, 20), this.poolMat());
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(hx, 0.15, z);
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
    this._pool = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(c),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    return this._pool;
  }

  /** Bright evening light rig for street mode (hemisphere + moon/sun key light with shadows that follow the player). */
  private key: THREE.DirectionalLight | null = null;
  private beacon = new THREE.Group();
  private arrow: THREE.Mesh | null = null;
  private buildBeacon() {
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 40, 20, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffd23d,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    beam.position.y = 20;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.4, 2.2, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    this.beacon.add(beam, ring);
    this.group.add(this.beacon);
    // floating chevron above the target (suspect during chase)
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 4), new THREE.MeshBasicMaterial({ color: 0xff3355 }));
    this.arrow.rotation.x = Math.PI;
    this.arrow.userData.dynamic = true;
    this.group.add(this.arrow);
  }

  /** GTA-style objective list + target marker + on-screen direction arrow. */
  private objectiveWorld() {
    if (!this.arrow || !this.arrow.visible) return;
    this.arrow.position.set(
      this.msTarget.x,
      (this.chasing ? 3 : 4.5) + Math.sin(performance.now() / 250) * 0.3,
      this.msTarget.z
    );
    this.arrow.rotation.y += 0.04;
  }

  /** Current objective card (8 Hz): big step text + distance + timer; drives beacon, 3D chevron and edge arrow. */
  private objective() {
    const pos = this.inCar ? this.car.position : this.player.position;
    const has = this.msHasTarget && !this.resultEl;
    const dist = has ? Math.hypot(this.msTarget.x - pos.x, this.msTarget.z - pos.z) : 0;
    if (this.objEl) {
      const timer =
        this.msIdx >= 0
          ? `<span class="timer">⏱ ${Math.max(0, Math.ceil(this.level.limit - this.msTime))}ث</span>`
          : '';
      const html = `<small>${isPatrol(this.level.id) ? '🚨' : `مهمة ${this.level.id}/${LEVELS.length}`} · ${this.level.title} ${timer}</small><div class="now">➤ ${this.msText || '...'}</div>${has ? `<em>${dist >= 1000 ? `${(dist / 1000).toFixed(1)} كم` : `${Math.round(dist)} م`}</em>` : ''}`;
      if (html !== this.objHtml) {
        this.objEl.innerHTML = html;
        this.objHtml = html;
      }
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
    // gunmen get bolder through the story (from the port shootout to the boss) and with rank on patrol
    const id = this.level.id;
    this.squad.skill = isPatrol(id)
      ? RANKS.indexOf(rank()) / (RANKS.length - 1)
      : Math.max(0, Math.min(1, (id - 4) / 8));
    this.damage = 0;
    let seen = false;
    try {
      seen = !!localStorage.getItem(TUT_KEY);
    } catch {
      /* private mode */
    }
    this.tutOn = this.level.id === 1 && !seen;
    this.tutHtml = '';
    this.enterStep();
  }

  private endTutorial(save: boolean) {
    if (save) {
      try {
        localStorage.setItem(TUT_KEY, '1');
      } catch {
        /* ignore */
      }
    }
    this.tutOn = false;
    this.setTutGlow(null);
    if (this.tutEl) {
      this.tutEl.classList.remove('show');
      this.tutEl.innerHTML = '';
    }
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
    const hint = this.resultEl
      ? null
      : tutorialHint({
          step: st ? st.t : 'done',
          inCar: this.inCar,
          radioShowing: !!this.radioEl?.classList.contains('show'),
          targetState: best?.state,
          targetDist: best?.d,
          touch: matchMedia('(pointer:coarse)').matches
        });
    this.setTutGlow(hint?.act ?? null);
    const html = hint
      ? `<b>تعليم ${hint.n}/${TUT_STEPS}</b><span>${hint.text}</span><button type="button" data-tut="skip">تخطي</button>`
      : '';
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
    if (!st) {
      this.finishMission(true);
      return;
    }
    switch (st.t) {
      case 'radio':
        this.msText = 'اسمع اللاسلكي';
        this.radio(st.lines, () => this.nextStep());
        break;
      case 'car':
        this.msText = st.text ?? 'اركب الدورية';
        if (this.inCar) this.nextStep();
        break;
      case 'goto': {
        this.msText = st.text;
        this.msTarget.set(st.x, 0, st.z);
        this.msHasTarget = true;
        const nx = this.level.steps[this.msIdx + 1];
        if (nx?.t === 'escort') this.parkVip(nx);
        break;
      }
      case 'chase':
        this.chaseText = this.msText = st.text ?? 'الحق العربية';
        this.chaseThen = st.then ?? null;
        this.chaseLimit = st.limit;
        this.chaseSpeed = st.speed;
        this.beginChase();
        break;
      case 'pullover':
        this.msText = st.text;
        this.beginPullover(!!st.dui);
        break;
      case 'trap':
        this.msText = st.text;
        this.trapT = 0;
        this.trapCaught = 0;
        this.showRing(st.x, st.z);
        break;
      case 'escort':
        this.msText = st.text;
        this.beginEscort(st);
        break;
      case 'checkpoints':
        this.msText = st.text;
        this.cpIdx = 0;
        this.showCheckpoint(st.pts);
        break;
      case 'suspects': {
        this.msText = st.text;
        const prev = [...this.level.steps]
          .slice(0, this.msIdx)
          .reverse()
          .find((x) => x.t === 'goto');
        const approachZ = prev && prev.t === 'goto' ? prev.z : this.player.position.z;
        this.squad.spawn(st.x, st.z, st.list, { cover: st.cover, hostage: st.hostage, approachZ });
        if (st.list.some((x) => x.b === 'fight')) {
          audio.setTrack('music');
          this.setStatus('⚠ مسلحين! اتحامى واضرب.');
        }
        break;
      }
    }
  }

  /** per-frame mission logic: cheap distance checks only */
  private tickMission(dt: number) {
    if (this.msIdx < 0 || this.resultEl) return;
    const st = this.level.steps[this.msIdx];
    if (!st) return;
    if (!this.hubEl) this.msTime += dt; // the clock stops inside the station
    const pos = this.inCar ? this.car.position : this.player.position;
    switch (st.t) {
      case 'car':
        this.msTarget.copy(this.car.position);
        this.msHasTarget = !this.inCar;
        if (this.inCar) this.nextStep();
        break;
      case 'goto':
        // the parked VIP car is solid while you pull up next to it
        if (this.vip && this.inCar) this.carVsCar(this.vip, 0, 0, 1, 2.45);
        // 2D distance from whatever the player controls (car or on foot): fixes the old "1 m" stall
        if (Math.hypot(st.x - pos.x, st.z - pos.z) < (st.r ?? 9)) {
          this.setStatus('وصلت.');
          this.nextStep();
        }
        break;
      case 'pullover':
        if (this.tickPullover(dt, st.text)) this.nextStep();
        break;
      case 'trap':
        this.tickTrap(dt, st);
        break;
      case 'escort':
        this.tickEscort(dt, st);
        break;
      case 'checkpoints': {
        const n = passCheckpoint(this.cpIdx, st.pts, pos.x, pos.z, this.inCar);
        if (n !== this.cpIdx) {
          this.cpIdx = n;
          audio.sample('confirm', 0.7);
          this.setStatus(`✔ نقطة ${n}/${st.pts.length}`);
          this.showCheckpoint(st.pts);
        }
        if (this.cpIdx >= st.pts.length) {
          this.clearCheckpoint();
          this.nextStep();
          break;
        }
        const p = st.pts[this.cpIdx]!;
        this.msTarget.set(p.x, 0, p.z);
        this.msHasTarget = true;
        this.msText = `${st.text} (${this.cpIdx}/${st.pts.length})`;
        break;
      }
      case 'chase':
        if (this.chaseArrest) {
          const t = this.squad.list.find((x) => x.state !== 'cuffed' && x.state !== 'down');
          if (t) {
            this.msTarget.copy(t.g.position);
            this.msHasTarget = true;
          }
          this.msText = this.inCar ? 'انزل واقبض على السواق' : 'اقبض على السواق';
          if (this.squad.done()) {
            this.chaseArrest = false;
            this.nextStep();
          }
        } else if (this.suspect) {
          this.msTarget.copy(this.suspect.position);
          this.msHasTarget = true;
          const left = Math.max(0, Math.ceil(this.chaseLimit - this.chaseClock));
          const far = this.suspect.position.distanceTo(this.car.position) > WARN_R;
          const lock = Math.round((this.chaseLock / LOCK_T) * 100);
          this.msText = !this.inCar
            ? 'اركب الدورية والحقه!'
            : lock > 0
              ? `🔒 حاصره! ${lock}% · ⏳ ${left}ث`
              : `${this.chaseText} · ⏳ ${left}ث${far ? ' · ⚠ بيبعد!' : ''}`;
        }
        break;
      case 'suspects': {
        const left = this.squad.remaining();
        const t = this.squad.list.find((x) => x.state !== 'cuffed' && x.state !== 'down');
        if (t) {
          this.msTarget.copy(t.g.position);
          this.msHasTarget = true;
        }
        this.msText = `${st.text} (${left} باقيين)`;
        if (this.squad.done() && !this.squad.hostage) this.nextStep();
        else if (this.squad.done() && this.squad.hostage?.state === 'free') this.nextStep();
        break;
      }
      case 'radio':
        break;
    }
    if (this.squad.failed) this.finishMission(false, this.squad.failed);
    else if (!this.tutOn && this.msTime > this.level.limit) this.finishMission(false, 'الوقت خلص.');
  }

  // ---- radio dialogue
  private radio(lines: Line[], done: (() => void) | null) {
    this.radioQ = [...lines];
    this.radioDone = done;
    this.showRadio();
  }
  private showRadio() {
    const l = this.radioQ.shift();
    if (!l) {
      this.radioEl?.classList.remove('show');
      const d = this.radioDone;
      this.radioDone = null;
      d?.();
      return;
    }
    const { name, color: col } = SPEAKERS[l.who] ?? { name: '', color: '#fff' };
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

  /**
   * Slight yaw pull toward the nearest hostile in a narrow cone while firing,
   * only when the player is not manually dragging aim on the canvas.
   */
  private softAimAssist(dt: number) {
    if (this.aimDragging || !this.firing) return;
    const t = this.squad.target(this.player.position, this.yaw, 22, true);
    if (!t) return;
    const dx = t.g.position.x - this.player.position.x;
    const dz = t.g.position.z - this.player.position.z;
    const want = Math.atan2(dx, dz);
    const err = wrapAngle(want - this.yaw);
    // only a small cone — outside it the player is aiming elsewhere on purpose
    if (Math.abs(err) > 0.55) return;
    const k = Math.min(1, dt * 4.5);
    this.yaw = wrapAngle(this.yaw + err * k * 0.55);
    this.player.rotation.y = this.yaw;
  }

  // ---- HUD: weapon, health, threat, rank (8 Hz, string-compared)
  private renderHud() {
    const q = this.squad;
    const stars = Math.round(q.threat);
    const ring = (cls: string, pct: number, icon: string, label: string) => {
      const v = Math.max(0, Math.min(100, Math.round(pct)));
      return `<div class="ring ${cls}${v <= 25 ? ' low' : ''}" role="meter" aria-label="${label}" aria-valuenow="${v}" aria-valuemin="0" aria-valuemax="100"><svg viewBox="0 0 36 36" aria-hidden="true"><circle class="bg" cx="18" cy="18" r="15.5" pathLength="100"/><circle class="fg" cx="18" cy="18" r="15.5" pathLength="100" stroke-dasharray="${v} 100"/></svg><span>${icon}</span></div>`;
    };
    const arPct = (q.armor / ARMOR_MAX) * 100;
    const ammoLabel = q.reloading ? '…' : q.reserve > 0 ? `${q.ammo}/${q.mag}+${q.reserve}` : `${q.ammo}/${q.mag}`;
    const html = `<div class="hud-row">${ring('hp', q.hp, '❤', `الصحة ${Math.round(q.hp)}%`)}${ring('ar', arPct, '🛡', `الدرع ${Math.round(arPct)}%`)}
${this.vip ? ring('vip', this.vipHp, '⭐', `الشخصية المهمة ${Math.round(this.vipHp)}%`) : ''}
      <div class="gun">🔫 <b>${ammoLabel}</b></div></div>
      ${stars ? `<div class="threat">${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}</div>` : ''}`;
    if (this.hudEl && html !== this.hudHtml) {
      this.hudEl.innerHTML = html;
      this.hudHtml = html;
    }
    // contextual buttons
    const me = this.player.position;
    const t = this.inCar ? null : q.target(me, this.yaw, 18);
    const can =
      (t && t.state !== 'hands' && t.state !== 'hostage' ? 'o' : '') + (!this.inCar && q.cuffable(me) ? 'c' : '');
    if (can !== this.flags) {
      this.flags = can;
      document.documentElement.classList.toggle('can-order', can.includes('o'));
      document.documentElement.classList.toggle('can-cuff', can.includes('c'));
    }
    const hub = hubAllowed({
      inCar: this.inCar,
      chasing: this.chasing,
      hostiles: q.list.filter((s) => s.b === 'fight' && s.state !== 'cuffed' && s.state !== 'down').length,
      x: me.x,
      z: me.z
    });
    if (hub !== this.canHub) {
      this.canHub = hub;
      document.documentElement.classList.toggle('can-hub', hub);
    }
    if (this.stationRing) (this.stationRing.material as THREE.MeshBasicMaterial).opacity = hub ? 1 : 0.55;
  }

  /** reticle on the locked target (per frame, one projection) */
  private tickReticle() {
    if (!this.retEl) return;
    const t = this.inCar || this.resultEl ? null : this.squad.target(this.player.position, this.yaw, 24);
    if (!t) {
      if (this.retEl.style.display !== 'none') this.retEl.style.display = 'none';
      return;
    }
    const v = this.tmpV.set(t.g.position.x, 1.25 + t.g.position.y, t.g.position.z).project(this.camera);
    this.retEl.style.display = 'block';
    this.retEl.style.left = `${(v.x * 0.5 + 0.5) * 100}%`;
    this.retEl.style.top = `${(-v.y * 0.5 + 0.5) * 100}%`;
    const cls = t.state === 'hands' ? 'cuff' : t.hidden ? 'cover' : 'hot';
    if (this.retEl.dataset.c !== cls) {
      this.retEl.dataset.c = cls;
      this.retEl.className = cls;
    }
  }

  private orderSurrender() {
    if (this.inCar) return;
    audio.sample('door', 0.01);
    this.setStatus('📢 «شرطة! ارفع إيدك!» — ' + this.squad.order(this.player.position, this.yaw));
  }
  private cuffNow() {
    const s = this.squad.cuffable(this.player.position);
    if (!s) {
      this.setStatus('قرّب من المشتبه به المستسلم.');
      return;
    }
    this.squad.cuff(s);
    this.setStatus('🔗 اتكلبش.');
  }

  // ---- visible pistol in the officer's hand + recoil
  private buildGun() {
    const m = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.4, metalness: 0.6 });
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.055, 0.22), m);
    slide.position.z = 0.06;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.06), m);
    grip.position.set(0, -0.07, -0.02);
    grip.rotation.x = 0.25;
    const len = WEAPONS[character().weapon].len;
    slide.scale.z = len / 0.22;
    slide.position.z = len / 2 - 0.05;
    this.gun.add(slide, grip);
    onCharacter((c) => {
      const l = WEAPONS[c.weapon].len;
      slide.scale.z = l / 0.22;
      slide.position.z = l / 2 - 0.05;
      for (const g of [this.player, this.driver])
        if (g) models.redress(g, modelFor(c), { height: 1.8, recolor: recolorFor(c) });
    });
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
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.16, 4.2, 0.16), pole);
        p.position.y = 2.1;
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.9, 0.35), pole);
        head.position.y = 4.2;
        const la = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), ave);
        la.position.set(0, 4.2, 0.2 * -sx);
        const lc = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), cross);
        lc.position.set(0.24 * sx, 4.2, 0);
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
    for (const l of this.lights) {
      l.mats[0].color.setHex(green ? 0x33ff66 : 0xff3030);
      l.mats[1].color.setHex(green ? 0xff3030 : 0x33ff66);
    }
  }

  private objEl: HTMLElement | null = null;
  private dirEl: HTMLElement | null = null;
  private objHtml = '';

  /** Mission start card; blocks input until "start". */
  private briefing() {
    this.closeResultSilently();
    const steps = this.level.steps
      .filter((x) => x.t !== 'radio')
      .map((x) =>
        x.t === 'car'
          ? 'اركب الدورية'
          : x.t === 'goto'
            ? x.text + ' (اتبع الـGPS الأصفر)'
            : x.t === 'chase'
              ? (x.text ?? 'الحق العربية')
              : x.text
      );
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
    el.querySelector('[data-ok]')!.addEventListener('click', () => {
      audio.click();
      this.closeResultSilently();
      this.playIntro(() => this.startMission());
    });
  }

  private hemi: THREE.HemisphereLight | null = null;
  private amb: THREE.AmbientLight | null = null;
  private sunDir = new THREE.Vector3(0.45, 0.75, -0.35).normalize();
  /** Called by the city scene with the time of day: strong sun and crisp shadows by day, lamps and cool fill at night. */
  setDaylight(day: number, sunPos: THREE.Vector3, sunColor: THREE.Color, haze: THREE.Color) {
    this.sunDir.copy(sunPos).normalize();
    if (this.hemi) {
      this.hemi.intensity = 0.45 + (1 - day) * 0.9;
      this.hemi.groundColor.set(day > 0.5 ? 0x8a7a62 : 0x40464e);
    }
    if (this.amb) this.amb.intensity = 0.12 + (1 - day) * 0.35;
    if (this.key) {
      this.key.color.copy(sunColor);
      this.key.intensity = 0.35 + day * 1.75;
    }
    setPyramidHaze(haze, day);
    // street lamps only glow once the light drops
    const lampOn = THREE.MathUtils.smoothstep(1 - day, 0.25, 0.7);
    for (const h of this.halos) (h as unknown as { intensity: number }).intensity = 2.5 * lampOn;
    this.poolMat().opacity = lampOn;
  }
  private halos: THREE.Object3D[] = [];

  private buildLights() {
    this.hemi = new THREE.HemisphereLight(0xcfe0ff, 0x8a7a62, 0.6);
    this.amb = new THREE.AmbientLight(0xffffff, 0.15);
    this.group.add(this.hemi, this.amb);
    const key = new THREE.DirectionalLight(0xfff2dc, 2.4);
    key.castShadow = Q.shadows;
    key.shadow.mapSize.set(Q.shadowMap, Q.shadowMap);
    const sc = key.shadow.camera;
    sc.left = -25;
    sc.right = 25;
    sc.top = 25;
    sc.bottom = -25;
    sc.near = 1;
    sc.far = 90;
    key.shadow.bias = -0.0004;
    this.group.add(key, key.target);
    this.key = key;
  }

  private addProps(z: number, b: Batch) {
    bin(b, 7.0, z + 4);
    bench(b, 7.2, z - 10, -Math.PI / 2);
    bench(b, -7.2, z + 12, Math.PI / 2);
    roadSign(b, -5.0, z + 16, 0, (z / 40) % 2 === 0);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.55, 8),
      this.mat(0xff7a1a, { emissive: 0xff5500, emissiveIntensity: 0.25 })
    );
    cone.position.set(3.6, 0.28, z - 3);
    this.group.add(cone);
    const hydrant = this.mat(0xc42828, { roughness: 0.45 });
    this.group.add(this.box(0.28, 0.7, 0.28, hydrant, -7.2, 0.4, z + 14));
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
    const c = character();
    models.dress(g, modelFor(c), { height: 1.8, recolor: recolorFor(c) });
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
    // realistic MakeHuman people (CC0); pick a stable variant from the colours passed in
    const pool = female ? WOMEN : MEN;
    const pick = pool[((hair >> 3) + (dress >> 5)) % pool.length]!;
    models.dress(g, pick, { height: female ? 1.68 : 1.8 });
    return { g, legL, legR, armL, armR };
  }

  private sea: Sea | null = null;
  private strollers: Array<{ g: THREE.Object3D; v: number; z: number }> = [];
  /** people walking along the corniche promenade */
  private spawnStrollers() {
    const cols = [0x8d2f45, 0x1f6f6a, 0xe7d7c1, 0x3d4d8a, 0x4a4038, 0x202228];
    for (let i = 0; i < (Q.lowDetailPeople ? 6 : 12); i++) {
      const female = i % 2 === 1;
      const { g } = this.makePerson(female, cols[i % cols.length], 0x1a120e);
      const v = (0.8 + Math.random() * 0.5) * (i % 3 === 0 ? -1 : 1);
      const z = CORNICHE.z0 + 2.5 + (i % 4) * 1.6;
      g.position.set(-110 + Math.random() * 220, 0.14, z);
      g.rotation.y = v > 0 ? Math.PI / 2 : -Math.PI / 2;
      models.setClip(g, 'walk');
      this.group.add(g);
      this.strollers.push({ g, v, z });
    }
  }
  private stepStrollers(dt: number) {
    for (const s of this.strollers) {
      const p = s.g.position;
      p.x += s.v * dt;
      if (p.x > 120 || p.x < -120) {
        s.v = -s.v;
        s.g.rotation.y = s.v > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
    }
  }

  private spawnPeople() {
    const dresses = [0x8d2f45, 0x1f6f6a, 0xe7d7c1, 0x111111, 0x3d4d8a];
    const hairs = [0x1a120e, 0x3a2416, 0x0e0e0e, 0x5a3820];
    const jackets = [0x1c2430, 0x4a4038, 0x202228, 0x16324a];
    let n = 0;
    for (const place of STREET_PLACES) {
      const crowd = Q.lowDetailPeople ? 4 : Math.round(6 * DISTRICT_STYLES[districtAt(place.z)].crowd);
      for (let i = 0; i < crowd; i++) {
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
    for (const [x, z] of [
      [-0.75, 1.25],
      [0.75, 1.25],
      [-0.75, -1.25],
      [0.75, -1.25]
    ] as const) {
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
      red.position.set(-0.22, 1.5, -0.25);
      blue.position.set(0.22, 1.5, -0.25);
      const bar = this.box(0.95, 0.07, 0.24, this.mat(0x1a1a1a, { metalness: 0.5 }), 0, 1.43, -0.25);
      bar.userData.keep = true;
      g.add(bar);
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
    // Egyptian-style patrol car: realistic white sedan, blue band and "POLICE / الشرطة" on the doors, roof light bar
    models.dress(g, 'car-sedan2', { length: 4.7, tint: 0xf6f7f8 });
    for (const side of [-1, 1]) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.34), policeDecal());
      d.position.set(side * 0.915, 0.72, -0.05);
      d.rotation.y = side * (Math.PI / 2);
      d.userData.keep = true;
      g.add(d);
    }
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

  private cross: { mesh: THREE.Group; speed: number; bumpT?: number }[] = [];
  private spawnCrossTraffic() {
    const tints = [0xa52a2a, 0x2a4a8a, 0x8a9098, 0x1b1c1e, 0xb08a3a, 0x2e5a3a];
    CROSS_Z.slice(1, 4).forEach((z, i) => {
      for (let k = 0; k < 2; k++) {
        const mesh = new THREE.Group();
        const dir = k ? 1 : -1;
        mesh.position.set(-100 + i * 70 + k * 40, 0, z + dir * 1.7);
        mesh.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        models.dress(mesh, CARS[(i * 2 + k) % CARS.length]!, {
          length: 4.5,
          tint: tints[(i * 2 + k) % tints.length]
        });
        this.group.add(mesh);
        this.cross.push({ mesh, speed: dir * (5 + i) });
      }
    });
  }

  private spawnTraffic() {
    const colors = [0x2a2e33, 0x4a4038, 0x1a3348, 0x33302c, 0x20242a];
    for (let i = 0; i < 9; i++) {
      const laneX = (i % 2 === 0 ? -1 : 1) * (i % 4 < 2 ? 1.15 : 3.3);
      const special = i % 3 === 1 ? 'microbus' : i % 3 === 2 && i % 2 === 0 ? 'taxi' : null;
      if (special) {
        // white microbus with a roof rack, or a white Cairo taxi with the chequered roof sign
        const g = new THREE.Group();
        g.userData.vehicle = special;
        g.add(this.box(1.7, 1.2, special === 'microbus' ? 5.2 : 4.4, this.mat(0xeeeeee), 0, 0.9, 0));
        const L = special === 'microbus' ? 5.3 : 4.5;
        models.dress(g, special === 'microbus' ? 'car-van' : 'car-sedan2', { length: L, tint: 0xf4f4f0 });
        if (special === 'microbus') {
          const r = roofRack(L * 0.7, 1.55);
          r.position.set(0, 2.17, -0.15);
          g.add(r);
        } else {
          const t = taxiSign();
          t.position.set(0, 1.42, -0.25);
          g.add(t);
        }
        g.position.set(laneX, 0, -60 + i * 30);
        g.rotation.y = i % 2 === 0 ? 0 : Math.PI;
        this.group.add(g);
        this.traffic.push({ mesh: g, speed: (i % 2 === 0 ? 1 : -1) * (4 + (i % 3)), laneX });
        continue;
      }
      const mesh = new THREE.Group();
      const c = this.mat(colors[i % colors.length], { metalness: 0.45, roughness: 0.35 });
      mesh.add(this.box(1.5, 0.4, 3.4, c, 0, 0.48, 0));
      mesh.add(this.box(1.3, 0.32, 1.5, this.mat(0x0e1824, { roughness: 0.15 }), 0, 0.85, -0.1));
      mesh.position.set(laneX, 0, -60 + i * 30);
      mesh.rotation.y = i % 2 === 0 ? 0 : Math.PI;
      const tints = [0x8c1c1c, 0x1f3f7a, 0x9aa0a8, 0x1b1c1e, 0x6b5a45, 0x2e5a3a, 0x5a1e2e];
      models.dress(mesh, CARS[i % CARS.length]!, {
        length: 4.5,
        tint: tints[i % tints.length]
      });
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
    this.stopCutscene();
    this.level = levelById(id);
    if (!patrol) progress.current = this.level.id;
    this.missionId = this.level.placeId;
    this.chasing = false;
    this.chaseArrest = false;
    this.endPullover();
    this.endEscort();
    this.clearCheckpoint();
    this.msIdx = -1;
    this.msText = 'اقرا المهمة واضغط «ابدأ»';
    this.msHasTarget = false;
    this.endGang();
    this.radioQ = [];
    this.radioT = 0;
    this.radioEl?.classList.remove('show');
    if (this.suspect) {
      this.group.remove(this.suspect);
      this.suspect = null;
    }
    this.closeResultSilently();
    const place = STREET_PLACES.find((p) => p.id === this.level.placeId)!;
    const startZ = place.z - 48 < -95 ? place.z + 48 : place.z - 48;
    if (keep) {
      this.setStatus(this.level.brief);
      this.briefing();
      return;
    }
    this.car.position.set(-2.6, 0, startZ + 11);
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
    this.stopCutscene();
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
    window.removeEventListener('pointerdown', this.boundAimDown);
    window.removeEventListener('pointermove', this.boundAimMove);
    window.removeEventListener('pointerup', this.boundAimUp);
    window.removeEventListener('pointercancel', this.boundAimUp);
    this.aimDragging = false;
    this.aimDragId = null;
    this.endGang();
    window.removeEventListener('keyup', this.boundKeyUp);
    this.keys.clear();
  }

  engage() {
    // test hook for automated play-throughs (only with ?autotest)
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
    window.addEventListener('pointerdown', this.boundAimDown, { passive: false });
    window.addEventListener('pointermove', this.boundAimMove);
    window.addEventListener('pointerup', this.boundAimUp);
    window.addEventListener('pointercancel', this.boundAimUp);
    window.addEventListener('keyup', this.boundKeyUp);
    // courtyard ammo crate by the station parking
    this.squad.seedStationAmmo(STATION.parking.x + 2.4, STATION.parking.z - 1.2);
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
      <div id="street-speedo" aria-live="off"></div>
      <div class="street-actions">
        <button type="button" data-act="car" aria-label="ركب الدورية"><i>🚓</i><span>اركب</span></button>
        <button type="button" data-act="run" aria-label="ركض"><i>🏃</i><span>ركض</span></button>
        <button type="button" data-act="map" aria-label="خريطة المهام"><i>🗺</i><span>الخريطة</span></button>
        <button type="button" data-act="siren" class="incar" aria-label="سارينة"><i>🚨</i><span>سارينة</span></button>
        <button type="button" data-act="shoot" aria-label="اضرب"><i>🔫</i><span>اضرب</span></button>
        <button type="button" data-act="order" aria-label="استسلم"><i>📢</i><span>استسلم</span></button>
        <button type="button" data-act="cuff" aria-label="كلبش"><i>🔗</i><span>كلبش</span></button>
        <button type="button" data-act="hub" aria-label="ادخل القسم"><i>🏢</i><span>القسم</span></button>
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
    this.tutEl?.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-tut="skip"]')) this.endTutorial(true);
    });
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
        try {
          btn.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        btn.classList.add('held');
        on(true);
      });
      const up = (e: PointerEvent) => {
        if (!active.delete(e.pointerId)) return;
        if (!active.size) {
          btn.classList.remove('held');
          on(false);
        }
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
    ui.querySelector('[data-act="siren"]')!.addEventListener('click', () => this.toggleSiren());
    this.speedoEl = ui.querySelector('#street-speedo');
    holdBtn(ui.querySelector('[data-act="shoot"]') as HTMLElement, (v) => (this.firing = v));
    this.hudEl = ui.querySelector('#street-hp');
    this.hudHtml = '';
    this.radioEl = ui.querySelector('#street-radio');
    this.retEl = ui.querySelector('#street-ret');
    this.radioEl!.addEventListener('click', () => {
      this.radioT = 0;
      this.showRadio();
    });
    ui.querySelector('[data-act="order"]')!.addEventListener('click', () => this.orderSurrender());
    ui.querySelector('[data-act="cuff"]')!.addEventListener('click', () => this.cuffNow());
    ui.querySelector('[data-act="hub"]')!.addEventListener('click', () => {
      if (this.canHub) this.openHub();
    });
    // Stop the browser from turning touches on the controls into scroll/zoom/long-press.
    ui.addEventListener(
      'touchstart',
      (e) => {
        if ((e.target as HTMLElement).closest('[data-k], [data-act="run"], [data-act="shoot"], .street-stick'))
          e.preventDefault();
      },
      { passive: false }
    );
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
      dx *= k;
      dy *= k;
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const nx = dx / R,
        ny = dy / R;
      this.stick.x = nx;
      this.stick.y = -ny;
      this.hold.f = ny < -0.3;
      this.hold.b = ny > 0.3;
      this.hold.l = nx < -0.35;
      this.hold.r = nx > 0.35;
      this.hold.run = false; // full deflection runs (see stepLoco)
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (id !== null) return;
      id = e.pointerId;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const r = el.getBoundingClientRect();
      set(e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2);
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      const r = el.getBoundingClientRect();
      set(e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      set(0, 0);
      this.hold.run = false;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
  }

  private onKey(e: KeyboardEvent, down: boolean) {
    if (!this.active) return;
    this.keys[down ? 'add' : 'delete'](e.code);
    if (down && this.cut.active) return;
    if (down && (e.code === 'KeyE' || e.code === 'Enter')) this.toggleCar();
    if (e.code === 'KeyF' || e.code === 'Space') this.firing = down;
    if (down && e.code === 'KeyQ') this.orderSurrender();
    if (down && e.code === 'KeyC') this.cuffNow();
    if (down && e.code === 'KeyH' && this.inCar) this.toggleSiren();
    if (down && e.code === 'KeyB' && this.canHub) this.openHub();
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

  private toggleSiren(on = !this.siren) {
    this.siren = on;
    if (!this.chasing) audio.sirenLoop(on);
    document.documentElement.classList.toggle('siren-on', on);
    const b = this.ui?.querySelector('[data-act="siren"]');
    if (b) b.classList.toggle('held', on);
    if (on) this.setStatus('🚨 السارينة شغالة — العربيات بتوسع لك.');
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
      const ex = this.car.position.x + Math.cos(cy) * 2.2,
        ez = this.car.position.z - Math.sin(cy) * 2.2;
      if (onRoad(ex, ez, 3.6)) this.player.position.set(ex, 0, ez);
      else this.player.position.set(this.car.position.x, 0, this.car.position.z);
      this.yaw = cy;
      this.camYaw = cy;
      this.vel.x = 0;
      this.vel.z = 0;
      document.documentElement.classList.add('onfoot');
      if (this.siren) this.toggleSiren(false);
      this.setStatus('نزلت من الدورية.');
      const btn = this.ui?.querySelector('[data-act="car"]');
      if (btn) btn.innerHTML = '<i>🚓</i><span>اركب</span>';
      const rb = this.ui?.querySelector('[data-act="run"]');
      if (rb) rb.innerHTML = '<i>🏃</i><span>ركض</span>';
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
    this.velYaw = this.yaw;
    this.speed = 0;
    this.setStatus('داخل الدورية. امشِ بالأسهم أو الأزرار. صفارة المطاردة لما توصل المهمة.');
    const btn = this.ui?.querySelector('[data-act="car"]');
    if (btn) btn.innerHTML = '<i>🚪</i><span>انزل</span>';
    const rb = this.ui?.querySelector('[data-act="run"]');
    if (rb) rb.innerHTML = '<i>🛞</i><span>فرامل</span>';
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
  goToWorld(_x: number, z: number, fast: boolean) {
    const place = STREET_PLACES.reduce((a, b) => (Math.abs(b.z - z) < Math.abs(a.z - z) ? b : a));
    this.travelTo(place.id, fast);
  }

  travelTo(id: string, fast: boolean) {
    const place = STREET_PLACES.find((p) => p.id === id);
    if (!place || !this.active) return;
    this.closeMap();
    if (fast || !this.inCar) {
      const z = place.z + 2;
      this.car.position.set(-2.6, 0, z + 11);
      this.player.position.set(this.inCar ? -1.4 : 0.9, 0, z);
      this.yaw = 0;
      this.car.rotation.y = 0;
      this.travel = null;
      this.placeId = place.id;
      this.setStatus(`وصلت إلى ${place.name}.`);
      return;
    }
    this.travel = { z: place.z, fast: false };
    this.placeId = place.id;
    this.yaw = this.car.position.z < place.z ? 0 : Math.PI;
    this.setStatus(`بتسوق نحو ${place.name}…`);
  }

  private beginChase() {
    this.chasing = true;
    this.spinT = 0;
    this.pitCool = 0;
    this.chaseTime = 0;
    this.chaseClock = 0;
    this.chaseTurn = 0;
    this.chaseLock = 0;
    this.chaseArrest = false;
    this.carAi = newCarAi();
    this.carSense.caught = false;
    // the first chase barely rams, the gang's getaway driver (mission 10) and late patrol calls do it most
    this.carSense.skill = Math.max(0, Math.min(1, (this.chaseSpeed - 0.85) / 0.45));
    this.travel = null;
    if (this.suspect) this.group.remove(this.suspect);
    this.suspect = this.makeSuspectCar();
    this.chaseDir = this.car.position.z < 120 ? 1 : -1;
    const ax = Math.round(this.car.position.x / 60) * 60;
    this.suspect.position.set(ax - 1.6, 0, this.car.position.z + this.chaseDir * START_GAP);
    this.suspect.rotation.y = this.chaseDir > 0 ? 0 : Math.PI;
    const far = farNode(this.suspect.position.x, this.suspect.position.z);
    this.chasePath = trimBehind(
      findPath(this.suspect.position.x, this.suspect.position.z, far.x, far.z),
      this.suspect.position.x,
      this.suspect.position.z,
      this.suspect.rotation.y
    );
    this.group.add(this.suspect);
    audio.sirenLoop(true);
    audio.setTrack('music');
    this.setStatus(this.inCar ? '🚨 مطاردة! الحق العربية السودا.' : '🚨 اركب الدورية بسرعة — العربية هربت!');
  }

  private endGang() {
    this.firing = false;
    this.squad?.clear();
    document.documentElement.classList.remove('armed', 'can-order', 'can-cuff');
    this.flags = '';
  }

  private finishMission(success: boolean, reason = '') {
    if (this.msIdx < 0 || this.resultEl) return;
    if (this.tutOn) this.endTutorial(success);
    this.msIdx = -1;
    this.chasing = false;
    this.chaseArrest = false;
    this.endPullover();
    this.endEscort();
    this.clearCheckpoint();
    this.firing = false;
    audio.sirenLoop(false);
    if (success) audio.success();
    else audio.fail();
    const lv = this.level;
    const place = STREET_PLACES.find((p) => p.id === lv.placeId) || STREET_PLACES[0];
    const before = rank().name;
    const stars = completeLevel(lv.id, success, this.msTime);
    if (success) addStat('missions');
    else checkAch();
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
    this.onReport?.(report);
    // progress is already saved above; the outro only delays the result card
    const outro = success && !isPatrol(lv.id) ? storyCutscene(lv.id, 'outro') : undefined;
    const cleanup = () => {
      this.outroCleanup = null;
      setTimeout(() => this.squad.clear(), 1500);
      if (this.suspect) {
        this.group.remove(this.suspect);
        this.suspect = null;
      }
    };
    const wrapUp = () => {
      cleanup();
      this.showResult(report);
    };
    if (outro) {
      this.outroCleanup = cleanup;
      this.playCutscene(outro, wrapUp);
    } else wrapUp();
  }

  /** Cut a running cutscene short without its follow-up (but still tidy the scene if it was an outro). */
  private stopCutscene() {
    this.cut.stop();
    this.outroCleanup?.();
  }

  // ===================== story cutscenes =====================
  /** Where the mission happens: the first shootout/arrest spot, else the first GPS destination, else the district. */
  private sceneSpot(): { x: number; z: number } {
    const steps = this.level.steps;
    const sq = steps.find((x) => x.t === 'suspects');
    if (sq && sq.t === 'suspects') return { x: sq.x, z: sq.z };
    const go = steps.find((x) => x.t === 'goto');
    if (go && go.t === 'goto') return { x: go.x, z: go.z };
    const place = STREET_PLACES.find((p) => p.id === this.level.placeId) || STREET_PLACES[0];
    return { x: 0, z: place.z };
  }

  private cutFrames(): CutsceneFrames {
    const spot = this.sceneSpot();
    const hero = this.inCar ? this.car.position : this.player.position;
    return {
      // along the avenue (never diagonal through blocks), facing away from the officer
      scene: { x: spot.x, z: spot.z, yaw: spot.z >= hero.z ? 0 : Math.PI },
      hero: { x: hero.x, z: hero.z, yaw: this.inCar ? this.car.rotation.y : this.yaw },
      car: { x: this.car.position.x, z: this.car.position.z, yaw: this.car.rotation.y }
    };
  }

  /** Low shots must stay over the street: lift the camera above the roofs if a rail ends up inside a block. */
  private cutAdjust = (p: Pose) => {
    if (p.py < 14 && !onRoad(p.px, p.pz, 3.2)) p.py = 14;
  };

  private playCutscene(def: NonNullable<ReturnType<typeof storyCutscene>>, done: () => void) {
    // drop held input so nothing fires or drives the moment control comes back
    this.keys.clear();
    this.hold.f = this.hold.b = this.hold.l = this.hold.r = this.hold.run = false;
    this.stick.x = this.stick.y = 0;
    this.firing = false;
    this.aimDragging = false;
    this.aimDragId = null;
    this.closeMap();
    this.cut.play(
      def,
      this.cutFrames(),
      { title: `مهمة ${this.level.id} · ${this.level.title}`, adjust: this.cutAdjust },
      () => {
        // ease the follow camera back from wherever the last shot ended
        this.camPos.copy(this.camera.position);
        done();
      }
    );
  }

  /** Story intro before the mission clock starts (once per session per mission; patrol calls have none). */
  private playIntro(start: () => void) {
    const id = this.level.id;
    const def = isPatrol(id) || this.introSeen.has(id) ? undefined : storyCutscene(id, 'intro');
    if (!def) {
      start();
      return;
    }
    this.introSeen.add(id);
    if (!this.inCar) {
      // face the officer down the avenue towards the call for the close-up
      const spot = this.sceneSpot();
      this.yaw = this.camYaw = spot.z >= this.player.position.z ? 0 : Math.PI;
      this.player.rotation.y = this.yaw;
    }
    this.playCutscene(def, start);
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
      if (r)
        this.setLevel(
          isPatrol(r.levelId) || (r.success && r.levelId >= LEVELS.length) ? -1 : r.success ? r.levelId + 1 : r.levelId
        );
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
    if (k >= 1 && !this.inCar) this.camYaw = this.yaw;
    const target = this.inCar ? this.car : this.player;
    // phones in portrait have a narrow horizontal view: pull the boom back so the officer isn't screen-filling
    const portrait = this.camera.aspect < 0.8 ? 1.35 : 1;
    const back = (this.inCar ? (this.chasing ? 9.4 : 8.2) : 5.2) * portrait;
    const up = (this.inCar ? (this.chasing ? 3.6 : 3.1) : 2.25) * (portrait > 1 ? 1.15 : 1);
    const yaw = this.inCar ? this.velYaw + wrapAngle(this.car.rotation.y - this.velYaw) * 0.35 : this.camYaw;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    let b = back;
    // pull the camera in when the spot behind the player is inside a building block
    const pad = this.inCar ? 4.5 : 6.5; // on foot the sidewalk is walkable space for the camera too
    // walk the boom outwards and stop at the first wall/building it would pass through (not just the end point)
    const tx = target.position.x,
      tz = target.position.z;
    let clear = 1.2;
    while (clear < back && onRoad(tx - sin * clear, tz - cos * clear, pad)) clear += 0.4;
    b = Math.max(2.4, Math.min(back, clear - 0.6));
    const boxed = b < 3.2 && !onRoad(tx - sin * b, tz - cos * b, pad);
    // ease the boom length (no pops), and rise smoothly as it shortens
    this.camB = k >= 1 ? b : this.camB + (b - this.camB) * Math.min(1, k * 1.5);
    const cb = this.camB;
    let h = up + Math.max(0, (back - cb) / back) * 2.2;
    // wedged with walls all round: go overhead instead of showing the inside of a wall
    if (boxed) h = Math.max(h, up + 6);
    const cx = target.position.x - sin * cb,
      cz = target.position.z - cos * cb;
    // on foot next to the patrol car: lift over it instead of clipping into the body
    if (!this.inCar) {
      const C = this.car.position;
      const dCam = Math.hypot(cx - C.x, cz - C.z);
      if (dCam < 3.2) h = Math.max(h, up + (3.2 - dCam) * 0.7);
    }
    const dest = this.camDest.set(cx, h, cz);
    if (!Number.isFinite(this.camPos.x + this.camPos.y + this.camPos.z)) this.camPos.copy(dest);
    this.camPos.lerp(dest, k);
    this.camera.position.copy(this.camPos);
    const ahead = this.inCar ? this.rig.ahead * (this.speed < 0 ? -0.5 : 1) : 0;
    this.look.set(target.position.x + sin * ahead, this.inCar ? 1.1 : 1.3, target.position.z + cos * ahead);
    this.camera.lookAt(this.look);
  }

  update(dt: number) {
    if (!this.active) return;
    if (!Number.isFinite(dt) || dt <= 0) return;
    const P = this.player.position,
      C = this.car.position;
    if (!Number.isFinite(P.x + P.z + C.x + C.z + this.yaw + this.speed)) {
      // never leave the player stranded in an invalid spot (blank screen): snap back to the avenue
      this.speed = 0;
      this.yaw = 0;
      C.set(-1.4, 0, Number.isFinite(C.z) ? THREE.MathUtils.clamp(C.z, -95, 235) : 0);
      P.set(0.9, 0, C.z);
    }
    const input = this.wants();
    this.stepActor(dt, input);
    this.stepPeds(dt);
    this.stepStrollers(dt);
    this.sea?.update(dt);
    updatePyramids((this.inCar ? this.car.position : this.player.position).z);
    this.stepTraffic(dt);
    this.stepChase(dt);
    this.stepTutorial(dt);
    const locked = this.cut.active;
    if (!this.inCar && !this.resultEl && !this.hubEl && !locked) this.softAimAssist(dt);
    if (this.firing && !this.inCar && !this.resultEl && !locked) this.squad.shoot(this.player.position, this.yaw);
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
    rollWheels(this.car, this.speed * dt);
    if (this.key) {
      const a = this.inCar ? this.car.position : this.player.position;
      this.key.position.set(a.x + this.sunDir.x * 40, Math.max(8, this.sunDir.y * 40), a.z + this.sunDir.z * 40);
      this.key.target.position.set(a.x, 0, a.z);
    }
    const ph = Math.floor(performance.now() / 420) % 2 === 0;
    for (const l of this.stationLights) l.visible = ph === l.userData.blink > 0;
    const sp = Math.abs(this.speed);
    audio.engine(this.inCar, Math.min(1, sp / 18));
    if (this.inCar && sp > 2 && Math.random() < dt * 30) {
      fx.smoke(
        this.group,
        this.car.position.x - Math.sin(this.yaw) * 2.1,
        0.35,
        this.car.position.z - Math.cos(this.yaw) * 2.1
      );
    }
    if (this.speedoEl) {
      const txt = this.inCar
        ? `<b>${kmh(this.speed)}</b><small>كم/س</small><i style="--d:${this.damage}%"></i><span>🚓 ${100 - this.damage}%</span>`
        : '';
      if (txt !== this.speedoTxt) {
        this.speedoEl.innerHTML = txt;
        this.speedoTxt = txt;
      }
    }
    if (locked) {
      this.cut.update(dt);
      this.tickOcclusion(dt);
    } else this.followCamera(dt);
    this.uiT += dt;
    if (this.uiT > 0.12) {
      this.uiT = 0;
      this.drawMini();
      this.objective();
    } else this.objectiveWorld();
    const here = this.currentPlace();
    if (here.id !== this.placeId && !this.travel && !this.chasing) {
      this.placeId = here.id;
    }
  }

  /** Gameplay camera: chase cam trails a touch and widens the view with speed (rigid and fixed with reduced motion). */
  private followCamera(dt: number) {
    const rig = camRig(this.inCar ? this.speed : 0, this.carMax, reducedMotion, this.rig);
    const fovT = 48 + (this.inCar ? rig.fov : 0);
    this.camFov = reducedMotion ? fovT : this.camFov + (fovT - this.camFov) * Math.min(1, dt * 3);
    if (Math.abs(this.camera.fov - this.camFov) > 0.05) {
      this.camera.fov = this.camFov;
      this.camera.updateProjectionMatrix();
    }
    this.snapCamera(this.inCar ? (rig.lag > 0 ? 1 - Math.pow(rig.lag, dt) : 1) : 1 - Math.pow(0.0008, dt));
    this.tickOcclusion(dt);
    if (this.recoil > 0 && !reducedMotion) {
      this.camera.position.y += this.recoil * 0.05;
      this.camera.rotation.x += this.recoil * 0.012;
    }
  }

  private stepActor(dt: number, input: { f: boolean; b: boolean; l: boolean; r: boolean; run: boolean }) {
    if (this.resultEl || this.hubEl || this.cut.active) return;
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
        }
      } else {
        throttle = Math.sign(dz);
        turn = 0;
      }
    }

    if (this.inCar) {
      // arcade handling: analog stick or keys, handbrake (run button / Space) drifts
      const max = (this.chasing ? 20 : 16) + rank().car + engineBonus(progress.garage ?? { engine: 0, armor: 0, brakes: 0 });
      this.carMax = max;
      const thr = this.travel ? throttle : this.stick.y || throttle;
      this.steerCur = this.travel ? 0 : smoothSteer(this.steerCur, -this.stick.x || turn, this.speed, dt);
      const steer = this.steerCur;
      const hb = !this.travel && (this.hold.run || this.keys.has('Space'));
      const cs = stepCar(
        { speed: this.speed, yaw: this.yaw, velYaw: this.velYaw },
        { throttle: thr, steer, handbrake: hb, max, damage: this.damage },
        dt
      );
      if (this.travel) {
        cs.yaw = this.yaw;
        cs.velYaw = this.yaw;
      }
      // sport brakes: scrub a bit more when coasting reverse throttle or handbrake
      const bm = brakeMul(progress.garage ?? { engine: 0, armor: 0, brakes: 0 });
      if (bm > 1 && (hb || thr < -0.05)) {
        const scrub = (bm - 1) * 14 * dt;
        cs.speed -= Math.sign(cs.speed) * Math.min(Math.abs(cs.speed), scrub);
      }
      this.speed = cs.speed;
      this.yaw = cs.yaw;
      this.velYaw = cs.velYaw;
      this.car.rotation.y = this.yaw;
      const drift = driftOf(cs);
      if (drift > 0.3 && Math.abs(this.speed) > 6 && Math.random() < dt * 40) {
        for (const sd of [-0.8, 0.8])
          fx.smoke(
            this.group,
            this.car.position.x - Math.sin(this.yaw) * 1.8 + Math.cos(this.yaw) * sd,
            0.15,
            this.car.position.z - Math.cos(this.yaw) * 1.8 - Math.sin(this.yaw) * sd
          );
      }
      const cmx = Math.sin(this.velYaw) * this.speed * dt,
        cmz = Math.cos(this.velYaw) * this.speed * dt;
      const C0 = this.car.position;
      // slide along kerbs/buildings instead of bouncing and getting stuck
      // check the bumper too, not only the car centre, so the nose can't push into a building
      const dir = Math.sign(this.speed) || 1;
      const nx = C0.x + cmx + Math.sin(this.yaw) * 2.2 * dir,
        nz = C0.z + cmz + Math.cos(this.yaw) * 2.2 * dir;
      if (!onRoad(C0.x + cmx, C0.z + cmz, 0.4) || !onRoad(nx, nz, 2.4)) {
        // kerb/building: lose the speed going into it, keep sliding along it
        if (onRoad(C0.x + cmx, C0.z, 0.4)) {
          C0.x += cmx;
          this.wallHit(0, -Math.sign(cmz));
          this.speed *= 1 - Math.min(0.9, dt * 2.5);
        } else if (onRoad(C0.x, C0.z + cmz, 0.4)) {
          C0.z += cmz;
          this.wallHit(-Math.sign(cmx), 0);
          this.speed *= 1 - Math.min(0.9, dt * 2.5);
        } else {
          if (Math.abs(this.speed) > 6) this.crash(Math.abs(this.speed) * 0.6);
          this.speed *= -0.2;
        }
      } else {
        C0.x += cmx;
        C0.z += cmz;
      }
      this.distAcc += Math.abs(this.speed) * dt;
      if (this.distAcc > 25) {
        addStat('distance', this.distAcc);
        this.distAcc = 0;
      }
      if (!onRoad(this.car.position.x, this.car.position.z, 0.4)) {
        // hit a kerb/building: back out and bleed speed
        this.car.position.x -= Math.sin(this.yaw) * this.speed * dt * 1.5;
        this.car.position.z -= Math.cos(this.yaw) * this.speed * dt * 1.5;
        this.speed *= -0.25;
      }
      // never stay wedged off the road (pushed by traffic into a block): back to the nearest junction
      this.offRoadT = onRoad(this.car.position.x, this.car.position.z, 0.4) ? 0 : this.offRoadT + dt;
      // pressing the gas against a wall without moving for a while also counts as stuck
      const cp = this.car.position;
      if (throttle === 0 || Math.hypot(cp.x - this.stuckX, cp.z - this.stuckZ) > 2.5) {
        this.stuckT = 0;
        this.stuckX = cp.x;
        this.stuckZ = cp.z;
      } else this.stuckT += dt;
      if (this.stuckT > 3) {
        this.offRoadT = 2;
        this.stuckT = 0;
        this.setStatus('العربية اتزنقت، رجعناها للشارع.');
      }
      if (this.offRoadT > 1.5) {
        const n = nearestNode(this.car.position.x, this.car.position.z);
        this.car.position.set(n.x, 0, n.z);
        this.speed = 0;
        this.offRoadT = 0;
      }
      // badly damaged: smoke from under the bonnet
      const sm = smokeLevel(this.damage);
      if (sm > 0 && Math.random() < dt * (3 + 12 * sm))
        fx.smoke(this.group, C0.x + Math.sin(this.yaw) * 1.7, 0.95, C0.z + Math.cos(this.yaw) * 1.7);
    } else {
      // camera-relative third-person movement with acceleration, turning and wall sliding
      let ix = this.stick.x,
        iy = this.stick.y;
      if (!ix && !iy) {
        ix = -turn;
        iy = throttle;
      }
      const lo = stepLoco({ vx: this.vel.x, vz: this.vel.z, yaw: this.yaw }, ix, iy, this.camYaw, input.run, dt);
      this.vel.x = lo.vx;
      this.vel.z = lo.vz;
      if (!this.firing) this.yaw = lo.yaw;
      const P = this.player.position;
      const mx = lo.vx * dt,
        mz = lo.vz * dt;
      if (onFoot(P.x + mx, P.z + mz)) {
        P.x += mx;
        P.z += mz;
      } else if (onFoot(P.x + mx, P.z)) {
        P.x += mx;
        this.vel.z *= 0.5;
      } else if (onFoot(P.x, P.z + mz)) {
        P.z += mz;
        this.vel.x *= 0.5;
      } else {
        this.vel.x = 0;
        this.vel.z = 0;
      }
      // solid cars, crates and building fronts: push out and slide along the body
      const hit = resolveFoot(P.x, P.z, 0.42, this.solidBoxes(), onFoot);
      if (hit.hit) {
        const nx = hit.x - P.x,
          nz = hit.z - P.z,
          nl = Math.hypot(nx, nz) || 1;
        const vn = (this.vel.x * nx + this.vel.z * nz) / nl;
        if (vn < 0) {
          this.vel.x -= (vn * nx) / nl;
          this.vel.z -= (vn * nz) / nl;
        }
        P.x = hit.x;
        P.z = hit.z;
      }
      this.player.rotation.y = this.yaw;
      const spd = Math.hypot(this.vel.x, this.vel.z);
      this.camYaw = followCamYaw(this.camYaw, this.yaw, spd, dt);
      if (spd > 0.3) {
        this.stepT -= dt * spd;
        if (this.stepT <= 0) {
          this.stepT = 1.5;
          audio.sample(Math.random() < 0.5 ? 'step1' : 'step2', 0.5, 0.9 + Math.random() * 0.2);
        }
      }
      // fallback primitive legs (before the rigged model loads): swing in step with speed
      const legs = (this.player.userData.legs || []) as THREE.Object3D[];
      this.legPhase += dt * spd * 3.2;
      const swing = spd > 0.3 ? Math.sin(this.legPhase) * Math.min(0.7, spd * 0.18) : 0;
      if (legs[0]) legs[0].rotation.x = swing;
      if (legs[1]) legs[1].rotation.x = -swing;
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
        const dz = o.z - m.z,
          dx = o.x - m.x;
        if (Math.abs(dz) < 1.4 && Math.abs(dx) < 0.8 && Math.sign(dz) === p.dir) side += dx >= 0 ? -1 : 1;
      }
      if (!this.inCar && Math.abs(me.z - m.z) < 1.6 && Math.abs(me.x - m.x) < 1) side += me.x >= m.x ? -1.5 : 1.5;
      const home = m.x > 0 ? 6.5 : -6.5;
      m.x += side ? side * 1.6 * dt : (home - m.x) * dt * 0.8;
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
    if (this.hitCool > 0) this.hitCool -= dt;
    const red = !this.avenueGreen;
    const C = this.car.position;
    const loud = this.inCar && (this.siren || this.chasing);
    for (const t of this.cross) {
      const x = t.mesh.position.x;
      // cross traffic waits while the avenue is green
      const ahead = t.speed > 0 ? -8 - x : x - 8;
      let stop = this.avenueGreen && ahead > 0 && ahead < 6;
      // siren close by: give way
      if (loud && Math.abs(C.x - x) < 20 && Math.abs(C.z - t.mesh.position.z) < 20) stop = true;
      if (this.inCar) {
        const share = 0.6;
        const closing = this.carVsCar(t.mesh, stop ? 0 : t.speed, 0, share);
        if (closing >= 0) {
          t.mesh.position.x -= this.contact.nx * this.contact.depth * (1 - share);
          if (closing > 1) t.bumpT = 1.5;
        }
      }
      if (t.bumpT && t.bumpT > 0) {
        t.bumpT -= dt;
        stop = true;
      }
      if (!stop) {
        t.mesh.position.x += t.speed * dt;
        rollWheels(t.mesh, Math.abs(t.speed) * dt);
      }
      if (t.mesh.position.x > 122) t.mesh.position.x = -122;
      if (t.mesh.position.x < -122) t.mesh.position.x = 122;
    }
    for (const t of this.traffic) {
      const z = t.mesh.position.z;
      let stop = false;
      if (red)
        for (const l of this.lights) {
          const ahead = t.speed > 0 ? l.z - 6 - z : z - (l.z + 6);
          if (ahead > 0 && ahead < 7) {
            stop = true;
            break;
          }
        }
      // don't drive through the officer or the patrol car
      const me = this.inCar ? this.car.position : this.player.position;
      const dz = (me.z - z) * Math.sign(t.speed);
      // only brake for someone actually in front (not alongside), so cars never park beside the officer
      if (Math.abs(me.x - t.mesh.position.x) < 1.4 && dz > 2.6 && dz < 7.5) {
        stop = true;
        // don't queue behind the officer / patrol car (that parks a car right in the chase camera): change lane
        t.waitT = (t.waitT ?? 0) + dt;
        if (t.waitT > 0.8) {
          t.waitT = 0;
          const sgn = Math.sign(t.laneX);
          t.laneX = sgn * (Math.abs(t.laneX) < 2 ? 3.3 : 1.15);
        }
      }
      // siren: cars nearby ease to the kerb and stop to let you through
      const near = Math.hypot(C.x - t.mesh.position.x, C.z - z);
      const want = this.inCar
        ? pullOver(this.siren || this.chasing, near - sirenRangeBonus(progress.garage ?? { engine: 0, armor: 0, brakes: 0 }))
        : 0;
      t.side = (t.side ?? 0) + (want - (t.side ?? 0)) * Math.min(1, dt * 2);
      if (want > 0 && near < 22) stop = true;
      const kerb = t.laneX > 0 ? 1 : -1;
      const wantX = t.laneX + kerb * (t.side ?? 0);
      t.mesh.position.x += (wantX - t.mesh.position.x) * Math.min(1, dt * 2.5);
      // collisions with the patrol car: both cars get shoved, the patrol car takes damage
      if (this.inCar) {
        const share = 0.6;
        const closing = this.carVsCar(t.mesh, 0, stop ? 0 : t.speed, share);
        if (closing >= 0) {
          t.mesh.position.z -= this.contact.nz * this.contact.depth * (1 - share);
          if (closing > 1) t.bumpT = 1.5;
        }
      }
      if (t.bumpT && t.bumpT > 0) {
        t.bumpT -= dt;
        stop = true;
        t.mesh.rotation.z = Math.sin(t.bumpT * 20) * 0.03 * t.bumpT;
      }
      if (!stop) {
        t.mesh.position.z += t.speed * dt;
        rollWheels(t.mesh, Math.abs(t.speed) * dt);
      }
      if (t.mesh.position.z > 250) t.mesh.position.z = -110;
      if (t.mesh.position.z < -110) t.mesh.position.z = 250;
    }
  }

  /**
   * Patrol car against another car: pushes the patrol car out by `share` of the overlap and bounces its
   * velocity. Returns the closing speed (0 if just touching) or -1 when not in contact; `this.contact`
   * then holds the push direction for the patrol car so the caller can shove the other one the opposite way.
   */
  private carVsCar(g: THREE.Object3D, ovx: number, ovz: number, share: number, hl = 2.25): number {
    if (!g.visible) return -1;
    const C = this.car.position;
    const a = this.myBox,
      b = this.otherBox;
    a.x = C.x;
    a.z = C.z;
    a.yaw = this.car.rotation.y;
    b.x = g.position.x;
    b.z = g.position.z;
    b.yaw = g.rotation.y;
    b.hl = hl;
    const n = this.contact;
    if (!overlap(a, b, n)) return -1;
    const nx = C.x + n.nx * n.depth * share,
      nz = C.z + n.nz * n.depth * share;
    if (onRoad(nx, nz, 0.4)) C.set(nx, 0, nz);
    this.motion.speed = this.speed;
    this.motion.velYaw = this.velYaw;
    const closing = bounce(this.motion, this.yaw, n, ovx, ovz, share);
    this.speed = this.motion.speed;
    this.velYaw = this.motion.velYaw;
    if (closing > 0) this.crash(closing);
    return closing;
  }

  /** Bounce off a kerb or wall whose normal (pointing back onto the road) is (nx, nz). */
  private wallHit(nx: number, nz: number) {
    const n = this.contact;
    n.nx = nx;
    n.nz = nz;
    n.depth = 0;
    this.motion.speed = this.speed;
    this.motion.velYaw = this.velYaw;
    const closing = bounce(this.motion, this.yaw, n, 0, 0, 1, 0);
    this.speed = this.motion.speed;
    this.velYaw = this.motion.velYaw;
    if (closing > 6) this.crash(closing * 0.6);
  }

  /** Hit feedback and damage; small taps are free. */
  private crash(v: number) {
    if (this.hitCool > 0) return;
    const dmg = hitDamage(v);
    if (dmg <= 0) return;
    this.damage = Math.min(100, this.damage + armoredHit(dmg, progress.garage ?? { engine: 0, armor: 0, brakes: 0 }));
    this.hitCool = 0.6;
    audio.sample('crash', Math.min(1, v / 15));
    this.recoil = Math.min(1, v / 10);
    this.setStatus(this.damage >= 100 ? '💥 الدورية متدمرة — بتمشي ببطء.' : `💥 خبطة! ضرر الدورية ${this.damage}%`);
  }

  private stepChase(dt: number) {
    if (!this.chasing || !this.suspect) return;
    this.chaseTime += dt;
    if (this.inCar || this.chaseTime > GRACE) this.chaseClock += dt;
    const sp = this.suspect.position;
    const dist = sp.distanceTo(this.car.position);
    // fair suspect speed: below the patrol car's top speed, brakes for corners, eases off when far
    const flee = fleeSpeed({
      t: this.chaseClock,
      k: this.chaseSpeed,
      playerMax: topSpeed(18 + rank().car + engineBonus(progress.garage ?? { engine: 0, armor: 0, brakes: 0 }), this.damage),
      dist,
      turn: this.chaseTurn
    });
    // waits for the player to get in the car (no escape while they're running to it)
    if (this.pitCool > 0) this.pitCool -= dt;
    if (this.spinT > 0) {
      // spun out by a PIT: slides to a stop while it turns, then drives off again
      this.spinT -= dt;
      this.suspect.rotation.y = wrapAngle(this.suspect.rotation.y + this.spinDir * spinRate(this.spinT) * dt);
      const v = flee * Math.max(0, this.spinT / SPIN_T) ** 2 * dt;
      const nx = sp.x + Math.sin(this.pitHead) * v,
        nz = sp.z + Math.cos(this.pitHead) * v;
      if (onRoad(nx, nz, 1)) sp.set(nx, 0, nz);
    }
    const moving = this.spinT <= 0;
    // driver brain: may swipe at you when you're alongside, or brake-check you when you tailgate
    const cs = this.carSense;
    {
      const y = this.suspect.rotation.y,
        c = Math.cos(y),
        s = Math.sin(y);
      const dx = this.car.position.x - sp.x,
        dz = this.car.position.z - sp.z;
      cs.lx = dx * c - dz * s;
      cs.lz = dx * s + dz * c;
    }
    cs.inCar = this.inCar;
    cs.pSpeed = Math.abs(this.speed);
    cs.lock = this.chaseLock / LOCK_T;
    cs.spun = !moving;
    const was = this.carAi.mode;
    if (stepCarAi(this.carAi, cs, dt) === 'ram' && was !== 'ram')
      this.setStatus(this.carAi.side ? '⚠ الحرامي بيحاول يخبطك!' : '⚠ فرمل فجأة قدامك!');
    const cmd = carCmd(this.carAi, cs.skill, this.carOut);
    const step = !moving ? 0 : (this.inCar || this.chaseTime > GRACE ? flee * dt : flee * dt * 0.35) * cmd.speedMul;
    let head = moving ? followPath(sp, this.chasePath, step) : null;
    if (head === null && moving) {
      const far = farNode(sp.x, sp.z);
      this.chasePath = trimBehind(findPath(sp.x, sp.z, far.x, far.z), sp.x, sp.z, this.suspect.rotation.y);
      head = followPath(sp, this.chasePath, step);
    }
    if (head !== null && moving) {
      this.chaseTurn = wrapAngle(head - this.suspect.rotation.y);
      this.suspect.rotation.y = approachAngle(this.suspect.rotation.y, head + cmd.yawOff, dt * 5);
    }
    if (cmd.lat !== 0 && moving) {
      // sideways drift (swipe or weave); the path pulls it back into lane afterwards
      const y = this.suspect.rotation.y;
      const nx = sp.x + Math.cos(y) * cmd.lat * dt,
        nz = sp.z - Math.sin(y) * cmd.lat * dt;
      if (onRoad(nx, nz, 1)) sp.set(nx, 0, nz);
    }
    // solid cars: you can't drive through the suspect; a nudge on its rear quarter (PIT) spins it out
    if (this.inCar) {
      const sv = moving ? flee * cmd.speedMul : 0,
        sy = this.suspect.rotation.y,
        lat = moving ? cmd.lat : 0;
      const closing = this.carVsCar(
        this.suspect,
        Math.sin(sy) * sv + Math.cos(sy) * lat,
        Math.cos(sy) * sv - Math.sin(sy) * lat,
        1,
        2.35
      );
      if (closing > 0 && this.carAi.mode === 'ram') {
        ramLanded(this.carAi);
        if (this.carAi.side) this.setStatus(`💥 الحرامي خبطك! ضرر الدورية ${this.damage}%`);
      }
      if (closing >= 0 && this.spinT <= 0 && this.pitCool <= 0) {
        const q = this.pitIn;
        q.px = this.car.position.x;
        q.pz = this.car.position.z;
        q.pVelYaw = this.velYaw;
        q.pSpeed = this.speed;
        q.sx = sp.x;
        q.sz = sp.z;
        q.sYaw = sy;
        q.sSpeed = sv;
        const spin = pitSpin(q);
        if (spin) {
          this.spinT = SPIN_T;
          this.spinDir = spin;
          this.pitHead = sy;
          this.pitCool = 6;
          this.chaseLock = Math.max(this.chaseLock, LOCK_T * 0.4);
          audio.sample('crash', 0.8);
          this.setStatus('💥 PIT! العربية لفّت — قرّب منها واقفلها.');
        } else if (closing > 0 && this.chaseLock < 0.05) audio.click();
      }
    }
    this.chaseLock = stepLock(this.chaseLock, dist, this.inCar, dt);
    const r = chaseOutcome({
      dist,
      inCar: this.inCar,
      clock: this.chaseClock,
      limit: this.chaseLimit,
      lock: this.chaseLock
    });
    if (r === 'caught') this.caught();
    else if (r === 'escaped') this.finishMission(false, 'العربية بعدت أوي وهربت.');
    else if (r === 'timeout') this.finishMission(false, 'الوقت خلص والعربية هربت.');
  }

  /** chase won: the car stops, the driver steps out with the scripted behaviour */
  private caught() {
    this.chasing = false;
    this.carSense.caught = true;
    stepCarAi(this.carAi, this.carSense, 0);
    audio.sirenLoop(false);
    this.speed = 0;
    const p = this.suspect!.position;
    if (this.chaseThen) {
      const b = this.chaseThen;
      this.squad.spawnOne(b, p.x + 2.2, p.z);
      if (b === 'fight') this.squad.spawnOne('fight', p.x - 2.4, p.z + 1);
      this.chaseArrest = true;
      this.setStatus(
        b === 'flee'
          ? 'السواق نزل يجري! انزل والحقه.'
          : b === 'fight'
            ? '⚠ نزلوا مسلحين! انزل واتعامل.'
            : 'العربية وقفت. انزل واقبض على السواق.'
      );
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
    const lit = this.siren || this.chasing;
    const pulse = (Math.sin(performance.now() / 90) + 1) * 0.5;
    this.flash.forEach((L, i) => {
      const on = lit && (i % 2 === 0 ? pulse > 0.5 : pulse <= 0.5);
      L.intensity = on ? 4.5 : lit ? 0.05 : 0;
    });
  }

  private drawMini() {
    const c = this.mini;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const pos = this.inCar ? this.car.position : this.player.position;
    const dots: { x: number; z: number; c: string; r: number }[] = STREET_PLACES.map((p) => ({
      x: 0,
      z: p.z,
      c: p.id === this.missionId ? '#ff4d6d' : '#3aa0ff',
      r: p.id === this.missionId ? 5 : 3
    }));
    for (const m of this.squad.list)
      if (m.state !== 'down' && m.state !== 'cuffed')
        dots.push({ x: m.g.position.x, z: m.g.position.z, c: m.state === 'hands' ? '#7dff9a' : '#ff3b3b', r: 2.5 });
    if (this.msHasTarget) dots.push({ x: this.msTarget.x, z: this.msTarget.z, c: '#ffd23d', r: 4 });
    if (this.chasing && this.suspect)
      dots.push({ x: this.suspect.position.x, z: this.suspect.position.z, c: '#ffd23d', r: 4 });
    if (this.vip) {
      const st = this.level.steps[this.msIdx];
      if (st?.t === 'escort') dots.push({ x: st.tx, z: st.tz, c: '#7dff9a', r: 4 });
      dots.push({ x: this.vip.position.x, z: this.vip.position.z, c: '#ffc93c', r: 4.5 });
    }

    dots.push({ x: pos.x, z: pos.z, c: '#ffffff', r: 4 });
    const m = drawCityMap(ctx, c.width, c.height, dots);
    if (this.route.length > 1) {
      ctx.strokeStyle = '#ffd23d';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(m.sx(pos.x), m.sz(pos.z));
      for (const w of this.route) ctx.lineTo(m.sx(w.x), m.sz(w.z));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
    }
  }
}

function approachAngle(current: number, target: number, maxStep: number) {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return current + THREE.MathUtils.clamp(d, -maxStep, maxStep);
}
