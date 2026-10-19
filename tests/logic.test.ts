import { describe, it, expect } from 'vitest';
import { previewOdds, resolveOdds } from '../src/game/logic/odds';
import {
  starsFor,
  xpFor,
  rankForXp,
  dispatchReward,
  reputationDelta,
  injureChance,
  RANKS
} from '../src/game/logic/rewards';
import { addRewards, spend, promoteCost } from '../src/game/logic/economy';

const base = {
  preferredHits: 0,
  powerSum: 0,
  equipment: 0,
  successBonus: 0,
  techs: {},
  swatBonus: 0,
  breachOrSwat: false,
  labWithInvestigations: false
};

describe('success odds', () => {
  it('preview is clamped to [0.15, 0.92]', () => {
    expect(previewOdds({ successBonus: -5, equipment: 0, techs: {}, swatBonus: 0 })).toBe(0.15);
    expect(previewOdds({ successBonus: 5, equipment: 0, techs: {}, swatBonus: 0 })).toBe(0.92);
    expect(previewOdds({ successBonus: 0, equipment: 0, techs: {}, swatBonus: 0 })).toBeCloseTo(0.48);
  });
  it('techs raise the preview', () => {
    const a = previewOdds({ successBonus: 0, equipment: 0, techs: {}, swatBonus: 0 });
    const b = previewOdds({
      successBonus: 0,
      equipment: 0,
      techs: { cctv: true, heli: true, lab: true },
      swatBonus: 0
    });
    expect(b - a).toBeCloseTo(0.17);
  });
  it('preferred units and power raise resolve odds, capped at 0.97', () => {
    expect(resolveOdds(base)).toBeCloseTo(0.4);
    expect(resolveOdds({ ...base, preferredHits: 1 })).toBeCloseTo(0.56);
    expect(resolveOdds({ ...base, preferredHits: 10, breachOrSwat: true, swatBonus: 1 })).toBe(0.97);
  });
  it('quick resolve punishes sending no units', () => {
    expect(resolveOdds({ ...base, quick: true, unitCount: 0 })).toBeCloseTo(0.3);
    expect(resolveOdds({ ...base, quick: true, unitCount: 2 })).toBeCloseTo(0.5);
  });
});

describe('rewards', () => {
  it('stars by time', () => {
    expect(starsFor(30, [45, 80])).toBe(3);
    expect(starsFor(60, [45, 80])).toBe(2);
    expect(starsFor(200, [45, 80])).toBe(1);
  });
  it('xp: story pays more than patrol', () => {
    expect(xpFor(3, false)).toBe(250);
    expect(xpFor(3, true)).toBe(150);
  });
  it('rank thresholds', () => {
    expect(rankForXp(0).name).toBe(RANKS[0].name);
    expect(rankForXp(299).name).toBe(RANKS[0].name);
    expect(rankForXp(300).name).toBe(RANKS[1].name);
    expect(rankForXp(99999).name).toBe(RANKS[RANKS.length - 1].name);
  });
  it('dispatch money, reputation and injury', () => {
    expect(dispatchReward(true, 1000, 1.25)).toBe(1250);
    expect(dispatchReward(false, 1000, 2)).toBe(0);
    expect(reputationDelta(true, 7, 5)).toBe(7);
    expect(reputationDelta(false, 7, 5)).toBe(7);
    expect(reputationDelta(false, 7, 1)).toBe(2);
    expect(injureChance(true, 0.4, 0.5)).toBeCloseTo(0.2);
    expect(injureChance(false, undefined, 0.5)).toBe(0.2);
  });
});

describe('economy', () => {
  const w = { budget: 1000, reputation: 95, score: 0 };
  it('spend refuses when broke', () => {
    expect(spend(w, 2000)).toBeNull();
    expect(spend(w, 400)?.budget).toBe(600);
  });
  it('rewards add money and clamp reputation to 100', () => {
    const r = addRewards(w, 500, 10);
    expect(r).toEqual({ budget: 1500, reputation: 100, score: 1000 });
  });
  it('promotion cost grows with level', () => {
    expect(promoteCost(1)).toBe(550);
    expect(promoteCost(3)).toBe(850);
  });
});

