/** Lightweight WebAudio stingers — no external assets */

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambient: OscillatorNode | null = null;
  private ambientGain: GainNode | null = null;
  enabled = true;

  private ensure() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.22;
    this.master.connect(this.ctx.destination);
  }

  resume() {
    this.ensure();
    void this.ctx?.resume();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) this.stopAmbient();
    else if (this.ctx) this.startAmbient();
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
    this.tone(880, 0.18, 'sawtooth', 0.12, 0);
    this.tone(620, 0.18, 'sawtooth', 0.12, 0.16);
    this.tone(920, 0.22, 'sawtooth', 0.14, 0.32);
    this.tone(560, 0.28, 'sawtooth', 0.1, 0.5);
  }

  success() {
    if (!this.enabled) return;
    this.resume();
    this.tone(523, 0.12, 'triangle', 0.14, 0);
    this.tone(659, 0.12, 'triangle', 0.14, 0.1);
    this.tone(784, 0.22, 'triangle', 0.16, 0.2);
  }

  fail() {
    if (!this.enabled) return;
    this.resume();
    this.tone(220, 0.25, 'sawtooth', 0.12, 0);
    this.tone(165, 0.35, 'sawtooth', 0.14, 0.2);
  }

  click() {
    if (!this.enabled) return;
    this.resume();
    this.tone(440, 0.04, 'square', 0.05, 0);
  }

  startAmbient() {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx || !this.master || this.ambient) return;
    this.ambient = this.ctx.createOscillator();
    this.ambientGain = this.ctx.createGain();
    this.ambient.type = 'sine';
    this.ambient.frequency.value = 55;
    this.ambientGain.gain.value = 0.018;
    this.ambient.connect(this.ambientGain);
    this.ambientGain.connect(this.master);
    this.ambient.start();
  }

  stopAmbient() {
    try {
      this.ambient?.stop();
    } catch {
      /* ignore */
    }
    this.ambient = null;
    this.ambientGain = null;
  }
}

export const audio = new AudioManager();
