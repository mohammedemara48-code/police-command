/**
 * Plays the recorded Egyptian loops (logic/music.ts): each file is fetched the first time it is needed,
 * decoded once, looped on its bar line and cross-faded with the one before. The generated music (EgyptianMusic)
 * only plays if a file cannot be fetched or decoded (the old track keeps playing while the next one loads).
 */
import { EgyptianMusic } from './EgyptianMusic';
import { MUSIC, musicUrl, playlistFor, type MusicFile, type MusicId, type RadioPick } from '../logic/music';

const FADE = 1.6;
const LEVEL = 0.9;

export class RecordedMusic {
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  /** position in the current playlist */
  private index = 0;
  private src: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private tone: BiquadFilterNode;
  private bus: GainNode;
  private synth: EgyptianMusic;
  private want: MusicId | null = null;
  private paused = false;
  private intensity = 0.4;
  private pick: RadioPick = 'auto';

  constructor(
    private ctx: AudioContext,
    out: AudioNode
  ) {
    this.bus = ctx.createGain();
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.Q.value = 0.5;
    this.bus.connect(this.tone).connect(out);
    this.synth = new EgyptianMusic(ctx, out);
    this.applyTone();
  }

  get playing() {
    return this.want !== null;
  }
  get current() {
    return this.want;
  }

  /** Calm cruising plays the loop a little darker; a chase opens it up and lifts it. */
  setIntensity(v: number) {
    this.intensity = Math.max(0, Math.min(1, v));
    this.synth.setIntensity(v);
    this.applyTone();
  }
  private applyTone() {
    const t = this.ctx.currentTime;
    this.tone.frequency.setTargetAtTime(3500 + 16500 * this.intensity ** 1.5, t, 0.4);
    this.bus.gain.setTargetAtTime(this.paused ? 0 : 0.8 + 0.2 * this.intensity, t, 0.3);
  }

  private load(f: MusicFile) {
    let p = this.buffers.get(f.file);
    if (!p) {
      const url = musicUrl(f, (m) => new Audio().canPlayType(m));
      p = fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((b) => this.ctx.decodeAudioData(b))
        .catch(() => null);
      this.buffers.set(f.file, p);
    }
    return p;
  }

  /** The driver's radio choice; takes effect at once with a crossfade. */
  setPick(p: RadioPick) {
    if (p === this.pick) return;
    this.pick = p;
    this.index = 0;
    if (this.want && !this.paused) this.next(this.want);
  }

  play(id: MusicId) {
    if (this.want === id) return;
    this.want = id;
    this.index = 0;
    if (this.paused) return;
    this.next(id);
  }

  /** Fetch and start the playlist entry at `index` (the old track keeps playing until it is in). */
  private next(id: MusicId) {
    const t = MUSIC[id];
    const files = playlistFor(id, this.pick);
    if (!files.length) {
      this.fadeOutFile();
      this.synth.stop();
      return;
    }
    const f = files[this.index % files.length]!;
    const pick = this.pick;
    void this.load(f).then((buf) => {
      if (this.want !== id || this.paused || this.pick !== pick) return;
      if (!buf) {
        this.fadeOutFile();
        this.synth.play(t.fallback);
        return;
      }
      this.start(id, f, buf);
    });
    // fetch the one after in the background so the change-over is seamless
    if (files.length > 1) void this.load(files[(this.index + 1) % files.length]!);
  }

  private start(id: MusicId, f: MusicFile, buf: AudioBuffer) {
    const now = this.ctx.currentTime;
    this.fadeOutFile();
    this.synth.stop();
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(LEVEL, now + FADE);
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.loopStart = 0;
    s.loopEnd = Math.min(buf.duration, f.loop);
    s.connect(g).connect(this.bus);
    s.start(now);
    this.src = s;
    this.gain = g;
    // a playlist moves on after one pass (minus the crossfade), a single file just keeps looping
    if (playlistFor(id, this.pick).length > 1) {
      const at = Math.max(5, s.loopEnd - FADE) * 1000;
      const mine = s;
      window.setTimeout(() => {
        if (this.src !== mine || this.want !== id || this.paused) return;
        this.index++;
        this.next(id);
      }, at);
    }
  }

  private fadeOutFile() {
    const s = this.src,
      g = this.gain;
    if (!s || !g) return;
    const now = this.ctx.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.linearRampToValueAtTime(0, now + FADE);
    try {
      s.stop(now + FADE + 0.05);
    } catch {
      /* already stopped */
    }
    this.src = this.gain = null;
  }

  stop() {
    this.want = null;
    this.fadeOutFile();
    this.synth.stop();
  }

  /** Muted: the file stops (nothing to decode or mix) and the synth sleeps; unmuting starts the track again. */
  setPaused(on: boolean) {
    if (on === this.paused) return;
    this.paused = on;
    this.synth.setPaused(on);
    this.applyTone();
    if (on) this.fadeOutFile();
    else if (this.want) this.next(this.want);
  }
}