import { tutorialHint } from '../src/game/logic/tutorial';
describe('first-call tutorial', () => {
  const t = { inCar: false, radioShowing: false, touch: true } as const;
  it('stays quiet while the radio talks', () => {
    expect(tutorialHint({ ...t, step: 'car', radioShowing: true })).toBeNull();
  });
  it('walks through car → drive → exit → order → cuff', () => {
    expect(tutorialHint({ ...t, step: 'car' })?.act).toBe('car');
    expect(tutorialHint({ ...t, step: 'goto', inCar: true })?.n).toBe(2);
    expect(tutorialHint({ ...t, step: 'suspects', inCar: true })?.n).toBe(3);
    expect(tutorialHint({ ...t, step: 'suspects', targetState: 'idle', targetDist: 8 })?.act).toBe('order');
    expect(tutorialHint({ ...t, step: 'suspects', targetState: 'hands', targetDist: 6 })?.act).toBe('move');
    expect(tutorialHint({ ...t, step: 'suspects', targetState: 'hands', targetDist: 1.5 })?.act).toBe('cuff');
  });
  it('uses keyboard wording on desktop', () => {
    expect(tutorialHint({ ...t, touch: false, step: 'car' })?.text).toContain('E');
  });
});

import { buildSaveFile, parseSaveFile, mergePersisted, pickPersisted } from '../src/game/logic/save';
describe('save files', () => {
  it('round-trips only pc.* keys', () => {
    const f = buildSaveFile([
      ['pc.levels.v1', '{"unlocked":3}'],
      ['other', 'x']
    ]);
    const r = parseSaveFile(JSON.stringify(f));
    expect(r.ok && r.data).toEqual({ 'pc.levels.v1': '{"unlocked":3}' });
  });
  it('rejects junk', () => {
    expect(parseSaveFile('nope').ok).toBe(false);
    expect(parseSaveFile('{"format":"x","data":{}}').ok).toBe(false);
  });
  it('merges saved command state with type checks', () => {
    const fresh = { budget: 100, reputation: 50, techs: { cctv: false, heli: false }, running: false } as Record<
      string,
      unknown
    >;
    const m = mergePersisted(fresh, { budget: 999, reputation: 'bad', techs: { cctv: true }, running: true });
    expect(m).toEqual({ budget: 999, reputation: 50, techs: { cctv: true, heli: false }, running: false });
  });
  it('picks only persisted fields', () => {
    const s = { budget: 1, running: true } as never;
    expect(Object.keys(pickPersisted(s))).toContain('budget');
    expect(Object.keys(pickPersisted(s))).not.toContain('running');
  });
});

import { weekStart, addWeekly, boardName } from '../src/game/logic/weekly';
describe('weekly leaderboard', () => {
  it('weeks start on Monday UTC', () => {
    expect(weekStart(new Date('2026-10-13T22:00:00Z'))).toBe('2026-10-12');
    expect(weekStart(new Date('2026-10-18T23:59:00Z'))).toBe('2026-10-12');
    expect(weekStart(new Date('2026-10-19T00:00:00Z'))).toBe('2026-10-19');
  });
  it('resets the tally on a new week', () => {
    const a = addWeekly(null, 250, new Date('2026-10-13T10:00:00Z'));
    expect(addWeekly(a, 100, new Date('2026-10-14T10:00:00Z'))).toEqual({
      week: '2026-10-12',
      points: 350,
      missions: 2
    });
    expect(addWeekly(a, 100, new Date('2026-10-20T10:00:00Z')).points).toBe(100);
  });
  it('never shows the e-mail', () => {
    expect(boardName('', 'rose@example.com')).toBe('rose');
    expect(boardName('<b>Yasser</b>', 'x@y.z')).toBe('bYasser/b');
  });
});

