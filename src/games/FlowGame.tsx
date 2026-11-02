/**
 * FlowGame — HUD wrapper over the 3D ring-flight scene, with a duration
 * selector (1 / 5 / 15 / 20 min or endless) and a hypnotic start cue.
 */

import { useEffect, useRef, useState } from "react";
import { controller } from "@/game/boot";
import { voice } from "@/game/voice";
import type { GameResult } from "@/game/types";
import type { FlowHudState } from "@/game/scenes/flow";
import { DurationChips, HowTo } from "@/ui/common";
import { getDefaultDuration } from "@/game/settings";

/** Minutes → seconds. 0 minutes = endless flight. */
const secondsFor = (minutes: number): number => (minutes <= 0 ? Infinity : minutes * 60);

export function FlowGame(props: { onDone: (r: GameResult) => void }) {
  const [state, setState] = useState<FlowHudState | null>(null);
  const [minutes, setMinutes] = useState(getDefaultDuration);
  const stateRef = useRef<FlowHudState | null>(null);
  stateRef.current = state;

  useEffect(() => {
    const offState = controller.events.on<FlowHudState>("flow:state", setState);
    const offDone = controller.events.on<GameResult>("scene:done", props.onDone);
    controller.enterScene("flow", { durationSec: secondsFor(minutes) });
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
  }, [minutes]);

  const finishEndless = () => {
    const s = stateRef.current;
    const hits = s?.hits ?? 0;
    props.onDone({
      game: "flow",
      score: hits,
      detail: `${hits} колец · лучшая серия ${s?.bestCombo ?? 0}`,
    });
  };

  const endless = minutes === 0;

  return (
    <div className="game-stage overlay-pass">
      <HowTo>
        <p>
          Вы — искра света. Ведите её пальцем или мышью и пролетайте <b>внутри</b> колец.
          Скорость растёт, серия попаданий накапливается. Выберите длительность полёта —
          от одной минуты до бесконечного потока.
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
      <DurationChips
        value={minutes}
        onChange={setMinutes}
        onFinish={endless ? finishEndless : undefined}
      />
    </div>
  );
}
