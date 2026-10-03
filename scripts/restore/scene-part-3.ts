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
    this.stepFly(dt);
    this.stepAction(dt);
    this.stepFx(dt);
    if (!this.cameraLock) this.controls.update();
    const t = this.clock.elapsedTime;

    if (this.helo?.userData.rotors) {
      for (const r of this.helo.userData.rotors as THREE.Object3D[]) {
        r.rotation.y += dt * 18;
      }
      this.helo.position.y = 12.2 + Math.sin(t * 1.5) * 0.08;
    }

    const pulse = (Math.sin(t * 14) + 1) * 0.5;
    for (let i = 0; i < this.flashLights.length; i++) {
      const L = this.flashLights[i];
      const on = i % 2 === 0 ? pulse > 0.5 : pulse <= 0.5;
      L.intensity = on ? 3.2 : 0.05;
    }

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
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
