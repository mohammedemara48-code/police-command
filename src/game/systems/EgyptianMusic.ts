/**
 * Plays the procedural Egyptian tracks from `logic/maqam.ts` with WebAudio voices built in code:
 * oud (plucked), nay (breathy reed flute), mizmar (nasal reed), darbuka / tabla (drums) and a drone.
 * A look-ahead scheduler keeps a few hundred milliseconds of notes queued, so it costs almost nothing.
 */
import { TRACKS, composeLoop, degToMidi, midiToHz, type Hit, type Loop, type Note, type TrackId } from '../logic/maqam';

type Voice = 'oud' | 'nay' | 'mizmar';
interface Style {
  lead: Voice;
  /** a second, breathier line an octave up on long notes */
  counter: Voice | null;
  drum: 'darbuka' | 'tabla';
  drumGain: number;
  leadGain: number;
  bassGain: number;
  /** pluck the tonic and fifth on every beat (menu) instead of following the drum */
  arpeggio: boolean;
}

const STYLE: Record<TrackId, Style> = {
  menu: { lead: 'nay', counter: null, drum: 'tabla', drumGain: 0.5, leadGain: 0.55, bassGain: 0.35, arpeggio: true },
  taxi: { lead: 'oud', counter: 'nay', drum: 'darbuka', drumGain: 0.8, leadGain: 0.6, bassGain: 0.5, arpeggio: false },
  police: {
    lead: 'mizmar',
    counter: null,
    drum: 'darbuka',
    drumGain: 1,
    leadGain: 0.42,
    bassGain: 0.7,
    arpeggio: false
  }
};

/** The voices are synthesised quietly (headroom for stacked notes); this brings the bus up to the level of the sound effects. */
export const MAKEUP = 3.2;
const AHEAD = 0.7;
const TICK_MS = 150;

export class EgyptianMusic {
  private bus: GainNode;
  private noise: AudioBuffer;
  private timer: number | null = null;
  private track: TrackId | null = null;
  private loop: Loop | null = null;
  private cycle = 0;
  /** step index within the loop and the audio time it is due */
  private step = 0;
  private nextAt = 0;
  private paused = false;

  constructor(
    private ctx: AudioContext,
    private out: AudioNode
  ) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(out);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  get playing() {
    return this.track !== null && this.timer !== null;
  }
  get current() {
    return this.track;
  }

  /** Start a track, or fade over from the one that is playing. */
  play(id: TrackId) {
    if (this.track === id && this.timer !== null) return;
    const t = this.ctx.currentTime;
    // the old bus fades out and is dropped; a new one fades in
    const old = this.bus;
    old.gain.cancelScheduledValues(t);
    old.gain.setValueAtTime(old.gain.value, t);
    old.gain.linearRampToValueAtTime(0, t + 0.6);
    window.setTimeout(() => old.disconnect(), 900);
    this.bus = this.ctx.createGain();
    this.bus.gain.setValueAtTime(0, t);
    this.bus.gain.linearRampToValueAtTime(this.paused ? 0 : MAKEUP, t + 0.9);
    this.bus.connect(this.out);
    this.track = id;
    this.cycle = 0;
    this.loop = composeLoop(TRACKS[id], 0);
    this.step = 0;
    this.nextAt = t + 0.12;
    if (this.timer === null) this.timer = window.setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    const t = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setValueAtTime(this.bus.gain.value, t);
    this.bus.gain.linearRampToValueAtTime(0, t + 0.25);
    this.track = null;
    this.loop = null;
  }

  /** Volume 0 (muted): stop scheduling to save the CPU; the position is kept. */
  setPaused(on: boolean) {
    if (on === this.paused) return;
    this.paused = on;
    const t = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setValueAtTime(this.bus.gain.value, t);
    this.bus.gain.linearRampToValueAtTime(on ? 0 : MAKEUP, t + 0.2);
    if (on && this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    } else if (!on && this.track && this.timer === null) {
      this.nextAt = Math.max(this.nextAt, t + 0.1);
      this.timer = window.setInterval(() => this.tick(), TICK_MS);
    }
  }

