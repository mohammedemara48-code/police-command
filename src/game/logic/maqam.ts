/**
 * Procedural Egyptian music, the pure part (v3, "energetic"): maqamat with quarter tones, layered drum grooves on a
 * sixteenth-note grid (dum / tak / ghost notes / clap / riq / dhol, syncopation and fills), driving basslines, a catchy
 * two-bar hook with ornaments, and a bar-by-bar energy curve that builds. A runtime `intensity` (chases, speed) opens
 * more layers and pushes the tempo. Nothing here touches WebAudio, so it is tested; `systems/EgyptianMusic.ts` plays
 * what this makes. Every note comes from rules in code (no recordings, no third-party tunes).
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
/** Nahawand: the Arabic minor, the base of a lot of modern Egyptian pop and mahraganat riffs. */
export const NAHAWAND: readonly number[] = [0, 2, 3, 5, 7, 8, 10];

/** Steps (sixteenth notes) in a bar. */
export const BAR = 16;

/** One bar on the sixteenth grid. D = dum (low), T = tak (high), . = rest. Ghost notes and extras are added on top. */
export type Hit = 'D' | 'T' | '.';
export interface Rhythm {
  name: string;
  bar: readonly Hit[];
}

const R = (name: string, s: string): Rhythm => ({ name, bar: s.replace(/ /g, '').split('') as Hit[] });
/** Maqsum: Dum Tak . Tak Dum . Tak . (eighths) */
export const MAQSUM = R('maqsum', 'D . T . . . T . D . . . T . . .');
/** Saidi: Dum Tak . Dum Dum . Tak . */
export const SAIDI = R('saidi', 'D . T . . . D . D . . . T . . .');
/** Baladi: Dum Dum . Tak Dum . Tak . */
export const BALADI = R('baladi', 'D . D . . . T . D . . . T . . .');
/** Ayyub: Dum . . Dum Tak . Tak . */
export const AYYUB = R('ayyub', 'D . . . . . D . T . . . T . . .');
/** Mahraganat / electro-shaabi: a tresillo kick (3+3+2) with the clap on beats 2 and 4. */
export const MAHRAGANAT = R('mahraganat', 'D . . . . . D . . . D . . . . .');

export interface Note {
  /** start, in sixteenth-note steps from the loop start */
  at: number;
  /** length in sixteenth-note steps */
  len: number;
  /** scale degree: 0 is the tonic, 7 is the octave above, negative goes below */
  deg: number;
  /** velocity 0..1 */
  vel?: number;
  /** an ornament Arab players put on almost every note: a quick neighbour before it, a trill, or a slide up into it */
  orn?: 'grace' | 'trill' | 'slide';
}

/** Drum layers; each is an array of velocities (0 = silent) over the whole loop. */
export type Layer = 'dum' | 'tak' | 'ka' | 'clap' | 'riq' | 'dhol' | 'dholTak';
export const LAYERS: readonly Layer[] = ['dum', 'tak', 'ka', 'clap', 'riq', 'dhol', 'dholTak'];

export interface TrackSpec {
  id: TrackId;
  maqam: Maqam;
  bpm: number;
  rhythm: Rhythm;
  /** bars in one loop (a multiple of 4) */
  bars: number;
  /** 0..1: how many ghost notes and extra hits */
  density: number;
  seed: number;
  /** electronic backbeat clap on beats 2 and 4 (mahraganat) */
  clap: boolean;
  /** dhol (big drum) pattern for one bar, 16 characters, X = hit */
  dhol: string;
  /** bass pattern for one bar (r root, 5 fifth, 4 fourth, b flat seventh, o octave up, . rest); the last bar of a phrase uses `bassEnd` */
  bass: string;
  bassEnd: string;
  /** hook rhythm cell indices (into HOOK_CELLS) for the call and the answer */
  cells: [number, number];
  /** the hook starts on this scale degree */
  hookStart: number;
}

