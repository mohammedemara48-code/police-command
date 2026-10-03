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
