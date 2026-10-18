import { describe, it, expect } from 'vitest';
import {
  BARK_COOLDOWN,
  BARK_GAP,
  canBark,
  createBarkState,
  damageWord,
  fillVocative,
  pickBark
} from '../src/game/logic/barks';
import {
  BARKS,
  CHATTER,
  DAMAGE_WORDS,
  LANDMARK_BARK,
  PATROL_MARKINGS,
  RADIO,
  SHOP_BARK,
  STICKERS,
  VOCATIVES,
  VOICES
} from '../src/game/config/barks';
import { DISTRICT_STYLES } from '../src/game/logic/districts';

const lines = ['أ ب', 'ج د', 'هـ و'];

describe('pickBark', () => {
  it('speaks the first time and returns one of the variants', () => {
    const s = createBarkState();
    expect(lines).toContain(pickBark(s, 'x', lines, 100, {}, () => 0.5));
  });

  it('stays quiet for the cooldown, then speaks again', () => {
    const s = createBarkState();
    expect(pickBark(s, 'x', lines, 100)).not.toBeNull();
    expect(pickBark(s, 'x', lines, 100 + BARK_COOLDOWN - 0.1)).toBeNull();
    expect(pickBark(s, 'x', lines, 100 + BARK_COOLDOWN)).not.toBeNull();
  });

  it('honours a per-situation cooldown', () => {
    const s = createBarkState();
    pickBark(s, 'x', lines, 0, { cooldown: 5 });
    expect(pickBark(s, 'x', lines, 4.9, { cooldown: 5 })).toBeNull();
    expect(pickBark(s, 'x', lines, 5, { cooldown: 5 })).not.toBeNull();
  });

  it('keeps two different situations from stacking inside the global gap', () => {
    const s = createBarkState();
    expect(pickBark(s, 'a', lines, 50)).not.toBeNull();
    expect(pickBark(s, 'b', lines, 50 + BARK_GAP - 0.1)).toBeNull();
    expect(pickBark(s, 'b', lines, 50 + BARK_GAP)).not.toBeNull();
  });

  it('a refusal changes nothing, so it can retry on the next frame', () => {
    const s = createBarkState();
    pickBark(s, 'a', lines, 10);
    expect(pickBark(s, 'b', lines, 11)).toBeNull();
    expect(pickBark(s, 'b', lines, 13.5)).not.toBeNull();
  });

  it('priority lines skip the global gap but not their own cooldown', () => {
    const s = createBarkState();
    pickBark(s, 'a', lines, 10);
    expect(pickBark(s, 'win', lines, 10.5, { priority: true })).not.toBeNull();
    expect(pickBark(s, 'win', lines, 11, { priority: true })).toBeNull();
  });

  it('never repeats the variant it just said', () => {
    const s = createBarkState();
    let t = 0;
    let prev = '';
    for (let i = 0; i < 30; i++) {
      t += BARK_COOLDOWN + 1;
      const line = pickBark(s, 'x', lines, t, {}, () => 0)!;
      expect(line).not.toBe(prev);
      prev = line;
    }
  });

  it('reaches every variant over time', () => {
    const s = createBarkState();
    const seen = new Set<string>();
    let t = 0;
    for (let i = 0; i < 200; i++) {
      t += BARK_COOLDOWN + 1;
      seen.add(pickBark(s, 'x', lines, t)!);
    }
    expect(seen.size).toBe(lines.length);
  });

  it('returns null for an empty situation', () => {
    expect(pickBark(createBarkState(), 'x', [], 0)).toBeNull();
  });

  it('works with a single variant', () => {
    const s = createBarkState();
    expect(pickBark(s, 'x', ['واحد'], 0)).toBe('واحد');
    expect(pickBark(s, 'x', ['واحد'], 25)).toBe('واحد');
  });
});

