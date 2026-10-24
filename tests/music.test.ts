import { describe, expect, it } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import {
  MUSIC,
  musicForMode,
  musicUrl,
  nextRadio,
  playlistFor,
  radioLabel,
  sanitizeRadio
} from '../src/game/logic/music';

describe('recorded music', () => {
  it('has music for every mode and the menu', () => {
    expect(musicForMode('taxi')).toBe('taxi');
    expect(musicForMode('police')).toBe('police');
    expect(musicForMode('free')).toBe('free');
    for (const t of Object.values(MUSIC)) expect(t.files.length).toBeGreaterThan(0);
  });
  it('ships every file as m4a and ogg, under 4 MB each', () => {
    for (const t of Object.values(MUSIC))
      for (const f of t.files)
        for (const ext of ['m4a', 'ogg']) {
          const p = `public/music/${f.file}.${ext}`;
          expect(existsSync(p), p).toBe(true);
          expect(statSync(p).size).toBeLessThan(4 * 1024 * 1024);
          expect(f.loop).toBeGreaterThan(30);
        }
  });
  it('picks AAC where it plays and Ogg elsewhere', () => {
    const f = MUSIC.menu.files[0]!;
    expect(musicUrl(f, () => 'probably')).toBe('/music/menu-desert-city.m4a');
    expect(musicUrl(f, () => '')).toBe('/music/menu-desert-city.ogg');
  });
  it("plays the owner's track first while driving", () => {
    expect(MUSIC.taxi.files[0]!.file).toBe('taxi-user-main');
    expect(MUSIC.free.files[0]!.file).toBe('taxi-user-main');
    expect(MUSIC.taxi.files[1]!.file).toBe('taxi-user-main2');
  });
  it('lets the driver pick the radio station', () => {
    expect(radioLabel('taxi-user-main')).toBe('تراك ١');
    expect(nextRadio('auto')).toBe('taxi-user-main');
    expect(nextRadio('taxi-user-main')).toBe('taxi-user-main2');
    expect(nextRadio('off')).toBe('auto');
    expect(playlistFor('taxi', 'off')).toEqual([]);
    expect(playlistFor('police', 'taxi-user-main2').map((f) => f.file)).toEqual(['taxi-user-main2']);
    expect(playlistFor('menu', 'off')).toBe(MUSIC.menu.files);
    expect(sanitizeRadio('junk')).toBe('auto');
  });
});
