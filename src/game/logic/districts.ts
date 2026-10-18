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
  /** share of blocks left as bare red-brick infill between concrete columns (0..1) */
  brick: number;
  /** share of blocks in the old Belle Epoque (khedival) style and in the 1950s-70s modernist style (0..1) */
  khedival: number;
  modern: number;
  /** share of plastered concrete-frame blocks that still show rebar stubs on the roof (0..1) */
  rebar: number;
  floorsMin: number;
  floorsMax: number;
  /** pedestrian density multiplier */
  crowd: number;
  /** minimap band colour */
  band: string;
}

/** Plaster and paint colours, kept dusty and desaturated like weathered Cairo facades. */
export const PLASTER = {
  cream: 0xe6dac2,
  sand: 0xd6c6a6,
  ochre: 0xd1b887,
  white: 0xeeeae0,
  lightGrey: 0xcbc8c0,
  grey: 0xa9a59c,
  stone: 0xd9c9a3,
  umber: 0xb5a88f,
  terracotta: 0xd3b199,
  sage: 0xc4c9b0,
  slate: 0xbcc3c8
} as const;

export const DISTRICT_STYLES: Record<District, DistrictStyle> = {
  suburb: {
    id: 'suburb',
    name: 'الهرم',
    en: 'Haram',
    blurb: 'عمارات خرسانة رمادي وبيج ومحلات، والأهرامات في آخر الشارع',
    streets: ['شارع الهرم', 'الطريق الدائري', 'شارع فيصل'],
    tints: [
      PLASTER.cream,
      PLASTER.sand,
      PLASTER.lightGrey,
      PLASTER.grey,
      PLASTER.white,
      PLASTER.ochre,
      PLASTER.terracotta
    ],
    brick: 0.06,
    khedival: 0,
    modern: 0.15,
    rebar: 0.3,
    floorsMin: 7,
    floorsMax: 13,
    crowd: 1,
    band: '#2a2418'
  },
  downtown: {
    id: 'downtown',
    name: 'وسط البلد',
    en: 'Downtown',
    blurb: 'عمارات بيل إبوك بشرفات حديد وشارع طلعت حرب والتحرير',
    streets: ['شارع التحرير', 'شارع قصر النيل'],
    tints: [PLASTER.stone, PLASTER.umber, PLASTER.cream, PLASTER.ochre, PLASTER.sand],
    brick: 0.02,
    khedival: 0.75,
    modern: 0.15,
    rebar: 0.05,
    floorsMin: 5,
    floorsMax: 9,
    crowd: 1,
    band: '#2a2a1c'
  },
  port: {
    id: 'port',
    name: 'شبرا',
    en: 'Shubra',
    blurb: 'عمارات قديمة متراصة وشجر على الجانبين وزحمة ناس',
    streets: ['شارع شبرا', 'شارع الخلفاوي'],
    tints: [PLASTER.terracotta, PLASTER.sand, PLASTER.sage, PLASTER.slate, PLASTER.cream, PLASTER.ochre],
    brick: 0.12,
    khedival: 0.35,
    modern: 0.1,
    rebar: 0.25,
    floorsMin: 5,
    floorsMax: 10,
    crowd: 1.5,
    band: '#2e1f26'
  },
  corniche: {
    id: 'corniche',
    name: 'الدقي',
    en: 'Dokki',
    blurb: 'عمارات الستينات والسبعينات وشجر وكورنيش الجيزة',
    streets: ['شارع المساحة', 'كورنيش الجيزة'],
    tints: [PLASTER.white, PLASTER.lightGrey, PLASTER.cream, PLASTER.slate, PLASTER.sand],
    brick: 0.03,
    khedival: 0.05,
    modern: 0.7,
    rebar: 0.05,
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

export type FacadeStyle = 'informal' | 'khedival' | 'modern' | 'brick';

export interface BlockLook {
  brick: boolean;
  style: FacadeStyle;
  rebar: boolean;
  tint: number;
  floors: number;
}

/** Deterministic look of one apartment block for a district and a seed. */
export function blockLook(d: District, seed: number): BlockLook {
  const s = DISTRICT_STYLES[d];
  const span = s.floorsMax - s.floorsMin + 1;
  const brick = hash01(seed * 3 + 1) < s.brick;
  const k = hash01(seed * 11 + 4);
  const style: FacadeStyle = brick
    ? 'brick'
    : k < s.khedival
      ? 'khedival'
      : k < s.khedival + s.modern
        ? 'modern'
        : 'informal';
  return {
    brick,
    style,
    rebar: brick || (style === 'informal' && hash01(seed * 13 + 5) < s.rebar),
    tint: s.tints[Math.floor(hash01(seed * 5 + 2) * s.tints.length)],
    floors: s.floorsMin + Math.floor(hash01(seed * 7 + 3) * span)
  };
}

/** Street names for the sign at a cross street: [avenue, crossing street]. */
export function signNames(d: District, crossIndex: number): [string, string] {
  const st = DISTRICT_STYLES[d].streets;
  return [st[0], st[1 + (crossIndex % (st.length - 1))]];
}
