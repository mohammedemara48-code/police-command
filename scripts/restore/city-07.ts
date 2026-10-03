      g.add(pin);
      const pin2 = this.createTextSprite('تأمين المحيط', '#3aa0ff');
      pin2.position.set(-3.5, 3.8, -1);
      g.add(pin2);
    }
    return g;
  }

  createTextSprite(text: string, color = '#ffffff') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 512, 128);
    // glass pill
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

  /** Move a unit car toward incident; returns true when arrived */
  driveUnitToward(unitId: string, x: number, z: number, speed: number, dt: number): boolean {
    let car = this.unitCars.get(unitId);
    if (!car) {
      car = this.makePoliceCar();
      car.position.set(this.hqPosition.x + 4, 0.05, this.hqPosition.z + 8);
      car.userData.unitId = unitId;
      car.userData.flashing = true;
      this.carRoot.add(car);
      this.unitCars.set(unitId, car);
      if (car.userData.lights) this.flashLights.push(...car.userData.lights);
    }
    car.userData.flashing = true;
    const pos = car.position;
    const dx = x - pos.x;
    const dz = z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.2) return true;
    const step = Math.min(dist, speed * dt);
    pos.x += (dx / dist) * step;
    pos.z += (dz / dist) * step;
    car.rotation.y = Math.atan2(dx, dz);
    return false;
  }

  update(dt: number) {
    this.controls.update();
    const t = this.clock.elapsedTime;

    // helicopter rotors
    if (this.helo?.userData.rotors) {
      for (const r of this.helo.userData.rotors as THREE.Object3D[]) {
        r.rotation.y += dt * 18;
      }
      this.helo.position.y = 12.2 + Math.sin(t * 1.5) * 0.08;
    }

    // flash lights
    const pulse = (Math.sin(t * 14) + 1) * 0.5;
    for (let i = 0; i < this.flashLights.length; i++) {
      const L = this.flashLights[i];
      const on = i % 2 === 0 ? pulse > 0.5 : pulse <= 0.5;
      L.intensity = on ? 3.2 : 0.05;
    }

    // incident rings pulse
    for (const g of this.incidentMarkers.values()) {
      const ring = g.userData.ring as THREE.Mesh | undefined;
      if (ring) {
        const s = 1 + Math.sin(t * 4) * 0.08;
        ring.scale.set(s, s, s);
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(t * 5) * 0.25;
      }
      const beacon = g.userData.beacon as THREE.PointLight | undefined;
      if (beacon) beacon.intensity = 1.5 + Math.sin(t * 6) * 1.2;
    }

    // Window flicker rides nightFactor inside applyTimeOfDay
    if (this.nightFactor > 0.2) {
      for (const m of this.windowMats) {
        const flick = 0.85 + Math.sin(t * 0.7 + m.id) * 0.12;
        m.emissiveIntensity = this.nightFactor * 1.25 * flick;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  dispose() {
    this.renderer.dispose();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
