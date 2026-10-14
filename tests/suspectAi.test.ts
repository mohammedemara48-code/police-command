import { describe, it, expect } from 'vitest';
import {
  newCarAi,
  stepCarAi,
  carCmd,
  ramLanded,
  ramCooldown,
  FIRST_RAM,
  SWIPE_T,
  type CarSense,
  type CarCmd
} from '../src/game/logic/suspectCar';
import {
  newGunman,
  stepGunman,
  pickCover,
  shielded,
  spotX,
  spotZ,
  isHidden,
  footStep,
  segHitsCrate,
  pushFromCrate,
  aimFactor,
  type Cover,
  type FootSense
} from '../src/game/logic/cover';
import { hitDamage } from '../src/game/logic/driving';

const always = () => 0;
const never = () => 0.999;
const sense = (o: Partial<CarSense> = {}): CarSense => ({
  lx: 3,
  lz: 0,
  inCar: true,
  pSpeed: 14,
  lock: 0,
  spun: false,
  caught: false,
  skill: 0.5,
  ...o
});
const cmd: CarCmd = { speedMul: 1, lat: 0, yawOff: 0 };

/** run the car brain for `sec` seconds at 60 fps */
function run(ai: ReturnType<typeof newCarAi>, s: CarSense, sec: number, rnd = always) {
  const seen = new Set<string>();
  for (let t = 0; t < sec; t += 1 / 60) seen.add(stepCarAi(ai, s, 1 / 60, rnd));
  return seen;
}

describe('suspect car', () => {
  it('no ram in the first seconds of a chase', () => {
    const ai = newCarAi();
    expect(run(ai, sense(), FIRST_RAM - 0.5).has('ram')).toBe(false);
    expect(run(ai, sense(), 1).has('ram')).toBe(true);
  });
  it('swipes toward the side the patrol car is on, then cools down', () => {
    const ai = newCarAi();
    ai.cool = 0;
    expect(stepCarAi(ai, sense({ lx: -3 }), 1 / 60, always)).toBe('ram');
    expect(ai.side).toBe(-1);
    carCmd(ai, 0.5, cmd);
    expect(cmd.lat).toBeLessThan(0);
    expect(cmd.yawOff).toBeLessThan(0);
    run(ai, sense({ lx: -3 }), SWIPE_T + 0.1);
    expect(ai.mode).not.toBe('ram');
    expect(ai.cool).toBeGreaterThan(5);
  });
  it('one hit per ram', () => {
    const ai = newCarAi();
    ai.cool = 0;
    stepCarAi(ai, sense(), 1 / 60, always);
    ramLanded(ai);
    run(ai, sense(), 0.2, never);
    expect(ai.mode).not.toBe('ram');
  });
  it('brake checks when tailgated', () => {
    const ai = newCarAi();
    ai.cool = 0;
    expect(stepCarAi(ai, sense({ lx: 0, lz: -6 }), 1 / 60, always)).toBe('ram');
    expect(ai.side).toBe(0);
    expect(carCmd(ai, 0.5, cmd).speedMul).toBeLessThan(1);
    expect(cmd.lat).toBe(0);
  });
  it('never rams while spun out, boxed in, caught, or when you are on foot', () => {
    const mk = () => Object.assign(newCarAi(), { cool: 0 });
    expect(run(mk(), sense({ spun: true }), 3).has('ram')).toBe(false);
    expect(run(mk(), sense({ lock: 0.6 }), 3)).toEqual(new Set(['boxed']));
    expect(run(mk(), sense({ caught: true }), 3)).toEqual(new Set(['surrender']));
    expect(run(mk(), sense({ inCar: false }), 3).has('ram')).toBe(false);
    // once caught it stays caught
    const ai = mk();
    stepCarAi(ai, sense({ caught: true }), 0.1);
    expect(stepCarAi(ai, sense(), 0.1)).toBe('surrender');
  });
  it('far away it just flees; on its tail it evades', () => {
    const ai = newCarAi();
    expect(stepCarAi(ai, sense({ lx: 0, lz: -40 }), 0.1)).toBe('flee');
    expect(stepCarAi(ai, sense({ lx: 0, lz: -10 }), 0.1, never)).toBe('evade');
  });
  it('harder chases ram more often', () => {
    expect(ramCooldown(1)).toBeLessThan(ramCooldown(0));
    const count = (skill: number) => {
      const ai = newCarAi();
      let rams = 0,
        prev = ai.mode;
      let seed = 7;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let t = 0; t < 120; t += 1 / 60) {
        const m = stepCarAi(ai, sense({ skill }), 1 / 60, rnd);
        if (m === 'ram' && prev !== 'ram') rams++;
        prev = m;
      }
      return rams;
    };
    expect(count(1)).toBeGreaterThan(count(0));
    // but never a pile-on: at most one ram every 7 s even on the hardest chase
    expect(count(1)).toBeLessThanOrEqual(Math.ceil(120 / 7));
  });
  it('a swipe costs only a few percent of damage', () => {
    const ai = Object.assign(newCarAi(), { cool: 0 });
    stepCarAi(ai, sense({ skill: 1 }), 1 / 60, always);
    const lat = Math.abs(carCmd(ai, 1, cmd).lat);
    expect(hitDamage(lat)).toBeLessThanOrEqual(8);
    expect(lat).toBeGreaterThan(3);
  });
});

