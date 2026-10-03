import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ZoneType, type CityPOI, type Incident } from './types';

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
