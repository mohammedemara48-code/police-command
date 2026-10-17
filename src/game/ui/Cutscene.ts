/**
 * Letterboxed cutscene player: camera rails over the live city plus typewriter dialogue.
 * Tap / click / Space / Enter advances, «تخطي» skips. Input to the game is blocked by the
 * full-screen overlay while it runs; the HUD is hidden through the `cutscene` class on <html>.
 */
import * as THREE from 'three';
import {
  type Frame,
  type Pose,
  type Anchor,
  newPose,
  shotPose,
  lerpPose,
  ease,
  newDialogue,
  tickDialogue,
  tapDialogue,
  revealed,
  dialogueDone,
  DEFAULT_FOV
} from '../logic/cutscene';
import type { CutsceneDef } from '../../story/cutscenes';
import { SPEAKERS, storyLang } from '../../story/speakers';

export type CutsceneFrames = Record<Anchor, Frame>;

export interface CutsceneOptions {
  /** small caption in the top bar, e.g. the mission name */
  title?: string;
  /** last chance to nudge the camera (e.g. lift it out of a building) */
  adjust?: (p: Pose) => void;
}

/** ignore taps right after the cutscene opens so the tap that started it doesn't skip line one */
const TAP_GRACE = 0.25;

export class CutscenePlayer {
  active = false;
  private def: CutsceneDef | null = null;
  private frames: CutsceneFrames | null = null;
  private opts: CutsceneOptions = {};
  private done: (() => void) | null = null;
  private el: HTMLElement | null = null;
  private badgeEl: HTMLElement | null = null;
  private nameEl: HTMLElement | null = null;
  private shownEl: HTMLElement | null = null;
  private ghostEl: HTMLElement | null = null;
  private dlgEl: HTMLElement | null = null;
  private dlg = newDialogue();
  private chars: string[][] = [];
  private lens: number[] = [];
  private drawnLine = -1;
  private drawnChars = -1;
  private shot = -1;
  private shotT = 0;
  private age = 0;
  private pose = newPose();
  private from = newPose();
  private tmpV = new THREE.Vector3();
  private onKey = (e: KeyboardEvent) => {
    if (!this.active || e.repeat) return;
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      e.stopPropagation();
      if ((document.activeElement as HTMLElement | null)?.dataset?.cs === 'skip') this.skip();
      else this.tap();
    }
  };

  constructor(private camera: THREE.PerspectiveCamera) {}

  play(def: CutsceneDef, frames: CutsceneFrames, opts: CutsceneOptions, done: () => void) {
    this.stop();
    if (!def.lines.length) {
      done();
      return;
    }
    const en = storyLang() === 'en';
    this.def = def;
    this.frames = frames;
    this.opts = opts;
    this.done = done;
    this.chars = def.lines.map((l) => Array.from(en ? l.en : l.text));
    this.lens = this.chars.map((c) => c.length);
    this.dlg = newDialogue();
    this.drawnLine = this.drawnChars = -1;
    this.shot = -1;
    this.shotT = 0;
    this.age = 0;
    this.active = true;
    this.mount(en);
    document.documentElement.classList.add('cutscene');
    window.addEventListener('keydown', this.onKey, true);
    this.syncShot();
    this.applyCamera();
    this.draw();
  }

  /** Per frame while active: advances the dialogue clock, moves the camera, redraws text when it changed. */
  update(dt: number) {
    if (!this.active || !this.def) return;
    this.age += dt;
    this.shotT += dt;
    tickDialogue(this.dlg, dt, this.lens);
    if (dialogueDone(this.dlg, this.lens.length)) {
      this.finish();
      return;
    }
    this.syncShot();
    this.applyCamera();
    this.draw();
  }

  tap() {
    if (!this.active || this.age < TAP_GRACE) return;
    tapDialogue(this.dlg, this.lens);
    if (dialogueDone(this.dlg, this.lens.length)) this.finish();
    else {
      this.syncShot();
      this.draw();
    }
  }

  skip() {
    if (this.active) this.finish();
  }

  /** Tear down without running the completion callback (level change, leaving street mode). */
  stop() {
    this.done = null;
    if (this.active) this.finish();
  }

  private finish() {
    this.active = false;
    this.def = null;
    window.removeEventListener('keydown', this.onKey, true);
    document.documentElement.classList.remove('cutscene');
    const el = this.el;
    this.el = null;
    if (el) {
      el.classList.remove('in');
      window.setTimeout(() => el.remove(), 380);
    }
    const d = this.done;
    this.done = null;
    d?.();
  }

  /** Switch camera shot when the current line asks for one (blending from the live camera if the shot wants it). */
  private syncShot() {
    const def = this.def!;
    let want = this.shot < 0 ? 0 : this.shot;
    for (let i = 0; i <= Math.min(this.dlg.idx, def.lines.length - 1); i++) {
      const s = def.lines[i].shot;
      if (s !== undefined) want = s;
    }
    want = Math.max(0, Math.min(def.shots.length - 1, want));
    if (want === this.shot) return;
    this.capture(this.from);
    this.shot = want;
    this.shotT = 0;
  }

  private capture(out: Pose) {
    const c = this.camera;
    c.getWorldDirection(this.tmpV);
    out.px = c.position.x;
    out.py = c.position.y;
    out.pz = c.position.z;
    out.lx = c.position.x + this.tmpV.x * 10;
    out.ly = c.position.y + this.tmpV.y * 10;
    out.lz = c.position.z + this.tmpV.z * 10;
    out.fov = c.fov || DEFAULT_FOV;
  }

  private applyCamera() {
    const def = this.def;
    if (!def || !this.frames || this.shot < 0) return;
    const shot = def.shots[this.shot];
    if (!shot) return;
    shotPose(shot, this.frames[shot.anchor], this.shotT, this.pose);
    if (shot.blend && this.shotT < shot.blend) lerpPose(this.from, this.pose, ease(this.shotT / shot.blend), this.pose);
    this.opts.adjust?.(this.pose);
    const p = this.pose;
    const c = this.camera;
    c.position.set(p.px, p.py, p.pz);
    c.lookAt(p.lx, p.ly, p.lz);
    if (Math.abs(c.fov - p.fov) > 0.05) {
      c.fov = p.fov;
      c.updateProjectionMatrix();
    }
  }

  private mount(en: boolean) {
    const el = document.createElement('div');
    el.id = 'cutscene';
    el.dir = en ? 'ltr' : 'rtl';
    el.lang = en ? 'en' : 'ar';
    el.innerHTML = `
      <div class="cs-bar cs-top"><span class="cs-title"></span><button type="button" class="cs-skip" data-cs="skip">${en ? 'Skip' : 'تخطي'} ⏭</button></div>
      <div class="cs-bar cs-bottom"></div>
      <div class="cs-dlg" role="status" aria-live="polite">
        <div class="cs-badge" aria-hidden="true"></div>
        <div class="cs-body"><b class="cs-name"></b><p class="cs-text"><span class="cs-shown"></span><span class="cs-ghost" aria-hidden="true"></span></p></div>
        <span class="cs-next" aria-hidden="true">${en ? '▶' : '◀'}</span>
      </div>`;
    el.querySelector('.cs-title')!.textContent = this.opts.title ?? '';
    this.badgeEl = el.querySelector('.cs-badge');
    this.nameEl = el.querySelector('.cs-name');
    this.shownEl = el.querySelector('.cs-shown');
    this.ghostEl = el.querySelector('.cs-ghost');
    this.dlgEl = el.querySelector('.cs-dlg');
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if ((e.target as HTMLElement).closest('[data-cs="skip"]')) this.skip();
      else this.tap();
    });
    // keep the game's own touch handlers (aim drag, joystick) from seeing these touches
    el.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    (document.getElementById('app') ?? document.body).appendChild(el);
    this.el = el;
    // next frame: lets the bars slide in from off-screen
    requestAnimationFrame(() => el.classList.add('in'));
  }

  private draw() {
    const def = this.def;
    if (!def || !this.el) return;
    const i = this.dlg.idx;
    const line = def.lines[i];
    if (!line) return;
    const len = this.lens[i];
    const n = revealed(len, this.dlg.t);
    if (i !== this.drawnLine) {
      const sp = SPEAKERS[line.who];
      const en = storyLang() === 'en';
      const narr = line.who === 'narrator';
      this.dlgEl!.classList.toggle('narr', narr);
      this.dlgEl!.style.setProperty('--cs-col', sp.color);
      this.badgeEl!.textContent = narr ? '' : en ? sp.nameEn.charAt(0) : sp.badge;
      this.nameEl!.textContent = en ? sp.nameEn : sp.name;
      this.drawnLine = i;
      this.drawnChars = -1;
    }
    if (n !== this.drawnChars) {
      const c = this.chars[i];
      this.shownEl!.textContent = c.slice(0, n).join('');
      this.ghostEl!.textContent = c.slice(n).join('');
      this.dlgEl!.classList.toggle('typed', n >= len);
      this.drawnChars = n;
    }
  }
}