import { stepLoco, followCamYaw, RUN, WALK } from '../src/game/logic/locomotion';
describe('on-foot locomotion', () => {
  const s0 = { vx: 0, vz: 0, yaw: 0 };
  it('accelerates smoothly instead of jumping to full speed', () => {
    const a = stepLoco(s0, 0, 1, 0, false, 0.05);
    expect(Math.hypot(a.vx, a.vz)).toBeCloseTo(0.8);
    let s = s0;
    for (let i = 0; i < 40; i++) s = stepLoco(s, 0, 1, 0, false, 0.05);
    expect(s.vz).toBeCloseTo(RUN, 1);
    let w = s0;
    for (let i = 0; i < 40; i++) w = stepLoco(w, 0, 0.6, 0, false, 0.05);
    expect(w.vz).toBeCloseTo(WALK * (0.6 / 0.92), 1);
  });
  it('is camera-relative: stick forward moves along the camera heading', () => {
    let s = s0;
    for (let i = 0; i < 40; i++) s = stepLoco(s, 0, 1, Math.PI / 2, true, 0.05);
    expect(s.vx).toBeCloseTo(RUN, 1);
    expect(Math.abs(s.vz)).toBeLessThan(0.01);
    expect(s.yaw).toBeCloseTo(Math.PI / 2, 2);
  });
  it('decelerates to a stop when the stick is released', () => {
    let s = { vx: 0, vz: RUN, yaw: 0 };
    s = stepLoco(s, 0, 0, 0, false, 0.1);
    expect(s.vz).toBeCloseTo(RUN - 2.2);
    for (let i = 0; i < 10; i++) s = stepLoco(s, 0, 0, 0, false, 0.1);
    expect(s.vz).toBe(0);
  });
  it('turns at a limited rate', () => {
    const s = stepLoco(s0, 1, 0, 0, false, 0.05);
    expect(Math.abs(s.yaw)).toBeCloseTo(0.55, 2);
  });
  it('camera follows only when moving away from it', () => {
    expect(followCamYaw(0, 0.5, 5, 0.1)).toBeGreaterThan(0);
    // a short strafe or step back holds the view...
    expect(followCamYaw(0, 1.6, 5, 0.1, 0.2)).toBe(0);
    expect(followCamYaw(0, 3, 5, 0.1, 0.2)).toBe(0);
    // ...but keep going that way and it comes round, slowly
    const side = followCamYaw(0, 1.6, 5, 0.1, 2);
    expect(side).toBeGreaterThan(0);
    expect(side).toBeLessThan(0.1);
    expect(followCamYaw(0, 1, 0.2, 0.1)).toBe(0);
    // running straight on, the view settles behind the player in about a second
    let c = 0;
    for (let i = 0; i < 60; i++) c = followCamYaw(c, 0.8, RUN, 1 / 60);
    expect(c).toBeGreaterThan(0.8 * 0.8);
  });
});

import { sanitizeChar, newerChar, recolorFor, weaponStats, modelFor, DEFAULT_CHAR } from '../src/game/logic/character';
describe('character profile', () => {
  it('sanitizes bad data to defaults', () => {
    expect(sanitizeChar(null)).toEqual(DEFAULT_CHAR);
    const c = sanitizeChar({ body: 'female', skin: 99, uniform: 2, weapon: 'rocket', hair: 3, t: 5 });
    expect(c).toEqual({ body: 'female', skin: 1, hair: 3, uniform: 2, weapon: 'pistol', t: 5 });
  });
  it('newer edit wins when syncing', () => {
    const a = { ...DEFAULT_CHAR, t: 10 },
      b = { ...DEFAULT_CHAR, body: 'female' as const, t: 20 };
    expect(newerChar(a, b)).toBe(b);
    expect(newerChar(b, a)).toBe(b);
    expect(newerChar(null, a)).toBe(a);
  });
  it('recolors the right materials per body', () => {
    expect(Object.keys(recolorFor(DEFAULT_CHAR))).toEqual(['Suit', 'Skin', 'Hair']);
    expect(recolorFor({ ...DEFAULT_CHAR, uniform: 2 }).Suit).toBe(0x3b6fb6);
    expect(modelFor({ ...DEFAULT_CHAR, body: 'female' })).toBe('cop_f');
  });
  it('weapons trade magazine size for damage fairly', () => {
    const p = weaponStats(DEFAULT_CHAR, 12, 1),
      r = weaponStats({ ...DEFAULT_CHAR, weapon: 'revolver' }, 12, 1),
      s = weaponStats({ ...DEFAULT_CHAR, weapon: 'smg' }, 12, 1);
    expect(p).toEqual({ mag: 12, dmg: 1, cool: 0.3 });
    expect(r.mag).toBe(6);
    expect(s.mag).toBe(24);
    // damage per second stays within ±25% of the pistol
    for (const w of [r, s]) expect(Math.abs(w.dmg / w.cool / (p.dmg / p.cool) - 1)).toBeLessThan(0.3);
  });
});

