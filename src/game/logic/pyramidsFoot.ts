/**
 * Footprints of the three Giza pyramids (pure): where they stand on the plateau at the scale they are drawn
 * (world/Pyramids.ts), so the lot planner keeps them solid and nothing drives through them.
 */
import type { OBB } from './collide';
import { toWorld, type LonLat } from './cairo';

/** drawn at about a third of true size, in step with the squeezed map */
export const PYRAMID_SCALE = 0.34;
/** real positions (OpenStreetMap) and base edge (m): Khufu, Khafre, Menkaure */
export const PYRAMIDS: readonly { at: LonLat; base: number; yaw: number }[] = [
  { at: [31.1342, 29.9792], base: 230.3, yaw: -0.02 },
  { at: [31.1308, 29.9758], base: 215.3, yaw: 0.012 },
  { at: [31.1287, 29.9725], base: 103.4, yaw: -0.02 }
];

export function pyramidBoxes(): OBB[] {
  return PYRAMIDS.map((p) => {
    const w = toWorld(p.at);
    // (a little inside the base edge: the drawn bases of Khufu and Khafre nearly touch on the squeezed map)
    const h = ((p.base * PYRAMID_SCALE) / 2) * 0.9;
    return { x: w.x, z: w.z, yaw: p.yaw, hw: h, hl: h };
  });
}
