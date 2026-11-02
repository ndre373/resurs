/**
 * voice.ts — hypnotic voice layer over the music, built on the browser's
 * speech synthesis (no audio files): slow pacing, warm low register, long
 * pauses on ellipses.
 *
 * Two independent features:
 *  - «Суфлёр» (cue)    — short guiding phrases during exercises; a new cue
 *                        interrupts the previous one. The music bed ducks
 *                        deeper under a cue so the command stands apart.
 *  - «Аффирмации»      — research-based phrases (second person, present
 *                        tense, process-oriented, believable) spoken OVER the
 *                        music every 45–75 s, with only a slight duck so the
 *                        affirmation blends into the background bed.
 * Each exercise has its own affirmation set (voice.setContext from the game).
 * Speech stops when the app goes to background; both features are
 * individually toggleable and persisted.
 */

import { pauseBus } from "./pause";

const VOICE_KEY = "resurs.voice";
const AFFIRM_KEY = "resurs.affirmations";
const VOICE_VOL_KEY = "resurs.voiceVol";

const AFFIRMATIONS: Record<string, string[]> = {
  default: [
    "С каждым вдохом… вы становитесь спокойнее…",
    "Ваше бессознательное… уже знает ответ…",
    "Позвольте состоянию… просто быть…",
    "Оба полушария… работают вместе… легко…",
    "Вы в потоке… и это приятно…",
    "Каждое движение… возвращает вам ресурс…",
    "Чем глубже расслабление… тем ярче фокус…",
    "Всё нужное… приходит само… вовремя…",
    "Ваше тело… умеет восстанавливаться…",
    "Спокойствие… уже внутри вас…",
  ],
  breath: [
    "С каждым выдохом… плечи становятся мягче…",
    "Ваше дыхание… спокойное… и ровное…",
    "Тело расслабляется… само… прямо сейчас…",
    "Каждый цикл дыхания… возвращает вам силы…",
    "Вы дышите… а спокойствие растёт…",
    "Сердце бьётся ровно… легко… и свободно…",
    "Тепло разливается… по всему телу…",
  ],
  flow: [
    "Вы движетесь легко… и свободно…",
    "Внимание острое… а тело расслаблено…",
    "Каждое кольцо… встречает вас… точно вовремя…",
    "Вы уже в потоке… и он мягко несёт вас…",
    "Реакция быстрая… а внутри — тишина…",
    "Рука знает путь… раньше мысли…",
    "Скорость растёт… а лёгкость остаётся…",
  ],
  alphabet: [
    "Оба полушария… работают как одно…",
    "Ответ приходит… раньше мысли…",
    "Ваш мозг быстрый… и гибкий…",
    "Левая и правая… помогают друг другу…",
    "С каждым раундом… легче и легче…",
    "Вы справляетесь… играючи…",
  ],
  stroop: [
    "Вы замечаете главное… мгновенно…",
    "Восприятие гибкое… и свежее…",
    "Спокойствие сильнее… любой путаницы…",
    "Ваш ум ясный… как родниковая вода…",
    "Вы выбираете легко… и точно…",
    "Каждый ответ… делает вас собраннее…",
  ],
  echo: [
    "Ваша память яркая… и надёжная…",
    "Вы слушаете… и звуки остаются с вами…",
    "Внимание — как луч… ясный и ровный…",
    "Каждая цепочка… складывается сама…",
    "Вы запоминаете легко… играючи…",
    "Образы и звуки… ваши верные друзья…",
  ],
  rhythm: [
    "Ваши руки… понимают друг друга…",
    "Ритм живёт… прямо в вашем теле…",
    "Левая и правая рука… в едином танце…",
    "Тело помнит… каждое движение…",
    "Вы слышите ритм… всем собой…",
    "Координация растёт… с каждым тактом…",
  ],
  mirror: [
    "Ваша рука свободна… и уверенна…",
    "Творчество течёт… широко и свободно…",
    "Каждый штрих… прекрасен… уже сейчас…",
    "Вы создаёте гармонию… легко…",
    "Воображение широкое… и яркое…",
    "Внутри вас… бесконечный источник образов…",
  ],
  cross: [
    "Левая и правая рука… движутся как одна…",
    "Середина исчезает… остаётся целое…",
    "Оба полушария… дышат в унисон…",
    "Каждое касание… соединяет вас…",
    "Тело знает… симметрию и баланс…",
    "Движения точные… и свободные…",
  ],
};

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
    /* in-memory flag still works */
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

/** Minimal shape of the music bed the voice ducks under. */
interface Duckable {
  duck(factor: number): void;
}

class VoiceEngine {
  voiceOn = readFlag(VOICE_KEY, true);
  affirmationsOn = readFlag(AFFIRM_KEY, true);
  /** User voice volume (0..1), persisted. */
  speechVolume = readNum(VOICE_VOL_KEY, 1);

  setSpeechVolume(v: number): void {
    this.speechVolume = Math.min(1, Math.max(0, v));
    writeNum(VOICE_VOL_KEY, this.speechVolume);
  }

  private ruVoice: SpeechSynthesisVoice | null = null;
  private audio: Duckable | null = null;
  private context: string | null = null;
  private lastAffirm = 0;
  private nextGap = 45;

