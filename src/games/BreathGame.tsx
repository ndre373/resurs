/**
 * BreathGame — HUD wrapper over the 3D lotus: phase label, cycle progress,
 * breathing-pattern selector (coherent 5·5 / 4-7-8 / box 4·4·4·4), duration
 * selector and the fading hypnotic prompter: precise phase cues for the first
 * few cycles, then only rare soft reminders while the rhythm carries itself.
 */

import { useEffect, useRef, useState } from "react";
import { controller } from "@/game/boot";
import { voice } from "@/game/voice";
import { haptic } from "@/game/haptics";
import type { Difficulty, GameResult } from "@/game/types";
import {
  BREATH_PATTERNS,
  patternById,
  type BreathPattern,
  type BreathPhase,
} from "@/game/breathPatterns";
import type { BreathState } from "@/game/scenes/breath";
import type { BreathVisual } from "@/game/scenes/breath";
import { storage } from "@/game/storage";
import { HowTo } from "@/ui/common";
import { getDefaultDuration } from "@/game/settings";
import { BREATH_DIFF } from "@/game/config";

const cycleSeconds = (p: BreathPattern): number => p.steps.reduce((s, x) => s + x.sec, 0);

/** Breathing visuals — all three breathe with the same openness curve. */
const VISUALS: { id: BreathVisual; label: string }[] = [
  { id: "lotus", label: "Лотос" },
  { id: "spiral", label: "Спираль" },
  { id: "ripples", label: "Круги" },
];
const VISUAL_KEY = "breathVisual";

/** Minutes → breath cycles for the given pattern. 0 minutes = endless. */
const cyclesFor = (minutes: number, p: BreathPattern): number =>
  minutes <= 0 ? Infinity : Math.max(1, Math.round((minutes * 60) / cycleSeconds(p)));

/** Exact phase cues while the prompter still leads. */
const PHASE_CUE: Record<BreathPhase, string> = {
  in: "Вдох…",
  hold: "Задержка…",
  out: "Выдох…",
};
/** Soft reminders after the prompter fades out. */
const SOFT_CUES = [
  "Дыхание продолжается… само…",
  "Вы делаете всё правильно…",
  "Тело помнит ритм…",
  "Просто следуйте за лотосом…",
];

/** Tactile phase marks (Android): a short buzz on inhale, a double on hold,
 *  a long one on exhale — so the practice works with eyes closed. */
const PHASE_VIBRO: Record<BreathPhase, number[]> = {
  in: [35],
  hold: [25, 50, 25],
  out: [80],
};

function pluralCycles(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "цикл";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "цикла";
  return "циклов";
}

