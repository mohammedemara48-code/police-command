/**
 * Plays the procedural Egyptian tracks from `logic/maqam.ts` with WebAudio voices built in code:
 * oud (plucked), nay (breathy reed flute), mizmar (nasal reed), an electro synth riff, sub bass, and a drum kit made of
 * darbuka / tabla / dhol / riq / claps. A look-ahead scheduler keeps a few hundred milliseconds of notes queued.
 * Which layers play depends on the bar's energy and on `intensity` (0..1, set by the game from chases and speed), and
 * the tempo rises with it. The whole thing can also be rendered offline (see `renderOffline`) to check levels.
 */
import {
  BAR,
  TRACKS,
  active,
  composeLoop,
  degToMidi,
  levelOf,
  midiToHz,
  tempoMul,
  type Loop,
  type Note,
  type TrackId
} from '../logic/maqam';

type Voice = 'oud' | 'nay' | 'mizmar' | 'synth';
type Kick = 'darbuka' | 'tabla' | 'electro';
interface Style {
  lead: Voice;
  /** a second line an octave up, on when the level is high */
  counter: Voice;
  kick: Kick;
  drumGain: number;
  leadGain: number;
  counterGain: number;
  bassGain: number;
  /** swing on the odd sixteenths, as a fraction of a step */
  swing: number;
  /** a plucked tonic/fifth pulse under the groove (menu) */
  pulse: boolean;
}

const STYLE: Record<TrackId, Style> = {
  menu: {
    lead: 'oud',
    counter: 'nay',
    kick: 'tabla',
    drumGain: 0.8,
    leadGain: 0.95,
    counterGain: 0.6,
    bassGain: 0.55,
    swing: 0.12,
    pulse: true
  },
  taxi: {
    lead: 'synth',
    counter: 'nay',
    kick: 'electro',
    drumGain: 0.95,
    leadGain: 0.8,
    counterGain: 0.6,
    bassGain: 0.65,
    swing: 0,
    pulse: false
  },
  police: {
    lead: 'mizmar',
    counter: 'oud',
    kick: 'darbuka',
    drumGain: 1,
    leadGain: 0.7,
    counterGain: 0.55,
    bassGain: 0.7,
    swing: 0,
    pulse: false
  }
};

/** The voices are synthesised quietly (headroom for stacked notes); this brings the bus up to the level of the sound effects. */
export const MAKEUP = 2.6;
const AHEAD = 0.7;
const TICK_MS = 150;

export class EgyptianMusic {
  private bus: GainNode;
  private comp: DynamicsCompressorNode;
  private noise: AudioBuffer;
  private timer: number | null = null;
  private track: TrackId | null = null;
  private loop: Loop | null = null;
  private cycle = 0;
  /** step index within the loop and the audio time it is due */
  private step = 0;
  private nextAt = 0;
  private paused = false;
  /** 0..1, from the game; follows `target` smoothly so a chase swells in rather than jumping */
  private intensity = 0.4;
  private target = 0.4;
  private intensityFn: ((t: number) => number) | null = null;

  constructor(
    private ctx: BaseAudioContext,
    out: AudioNode
  ) {
    // glue the layers together and keep peaks under control (the bus is boosted to match the sound effects)
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -10;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 3;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.14;
    this.comp.connect(out);
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(this.comp);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let s = 1234567;
    for (let i = 0; i < len; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      d[i] = (s / 4294967296) * 2 - 1;
    }
  }

  get playing() {
    return this.track !== null && this.timer !== null;
  }
  get current() {
    return this.track;
  }

