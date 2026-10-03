import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DISTRICTS, ZoneType, type ActionHeat, type CityPOI, type Incident } from './types';

type CarMesh = THREE.Group & { userData: { unitId?: string; flashing?: boolean; lights?: THREE.PointLight[] } };

export class CityScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  root = new THREE.Group();
  markerRoot = new THREE.Group();
  carRoot = new THREE.Group();
  labelSprites = new Map<string, THREE.Sprite>();
  incidentMarkers = new Map<string, THREE.Group>();
  selectedIncidentId: string | null = null;
  unitCars = new Map<string, CarMesh>();
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
  private streetLamps: Array<{
    lamp: THREE.Mesh;
    light: THREE.PointLight;
    mat: THREE.MeshStandardMaterial;
  }> = [];
  private accentLights: Array<{ light: THREE.PointLight; dayI: number; nightI: number }> = [];
  private cityHour = 8;
  private nightFactor = 0;
  private lineMats: THREE.MeshStandardMaterial[] = [];
  private waterMat: THREE.MeshStandardMaterial | null = null;
  private cameraLock = false;
  private fly = {
    active: false,
    t: 0,
    dur: 1.2,
    fromPos: new THREE.Vector3(),
    toPos: new THREE.Vector3(),
    fromTarget: new THREE.Vector3(),
    toTarget: new THREE.Vector3()
  };
  private action: { active: boolean; heat: ActionHeat; x: number; z: number; next: number } = {
    active: false,
    heat: 'quiet',
    x: 0,
    z: 0,
    next: 0
  };
  private fx: Array<{ obj: THREE.Object3D; life: number; max: number; light?: THREE.PointLight }> = [];
  private actionCars: Array<{ mesh: CarMesh; tx: number; tz: number }> = [];
  private muzzleGeo = new THREE.SphereGeometry(0.22, 8, 8);
  private muzzleMat = new THREE.MeshBasicMaterial({ color: 0xfff1c4 });

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x7eb6e8);
    this.scene.fog = new THREE.FogExp2(0x9ec4e8, 0.0045);

    this.camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 400);
    this.camera.position.set(42, 38, 48);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.minDistance = 18;
    this.controls.maxDistance = 110;
    this.controls.target.set(0, 2, 0);

    this.scene.add(this.root);
    this.scene.add(this.markerRoot);
    this.scene.add(this.carRoot);

    this.buildLighting();
    this.buildCity();
    this.spawnFleetCars();
    this.setTimeOfDay(8);

    window.addEventListener('resize', () => this.onResize());
  }

  private buildLighting() {
    this.hemi = new THREE.HemisphereLight(0xb8d4f0, 0x3a4a38, 0.95);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff0d0, 1.35);
    this.sun.position.set(40, 70, 20);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
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

  private buildBuilding(
    x: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: number,
    name?: string
  ) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const body = this.box(w, h, d, this.mat(color, { roughness: 0.65, metalness: 0.25 }), 0, h / 2, 0);
    g.add(body);
    // roof cap
    g.add(this.box(w + 0.3, 0.25, d + 0.3, this.mat(0x0d1520), 0, h + 0.1, 0));
    this.addWindows(g, w, h, d, 0);
    if (name) g.name = name;
    this.root.add(g);
    return g;
  }

  private buildHQ() {
    const hq = new THREE.Group();
    hq.position.set(0, 0, 0);
    this.hqPosition.set(0, 0, 0);

    // Main block
    const concrete = this.mat(0x2a3548, { roughness: 0.55, metalness: 0.3 });
    const accent = this.mat(0x1e90ff, { emissive: 0x0a3a80, emissiveIntensity: 0.45, metalness: 0.5 });
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
    const H = this.box(3.2, 0.05, 0.45, this.mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.3 }), 0, 11.75, 0);
    const Hbar = this.box(0.45, 0.05, 3.2, this.mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.3 }), 0, 11.75, 0);
    hq.add(H, Hbar);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3.2, 3.6, 48),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x88aacc, emissiveIntensity: 0.4, side: THREE.DoubleSide })
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
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 12), new THREE.MeshStandardMaterial({
      color: 0xff3344, emissive: 0xff0000, emissiveIntensity: 1.2
    }));
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
