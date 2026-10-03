    this.action.next = t + (heat === 'hot' ? 0.09 : 0.26);
  }

  private stepFx(dt: number) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.life -= dt;
      const k = Math.max(0, f.life / f.max);
      if (f.light) f.light.intensity = 14 * k;
      const mat = (f.obj as THREE.Line).material as THREE.Material | undefined;
      if (mat && (mat as THREE.Material & { transparent?: boolean }).transparent && 'opacity' in mat) {
        (mat as THREE.Material & { opacity: number }).opacity = k;
      }
      if (f.life <= 0) {
        this.scene.remove(f.obj);
        if (f.light && f.light !== f.obj) this.scene.remove(f.light);
        const geo = (f.obj as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
        if (geo && geo !== this.muzzleGeo) geo.dispose();
        if (f.obj !== f.light) {
          const m = (f.obj as THREE.Mesh).material as THREE.Material | undefined;
          if (m && m !== this.muzzleMat) m.dispose();
        }
        this.fx.splice(i, 1);
      }
    }
  }

  private stepFly(dt: number) {
    if (!this.fly.active) return;
    this.fly.t += dt / this.fly.dur;
    const k = Math.min(1, this.fly.t);
    const s = k * k * (3 - 2 * k);
    this.camera.position.lerpVectors(this.fly.fromPos, this.fly.toPos, s);
    this.controls.target.lerpVectors(this.fly.fromTarget, this.fly.toTarget, s);
    if (k >= 1) {
      this.fly.active = false;
      this.camera.position.copy(this.fly.toPos);
      this.controls.target.copy(this.fly.toTarget);
      if (!this.action.active) {
        this.cameraLock = false;
        this.controls.enabled = true;
        this.controls.update();
      }
    }
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
      { h: 13, sky: 0x5a9cd8, fog: 0x7eb0e0, sun: 0xfff8e8, hemiSky: 0xc8e0ff, hemiGround: 0x506048 },
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

    (this.scene.background as THREE.Color).copy(sample.sky);
    if (this.scene.fog && this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(sample.fog);
      this.scene.fog.density = 0.0038 + this.nightFactor * 0.0055;
    }

    this.hemi.color.copy(sample.hemiSky);
    this.hemi.groundColor.copy(sample.hemiGround);
    this.hemi.intensity = 0.55 + day * 0.55;

    this.sun.color.copy(sample.sun);
    this.sun.intensity = 0.25 + day * 1.25 + (hour > 5 && hour < 8 ? 0.15 : 0);
    const azim = ((hour - 6) / 24) * Math.PI * 2;
    const y = Math.max(6, 12 + elev * 62);
    this.sun.position.set(Math.cos(azim) * 55, y, Math.sin(azim) * 40);
    this.sun.castShadow = elev > -0.15;

    this.ambient.color.set(day > 0.4 ? 0xc8d8e8 : 0x1a2840);
    this.ambient.intensity = 0.22 + day * 0.35 + this.nightFactor * 0.12;

    this.renderer.toneMappingExposure = 0.95 + day * 0.18 + this.nightFactor * 0.12;

    this.groundMat.color.lerpColors(new THREE.Color(0x3a4a42), new THREE.Color(0x141c26), this.nightFactor);
    this.roadMat.color.lerpColors(new THREE.Color(0x4a4f58), new THREE.Color(0x1a1f28), this.nightFactor);

    for (const lm of this.lineMats) {
      lm.emissiveIntensity = 0.08 + this.nightFactor * 0.45;
    }

    if (this.gridHelper) {
      const gm = this.gridHelper.material as THREE.Material | THREE.Material[];
      const mats = Array.isArray(gm) ? gm : [gm];
      for (const m of mats) m.opacity = 0.12 + this.nightFactor * 0.28;
    }

    const lampOn = THREE.MathUtils.smoothstep(this.nightFactor, 0.25, 0.7);
    for (const sl of this.streetLamps) {
      sl.light.intensity = lampOn * 1.55;
      sl.mat.emissiveIntensity = lampOn * 1.65;
      sl.mat.color.set(lampOn > 0.3 ? 0xffe0a0 : 0x556066);
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

  syncIncidents(incidents: Incident[]) {
    const activeIds = new Set(incidents.filter((i) => i.status !== 'resolved' && i.status !== 'failed').map((i) => i.id));

    for (const [id, g] of this.incidentMarkers) {
      if (!activeIds.has(id)) {
        this.markerRoot.remove(g);
        this.incidentMarkers.delete(id);
        const spr = this.labelSprites.get(id);
        if (spr) {
          this.markerRoot.remove(spr);
          this.labelSprites.delete(id);
        }
      }
    }

    for (const inc of incidents) {
      if (inc.status === 'resolved' || inc.status === 'failed') continue;
      let g = this.incidentMarkers.get(inc.id);
      if (!g) {
        g = this.createIncidentMarker(inc);
        this.incidentMarkers.set(inc.id, g);
        this.markerRoot.add(g);
        const label = this.createTextSprite(`${inc.title} — نشط`, '#ff4d6d');
        label.position.set(inc.x, 6.5, inc.z);
        label.userData.labelText = `${inc.title} — نشط`;
        label.userData.labelColor = '#ff4d6d';
        this.labelSprites.set(inc.id, label);
        this.markerRoot.add(label);

        for (let i = 0; i < Math.min(3, 1 + Math.floor(inc.severity / 2)); i++) {
          const car = this.makePoliceCar(i === 0 ? 0x111111 : 0x1a3a6e);
          car.userData.flashing = true;
          car.position.set(inc.x + (i - 1) * 3.2, 0.05, inc.z + 3.5);
          car.rotation.y = Math.PI * (0.1 * i);
          g.add(car);
          this.flashLights.push(...(car.userData.lights || []));
        }
      }
      g.position.set(inc.x, 0, inc.z);
      const selected = this.selectedIncidentId === inc.id;
      g.userData.selected = selected;
      const ring = g.userData.ring as THREE.Mesh | undefined;
      if (ring) {
        (ring.material as THREE.MeshBasicMaterial).color.setHex(selected ? 0xffd24d : 0xff3355);
        ring.scale.setScalar(selected ? 1.25 : 1);
      }
      const spr = this.labelSprites.get(inc.id);
      if (spr) {
        spr.position.set(inc.x, selected ? 7.2 : 6.5, inc.z);
        spr.scale.set(selected ? 9.5 : 8, selected ? 2.4 : 2, 1);
      }
    }
  }

  setSelectedIncident(id: string | null) {
    this.selectedIncidentId = id;
  }

  updateIncidentLabel(id: string, text: string, color = '#ff4d6d') {
    const old = this.labelSprites.get(id);
    if (!old) return;
    if (old.userData.labelText === text && old.userData.labelColor === color) return;
    const pos = old.position.clone();
    this.markerRoot.remove(old);
    (old.material as THREE.SpriteMaterial).map?.dispose();
    (old.material as THREE.Material).dispose();
    const label = this.createTextSprite(text, color);
    label.position.copy(pos);
    label.userData.labelText = text;
    label.userData.labelColor = color;
    this.labelSprites.set(id, label);
    this.markerRoot.add(label);
  }

  private createIncidentMarker(inc: Incident) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 2.8, 40),
      new THREE.MeshBasicMaterial({ color: 0xff3355, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.12;
    g.add(ring);

    const beacon = new THREE.PointLight(0xff2244, 2.5, 22, 2);
    beacon.position.set(0, 4, 0);
    g.add(beacon);
    g.userData.beacon = beacon;
    g.userData.ring = ring;
    g.userData.severity = inc.severity;

    if (inc.severity >= 4) {
      const pin = this.createTextSprite('SWAT', '#7b61ff');
      pin.position.set(3.5, 4.2, 1);
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
