/**
 * audio.ts — fully synthesized Web Audio engine. No audio files.
 *
 * - Generative ambient music: warm drone, slow pad chords, pentatonic bells,
 *   filtered noise wash. Density/brightness follow an "energy" parameter that
 *   the games set (menus are calm, active games brighter).
 * - Optional binaural beat (10 Hz alpha offset between left/right ear).
 * - Small SFX set synthesized on the fly.
 * - Autoplay-compliant: the AudioContext is created/resumed on first user gesture.
 * - Mute persisted in localStorage, defensive against storage being unavailable.
 */

export type SfxId =
  | "ui"
  | "good"
  | "bad"
  | "tick"
  | "complete"
  | "ring"
  | "pluck"
  | "tomL"
  | "tomR"
  | "whoosh";

import { haptic, HAPTIC } from "./haptics";

/** Tactile echo of the sound events (Vibration API where supported). */
const SFX_HAPTIC: Partial<Record<SfxId, number | readonly number[]>> = {
  good: HAPTIC.good,
  bad: HAPTIC.bad,
  complete: HAPTIC.complete,
  ring: HAPTIC.tap,
  pluck: HAPTIC.tap,
  tomL: HAPTIC.tap,
  tomR: HAPTIC.tap,
};

const MUTE_KEY = "resurs.muted";
const BINAURAL_KEY = "resurs.binaural";
const MUSIC_VOL_KEY = "resurs.musicVol";
/** Base music bus gain — stays at 1; loudness lives in the source levels and
 *  the master compressor tames the peaks, so nothing clips. */
const MUSIC_BASE_GAIN = 1;

