/** WebAudio stingers + loops — no external assets required */

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambientNodes: AudioNode[] = [];
  private sirenTimer: number | null = null;
  private sirenOsc: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  enabled = true;

  private ensure() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.28;
    this.master.connect(this.ctx.destination);
  }

  resume() {
    this.ensure();
    void this.ctx?.resume();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) {
      this.stopAmbient();
      this.stopSiren();
    } else if (this.ctx) {
      this.startAmbient();
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain = 0.2, when = 0) {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  sirenSting() {
    if (!this.enabled) return;
    this.resume();
    this.tone(880, 0.18, 'sawtooth', 0.14, 0);
    this.tone(620, 0.18, 'sawtooth', 0.14, 0.16);
    this.tone(920, 0.22, 'sawtooth', 0.16, 0.32);
    this.tone(560, 0.28, 'sawtooth', 0.12, 0.5);
  }

  /** Alternating wail while chasing. */
  startSiren() {
    if (!this.enabled) return;
    this.resume();
    this.ensure();
    if (!this.ctx || !this.master || this.sirenOsc) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 700;
    g.gain.value = 0.045;
    osc.connect(g);
    g.connect(this.master);
    osc.start();
    this.sirenOsc = osc;
    this.sirenGain = g;
    let hi = true;
    this.sirenTimer = window.setInterval(() => {
      if (!this.ctx || !this.sirenOsc) return;
      hi = !hi;
      const f = hi ? 880 : 560;
      this.sirenOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.08);
    }, 420);
  }

  stopSiren() {
    if (this.sirenTimer != null) {
      clearInterval(this.sirenTimer);
      this.sirenTimer = null;
    }
    try {
      this.sirenOsc?.stop();
    } catch {
      /* ignore */
    }
    this.sirenOsc = null;
    this.sirenGain = null;
  }

  success() {
    if (!this.enabled) return;
    this.resume();
    this.tone(523, 0.12, 'triangle', 0.16, 0);
    this.tone(659, 0.12, 'triangle', 0.16, 0.1);
    this.tone(784, 0.28, 'triangle', 0.18, 0.2);
    this.tone(1046, 0.18, 'sine', 0.1, 0.38);
  }

  fail() {
    if (!this.enabled) return;
    this.resume();
    this.tone(220, 0.28, 'sawtooth', 0.14, 0);
    this.tone(165, 0.4, 'sawtooth', 0.16, 0.22);
    this.tone(110, 0.35, 'triangle', 0.1, 0.45);
  }

  click() {
    if (!this.enabled) return;
    this.resume();
    this.tone(620, 0.035, 'square', 0.05, 0);
    this.tone(880, 0.03, 'square', 0.03, 0.03);
  }

  radio() {
    if (!this.enabled) return;
    this.resume();
    this.tone(740, 0.06, 'sine', 0.06, 0);
    this.tone(980, 0.08, 'sine', 0.05, 0.12);
    this.tone(620, 0.1, 'triangle', 0.04, 0.28);
  }

  /** Short muzzle crack — cinematic, not a weapon sim. */
  gunshot() {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const dur = 0.07;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const env = Math.pow(1 - i / data.length, 2.2);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 700 + Math.random() * 900;
    filter.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.value = 0.42;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start();
    this.tone(140 + Math.random() * 40, 0.05, 'square', 0.04, 0);
  }

  startAmbient() {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx || !this.master || this.ambientNodes.length) return;
    const ctx = this.ctx;

    // Low city hum
    const hum = ctx.createOscillator();
    const humG = ctx.createGain();
    hum.type = 'sine';
    hum.frequency.value = 48;
    humG.gain.value = 0.022;
    hum.connect(humG);
    humG.connect(this.master);
    hum.start();

    // Soft filtered noise = rain / traffic bed
    const secs = 2;
    const buf = ctx.createBuffer(1, ctx.sampleRate * secs, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.35;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.5;
    const ng = ctx.createGain();
    ng.gain.value = 0.035;
    noise.connect(filter);
    filter.connect(ng);
    ng.connect(this.master);
    noise.start();

    // Distant neon buzz
    const buzz = ctx.createOscillator();
    const buzzG = ctx.createGain();
    buzz.type = 'triangle';
    buzz.frequency.value = 110;
    buzzG.gain.value = 0.008;
    buzz.connect(buzzG);
    buzzG.connect(this.master);
    buzz.start();

    this.ambientNodes = [hum, humG, noise, filter, ng, buzz, buzzG];
  }

  stopAmbient() {
    for (const n of this.ambientNodes) {
      try {
        if ('stop' in n && typeof (n as OscillatorNode).stop === 'function') {
          (n as OscillatorNode).stop();
        }
      } catch {
        /* ignore */
      }
    }
    this.ambientNodes = [];
  }
}

export const audio = new AudioManager();
