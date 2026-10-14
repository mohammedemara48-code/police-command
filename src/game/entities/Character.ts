/** Runtime store for the officer's look + weapon: localStorage, change listeners, account sync hooks. */
import { CHAR_KEY, sanitizeChar, type Character } from '../logic/character';

function read(): Character | null {
  try {
    const s = localStorage.getItem(CHAR_KEY);
    return s ? sanitizeChar(JSON.parse(s)) : null;
  } catch {
    return null;
  }
}
let cur = read();
const subs: ((c: Character) => void)[] = [];

/** True until the player has made (or synced) a character. */
export const needsCharacter = () => !cur;
export const character = () => cur ?? sanitizeChar(null);
export const onCharacter = (f: (c: Character) => void) => subs.push(f);

export function setCharacter(c: Character, edited = true) {
  cur = sanitizeChar({ ...c, t: edited ? Date.now() : c.t });
  try {
    localStorage.setItem(CHAR_KEY, JSON.stringify(cur));
  } catch {
    /* private mode */
  }
  subs.forEach((f) => f(cur!));
}
/** for account sync: null when this device never made one */
export const storedCharacter = () => cur;