// A-minor pentatonic ladder for bells (Hz), two octaves + change.
const PENTA = [440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];
// Slow chord progression (Am9 → Fmaj7 → Cmaj7 → G6), as semitone offsets from A2=110Hz.
const CHORDS: number[][] = [
  [0, 7, 12, 14, 16], // A C E G B... voicing
  [-4, 3, 7, 12, 16], // F A C E G-ish
  [3, 7, 10, 14, 19], // C E G B D
  [-2, 5, 9, 12, 16], // G B D E A
];
const CHORD_ROOT = 110; // A2

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}
function writeFlag(key: string, v: boolean): void {
  try {
    localStorage.setItem(key, v ? "1" : "0");
  } catch {
    /* storage unavailable — in-memory flag still works */
  }
}
function readNum(key: string, fallback: number): number {
  try {
    const v = localStorage.getItem(key);
    const n = v === null ? NaN : Number(v);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}
function writeNum(key: string, v: number): void {
  try {
    localStorage.setItem(key, String(v));
  } catch {
    /* in-memory value still works */
  }
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;

  private droneNodes: AudioNode[] = [];
  private binaural: { oscL: OscillatorNode; oscR: OscillatorNode; gain: GainNode } | null = null;
  private scheduler: number | null = null;
  private nextChordAt = 0;
  private chordIndex = 0;
  /** Public so the controller can replace a disposed engine on remount. */
  disposed = false;
  private running = false;

  muted = false;
  binauralOn = true;
  /** User music volume multiplier (0..1), persisted. Applied on top of the base gain. */
  musicVolume = 1;
  private duckFactor = 1;
  /** Independent of voice ducking: games that live on sound cues (Echo, Rhythm)
   *  pull the music bed way down so their tones stay clearly on top. */
  private focusFactor = 1;
  /** 0 = deep calm … 1 = bright/active. Games push this; music follows. */
  energy = 0.3;

  private readonly unlock = () => {
    this.ensureCtx();
    this.startMusic(); // music only ever starts on a user gesture (autoplay-compliant)
    this.detachUnlock();
  };

  /** True when we suspended the context because the app went to background. */
  private suspendedByVisibility = false;

  /** App hidden/closed → silence; visible again → resume where we left off. */
  private readonly onHidden = () => {
    if (this.ctx && this.ctx.state === "running") {
      this.suspendedByVisibility = true;
      void this.ctx.suspend();
    }
  };

  private readonly onVisible = () => {
    if (!this.suspendedByVisibility) return;
    this.suspendedByVisibility = false;
    const ctx = this.ctx;
    if (ctx && ctx.state === "suspended") {
      void ctx.resume().then(() => {
        // skip the chord backlog that piled up while suspended
        this.nextChordAt = ctx.currentTime + 0.5;
      });
    }
  };

  private readonly onVisibility = () => {
    if (document.hidden) this.onHidden();
    else this.onVisible();
  };

  constructor() {
    this.muted = readFlag(MUTE_KEY, false);
    this.binauralOn = readFlag(BINAURAL_KEY, true);
    this.musicVolume = readNum(MUSIC_VOL_KEY, 1);
    window.addEventListener("pointerdown", this.unlock);
    window.addEventListener("keydown", this.unlock);
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("pagehide", this.onHidden);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.detachUnlock();
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("pagehide", this.onHidden);
    this.stopMusic();
    this.master?.disconnect();
    this.master = null;
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx && ctx.state !== "closed") void ctx.close();
  }

  private detachUnlock(): void {
    window.removeEventListener("pointerdown", this.unlock);
    window.removeEventListener("keydown", this.unlock);
  }

  private ensureCtx(): AudioContext | null {
    if (this.disposed) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return null;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      // Gentle bus compressor: the music bed mixes a drone, pad chords and
      // bells at lively levels — this catches the summed peaks so the output
      // stays loud without clipping/distortion.
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 20;
      comp.ratio.value = 6;
      comp.attack.value = 0.003;
      comp.release.value = 0.25;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = MUSIC_BASE_GAIN * this.musicVolume;
      this.musicBus.connect(this.master);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.9;
      this.sfxBus.connect(this.master);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  /** Current audio clock in seconds (0 when the context does not exist yet). */
  now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    writeFlag(MUTE_KEY, this.muted);
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.1);
    }
    return this.muted;
  }

  toggleBinaural(): boolean {
    this.binauralOn = !this.binauralOn;
    writeFlag(BINAURAL_KEY, this.binauralOn);
    if (this.binauralOn && this.running) this.startBinaural();
    else this.stopBinaural();
    return this.binauralOn;
  }

  /** Smoothly scale the music bed under the voice (1 = full, lower = ducked). */
  duck(factor: number): void {
    this.duckFactor = factor;
    this.updateMusicGain();
  }

  /** Sound-driven games: music retreats to a quiet background while they run. */
  setGameFocus(on: boolean): void {
    this.focusFactor = on ? 0.22 : 1;
    this.updateMusicGain();
  }

  /** User music volume (0..1) — the settings slider drives this. */
  setMusicVolume(v: number): void {
    this.musicVolume = Math.min(1, Math.max(0, v));
    writeNum(MUSIC_VOL_KEY, this.musicVolume);
    this.updateMusicGain();
  }

  private updateMusicGain(): void {
    if (!this.ctx || !this.musicBus) return;
    const target = MUSIC_BASE_GAIN * this.musicVolume * this.duckFactor * this.focusFactor;
    this.musicBus.gain.setTargetAtTime(target, this.ctx.currentTime, 0.3);
  }

  // ---------------------------------------------------------------- music

  startMusic(): void {
    if (this.disposed || this.running) return;
    const ctx = this.ensureCtx();
    if (!ctx || !this.musicBus) return;
    this.running = true;

    // --- drone: two detuned saws through a slow-breathing lowpass
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.1;
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 480;
    droneFilter.Q.value = 0.8;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05; // 20 s breath of the filter
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain).connect(droneFilter.frequency);
    for (const detune of [-4, 3]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = CHORD_ROOT;
      osc.detune.value = detune;
      osc.connect(droneFilter);
      osc.start();
      this.droneNodes.push(osc);
    }
    lfo.start();
    this.droneNodes.push(lfo);
    droneFilter.connect(droneGain).connect(this.musicBus);
    this.droneNodes.push(droneFilter, droneGain);

    // --- noise wash
    const noise = ctx.createBufferSource();
    noise.buffer = this.getNoiseBuffer();
    noise.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.value = 320;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.024;
    noise.connect(noiseFilter).connect(noiseGain).connect(this.musicBus);
    noise.start();
    this.droneNodes.push(noise, noiseFilter, noiseGain);

    if (this.binauralOn) this.startBinaural();

    // --- scheduler: pad chords + pentatonic bells
    this.nextChordAt = ctx.currentTime + 0.3;
    this.chordIndex = 0;
    this.scheduler = window.setInterval(() => this.schedule(), 250);
  }

  stopMusic(): void {
    this.running = false;
    if (this.scheduler !== null) {
      clearInterval(this.scheduler);
      this.scheduler = null;
    }
    this.stopBinaural();
    for (const n of this.droneNodes) {
      try {
        if (n instanceof OscillatorNode || n instanceof AudioBufferSourceNode) n.stop();
      } catch {
        /* already stopped */
      }
      n.disconnect();
    }
    this.droneNodes = [];
  }

  private startBinaural(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus || this.binaural) return;
    const gain = ctx.createGain();
    gain.gain.value = 0.022;
    const panL = ctx.createStereoPanner();
    panL.pan.value = -1;
    const panR = ctx.createStereoPanner();
    panR.pan.value = 1;
    const oscL = ctx.createOscillator();
    oscL.frequency.value = 180;
    const oscR = ctx.createOscillator();
    oscR.frequency.value = 190; // 10 Hz alpha offset
    oscL.connect(panL).connect(gain);
    oscR.connect(panR).connect(gain);
    gain.connect(this.musicBus);
    oscL.start();
    oscR.start();
    this.binaural = { oscL, oscR, gain };
  }

  private stopBinaural(): void {
    if (!this.binaural) return;
    try {
      this.binaural.oscL.stop();
      this.binaural.oscR.stop();
    } catch {
      /* already stopped */
    }
    this.binaural.gain.disconnect();
    this.binaural = null;
  }

  private getNoiseBuffer(): AudioBuffer {
    const ctx = this.ctx!;
    if (!this.noiseBuf) {
      const len = ctx.sampleRate * 2;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        // pink-ish noise: cheap one-pole lowpass over white noise
        const white = Math.random() * 2 - 1;
        last = last * 0.97 + white * 0.03;
        data[i] = last * 6;
      }
    }
    return this.noiseBuf;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus || !this.running) return;
    if (document.hidden) return; // nothing piles up while the app is in background
    const ahead = ctx.currentTime + 0.6;

    // pad chord every 9 s
    while (this.nextChordAt < ahead) {
      this.playPadChord(this.nextChordAt);
      this.nextChordAt += 9;
    }

    // bells: probability and register follow energy
    const p = 0.12 + this.energy * 0.4;
    if (Math.random() < p) {
      const note = PENTA[(Math.random() * PENTA.length) | 0];
      this.bell(ctx.currentTime + Math.random() * 0.4, note, 0.05 + this.energy * 0.05);
    }
  }

  private playPadChord(at: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    const chord = CHORDS[this.chordIndex % CHORDS.length];
    this.chordIndex++;
    const dur = 10;
    for (const semi of chord) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = CHORD_ROOT * Math.pow(2, semi / 12);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.055, at + dur * 0.4);
      gain.gain.linearRampToValueAtTime(0, at + dur);
      osc.connect(gain).connect(this.musicBus);
      osc.start(at);
      osc.stop(at + dur + 0.1);
    }
  }

  /** Public bell — used by games (Echo orbs, Mirror strokes) and by the generative layer.
   *  bus: gameplay cues belong on "sfx" (the loud channel); the generative bed stays on "music". */
  bell(at: number, freq: number, volume = 0.09, bus: "music" | "sfx" = "music"): void {
    const ctx = this.ctx;
    const out = bus === "sfx" ? this.sfxBus : this.musicBus;
    if (!ctx || !out || this.muted) return;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = freq * 2.01; // gentle shimmer partial
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0005, at + 1.8);
    const gain2 = ctx.createGain();
    gain2.gain.value = 0.25;
    osc.connect(gain);
    osc2.connect(gain2).connect(gain);
    gain.connect(out);
    osc.start(at);
    osc2.start(at);
    osc.stop(at + 2);
    osc2.stop(at + 2);
  }

  // ---------------------------------------------------------------- sfx

  sfx(id: SfxId): void {
    if (this.disposed) return;
    // tactile feedback fires even when the sound is muted — it is not sound
    const hp = SFX_HAPTIC[id];
    if (hp !== undefined) haptic(hp);
    if (this.muted) return;
    const ctx = this.ensureCtx();
    if (!ctx || !this.sfxBus) return;
    const t = ctx.currentTime;

    const tone = (
      type: OscillatorType,
      f0: number,
      f1: number,
      dur: number,
      vol: number,
      attack = 0.005,
    ) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + attack);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      osc.connect(gain).connect(this.sfxBus!);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    };

    switch (id) {
      case "ui":
        tone("sine", 620, 720, 0.07, 0.08);
        break;
      case "good":
        tone("sine", 523, 784, 0.18, 0.14);
        tone("sine", 1046, 1568, 0.24, 0.05, 0.02);
        break;
      case "bad":
        tone("triangle", 196, 130, 0.22, 0.1);
        break;
      case "tick":
        tone("square", 880, 880, 0.03, 0.04);
        break;
      case "complete":
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
          setTimeout(() => this.sfxBellShort(f), i * 110),
        );
        break;
      case "ring":
        tone("sine", 1174.66, 1174.66, 0.5, 0.1, 0.002);
        tone("sine", 1760, 1760, 0.35, 0.04, 0.002);
        break;
      case "pluck":
        this.bell(t, PENTA[(Math.random() * PENTA.length) | 0], 0.13, "sfx");
        break;
      case "tomL":
        tone("sine", 150, 55, 0.18, 0.38, 0.002);
        break;
      case "tomR":
        tone("sine", 240, 95, 0.14, 0.3, 0.002);
        break;
      case "whoosh":
        tone("sine", 300, 900, 0.4, 0.04, 0.15);
        break;
    }
  }

  private sfxBellShort(freq: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || this.muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.9);
    osc.connect(gain).connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + 1);
  }
}