import { fleeSpeed, trimBehind, chaseOutcome, stepLock, LOCK_T } from '../src/game/logic/chase';
describe('chase fairness', () => {
  it('suspect is always slower than the player car, even on the hardest chase', () => {
    for (const k of [0.85, 1, 1.3])
      for (const t of [0, 20, 60])
        for (const dist of [5, 30, 100])
          expect(fleeSpeed({ t, k, playerMax: 18, dist, turn: 0 })).toBeLessThan(18 * 0.9);
  });
  it('brakes for corners and eases off when far', () => {
    const s = fleeSpeed({ t: 10, k: 1, playerMax: 18, dist: 30, turn: 0 });
    expect(fleeSpeed({ t: 10, k: 1, playerMax: 18, dist: 30, turn: Math.PI / 2 })).toBeLessThan(s * 0.6);
    expect(fleeSpeed({ t: 10, k: 1, playerMax: 18, dist: 100, turn: 0 })).toBeLessThan(s);
  });
  it('drops waypoints behind the car at start', () => {
    const p = trimBehind(
      [
        { x: 0, z: -10 },
        { x: 0, z: 0 },
        { x: 0, z: 60 }
      ],
      0,
      5,
      0
    );
    expect(p).toEqual([{ x: 0, z: 60 }]);
  });
  it('catch only counts in the car', () => {
    expect(chaseOutcome({ dist: 3, inCar: false, clock: 1, limit: 40, lock: LOCK_T })).toBe(null);
    expect(chaseOutcome({ dist: 3, inCar: true, clock: 1, limit: 40, lock: 0.5 })).toBe(null);
    expect(chaseOutcome({ dist: 3, inCar: true, clock: 1, limit: 40, lock: LOCK_T })).toBe('caught');
    expect(chaseOutcome({ dist: 200, inCar: true, clock: 1, limit: 40, lock: 0 })).toBe('escaped');
    expect(chaseOutcome({ dist: 50, inCar: true, clock: 41, limit: 40, lock: 0 })).toBe('timeout');
  });
  it('box-in meter fills close, drains slowly', () => {
    let l = 0;
    for (let i = 0; i < 6; i++) l = stepLock(l, 4, true, 0.1);
    expect(l).toBeCloseTo(0.6);
    l = stepLock(l, 20, true, 0.4);
    expect(l).toBeCloseTo(0.4);
    expect(stepLock(0.5, 4, false, 0.1)).toBeCloseTo(0.45);
  });
});

import { stepCar, driftOf, kmh, hitDamage, pullOver } from '../src/game/logic/driving';
describe('arcade driving', () => {
  const s0 = { speed: 0, yaw: 0, velYaw: 0 };
  const run = (s: typeof s0, i: Parameters<typeof stepCar>[1], n: number) => {
    for (let k = 0; k < n; k++) s = stepCar(s, i, 0.05);
    return s;
  };
  it('accelerates toward top speed and brakes hard', () => {
    const s = run(s0, { throttle: 1, steer: 0, handbrake: false, max: 18 }, 100);
    expect(s.speed).toBeGreaterThan(16);
    expect(s.speed).toBeLessThanOrEqual(18);
    const b = run(s, { throttle: -1, steer: 0, handbrake: false, max: 18 }, 10);
    expect(b.speed).toBeLessThan(s.speed - 9);
  });
  it('cannot turn when parked', () => {
    expect(run(s0, { throttle: 0, steer: 1, handbrake: false, max: 18 }, 20).yaw).toBe(0);
  });
  it('handbrake makes the car drift (heading lags the nose)', () => {
    const fast = { speed: 15, yaw: 0, velYaw: 0 };
    const grip = run(fast, { throttle: 1, steer: 1, handbrake: false, max: 18 }, 8);
    const drift = run(fast, { throttle: 1, steer: 1, handbrake: true, max: 18 }, 8);
    expect(driftOf(drift)).toBeGreaterThan(driftOf(grip) * 2);
  });
  it('damage lowers top speed', () => {
    const s = run(s0, { throttle: 1, steer: 0, handbrake: false, max: 18, damage: 100 }, 200);
    expect(s.speed).toBeLessThan(11);
  });
  it('helpers', () => {
    expect(kmh(10)).toBe(36);
    expect(hitDamage(2)).toBe(0);
    expect(hitDamage(13)).toBe(22);
    expect(pullOver(true, 20)).toBeGreaterThan(0);
    expect(pullOver(false, 20)).toBe(0);
  });
});

import { hubAllowed, nearDoor, repairTime, STATION } from '../src/game/logic/station';
describe('police station hub', () => {
  const at = { x: STATION.door.x, z: STATION.door.z };
  it('opens only on foot, calm, at the door', () => {
    expect(nearDoor(at.x, at.z)).toBe(true);
    expect(hubAllowed({ inCar: false, chasing: false, hostiles: 0, ...at })).toBe(true);
    expect(hubAllowed({ inCar: true, chasing: false, hostiles: 0, ...at })).toBe(false);
    expect(hubAllowed({ inCar: false, chasing: true, hostiles: 0, ...at })).toBe(false);
    expect(hubAllowed({ inCar: false, chasing: false, hostiles: 2, ...at })).toBe(false);
    expect(hubAllowed({ inCar: false, chasing: false, hostiles: 0, x: 0, z: 40 })).toBe(false);
  });
  it('repair time scales with damage', () => {
    expect(repairTime(0)).toBe(0);
    expect(repairTime(100)).toBe(4);
  });
});