describe('fillVocative', () => {
  it('swaps the placeholder for a vocative', () => {
    expect(fillVocative('حاسب {V}', ['يا أسطى'], () => 0)).toBe('حاسب يا أسطى');
    expect(fillVocative('حاسب {V}', ['يا أسطى', 'يا عم'], () => 0.99)).toBe('حاسب يا عم');
  });
  it('leaves lines without a placeholder alone and never leaks the token', () => {
    expect(fillVocative('بالراحة', ['يا عم'])).toBe('بالراحة');
    expect(fillVocative('حاسب {V}', [])).toBe('حاسب');
  });
});

describe('damageWord', () => {
  it('walks up the ladder as damage grows', () => {
    const words = [0, 10, 11, 30, 31, 55, 56, 80, 81, 99, 100].map((d) => damageWord(d, DAMAGE_WORDS));
    expect(words[0]).toBe(DAMAGE_WORDS[0]!.word);
    expect(words[words.length - 1]).toBe(DAMAGE_WORDS[DAMAGE_WORDS.length - 1]!.word);
    expect(new Set(words).size).toBe(DAMAGE_WORDS.length);
  });
  it('clamps out-of-range values', () => {
    expect(damageWord(-5, DAMAGE_WORDS)).toBe(DAMAGE_WORDS[0]!.word);
    expect(damageWord(250, DAMAGE_WORDS)).toBe(DAMAGE_WORDS[DAMAGE_WORDS.length - 1]!.word);
  });
});

/** words as the player reads them: the vocative placeholder counts as its two words */
const words = (line: string) => line.replace('{V}', 'يا X').split(/\s+/).filter(Boolean).length;

describe('canBark', () => {
  it('agrees with pickBark without changing anything', () => {
    const s = createBarkState();
    expect(canBark(s, 'x', 10)).toBe(true);
    expect(canBark(s, 'x', 10)).toBe(true);
    pickBark(s, 'x', lines, 10);
    expect(canBark(s, 'x', 11)).toBe(false);
    expect(canBark(s, 'y', 11)).toBe(false);
    expect(canBark(s, 'y', 11, { priority: true })).toBe(true);
    expect(canBark(s, 'y', 10 + BARK_GAP)).toBe(true);
    expect(canBark(s, 'x', 10 + BARK_COOLDOWN)).toBe(true);
  });
});

describe('who speaks', () => {
  const all = Object.entries(BARKS);

  it('only ordinary people of the street have a voice: never the radio, Mona or the officer', () => {
    for (const k of Object.keys(VOICES)) expect(k, k).not.toMatch(/radio|mona|officer|police|patrol|dispatch/i);
    for (const [id, s] of all) {
      expect(s.who.length, id).toBeGreaterThan(0);
      for (const v of s.who) expect(VOICES[v], `${id}: ${v}`).toBeDefined();
    }
    for (const [id, c] of Object.entries(CHATTER))
      for (const v of c.who) expect(VOICES[v], `${id}: ${v}`).toBeDefined();
  });

  it('the radio is a separate channel with plain professional lines', () => {
    for (const [id, r] of Object.entries(RADIO)) {
      expect(r.lines.length, id).toBeGreaterThanOrEqual(2);
      for (const l of r.lines) {
        expect(l.endsWith('.'), `${id}: ${l}`).toBe(true);
        expect(l.includes('{V}'), l).toBe(false);
        expect(/يا باشا|يا عم|يا ريس|ههه|😂|!/.test(l), `${id}: ${l}`).toBe(false);
      }
    }
    // no street situation is also a radio id: the two channels never share a line
    const street = new Set(all.flatMap(([, s]) => [...s.lines]));
    for (const r of Object.values(RADIO)) for (const l of r.lines) expect(street.has(l), l).toBe(false);
  });
});

