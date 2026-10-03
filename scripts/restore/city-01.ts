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

