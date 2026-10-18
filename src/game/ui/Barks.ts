/**
 * Street talk on screen. Humour comes as speech bubbles above the person who says it (they must be on screen);
 * the radio's official lines use a separate strip at the bottom. Three bubbles at most, none takes a tap.
 */
import * as THREE from 'three';
import {
  BARKS,
  CHATTER,
  RADIO,
  VOICES,
  VOCATIVES,
  type BarkId,
  type BarkSituation,
  type ChatterId,
  type RadioId,
  type VoiceId
} from '../config/barks';
import { canBark, createBarkState, pickBark, type BarkState } from '../logic/barks';
import { storyLang } from '../../story/speakers';

const SHOW_MS = 3400;
const POOL = 3;

export interface Speaker {
  obj: THREE.Object3D;
  role: VoiceId;
  /** metres above the object's origin where the bubble tip sits */
  height: number;
}

interface Bubble {
  el: HTMLElement;
  who: Speaker | null;
  /** performance.now() times */
  from: number;
  until: number;
  tmp: THREE.Vector3;
}

export class Barks {
  private state: BarkState = createBarkState();
  private bubbles: Bubble[] = [];
  private strip: HTMLElement | null = null;
  private stripT = 0;
  private camera: THREE.Camera | null = null;
  private v = new THREE.Vector3();

  mount(parent: HTMLElement, camera: THREE.Camera) {
    this.camera = camera;
    for (let i = 0; i < POOL; i++) {
      const el = document.createElement('div');
      el.className = 'street-bubble';
      el.setAttribute('aria-hidden', 'true');
      parent.appendChild(el);
      this.bubbles.push({ el, who: null, from: 0, until: 0, tmp: new THREE.Vector3() });
    }
    const strip = document.createElement('div');
    strip.id = 'street-bark';
    strip.setAttribute('role', 'status');
    parent.appendChild(strip);
    this.strip = strip;
  }

  private now() {
    return performance.now() / 1000;
  }

  private free(): Bubble {
    const t = performance.now();
    return this.bubbles.find((b) => t > b.until) ?? this.bubbles.reduce((a, b) => (a.from < b.from ? a : b));
  }

  private put(who: Speaker, text: string, delayMs = 0, look?: { name: string; icon: string; color: string }) {
    const b = this.bubbles.find((x) => x.who?.obj === who.obj && performance.now() < x.until) ?? this.free();
    const voice = look ?? VOICES[who.role];
    b.el.replaceChildren();
    const tag = document.createElement('b');
    tag.style.color = voice.color;
    tag.textContent = `${voice.icon} ${voice.name}`;
    const p = document.createElement('span');
    p.textContent = text;
    b.el.append(tag, p);
    b.who = who;
    b.from = performance.now() + delayMs;
    b.until = b.from + SHOW_MS;
    b.el.classList.remove('show');
    b.el.style.opacity = '0';
  }

  /** Is this situation off cooldown right now? (cheap, call before searching for a speaker) */
  ready(id: BarkId, priority = false): boolean {
    if (!this.strip || storyLang() === 'en') return false;
    const s: BarkSituation = BARKS[id];
    return canBark(this.state, id, this.now(), { cooldown: s.cooldown, priority });
  }

  /** Is the chatter of this kind off cooldown? */
  readyChat(id: ChatterId): boolean {
    return (
      !!this.strip && storyLang() !== 'en' && canBark(this.state, `chat:${id}`, this.now(), { cooldown: 25, gap: 0 })
    );
  }

  /** Speak a situation through `speaker` if it is off cooldown. No speaker on screen, no bark. */
  say(id: BarkId, speaker: Speaker | null, priority = false): string | null {
    // the jokes are Egyptian Arabic; the English UI keeps the plain status messages only
    if (!this.strip || !speaker || storyLang() === 'en') return null;
    const s: BarkSituation = BARKS[id];
    const line = pickBark(this.state, id, s.lines, this.now(), {
      cooldown: s.cooldown,
      priority,
      vocatives: VOCATIVES
    });
    if (line) this.put(speaker, line);
    return line;
  }

  /** Say an exact line (passengers in the cab, people waiting at a rank) with their own name tag. */
  sayLine(speaker: Speaker, text: string, look: { name: string; icon: string; color: string }, delayMs = 0): boolean {
    if (!this.strip) return false;
    this.put(speaker, text, delayMs, look);
    return true;
  }

  /** Two neighbours exchange a line each (the reply follows after a beat). */
  chat(id: ChatterId, a: Speaker, b: Speaker): boolean {
    if (!this.strip || storyLang() === 'en') return false;
    const c = CHATTER[id];
    const line = pickBark(this.state, `chat:${id}`, c.lines, this.now(), { cooldown: 25, gap: 0 });
    if (!line) return false;
    const [first, reply] = line.split('||');
    this.put(a, first!);
    this.put(b, reply ?? '', 1900);
    return true;
  }

  /** Official dispatcher line on the radio strip. */
  radio(id: RadioId, priority = false): string | null {
    if (!this.strip || storyLang() === 'en') return null;
    const s = RADIO[id];
    const line = pickBark(this.state, `radio:${id}`, s.lines, this.now(), { priority, gap: priority ? 0 : 3 });
    if (!line) return null;
    const strip = this.strip;
    strip.replaceChildren();
    const tag = document.createElement('b');
    tag.textContent = '📻 العمليات';
    const p = document.createElement('span');
    p.textContent = line;
    strip.append(tag, p);
    strip.classList.add('show');
    clearTimeout(this.stripT);
    this.stripT = window.setTimeout(() => strip.classList.remove('show'), 4200);
    return line;
  }

  /** Per frame: keep each bubble over its speaker's head. */
  update() {
    const cam = this.camera;
    if (!cam) return;
    const t = performance.now();
    const w = window.innerWidth,
      h = window.innerHeight;
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    for (const b of this.bubbles) {
      if (!b.who) continue;
      if (t > b.until) {
        b.el.classList.remove('show');
        b.who = null;
        continue;
      }
      if (t < b.from) continue;
      b.who.obj.getWorldPosition(this.v);
      this.v.y += b.who.height;
      this.v.project(cam);
      const on = this.v.z < 1 && Math.abs(this.v.x) < 1.05 && this.v.y > -1.05 && this.v.y < 1.05;
      if (!on) {
        b.el.classList.remove('show');
        continue;
      }
      const bw = b.el.offsetWidth,
        bh = b.el.offsetHeight;
      const bx = Math.min(w - bw / 2 - 6, Math.max(bw / 2 + 6, ((this.v.x + 1) / 2) * w));
      let by = Math.max(bh + 8, ((1 - this.v.y) / 2) * h);
      // two people talking next to each other: stack the bubbles instead of covering one
      for (const o of placed)
        if (Math.abs(o.x - bx) < (o.w + bw) / 2 && Math.abs(o.y - by) < (o.h + bh) / 2 + 4) by = o.y - bh - 8;
      placed.push({ x: bx, y: by, w: bw, h: bh });
      b.el.style.transform = `translate(${bx}px, ${by}px) translate(-50%, -100%)`;
      b.el.style.opacity = '';
      b.el.classList.add('show');
    }
  }

  hide() {
    for (const b of this.bubbles) {
      b.who = null;
      b.until = 0;
      b.el.classList.remove('show');
    }
    this.strip?.classList.remove('show');
  }
}
