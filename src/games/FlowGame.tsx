/**
 * FlowGame — HUD wrapper over the 3D ring-flight scene. Run length comes from
 * the ready gate (finite seconds / Infinity); difficulty scales the flight
 * speed. Without gate props (session mode) it falls back to the saved default
 * duration, as before.
 */

import { useEffect, useRef, useState } from "react";
import { controller } from "@/game/boot";
import { voice } from "@/game/voice";
import { FLOW_DIFF } from "@/game/config";
import type { Difficulty, GameResult } from "@/game/types";
import type { FlowHudState } from "@/game/scenes/flow";
import { HowTo } from "@/ui/common";
import { getDefaultDuration } from "@/game/settings";

/** Minutes → seconds. 0 minutes = endless flight. */
const secondsFor = (minutes: number): number => (minutes <= 0 ? Infinity : minutes * 60);

export function FlowGame(props: {
  onDone: (r: GameResult) => void;
  /** Ready-gate time choice: finite seconds = timed run, Infinity = endless. */
  durationSec?: number;
  difficulty?: Difficulty;
}) {
  const [state, setState] = useState<FlowHudState | null>(null);
  const stateRef = useRef<FlowHudState | null>(null);
  stateRef.current = state;

  const durationSec = props.durationSec ?? secondsFor(getDefaultDuration());
  const endless = durationSec === Infinity;

  useEffect(() => {
    const offState = controller.events.on<FlowHudState>("flow:state", setState);
    const offDone = controller.events.on<GameResult>("scene:done", props.onDone);
    controller.enterScene("flow", {
      durationSec,
      speedScale: FLOW_DIFF[props.difficulty ?? "mid"],
    });
    voice.setContext("flow");
    voice.cue("Ведите искру… сквозь кольца… не спеша…", controller.audio.muted);
    return () => {
      offState();
      offDone();
      controller.exitScene();
      voice.stop();
      voice.setContext(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationSec]);

  const finishEndless = () => {
    const s = stateRef.current;
    const hits = s?.hits ?? 0;
    props.onDone({
      game: "flow",
      score: hits,
      detail: `${hits} колец · лучшая серия ${s?.bestCombo ?? 0}`,
    });
  };

  return (
    <div className="game-stage overlay-pass">
      <HowTo>
        <p>
          Вы — искра света. Ведите её пальцем или мышью и пролетайте <b>внутри</b> колец.
          Скорость растёт, серия попаданий накапливается. Длительность и скорость выбираются
          на заставке перед стартом.
        </p>
      </HowTo>
      <div className="flow-hud">
        <div className="flow-stat">
          <span className="flow-value">{state?.hits ?? 0}</span>
          <span className="flow-label">кольца</span>
        </div>
        <div className="flow-stat">
          <span className="flow-value accent">{state?.combo ?? 0}×</span>
          <span className="flow-label">серия</span>
        </div>
        <div className="flow-stat">
          <span className="flow-value">{state?.timeLeft ?? 0}</span>
          <span className="flow-label">{endless ? "секунд в потоке" : "секунд"}</span>
        </div>
      </div>
      {endless && (
        <button className="btn ghost" onClick={finishEndless}>
          Завершить полёт
        </button>
      )}
    </div>
  );
}