describe('gunman cover', () => {
  const S = (o: Partial<FootSense> = {}): FootSense => ({ sx: 0, sz: 1, px: 0, pz: -15, skill: 0.5, ...o });
  it('crouch spot is behind the crate as seen from the officer', () => {
    const c: Cover = { x: 0, z: 0, by: -1 };
    expect(spotZ(c, 0, -15)).toBeGreaterThan(0.4);
    expect(spotX(c, 0, -15)).toBeCloseTo(0);
    // from the side the crate is wider, so the spot sits further out
    expect(spotX(c, -15, 0)).toBeGreaterThan(1.2);
  });
  it('cover only counts when the crate is between him and the officer', () => {
    const c: Cover = { x: 0, z: 0, by: -1 };
    expect(shielded(c, 0, 0.9, 0, -15)).toBe(true);
    expect(shielded(c, 0, 0.9, 0, 15)).toBe(false); // officer behind him
    expect(shielded(c, 0, 0.9, 12, 0.9)).toBe(false); // officer flanked round the side
    expect(shielded(c, 0, 6, 0, -15)).toBe(false); // too far from the crate to duck behind it
  });
  it('picks the nearest free crate that is not next to the officer', () => {
    const covers: Cover[] = [
      { x: 0, z: -12, by: -1 }, // next to the officer
      { x: 4, z: 0, by: 1 }, // taken
      { x: -6, z: 2, by: -1 },
      { x: 30, z: 0, by: -1 } // too far
    ];
    expect(pickCover(covers, 0, 3, 1, 0, -15)).toBe(2);
    expect(pickCover(covers, 1, 3, 1, 0, -15)).toBe(1);
    expect(pickCover(covers, 0, 3, 1, 0, -15, 2)).toBe(-1);
  });
  it('runs to cover, hides, peeks, and is only hidden while crouched behind it', () => {
    const covers: Cover[] = [{ x: 0, z: 0, by: -1 }];
    const g = newGunman();
    const p = { x: 2, z: 3 };
    let hiddenSeen = false,
      peekSeen = false;
    for (let t = 0; t < 8; t += 1 / 30) {
      const s = S({ sx: p.x, sz: p.z });
      stepGunman(g, 0, covers, s, 1 / 30, never);
      footStep(g, covers, s, Math.hypot(p.x, p.z + 15), 1 / 30, p);
      if (g.mode === 'hide') hiddenSeen ||= isHidden(g, covers, S({ sx: p.x, sz: p.z }));
      if (g.mode === 'peek') {
        peekSeen = true;
        expect(isHidden(g, covers, S({ sx: p.x, sz: p.z }))).toBe(false);
      }
    }
    expect(hiddenSeen).toBe(true);
    expect(peekSeen).toBe(true);
    expect(covers[0]!.by).toBe(0);
  });
  it('moves when the officer works round the crate', () => {
    const covers: Cover[] = [
      { x: 0, z: 0, by: 0 },
      { x: -7, z: 3, by: -1 }
    ];
    const g = Object.assign(newGunman(), { mode: 'hide' as const, cover: 0, t: 1 });
    // officer now level with him on the right: crate no longer covers him
    stepGunman(g, 0, covers, S({ sx: 0, sz: 0.9, px: 14, pz: 0.9 }), 1 / 30, never);
    expect(g.mode).toBe('move');
  });
  it('a hostage taker never leaves his crate', () => {
    const covers: Cover[] = [
      { x: 0, z: 0, by: 0 },
      { x: -5, z: 2, by: -1 }
    ];
    const g = Object.assign(newGunman(true), { mode: 'peek' as const, cover: 0, t: 0, peeks: 5 });
    for (let k = 0; k < 200; k++) {
      stepGunman(g, 0, covers, S({ sx: 0, sz: 0.9, px: 14, pz: 0.9 }), 1 / 20, always);
      expect(g.mode === 'hide' || g.mode === 'peek').toBe(true);
      expect(g.cover).toBe(0);
    }
  });
  it('after a couple of peeks he changes cover or flanks', () => {
    const covers: Cover[] = [
      { x: 0, z: 0, by: 0 },
      { x: -5, z: 1, by: -1 }
    ];
    const g = Object.assign(newGunman(), { mode: 'peek' as const, cover: 0, t: 0, peeks: 1 });
    stepGunman(g, 0, covers, S({ sz: 0.9 }), 1 / 30, always);
    expect(g.mode === 'move' || g.mode === 'flank').toBe(true);
    expect(covers[0]!.by).toBe(-1);
  });
  it('flanking sidesteps across the officer line and aims worse', () => {
    const g = Object.assign(newGunman(), { mode: 'flank' as const, side: 1, t: 1 });
    const out = { x: 0, z: 0 };
    footStep(g, [], S({ sx: 0, sz: 0 }), 15, 0.5, out);
    expect(Math.abs(out.x)).toBeGreaterThan(1);
    expect(aimFactor('flank')).toBeLessThan(aimFactor('peek'));
    expect(aimFactor('move')).toBe(0);
  });
  it('runs round the crate rather than through it', () => {
    const c: Cover = { x: 0, z: 0, by: 0 };
    expect(segHitsCrate(0, -1.5, 0, 1.2, c)).toBe(true);
    expect(segHitsCrate(-2, -1.5, -2, 1.2, c)).toBe(false);
    const g = Object.assign(newGunman(), { mode: 'move' as const, cover: 0, tx: 0, tz: 1, t: 6 });
    const p = { x: 0.1, z: -1.4 };
    for (let k = 0; k < 120 && Math.hypot(p.x - g.tx, p.z - g.tz) > 0.3; k++) {
      footStep(g, [c], S({ sx: p.x, sz: p.z }), 15, 1 / 30, p);
      expect(Math.abs(p.x) < 0.85 + 0.3 && Math.abs(p.z) < 0.4 + 0.3).toBe(false);
    }
    expect(Math.hypot(p.x - g.tx, p.z - g.tz)).toBeLessThan(0.3);
  });
  it('pushes people out of crates', () => {
    const p = { x: 0.2, z: 0.3 };
    expect(pushFromCrate(p, { x: 0, z: 0, by: -1 })).toBe(true);
    expect(p.z).toBeCloseTo(0.75);
    expect(pushFromCrate({ x: 3, z: 0 }, { x: 0, z: 0, by: -1 })).toBe(false);
  });
});
