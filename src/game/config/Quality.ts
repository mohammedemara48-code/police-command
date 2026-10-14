export type Quality = 'low' | 'medium' | 'high';
const KEY = 'pc.quality.v1';

function detect(): Quality {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mobile = matchMedia('(pointer:coarse)').matches;
  // Phones default to low: real devices showed multi-second input delay at medium.
  if (mobile || (nav.deviceMemory ?? 8) <= 4) return 'low';
  return (nav.hardwareConcurrency ?? 8) <= 4 ? 'medium' : 'high';
}

export const quality: Quality = (() => {
  try {
    const q = localStorage.getItem(KEY);
    if (q === 'low' || q === 'medium' || q === 'high') return q;
  } catch {
    /* ignore */
  }
  return detect();
})();

export function setQuality(q: Quality) {
  try {
    localStorage.setItem(KEY, q);
  } catch {
    /* ignore */
  }
  location.reload();
}

export const Q = {
  pixelRatio: quality === 'low' ? 0.9 : quality === 'medium' ? 1.25 : 1.75,
  antialias: quality !== 'low',
  shadows: quality !== 'low',
  shadowMap: quality === 'high' ? 2048 : 1024,
  /** max simultaneous animated characters updated per frame */
  animBudget: quality === 'low' ? 6 : 40,
  particles: quality === 'low' ? 0.3 : quality === 'medium' ? 0.7 : 1,
  /** LOD: on low quality, crowds/traffic use the light Kenney models; the player officer and patrol car stay realistic. */
  lowDetailPeople: quality === 'low',
  /** real street-lamp PointLights in the command-center city */
  lampLights: quality === 'low' ? 0 : quality === 'medium' ? 3 : 6,
  rain: quality === 'low' ? 120 : quality === 'medium' ? 450 : 700,
  /** image-based lighting from the sky HDRI */
  hdri: quality !== 'low',
  /** reflective sea shader (extra render pass) */
  water: quality === 'high',
  /** subtle bloom on lamps, signs and shop windows */
  bloom: quality === 'high'
};
