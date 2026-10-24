/** Small player preferences kept on the device (each change reloads or applies at once, see the settings panel). */
const get = <T extends string>(key: string, ok: readonly T[], def: T): T => {
  try {
    const v = localStorage.getItem(key) as T | null;
    if (v && ok.includes(v)) return v;
  } catch {
    /* ignore */
  }
  return def;
};
const put = (key: string, v: string) => {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* ignore */
  }
};

export type PaveStyle = 'redgrey' | 'beige';
const PAVE_KEY = 'pc.pave.v1';
/** downtown pavements: red and grey tiles (Cairo style) or the plain beige slabs everywhere */
export const paveStyle: PaveStyle =
  typeof localStorage === 'undefined' ? 'redgrey' : get<PaveStyle>(PAVE_KEY, ['redgrey', 'beige'], 'redgrey');
export function setPaveStyle(v: PaveStyle) {
  put(PAVE_KEY, v);
  location.reload();
}
