/** Officer character profile: body, colours and starting weapon. Pure data + validation (unit-tested). */
export const CHAR_KEY = 'pc.character.v1';

export const SKINS = [0xf1c9a5, 0xd9a47a, 0xb67b52, 0x8a5634, 0x5c3a24];
export const HAIRS = [0x1d1612, 0x4a2d1a, 0x8a5a2b, 0xd6b25e, 0x9a9a9a];
export const UNIFORMS = [
  { name: 'كحلي', top: 0x1b2a4a, gear: 0x111418 },
  { name: 'أسود', top: 0x16181c, gear: 0x2b2f36 },
  { name: 'أزرق فاتح', top: 0x3b6fb6, gear: 0x1a2232 },
  { name: 'كاكي', top: 0x8a7a55, gear: 0x3a3226 },
  { name: 'أخضر', top: 0x31523a, gear: 0x1b2419 },
  { name: 'رمادي', top: 0x5c636e, gear: 0x22252b }
];
export const WEAPONS = {
  pistol: { name: 'مسدس', desc: 'متوازن', magK: 1, dmgK: 1, cool: 0.3, len: 0.22 },
  revolver: { name: 'ريفولفر', desc: 'طلقات أقل وضربة أقوى', magK: 0.5, dmgK: 1.7, cool: 0.45, len: 0.3 },
  smg: { name: 'رشاش صغير', desc: 'سريع وضربة أخف', magK: 2, dmgK: 0.55, cool: 0.13, len: 0.36 }
} as const;
export type WeaponId = keyof typeof WEAPONS;

export interface Character {
  body: 'male' | 'female';
  skin: number; // index into SKINS
  hair: number; // index into HAIRS (female hair; male wears a helmet)
  uniform: number; // index into UNIFORMS
  weapon: WeaponId;
  /** last edit time, used to pick the newer copy when syncing with the account */
  t: number;
}

export const DEFAULT_CHAR: Character = { body: 'male', skin: 1, hair: 0, uniform: 0, weapon: 'pistol', t: 0 };

const idx = (v: unknown, n: number, d: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < n ? (v as number) : d);

/** Clamp anything (old saves, imports, server data) into a valid character. */
export function sanitizeChar(raw: unknown): Character {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    body: r.body === 'female' ? 'female' : 'male',
    skin: idx(r.skin, SKINS.length, DEFAULT_CHAR.skin),
    hair: idx(r.hair, HAIRS.length, DEFAULT_CHAR.hair),
    uniform: idx(r.uniform, UNIFORMS.length, DEFAULT_CHAR.uniform),
    weapon: typeof r.weapon === 'string' && r.weapon in WEAPONS ? (r.weapon as WeaponId) : 'pistol',
    t: typeof r.t === 'number' && isFinite(r.t) ? r.t : 0
  };
}

/** Newer edit wins (a fresh device with no character never overwrites the account's one). */
export function newerChar(a: Character | null, b: Character | null) {
  if (!a) return b;
  if (!b) return a;
  return b.t > a.t ? b : a;
}

export function modelFor(c: Character) {
  return c.body === 'female' ? 'officer-female' : 'officer';
}

/** Material name → colour for the chosen model (names come from the Quaternius glTFs). */
export function recolorFor(c: Character): Record<string, number> {
  const u = UNIFORMS[c.uniform] ?? UNIFORMS[0]!;
  const skin = SKINS[c.skin] ?? SKINS[1]!;
  if (c.body === 'male') return { Swat: u.top, Swat_Black: u.gear, Skin: skin };
  const hair = HAIRS[c.hair] ?? HAIRS[0]!;
  return { White: u.top, Orange: u.top, Grey: u.gear, Brown: 0x15110e, Skin: skin, Hair_Blond: hair, Hair_Brown: hair };
}

export function weaponStats(c: Character, rankMag: number, rankDmg: number) {
  const w = WEAPONS[c.weapon];
  return { mag: Math.max(4, Math.round(rankMag * w.magK)), dmg: rankDmg * w.dmgK, cool: w.cool };
}
