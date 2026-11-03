/**
 * CrossGame — cross-lateral diagonal taps: two opposite corners light up,
 * and you touch BOTH at the same time — left hand on one side of the screen,
 * right hand on the other. Every rep crosses the body's midline and makes
 * both hemispheres fire together. Tactile + visual channels, corpus-callosum
 * workout; the answer window shrinks as you go.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { controller } from "@/game/boot";
import { voice } from "@/game/voice";
import { CROSS } from "@/game/config";
import type { GameResult } from "@/game/types";
import { HowTo } from "@/ui/common";
import { pauseBus, pTimeout, pClear } from "@/game/pause";

type PadId = "tl" | "tr" | "bl" | "br";
type Diag = "main" | "anti"; // main = ↘ (tl+br), anti = ↙ (tr+bl)
type Phase = "ready" | "input" | "gap";

const DIAG_PADS: Record<Diag, [PadId, PadId]> = {
  main: ["tl", "br"],
  anti: ["tr", "bl"],
};
const DIAG_ARROW: Record<Diag, string> = { main: "↘", anti: "↙" };
/** Screen-reader names; the keyboard mapping mirrors the screen corners. */
const PAD_LABEL: Record<PadId, string> = {
  tl: "верхний левый угол",
  tr: "верхний правый угол",
  bl: "нижний левый угол",
  br: "нижний правый угол",
};
const PAD_KEY: Record<string, PadId> = { KeyQ: "tl", KeyE: "tr", KeyZ: "bl", KeyC: "br" };

const otherDiag = (d: Diag): Diag => (d === "main" ? "anti" : "main");