describe('bark data', () => {
  const all = Object.entries(BARKS);

  it('every situation has 6-10 short variants (2-7 words)', () => {
    for (const [id, s] of all) {
      expect(s.lines.length, id).toBeGreaterThanOrEqual(6);
      expect(s.lines.length, id).toBeLessThanOrEqual(10);
      for (const l of s.lines) {
        expect(words(l), `${id}: ${l}`).toBeGreaterThanOrEqual(2);
        expect(words(l), `${id}: ${l}`).toBeLessThanOrEqual(7);
      }
    }
  });

  it('ambient chatter: every kind has 6+ two-part exchanges', () => {
    for (const [id, c] of Object.entries(CHATTER)) {
      expect(c.lines.length, id).toBeGreaterThanOrEqual(6);
      for (const l of c.lines) {
        const parts = l.split('||');
        expect(parts.length, `${id}: ${l}`).toBe(2);
        for (const part of parts) {
          expect(words(part), `${id}: ${l}`).toBeGreaterThanOrEqual(2);
          expect(words(part), `${id}: ${l}`).toBeLessThanOrEqual(8);
        }
      }
    }
  });

  it('has no duplicate lines anywhere', () => {
    const flat = [...all.flatMap(([, s]) => [...s.lines]), ...Object.values(CHATTER).flatMap((c) => [...c.lines])];
    expect(new Set(flat).size).toBe(flat.length);
  });

  it('keeps clear of the reference game’s signature jokes', () => {
    const banned = [
      'كنبة',
      'اتدغدغ',
      'بوسة',
      'حكة',
      'نهار أبيض',
      'صدعتنا',
      'لأسباب عاطفية',
      'عصفور',
      'تسلّم إيدك',
      'تسلم إيدك'
    ];
    const text = [
      ...all.flatMap(([, s]) => [...s.lines]),
      ...Object.values(CHATTER).flatMap((c) => [...c.lines]),
      ...DAMAGE_WORDS.map((d) => d.word),
      ...STICKERS.microbus
    ].join(' | ');
    // whole words only: «بسبوسة» (the sweet) is fine
    for (const b of banned) expect(new RegExp(`(^|[\\s|،.!؟?])${b}($|[\\s|،.!؟?])`).test(text), b).toBe(false);
  });

  it('covers every district with a landmark situation', () => {
    for (const d of Object.keys(DISTRICT_STYLES)) {
      const id = LANDMARK_BARK[d];
      expect(id, d).toBeDefined();
      expect(BARKS[id!]).toBeDefined();
    }
  });

  it('every shop in the street has a shopkeeper line', () => {
    const shops = ['صيدلية', 'مخبز', 'كافيه', 'سوبر ماركت', 'مطعم', 'ملابس', 'موبايلات', 'حلويات', 'بنك', 'مكتبة'];
    for (const n of shops) {
      expect(SHOP_BARK[n], n).toBeDefined();
      expect(BARKS[SHOP_BARK[n]!].who, n).toEqual(['shopkeeper']);
    }
  });

  it('covers what happens in the game: time of day, the Nile, the bridge, the tower, rank, crashes, the siren', () => {
    for (const id of [
      'timeMorning',
      'timeNoon',
      'timeSunset',
      'timeNight',
      'nileView',
      'bridgeCrossing',
      'towerView',
      'rankLow',
      'rankHigh',
      'crashLight',
      'crashHeavy',
      'sirenOn',
      'chaseNear',
      'shotFired',
      'cuffing',
      'parkedBadly',
      'officerPasses'
    ])
      expect(BARKS[id as keyof typeof BARKS], id).toBeDefined();
  });
});

describe('patrol car marking and status words', () => {
  it('the patrol car carries only official markings; the joke slogans are for microbuses', () => {
    expect(PATROL_MARKINGS.rearTop).toBe('شرطة');
    expect(PATROL_MARKINGS.rear).toContain('122');
    expect(Object.keys(STICKERS)).toEqual(['microbus']);
    for (const s of STICKERS.microbus) {
      expect(s.length, s).toBeLessThanOrEqual(30);
      expect(words(s), s).toBeLessThanOrEqual(6);
    }
  });

  it('damage words are plain and serious', () => {
    const ok = /^(سليمة|ضرر (طفيف|متوسط|كبير|شديد)|غير صالحة للسير)$/;
    for (const d of DAMAGE_WORDS) expect(ok.test(d.word), d.word).toBe(true);
    expect(VOCATIVES.length).toBeGreaterThanOrEqual(3);
  });
});