  private tick(): void {
    const lp = this.loop;
    if (!lp) return;
    const spec = lp.spec;
    const stepDur = 30 / spec.bpm; // an eighth note
    // if the tab slept, do not rush to catch up
    if (this.nextAt < this.ctx.currentTime - 0.3) this.nextAt = this.ctx.currentTime + 0.05;
    while (this.nextAt < this.ctx.currentTime + AHEAD) {
      this.playStep(lp, this.step, this.nextAt, stepDur);
      this.step++;
      this.nextAt += stepDur;
      if (this.step >= lp.steps) {
        this.step = 0;
        this.cycle++;
        // same drums and key, a new tune every few rounds
        this.loop = composeLoop(spec, this.cycle % 6);
        this.tick();
        return;
      }
    }
  }

  private playStep(lp: Loop, step: number, t: number, stepDur: number) {
    const st = STYLE[lp.spec.id];
    const swing = step % 2 === 1 ? stepDur * 0.06 : 0;
    const hit = lp.drums[step] as Hit;
    if (hit !== '.') this.drum(st.drum, hit, t + swing, st.drumGain);
    for (const n of lp.lead) {
      if (n.at === step) this.note(st.lead, lp, n, t, stepDur, st.leadGain, 0);
      if (st.counter && n.at === step && n.len >= 3)
        this.note(st.counter, lp, n, t + stepDur * 0.5, stepDur, st.leadGain * 0.45, 12);
    }
    for (const n of lp.bass) {
      if (n.at === step && !st.arpeggio) this.note('oud', lp, n, t + swing, stepDur, st.bassGain, 0);
    }
    if (st.arpeggio && step % 4 === 0) {
      // tonic and fifth plucked on the beat, quietly
      const deg = step % 16 === 0 ? -7 : step % 16 === 8 ? -3 : -7 + ((step / 4) % 2) * 4;
      this.note('oud', lp, { at: step, len: 4, deg }, t, stepDur, st.bassGain, 0);
    }
    if (step % 16 === 0) this.drone(lp, t, stepDur * 16, lp.spec.id === 'menu' ? 0.09 : 0.04);
  }

  // ---- voices ----

  private note(v: Voice, lp: Loop, n: Note, t: number, stepDur: number, gain: number, octave: number) {
    const f = midiToHz(degToMidi(lp.spec.maqam, n.deg) + octave);
    const dur = Math.max(0.12, n.len * stepDur * 0.96);
    if (n.grace) this.voice(v, midiToHz(degToMidi(lp.spec.maqam, n.deg + 1) + octave), t - 0.07, 0.07, gain * 0.55);
    this.voice(v, f, t, dur, gain);
  }

  private voice(v: Voice, f: number, t: number, dur: number, gain: number) {
    if (v === 'oud') this.oud(f, t, dur, gain);
    else if (v === 'nay') this.nay(f, t, dur, gain);
    else this.mizmar(f, t, dur, gain);
  }

  private env(t: number, a: number, peak: number, hold: number, rel: number) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.setValueAtTime(Math.max(0.0002, peak), t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
    g.connect(this.bus);
    return g;
  }

