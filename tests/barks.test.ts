import { describe, it, expect } from 'vitest';
import { BARK_COOLDOWN, BARK_GAP, createBarkState, damageWord, fillVocative, pickBark } from '../src/game/logic/barks';
import { BARKS, DAMAGE_WORDS, LANDMARK_BARK, STICKERS, VOCATIVES, VOICES } from '../src/game/config/barks';
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

describe('bark data', () => {
  const all = Object.entries(BARKS);

  it('every situation has 2-4 short variants (2-5 words) and a known voice', () => {
    for (const [id, s] of all) {
      expect(s.lines.length, id).toBeGreaterThanOrEqual(2);
      expect(s.lines.length, id).toBeLessThanOrEqual(4);
      expect(VOICES[s.voice], id).toBeDefined();
      for (const l of s.lines) {
        expect(words(l), `${id}: ${l}`).toBeGreaterThanOrEqual(2);
        expect(words(l), `${id}: ${l}`).toBeLessThanOrEqual(5);
      }
    }
  });

  it('has no duplicate lines anywhere', () => {
    const flat = all.flatMap(([, s]) => [...s.lines]);
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
      ...DAMAGE_WORDS.map((d) => d.word),
      ...STICKERS.patrol,
      ...STICKERS.microbus
    ].join(' | ');
    for (const b of banned) expect(text.includes(b), b).toBe(false);
  });

  it('covers every district with a landmark situation', () => {
    for (const d of Object.keys(DISTRICT_STYLES)) {
      const id = LANDMARK_BARK[d];
      expect(id, d).toBeDefined();
      expect(BARKS[id!]).toBeDefined();
    }
  });

  it('has a few vocatives and stickers that fit on a plaque', () => {
    expect(VOCATIVES.length).toBeGreaterThanOrEqual(3);
    for (const s of [...STICKERS.patrol, ...STICKERS.microbus]) {
      expect(s.length, s).toBeLessThanOrEqual(30);
      expect(words(s), s).toBeLessThanOrEqual(6);
    }
  });
});