export const TRACKS: Record<TrackId, TrackSpec> = {
  // bright and inviting: rast on D, a bouncy maqsum with riq, hook on top of an oud ostinato
  menu: {
    id: 'menu',
    maqam: { name: 'rast', root: 50, steps: RAST },
    bpm: 112,
    rhythm: MAQSUM,
    bars: 8,
    density: 0.55,
    seed: 11,
    clap: false,
    dhol: 'X.......X.....X.',
    bass: 'r..r..5.r..r.4..',
    bassEnd: 'r..r..5.r.4.5.o.',
    cells: [0, 4],
    hookStart: 4
  },
  // mahraganat-style electronic groove: nahawand on C, tresillo kick, claps, synth riff
  taxi: {
    id: 'taxi',
    maqam: { name: 'nahawand', root: 48, steps: NAHAWAND },
    bpm: 124,
    rhythm: MAHRAGANAT,
    bars: 8,
    density: 0.7,
    seed: 23,
    clap: true,
    dhol: 'X.....X...X.....',
    bass: 'r..r..r...r.r.5.',
    bassEnd: 'r..r..r...r.5.4b',
    cells: [1, 2],
    hookStart: 5
  },
  // tense and driving: hijaz on A, saidi with dhol hammering, pumping bass, mizmar hook
  police: {
    id: 'police',
    maqam: { name: 'hijaz', root: 45, steps: HIJAZ },
    bpm: 140,
    rhythm: SAIDI,
    bars: 8,
    density: 0.65,
    seed: 37,
    clap: false,
    dhol: 'X..X..X.X..X.X.X',
    bass: 'r.r.r.r.r.r.r.5.',
    bassEnd: 'r.r.o.r.r.5.4.b.',
    cells: [3, 5],
    hookStart: 7
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

// ---------- energy and layers ----------

/** How built-up each bar of a loop is (0..1): it climbs, with a small dip at the half to breathe, and peaks in the last bar. */
export function energyCurve(bars: number): number[] {
  const out: number[] = [];
  for (let b = 0; b < bars; b++) {
    const t = b / (bars - 1);
    let e = 0.35 + 0.65 * t;
    if (b === bars / 2) e -= 0.18; // the second half starts a notch lower, then builds again
    out.push(Math.max(0.2, Math.min(1, e)));
  }
  return out;
}

/** Overall level 0..1 from the bar's energy and the game's intensity (a chase, speed). */
export const levelOf = (energy: number, intensity: number) =>
  Math.max(0, Math.min(1.2, 0.2 + 0.5 * energy + 0.5 * intensity));

/** The level at which each layer comes in. */
export const LAYER_MIN = {
  dum: 0,
  tak: 0.15,
  bass: 0.3,
  clap: 0.35,
  ka: 0.4,
  hook: 0.42,
  riq: 0.5,
  dhol: 0.6,
  counter: 0.75,
  riqFull: 0.8
} as const;
export type Voice = keyof typeof LAYER_MIN;
export const active = (v: Voice, level: number) => level >= LAYER_MIN[v];

/** Tempo multiplier for an intensity: up to 10% faster when everything is going on. */
export const tempoMul = (intensity: number) => 1 + 0.1 * Math.max(0, Math.min(1, intensity));

// ---------- the groove ----------

export interface Drums {
  /** one array of velocities per layer, `steps` long */
  layers: Record<Layer, number[]>;
  /** the steps where a fill starts (a roll into the next bar) */
  fills: number[];
}

/** The drums of a loop: the base rhythm, syncopated pickups, ghost notes, a clap backbeat, riq 16ths, dhol and fills. */
export function drumLoop(spec: TrackSpec, rand: () => number): Drums {
  const steps = spec.bars * BAR;
  const L = Object.fromEntries(LAYERS.map((l) => [l, new Array<number>(steps).fill(0)])) as Record<Layer, number[]>;
  const fills: number[] = [];
  // riq: accents on the beats, soft in between
  const RIQ = [1, 0.32, 0.6, 0.32, 0.85, 0.32, 0.6, 0.32, 0.95, 0.32, 0.6, 0.32, 0.85, 0.32, 0.6, 0.4];
  for (let b = 0; b < spec.bars; b++) {
    const o = b * BAR;
    for (let i = 0; i < BAR; i++) {
      const h = spec.rhythm.bar[i]!;
      if (h === 'D') L.dum[o + i] = i === 0 ? 1 : 0.9;
      else if (h === 'T') L.tak[o + i] = 0.85;
      L.riq[o + i] = RIQ[i]!;
      if (spec.dhol[i] === 'X') L.dhol[o + i] = i % 8 === 0 ? 1 : 0.8;
    }
    // a syncopated pickup dum just before the next bar's beat one (every other bar), and an offbeat tak
    if (b % 2 === 1 && L.dum[o + 14] === 0) L.dum[o + 14] = 0.75;
    if (rand() < 0.5 + spec.density * 0.3 && L.tak[o + 10] === 0 && L.dum[o + 10] === 0) L.tak[o + 10] = 0.6;
    // ghost notes on the free sixteenths
    for (let i = 1; i < BAR; i += 2) {
      if (L.dum[o + i] || L.tak[o + i]) continue;
      if (rand() < 0.2 + spec.density * 0.28) L.ka[o + i] = 0.3 + rand() * 0.22;
    }
    if (spec.clap) {
      L.clap[o + 4] = 1;
      L.clap[o + 12] = 1;
      if (b % 2 === 1) L.clap[o + 15] = 0.5;
    }
    // dhol stick on the offbeats of the last half-bar, so the big drum has a rhythm of its own
    if (spec.dhol[11] === 'X') L.dholTak[o + 11] = 0.7;
    L.dholTak[o + 6] = 0.55;
    // fills: a roll over the last beat every 4th bar, a bigger one (last half-bar) at the end of the loop
    const phraseEnd = b % 4 === 3;
    const loopEnd = b === spec.bars - 1;
    if (phraseEnd) {
      const from = loopEnd ? 8 : 12;
      fills.push(o + from);
      for (let i = from; i < BAR; i++) {
        L.dum[o + i] = 0;
        L.tak[o + i] = 0;
        L.ka[o + i] = 0;
        const k = (i - from + 1) / (BAR - from);
        // roll: tak on every sixteenth, getting louder; every 4th hit is a dum for weight
        if ((i - from) % 4 === 0 && loopEnd) L.dum[o + i] = 0.8 + 0.2 * k;
        else L.tak[o + i] = 0.45 + 0.55 * k;
      }
      if (loopEnd) L.dum[o + BAR - 1] = 1;
    }
  }
  return { layers: L, fills };
}

// ---------- bass ----------

const BASS_DEG: Record<string, number> = { r: -7, '5': -3, '4': -4, b: -1, o: 0 };

/** The bass line: one pattern per bar (the last bar of every phrase takes the ending pattern), each note held to the next. */
export function bassLine(spec: TrackSpec): Note[] {
  const out: Note[] = [];
  for (let b = 0; b < spec.bars; b++) {
    const pat = b % 4 === 3 ? spec.bassEnd : spec.bass;
    const hits: { i: number; c: string }[] = [];
    for (let i = 0; i < BAR; i++) if (pat[i] !== '.') hits.push({ i, c: pat[i]! });
    hits.forEach((h, k) => {
      const next = k + 1 < hits.length ? hits[k + 1]!.i : BAR;
      out.push({
        at: b * BAR + h.i,
        len: Math.max(1, Math.min(4, next - h.i)),
        deg: BASS_DEG[h.c]!,
        vel: h.i % 4 === 0 ? 1 : 0.8
      });
    });
  }
  return out;
}

// ---------- the hook ----------

/** Catchy bar rhythms (sixteenths, each sums to 16). Syncopated: the accents fall off the beat. */
export const HOOK_CELLS: readonly (readonly number[])[] = [
  [3, 3, 2, 3, 3, 2], // tresillo twice
  [4, 2, 2, 4, 2, 2],
  [2, 2, 3, 1, 2, 2, 4],
  [1, 1, 2, 2, 2, 3, 3, 2],
  [3, 1, 2, 2, 3, 1, 2, 2],
  [2, 1, 1, 2, 2, 2, 2, 2, 2]
];

const lo = -2;
const hi = 10;

/** One bar of the hook: the given cell, degrees walking by steps (rarely leaps) from `from`, ornaments on longer notes. */
function hookBar(cell: readonly number[], from: number, rand: () => number, at: number, ornaments: number): Note[] {
  const out: Note[] = [];
  let deg = from;
  let t = at;
  cell.forEach((len, k) => {
    if (k > 0) {
      const r = rand();
      deg += r < 0.34 ? -1 : r < 0.68 ? 1 : r < 0.8 ? -2 : r < 0.92 ? 2 : r < 0.96 ? 3 : -3;
      if (deg > hi - 1) deg -= 2;
      if (deg < lo + 1) deg += 2;
    }
    const o = rand();
    const orn =
      len >= 4 && o < ornaments * 0.7
        ? 'trill'
        : len >= 2 && o < ornaments
          ? rand() < 0.65
            ? 'grace'
            : 'slide'
          : undefined;
    out.push({ at: t, len, deg, vel: k === 0 ? 1 : 0.8 + rand() * 0.15, orn });
    t += len;
  });
  return out;
}

/**
 * The hook over a loop: a two-bar call, repeated with a small change, once more as it was, and finally an answer that
 * walks home to the tonic. The same skeleton every cycle (so it is catchy); `variant` changes the ornaments.
 */
export function hook(spec: TrackSpec, rand: () => number, variant: number): Note[] {
  const [ca, cb] = [HOOK_CELLS[spec.cells[0]]!, HOOK_CELLS[spec.cells[1]]!];
  // the skeleton is fixed by the seed, not by the variant
  const skel = rng(spec.seed * 31 + 5);
  const A = hookBar(ca, spec.hookStart, skel, 0, 0);
  const A2 = hookBar(cb, A[A.length - 1]!.deg, skel, 0, 0);
  const ornaments = 0.35 + 0.12 * (variant % 4);
  const out: Note[] = [];
  const place = (notes: Note[], bar: number, change = false, answer = false) => {
    notes.forEach((n, i) => {
      let deg = n.deg;
      if (change && i >= notes.length - 2) deg += i === notes.length - 1 ? 1 : -1;
      if (answer && i === notes.length - 1) deg = 0;
      else if (answer && i === notes.length - 2) deg = 1;
      // the ornaments are re-rolled each cycle; the notes are not
      const r = rand();
      const orn: Note['orn'] =
        answer && i === notes.length - 1 && n.len >= 3
          ? 'trill'
          : n.len >= 4 && r < ornaments * 0.7
            ? 'trill'
            : n.len >= 2 && r < ornaments
              ? rand() < 0.65
                ? 'grace'
                : 'slide'
              : undefined;
      out.push({ ...n, at: bar * BAR + n.at, deg: Math.max(lo, Math.min(hi, deg)), orn });
    });
  };
  const bars = spec.bars;
  for (let p = 0; p < bars; p += 2) {
    const last = p >= bars - 2;
    place(A, p);
    place(A2, p + 1, p % 4 === 2, last);
  }
  return out;
}

export interface Loop {
  spec: TrackSpec;
  /** sixteenth-note steps in the loop */
  steps: number;
  drums: Drums;
  hook: Note[];
  bass: Note[];
  /** how built-up each bar is */
  energy: number[];
}

/** One full loop of a track. `variant` re-rolls the ornaments and the ghost notes (the tune, key and groove stay), so a long drive does not repeat note for note. */
export function composeLoop(spec: TrackSpec, variant = 0): Loop {
  const rand = rng(spec.seed * 1009 + variant * 7919);
  const drums = drumLoop(spec, rand);
  return {
    spec,
    steps: spec.bars * BAR,
    drums,
    hook: hook(spec, rand, variant),
    bass: bassLine(spec),
    energy: energyCurve(spec.bars)
  };
}
