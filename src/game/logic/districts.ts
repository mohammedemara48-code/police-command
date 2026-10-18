/** The four Cairo districts along the avenue: names, look of the buildings, street names. Pure data, no rendering. */

/** Internal ids are the save/mission keys and stay stable; only the visible names changed. */
export type District = 'suburb' | 'downtown' | 'port' | 'corniche';

export interface DistrictStyle {
  id: District;
  /** shown in the HUD, map, calls and signs */
  name: string;
  en: string;
  /** one-line description on the mission map */
  blurb: string;
  /** street names painted on the street signs, main avenue first */
  streets: string[];
  /** plaster tints for the apartment blocks (hex) */
  tints: number[];
  /** share of blocks built as bare red brick with rebar on the roof (0..1) */
  brick: number;
  floorsMin: number;
  floorsMax: number;
  /** pedestrian density multiplier */
  crowd: number;
  /** minimap band colour */
  band: string;
}

/** Plaster colours used across the districts. */
export const PLASTER = {
  plain: 0xe9d6b4,
  yellow: 0xf0d98a,
  ochre: 0xd9a95a,
  white: 0xf4f1ea,
  grey: 0xbdbdba,
  pink: 0xe6a6b0,
  blue: 0x9cc1de
} as const;

export const DISTRICT_STYLES: Record<District, DistrictStyle> = {
  suburb: {
    id: 'suburb',
    name: 'الهرم',
    en: 'Haram',
    blurb: 'طوب أحمر والأهرامات في الخلفية',
    streets: ['شارع الهرم', 'الطريق الدائري', 'شارع فيصل'],
    tints: [PLASTER.plain, PLASTER.ochre],
    brick: 0.7,
    floorsMin: 7,
    floorsMax: 13,
    crowd: 1,
    band: '#2a2418'
  },
  downtown: {
    id: 'downtown',
    name: 'وسط البلد',
    en: 'Downtown',
    blurb: 'عمارات أصفر وأوكر وشارع التحرير',
    streets: ['شارع التحرير', 'شارع قصر النيل'],
    tints: [PLASTER.yellow, PLASTER.ochre, PLASTER.white, PLASTER.plain],
    brick: 0.1,
    floorsMin: 5,
    floorsMax: 10,
    crowd: 1,
    band: '#2a2a1c'
  },
  port: {
    id: 'port',
    name: 'شبرا',
    en: 'Shubra',
    blurb: 'ألوان وزحمة وناس في الشارع',
    streets: ['شارع شبرا', 'شارع الخلفاوي'],
    tints: [PLASTER.pink, PLASTER.yellow, PLASTER.blue, PLASTER.ochre],
    brick: 0.35,
    floorsMin: 6,
    floorsMax: 12,
    crowd: 1.5,
    band: '#2e1f26'
  },
  corniche: {
    id: 'corniche',
    name: 'الدقي',
    en: 'Dokki',
    blurb: 'كورنيش الجيزة وعمارات حديثة',
    streets: ['شارع المساحة', 'كورنيش الجيزة'],
    tints: [PLASTER.white, PLASTER.grey, PLASTER.blue, PLASTER.plain],
    brick: 0.05,
    floorsMin: 6,
    floorsMax: 10,
    crowd: 1,
    band: '#18283a'
  }
};

/** Which district a point z along the avenue belongs to. */
export const districtAt = (z: number): District =>
  z < -45 ? 'suburb' : z < 50 ? 'downtown' : z < 145 ? 'port' : 'corniche';

export const DISTRICT_NAMES: Record<District, string> = {
  suburb: DISTRICT_STYLES.suburb.name,
  downtown: DISTRICT_STYLES.downtown.name,
  port: DISTRICT_STYLES.port.name,
  corniche: DISTRICT_STYLES.corniche.name
};

/** Stable pseudo-random number in [0, 1) from an integer seed. */
export function hash01(seed: number): number {
  let h = Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export interface BlockLook {
  brick: boolean;
  tint: number;
  floors: number;
}

/** Deterministic look of one apartment block for a district and a seed. */
export function blockLook(d: District, seed: number): BlockLook {
  const s = DISTRICT_STYLES[d];
  const span = s.floorsMax - s.floorsMin + 1;
  return {
    brick: hash01(seed * 3 + 1) < s.brick,
    tint: s.tints[Math.floor(hash01(seed * 5 + 2) * s.tints.length)],
    floors: s.floorsMin + Math.floor(hash01(seed * 7 + 3) * span)
  };
}

/** Street names for the sign at a cross street: [avenue, crossing street]. */
export function signNames(d: District, crossIndex: number): [string, string] {
  const st = DISTRICT_STYLES[d].streets;
  return [st[0], st[1 + (crossIndex % (st.length - 1))]];
}
