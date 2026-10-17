import { describe, it, expect } from 'vitest';
import {
  ease,
  localToWorld,
  shotPose,
  lerpPose,
  newPose,
  newDialogue,
  tickDialogue,
  tapDialogue,
  revealed,
  isTyping,
  dialogueDone,
  holdFor,
  TYPE_CPS,
  type ShotDef
} from '../src/game/logic/cutscene';
import { STORY_CUTSCENES, storyCutscene } from '../src/story/cutscenes';
import { SPEAKERS } from '../src/story/speakers';
import { LEVELS } from '../src/game/missions/Levels';

describe('camera rails', () => {
  it('eases from 0 to 1 and clamps outside', () => {
    expect(ease(-1)).toBe(0);
    expect(ease(0)).toBe(0);
    expect(ease(0.5)).toBeCloseTo(0.5);
    expect(ease(1)).toBe(1);
    expect(ease(3)).toBe(1);
  });

  it('maps local offsets through the frame yaw', () => {
    const f = { x: 10, z: 20, yaw: 0 };
    expect(localToWorld(f, [0, 0, 5])).toEqual([10, 25]);
    const [x, z] = localToWorld({ x: 0, z: 0, yaw: Math.PI }, [0, 0, 5]);
    expect(x).toBeCloseTo(0);
    expect(z).toBeCloseTo(-5);
    const [sx, sz] = localToWorld({ x: 0, z: 0, yaw: Math.PI / 2 }, [0, 0, 4]);
    expect(sx).toBeCloseTo(4);
    expect(sz).toBeCloseTo(0);
  });

  it('runs a shot from start to end and holds afterwards', () => {
    const shot: ShotDef = { anchor: 'scene', from: [0, 2, 0], to: [0, 10, 10], look: [0, 0, 20], dur: 4, fov: 40 };
    const f = { x: 0, z: 0, yaw: 0 };
    const a = shotPose(shot, f, 0);
    expect([a.px, a.py, a.pz]).toEqual([0, 2, 0]);
    expect(a.fov).toBe(40);
    const mid = shotPose(shot, f, 2);
    expect(mid.py).toBeCloseTo(6);
    const end = shotPose(shot, f, 4);
    const late = shotPose(shot, f, 99);
    expect(late).toEqual(end);
    expect(end.pz).toBeCloseTo(10);
  });

  it('a shot without `to` is locked off', () => {
    const shot: ShotDef = { anchor: 'hero', from: [1, 2, 3], look: [0, 1, 0] };
    expect(shotPose(shot, { x: 0, z: 0, yaw: 0 }, 0)).toEqual(shotPose(shot, { x: 0, z: 0, yaw: 0 }, 10));
  });

  it('blends two poses', () => {
    const a = newPose();
    const b = { ...newPose(), px: 10, fov: 60 };
    const out = lerpPose(a, b, 0.5, newPose());
    expect(out.px).toBe(5);
    expect(out.fov).toBe(54);
  });
});

describe('dialogue timing', () => {
  it('types characters at the set speed', () => {
    expect(revealed(10, 0)).toBe(0);
    expect(revealed(10, 2 / TYPE_CPS)).toBe(2);
    expect(revealed(10, 100)).toBe(10);
  });

  it('first tap completes the line, second goes to the next one', () => {
    const lens = [20, 5];
    const s = newDialogue();
    tickDialogue(s, 0.05, lens);
    expect(isTyping(s, 20)).toBe(true);
    tapDialogue(s, lens);
    expect(s.idx).toBe(0);
    expect(isTyping(s, 20)).toBe(false);
    tapDialogue(s, lens);
    expect(s.idx).toBe(1);
    expect(s.t).toBe(0);
    tapDialogue(s, lens);
    tapDialogue(s, lens);
    expect(dialogueDone(s, lens.length)).toBe(true);
    // extra taps after the end are harmless
    tapDialogue(s, lens);
    expect(s.idx).toBe(2);
  });

  it('moves on by itself after the hold time', () => {
    const lens = [10, 10];
    const s = newDialogue();
    const total = 10 / TYPE_CPS + holdFor(10);
    tickDialogue(s, total - 0.01, lens);
    expect(s.idx).toBe(0);
    tickDialogue(s, 0.02, lens);
    expect(s.idx).toBe(1);
  });
});

describe('story cutscene scripts', () => {
  it('every campaign mission has an intro and an outro', () => {
    for (const lv of LEVELS) {
      expect(storyCutscene(lv.id, 'intro'), `intro ${lv.id}`).toBeDefined();
      expect(storyCutscene(lv.id, 'outro'), `outro ${lv.id}`).toBeDefined();
    }
    expect(storyCutscene(101, 'intro')).toBeUndefined();
  });

  it('scripts are well formed', () => {
    const ids = new Set<string>();
    for (const scenes of Object.values(STORY_CUTSCENES)) {
      for (const def of [scenes.intro, scenes.outro]) {
        if (!def) continue;
        expect(ids.has(def.id), def.id).toBe(false);
        ids.add(def.id);
        expect(def.shots.length).toBeGreaterThan(0);
        expect(def.lines.length).toBeGreaterThan(0);
        for (const shot of def.shots) {
          for (const v of [shot.from, shot.to, shot.look, shot.lookTo])
            if (v) expect(v.every(Number.isFinite)).toBe(true);
          expect(shot.from[1]).toBeGreaterThan(0.3);
        }
        for (const l of def.lines) {
          expect(SPEAKERS[l.who], `${def.id} speaker ${l.who}`).toBeDefined();
          expect(l.text.trim().length).toBeGreaterThan(0);
          expect(l.en.trim().length).toBeGreaterThan(0);
          expect(/[\u0600-\u06FF]/.test(l.text), `${def.id}: Arabic text`).toBe(true);
          if (l.shot !== undefined) {
            expect(l.shot).toBeGreaterThanOrEqual(0);
            expect(l.shot).toBeLessThan(def.shots.length);
          }
        }
      }
    }
  });
});
