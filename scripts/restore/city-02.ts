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
    const rotor = this.box(5.5, 0.05, 0.25, this.mat(0x333333), 0, 1.6, 0);
    const rotor2 = this.box(0.25, 0.05, 5.5, this.mat(0x333333), 0, 1.61, 0);
