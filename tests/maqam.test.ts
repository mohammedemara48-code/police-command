import { describe, it, expect } from 'vitest';
import {
  BAR,
  HOOK_CELLS,
  LAYERS,
  LAYER_MIN,
  TRACKS,
  HIJAZ,
  RAST,
  NAHAWAND,
  MAQSUM,
  SAIDI,
  active,
  composeLoop,
  degToMidi,
  energyCurve,
  levelOf,
  midiToHz,
  rng,
  tempoMul,
  type Loop,
  type TrackId
} from '../src/game/logic/maqam';

const IDS: TrackId[] = ['menu', 'taxi', 'police'];

describe('maqamat', () => {
  it('hijaz has the augmented second, rast the neutral (quarter-tone) third and seventh, nahawand is the Arabic minor', () => {
    expect(HIJAZ[2]! - HIJAZ[1]!).toBe(3);
    expect(RAST[2]! % 1).toBe(0.5);
    expect(RAST[6]! % 1).toBe(0.5);
    expect(NAHAWAND).toEqual([0, 2, 3, 5, 7, 8, 10]);
    for (const s of [HIJAZ, RAST, NAHAWAND]) expect(s).toHaveLength(7);
  });
  it('degrees climb through the octave and a quarter tone lands between two piano keys', () => {
    const m = TRACKS.menu.maqam;
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
  it('maqsum and saidi keep their dum/tak skeleton on the sixteenth grid', () => {
    const eighths = (r: typeof MAQSUM) => r.bar.filter((_, i) => i % 2 === 0).join('');
    expect(eighths(MAQSUM)).toBe('DT.T D.T.'.replace(' ', ''));
    expect(eighths(SAIDI)).toBe('DT.DD.T.');
    expect(MAQSUM.bar).toHaveLength(BAR);
  });
});

describe('the grooves', () => {
  const loops = (): Loop[] => IDS.map((id) => composeLoop(TRACKS[id], 0));
  it('have every layer the full length of the loop, with velocities in 0..1', () => {
    for (const l of loops()) {
      for (const k of LAYERS) {
        expect(l.drums.layers[k]).toHaveLength(l.steps);
        for (const v of l.drums.layers[k]) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
      }
    }
  });
  it('keep the dum (or dhol) on every downbeat except where a fill rolls through', () => {
    for (const l of loops()) {
      for (let b = 0; b < l.spec.bars; b++) {
        const i = b * BAR;
        expect(l.drums.layers.dum[i]! + l.drums.layers.dhol[i]!).toBeGreaterThan(0);
      }
    }
  });
  it('are busy: many hits per bar across layers, and syncopated (hits on the off sixteenths)', () => {
    for (const l of loops()) {
      let hits = 0;
      let off = 0;
      for (const k of LAYERS)
        l.drums.layers[k].forEach((v, i) => {
          if (v > 0) {
            hits++;
            if (i % 4 !== 0) off++;
          }
        });
      expect(hits / l.spec.bars).toBeGreaterThan(20);
      expect(off / hits).toBeGreaterThan(0.6);
    }
  });
  it('ghost notes only fall where no dum or tak plays', () => {
    for (const l of loops())
      l.drums.layers.ka.forEach((v, i) => {
        if (v > 0) expect(l.drums.layers.dum[i]! + l.drums.layers.tak[i]!).toBe(0);
      });
  });
  it('roll a fill at the end of each four-bar phrase, bigger at the end of the loop, louder as it goes', () => {
    for (const l of loops()) {
      expect(l.drums.fills).toHaveLength(l.spec.bars / 4);
      const end = l.steps - 8;
      expect(l.drums.fills[1]).toBe(end);
      const taks = l.drums.layers.tak.slice(end).filter((v) => v > 0);
      expect(taks.length).toBeGreaterThanOrEqual(5);
      expect(taks[taks.length - 1]!).toBeGreaterThan(taks[0]!);
    }
  });
  it('the mahraganat track has a backbeat clap on 2 and 4, the others none', () => {
    const t = composeLoop(TRACKS.taxi);
    for (let b = 0; b < 8; b++) {
      expect(t.drums.layers.clap[b * BAR + 4]).toBe(1);
      expect(t.drums.layers.clap[b * BAR + 12]).toBe(1);
    }
    expect(composeLoop(TRACKS.police).drums.layers.clap.some((v) => v > 0)).toBe(false);
  });
});

describe('the bass and the hook', () => {
  it('bass notes stay in the loop, on the scale, and drive (several per bar)', () => {
    for (const id of IDS) {
      const l = composeLoop(TRACKS[id]);
      expect(l.bass.length / l.spec.bars).toBeGreaterThanOrEqual(4);
      for (const n of l.bass) {
        expect(n.at + n.len).toBeLessThanOrEqual(l.steps + 4);
        const pc = (((degToMidi(l.spec.maqam, n.deg) - l.spec.maqam.root) % 12) + 12) % 12;
        expect(l.spec.maqam.steps).toContain(pc);
      }
    }
  });
  it('every hook cell fills exactly one bar', () => {
    for (const c of HOOK_CELLS) expect(c.reduce((s, v) => s + v, 0)).toBe(BAR);
  });
  it('the hook repeats: bars 0 and 4 carry the same notes, and the loop ends on the tonic', () => {
    for (const id of IDS) {
      const l = composeLoop(TRACKS[id], 0);
      const bar = (b: number) =>
        l.hook.filter((n) => n.at >= b * BAR && n.at < (b + 1) * BAR).map((n) => [n.at - b * BAR, n.len, n.deg]);
      expect(bar(0)).toEqual(bar(4));
      expect(bar(1)).toEqual(bar(1));
      expect(bar(0).length).toBeGreaterThanOrEqual(5);
      expect(l.hook[l.hook.length - 1]!.deg).toBe(0);
    }
  });
  it('the hook has ornaments, stays inside the loop, on the scale and in range, and never overlaps itself', () => {
    for (let v = 0; v < 6; v++) {
      for (const id of IDS) {
        const l = composeLoop(TRACKS[id], v);
        expect(l.hook.filter((n) => n.orn).length).toBeGreaterThan(2);
        for (const n of l.hook) {
          expect(n.at + n.len).toBeLessThanOrEqual(l.steps);
          expect(n.deg).toBeGreaterThanOrEqual(-2);
          expect(n.deg).toBeLessThanOrEqual(10);
          const pc = (((degToMidi(l.spec.maqam, n.deg) - l.spec.maqam.root) % 12) + 12) % 12;
          expect(l.spec.maqam.steps).toContain(pc);
        }
        for (let i = 1; i < l.hook.length; i++)
          expect(l.hook[i]!.at).toBeGreaterThanOrEqual(l.hook[i - 1]!.at + l.hook[i - 1]!.len);
      }
    }
  });
  it('the same tune comes back each round with fresh ornaments; the notes do not change', () => {
    const a = composeLoop(TRACKS.taxi, 1);
    const b = composeLoop(TRACKS.taxi, 2);
    expect(a.hook.map((n) => [n.at, n.deg])).toEqual(b.hook.map((n) => [n.at, n.deg]));
    expect(a.hook.map((n) => n.orn)).not.toEqual(b.hook.map((n) => n.orn));
    expect(composeLoop(TRACKS.taxi, 2)).toEqual(composeLoop(TRACKS.taxi, 2));
  });
});

describe('energy: the loop builds and the game can open more layers', () => {
  it('the energy climbs over the loop, with one breath at the half, and peaks in the last bar', () => {
    const e = energyCurve(8);
    expect(e[7]).toBe(1);
    expect(e[7]!).toBeGreaterThan(e[0]! + 0.5);
    expect(e[4]!).toBeLessThan(e[3]!);
    for (let i = 1; i < 8; i++) if (i !== 4) expect(e[i]!).toBeGreaterThan(e[i - 1]!);
  });
  it('more intensity or a later bar never switches a layer off', () => {
    for (let i = 0; i < 10; i++) {
      for (const v of Object.keys(LAYER_MIN) as (keyof typeof LAYER_MIN)[]) {
        const lo = levelOf(0.3 + i * 0.07, 0.2);
        const hi = levelOf(0.3 + i * 0.07, 0.8);
        if (active(v, lo)) expect(active(v, hi)).toBe(true);
      }
    }
  });
  it('a quiet drive keeps the main layers; a full chase opens everything', () => {
    const calm = levelOf(0.35, 0.15);
    const chase = levelOf(0.9, 1);
    for (const v of ['dum', 'tak', 'bass', 'clap'] as const) expect(active(v, calm)).toBe(true);
    for (const v of Object.keys(LAYER_MIN) as (keyof typeof LAYER_MIN)[]) expect(active(v, chase)).toBe(true);
    expect(active('counter', calm)).toBe(false);
    expect(active('dhol', calm)).toBe(false);
  });
  it('tempo rises up to 10% with intensity and is clamped', () => {
    expect(tempoMul(0)).toBe(1);
    expect(tempoMul(1)).toBeCloseTo(1.1, 6);
    expect(tempoMul(5)).toBeCloseTo(1.1, 6);
    expect(tempoMul(-1)).toBe(1);
  });
});

describe('the three pieces', () => {
  it('are fast: every track at least 110 bpm, menu < taxi < police, own key, rhythm and scale', () => {
    const [m, t, p] = IDS.map((id) => TRACKS[id]);
    expect(Math.min(m!.bpm, t!.bpm, p!.bpm)).toBeGreaterThanOrEqual(110);
    expect(m!.bpm).toBeLessThan(t!.bpm);
    expect(t!.bpm).toBeLessThan(p!.bpm);
    expect(new Set([m!.maqam.root, t!.maqam.root, p!.maqam.root]).size).toBe(3);
    expect(new Set([m!.maqam.name, t!.maqam.name, p!.maqam.name]).size).toBe(3);
    expect(new Set([m!.rhythm.name, t!.rhythm.name, p!.rhythm.name]).size).toBe(3);
    expect(composeLoop(m!).hook).not.toEqual(composeLoop(t!).hook);
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
