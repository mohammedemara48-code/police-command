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
    // wheels
    const wheelMat = this.mat(0x111111);
    for (const [wx, wz] of [[-0.7, 1], [0.7, 1], [-0.7, -1], [0.7, -1]] as const) {
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.28, 12), wheelMat);
      wh.rotation.z = Math.PI / 2;
      wh.position.set(wx, 0.28, wz);
      g.add(wh);
    }
    return g;
  }

  private buildBank(x: number, z: number) {
    const bank = this.buildBuilding(x, z, 14, 9, 10, 0x3a4558, 'bank');
    // Columns
    for (let i = -2; i <= 2; i++) {
      const col = this.box(0.55, 4.5, 0.55, this.mat(0xd8dde8, { metalness: 0.35, roughness: 0.4 }), i * 2.2, 2.25, 5.2);
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
      [-40, -40], [-40, -12], [-40, 18], [-40, 40],
      [40, -40], [40, -12], [40, 22], [40, 40],
      [-16, -42], [16, -42], [-16, 42], [16, 42]
    ];
    residPlots.forEach(([x, z], i) => {
      const h = 4 + (i % 4) * 1.8;
      this.buildBuilding(x, z, 8 + (i % 3), h, 8, residentialColors[i % residentialColors.length], 'residential');
    });

    // Commercial towers
    const comPlots = [
      [-18, -18], [18, -18], [-18, 18], [18, 22],
      [-50, 0], [50, 0], [0, -50], [0, 50]
    ];
    comPlots.forEach(([x, z], i) => {
      const h = 10 + (i % 5) * 3.5;
      this.buildBuilding(x, z, 7 + (i % 2) * 2, h, 7, commercialColors[i % commercialColors.length], 'commercial');
    });

    // Fill voids with mid blocks
    const fillers: Array<[number, number]> = [
      [-22, -32], [22, -32], [-32, 22], [24, 32],
      [-48, -28], [48, 28], [-24, 8], [24, -8],
      [-8, -36], [8, 36], [-36, -8], [36, 8]
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
    for (const [x, z] of positions) {
      if (Math.hypot(x, z) < 12) continue;
      const pole = this.box(0.18, 4.5, 0.18, this.mat(0x333333), x, 2.25, z);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x556066,
        emissive: 0xffc067,
        emissiveIntensity: 0.02
      });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), mat);
      lamp.position.set(x, 4.6, z);
      // Arm / hood
      const arm = this.box(0.9, 0.08, 0.18, this.mat(0x2a2a2a), x + 0.35, 4.45, z);
      const light = new THREE.PointLight(0xffc067, 0, 20, 2);
      light.position.set(x, 4.35, z);
      this.root.add(pole, arm, lamp, light);
      this.streetLamps.push({ lamp, light, mat });
    }
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
      [-54, 2],
      [-46, 16]
    ] as const) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.add(this.box(0.55, 11, 0.55, this.mat(0xc4552a), 0, 5.5, 0));
      g.add(this.box(8, 0.4, 0.45, this.mat(0xe07a32), 3, 11, 0));
      g.add(this.box(0.16, 3.2, 0.16, this.mat(0x222222), 6.2, 9.2, 0));
      this.root.add(g);
    }

    for (const [x, z] of [
      [-46, -36],
      [-34, -48]
    ] as const) {
      this.root.add(this.box(1.5, 9, 1.5, this.mat(0x6a5a4a), x, 4.5, z));
    }

    const pier = this.box(16, 0.2, 6, this.mat(0x8a7048, { roughness: 0.8 }), -58, 0.12, 8);
    this.root.add(pier);

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
      { id: 'bank-1', name: 'البنك المركزي', kind: 'bank', zone: ZoneType.Bank, x: -28, z: -18, districtId: 'downtown' },
      { id: 'bank-2', name: 'البنك التجاري', kind: 'bank', zone: ZoneType.Bank, x: 32, z: 14, districtId: 'suburb' },
      { id: 'res-1', name: 'حي النخيل', kind: 'residential', zone: ZoneType.Residential, x: -40, z: -12, districtId: 'port' },
      { id: 'res-2', name: 'حي الروضة', kind: 'residential', zone: ZoneType.Residential, x: 40, z: 22, districtId: 'suburb' },
      { id: 'com-1', name: 'المجمع التجاري', kind: 'commercial', zone: ZoneType.Commercial, x: 18, z: -18, districtId: 'downtown' },
      { id: 'com-2', name: 'برج الأعمال', kind: 'commercial', zone: ZoneType.Downtown, x: -18, z: 18, districtId: 'downtown' },
      { id: 'st-1', name: 'تقاطع الشمال', kind: 'street', zone: ZoneType.Street, x: 0, z: 28, districtId: 'corniche' },
      { id: 'st-2', name: 'تقاطع الجنوب', kind: 'street', zone: ZoneType.Street, x: 0, z: -28, districtId: 'industrial' },
      { id: 'st-3', name: 'الطريق الشرقي', kind: 'street', zone: ZoneType.Street, x: 28, z: 0, districtId: 'suburb' },
      { id: 'st-4', name: 'الطريق الغربي', kind: 'street', zone: ZoneType.Street, x: -28, z: 0, districtId: 'port' }
    ];
  }

  private spawnFleetCars() {
    const spots: Array<[number, number, number]> = [
      [8, 0, 8], [-10, 0, 6], [12, 0, -8], [-14, 0, -10], [6, 0, -16]
    ];
    spots.forEach(([x, , z], i) => {
      const car = this.makePoliceCar();
      car.position.set(x, 0.05, z);
      car.userData.unitId = `fleet-${i}`;
      this.carRoot.add(car);
      this.unitCars.set(`fleet-${i}`, car);
    });
  }

  focusOn(x: number, z: number, close = false) {
    this.flyTo(x, z, close);
  }

  /** Smooth camera move so the street, not just the map pin, fills the view. */
  flyTo(x: number, z: number, close = false) {
    this.fly.active = true;
    this.fly.t = 0;
    this.fly.dur = close ? 1.05 : 1.35;
    this.fly.fromPos.copy(this.camera.position);
    this.fly.fromTarget.copy(this.controls.target);
    const dist = close ? 14 : 26;
    const height = close ? 9.5 : 20;
    this.fly.toTarget.set(x, 1.4, z);
    this.fly.toPos.set(x + dist * 0.45, height, z + dist * 0.85);
    this.cameraLock = true;
    this.controls.enabled = false;
  }

  beginAction(heat: ActionHeat, x: number, z: number) {
    this.endAction(false);
    this.action = { active: true, heat, x, z, next: 0 };
    this.cameraLock = true;
    this.controls.enabled = false;
    const spots: Array<[number, number]> = [
      [x + 14, z + 6],
      [x - 12, z + 10]
    ];
    if (heat === 'hot') spots.push([x + 4, z - 16]);
    spots.forEach(([sx, sz], i) => {
      const car = this.makePoliceCar(i === 0 ? 0x102040 : 0xf4f7fb);
      car.position.set(sx, 0.05, sz);
      car.userData.flashing = true;
      car.lookAt(x, 0.05, z);
      this.carRoot.add(car);
      if (car.userData.lights) this.flashLights.push(...car.userData.lights);
      this.actionCars.push({ mesh: car, tx: x + (i - 1) * 2.4, tz: z + 3.2 });
    });
  }

  endAction(unlock = true) {
    this.action.active = false;
    for (const c of this.actionCars) {
      c.mesh.userData.flashing = false;
      this.carRoot.remove(c.mesh);
    }
    this.actionCars = [];
    if (unlock && !this.fly.active) {
      this.cameraLock = false;
      this.controls.enabled = true;
    }
  }

  private spawnMuzzle(x: number, y: number, z: number, color = 0xfff1c4) {
    const mesh = new THREE.Mesh(this.muzzleGeo, this.muzzleMat);
    mesh.position.set(x, y, z);
    const light = new THREE.PointLight(color, 14, 16, 2);
    light.position.set(x, y, z);
    this.scene.add(mesh, light);
    this.fx.push({ obj: mesh, light, life: 0.07, max: 0.07 });
  }

  private spawnTracer(x: number, z: number) {
    const y = 1.35 + Math.random() * 0.8;
    const a = new THREE.Vector3(x + (Math.random() - 0.5) * 5, y, z + (Math.random() - 0.5) * 5);
    const b = a.clone().add(
      new THREE.Vector3((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 7)
    );
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const mat = new THREE.LineBasicMaterial({
      color: Math.random() > 0.25 ? 0xfff6cf : 0xff5533,
      transparent: true,
      opacity: 0.95
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.fx.push({ obj: line, life: 0.11, max: 0.11 });
  }

  private spawnQuietPulse(x: number, z: number) {
    const light = new THREE.PointLight(0x3aa0ff, 3.5, 14, 2);
    light.position.set(x, 2.2, z);
    this.scene.add(light);
    this.fx.push({ obj: light, light, life: 0.35, max: 0.35 });
  }

  private stepAction(dt: number) {
    if (!this.action.active) return;
    const t = this.clock.elapsedTime;
    for (const c of this.actionCars) {
      const pos = c.mesh.position;
      const dx = c.tx - pos.x;
      const dz = c.tz - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.4) {
        const step = Math.min(dist, 22 * dt);
        pos.x += (dx / dist) * step;
        pos.z += (dz / dist) * step;
        c.mesh.rotation.y = Math.atan2(dx, dz);
      }
    }
    if (t < this.action.next) return;
    const { heat, x, z } = this.action;
    if (heat === 'quiet') {
      this.spawnQuietPulse(x + (Math.random() - 0.5) * 2, z + (Math.random() - 0.5) * 2);
      this.action.next = t + 0.55;
      return;
    }
    const n = heat === 'hot' ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const mx = x + (Math.random() - 0.5) * 4.5;
      const mz = z + (Math.random() - 0.5) * 4.5;
      this.spawnMuzzle(mx, 1.5 + Math.random() * 1.2, mz, heat === 'hot' ? 0xffe7a0 : 0xffc14d);
      this.spawnTracer(x, z);
    }