  /** How hard the game is going right now, 0 (cruising) to 1 (chase at full speed). */
  setIntensity(v: number) {
    this.target = Math.max(0, Math.min(1, v));
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
    this.bus.connect(this.comp);
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

  /**
   * Schedule `seconds` of a track into an offline context right away (no timers), for level checks and previews.
   * `intensityAt` gives the game intensity at each second of the piece.
   */
  renderOffline(id: TrackId, seconds: number, intensityAt: (t: number) => number = () => 0.4) {
    this.track = id;
    this.cycle = 0;
    this.loop = composeLoop(TRACKS[id], 0);
    this.step = 0;
    this.nextAt = 0;
    this.bus.gain.value = MAKEUP;
    this.intensityFn = intensityAt;
    this.pump(seconds);
    this.intensityFn = null;
  }

  private tick(): void {
    // ease toward the game's intensity (about two seconds to swell in)
    this.intensity += (this.target - this.intensity) * Math.min(1, (TICK_MS / 1000) * 0.9);
    this.pump(AHEAD);
  }

  private pump(horizon: number): void {
    let lp = this.loop;
    if (!lp) return;
    // if the tab slept, do not rush to catch up
    if (!this.intensityFn && this.nextAt < this.ctx.currentTime - 0.3) this.nextAt = this.ctx.currentTime + 0.05;
    while (this.nextAt < this.ctx.currentTime + horizon) {
      const I = this.intensityFn ? this.intensityFn(this.nextAt) : this.intensity;
      const stepDur = 15 / (lp.spec.bpm * tempoMul(I));
      this.playStep(lp, this.step, this.nextAt, stepDur, I);
      this.step++;
      this.nextAt += stepDur;
      if (this.step >= lp.steps) {
        this.step = 0;
        this.cycle++;
        // same groove and tune, new ornaments and ghost notes every round
        lp = this.loop = composeLoop(lp.spec, this.cycle % 6);
      }
    }
  }

  private playStep(lp: Loop, step: number, t0: number, stepDur: number, intensity: number) {
    const st = STYLE[lp.spec.id];
    const bar = Math.floor(step / BAR);
    const level = levelOf(lp.energy[bar]!, intensity);
    const swing = step % 2 === 1 ? stepDur * st.swing : 0;
    const t = t0 + swing;
    const L = lp.drums.layers;
    // a touch louder as the bar builds
    const dyn = 0.78 + 0.22 * Math.min(1, level);
    const dg = st.drumGain * dyn;
    const v = (x: number) => x > 0;
    if (v(L.dum[step]!) && active('dum', level)) this.dum(st.kick, L.dum[step]! * dg, t);
    if (v(L.tak[step]!) && active('tak', level)) this.tak(L.tak[step]! * dg, t);
    if (v(L.ka[step]!) && active('ka', level)) this.ka(L.ka[step]! * dg, t);
    if (v(L.clap[step]!) && active('clap', level)) this.clap(L.clap[step]! * dg, t);
    if (v(L.riq[step]!) && active('riq', level) && (active('riqFull', level) || L.riq[step]! >= 0.55))
      this.riq(L.riq[step]! * dg, t);
    if (v(L.dhol[step]!) && active('dhol', level)) this.dhol(L.dhol[step]! * dg, t);
    if (v(L.dholTak[step]!) && active('dhol', level)) this.dholTak(L.dholTak[step]! * dg, t);

    if (active('bass', level))
      for (const n of lp.bass) if (n.at === step) this.bassNote(lp, n, t0, stepDur, st.bassGain * dyn);
    if (st.pulse && active('bass', level) && step % 4 === 0) {
      // oud pulse on the beat: tonic and fifth, quietly, so the groove has a harmonic floor
      const deg = step % 16 === 8 ? -3 : step % 16 === 0 ? 0 : step % 8 === 4 ? 2 : -3;
      this.voice('oud', midiToHz(degToMidi(lp.spec.maqam, deg)), t0, stepDur * 3, 0.2 * dyn);
    }
    if (active('hook', level)) {
      for (const n of lp.hook) {
        if (n.at !== step) continue;
        this.hookNote(st.lead, lp, n, t0, stepDur, st.leadGain * dyn * (n.vel ?? 1), 0);
        if (active('counter', level) && n.len >= 3)
          this.hookNote(st.counter, lp, n, t0 + stepDur * 0.5, stepDur, st.counterGain * dyn, 12);
      }
    }
    if (step % lp.steps === 0) this.drone(lp, t0, stepDur * lp.steps * 0.5, lp.spec.id === 'menu' ? 0.07 : 0.035);
    // a crash on the loop's downbeat once things are going, and a noise riser through the last bar
    if (step === 0 && this.cycle > 0 && level > 0.62) this.crash(dg, t0);
    if (step === (lp.spec.bars - 1) * BAR && level > 0.5) this.riser(t0, stepDur * BAR, dg);
  }

  // ---- notes ----

  private hookNote(v: Voice, lp: Loop, n: Note, t: number, stepDur: number, gain: number, octave: number) {
    const m = lp.spec.maqam;
    const f = (deg: number) => midiToHz(degToMidi(m, deg) + octave);
    const dur = Math.max(0.1, n.len * stepDur * 0.94);
    if (n.orn === 'trill' && n.len >= 3) {
      // the main note and its upper neighbour, quickly alternating, ending on the main note
      const beat = stepDur * 0.75;
      const count = Math.max(2, Math.floor(dur / beat));
      for (let i = 0; i < count; i++) {
        const main = (count - 1 - i) % 2 === 0;
        this.voice(v, f(main ? n.deg : n.deg + 1), t + i * beat, beat * 1.05, gain * (i === 0 ? 1 : 0.8));
      }
      return;
    }
    if (n.orn === 'grace') this.voice(v, f(n.deg + 1), t - 0.06, 0.07, gain * 0.55);
    if (n.orn === 'slide') {
      this.voice(v, f(n.deg - 1), t - 0.07, 0.08, gain * 0.5);
    }
    this.voice(v, f(n.deg), t, dur, gain);
  }

  private bassNote(lp: Loop, n: Note, t: number, stepDur: number, gain: number) {
    // an octave above the written degree: below ~100 Hz a phone speaker plays nothing
    const f = midiToHz(degToMidi(lp.spec.maqam, n.deg) + 12);
    const dur = Math.max(0.1, n.len * stepDur * 0.92);
    this.bass(f, t, dur, gain * (n.vel ?? 1), lp.spec.id === 'taxi');
  }

  private voice(v: Voice, f: number, t: number, dur: number, gain: number) {
    if (v === 'oud') this.oud(f, t, dur, gain);
    else if (v === 'nay') this.nay(f, t, dur, gain);
    else if (v === 'synth') this.synth(f, t, dur, gain);
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
    const rel = Math.min(0.9, 0.18 + dur * 0.9);
    const g = this.env(t, 0.003, 0.3 * gain, 0, rel);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(7000, f * 10), t);
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
      o.frequency.exponentialRampToValueAtTime(f * mult, t + 0.04);
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
    const g = this.env(t, 0.05, 0.24 * gain, Math.max(0.05, dur - 0.08), 0.16);
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o.type = 'sine';
    o2.type = 'triangle';
    o.frequency.value = f;
    o2.frequency.value = f * 2;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.4;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(f * 0.009, t + 0.3);
    lfo.connect(depth);
    depth.connect(o.frequency);
    depth.connect(o2.frequency);
    const o2g = ctx.createGain();
    o2g.gain.value = 0.18;
    o.connect(g);
    o2.connect(o2g).connect(g);
    const nz = ctx.createBufferSource();
    nz.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f * 2.2;
    bp.Q.value = 4;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.linearRampToValueAtTime(0.08 * gain, t + 0.04);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    nz.connect(bp).connect(ng).connect(g);
    const end = t + 0.05 + Math.max(0.05, dur - 0.08) + 0.2;
    for (const x of [o, o2, lfo]) {
      x.start(t);
      x.stop(end);
    }
    nz.start(t);
    nz.stop(t + 0.35);
  }

