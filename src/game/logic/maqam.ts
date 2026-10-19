/**
 * Procedural Egyptian music, the pure part: maqamat (scales with quarter tones), darbuka / tabla rhythms and a seeded
 * melody composer. Nothing here touches WebAudio, so it is tested; `systems/EgyptianMusic.ts` plays what this makes.
 * Every note is generated from rules in code (no recordings, no third-party tunes).
 */

export type TrackId = 'menu' | 'taxi' | 'police';

/** A maqam: semitone offsets from the tonic over one octave (quarter tones are halves). */
export interface Maqam {
  name: string;
  /** MIDI note of the tonic (may be fractional) */
  root: number;
  steps: readonly number[];
}

/** Hijaz: the augmented second (Eb to F#) is the sound everybody knows as "Arabic". */
export const HIJAZ: readonly number[] = [0, 1, 4, 5, 7, 8, 10];
/** Rast: the neutral third and seventh (E and B half-flat). */
export const RAST: readonly number[] = [0, 2, 3.5, 5, 7, 9, 10.5];
/** Bayati: neutral second and third. */
export const BAYATI: readonly number[] = [0, 1.5, 3, 5, 7, 8, 10];

/** One bar of eighth notes. D = dum (low), T = tak (high), k = soft ghost, . = rest. */
export type Hit = 'D' | 'T' | 'k' | '.';
export interface Rhythm {
  name: string;
  bar: readonly Hit[];
}

const R = (name: string, s: string): Rhythm => ({ name, bar: s.replace(/ /g, '').split('') as Hit[] });
/** Maqsum: Dum Tak . Tak Dum . Tak . */
export const MAQSUM = R('maqsum', 'D T . T D . T .');
/** Saidi: Dum Tak . Dum Dum . Tak . */
export const SAIDI = R('saidi', 'D T . D D . T .');
/** Baladi: Dum Dum . Tak Dum . Tak . */
export const BALADI = R('baladi', 'D D . T D . T .');
/** Ayyub: Dum . . Dum Tak . Tak . */
export const AYYUB = R('ayyub', 'D . . D T . T .');

export interface Note {
  /** start, in eighth-note steps from the loop start */
  at: number;
  /** length in eighth-note steps */
  len: number;
  /** scale degree: 0 is the tonic, 7 is the octave above, negative goes below */
  deg: number;
  /** a quick neighbour note before it (the "ornament" Arab players put on almost every note) */
  grace?: boolean;
}

export interface TrackSpec {
  id: TrackId;
  maqam: Maqam;
  bpm: number;
  rhythm: Rhythm;
  /** bars in one loop (a multiple of 4) */
  bars: number;
  /** 0..1: how busy the melody is */
  density: number;
  seed: number;
}

export const TRACKS: Record<TrackId, TrackSpec> = {
  // slow and spacious: hijaz on D over a gentle maqsum
  menu: {
    id: 'menu',
    maqam: { name: 'hijaz', root: 50, steps: HIJAZ },
    bpm: 76,
    rhythm: MAQSUM,
    bars: 8,
    density: 0.35,
    seed: 11
  },
  // bright and bouncy: rast on C, maqsum
  taxi: {
    id: 'taxi',
    maqam: { name: 'rast', root: 48, steps: RAST },
    bpm: 108,
    rhythm: MAQSUM,
    bars: 8,
    density: 0.7,
    seed: 23
  },
  // tense and driving: hijaz on A, saidi
  police: {
    id: 'police',
    maqam: { name: 'hijaz', root: 45, steps: HIJAZ },
    bpm: 132,
    rhythm: SAIDI,
    bars: 8,
    density: 0.55,
    seed: 37
  }
};

/** Small seeded generator (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** MIDI pitch (possibly fractional) of a scale degree. */
export function degToMidi(m: Maqam, deg: number): number {
  const n = m.steps.length;
  const oct = Math.floor(deg / n);
  const i = ((deg % n) + n) % n;
  return m.root + 12 * oct + m.steps[i]!;
}

