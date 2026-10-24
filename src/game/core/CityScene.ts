// @source-complete
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { loadEnvironment } from '../world/Environment';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DISTRICTS, ZoneType, type CityPOI } from './types';
import type { StreetPlay } from './StreetPlay';
import { Q, quality } from '../config/Quality';
import { models, fx, LOW_BUILDINGS, TOWERS } from './Models';

type CarMesh = THREE.Group & { userData: { unitId?: string; flashing?: boolean; lights?: THREE.PointLight[] } };

export class CityScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  root = new THREE.Group();
  markerRoot = new THREE.Group();
  carRoot = new THREE.Group();
  pois: CityPOI[] = [];
  clock = new THREE.Clock();
  hqPosition = new THREE.Vector3(0, 0, 0);
  private flashLights: THREE.PointLight[] = [];
  private windowMats: THREE.MeshStandardMaterial[] = [];
  private helo: THREE.Group | null = null;
  private roadMat!: THREE.MeshStandardMaterial;
  private groundMat!: THREE.MeshStandardMaterial;
  private hemi!: THREE.HemisphereLight;
  private sun!: THREE.DirectionalLight;
  private ambient!: THREE.AmbientLight;
  private gridHelper: THREE.GridHelper | null = null;
  /** street lamps: 3 InstancedMeshes (pole, arm, bulb) + a small pool of real lights that follow the camera */
  private lampPos: THREE.Vector3[] = [];
  private lampMat: THREE.MeshStandardMaterial | null = null;
  private lampLights: THREE.PointLight[] = [];
  private lampPoolT = 0;
  private accentLights: Array<{ light: THREE.PointLight; dayI: number; nightI: number }> = [];
  private cityHour = 8;
  private nightFactor = 0;
  private lineMats: THREE.MeshStandardMaterial[] = [];
  private waterMat: THREE.MeshStandardMaterial | null = null;
  /** street mode is code-split: loaded on first use (see loadStreet) */
  street: StreetPlay | null = null;
  private streetP: Promise<StreetPlay> | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: Q.antialias,
      stencil: false,
      alpha: false,
      powerPreference: 'high-performance'
    });
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      document.body.classList.add('gl-lost');
    });
    canvas.addEventListener('webglcontextrestored', () => location.reload());
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, Q.pixelRatio));
    // (CSS size stays 100% of the screen: a pixel width left over from the other orientation would make the phone
    // browser zoom the whole page out, shrinking the HUD into a corner)
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.domElement.classList.add('gl-view');
    this.renderer.shadowMap.enabled = Q.shadows;
    models.shadows = Q.shadows;
    models.hiQuality = !Q.lowDetailPeople;
    fx.particles = Q.particles;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x7eb6e8);
    this.scene.fog = new THREE.FogExp2(0x9ec4e8, 0.0045);

    this.camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 1600);
    this.camera.position.set(42, 38, 48);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 110;
    this.controls.target.set(0, 2, 0);

    this.scene.add(this.root);
    this.scene.add(this.buildSkyDome());
    this.scene.add(this.markerRoot);
    this.scene.add(this.carRoot);

    this.windowMats.push(models.windowMat);
    this.buildLighting();
    void loadEnvironment(this.renderer, this.scene)?.catch(() => undefined);
    this.buildCity();
    this.setTimeOfDay(8);
    // test hook for automated screenshots (only with ?autotest)
    if (location.search.includes('autotest')) (window as unknown as { __city: unknown }).__city = this;

    window.addEventListener('resize', () => this.onResize());
    // phones report the new size late after a rotation: resize again once it has settled
    const later = () => [60, 300, 800].forEach((t) => setTimeout(() => this.onResize(), t));
    window.addEventListener('orientationchange', later);
    window.visualViewport?.addEventListener('resize', later);
  }

  /** Lazy-load the street-mode chunk (StreetPlay, city/road graph, NPC AI) and build it once. */
  loadStreet(): Promise<StreetPlay> {
    if (!this.streetP) {
      this.streetP = import('./StreetPlay').then(({ StreetPlay }) => {
        this.street = new StreetPlay(this.scene, this.camera, this.root, this.carRoot, this.markerRoot);
        this.street.hour = () => this.cityHour;
        return this.street;
      });
      this.streetP.catch(() => {
        this.streetP = null;
      });
    }
    return this.streetP;
  }

  private buildLighting() {
    this.hemi = new THREE.HemisphereLight(0xb8d4f0, 0x3a4a38, 0.95);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff0d0, 1.35);
    this.sun.position.set(40, 70, 20);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(Q.shadowMap, Q.shadowMap);
    this.sun.shadow.camera.near = 5;
    this.sun.shadow.camera.far = 180;
    this.sun.shadow.camera.left = -70;
    this.sun.shadow.camera.right = 70;
    this.sun.shadow.camera.top = 70;
    this.sun.shadow.camera.bottom = -70;
    this.sun.shadow.bias = -0.0002;
    this.scene.add(this.sun);

    this.ambient = new THREE.AmbientLight(0xc8d8e8, 0.45);
    this.scene.add(this.ambient);
  }

  private mat(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.18, ...opts });
  }

  private box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private buildCity() {
    // Ground
    this.groundMat = this.mat(0x3a4a42, { roughness: 0.92, metalness: 0.06 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), this.groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.root.add(ground);

    // Subtle grid (dimmer by day, stronger at night via applyTimeOfDay)
    const grid = new THREE.GridHelper(140, 28, 0x6a8aaa, 0x4a5a68);
    grid.position.y = 0.02;
    const gm = grid.material as THREE.Material | THREE.Material[];
    const mats = Array.isArray(gm) ? gm : [gm];
    for (const m of mats) {
      m.opacity = 0.22;
      m.transparent = true;
    }
    this.gridHelper = grid;
    this.root.add(grid);

    this.roadMat = this.mat(0x4a4f58, { roughness: 0.88, metalness: 0.08 });
    this.buildRoads();
    this.buildHQ();
    this.buildBank(-28, -18);
    this.buildBank(32, 14);
    this.buildDistricts();
    this.buildStreetLights();
    this.buildLandmarks();
    this.registerPOIs();
  }

  private buildRoads() {
    const addRoad = (w: number, d: number, x: number, z: number) => {
      const road = this.box(w, 0.08, d, this.roadMat, x, 0.04, z);
      this.root.add(road);
      // center line
      const lineMat = this.mat(0xc9a227, { emissive: 0x664400, emissiveIntensity: 0.08, roughness: 0.6 });
      this.lineMats.push(lineMat);
      if (w > d) {
        const line = this.box(w * 0.9, 0.02, 0.18, lineMat, x, 0.1, z);
        this.root.add(line);
      } else {
        const line = this.box(0.18, 0.02, d * 0.9, lineMat, x, 0.1, z);
        this.root.add(line);
      }
    };
    addRoad(120, 8, 0, 0);
    addRoad(8, 120, 0, 0);
    addRoad(90, 6, 0, 28);
    addRoad(90, 6, 0, -28);
    addRoad(6, 90, 28, 0);
    addRoad(6, 90, -28, 0);
  }

  private addWindows(parent: THREE.Group, w: number, h: number, d: number, yBase: number) {
    const winMat = new THREE.MeshStandardMaterial({
      color: 0x6a7a88,
      emissive: 0xffb347,
      emissiveIntensity: 0.05,
      roughness: 0.35,
      metalness: 0.1
    });
    this.windowMats.push(winMat);

    const cols = Math.max(2, Math.floor(w / 2.2));
    const rows = Math.max(1, Math.floor(h / 2.4));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (Math.random() < 0.12) continue;
        const ww = 0.55;
        const wh = 0.7;
        const wx = -w / 2 + 1.1 + c * ((w - 2.2) / Math.max(1, cols - 1));
        const wy = yBase + 1.2 + r * 2.1;
        const front = this.box(ww, wh, 0.08, winMat, wx, wy, d / 2 + 0.05);
        const back = this.box(ww, wh, 0.08, winMat, wx, wy, -d / 2 - 0.05);
        parent.add(front, back);
      }
    }
  }

  private buildBuilding(x: number, z: number, w: number, h: number, d: number, color: number, name?: string) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const body = this.box(w, h, d, this.mat(color, { roughness: 0.65, metalness: 0.25 }), 0, h / 2, 0);
    g.add(body);
    // roof cap
    g.add(this.box(w + 0.3, 0.25, d + 0.3, this.mat(0x0d1520), 0, h + 0.1, 0));
    this.addWindows(g, w, h, d, 0);
    if (name) g.name = name;
    if (name !== 'bank') {
      const kinds = h > 11 ? TOWERS : LOW_BUILDINGS;
      const pick = Math.abs(Math.round(x * 7 + z * 13)) % kinds.length;
      models.dress(g, kinds[pick], { box: [w, h, d] });
    }
    this.root.add(g);
    return g;
  }

  private buildHQ() {
    const hq = new THREE.Group();
    hq.position.set(0, 0, 0);
    this.hqPosition.set(0, 0, 0);

    // Main block
    const concrete = this.mat(0x2a3548, { roughness: 0.55, metalness: 0.3 });
    hq.add(this.box(18, 7, 14, concrete, 0, 3.5, 0));
    hq.add(this.box(10, 4.5, 10, concrete, 0, 9.25, 0));
    // glass facade strip
    const glass = new THREE.MeshStandardMaterial({
      color: 0x7ec8ff,
      emissive: 0x1a60a8,
      emissiveIntensity: 0.55,
      metalness: 0.7,
      roughness: 0.2,
      transparent: true,
      opacity: 0.85
    });
    hq.add(this.box(16, 2.2, 0.2, glass, 0, 4.5, 7.1));
    hq.add(this.box(8, 1.6, 0.2, glass, 0, 9.5, 5.1));

    // Helipad
    const pad = this.box(8, 0.2, 8, this.mat(0x1a2230), 0, 11.6, 0);
    hq.add(pad);
    const H = this.box(
      3.2,
      0.05,
      0.45,
      this.mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.3 }),
      0,
      11.75,
      0
    );
    const Hbar = this.box(
      0.45,
      0.05,
      3.2,
      this.mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.3 }),
      0,
      11.75,
      0
    );
    hq.add(H, Hbar);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3.2, 3.6, 48),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x88aacc,
        emissiveIntensity: 0.4,
        side: THREE.DoubleSide
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 11.72;
    hq.add(ring);

    // Helicopter
    this.helo = this.makeHelicopter();
    this.helo.position.set(0, 12.2, 0);
    hq.add(this.helo);

    // Satellite dish
    const dishArm = this.box(0.25, 3.5, 0.25, this.mat(0x8899aa), 6.5, 13.2, -3);
    const dish = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 24, 16, 0, Math.PI),
      this.mat(0xc0d0e0, { metalness: 0.8, roughness: 0.25 })
    );
    dish.rotation.x = Math.PI / 2.5;
    dish.position.set(6.5, 14.8, -3);
    hq.add(dishArm, dish);

    // Antenna
    hq.add(this.box(0.15, 4, 0.15, this.mat(0xaaaaaa), -5.5, 13.5, 3));
    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 12, 12),
      new THREE.MeshStandardMaterial({
        color: 0xff3344,
        emissive: 0xff0000,
        emissiveIntensity: 1.2
      })
    );
    tip.position.set(-5.5, 15.6, 3);
    hq.add(tip);

    // Parking lot
    const lot = this.box(22, 0.06, 10, this.roadMat, 0, 0.05, 14);
    hq.add(lot);

    // HQ sign / plaza / pad lights — stronger at night
    const signLight = new THREE.PointLight(0x3aa0ff, 0.4, 36, 2);
    signLight.position.set(0, 8, 9);
    hq.add(signLight);
    this.accentLights.push({ light: signLight, dayI: 0.35, nightI: 3.6 });

    this.addWindows(hq, 18, 7, 14, 0);
    const plazaLight = new THREE.PointLight(0xffd8a0, 0.25, 30, 2);
    plazaLight.position.set(0, 5, 12);
    hq.add(plazaLight);
    this.accentLights.push({ light: plazaLight, dayI: 0.2, nightI: 2.0 });
    const padLight = new THREE.PointLight(0xffffff, 0.35, 16, 2);
    padLight.position.set(0, 13.5, 0);
    hq.add(padLight);
    this.accentLights.push({ light: padLight, dayI: 0.3, nightI: 1.4 });
    this.root.add(hq);

    // Parking cars at HQ
    for (let i = 0; i < 6; i++) {
      const car = this.makePoliceCar(i % 2 === 0 ? 0x1a3a6e : 0xffffff);
      car.position.set(-8 + i * 3.2, 0.05, 14);
      car.rotation.y = Math.PI / 2;
      this.root.add(car);
    }
  }

  private makeHelicopter() {
    const g = new THREE.Group();
    const bodyMat = this.mat(0xf2f5fa, { metalness: 0.45, roughness: 0.35 });
    const blue = this.mat(0x1e5aaf, { metalness: 0.4, roughness: 0.4 });
    g.add(this.box(1.4, 0.9, 3.2, bodyMat, 0, 0.6, 0));
    g.add(this.box(1.2, 0.55, 1.1, blue, 0, 1.15, -0.2));
    g.add(this.box(0.25, 0.25, 2.4, bodyMat, 0, 0.7, -2.4));
    // rotors
    const rotor = this.box(5.5, 0.05, 0.25, this.mat(0x333333), 0, 1.6, 0);
    const rotor2 = this.box(0.25, 0.05, 5.5, this.mat(0x333333), 0, 1.61, 0);
    g.add(rotor, rotor2);
    g.userData.rotors = [rotor, rotor2];
    // skids
    g.add(this.box(0.12, 0.12, 2.8, this.mat(0x555555), -0.7, 0.15, 0));
    g.add(this.box(0.12, 0.12, 2.8, this.mat(0x555555), 0.7, 0.15, 0));
    return g;
  }

  private makePoliceCar(bodyColor = 0x1a3a6e): CarMesh {
    const g = new THREE.Group() as CarMesh;
    const body = this.box(1.6, 0.55, 3.2, this.mat(bodyColor, { metalness: 0.5, roughness: 0.4 }), 0, 0.55, 0);
    const cabin = this.box(1.35, 0.5, 1.5, this.mat(0x223344, { metalness: 0.6, roughness: 0.25 }), 0, 1.05, -0.15);
    g.add(body, cabin);
    // light bar
    const bar = this.box(1.1, 0.18, 0.35, this.mat(0x111111), 0, 1.35, 0.1);
    g.add(bar);
    const red = new THREE.PointLight(0xff2244, 0, 10, 2);
    red.position.set(-0.35, 1.45, 0.1);
    const blue = new THREE.PointLight(0x2288ff, 0, 10, 2);
    blue.position.set(0.35, 1.45, 0.1);
    g.add(red, blue);
    g.userData.lights = [red, blue];
    g.userData.flashing = false;
    fx.glow(red, 0xff2244, 3);
    fx.glow(blue, 0x2288ff, 3);
    // wheels
    const wheelMat = this.mat(0x111111);
    for (const [wx, wz] of [
      [-0.7, 1],
      [0.7, 1],
      [-0.7, -1],
      [0.7, -1]
    ] as const) {
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.28, 12), wheelMat);
      wh.rotation.z = Math.PI / 2;
      wh.position.set(wx, 0.28, wz);
      g.add(wh);
    }
    models.dress(g, 'car-police', { length: 3.6 });
    return g;
  }

  private buildBank(x: number, z: number) {
    const bank = this.buildBuilding(x, z, 14, 9, 10, 0x3a4558, 'bank');
    // Columns
    for (let i = -2; i <= 2; i++) {
      const col = this.box(
        0.55,
        4.5,
        0.55,
        this.mat(0xd8dde8, { metalness: 0.35, roughness: 0.4 }),
        i * 2.2,
        2.25,
        5.2
      );
      bank.add(col);
    }
    // Gold vault glow
    const vaultLight = new THREE.PointLight(0xffd700, 0.5, 16, 2);
    vaultLight.position.set(0, 3, 0);
    bank.add(vaultLight);
    this.accentLights.push({ light: vaultLight, dayI: 0.45, nightI: 1.6 });
    // Sign
    const sign = this.box(6, 1, 0.2, this.mat(0x0a1628, { emissive: 0x1e5aaf, emissiveIntensity: 0.5 }), 0, 8.5, 5.2);
    bank.add(sign);
  }

  private buildDistricts() {
    const residentialColors = [0x3d4a5c, 0x2f3b4d, 0x455468, 0x334155];
    const commercialColors = [0x1f2d44, 0x243652, 0x2a3f5c];

    // Residential blocks
    const residPlots = [
      [-40, -40],
      [-40, -12],
      [-40, 18],
      [-40, 40],
      [40, -40],
      [40, -12],
      [40, 22],
      [40, 40],
      [-16, -42],
      [16, -42],
      [-16, 42],
      [16, 42]
    ];
    residPlots.forEach(([x, z], i) => {
      const h = 4 + (i % 4) * 1.8;
      this.buildBuilding(x, z, 8 + (i % 3), h, 8, residentialColors[i % residentialColors.length], 'residential');
    });

    // Commercial towers
    const comPlots = [
      [-18, -18],
      [18, -18],
      [-18, 18],
      [18, 22],
      [-50, 0],
      [50, 0],
      [0, -50],
      [0, 50]
    ];
    comPlots.forEach(([x, z], i) => {
      const h = 10 + (i % 5) * 3.5;
      this.buildBuilding(x, z, 7 + (i % 2) * 2, h, 7, commercialColors[i % commercialColors.length], 'commercial');
    });

    // Fill voids with mid blocks
    const fillers: Array<[number, number]> = [
      [-22, -32],
      [22, -32],
      [-32, 22],
      [24, 32],
      [-48, -28],
      [48, 28],
      [-24, 8],
      [24, -8],
      [-8, -36],
      [8, 36],
      [-36, -8],
      [36, 8]
    ];
    fillers.forEach(([x, z], i) => {
      if (Math.hypot(x, z) < 16) return;
      const h = 5 + (i % 5) * 2.2;
      this.buildBuilding(x, z, 6 + (i % 3), h, 6, 0x2c3a4e, 'fill');
    });

    // Small shops near roads
    for (let i = 0; i < 14; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const r = 20 + (i % 3) * 4;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      if (Math.hypot(x, z) < 14) continue;
      this.buildBuilding(x, z, 5, 3.5 + (i % 3), 5, 0x364556, 'shop');
    }
  }

  private buildStreetLights() {
    const positions: Array<[number, number]> = [];
    for (let i = -50; i <= 50; i += 12) {
      positions.push([i, 5], [i, -5], [5, i], [-5, i]);
      positions.push([i, 33], [i, -33], [33, i], [-33, i]);
    }
    const pts = positions.filter(([x, z]) => Math.hypot(x, z) >= 12);
    const mat = new THREE.MeshStandardMaterial({ color: 0x556066, emissive: 0xffc067, emissiveIntensity: 0.02 });
    this.lampMat = mat;
    const pole = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 4.5, 0.18), this.mat(0x333333), pts.length);
    const arm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.08, 0.18), this.mat(0x2a2a2a), pts.length);
    const bulb = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 8, 8), mat, pts.length);
    const m4 = new THREE.Matrix4();
    pts.forEach(([x, z], i) => {
      pole.setMatrixAt(i, m4.makeTranslation(x, 2.25, z));
      arm.setMatrixAt(i, m4.makeTranslation(x + 0.35, 4.45, z));
      bulb.setMatrixAt(i, m4.makeTranslation(x, 4.6, z));
      this.lampPos.push(new THREE.Vector3(x, 4.35, z));
    });
    for (const im of [pole, arm, bulb]) {
      im.computeBoundingSphere();
      im.castShadow = false;
      this.root.add(im);
    }
    // Real lights are expensive on phones (every PointLight is in every shader): low 0, medium 3, high 6.
    const n = Q.lampLights;
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffc067, 0, 20, 2);
      this.lampLights.push(l);
      this.root.add(l);
    }
  }

  /** move the light pool to the lamps nearest the camera target */
  private placeLampLights() {
    if (!this.lampLights.length) return;
    const t = this.controls.target;
    const near = this.lampPos.map((p) => ({ p, d: (p.x - t.x) ** 2 + (p.z - t.z) ** 2 })).sort((a, b) => a.d - b.d);
    this.lampLights.forEach((l, i) => {
      const q = near[i]?.p;
      if (q) l.position.copy(q);
    });
  }

  private buildLandmarks() {
    this.waterMat = new THREE.MeshStandardMaterial({
      color: 0x1c6e9a,
      metalness: 0.62,
      roughness: 0.22
    });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(36, 24), this.waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(-64, 0.03, 8);
    water.receiveShadow = true;
    this.root.add(water);

    for (const [x, z] of [
      [-46, -36],
      [-34, -48]
    ] as const) {
      this.root.add(this.box(1.5, 9, 1.5, this.mat(0x6a5a4a), x, 4.5, z));
    }

    for (const d of DISTRICTS) {
      const label = this.createTextSprite(d.name, '#b9dcff');
      label.position.set(d.x, 12, d.z);
      label.scale.set(11, 2.6, 1);
      this.root.add(label);
    }
  }

  private registerPOIs() {
    this.pois = [
      { id: 'hq', name: 'مركز القيادة', kind: 'hq', zone: ZoneType.HQ, x: 0, z: 0, districtId: 'downtown' },
      {
        id: 'bank-1',
        name: 'البنك المركزي',
        kind: 'bank',
        zone: ZoneType.Bank,
        x: -28,
        z: -18,
        districtId: 'downtown'
      },
      { id: 'bank-2', name: 'بنك فيصل', kind: 'bank', zone: ZoneType.Bank, x: 32, z: 14, districtId: 'suburb' },
      {
        id: 'res-1',
        name: 'حي الخلفاوي',
        kind: 'residential',
        zone: ZoneType.Residential,
        x: -40,
        z: -12,
        districtId: 'port'
      },
      {
        id: 'res-2',
        name: 'حي الهرم',
        kind: 'residential',
        zone: ZoneType.Residential,
        x: 40,
        z: 22,
        districtId: 'suburb'
      },
      {
        id: 'com-1',
        name: 'مجمع التحرير',
        kind: 'commercial',
        zone: ZoneType.Commercial,
        x: 18,
        z: -18,
        districtId: 'downtown'
      },
      {
        id: 'com-2',
        name: 'برج قصر النيل',
        kind: 'commercial',
        zone: ZoneType.Downtown,
        x: -18,
        z: 18,
        districtId: 'downtown'
      },
      { id: 'st-1', name: 'كورنيش الجيزة', kind: 'street', zone: ZoneType.Street, x: 0, z: 28, districtId: 'corniche' },
      {
        id: 'st-2',
        name: 'تقاطع الجنوب',
        kind: 'street',
        zone: ZoneType.Street,
        x: 0,
        z: -28,
        districtId: 'industrial'
      },
      { id: 'st-3', name: 'الطريق الدائري', kind: 'street', zone: ZoneType.Street, x: 28, z: 0, districtId: 'suburb' },
      { id: 'st-4', name: 'شارع شبرا', kind: 'street', zone: ZoneType.Street, x: -28, z: 0, districtId: 'port' }
    ];
  }

  private sky!: THREE.Mesh;
  private skyU = { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() } };
  /** Gradient sky dome that follows the camera (cheap on every quality level; the HDRI only lights the scene). */
  private buildSkyDome() {
    const mat = new THREE.ShaderMaterial({
      uniforms: this.skyU,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 vP;
        void main(){ float t = pow(clamp(vP.y, 0.0, 1.0), 0.55); gl_FragColor = vec4(mix(horizon, top, t), 1.0);
        #include <colorspace_fragment>
        }`
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(360, 24, 12), mat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.sky.onBeforeRender = (_r, _s, cam) => this.sky.position.copy(cam.position);
    return this.sky;
  }

  /** Drive cinematic day→dusk→night→dawn from in-game city hour (0–24). */
  setTimeOfDay(hour: number) {
    const h = hour;
    this.cityHour = ((h % 24) + 24) % 24;
    this.applyTimeOfDay();
  }

  getTimeOfDay() {
    return this.cityHour;
  }

  getNightFactor() {
    return this.nightFactor;
  }

  private lerpColor(a: number, b: number, t: number) {
    const ca = new THREE.Color(a);
    const cb = new THREE.Color(b);
    return ca.lerp(cb, THREE.MathUtils.clamp(t, 0, 1));
  }

  private sampleSky(hour: number) {
    const keys: Array<{
      h: number;
      sky: number;
      fog: number;
      sun: number;
      hemiSky: number;
      hemiGround: number;
    }> = [
      { h: 0, sky: 0x070e1c, fog: 0x0a1220, sun: 0xa8c0e8, hemiSky: 0x2a3a58, hemiGround: 0x0a1018 },
      { h: 5, sky: 0x2a3a68, fog: 0x3a4a70, sun: 0xffb070, hemiSky: 0x6a7aaa, hemiGround: 0x2a2830 },
      { h: 6.5, sky: 0x6aa6e0, fog: 0xc8d6e4, sun: 0xffe0b0, hemiSky: 0xb0d0f0, hemiGround: 0x4a5a48 },
      { h: 10, sky: 0x3d8ee6, fog: 0xc2d8ea, sun: 0xfff2d8, hemiSky: 0xc0dcff, hemiGround: 0x4a5a42 },
      { h: 13, sky: 0x3a8ae4, fog: 0xbcd4e8, sun: 0xfff8e8, hemiSky: 0xc8e0ff, hemiGround: 0x506048 },
      { h: 17, sky: 0xc87850, fog: 0xb07060, sun: 0xff9050, hemiSky: 0xe09070, hemiGround: 0x3a3030 },
      { h: 18.5, sky: 0x4a3060, fog: 0x3a2848, sun: 0xff7040, hemiSky: 0x705080, hemiGround: 0x1a1820 },
      { h: 20, sky: 0x0c1830, fog: 0x0a1528, sun: 0xb0c8f0, hemiSky: 0x3a4a70, hemiGround: 0x0c1018 },
      { h: 24, sky: 0x070e1c, fog: 0x0a1220, sun: 0xa8c0e8, hemiSky: 0x2a3a58, hemiGround: 0x0a1018 }
    ];
    let i = 0;
    while (i < keys.length - 1 && hour >= keys[i + 1].h) i++;
    const a = keys[i];
    const b = keys[Math.min(i + 1, keys.length - 1)];
    const span = Math.max(0.001, b.h - a.h);
    const t = THREE.MathUtils.clamp((hour - a.h) / span, 0, 1);
    const smooth = t * t * (3 - 2 * t);
    return {
      sky: this.lerpColor(a.sky, b.sky, smooth),
      fog: this.lerpColor(a.fog, b.fog, smooth),
      sun: this.lerpColor(a.sun, b.sun, smooth),
      hemiSky: this.lerpColor(a.hemiSky, b.hemiSky, smooth),
      hemiGround: this.lerpColor(a.hemiGround, b.hemiGround, smooth)
    };
  }

  private applyTimeOfDay() {
    const hour = this.cityHour;
    const elev = Math.sin(((hour - 6) / 24) * Math.PI * 2);
    this.nightFactor = THREE.MathUtils.clamp(0.55 - elev * 0.65, 0, 1);
    const day = 1 - this.nightFactor;
    const sample = this.sampleSky(hour);
    // Cairo street air is dusty: pull the horizon and fog toward a warm beige while the player is on the street
    const dusty = sample.fog.clone();
    if (this.street?.active) dusty.lerp(new THREE.Color(0xd3c5a9), 0.5 * day);

    (this.scene.background as THREE.Color).copy(sample.sky);
    this.skyU.top.value.copy(sample.sky);
    this.skyU.horizon.value.copy(dusty).lerp(new THREE.Color(0xffffff), 0.15 * day);
    if (this.scene.fog && this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(dusty);
      // on the street the fog hides the edge of the streamed chunks, so the lower presets (which stream less) fog sooner
      const base = this.street?.active ? { low: 0.0034, medium: 0.0028, high: 0.0024 }[quality] : 0.0022;
      this.scene.fog.density = base + this.nightFactor * 0.0038;
    }

    this.hemi.color.copy(sample.hemiSky);
    this.hemi.groundColor.copy(sample.hemiGround);
    this.hemi.intensity = 1.1 + day * 0.7;

    this.sun.color.copy(sample.sun);
    this.sun.intensity = 0.7 + day * 1.5 + (hour > 5 && hour < 8 ? 0.15 : 0);
    const azim = ((hour - 6) / 24) * Math.PI * 2;
    const y = Math.max(6, 12 + elev * 62);
    this.sun.position.set(Math.cos(azim) * 55, y, Math.sin(azim) * 40);
    this.sun.castShadow = elev > -0.15 && !this.street?.active;
    if (this.street?.active) {
      // the street has its own sun that follows the player; keep only a soft share of the city lights
      this.sun.intensity *= 0.15;
      this.hemi.intensity *= 0.35;
    }
    this.street?.setDaylight(day, this.sun.position, sample.sun, dusty);

    this.ambient.color.set(day > 0.4 ? 0xd8e4f0 : 0x5a6e90);
    this.ambient.intensity = (0.6 + day * 0.35 + this.nightFactor * 0.35) * (this.street?.active ? 0.3 : 1);

    this.renderer.toneMappingExposure = 1.15 + day * 0.15 + this.nightFactor * 0.3;

    this.groundMat.color.lerpColors(new THREE.Color(0x3a4a42), new THREE.Color(0x2a3442), this.nightFactor);
    this.roadMat.color.lerpColors(new THREE.Color(0x4a4f58), new THREE.Color(0x30353f), this.nightFactor);

    for (const lm of this.lineMats) {
      lm.emissiveIntensity = 0.08 + this.nightFactor * 0.45;
    }

    if (this.gridHelper) {
      const gm = this.gridHelper.material as THREE.Material | THREE.Material[];
      const mats = Array.isArray(gm) ? gm : [gm];
      for (const m of mats) m.opacity = 0.12 + this.nightFactor * 0.28;
    }

    const lampOn = THREE.MathUtils.smoothstep(this.nightFactor, 0.25, 0.7);
    for (const l of this.lampLights) l.intensity = lampOn * 1.55;
    if (this.lampMat) {
      this.lampMat.emissiveIntensity = lampOn * 1.65;
      this.lampMat.color.set(lampOn > 0.3 ? 0xffe0a0 : 0x556066);
    }

    for (const m of this.windowMats) {
      const flick = 0.85 + Math.sin(this.clock.elapsedTime * 0.7 + m.id) * 0.12;
      m.emissiveIntensity = this.nightFactor * 1.25 * flick;
      m.color.set(this.nightFactor > 0.35 ? 0xffe0a0 : 0x6a7a88);
    }

    for (const a of this.accentLights) {
      a.light.intensity = a.dayI * day + a.nightI * this.nightFactor;
    }
    if (this.waterMat) {
      this.waterMat.color.lerpColors(new THREE.Color(0x3a9ec8), new THREE.Color(0x071824), this.nightFactor);
      this.waterMat.emissive = new THREE.Color(0x123040);
      this.waterMat.emissiveIntensity = this.nightFactor * 0.35;
    }
  }

  createTextSprite(text: string, color = '#ffffff') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 512, 128);
    ctx.fillStyle = 'rgba(8, 16, 28, 0.82)';
    roundRect(ctx, 16, 28, 480, 72, 18);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    roundRect(ctx, 16, 28, 480, 72, 18);
    ctx.stroke();
    ctx.font = 'bold 36px Cairo, Arial';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = 'rtl';
    ctx.fillText(text, 256, 64);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const spr = new THREE.Sprite(mat);
    spr.scale.set(8, 2, 1);
    return spr;
  }

  // adaptive resolution: if the frame rate stays low, lower the render scale step by step (never below 0.6)
  private perfT = 0;
  private perfFrames = 0;
  private adaptPerf(dt: number) {
    this.perfT += dt;
    this.perfFrames++;
    if (this.perfT < 4) return;
    const fps = this.perfFrames / this.perfT;
    this.perfT = 0;
    this.perfFrames = 0;
    if (document.hidden) return;
    const pr = this.renderer.getPixelRatio();
    if (fps < 26 && pr > 0.6) {
      this.renderer.setPixelRatio(Math.max(0.6, pr - 0.15));
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    }
  }

  update(dt: number) {
    models.update(dt);
    fx.update(dt);
    this.adaptPerf(dt);
    this.lampPoolT -= dt;
    if (this.lampPoolT <= 0) {
      this.lampPoolT = 0.5;
      if (!this.street?.active) this.placeLampLights();
    }
    if (this.street?.active) {
      this.renderer.toneMappingExposure = 1.0 + this.nightFactor * 0.45;
      this.street.update(dt);
      const c = this.bloom();
      if (c) c.render(dt);
      else this.renderer.render(this.scene, this.camera);
      return;
    }
    this.controls.update();
    const t = this.clock.elapsedTime;

    if (this.helo?.userData.rotors) {
      for (const r of this.helo.userData.rotors as THREE.Object3D[]) {
        r.rotation.y += dt * 18;
      }
      this.helo.position.y = 12.2 + Math.sin(t * 1.5) * 0.08;
    }

    const pulse = (Math.sin(t * 14) + 1) * 0.5;
    for (let i = 0; i < this.flashLights.length; i++) {
      const L = this.flashLights[i];
      const on = i % 2 === 0 ? pulse > 0.5 : pulse <= 0.5;
      L.intensity = on ? 3.2 : 0.05;
    }

    if (this.nightFactor > 0.2) {
      for (const m of this.windowMats) {
        const flick = 0.85 + Math.sin(t * 0.7 + m.id) * 0.12;
        m.emissiveIntensity = this.nightFactor * 1.25 * flick;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  private composer: EffectComposer | null = null;
  /** Subtle bloom for lamps, signs and lit shop windows (high quality only; street mode). */
  private bloom() {
    if (!Q.bloom || document.documentElement.classList.contains('gl-lost')) return null;
    if (!this.composer) {
      const size = this.renderer.getSize(new THREE.Vector2());
      const c = new EffectComposer(this.renderer);
      c.addPass(new RenderPass(this.scene, this.camera));
      c.addPass(new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.32, 0.45, 0.9));
      c.addPass(new OutputPass());
      this.composer = c;
    }
    return this.composer;
  }

  onResize() {
    this.composer?.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    // (CSS size stays 100% of the screen: a pixel width left over from the other orientation would make the phone
    // browser zoom the whole page out, shrinking the HUD into a corner)
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
  }

  dispose() {
    this.renderer.dispose();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