  constructor() {
    if (this.available) {
      const pick = () => {
        const ru = speechSynthesis
          .getVoices()
          .filter((v) => v.lang.toLowerCase().startsWith("ru"));
        // prefer the most natural-sounding Russian voice available
        const score = (v: SpeechSynthesisVoice): number => {
          const n = v.name.toLowerCase();
          let s = 0;
          if (/google/.test(n)) s += 3; // neural TTS on Android/Chrome
          if (/milena|svetlana|katya|alena|milena/.test(n)) s += 2; // pleasant iOS voices
          if (/enhanced|premium|natural|neural/.test(n)) s += 2;
          if (/female|жен/.test(n)) s += 1;
          if (/compact/.test(n)) s -= 3; // low-quality bundled voices
          if (v.default) s += 1;
          return s;
        };
        this.ruVoice = ru.sort((a, b) => score(b) - score(a))[0] ?? null;
      };
      pick();
      speechSynthesis.onvoiceschanged = pick;

      // Mobile browsers only allow speech inside a user gesture: iOS blocks
      // the very first utterance unless it is triggered by a tap, and Chrome
      // on Android pauses the synthesis queue until resume() is called from
      // a gesture. Unlock once on the first touch with a silent utterance.
      const unlock = () => {
        try {
          speechSynthesis.resume();
          const u = new SpeechSynthesisUtterance(" ");
          u.volume = 0;
          u.rate = 2;
          speechSynthesis.speak(u);
        } catch {
          /* still locked — the next gesture will retry via resume() */
        }
      };
      window.addEventListener("pointerdown", unlock, { once: true });

      // app hidden / closed → stop speaking immediately
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) this.stop();
      });
      window.addEventListener("pagehide", () => this.stop());

      // freeze the voice together with the exercise
      pauseBus.on((p) => {
        try {
          if (p) speechSynthesis.pause();
          else speechSynthesis.resume();
        } catch {
          /* pause unsupported — harmless */
        }
      });
    }
  }

  get available(): boolean {
    return typeof speechSynthesis !== "undefined";
  }

  /** Music bed to duck under the voice (set by the controller). */
  setAudio(a: Duckable): void {
    this.audio = a;
  }

  /** Which exercise is active — picks its affirmation set. */
  setContext(id: string | null): void {
    this.context = id;
  }

  toggleVoice(): boolean {
    this.voiceOn = !this.voiceOn;
    writeFlag(VOICE_KEY, this.voiceOn);
    if (!this.voiceOn) this.stop();
    return this.voiceOn;
  }

  toggleAffirmations(): boolean {
    this.affirmationsOn = !this.affirmationsOn;
    writeFlag(AFFIRM_KEY, this.affirmationsOn);
    return this.affirmationsOn;
  }

  /** Hypnotic color: slow, warm, quiet — with long pauses on the ellipses. */
  private hypnotic(u: SpeechSynthesisUtterance): void {
    u.lang = "ru-RU";
    if (this.ruVoice) u.voice = this.ruVoice;
    u.rate = 0.72; // slow trance pacing
    u.pitch = 0.8; // warm low register, still natural
    u.volume = Math.min(1, 0.95 * this.speechVolume);
  }

  /** Speak with music ducking; restore the bed when the phrase ends. */
  private speak(u: SpeechSynthesisUtterance, duckTo: number): void {
    const restore = () => this.audio?.duck(1);
    u.onstart = () => this.audio?.duck(duckTo);
    u.onend = restore;
    u.onerror = restore;
    // Chrome on Android keeps the queue paused after a cancel() — wake it up
    // right before speaking, otherwise utterances pile up silently.
    try {
      speechSynthesis.resume();
    } catch {
      /* ignore */
    }
    speechSynthesis.speak(u);
    // fallback: some platforms skip events — never leave the music ducked
    setTimeout(restore, Math.min(25000, 2000 + u.text.length * 150));
  }

  /** Prompter cue — stands apart from the music (deeper duck), never queues. */
  cue(text: string, audioMuted: boolean): void {
    if (!this.voiceOn || audioMuted || !this.available) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      this.hypnotic(u);
      this.speak(u, 0.45);
    } catch {
      /* speech unavailable in this environment */
    }
  }

  /** Affirmation over the music — slight duck, blends INTO the bed; yields to cues. */
  maybeAffirm(audioMuted: boolean): void {
    if (!this.affirmationsOn || audioMuted || !this.available) return;
    const now = performance.now() / 1000;
    if (now - this.lastAffirm < this.nextGap) return;
    try {
      if (speechSynthesis.speaking) return; // never interrupt the prompter
      this.lastAffirm = now;
      this.nextGap = 45 + Math.random() * 30;
      const pool = AFFIRMATIONS[this.context ?? "default"] ?? AFFIRMATIONS.default;
      const u = new SpeechSynthesisUtterance(pool[(Math.random() * pool.length) | 0]);
      this.hypnotic(u);
      u.rate = 0.66; // affirmations run even slower than cues
      u.volume = Math.min(1, 0.9 * this.speechVolume);
      this.speak(u, 0.7);
    } catch {
      /* speech unavailable */
    }
  }

  stop(): void {
    try {
      if (this.available) speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
    this.audio?.duck(1);
  }
}

export const voice = new VoiceEngine();