  /** Nasal double reed: two detuned saws through a narrow band-pass. */
  private mizmar(f: number, t: number, dur: number, gain: number) {
    const ctx = this.ctx;
    const hold = Math.max(0.04, dur - 0.07);
    const g = this.env(t, 0.02, 0.24 * gain, hold, 0.09);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = Math.max(900, f * 3);
    bp.Q.value = 1.4;
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
      const end = t + 0.02 + hold + 0.11;
      o.start(t);
      lfo.start(t);
      o.stop(end);
      lfo.stop(end);
    }
  }

  /** Electro riff voice (the mahraganat organ-synth): detuned saws and a square, a filter that snaps shut. */
  private synth(f: number, t: number, dur: number, gain: number) {
    const ctx = this.ctx;
    const hold = Math.max(0.03, dur - 0.05);
    const g = this.env(t, 0.006, 0.2 * gain, hold, 0.08);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 3;
    lp.frequency.setValueAtTime(Math.min(7000, f * 12), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(700, f * 2.2), t + 0.16);
    lp.connect(g);
    const end = t + 0.006 + hold + 0.1;
    for (const [type, cents, mult, vol] of [
      ['sawtooth', -11, 1, 0.5],
      ['sawtooth', 11, 1, 0.5],
      ['square', 0, 0.5, 0.35]
    ] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * mult * Math.pow(2, cents / 1200);
      const og = ctx.createGain();
      og.gain.value = vol;
      o.connect(og).connect(lp);
      o.start(t);
      o.stop(end);
    }
  }

  /** Bass: a sine for the weight, and a filtered saw an octave up so it is still heard on a phone speaker. */
  private bass(f: number, t: number, dur: number, gain: number, punch: boolean) {
    const ctx = this.ctx;
    const hold = Math.max(0.04, dur - 0.05);
    const g = this.env(t, 0.006, 0.3 * gain, hold, 0.07);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(punch ? f * 1.5 : f, t);
    if (punch) o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    o.connect(g);
    const s = ctx.createOscillator();
    s.type = 'sawtooth';
    s.frequency.value = f * 2;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(f * 7, t);
    lp.frequency.exponentialRampToValueAtTime(f * 2.5, t + 0.12);
    const sg = ctx.createGain();
    sg.gain.value = 0.7;
    s.connect(lp).connect(sg).connect(g);
    const end = t + 0.006 + hold + 0.09;
    o.start(t);
    s.start(t);
    o.stop(end);
    s.stop(end);
  }

  private drone(lp: Loop, t: number, dur: number, gain: number) {
    const ctx = this.ctx;
    const root = midiToHz(lp.spec.maqam.root);
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

  // ---- drums ----

  private burst(
    t: number,
    type: BiquadFilterType,
    freq: number,
    q: number,
    peak: number,
    dur: number,
    off = Math.random() * 0.8
  ) {
    const ctx = this.ctx;
    const nz = ctx.createBufferSource();
    nz.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    nz.connect(f).connect(g).connect(this.bus);
    nz.start(t, off);
    nz.stop(t + dur + 0.03);
  }

  private tone(t: number, type: OscillatorType, f0: number, f1: number, sweep: number, peak: number, dur: number) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + sweep);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + dur + 0.04);
  }

  /** Dum: the low stroke. Darbuka (tight and round), tabla (longer boom) or an electronic kick. */
  private dum(kind: Kick, vel: number, t: number) {
    if (kind === 'electro') {
      this.tone(t, 'sine', 150, 50, 0.09, 0.5 * vel, 0.26);
      this.burst(t, 'bandpass', 2400, 0.9, 0.3 * vel, 0.03);
      return;
    }
    const tabla = kind === 'tabla';
    this.tone(t, 'sine', tabla ? 135 : 170, tabla ? 92 : 62, tabla ? 0.28 : 0.12, 0.5 * vel, tabla ? 0.42 : 0.22);
    this.burst(t, 'lowpass', 1200, 0.7, 0.2 * vel, 0.04);
  }

  /** Tak: the sharp rim stroke. */
  private tak(vel: number, t: number) {
    this.burst(t, 'bandpass', 3200, 1.0, 0.8 * vel, 0.075);
    this.tone(t, 'triangle', 420, 310, 0.08, 0.3 * vel, 0.1);
  }

  /** Ka: the soft ghost note between the strokes. */
  private ka(vel: number, t: number) {
    this.burst(t, 'bandpass', 4000, 1.1, 0.34 * vel, 0.04);
  }

  /** Clap (electronic backbeat): three tiny bursts and a tail. */
  private clap(vel: number, t: number) {
    for (const o of [0, 0.011, 0.022]) this.burst(t + o, 'bandpass', 1500, 0.8, 0.55 * vel, 0.02);
    this.burst(t + 0.03, 'bandpass', 1300, 0.7, 0.45 * vel, 0.14);
  }

  /** Riq (tambourine): a bright shake with metallic ring. */
  private riq(vel: number, t: number) {
    this.burst(t, 'highpass', 6500, 0.7, 0.42 * vel, 0.045);
    const strong = vel > 0.7;
    this.burst(t + 0.004, 'bandpass', 9500, 2, 0.26 * vel, strong ? 0.1 : 0.055);
    if (strong) this.tone(t, 'square', 5200, 5100, 0.05, 0.04 * vel, 0.07);
  }

  /** Dhol: the big bass drum of shaabi and saidi music. */
  private dhol(vel: number, t: number) {
    this.tone(t, 'sine', 135, 72, 0.1, 0.34 * vel, 0.26);
    this.burst(t, 'lowpass', 700, 0.8, 0.25 * vel, 0.06);
  }

  /** The stick side of the dhol. */
  private dholTak(vel: number, t: number) {
    this.burst(t, 'bandpass', 1900, 1.3, 0.6 * vel, 0.055);
    this.tone(t, 'triangle', 320, 250, 0.05, 0.2 * vel, 0.07);
  }

  private crash(gain: number, t: number) {
    this.burst(t, 'highpass', 5200, 0.6, 0.2 * gain, 0.7);
  }

  /** A rising noise swell through the last bar, so the loop's end leans into the next round. */
  private riser(t: number, dur: number, gain: number) {
    const ctx = this.ctx;
    const nz = ctx.createBufferSource();
    nz.buffer = this.noise;
    nz.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(7000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.13 * gain, t + dur);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.05);
    nz.connect(f).connect(g).connect(this.bus);
    nz.start(t);
    nz.stop(t + dur + 0.1);
  }
}
