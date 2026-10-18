/**
 * Bark picker (pure, unit-tested): decides whether a situation may speak now and which variant it says.
 * A situation has its own cooldown, a short global gap keeps two bubbles from stacking, and the variant
 * just used is never repeated back to back.
 */

/** Seconds a situation stays quiet after speaking. */
export const BARK_COOLDOWN = 20;
/** Minimum seconds between any two barks. */
export const BARK_GAP = 3;

export interface BarkState {
  /** time each situation last spoke */
  last: Map<string, number>;
  /** index of the variant each situation said last */
  lastIdx: Map<string, number>;
  /** time of the most recent bark of any kind */
  lastAny: number;
}

export function createBarkState(): BarkState {
  return { last: new Map(), lastIdx: new Map(), lastAny: -Infinity };
}

export interface PickOptions {
  cooldown?: number;
  gap?: number;
  /** speaks even inside the global gap (the situation's own cooldown still applies) */
  priority?: boolean;
  vocatives?: readonly string[];
}

/** Replace the `{V}` placeholder with a vocative. */
export function fillVocative(line: string, vocatives: readonly string[], rnd: () => number = Math.random): string {
  if (!line.includes('{V}') || vocatives.length === 0) return line.replace('{V}', '').replace(/\s+/g, ' ').trim();
  const v = vocatives[Math.min(vocatives.length - 1, Math.floor(rnd() * vocatives.length))]!;
  return line.replace('{V}', v);
}

/**
 * Returns the line to show, or null when the situation is cooling down or the gap is not over.
 * A refusal changes nothing, so a blocked situation can simply try again on a later frame.
 */
export function pickBark(
  state: BarkState,
  id: string,
  lines: readonly string[],
  now: number,
  opts: PickOptions = {},
  rnd: () => number = Math.random
): string | null {
  if (lines.length === 0) return null;
  const cooldown = opts.cooldown ?? BARK_COOLDOWN;
  const gap = opts.gap ?? BARK_GAP;
  const last = state.last.get(id);
  if (last !== undefined && now - last < cooldown) return null;
  if (!opts.priority && now - state.lastAny < gap) return null;
  const prev = state.lastIdx.get(id);
  let idx = Math.min(lines.length - 1, Math.floor(rnd() * lines.length));
  if (lines.length > 1 && idx === prev) idx = (idx + 1) % lines.length;
  state.last.set(id, now);
  state.lastIdx.set(id, idx);
  state.lastAny = now;
  return fillVocative(lines[idx]!, opts.vocatives ?? [], rnd);
}

/** Word for the patrol car's condition at `damage` percent. */
export function damageWord(damage: number, table: readonly { upTo: number; word: string }[]): string {
  const d = Math.max(0, Math.min(100, damage));
  for (const row of table) if (d <= row.upTo) return row.word;
  return table[table.length - 1]?.word ?? '';
}
