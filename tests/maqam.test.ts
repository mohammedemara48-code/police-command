import { describe, it, expect } from 'vitest';
import {
  TRACKS,
  HIJAZ,
  RAST,
  MAQSUM,
  SAIDI,
  composeLoop,
  degToMidi,
  midiToHz,
  rng,
  type Loop,
  type TrackId
} from '../src/game/logic/maqam';

const IDS: TrackId[] = ['menu', 'taxi', 'police'];

describe('maqamat', () => {
  it('hijaz has the augmented second, rast the neutral (quarter-tone) third and seventh', () => {
    expect(HIJAZ[2]! - HIJAZ[1]!).toBe(3);
    expect(RAST[2]! % 1).toBe(0.5);
    expect(RAST[6]! % 1).toBe(0.5);
    expect(RAST).toHaveLength(7);
    expect(HIJAZ).toHaveLength(7);
  });
  it('degrees climb through the octave and a quarter tone lands between two piano keys', () => {
    const m = TRACKS.taxi.maqam;
    expect(degToMidi(m, 0)).toBe(m.root);
    expect(degToMidi(m, 7)).toBe(m.root + 12);
    expect(degToMidi(m, -7)).toBe(m.root - 12);
    expect(degToMidi(m, 2)).toBe(m.root + 3.5);
    expect(midiToHz(69)).toBeCloseTo(440, 6);
    expect(midiToHz(degToMidi(m, 2))).toBeGreaterThan(midiToHz(m.root + 3));
    expect(midiToHz(degToMidi(m, 2))).toBeLessThan(midiToHz(m.root + 4));
  });
});

describe('rhythms', () => {
  it('maqsum is Dum Tak . Tak Dum . Tak . and saidi is Dum Tak . Dum Dum . Tak .', () => {
    expect(MAQSUM.bar.join('')).toBe('DT.TD.T.');
    expect(SAIDI.bar.join('')).toBe('DT.DD.T.');
  });
  it('every loop has a drum step for each eighth note and keeps the dum on the downbeat', () => {
    for (const id of IDS) {
      const l = composeLoop(TRACKS[id]);
      expect(l.drums).toHaveLength(l.steps);
      for (let b = 0; b < TRACKS[id].bars; b++) expect(l.drums[b * 8]).toBe('D');
    }
  });
});

describe('the composed loops', () => {
  const loops = (): Loop[] => IDS.map((id) => composeLoop(TRACKS[id], 0));
  it('are deterministic for a seed and different from one variant to the next', () => {
    expect(composeLoop(TRACKS.taxi, 2)).toEqual(composeLoop(TRACKS.taxi, 2));
    expect(composeLoop(TRACKS.taxi, 1).lead).not.toEqual(composeLoop(TRACKS.taxi, 2).lead);
  });
  it('keep every melody note inside the loop, inside the playing range and on the scale', () => {
    for (const l of loops()) {
      expect(l.lead.length).toBeGreaterThan(l.spec.bars * 1.5);
      for (const n of l.lead) {
        expect(n.at).toBeGreaterThanOrEqual(0);
        expect(n.at + n.len).toBeLessThanOrEqual(l.steps);
        expect(n.deg).toBeGreaterThanOrEqual(-3);
        expect(n.deg).toBeLessThanOrEqual(9);
        const midi = degToMidi(l.spec.maqam, n.deg);
        const pc = (((midi - l.spec.maqam.root) % 12) + 12) % 12;
        expect(l.spec.maqam.steps).toContain(pc);
      }
    }
  });
  it('do not overlap their own notes, and come home to the tonic on the last note', () => {
    for (let v = 0; v < 6; v++) {
      for (const id of IDS) {
        const l = composeLoop(TRACKS[id], v);
        for (let i = 1; i < l.lead.length; i++)
          expect(l.lead[i]!.at).toBeGreaterThanOrEqual(l.lead[i - 1]!.at + l.lead[i - 1]!.len);
        expect(l.lead[l.lead.length - 1]!.deg).toBe(0);
      }
    }
  });
  it('put the bass on the drum dums', () => {
    for (const l of loops()) {
      expect(l.bass.length).toBeGreaterThan(0);
      for (const n of l.bass) expect(l.drums[n.at]).toBe('D');
    }
  });
  it('make three different pieces: own key, tempo and rhythm for menu, taxi and police', () => {
    const [m, t, p] = IDS.map((id) => TRACKS[id]);
    expect(new Set([m!.bpm, t!.bpm, p!.bpm]).size).toBe(3);
    expect(new Set([m!.maqam.root, t!.maqam.root, p!.maqam.root]).size).toBe(3);
    expect(p!.rhythm.name).toBe('saidi');
    expect(t!.rhythm.name).toBe('maqsum');
    expect(p!.bpm).toBeGreaterThan(t!.bpm);
    expect(t!.bpm).toBeGreaterThan(m!.bpm);
    // the lead lines are not the same tune
    expect(composeLoop(m!).lead).not.toEqual(composeLoop(t!).lead);
  });
  it('rng is repeatable and spread over 0..1', () => {
    const a = rng(5);
    const b = rng(5);
    let sum = 0;
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      sum += x;
    }
    expect(sum / 1000).toBeGreaterThan(0.45);
    expect(sum / 1000).toBeLessThan(0.55);
  });
});
