/**
 * RhythmGame — two-hand tactile rhythm («барабаны полушарий»): the app taps out
 * a left/right pattern on two toms, you repeat it with your two hands.
 * Tactile + auditory channel, cross-hemisphere alternation, growing load.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { controller } from "@/game/boot";
import { voice } from "@/game/voice";
import { RHYTHM } from "@/game/config";
import type { GameResult } from "@/game/types";
import { HowTo } from "@/ui/common";
import { pauseBus, pTimeout, pClear } from "@/game/pause";

type Hand = "L" | "R";
type Phase = "ready" | "show" | "input" | "success" | "fail";

const BEAT = 60000 / RHYTHM.BPM;

function makePattern(len: number): Hand[] {
  const p: Hand[] = [];
  for (let i = 0; i < len; i++) p.push(Math.random() < 0.5 ? "L" : "R");
  return p;
}

export function RhythmGame(props: { onDone: (r: GameResult) => void; maxSteps?: number }) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [pattern, setPattern] = useState<Hand[]>(() => makePattern(RHYTHM.START_STEPS));
  const [activeStep, setActiveStep] = useState(-1);
  const [inputCount, setInputCount] = useState(0);
  const [best, setBest] = useState(0);
  const [strikes, setStrikes] = useState(0);

  const ref = useRef({
    phase: "ready" as Phase,
    pattern,
    inputPos: 0,
    best: 0,
    strikes: 0,
    done: false,
  });
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    timers.current.forEach(pClear);
    timers.current = [];
  };
  useEffect(() => () => clearTimers(), []);

  // hypnotic prompter: start cue; music way down — the drum pattern must lead
  useEffect(() => {
    controller.audio.setGameFocus(true);
    voice.setContext("rhythm");
    voice.cue("Слушайте ритм… и повторяйте двумя руками…", controller.audio.muted);
    return () => {
      controller.audio.setGameFocus(false);
      voice.setContext(null);
    };
  }, []);

  const finish = useCallback(() => {
    const s = ref.current;
    if (s.done) return;
    s.done = true;
    clearTimers();
    controller.audio.sfx("complete");
    props.onDone({
      game: "rhythm",
      score: s.best,
      detail: `ритм длиной ${s.best} · ошибок ${s.strikes}`,
    });
  }, [props]);

  const playPattern = useCallback((p: Hand[]) => {
    clearTimers();
    setPhase("show");
    ref.current.phase = "show";
    setActiveStep(-1);
    setInputCount(0);
    ref.current.inputPos = 0;
    p.forEach((hand, i) => {
      timers.current.push(
        pTimeout(() => {
          setActiveStep(i);
          controller.audio.sfx(hand === "L" ? "tomL" : "tomR");
          controller.burst(hand === "L" ? -1 : 1, true, 8);
        }, 500 + i * BEAT),
      );
    });
    timers.current.push(
      pTimeout(() => {
        setActiveStep(-1);
        setPhase("input");
        ref.current.phase = "input";
      }, 500 + p.length * BEAT + 200),
    );
  }, []);

  const nextLevel = useCallback(
    (len: number) => {
      const p = makePattern(len);
      ref.current.pattern = p;
      setPattern(p);
      playPattern(p);
    },
    [playPattern],
  );

  const tap = useCallback(
    (hand: Hand) => {
      const s = ref.current;
      if (s.phase !== "input" || s.done || pauseBus.paused) return;
      controller.audio.sfx(hand === "L" ? "tomL" : "tomR");
      const expected = s.pattern[s.inputPos];
      if (hand === expected) {
        s.inputPos++;
        setInputCount(s.inputPos);
        controller.burst(hand === "L" ? -1 : 1, true, 6);
        if (s.inputPos >= s.pattern.length) {
          s.best = Math.max(s.best, s.pattern.length);
          setBest(s.best);
          if (s.pattern.length >= (props.maxSteps ?? RHYTHM.MAX_STEPS)) {
            finish();
            return;
          }
          setPhase("success");
          s.phase = "success";
          controller.audio.sfx("good");
          timers.current.push(pTimeout(() => nextLevel(s.pattern.length + 1), 1100));
        }
      } else {
        s.strikes++;
        setStrikes(s.strikes);
        controller.audio.sfx("bad");
        controller.burst(0, false);
        if (s.strikes >= 3) {
          finish();
          return;
        }
        setPhase("fail");
        s.phase = "fail";
        timers.current.push(pTimeout(() => nextLevel(s.pattern.length), 1200));
      }
    },
    [finish, nextLevel],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "ArrowLeft" || e.code === "KeyF" || e.code === "KeyA") tap("L");
      if (e.code === "ArrowRight" || e.code === "KeyJ" || e.code === "KeyD") tap("R");
      if (e.code === "Space" && ref.current.phase === "ready") {
        e.preventDefault();
        nextLevel(RHYTHM.START_STEPS);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tap, nextLevel]);

  const phaseLabel: Record<Phase, string> = {
    ready: "Нажмите «Слушать ритм»",
    show: "Слушайте и смотрите…",
    input: "Ваш ход — повторите!",
    success: "Точно! Ритм растёт…",
    fail: "Сбой — тот же ритм ещё раз",
  };

  return (
    <div className="game-stage">
      <HowTo>
        <p>
          Приложение отстукивает ритм на двух барабанах: <b>левый</b> — низкий, <b>правый</b> —
          высокий. Повторите его двумя руками: тап по левой и правой панели или клавиши ← / →
          (F / J). С каждым успехом ритм становится на шаг длиннее.
        </p>
      </HowTo>

      <div className="rhythm-status">
        <div className="rhythm-phase">{phaseLabel[phase]}</div>
        <div className="rhythm-meta">
          длина {pattern.length} · лучший {best} · ошибки {strikes}/3
        </div>
      </div>

      <div className="rhythm-dots">
        {pattern.map((hand, i) => (
          <div
            key={i}
            className={[
              "rhythm-dot",
              hand === "L" ? "dot-l" : "dot-r",
              i === activeStep ? "active" : "",
              phase === "input" && i < inputCount ? "filled" : "",
            ].join(" ")}
          />
        ))}
      </div>

      {phase === "ready" ? (
        <button className="btn primary big" onClick={() => nextLevel(RHYTHM.START_STEPS)}>
          Слушать ритм
        </button>
      ) : (
        <div className="rhythm-pads">
          <button
            className={`rhythm-pad pad-l ${phase === "input" ? "armed" : ""}`}
            onPointerDown={() => tap("L")}
          >
            ЛЕВАЯ
          </button>
          <button
            className={`rhythm-pad pad-r ${phase === "input" ? "armed" : ""}`}
            onPointerDown={() => tap("R")}
          >
            ПРАВАЯ
          </button>
        </div>
      )}
    </div>
  );
}
