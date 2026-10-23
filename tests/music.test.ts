import { describe, expect, it } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { MUSIC, musicForMode, musicUrl } from '../src/game/logic/music';

describe('recorded music', () => {
  it('has a track for every mode and the menu', () => {
    expect(musicForMode('taxi')).toBe('taxi');
    expect(musicForMode('police')).toBe('police');
    expect(musicForMode('free')).toBe('free');
    expect(MUSIC.menu.file).toBeTruthy();
  });
  it('ships small m4a and ogg files that are at least one loop long', () => {
    for (const t of Object.values(MUSIC)) {
      for (const ext of ['m4a', 'ogg']) {
        const f = `public/music/${t.file}.${ext}`;
        expect(existsSync(f), f).toBe(true);
        expect(statSync(f).size).toBeLessThan(1.2 * 1024 * 1024);
      }
      expect(t.loop).toBeGreaterThan(30);
    }
  });
  it('picks AAC where it plays and Ogg elsewhere', () => {
    expect(musicUrl(MUSIC.taxi, () => 'probably')).toBe('/music/taxi-salma.m4a');
    expect(musicUrl(MUSIC.taxi, () => '')).toBe('/music/taxi-salma.ogg');
  });
});
