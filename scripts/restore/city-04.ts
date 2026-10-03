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

  private registerPOIs() {
    this.pois = [
      { id: 'hq', name: 'مركز القيادة', kind: 'hq', zone: ZoneType.HQ, x: 0, z: 0 },
      { id: 'bank-1', name: 'البنك المركزي', kind: 'bank', zone: ZoneType.Bank, x: -28, z: -18 },
      { id: 'bank-2', name: 'البنك التجاري', kind: 'bank', zone: ZoneType.Bank, x: 32, z: 14 },
      { id: 'res-1', name: 'حي النخيل', kind: 'residential', zone: ZoneType.Residential, x: -40, z: -12 },
      { id: 'res-2', name: 'حي الروضة', kind: 'residential', zone: ZoneType.Residential, x: 40, z: 22 },
      { id: 'com-1', name: 'المجمع التجاري', kind: 'commercial', zone: ZoneType.Commercial, x: 18, z: -18 },
      { id: 'com-2', name: 'برج الأعمال', kind: 'commercial', zone: ZoneType.Downtown, x: -18, z: 18 },
      { id: 'st-1', name: 'تقاطع الشمال', kind: 'street', zone: ZoneType.Street, x: 0, z: 28 },
      { id: 'st-2', name: 'تقاطع الجنوب', kind: 'street', zone: ZoneType.Street, x: 0, z: -28 },
      { id: 'st-3', name: 'الطريق الشرقي', kind: 'street', zone: ZoneType.Street, x: 28, z: 0 },
      { id: 'st-4', name: 'الطريق الغربي', kind: 'street', zone: ZoneType.Street, x: -28, z: 0 }
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

  focusOn(x: number, z: number) {
    this.controls.target.set(x, 2, z);
  }

  /** Drive cinematic day→dusk→night→dawn from in-game city hour (0–24). */
  setTimeOfDay(hour: number) {
    this.cityHour = ((hour % 24) + 24) % 24;
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
    // Keyframes: hour → sky, fog, sunColor, hemiSky, hemiGround
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
      { h: 6.5, sky: 0x7eb0e0, fog: 0x9ec4e8, sun: 0xffe0b0, hemiSky: 0xb0d0f0, hemiGround: 0x4a5a48 },
      { h: 10, sky: 0x6aa8e0, fog: 0x8ebce8, sun: 0xfff2d8, hemiSky: 0xc0dcff, hemiGround: 0x4a5a42 },
