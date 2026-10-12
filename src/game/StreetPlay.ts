import * as THREE from 'three';
import { audio } from './AudioManager';

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
  private mounted = false;
  private boundKeyDown = (e: KeyboardEvent) => this.onKey(e, true);
  private boundKeyUp = (e: KeyboardEvent) => this.onKey(e, false);

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
    const roadMat = this.mat(0x0c1016, { roughness: 0.05, metalness: 0.75, envMapIntensity: 1.2 });
    const road = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.08, 340), roadMat);
    road.position.set(0, 0.04, 60);
    road.receiveShadow = true;
    this.group.add(road);

    const wet = new THREE.Mesh(
      new THREE.PlaneGeometry(8.4, 330),
      new THREE.MeshStandardMaterial({
        color: 0x152838,
        roughness: 0.03,
        metalness: 0.92,
        transparent: true,
        opacity: 0.55
      })
    );
    wet.rotation.x = -Math.PI / 2;
    wet.position.set(0, 0.09, 60);
    this.group.add(wet);

    const walkMat = this.mat(0x2a3038, { roughness: 0.55, metalness: 0.2 });
    for (const side of [-1, 1]) {
      const sw = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.1, 340), walkMat);
      sw.position.set(side * 6.3, 0.06, 60);
      sw.receiveShadow = true;
      this.group.add(sw);
    }

    const line = this.mat(0xf0d060, { emissive: 0x886600, emissiveIntensity: 0.55, roughness: 0.4 });
    for (let z = -90; z < 230; z += 8) {
      this.group.add(this.box(0.16, 0.02, 3.2, line, 0, 0.1, z));
    }

    for (const place of STREET_PLACES) {
      this.buildBlock(place);
      this.addCrosswalk(place.z + 12);
    }
    for (let z = -90; z < 230; z += 20) {
      this.addLamp(-5.2, z);
      this.addLamp(5.2, z + 10);
    }
    for (let z = -80; z < 220; z += 40) this.addProps(z);
  }

  private buildBlock(place: StreetPlace) {
    const palette = place.id === 'port' ? [0x4a5560, 0x6b5a48, 0x2f4858]
      : place.id === 'corniche' ? [0xd8c8a8, 0xb8c8d8, 0xe0d0c0]
      : place.id === 'suburb' ? [0xc8a888, 0xa8b898, 0xd8b8a0]
      : [0x384858, 0x2a3a4a, 0x485868];
    const glow = this.mat(0xffe6a0, { emissive: 0xffc860, emissiveIntensity: 0.6 });
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const h = place.id === 'downtown' ? 10 + ((i * 7) % 14) : place.id === 'suburb' ? 3.5 + (i % 2) : 5 + ((i * 3) % 6);
        const w = 5 + (i % 3);
        const m = this.mat(palette[i % palette.length], { roughness: 0.8 });
        const z = place.z - 24 + i * 10;
        const x = side * (10.5 + w / 2);
        const b = this.box(w, h, 8, m, x, h / 2, z);
        b.castShadow = true;
        this.group.add(b);
        for (let y = 2; y < h - 1; y += 2.6) {
          this.group.add(this.box(0.05, 0.9, 1.2, glow, x - side * (w / 2 + 0.03), y, z - 2));
          this.group.add(this.box(0.05, 0.9, 1.2, glow, x - side * (w / 2 + 0.03), y, z + 2));
        }
      }
    }
    const sign = this.makeSign(place.name);
    sign.position.set(-8, 0, place.z);
    this.group.add(sign);
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
    const light = new THREE.PointLight(0xffc56a, 2.4, 16, 2);
    light.position.set(x, 4.3, z);
    this.group.add(light);
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
    return { g, legL, legR, armL, armR };
  }

  private spawnPeople() {
    const dresses = [0x8d2f45, 0x1f6f6a, 0xe7d7c1, 0x111111, 0x3d4d8a];
    const hairs = [0x1a120e, 0x3a2416, 0x0e0e0e, 0x5a3820];
    const jackets = [0x1c2430, 0x4a4038, 0x202228, 0x16324a];
    let n = 0;
    for (const place of STREET_PLACES) {
      for (let i = 0; i < 6; i++) {
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
    }
    return g;
  }

  private makeSuspectCar() {
    const g = new THREE.Group();
    const body = this.mat(0x1a1a1a, { metalness: 0.65, roughness: 0.25 });
    g.add(this.box(1.65, 0.4, 4.0, body, 0, 0.5, 0));
    g.add(this.box(1.45, 0.35, 1.6, this.mat(0x111111, { metalness: 0.4 }), 0, 0.88, -0.2));
    const tail = new THREE.PointLight(0xff2200, 1.4, 6, 2);
    tail.position.set(0, 0.55, 1.9);
    g.add(tail);
    return g;
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
      this.group.add(mesh);
      this.traffic.push({ mesh, speed: (i % 2 === 0 ? 1 : -1) * (4 + (i % 3)), laneX });
    }
  }

  private buildRain() {
    const count = 700;
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

  engage() {
    this.active = true;
    this.group.visible = true;
    this.root.visible = false;
    this.carRoot.visible = false;
    this.markerRoot.visible = false;
    if (this.rain) this.rain.visible = true;
    document.body.dataset.play = 'street';
    this.mountUi();
    window.addEventListener('keydown', this.boundKeyDown);
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
      </div>
    `;
    document.getElementById('app')!.appendChild(ui);
    this.ui = ui;
    this.mini = ui.querySelector('#street-mini');
    this.statusEl = ui.querySelector('#street-status');
    const press = (k: keyof Hold, on: boolean) => {
      this.hold[k] = on;
    };
    ui.querySelectorAll('[data-k]').forEach((btn) => {
      const k = (btn as HTMLElement).dataset.k as keyof Hold;
      const down = (e: Event) => {
        e.preventDefault();
        press(k, true);
      };
      const up = (e: Event) => {
        e.preventDefault();
        press(k, false);
      };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointerleave', up);
      btn.addEventListener('pointercancel', up);
    });
    const runBtn = ui.querySelector('[data-act="run"]')!;
    runBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.hold.run = true;
    });
    runBtn.addEventListener('pointerup', () => (this.hold.run = false));
    runBtn.addEventListener('pointerleave', () => (this.hold.run = false));
    ui.querySelector('[data-act="car"]')!.addEventListener('click', () => this.toggleCar());
    ui.querySelector('[data-act="map"]')!.addEventListener('click', () => this.openMap());
    this.mini!.addEventListener('click', () => this.openMap());
    this.setStatus('ليل ممطر — امشِ أو اركب الدورية. الخريطة فيها المهام.');
  }

  private onKey(e: KeyboardEvent, down: boolean) {
    if (!this.active) return;
    this.keys[down ? 'add' : 'delete'](e.code);
    if (down && (e.code === 'KeyE' || e.code === 'Enter')) this.toggleCar();
    if (down && e.code === 'KeyM') this.mapEl ? this.closeMap() : this.openMap();
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
      this.player.visible = true;
      this.player.position.set(this.car.position.x + 2.2, 0, this.car.position.z);
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
    this.player.visible = false;
    this.yaw = this.car.rotation.y;
    this.setStatus('داخل الدورية. امشِ بالأسهم أو الأزرار. صفارة المطاردة لما توصل المهمة.');
    const btn = this.ui?.querySelector('[data-act="car"]');
    if (btn) btn.textContent = 'انزل';
  }

  private setStatus(text: string) {
    if (this.statusEl) this.statusEl.textContent = text;
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

  private maybeStartChase(place: StreetPlace) {
    if (place.id !== this.missionId || this.chasing || this.resultEl) return;
    if (!this.inCar) {
      this.setStatus(`${place.name}: المهمة هنا. اركب الدورية عشان المطاردة تبدأ.`);
      this.missionId = place.id;
      return;
    }
    this.beginChase(place);
  }

  private beginChase(place: StreetPlace) {
    this.chasing = true;
    this.chaseTime = 0;
    this.travel = null;
    if (this.suspect) this.group.remove(this.suspect);
    this.suspect = this.makeSuspectCar();
    this.suspect.position.set(-1.6, 0, this.car.position.z + 16);
    this.group.add(this.suspect);
    audio.sirenSting();
    this.setStatus(`مطاردة في ${place.name} — الحق السيارة السودا.`);
  }

  private finishChase(success: boolean) {
    if (!this.chasing) return;
    this.chasing = false;
    const place = STREET_PLACES.find((p) => p.id === this.missionId) || STREET_PLACES[1];
    if (this.suspect) {
      this.group.remove(this.suspect);
      this.suspect = null;
    }
    const report: ChaseReport = success
      ? {
          success: true,
          placeName: place.name,
          summary: `قبضت على الهارب في ${place.name}. الدورية قفلت عليه قبل ما يطلع من الحي.`,
          money: 2400,
          rep: 6
        }
      : {
          success: false,
          placeName: place.name,
          summary: `الهارب أفلت من ${place.name}. المطاردة طولت والمخرج فضل مفتوح.`,
          money: 0,
          rep: -3
        };
    if (success) audio.success();
    else audio.fail();
    const order = ['port', 'corniche', 'suburb', 'downtown'];
    const i = order.indexOf(this.missionId);
    this.missionId = order[(i + 1) % order.length];
    this.onReport?.(report);
    this.showResult(report);
  }

  private showResult(r: ChaseReport) {
    this.closeMap();
    if (this.resultEl) this.resultEl.remove();
    const el = document.createElement('div');
    el.id = 'street-result';
    el.innerHTML = `
      <div class="street-result-card ${r.success ? 'ok' : 'bad'}">
        <h2>${r.success ? 'نجحت المطاردة' : 'المطاردة فشلت'}</h2>
        <p class="where">${r.placeName}</p>
        <p>${r.summary}</p>
        <p class="nums">${r.money ? `+$${r.money}` : 'بدون مكافأة'} · سمعة ${r.rep > 0 ? '+' : ''}${r.rep}</p>
        <button type="button" data-ok>تمام</button>
      </div>
    `;
    document.getElementById('app')!.appendChild(el);
    this.resultEl = el;
    el.querySelector('[data-ok]')!.addEventListener('click', () => {
      el.remove();
      this.resultEl = null;
      const next = STREET_PLACES.find((p) => p.id === this.missionId);
      this.setStatus(next ? `المهمة الجاية على الخريطة: ${next.name}` : 'الوردية مستمرة');
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
    const dest = new THREE.Vector3(
      target.position.x - sin * back,
      up,
      target.position.z - cos * back
    );
    this.camPos.lerp(dest, k);
    this.camera.position.copy(this.camPos);
    this.look.set(target.position.x, this.inCar ? 1.1 : 1.3, target.position.z);
    this.camera.lookAt(this.look);
  }

  update(dt: number) {
    if (!this.active) return;
    const input = this.wants();
    this.stepActor(dt, input);
    this.stepPeds(dt);
    this.stepTraffic(dt);
    this.stepChase(dt);
    this.stepRain(dt);
    this.stepLights();
    this.snapCamera(1 - Math.pow(0.0008, dt));
    this.drawMini();
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
      const max = this.chasing ? 18 : 12;
      const target = throttle * max;
      this.speed += (target - this.speed) * Math.min(1, dt * 2.2);
      this.car.rotation.y = this.yaw;
      this.car.position.x += Math.sin(this.yaw) * this.speed * dt;
      this.car.position.z += Math.cos(this.yaw) * this.speed * dt;
      this.car.position.x = THREE.MathUtils.clamp(this.car.position.x, -3.2, 3.2);
      this.car.position.z = THREE.MathUtils.clamp(this.car.position.z, -100, 240);
    } else {
      const moving = throttle !== 0 || turn !== 0;
      if (turn !== 0 && throttle === 0) this.yaw += turn * dt * 2.2;
      if (throttle !== 0) {
        const aim = Math.atan2(turn, throttle);
        this.yaw = approachAngle(this.yaw, aim, dt * 6);
      }
      const spd = (input.run ? 5.2 : 2.6) * (throttle || (turn ? 0.8 : 0));
      this.player.position.x += Math.sin(this.yaw) * spd * dt;
      this.player.position.z += Math.cos(this.yaw) * spd * dt;
      this.player.position.x = THREE.MathUtils.clamp(this.player.position.x, -7.4, 7.4);
      this.player.position.z = THREE.MathUtils.clamp(this.player.position.z, -100, 240);
      this.player.rotation.y = this.yaw;
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
    for (const p of this.peds) {
      p.phase += dt * p.speed * 6;
      p.mesh.position.z += p.dir * p.speed * dt;
      if (p.mesh.position.z > p.z1) p.dir = -1;
      if (p.mesh.position.z < p.z0) p.dir = 1;
      p.mesh.rotation.y = p.dir > 0 ? 0 : Math.PI;
      const swing = Math.sin(p.phase) * 0.65;
      p.legL.rotation.x = swing;
      p.legR.rotation.x = -swing;
      p.armL.rotation.x = -swing * 0.6;
      p.armR.rotation.x = swing * 0.6;
      p.mesh.position.y = Math.abs(Math.sin(p.phase)) * 0.04;
    }
  }

  private stepTraffic(dt: number) {
    for (const t of this.traffic) {
      t.mesh.position.z += t.speed * dt;
      if (t.mesh.position.z > 250) t.mesh.position.z = -110;
      if (t.mesh.position.z < -110) t.mesh.position.z = 250;
    }
  }

  private stepChase(dt: number) {
    if (!this.chasing || !this.suspect) return;
    this.chaseTime += dt;
    const flee = 9.5 + Math.min(4, this.chaseTime * 0.15);
    this.suspect.position.z += flee * dt;
    this.suspect.position.x += Math.sin(this.chaseTime * 1.4) * dt * 0.8;
    this.suspect.position.x = THREE.MathUtils.clamp(this.suspect.position.x, -2.4, 2.4);
    const dist = this.suspect.position.distanceTo(this.car.position);
    if (this.inCar && dist < 3.4) this.finishChase(true);
    else if (this.suspect.position.z > 235 || this.chaseTime > 28) this.finishChase(false);
    else if (Math.floor(this.chaseTime) % 4 === 0) {
      /* status stays until next set */
    }
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
    const w = c.width;
    const h = c.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(6,12,20,0.82)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#2a6ea8';
    ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.fillStyle = '#1c2836';
    ctx.fillRect(w / 2 - 10, 16, 20, h - 32);
    const zOf = (z: number) => h - 20 - ((z + 100) / 340) * (h - 40);
    for (const p of STREET_PLACES) {
      const y = zOf(p.z);
      ctx.fillStyle = p.id === this.missionId ? '#ff4d6d' : '#3aa0ff';
      ctx.beginPath();
      ctx.arc(w / 2, y, p.id === this.missionId ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
    }
    const pz = this.inCar ? this.car.position.z : this.player.position.z;
    ctx.fillStyle = '#ffe08a';
    ctx.beginPath();
    ctx.arc(w / 2, zOf(pz), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d5e4f5';
    ctx.font = '12px Cairo, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('خريطة', w / 2, 16);
  }
}

function approachAngle(current: number, target: number, maxStep: number) {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return current + THREE.MathUtils.clamp(d, -maxStep, maxStep);
}
