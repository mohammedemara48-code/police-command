import { describe, expect, it } from 'vitest';
import { DRIVER_LINES, driverLine, jamTick, rollMood } from '../src/game/logic/driverMood';

describe('driver mood', () => {
  it('has both moods for every event, clean', () => {
    for (const m of ['angry', 'witty'] as const)
      for (const lines of Object.values(DRIVER_LINES[m])) {
        expect(lines.length).toBeGreaterThan(1);
        for (const l of lines) expect(l).not.toMatch(/(^|\s)(كس|متناك|شرموط|خول)(\s|$)/);
      }
  });
  it('rolls both moods and differs in tone', () => {
    expect(rollMood(() => 0.1)).toBe('angry');
    expect(rollMood(() => 0.9)).toBe('witty');
    expect(driverLine('angry', 'jam', undefined, () => 0)).not.toBe(driverLine('witty', 'jam', undefined, () => 0));
  });
  it('does not repeat the last line', () => {
    const a = driverLine('witty', 'bump', undefined, () => 0);
    expect(driverLine('witty', 'bump', a, () => 0)).not.toBe(a);
  });
  it('fires a jam line after sitting still', () => {
    let t = 0,
      fired = 0;
    for (let i = 0; i < 100; i++) {
      const r = jamTick(t, 0, 0.1);
      t = r.t;
      if (r.fire) fired++;
    }
    expect(fired).toBe(1);
    expect(jamTick(5, 10, 0.1).t).toBe(0);
  });
});
