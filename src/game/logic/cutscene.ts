/**
 * Cutscene maths and dialogue timing (pure, unit-tested).
 * Shots are authored in a local frame (x = side, y = up, z = forward along the frame's yaw)
 * so the same script works wherever the mission happens to be.
 */
export type Vec3 = readonly [number, number, number];

/** A point on the ground plus a facing (radians, three.js rotation.y convention: forward = (sin, cos)). */
export interface Frame {
  x: number;
  z: number;
  yaw: number;
}

/** What a shot is framed around: the mission location, the officer (or the car he is driving), or the patrol car. */
export type Anchor = 'scene' | 'hero' | 'car';

export interface ShotDef {
  anchor: Anchor;
  /** camera position at the start of the shot */
  from: Vec3;
  /** camera position at the end of the shot (defaults to `from`, i.e. a locked-off shot) */
  to?: Vec3;
  /** look-at point at the start */
  look: Vec3;
  /** look-at point at the end (defaults to `look`) */
  lookTo?: Vec3;
  /** seconds to travel from `from` to `to`; the camera holds on `to` afterwards */
  dur?: number;
  /** seconds to glide in from the previous camera instead of cutting */
  blend?: number;
  fov?: number;
}

export interface Pose {
  px: number;
  py: number;
  pz: number;
  lx: number;
  ly: number;
  lz: number;
  fov: number;
}

export const DEFAULT_FOV = 48;
export const DEFAULT_SHOT_DUR = 5;

export const newPose = (): Pose => ({ px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0, fov: DEFAULT_FOV });

/** Smoothstep: eases in and out so rails never start or stop with a jolt. */
export const ease = (t: number) => {
  const c = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return c * c * (3 - 2 * c);
};

/** Local offset → world [x, z] for a frame. Side axis is (cos yaw, -sin yaw), forward is (sin yaw, cos yaw). */
export function localToWorld(f: Frame, v: Vec3): [number, number] {
  const s = Math.sin(f.yaw);
  const c = Math.cos(f.yaw);
  return [f.x + v[0] * c + v[2] * s, f.z - v[0] * s + v[2] * c];
}

/** Camera pose for a shot `t` seconds in. */
export function shotPose(shot: ShotDef, f: Frame, t: number, out: Pose = newPose()): Pose {
  const k = ease(t / (shot.dur ?? DEFAULT_SHOT_DUR));
  const a = shot.from;
  const b = shot.to ?? a;
  const la = shot.look;
  const lb = shot.lookTo ?? la;
  const p: Vec3 = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const l: Vec3 = [la[0] + (lb[0] - la[0]) * k, la[1] + (lb[1] - la[1]) * k, la[2] + (lb[2] - la[2]) * k];
  const [px, pz] = localToWorld(f, p);
  const [lx, lz] = localToWorld(f, l);
  out.px = px;
  out.py = p[1];
  out.pz = pz;
  out.lx = lx;
  out.ly = l[1];
  out.lz = lz;
  out.fov = shot.fov ?? DEFAULT_FOV;
  return out;
}

/** out = a + (b - a) * k (out may alias a or b). */
export function lerpPose(a: Pose, b: Pose, k: number, out: Pose): Pose {
  out.px = a.px + (b.px - a.px) * k;
  out.py = a.py + (b.py - a.py) * k;
  out.pz = a.pz + (b.pz - a.pz) * k;
  out.lx = a.lx + (b.lx - a.lx) * k;
  out.ly = a.ly + (b.ly - a.ly) * k;
  out.lz = a.lz + (b.lz - a.lz) * k;
  out.fov = a.fov + (b.fov - a.fov) * k;
  return out;
}

// ---------------- dialogue timing ----------------

/** characters per second for the typewriter */
export const TYPE_CPS = 38;

/** How long a fully typed line stays up before moving on by itself. */
export const holdFor = (len: number) => 1.6 + len * 0.035;

export interface DialogueState {
  /** current line index; equal to the line count once finished */
  idx: number;
  /** seconds since the current line started typing */
  t: number;
}

export const newDialogue = (): DialogueState => ({ idx: 0, t: 0 });

/** Visible characters (code points) of a line of `len` after `t` seconds. */
export const revealed = (len: number, t: number, cps = TYPE_CPS) => Math.max(0, Math.min(len, Math.floor(t * cps)));

export const isTyping = (s: DialogueState, len: number) => revealed(len, s.t) < len;

/** Advance the clock; moves to the next line once the current one has been fully shown for its hold time. */
export function tickDialogue(s: DialogueState, dt: number, lens: readonly number[]): DialogueState {
  if (s.idx >= lens.length) return s;
  s.t += dt;
  const len = lens[s.idx];
  if (s.t >= len / TYPE_CPS + holdFor(len)) {
    s.idx++;
    s.t = 0;
  }
  return s;
}

/** Tap / click / Space: finish typing the current line first, then go to the next one. */
export function tapDialogue(s: DialogueState, lens: readonly number[]): DialogueState {
  if (s.idx >= lens.length) return s;
  const len = lens[s.idx];
  if (isTyping(s, len)) s.t = (len + 0.5) / TYPE_CPS;
  else {
    s.idx++;
    s.t = 0;
  }
  return s;
}

export const dialogueDone = (s: DialogueState, count: number) => s.idx >= count;