export const midiToHz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** The drum pattern of a loop: the bar repeated, with soft ghost notes sprinkled on rests, and a fill in the last bar. */
export function drumLoop(spec: TrackSpec, rand: () => number): Hit[] {
  const out: Hit[] = [];
  for (let b = 0; b < spec.bars; b++) {
    for (let i = 0; i < spec.rhythm.bar.length; i++) {
      let h = spec.rhythm.bar[i]!;
      if (h === '.' && rand() < 0.18 * spec.density + 0.06) h = 'k';
      out.push(h);
    }
    if (b === spec.bars - 1) {
      const n = out.length;
      // fill: the last two steps run T k T T
      out[n - 2] = 'T';
      out[n - 1] = 'T';
    }
  }
  return out;
}

/** Rhythmic cells for a melody (eighth-note lengths); each cell fits in one bar's worth when summed to 8. */
const CELLS: readonly (readonly number[])[] = [
  [2, 2, 2, 2],
  [1, 1, 2, 2, 2],
  [3, 1, 2, 2],
  [2, 1, 1, 2, 2],
  [1, 1, 1, 1, 2, 2],
  [4, 2, 2],
  [2, 2, 4],
  [3, 3, 2],
  [1, 1, 1, 1, 1, 1, 1, 1],
  [4, 4]
];

/**
 * A melody over `bars` bars: a seeded random walk on the maqam. Steps are mostly by one degree (as in real taqasim),
 * the phrase breathes (a rest or a long note every other bar), and it lands on the tonic (or the fifth halfway through).
 */
export function melody(spec: TrackSpec, rand: () => number, startDeg = 4): Note[] {
  const notes: Note[] = [];
  let deg = startDeg;
  const total = spec.bars * 8;
  // weights favour stepwise motion; leaps are rare
  const moves = [-3, -2, -1, -1, -1, 0, 1, 1, 1, 2, 3];
  let at = 0;
  let bar = 0;
  while (bar < spec.bars) {
    const last = bar === spec.bars - 1;
    const half = bar === spec.bars / 2 - 1;
    // sparse bars for a quiet track
    const rest = !last && !half && rand() > 0.55 + spec.density * 0.45;
    const cell = last || half ? [2, 2, 4] : CELLS[Math.floor(rand() * CELLS.length)]!;
    if (!rest) {
      let k = 0;
      for (const len of cell) {
        const final = (last || half) && k === cell.length - 1;
        if (final) {
          deg = last ? 0 : 4;
        } else {
          // pull back toward the middle of the range so it never wanders off
          const pull = deg > 7 ? -1 : deg < -2 ? 1 : 0;
          deg += moves[Math.floor(rand() * moves.length)]! + (rand() < 0.35 ? pull : 0);
          deg = Math.max(-3, Math.min(9, deg));
        }
        notes.push({
          at: at + cell.slice(0, k).reduce((s, v) => s + v, 0),
          len,
          deg,
          grace: rand() < 0.25 && len >= 2
        });
        k++;
      }
    }
    at += 8;
    bar++;
  }
  // keep every note inside the loop
  return notes.filter((n) => n.at + n.len <= total);
}

/** A bass line: the tonic on dum, the fifth now and then, so the low end follows the drum. */
export function bassLine(drums: readonly Hit[]): Note[] {
  const out: Note[] = [];
  for (let i = 0; i < drums.length; i++) {
    if (drums[i] !== 'D') continue;
    const barPos = i % 8;
    out.push({ at: i, len: 2, deg: barPos >= 4 && i % 16 >= 8 ? 4 - 7 : -7 });
  }
  return out;
}

export interface Loop {
  spec: TrackSpec;
  /** eighth-note steps in the loop */
  steps: number;
  drums: Hit[];
  lead: Note[];
  bass: Note[];
}

/** One full loop of a track. `variant` changes the melody (the rhythm and key stay), so a long drive does not repeat itself every 15 seconds. */
export function composeLoop(spec: TrackSpec, variant = 0): Loop {
  const rand = rng(spec.seed * 1009 + variant * 7919);
  const drums = drumLoop(spec, rand);
  return { spec, steps: spec.bars * 8, drums, lead: melody(spec, rand, 4 + (variant % 3)), bass: bassLine(drums) };
}
