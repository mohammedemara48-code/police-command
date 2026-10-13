/** Save-file rules (pure): which command-center fields persist, and validation of imported saves. */
export const SAVE_PREFIX = 'pc.';
export const COMMAND_KEY = 'pc.command.v1';
export const SAVE_FORMAT = 'police-command-save';

export const PERSISTED = [
  'budget',
  'reputation',
  'fuel',
  'equipment',
  'labResources',
  'day',
  'score',
  'incidentsResolved',
  'incidentsFailed',
  'techs',
  'cctvUnlocked',
  'responseMul',
  'swatBonus',
  'fuelMul'
] as const;
export type PersistedKey = (typeof PERSISTED)[number];

export function pickPersisted<T extends Record<PersistedKey, unknown>>(state: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of PERSISTED) out[k] = state[k];
  return out;
}

/** Merge a stored snapshot into fresh state, keeping only known keys whose type matches the default. */
export function mergePersisted<T extends Record<string, unknown>>(fresh: T, saved: unknown): T {
  if (!saved || typeof saved !== 'object') return fresh;
  const s = saved as Record<string, unknown>;
  const out = { ...fresh } as Record<string, unknown>;
  for (const k of PERSISTED) {
    if (!(k in s)) continue;
    const v = s[k];
    const d = fresh[k];
    if (typeof v !== typeof d) continue;
    if (typeof v === 'number' && !Number.isFinite(v)) continue;
    out[k] = typeof d === 'object' && d ? { ...(d as object), ...(v as object) } : v;
  }
  return out as T;
}

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  version: 1;
  savedAt: string;
  data: Record<string, string>;
}

export function buildSaveFile(entries: Array<[string, string]>, now = new Date()): SaveFile {
  const data: Record<string, string> = {};
  for (const [k, v] of entries) if (k.startsWith(SAVE_PREFIX)) data[k] = v;
  return { format: SAVE_FORMAT, version: 1, savedAt: now.toISOString(), data };
}

/** Returns the key/value pairs to restore, or an error message (Arabic) when the file is not a valid save. */
export function parseSaveFile(text: string): { ok: true; data: Record<string, string> } | { ok: false; error: string } {
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    return { ok: false, error: 'الملف مش JSON صالح.' };
  }
  const f = j as Partial<SaveFile>;
  if (!f || f.format !== SAVE_FORMAT || typeof f.data !== 'object' || !f.data) {
    return { ok: false, error: 'ده مش ملف حفظ للعبة.' };
  }
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(f.data)) {
    if (!k.startsWith(SAVE_PREFIX) || typeof v !== 'string' || v.length > 200_000) continue;
    data[k] = v;
  }
  if (!Object.keys(data).length) return { ok: false, error: 'ملف الحفظ فاضي.' };
  return { ok: true, data };
}
