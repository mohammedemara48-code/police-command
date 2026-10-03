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
    // Sun elevation: +1 noon, 0 at ~6/18, -1 midnight
    const elev = Math.sin(((hour - 6) / 24) * Math.PI * 2);
    // nightFactor 0 at bright day, 1 deep night — soft dusk shoulders
    this.nightFactor = THREE.MathUtils.clamp(0.55 - elev * 0.65, 0, 1);
    const day = 1 - this.nightFactor;
    const sample = this.sampleSky(hour);

    (this.scene.background as THREE.Color).copy(sample.sky);
    if (this.scene.fog && this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(sample.fog);
      // denser fog at night for cinematic depth, clearer day for readable streets
      this.scene.fog.density = 0.0038 + this.nightFactor * 0.0055;
    }

    this.hemi.color.copy(sample.hemiSky);
    this.hemi.groundColor.copy(sample.hemiGround);
    this.hemi.intensity = 0.55 + day * 0.55;

    this.sun.color.copy(sample.sun);
    this.sun.intensity = 0.25 + day * 1.25 + (hour > 5 && hour < 8 ? 0.15 : 0);
    // Orbit sun / moon
    const azim = ((hour - 6) / 24) * Math.PI * 2;
    const y = Math.max(6, 12 + elev * 62);
    this.sun.position.set(Math.cos(azim) * 55, y, Math.sin(azim) * 40);
    this.sun.castShadow = elev > -0.15;

    this.ambient.color.set(day > 0.4 ? 0xc8d8e8 : 0x1a2840);
    this.ambient.intensity = 0.22 + day * 0.35 + this.nightFactor * 0.12;

    // Exposure: avoid crushed blacks at night, keep streets readable by day
    this.renderer.toneMappingExposure = 0.95 + day * 0.18 + this.nightFactor * 0.12;

    // Ground / roads
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

    // Street lamps on from dusk
    const lampOn = THREE.MathUtils.smoothstep(this.nightFactor, 0.25, 0.7);
    for (const sl of this.streetLamps) {
      sl.light.intensity = lampOn * 1.55;
      sl.mat.emissiveIntensity = lampOn * 1.65;
      sl.mat.color.set(lampOn > 0.3 ? 0xffe0a0 : 0x556066);
    }

    // Building windows glow at night
    for (const m of this.windowMats) {
      const flick = 0.85 + Math.sin(this.clock.elapsedTime * 0.7 + m.id) * 0.12;
      m.emissiveIntensity = this.nightFactor * 1.25 * flick;
