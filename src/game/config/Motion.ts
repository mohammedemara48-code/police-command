/** Reduced-motion preference: saved choice, else the OS setting (prefers-reduced-motion). */
const KEY = 'pc.motion.v1';
function read(): boolean {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'reduce') return true;
    if (v === 'full') return false;
  } catch {
    /* ignore */
  }
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}
export let reducedMotion = read();
document.documentElement.classList.toggle('reduce-motion', reducedMotion);
export function setReducedMotion(on: boolean) {
  reducedMotion = on;
  try {
    localStorage.setItem(KEY, on ? 'reduce' : 'full');
  } catch {
    /* ignore */
  }
  document.documentElement.classList.toggle('reduce-motion', on);
}