export function CrossGame(props: { onDone: (r: GameResult) => void; rounds?: number }) {
  /** Run length picked on the ready gate (default from config). */
  const totalRounds = props.rounds ?? CROSS.ROUNDS;
  const [phase, setPhase] = useState<Phase>("ready");
  const [cue, setCue] = useState<Diag>("main");
  const [hits, setHits] = useState<PadId[]>([]);
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [strikes, setStrikes] = useState(0);

  const ref = useRef({
    phase: "ready" as Phase,
    cue: "main" as Diag,
    hits: new Map<PadId, number>(),
    round: 0,
    score: 0,
    strikes: 0,
    done: false,
    window: CROSS.START_WINDOW as number,
  });
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    timers.current.forEach(pClear);
    timers.current = [];
  };
  useEffect(() => () => clearTimers(), []);

  // hypnotic prompter
  useEffect(() => {
    voice.setContext("cross");
    voice.cue("Касайтесь углов двумя руками… одновременно…", controller.audio.muted);
    return () => {
      voice.setContext(null);
      voice.stop();
    };
  }, []);

  const finish = useCallback(() => {
    const s = ref.current;
    if (s.done) return;
    s.done = true;
    clearTimers();
    controller.audio.sfx("complete");
    props.onDone({
      game: "cross",
      score: s.score,
      detail: `${s.score} из ${totalRounds} диагоналей · ошибок ${s.strikes}`,
    });
  }, [props]);

  const nextCue = useCallback(
    (roundNo: number) => {
      const s = ref.current;
      if (s.done) return;
      if (roundNo >= totalRounds) {
        finish();
        return;
      }
      // alternate diagonals with some randomness, never thrice the same
      const next: Diag = Math.random() < 0.6 ? otherDiag(s.cue) : s.cue;
      s.cue = next;
      s.round = roundNo;
      s.hits.clear();
      s.window = Math.max(
        CROSS.MIN_WINDOW,
        CROSS.START_WINDOW - roundNo * ((CROSS.START_WINDOW - CROSS.MIN_WINDOW) / totalRounds),
      );
      s.phase = "input";
      setCue(next);
      setHits([]);
      setRound(roundNo);
      setPhase("input");
      // too slow → strike
      timers.current.push(
        pTimeout(() => {
          if (s.phase !== "input" || s.done || pauseBus.paused) return;
          s.strikes++;
          setStrikes(s.strikes);
          controller.audio.sfx("bad");
          controller.burst(0, false);
          if (s.strikes >= 3) {
            finish();
            return;
          }
          s.phase = "gap";
          setPhase("gap");
          timers.current.push(pTimeout(() => nextCue(roundNo + 1), 900));
        }, s.window),
      );
    },
    [finish],
  );

  const start = useCallback(() => {
    ref.current.round = 0;
    ref.current.score = 0;
    ref.current.strikes = 0;
    setScore(0);
    setStrikes(0);
    nextCue(0);
  }, [nextCue]);

  const tap = useCallback(
    (pad: PadId) => {
      const s = ref.current;
      if (s.phase !== "input" || s.done || pauseBus.paused) return;
      const targets = DIAG_PADS[s.cue];
      if (targets.includes(pad)) {
        if (s.hits.has(pad)) return;
        const now = performance.now();
        s.hits.set(pad, now);
        setHits([...s.hits.keys()]);
        controller.audio.sfx(pad === "tl" || pad === "bl" ? "tomL" : "tomR");
        if (s.hits.size === 2) {
          const [t1, t2] = [...s.hits.values()];
          if (Math.abs(t1 - t2) <= CROSS.SYNC_MS) {
            // both corners within the simultaneity window — a clean cross
            s.score++;
            setScore(s.score);
            controller.audio.sfx("good");
            controller.burst(-1, true, 6);
            controller.burst(1, true, 6);
            s.phase = "gap";
            setPhase("gap");
            timers.current.push(pTimeout(() => nextCue(s.round + 1), 650));
          } else {
            // two correct corners but too far apart: let the player retry the
            // pair instead of locking the round until the strike timeout
            timers.current.push(
              pTimeout(() => {
                if (s.phase !== "input" || s.done || pauseBus.paused) return;
                s.hits.clear();
                setHits([]);
                controller.audio.sfx("tick");
              }, CROSS.SYNC_MS),
            );
          }
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
        s.phase = "gap";
        setPhase("gap");
        timers.current.push(pTimeout(() => nextCue(s.round + 1), 900));
      }
    },
    [finish, nextCue],
  );

  // keyboard: the Q/E/Z/C keys mirror the four screen corners — press the two
  // diagonal keys together, same simultaneity window as the pointer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const pad = PAD_KEY[e.code];
      if (pad) {
        e.preventDefault();
        tap(pad);
      }
      if (e.code === "Space" && ref.current.phase === "ready") {
        e.preventDefault();
        start();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tap, start]);

  const targets: PadId[] = phase === "input" ? DIAG_PADS[cue] : [];
  const statusText =
    phase === "ready"
      ? "Нажмите «Начать»"
      : phase === "input"
        ? `Коснитесь двух углов одновременно ${DIAG_ARROW[cue]}`
        : "…";

  return (
    <div className="game-stage">
      <HowTo>
        <p>
          Загораются два противоположных угла — коснитесь их <b>одновременно двумя руками</b>:
          левой на своей стороне, правой на своей. Диагональ каждый раз пересекает середину тела —
          это и есть кросс-латеральная работа, синхронизирующая полушария. Темп растёт, три ошибки
          завершают игру. На компьютере: два быстрых клика почти одновременно или клавиши по углам
          — <b>Q</b> <b>E</b> сверху, <b>Z</b> <b>C</b> снизу.
        </p>
      </HowTo>

      <div className="cross-status">
        <div className="cross-cue">{statusText}</div>
        <div className="cross-meta">
          пара {Math.min(round + 1, totalRounds)} из {totalRounds} · верно {score} · ошибки{" "}
          {strikes}/3
        </div>
      </div>

      {phase === "ready" ? (
        <button className="btn primary big" onClick={start}>
          Начать
        </button>
      ) : (
        <div className="cross-grid" role="group" aria-label="Диагональные панели">
          {(["tl", "tr", "bl", "br"] as PadId[]).map((pad) => (
            <button
              key={pad}
              type="button"
              aria-label={PAD_LABEL[pad]}
              className={[
                "cross-pad",
                targets.includes(pad) ? "target" : "",
                hits.includes(pad) ? "done-pad" : "",
              ].join(" ")}
              onPointerDown={() => tap(pad)}
            >
              {targets.includes(pad) && !hits.includes(pad) ? DIAG_ARROW[cue] : ""}
              {hits.includes(pad) ? "✓" : ""}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
