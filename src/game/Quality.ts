export type Quality = 'low' | 'medium' | 'high';
const KEY = 'pc.quality.v1';

function detect(): Quality {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mobile = matchMedia('(pointer:coarse)').matches;
  if ((nav.deviceMemory ?? 8) <= 3 || (mobile && (nav.hardwareConcurrency ?? 8) <= 4)) return 'low';
  return mobile ? 'medium' : 'high';
}

export const quality: Quality = (() => {
  try {
    const q = localStorage.getItem(KEY);
    if (q === 'low' || q === 'medium' || q === 'high') return q;
  } catch { /* ignore */ }
  return detect();
})();

export function setQuality(q: Quality) {
  try { localStorage.setItem(KEY, q); } catch { /* ignore */ }
  location.reload();
}

export const Q = {
  pixelRatio: quality === 'low' ? 1 : quality === 'medium' ? 1.5 : 2,
  antialias: quality !== 'low',
  shadows: quality !== 'low',
  shadowMap: quality === 'high' ? 2048 : 1024,
  particles: quality === 'low' ? 0.3 : quality === 'medium' ? 0.7 : 1,
  /** LOD: on low quality, crowds/traffic use the light Kenney models; the player officer and patrol car stay realistic. */
  lowDetailPeople: quality === 'low',
  rain: quality === 'low' ? 250 : quality === 'medium' ? 450 : 700
};
