/** WebAudio: recorded CC0 sound effects (Kenney, OpenGameArt) with synth fallback; the music is generated in code (EgyptianMusic) */
import { EgyptianMusic } from './EgyptianMusic';
import type { TrackId } from '../logic/maqam';

const VOL_KEY = 'pc.vol.v1';
export interface Volumes {
  master: number;
  music: number;
  sfx: number;
}

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambientNodes: AudioNode[] = [];
  private sirenTimer: number | null = null;
  private sirenOsc: OscillatorNode | null = null;
  enabled = true;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private loading: Promise<void> | null = null;
  private music: EgyptianMusic | null = null;
  private engineSrc: AudioBufferSourceNode | null = null;
  private engineGain: GainNode | null = null;
  vol: Volumes = (() => {
    try {
      return { master: 0.8, music: 0.45, sfx: 0.9, ...JSON.parse(localStorage.getItem(VOL_KEY) || '{}') };
    } catch {
      return { master: 0.8, music: 0.45, sfx: 0.9 };
    }
  })();

  setVolume(k: keyof Volumes, v: number) {
    this.vol[k] = Math.max(0, Math.min(1, v));
    try {
      localStorage.setItem(VOL_KEY, JSON.stringify(this.vol));
    } catch {
      /* ignore */
    }
    this.applyVol();
  }
  private applyVol() {
    if (this.master) this.master.gain.value = 0.35 * this.vol.master;
    if (this.sfxGain) this.sfxGain.gain.value = this.vol.sfx;
    if (this.musicGain) this.musicGain.gain.value = 0.5 * this.vol.music;
    // a muted slider also stops the generator, so it costs nothing
    this.music?.setPaused(this.vol.music < 0.01 || this.vol.master < 0.01);
  }

  private loadSamples() {
    if (this.loading || !this.ctx) return this.loading;
    const ctx = this.ctx;
    this.loading = Promise.all(
      ['/audio/sounds.json'].map((u) =>
        fetch(u)
          .then((r) => r.json() as Promise<Record<string, string>>)
          .catch(() => ({}))
      )
    )
      .then((maps) => Object.assign({}, ...maps) as Record<string, string>)
      .then((map) =>
        Promise.all(
          Object.entries(map).map(async ([k, uri]) => {
            const bin = atob(uri.slice(uri.indexOf(',') + 1));
            const u8 = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
            try {
              this.buffers.set(k, await ctx.decodeAudioData(u8.buffer));
            } catch {
              /* skip */
            }
          })
        )
      )
      .then(() => undefined)
      .catch(() => undefined);
    return this.loading;
  }

  /** Play a recorded sample; returns false if not loaded yet (caller falls back to synth). */
  sample(name: string, gain = 1, rate = 1) {
    if (!this.enabled) return true;
    this.ensure();
    const buf = this.buffers.get(name);
    if (!buf || !this.ctx || !this.sfxGain) return false;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.sfxGain);
    src.start();
    return true;
  }

  private wantMusic = false;
  private intensity = 0.4;
  /** 0 (cruising) to 1 (chase at speed): opens more layers of the music and nudges the tempo up */
  setIntensity(v: number) {
    this.intensity = v;
    this.music?.setIntensity(v);
  }

  private track: TrackId = 'menu';
  /** 'menu' in the menus, 'taxi' for taxi and free driving, 'police' for police missions. */
  setTrack(t: TrackId) {
    this.track = t;
    if (this.music?.playing && this.music.current !== t) this.music.play(t);
    else if (this.wantMusic) this.startMusic();
  }

  private sirenSrc: AudioBufferSourceNode | null = null;
  sirenLoop(on: boolean) {
    if (!on || !this.enabled) {
      try {
        this.sirenSrc?.stop();
      } catch {
        /* ignore */
      }
      this.sirenSrc = null;
      return;
    }
    this.ensure();
    const buf = this.buffers.get('siren');
    if (!buf || !this.ctx || !this.sfxGain) {
      this.sirenSting();
      return;
    }
    if (this.sirenSrc) return;
    const g = this.ctx.createGain();
    g.gain.value = 0.45;
    this.sirenSrc = this.ctx.createBufferSource();
    this.sirenSrc.buffer = buf;
    this.sirenSrc.loop = true;
    this.sirenSrc.connect(g).connect(this.sfxGain);
    this.sirenSrc.start();
  }

  startMusic() {
    this.wantMusic = true;
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx || !this.musicGain) return;
    this.music ??= new EgyptianMusic(this.ctx, this.musicGain);
    this.music.setIntensity(this.intensity);
    this.music.setPaused(this.vol.music < 0.01 || this.vol.master < 0.01);
    this.music.play(this.track);
  }
  stopMusic() {
    this.wantMusic = false;
    this.music?.stop();
  }

  /** Car engine loop; speed01 0..1 drives pitch and level. */
  engine(on: boolean, speed01 = 0) {
    if (!this.ctx || !this.sfxGain) return;
    if (!on || !this.enabled) {
      try {
        this.engineSrc?.stop();
      } catch {
        /* ignore */
      }
      this.engineSrc = null;
      return;
    }
    const buf = this.buffers.get('engine');
    if (!buf) return;
    if (!this.engineSrc) {
      this.engineGain = this.ctx.createGain();
      this.engineSrc = this.ctx.createBufferSource();
      this.engineSrc.buffer = buf;
      this.engineSrc.loop = true;
      this.engineSrc.connect(this.engineGain).connect(this.sfxGain);
      this.engineSrc.start();
    }
    this.engineSrc.playbackRate.value = 0.7 + speed01 * 0.9;
    if (this.engineGain) this.engineGain.gain.value = 0.25 + speed01 * 0.35;
  }

  private ensure() {
    if (this.ctx) return;
    const Ctx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain();
    this.musicGain.connect(this.master);
    this.applyVol();
    void this.loadSamples();
    // a hidden tab is silent (and the generator sleeps with the clock)
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else if (this.enabled) void this.ctx.resume();
    });
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
      this.stopMusic();
      this.engine(false);
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
    g.connect(this.sfxGain ?? this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  sirenSting() {
    if (!this.enabled) return;
    this.resume();
    if (this.buffers.has('siren') && !this.sirenSrc) {
      const src = this.ctx!.createBufferSource();
      const g = this.ctx!.createGain();
      src.buffer = this.buffers.get('siren')!;
      g.gain.setValueAtTime(0.4, this.ctx!.currentTime);
      g.gain.linearRampToValueAtTime(0, this.ctx!.currentTime + 2.6);
      src.connect(g).connect(this.sfxGain!);
      src.start();
      src.stop(this.ctx!.currentTime + 2.7);
      return;
    }
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
  }

  success() {
    if (!this.enabled) return;
    this.resume();
    if (this.sample('success')) return;
    this.tone(523, 0.12, 'triangle', 0.16, 0);
    this.tone(659, 0.12, 'triangle', 0.16, 0.1);
    this.tone(784, 0.28, 'triangle', 0.18, 0.2);
    this.tone(1046, 0.18, 'sine', 0.1, 0.38);
  }

  fail() {
    if (!this.enabled) return;
    this.resume();
    if (this.sample('fail')) return;
    this.tone(220, 0.28, 'sawtooth', 0.14, 0);
    this.tone(165, 0.4, 'sawtooth', 0.16, 0.22);
    this.tone(110, 0.35, 'triangle', 0.1, 0.45);
  }

  click() {
    if (!this.enabled) return;
    this.resume();
    if (this.sample('click')) return;
    this.tone(620, 0.035, 'square', 0.05, 0);
    this.tone(880, 0.03, 'square', 0.03, 0.03);
  }

  radio() {
    if (!this.enabled) return;
    this.resume();
    if (this.sample('alert')) return;
    this.tone(740, 0.06, 'sine', 0.06, 0);
    this.tone(980, 0.08, 'sine', 0.05, 0.12);
    this.tone(620, 0.1, 'triangle', 0.04, 0.28);
  }

  /** Short muzzle crack — cinematic, not a weapon sim. */
  gunshot() {
    if (!this.enabled) return;
    this.ensure();
    if (this.sample('gunshot', 0.8, 0.95 + Math.random() * 0.1)) return;
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
    this.startMusic();
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
    this.stopMusic();
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
// test hook for automated play-throughs (only with ?autotest)
if (typeof location !== 'undefined' && location.search.includes('autotest'))
  (window as unknown as { __audio: AudioManager }).__audio = audio;
