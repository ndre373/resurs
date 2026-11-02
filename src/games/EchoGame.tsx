/**
 * EchoGame — HUD wrapper over the 3D orb scene: phase + progress.
 */

import { useEffect, useState } from "react";
import { controller } from "@/game/boot";
import { voice } from "@/game/voice";
import type { GameResult } from "@/game/types";
import type { EchoHudState } from "@/game/scenes/echo";
import { HowTo } from "@/ui/common";

export function EchoGame(props: { onDone: (r: GameResult) => void }) {
  const [state, setState] = useState<EchoHudState | null>(null);

  useEffect(() => {
    const offState = controller.events.on<EchoHudState>("echo:state", setState);
    const offDone = controller.events.on<GameResult>("scene:done", props.onDone);
    controller.enterScene("echo");
    voice.setContext("echo");
    voice.cue("Смотрите… слушайте… и повторяйте…", controller.audio.muted);
    return () => {
      offState();
      offDone();
      controller.exitScene();
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
          цепочка {state?.level ?? 0} · лучшая {state?.best ?? 0}
        </div>
      </div>
    </div>
  );
}
