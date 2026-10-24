/**
 * What a Cairo street person wears: galabeya, abaya, hijab, taqiyah, a cane for the old, a school bag for students,
 * skin and hair tones. Pure and seeded so the same person always looks the same (tests stay light).
 */

export type OutfitRole =
  'pedestrian' | 'woman' | 'elder' | 'kid' | 'student' | 'vendor' | 'shopkeeper' | 'ahwa' | 'passenger' | (string & {});

export interface Outfit {
  /** long robe colour (galabeya for men, abaya for women), or none */
  robe: number | null;
  /** headscarf colour, or none */
  hijab: number | null;
  /** white/knitted skull cap (men) */
  cap: number | null;
  /** shirt / blouse colour when there is no robe */
  top: number;
  skin: number;
  hair: number;
  cane: boolean;
  backpack: number | null;
  /** vendor's bread tray or basket carried on the head */
  tray: boolean;
  female: boolean;
  /** a child: the renderer gives the head a child's proportion */
  kid?: boolean;
}

/** Egyptian skin tones as a multiplier over the MakeHuman skin texture (light Alexandrian to dark Upper Egyptian). */
export const SKINS = [0xffffff, 0xfaeee4, 0xf2e0cf, 0xe8d0b8, 0xdcbea2, 0xd0ae90];
export const HAIRS = [0x16100c, 0x2a1a10, 0x0e0e0e, 0x3a2616, 0x4a2f1c];
const GREY = [0xbdbdbd, 0xd6d6d6, 0x9a9a9a];
/** galabeya: white, off-white, grey, light blue, beige, brown, navy, striped-ish dark green */
export const GALABEYA = [0xf2f0ea, 0xe4dccb, 0x9da3a6, 0x9fb7c9, 0xc8b48f, 0x6e5440, 0x2b3550, 0x4b5a48, 0x7d7f86];
/** abaya: mostly black, some navy / dark brown / olive */
export const ABAYA = [0x141416, 0x141416, 0x1b1d24, 0x1e2433, 0x3a2b22, 0x3e4232];
/** hijab: plain, soft colours with the odd bright one */
export const HIJAB = [
  0x141416, 0xe8dccb, 0x8a5a6a, 0x3d5a80, 0xb58b6a, 0x6b4e71, 0xd6a5a1, 0x55705d, 0xf0ece4, 0x9c2f3f
];
const SHIRTS = [
  0x8d2f45, 0x1f6f6a, 0xe7d7c1, 0x3d4d8a, 0x4a4038, 0x6b7f3a, 0xb5651d, 0x2f4858, 0xc9b27c, 0x7a3b69, 0xd8d8d0,
  0x9c2a2a, 0x5a6a7a, 0xf0e6d2
];
const KID = [0xd93a3a, 0x2f7fd9, 0xf2c230, 0x3aa65a, 0xe86fa8, 0xf08a24];
const BAGS = [0x1d2b4f, 0x8a1f2a, 0x2c2c2c, 0x3f6b3a, 0x6a4a8a];

function hash01(n: number) {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

export interface OutfitWho {
  id: number;
  role: OutfitRole;
  female: boolean;
  /** shirt colour already chosen for this person, if any */
  top?: number;
}

/** A seeded outfit for one person. */
export function outfitFor(who: OutfitWho): Outfit {
  let k = who.id * 7919 + 13;
  const r = () => hash01(k++);
  const pick = <T>(a: readonly T[]) => a[Math.floor(r() * a.length)]!;
  const o: Outfit = {
    robe: null,
    hijab: null,
    cap: null,
    top: who.top ?? pick(SHIRTS),
    skin: pick(SKINS),
    hair: pick(HAIRS),
    cane: false,
    backpack: null,
    tray: false,
    female: who.female
  };
  const role = who.role;
  if (role === 'kid') {
    o.kid = true;
    o.top = pick(KID);
    if (r() < 0.6) o.backpack = pick(BAGS);
    if (who.female && r() < 0.25) o.hijab = pick(HIJAB);
    return o;
  }
  if (role === 'elder') {
    o.hair = pick(GREY);
    o.cane = r() < 0.7;
    if (who.female) {
      o.robe = pick(ABAYA);
      o.hijab = r() < 0.5 ? 0x141416 : pick(HIJAB);
    } else {
      if (r() < 0.75) o.robe = pick(GALABEYA);
      if (r() < 0.55) o.cap = r() < 0.7 ? 0xf2f0ea : 0x4a3a2a;
    }
    return o;
  }
  if (who.female) {
    const u = r();
    if (role === 'student') {
      if (u < 0.75) o.hijab = pick(HIJAB);
      o.backpack = pick(BAGS);
    } else if (u < 0.3) {
      o.robe = pick(ABAYA);
      o.hijab = r() < 0.6 ? 0x141416 : pick(HIJAB);
    } else if (u < 0.82) o.hijab = pick(HIJAB);
    return o;
  }
  // men
  const galabeyaChance =
    role === 'vendor' ? 0.75 : role === 'shopkeeper' ? 0.4 : role === 'ahwa' ? 0.45 : role === 'student' ? 0 : 0.28;
  if (r() < galabeyaChance) {
    o.robe = pick(GALABEYA);
    if (r() < 0.3) o.cap = 0xf2f0ea;
  }
  if (role === 'student') o.backpack = pick(BAGS);
  if (role === 'vendor') o.tray = r() < 0.5;
  if (r() < 0.12) o.hair = pick(GREY);
  return o;
}
