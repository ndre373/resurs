/**
 * EchoGame — HUD wrapper over the 3D orb scene: phase + progress.
 * The ready gate passes the run duration (finite / Infinity) and difficulty
 * (flash tempo); without them the scene plays its classic round-based mode.
 */

import { useEffect, useState } from "react";
import { controller } from "@/game/boot";
import { voice } from "@/game/voice";
import { ECHO_DIFF } from "@/game/config";
import type { Difficulty, GameResult } from "@/game/types";
import type { EchoHudState } from "@/game/scenes/echo";
import { HowTo, useGameTimer } from "@/ui/common";

export function EchoGame(props: {
  onDone: (r: GameResult) => void;
  maxLen?: number;
  /** Ready-gate time choice: finite seconds = timed run, Infinity = endless. */
  durationSec?: number;
  difficulty?: Difficulty;
}) {
  const [state, setState] = useState<EchoHudState | null>(null);
  // display-only: the scene itself owns the authoritative end-of-time finish
  const timer = useGameTimer(props.durationSec, () => {});

  useEffect(() => {
    const offState = controller.events.on<EchoHudState>("echo:state", setState);
    const offDone = controller.events.on<GameResult>("scene:done", props.onDone);
    controller.enterScene("echo", {
      maxLen: props.maxLen,
      durationSec: props.durationSec,
      showMs: ECHO_DIFF[props.difficulty ?? "mid"],
    });
    controller.audio.setGameFocus(true); // music way down — the orb tones must lead
    voice.setContext("echo");
    voice.cue("Смотрите… слушайте… и повторяйте…", controller.audio.muted);
    return () => {
      offState();
      offDone();
      controller.exitScene();
      controller.audio.setGameFocus(false);
      voice.stop();
      voice.setContext(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const label = !state
    ? "Слушайте…"
    : state.phase === "watch"
      ? "Смотрите и слушайте…"
      : state.phase === "repeat"
        ? `Повторите: ${state.inputCount}/${state.level}`
        : state.phase === "success"
          ? "Верно! Цепочка растёт"
          : "Мимо — та же цепочка ещё раз";

  const finishNow = () =>
    props.onDone({
      game: "echo",
      score: state?.best ?? 0,
      detail: `цепочка до ${state?.best ?? 0} звуков`,
    });

  return (
    <div className="game-stage overlay-pass">
      <HowTo>
        <p>
          Сферы загораются и звучат по очереди — запомните порядок и повторите, касаясь их в той же
          последовательности. Каждый успех добавляет один звук. Три ошибки — конец игры.
        </p>
      </HowTo>
      <div className="echo-hud">
        <div className="echo-phase">{label}</div>
        <div className="echo-meta">
          {timer.active ? `⏱ ${timer.text} · ` : ""}цепочка {state?.level ?? 0} · лучшая{" "}
          {state?.best ?? 0}
        </div>
        {timer.endless && (
          <button className="btn ghost" onClick={finishNow}>
            Завершить
          </button>
        )}
      </div>
    </div>
  );
}