  /** Plucked string: a bright saw that closes into a soft triangle, with a quick pitch settle. */
  private oud(f: number, t: number, dur: number, gain: number) {
    const ctx = this.ctx;
    const rel = Math.min(1.3, 0.25 + dur * 1.1);
    const g = this.env(t, 0.004, 0.3 * gain, 0, rel);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(6000, f * 9), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(500, f * 1.6), t + rel * 0.6);
    lp.connect(g);
    for (const [type, mult, vol] of [
      ['sawtooth', 1, 0.5],
      ['triangle', 2, 0.25],
      ['sine', 0.5, 0.35]
    ] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f * mult * 1.012, t);
      o.frequency.exponentialRampToValueAtTime(f * mult, t + 0.05);
      const og = ctx.createGain();
      og.gain.value = vol;
      o.connect(og).connect(lp);
      o.start(t);
      o.stop(t + rel + 0.05);
    }
  }

  /** Reed flute: soft sine and triangle with a slow vibrato and a puff of breath. */
  private nay(f: number, t: number, dur: number, gain: number) {
    const ctx = this.ctx;
    const g = this.env(t, 0.07, 0.24 * gain, Math.max(0.05, dur - 0.1), 0.18);
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o.type = 'sine';
    o2.type = 'triangle';
    o.frequency.value = f;
    o2.frequency.value = f * 2;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(f * 0.009, t + 0.35);
    lfo.connect(depth);
    depth.connect(o.frequency);
    depth.connect(o2.frequency);
    const o2g = ctx.createGain();
    o2g.gain.value = 0.18;
    o.connect(g);
    o2.connect(o2g).connect(g);
    // breath
    const nz = ctx.createBufferSource();
    nz.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f * 2.2;
    bp.Q.value = 4;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.linearRampToValueAtTime(0.08 * gain, t + 0.05);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    nz.connect(bp).connect(ng).connect(g);
    const end = t + 0.07 + Math.max(0.05, dur - 0.1) + 0.2;
    for (const x of [o, o2, lfo]) {
      x.start(t);
      x.stop(end);
    }
    nz.start(t);
    nz.stop(t + 0.45);
  }

  /** Nasal double reed: two detuned saws through a narrow band-pass. */
  private mizmar(f: number, t: number, dur: number, gain: number) {
    const ctx = this.ctx;
    const g = this.env(t, 0.025, 0.22 * gain, Math.max(0.04, dur - 0.08), 0.1);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = Math.max(900, f * 3);
    bp.Q.value = 1.6;
    bp.connect(g);
    for (const cents of [-9, 9]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f * 2 * Math.pow(2, cents / 1200);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 6;
      const d = ctx.createGain();
      d.gain.value = f * 0.01;
      lfo.connect(d).connect(o.frequency);
      o.connect(bp);
      const end = t + 0.025 + Math.max(0.04, dur - 0.08) + 0.12;
      o.start(t);
      lfo.start(t);
      o.stop(end);
      lfo.stop(end);
    }
  }

  private drone(lp: Loop, t: number, dur: number, gain: number) {
    const ctx = this.ctx;
    const root = midiToHz(lp.spec.maqam.root - 12);
    const g = this.env(t, 0.4, gain, dur - 0.8, 0.5);
    for (const m of [1, 1.5]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = root * m;
      const og = ctx.createGain();
      og.gain.value = m === 1 ? 1 : 0.4;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + dur + 0.6);
    }
  }

  private drum(kind: 'darbuka' | 'tabla', h: Hit, t: number, gain: number) {
    const ctx = this.ctx;
    if (h === 'D') {
      const o = ctx.createOscillator();
      o.type = 'sine';
      const tabla = kind === 'tabla';
      o.frequency.setValueAtTime(tabla ? 135 : 170, t);
      o.frequency.exponentialRampToValueAtTime(tabla ? 92 : 62, t + (tabla ? 0.28 : 0.12));
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.9 * gain, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (tabla ? 0.55 : 0.24));
      o.connect(g).connect(this.bus);
      o.start(t);
      o.stop(t + 0.6);
      return;
    }
    // tak / ka: a short burst of band-passed noise, plus a ringing skin tone for tak
    const strong = h === 'T';
    const nz = ctx.createBufferSource();
    nz.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = kind === 'tabla' ? 2400 : 3600;
    bp.Q.value = 1.1;
    const g = ctx.createGain();
    const peak = (strong ? 0.5 : 0.18) * gain;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (strong ? 0.07 : 0.04));
    nz.connect(bp).connect(g).connect(this.bus);
    nz.start(t, Math.random() * 0.8);
    nz.stop(t + 0.1);
    if (strong) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(kind === 'tabla' ? 520 : 400, t);
      o.frequency.exponentialRampToValueAtTime(kind === 'tabla' ? 440 : 300, t + 0.08);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(0.16 * gain, t + 0.003);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(og).connect(this.bus);
      o.start(t);
      o.stop(t + 0.12);
    }
  }
}
