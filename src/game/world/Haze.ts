/**
 * Distant landmarks (Cairo Tower) sit beyond what the scene fog can show, so they carry their own haze:
 * the colour is dimmed and the haze colour added as emissive light. The street scene feeds the current haze colour.
 */
import * as THREE from 'three';

interface Entry {
  m: THREE.MeshStandardMaterial;
  color: THREE.Color;
  emissive: THREE.Color;
  mix: number;
}
const entries: Entry[] = [];
const haze = new THREE.Color(0xd6c9b0);
let daylight = 1;

/** Take a material out of the scene fog and haze it by `mix` (0..1). */
export function hazed<T extends THREE.MeshStandardMaterial>(m: T, mix = 0.5): T {
  m.fog = false;
  entries.push({ m, color: m.color.clone(), emissive: m.emissive.clone(), mix });
  apply();
  return m;
}

function apply() {
  for (const e of entries) {
    e.m.color.copy(e.color).multiplyScalar(1 - e.mix * 0.55);
    const k = e.mix * 0.5 * Math.max(0.12, daylight);
    e.m.emissive.setRGB(e.emissive.r + haze.r * k, e.emissive.g + haze.g * k, e.emissive.b + haze.b * k);
  }
}

export function setHaze(c: THREE.Color, day: number) {
  haze.copy(c);
  daylight = day;
  apply();
}
