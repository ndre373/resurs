/**
 * ui/common.tsx — shared chrome: TopBar (back/mute/binaural), game cards,
 * result modal, "how to play" panel. All Russian UI copy lives with the games.
 */

import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Volume2,
  VolumeX,
  Waves,
  RotateCcw,
  LayoutGrid,
  Mic,
  MicOff,
  Quote,
  SlidersHorizontal,
  Pause,
  Play,
} from "lucide-react";
import { controller } from "@/game/boot";
import { voice } from "@/game/voice";
import { pauseBus } from "@/game/pause";
import type { GameResult } from "@/game/types";

export function TopBar(props: {
  title: string;
  onBack?: () => void;
  pausable?: boolean;
  /** Hide the voice/affirmation/binaural/mixer quick toggles (e.g. on the Settings screen). */
  simple?: boolean;
}) {
  const [muted, setMuted] = useState(controller.audio.muted);
  const [binaural, setBinaural] = useState(controller.audio.binauralOn);
  const [voiceOn, setVoiceOn] = useState(voice.voiceOn);
  const [affirmOn, setAffirmOn] = useState(voice.affirmationsOn);
  const [showMixer, setShowMixer] = useState(false);
  const [paused, setPaused] = useState(pauseBus.paused);
  const [musicVol, setMusicVol] = useState(controller.audio.musicVolume);
  const [voiceVol, setVoiceVol] = useState(voice.speechVolume);

  useEffect(() => pauseBus.on(setPaused), []);

  return (
    <div className="topbar">
      <div className="topbar-left">
        {props.onBack && (
          <button className="icon-btn" onClick={props.onBack} aria-label="Назад">
            <ArrowLeft size={20} />
          </button>
        )}
        <span className="topbar-title">{props.title}</span>
      </div>
      <div className="topbar-right">
        {props.pausable && (
          <button
            className={`icon-btn ${paused ? "active" : ""}`}
            title={paused ? "Продолжить упражнение" : "Пауза"}
            aria-label={paused ? "Продолжить упражнение" : "Пауза"}
            onClick={() => pauseBus.toggle()}
          >
            {paused ? <Play size={18} /> : <Pause size={18} />}
          </button>
        )}
        {!props.simple && (
        <button
          className={`icon-btn ${voiceOn ? "active" : ""}`}
          title="Суфлёр — голосовые подсказки в упражнениях"
          aria-label="Суфлёр — голосовые подсказки"
          onClick={() => setVoiceOn(voice.toggleVoice())}
        >
          {voiceOn ? <Mic size={18} /> : <MicOff size={18} />}
        </button>
        )}
        {!props.simple && (
        <button
          className={`icon-btn ${affirmOn ? "active" : ""}`}
          title="Аффирмации гипнотическим голосом поверх музыки"
          aria-label="Аффирмации"
          onClick={() => setAffirmOn(voice.toggleAffirmations())}
        >
          <Quote size={18} />
        </button>
        )}
        {!props.simple && (
        <button
          className={`icon-btn ${binaural ? "active" : ""}`}
          title="Бинауральный ритм (альфа 10 Гц)"
          aria-label="Бинауральный ритм"
          onClick={() => setBinaural(controller.audio.toggleBinaural())}
        >
          <Waves size={18} />
        </button>
        )}
        <button
          className="icon-btn"
          title={muted ? "Включить звук" : "Выключить звук"}
          aria-label={muted ? "Включить звук" : "Выключить звук"}
          onClick={() => setMuted(controller.audio.toggleMute())}
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        {!props.simple && (
        <button
          className={`icon-btn ${showMixer ? "active" : ""}`}
          title="Громкость музыки и голоса"
          aria-label="Настройки громкости"
          onClick={() => setShowMixer((s) => !s)}
        >
          <SlidersHorizontal size={18} />
        </button>
        )}
      </div>
      {showMixer && (
        <div className="mixer-panel">
          <label className="mixer-row">
            <span>Музыка</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(musicVol * 100)}
              aria-label="Громкость музыки"
              onChange={(e) => {
                const v = Number(e.target.value) / 100;
                setMusicVol(v);
                controller.audio.setMusicVolume(v);
              }}
            />
          </label>
          <label className="mixer-row">
            <span>Голос</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(voiceVol * 100)}
              aria-label="Громкость голоса"
              onChange={(e) => {
                const v = Number(e.target.value) / 100;
                setVoiceVol(v);
                voice.setSpeechVolume(v);
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}

/** Full-screen «Пауза» veil over a frozen exercise. */
export function PauseOverlay() {
  const [paused, setPaused] = useState(pauseBus.paused);
  useEffect(() => pauseBus.on(setPaused), []);
  if (!paused) return null;
  return (
    <div className="pause-veil" role="status">
      <div className="pause-card">
        <div className="pause-title">Пауза</div>
        <p className="pause-text">
          Упражнение замерло — таймеры и подсказки остановлены. Возвращайтесь, когда будете готовы.
        </p>
        <button className="btn primary big" onClick={() => pauseBus.set(false)}>
          <Play size={16} /> Продолжить
        </button>
      </div>
    </div>
  );
}

export function GameCard(props: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  channels: string[];
  best?: number;
  bestLabel?: string;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button className="game-card" onClick={props.onClick} style={{ ["--accent" as string]: props.accent }}>
      <div className="game-card-icon">{props.icon}</div>
      <div className="game-card-body">
        <div className="game-card-title">{props.title}</div>
        <div className="game-card-subtitle">{props.subtitle}</div>
        <div className="game-card-channels">
          {props.channels.map((c) => (
            <span key={c} className="channel-chip">
              {c}
            </span>
          ))}
        </div>
      </div>
      {props.best !== undefined && props.best > 0 && (
        <div className="game-card-best">
          <span className="best-value">{props.best}</span>
          <span className="best-label">{props.bestLabel ?? "рекорд"}</span>
        </div>
      )}
    </button>
  );
}

export function ResultModal(props: {
  result: GameResult;
  onAgain: () => void;
  onHub: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-kicker">Игра завершена</div>
        <div className="modal-score">{props.result.score}</div>
        <div className="modal-detail">{props.result.detail}</div>
        <div className="modal-actions">
          <button className="btn primary" onClick={props.onAgain}>
            <RotateCcw size={16} /> Ещё раз
          </button>
          <button className="btn ghost" onClick={props.onHub}>
            <LayoutGrid size={16} /> К играм
          </button>
        </div>
      </div>
    </div>
  );
}

/** App crash guard — a calm recovery screen instead of a blank page. */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  componentDidCatch(err: unknown): void {
    console.error("[resurs] UI error:", err);
  }
  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="error-fallback">
        <div className="modal-card">
          <div className="modal-kicker">Что-то пошло не так</div>
          <div className="modal-detail">
            Приложение столкнулось с ошибкой. Ваши данные не пострадали — они хранятся локально.
          </div>
          <div className="modal-actions">
            <button className="btn primary" onClick={() => window.location.reload()}>
              <RotateCcw size={16} /> Обновить
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export function HowTo(props: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="howto">
      <button className="howto-toggle" onClick={() => setOpen(!open)}>
        {open ? "Скрыть правила ▴" : "Как играть ▾"}
      </button>
      {open && <div className="howto-body">{props.children}</div>}
    </div>
  );
}

/** Duration options in minutes; 0 = endless («бесконечное повторение»). */
export const DURATION_OPTIONS = [1, 5, 10, 15, 20, 0] as const;

export function DurationChips(props: {
  value: number;
  onChange: (minutes: number) => void;
  /** Shown only in endless mode — lets the user finish whenever they want. */
  onFinish?: () => void;
}) {
  return (
    <div className="duration-bar">
      <div className="chips">
        {DURATION_OPTIONS.map((m) => (
          <button
            key={m}
            className={`chip ${props.value === m ? "on" : ""}`}
            onClick={() => props.onChange(m)}
          >
            {m === 0 ? "∞" : `${m} мин`}
          </button>
        ))}
        {props.value === 0 && props.onFinish && (
          <button className="chip finish-chip" onClick={props.onFinish}>
            Завершить
          </button>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------- game timer

/** Formats seconds as m:ss for the game HUD. */
export function fmtTime(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export interface GameTimer {
  /** Remaining time "м:сс" (timed run) or elapsed time (endless run). */
  text: string;
  /** True for an endless run — the game shows its own «Завершить» button. */
  endless: boolean;
  /** Seconds since the run started (pause-aware). */
  elapsed: number;
  active: boolean;
}

/**
 * Shared run timer for the ready-gate duration choice.
 * durationSec: finite = auto-finish at zero; Infinity = endless; undefined =
 * legacy round-based mode (timer inactive). Pauses with the app.
 * active=false freezes the countdown — games with their own «Начать» screen
 * (Cross, Rhythm) pass active only after the run really starts.
 */
export function useGameTimer(
  durationSec: number | undefined,
  onTimeout: () => void,
  running = true,
): GameTimer {
  const [elapsed, setElapsed] = useState(0);
  const timeoutRef = useRef(onTimeout);
  timeoutRef.current = onTimeout;
  const runningRef = useRef(running);
  runningRef.current = running;

  useEffect(() => {
    if (durationSec === undefined) return;
    let acc = 0;
    let last = performance.now();
    let fired = false;
    setElapsed(0);
    const iv = setInterval(() => {
      const now = performance.now();
      if (!pauseBus.paused && runningRef.current) acc += (now - last) / 1000;
      last = now;
      setElapsed(acc);
      if (Number.isFinite(durationSec) && acc >= durationSec && !fired) {
        fired = true;
        timeoutRef.current();
      }
    }, 250);
    return () => clearInterval(iv);
  }, [durationSec]);

  const endless = durationSec === Infinity;
  const text =
    durationSec === undefined
      ? ""
      : endless
        ? fmtTime(elapsed)
        : fmtTime(Math.max(0, (durationSec as number) - elapsed));
  return { text, endless, elapsed, active: durationSec !== undefined };
}