import { stepPull, speederSpeed, passCheckpoint, PULL_T } from '../src/game/logic/missions';
describe('new mission types', () => {
  it('traffic stop needs siren, car and distance', () => {
    let m = 0;
    for (let i = 0; i < 30; i++) m = stepPull(m, { siren: true, inCar: true, dist: 15 }, 0.1);
    expect(m).toBe(PULL_T);
    expect(stepPull(0, { siren: false, inCar: true, dist: 15 }, 1)).toBe(0);
    expect(stepPull(0, { siren: true, inCar: true, dist: 60 }, 1)).toBe(0);
    expect(stepPull(2, { siren: false, inCar: true, dist: 15 }, 1)).toBeCloseTo(1.4);
  });
  it('speeder is catchable', () => {
    expect(speederSpeed(18, 0)).toBeLessThan(18 * 0.7);
    expect(speederSpeed(18, 1.5)).toBeLessThan(speederSpeed(18, 0));
    expect(speederSpeed(18, 0, 80)).toBeLessThan(speederSpeed(18, 0, 10) * 0.5);
  });
  it('checkpoints advance only in the car and in range', () => {
    const pts = [
      { x: 0, z: 0 },
      { x: 0, z: 50 }
    ];
    expect(passCheckpoint(0, pts, 2, 2, true)).toBe(1);
    expect(passCheckpoint(0, pts, 2, 2, false)).toBe(0);
    expect(passCheckpoint(1, pts, 2, 2, true)).toBe(1);
    expect(passCheckpoint(2, pts, 0, 50, true)).toBe(2);
  });
});

import { pushOut, resolve, resolveFoot } from '../src/game/logic/collide';
describe('on-foot collision vs cars', () => {
  const car = { x: 0, z: 0, yaw: 0, hw: 1, hl: 2.2 };
  it('pushes out of the side and leaves free space alone', () => {
    const o = pushOut(1.2, 0, 0.45, car);
    expect(o.hit).toBe(true);
    expect(o.x).toBeCloseTo(1.45);
    expect(o.z).toBeCloseTo(0);
    expect(pushOut(3, 0, 0.45, car).hit).toBe(false);
  });
  it('works for rotated cars and centres inside', () => {
    const rot = { ...car, yaw: Math.PI / 2 }; // long axis now along x
    const o = pushOut(0, 1.2, 0.45, rot);
    expect(Math.abs(o.z)).toBeCloseTo(1.45);
    const inside = pushOut(0.2, 0, 0.45, car);
    expect(inside.x).toBeGreaterThan(1.4);
  });
  it('slides: tangential motion is kept', () => {
    const r = resolve(1.3, 0.5, 0.45, [car]);
    expect(r.z).toBeCloseTo(0.5);
    expect(r.x).toBeCloseTo(1.45);
  });

  it('resolveFoot leaves a car even when the push lands off the sidewalk', () => {
    const car = { x: 7.5, z: 0, yaw: 0, hw: 1, hl: 2.2 };
    // officer overlapping the car near the kerb; walkable pad stops at |x|<=8.2 style
    const walk = (x: number, z: number) => Math.abs(x) <= 8.2 && Math.abs(z) < 200;
    const stuck = resolve(7.2, 0, 0.42, [car]);
    expect(stuck.hit).toBe(true);
    // old gate: if (!walkable(stuck)) keep officer inside — resolveFoot must still eject
    const out = resolveFoot(7.2, 0, 0.42, [car], walk);
    expect(out.hit).toBe(true);
    expect(Math.hypot(out.x - car.x, out.z - car.z)).toBeGreaterThan(1.0);
  });
  it('resolveFoot slides along a building front', () => {
    const wall = { x: 11.4, z: 20, yaw: 0, hw: 3, hl: 4.2 };
    const walk = (x: number) => Math.abs(x) <= 8.2;
    const r = resolveFoot(8.0, 20, 0.42, [wall], (x, z) => walk(x) && Math.abs(z) < 300);
    expect(r.hit).toBe(true);
    expect(r.x).toBeLessThanOrEqual(8.2);
    expect(r.z).toBeCloseTo(20, 0);
  });
});
