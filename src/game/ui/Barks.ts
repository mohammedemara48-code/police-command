/** Small speech bubble for street barks: one line at a time, fades by itself, never takes a tap. */
import { BARKS, VOICES, VOCATIVES, type BarkId, type BarkSituation } from '../config/barks';
import { createBarkState, pickBark, type BarkState } from '../logic/barks';
import { storyLang } from '../../story/speakers';

const SHOW_MS = 3200;

export class Barks {
  private state: BarkState = createBarkState();
  private el: HTMLElement | null = null;
  private hideT = 0;

  mount(parent: HTMLElement) {
    const el = document.createElement('div');
    el.id = 'street-bark';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'off');
    parent.appendChild(el);
    this.el = el;
  }

  /** Speak a situation if it is off cooldown. Returns the line shown, or null. */
  say(id: BarkId, priority = false): string | null {
    // the jokes are Egyptian Arabic; the English UI keeps the plain status messages only
    if (!this.el || storyLang() === 'en') return null;
    const s: BarkSituation = BARKS[id];
    const line = pickBark(this.state, id, s.lines, performance.now() / 1000, {
      cooldown: s.cooldown,
      priority,
      vocatives: VOCATIVES
    });
    if (line) this.show(s.voice, line);
    return line;
  }

  /** Show a custom line (already picked elsewhere) in the patrol car's voice. */
  show(voice: keyof typeof VOICES, text: string) {
    const el = this.el;
    if (!el) return;
    const v = VOICES[voice];
    el.replaceChildren();
    const tag = document.createElement('b');
    tag.style.color = v.color;
    tag.textContent = `${v.icon} ${v.name}`;
    const p = document.createElement('span');
    p.textContent = text;
    el.append(tag, p);
    el.classList.add('show');
    clearTimeout(this.hideT);
    this.hideT = window.setTimeout(() => el.classList.remove('show'), SHOW_MS);
  }

  hide() {
    clearTimeout(this.hideT);
    this.el?.classList.remove('show');
  }
}
