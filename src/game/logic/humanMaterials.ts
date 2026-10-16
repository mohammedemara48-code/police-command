/**
 * Pure helpers for MakeHuman / UAL material polish.
 * Kept free of three.js so unit tests stay light.
 */

export type HumanMatRole = 'skin' | 'hair' | 'eye' | 'shoes' | 'cloth';

/** Classify a mesh material name for skin/face/hair polish. */
export function humanMatRole(name: string): HumanMatRole {
  const n = (name || '').trim();
  if (/^skin$/i.test(n)) return 'skin';
  if (/^hair$/i.test(n)) return 'hair';
  if (/(^|[_\s-])(eye|eyes|cornea|iris)($|[_\s-])/i.test(n) || /^(eye|eyes|cornea|iris)$/i.test(n)) return 'eye';
  if (/^shoes?$/i.test(n)) return 'shoes';
  return 'cloth';
}

/**
 * Kenney packs brighten a mapped material when recolored.
 * Realistic GLB humans keep the map as authored (no 1.2× boost).
 */
export function shouldBrightenRecolor(hasMap: boolean, isRealisticGlb: boolean): boolean {
  return !!hasMap && !isRealisticGlb;
}

/** Idle↔walk↔sprint cross-fade duration in seconds. */
export const LOCO_CROSSFADE = 0.3;

/** Speed EMA coefficient (higher = snappier; lower = softer). */
export const LOCO_SPEED_EMA = 5;
