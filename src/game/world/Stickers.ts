/** Rear-window slogans for the patrol car and the microbuses: one small canvas texture per distinct text. */
import * as THREE from 'three';

const cache = new Map<string, THREE.MeshBasicMaterial>();

function material(text: string, ink: string, fill: string) {
  const key = `${text}|${ink}|${fill}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 112;
  const x = c.getContext('2d')!;
  x.fillStyle = fill;
  x.beginPath();
  x.roundRect(4, 4, 504, 104, 26);
  x.fill();
  x.fillStyle = ink;
  x.font = 'bold 62px Cairo, Arial, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.direction = 'rtl';
  x.fillText(text, 256, 60, 470);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshBasicMaterial({
    map: t,
    transparent: true,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2
  });
  cache.set(key, m);
  return m;
}

/**
 * A slogan plaque facing backwards (towards -z, the rear of a car whose nose points to +z).
 * `rearZ` is where the rear surface is, `y` the height of the plaque centre.
 */
export function rearSticker(
  text: string,
  width: number,
  rearZ: number,
  y: number,
  style: { ink: string; fill: string } = { ink: '#000000', fill: 'rgba(255,240,180,0.95)' }
) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, width * (112 / 512)), material(text, style.ink, style.fill));
  m.position.set(0, y, rearZ);
  m.rotation.y = Math.PI;
  m.userData.keep = true;
  return m;
}
