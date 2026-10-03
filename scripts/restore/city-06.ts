      m.color.set(this.nightFactor > 0.35 ? 0xffe0a0 : 0x6a7a88);
    }

    for (const a of this.accentLights) {
      a.light.intensity = a.dayI * day + a.nightI * this.nightFactor;
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

        // scene cars at incident
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

    // floating pins for SWAT / perimeter style
    if (inc.severity >= 4) {
      const pin = this.createTextSprite('SWAT', '#7b61ff');
      pin.position.set(3.5, 4.2, 1);