export function BreathGame(props: {
  onDone: (r: GameResult) => void;
  cycles?: number;
  /** Ready-gate time choice in minutes (0 = endless). Overrides the saved default. */
  durationMin?: number;
  difficulty?: Difficulty;
}) {
  const [state, setState] = useState<BreathState | null>(null);
  // In session mode (props.cycles) the duration is fixed — no selector.
  const sessionMode = props.cycles !== undefined;
  const minutes = props.durationMin ?? getDefaultDuration();
  const [patternId, setPatternId] = useState(BREATH_PATTERNS[0].id);
  const [visualId, setVisualId] = useState<BreathVisual>(() =>
    storage.get<BreathVisual>(VISUAL_KEY, "lotus"),
  );
  const stateRef = useRef<BreathState | null>(null);
  stateRef.current = state;

  const pattern = patternById(patternId);
  /** How many first cycles the prompter leads in detail — follows difficulty. */
  const guidedCycles = BREATH_DIFF[props.difficulty ?? "mid"];

  useEffect(() => {
    let lastPhase: string | null = null;
    const p = patternById(patternId);
    const offState = controller.events.on<BreathState>("breath:state", (s) => {
      setState(s);
      if (s.phase !== lastPhase) {
        lastPhase = s.phase;
        haptic(PHASE_VIBRO[s.phase]);
        if (s.cycle < guidedCycles) {
          // lead every phase at the start…
          voice.cue(PHASE_CUE[s.phase], controller.audio.muted);
        } else if (s.phase === "in" && s.cycle % 3 === 0) {
          // …then fade to a soft reminder every few cycles
          voice.cue(SOFT_CUES[(Math.random() * SOFT_CUES.length) | 0], controller.audio.muted);
        }
      }
    });
    const offDone = controller.events.on<GameResult>("scene:done", (r) =>
      props.onDone({ ...r, difficulty: props.difficulty ?? "mid" }),
    );
    controller.enterScene("breath", {
      cycles: sessionMode ? props.cycles : cyclesFor(minutes, p),
      breathPattern: p,
      breathVisual: sessionMode ? "lotus" : visualId,
    });
    voice.setContext("breath");
    return () => {
      offState();
      offDone();
      controller.exitScene();
      voice.stop();
      voice.setContext(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minutes, patternId, visualId]);

  const finishEndless = () => {
    const done = stateRef.current?.cycle ?? 0;
    props.onDone({
      game: "breath",
      score: done,
      detail: `${done} ${pluralCycles(done)} · ${pattern.label}`,
      difficulty: props.difficulty ?? "mid",
    });
  };

  const phaseText = !state
    ? "Приготовьтесь…"
    : state.phase === "in"
      ? "Вдох"
      : state.phase === "hold"
        ? "Задержка"
        : "Выдох";
  const hint =
    state?.phase === "in"
      ? "медленно, через нос, животом"
      : state?.phase === "hold"
        ? "мягко удерживайте воздух"
        : "длинный, мягкий, без усилия";
  const endless = !sessionMode && minutes === 0;
  const cyclesText = !state
    ? ""
    : Number.isFinite(state.totalCycles)
      ? `цикл ${Math.min(state.cycle + 1, state.totalCycles)} из ${state.totalCycles}`
      : `цикл ${state.cycle + 1}`;

  return (
    <div className="game-stage overlay-pass">
      <HowTo>
        <p>
          Следуйте за образом: он раскрывается — <b>вдох</b>, собирается — <b>выдох</b>, замирает —{" "}
          <b>задержка</b>. Образ на выбор: разноцветный <b>лотос</b>, гипнотическая{" "}
          <b>спираль</b> или <b>круги на воде</b> — все дышат вместе с вами. Смена фазы отдаётся
          лёгкой вибрацией (на Android) — можно дышать с закрытыми глазами. Выберите ритм:
          когерентное дыхание (5·5) переключает нервную систему в ресурсный режим, 4-7-8 глубоко
          расслабляет, «квадрат» собирает внимание. Суфлёр ведёт первые циклы, потом затихает —
          дыхание продолжается само.
        </p>
      </HowTo>
      <div className="breath-hud">
        <div className={`breath-phase ${state?.phase ?? ""}`}>{phaseText}</div>
        <div className="breath-hint">{hint}</div>
        <div className="breath-cycles">{cyclesText}</div>
      </div>
      {!sessionMode && (
        <div className="breath-choices">
          <div className="chips-caption">Ритм</div>
          <div className="pattern-chips" role="group" aria-label="Ритм дыхания">
            {BREATH_PATTERNS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`chip ${p.id === patternId ? "on" : ""}`}
                onClick={() => setPatternId(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="chips-caption">Образ</div>
          <div className="pattern-chips" role="group" aria-label="Образ дыхания">
            {VISUALS.map((v) => (
              <button
                key={v.id}
                type="button"
                className={`chip ${v.id === visualId ? "on" : ""}`}
                onClick={() => {
                  controller.audio.sfx("ui");
                  setVisualId(v.id);
                  storage.set(VISUAL_KEY, v.id);
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {endless && (
        <button className="btn ghost" onClick={finishEndless}>
          Завершить
        </button>
      )}
    </div>
  );
}
