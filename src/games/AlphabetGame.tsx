/**
 * AlphabetGame — the classic New Code NLP alphabet drill, adapted for screen:
 * a letter appears with a cue Л / П / О (left hand / right hand / both).
 * Answer fast: ArrowLeft / ArrowDown / ArrowRight or the on-screen buttons.
 * Parallel load + cross-lateral response + shrinking time window = the state shift.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { controller } from "@/game/boot";
import { voice } from "@/game/voice";
import { pauseBus, pTimeout, pClear } from "@/game/pause";
import { ALPHABET } from "@/game/config";
import type { GameResult } from "@/game/types";
import { HowTo } from "@/ui/common";

type Cue = "Л" | "П" | "О";
const LETTERS = "АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЭЮЯ".split("");
const CUES: Cue[] = ["Л", "П", "О"];

interface Trial {
  letter: string;
  cue: Cue;
}

function randomTrial(prev?: Trial): Trial {
  let t: Trial;
  do {
    t = {
      letter: LETTERS[(Math.random() * LETTERS.length) | 0],
      cue: CUES[(Math.random() * CUES.length) | 0],
    };
  } while (prev && t.letter === prev.letter && t.cue === prev.cue);
  return t;
}

export function AlphabetGame(props: { onDone: (r: GameResult) => void }) {
  const [trial, setTrial] = useState<Trial>(() => randomTrial());
  const [round, setRound] = useState(1);
  const [streak, setStreak] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [feedback, setFeedback] = useState<"good" | "bad" | null>(null);
  /** Correct cue highlighted after a mistake/timeout — the learning moment. */
  const [reveal, setReveal] = useState<Cue | null>(null);
  const [windowMs, setWindowMs] = useState<number>(ALPHABET.BASE_WINDOW);
  const [timeLeft, setTimeLeft] = useState(1);

  const stateRef = useRef({ round: 1, streak: 0, correct: 0, times: [] as number[], done: false });
  const trialRef = useRef(trial);
  trialRef.current = trial;
  const shownAt = useRef(performance.now());
  const deadline = useRef<number | null>(null);
  const raf = useRef(0);

  // hypnotic prompter: start cue
  useEffect(() => {
    voice.setContext("alphabet");
    voice.cue("Отвечайте быстро… не задумываясь…", controller.audio.muted);
    return () => voice.setContext(null);
  }, []);

  // pause: freeze the countdown bar, shift the clock on resume
  useEffect(() => {
    let pausedAt = 0;
    return pauseBus.on((paused) => {
      if (paused) pausedAt = performance.now();
      else if (pausedAt) shownAt.current += performance.now() - pausedAt;
    });
  }, []);

  const finish = useCallback(() => {
    const s = stateRef.current;
    if (s.done) return;
    s.done = true;
    pClear(deadline.current);
    cancelAnimationFrame(raf.current);
    const avg = s.times.length ? Math.round(s.times.reduce((a, b) => a + b, 0) / s.times.length) : 0;
    controller.audio.sfx("complete");
    props.onDone({
      game: "alphabet",
      score: s.correct,
      detail: `${s.correct}/${ALPHABET.ROUNDS} верно · реакция ${avg} мс`,
      reactionMs: avg > 0 ? avg : undefined,
    });
  }, [props]);

  const nextRound = useCallback(() => {
    const s = stateRef.current;
    if (s.round >= ALPHABET.ROUNDS) {
      finish();
      return;
    }
    s.round++;
    const w = Math.max(ALPHABET.MIN_WINDOW, ALPHABET.BASE_WINDOW - s.streak * 120);
    setWindowMs(w);
    setRound(s.round);
    setTrial((prev) => randomTrial(prev));
    shownAt.current = performance.now();
    scheduleDeadline(w);
  }, [finish]);

  const scheduleDeadline = useCallback(
    (w: number) => {
      pClear(deadline.current);
      deadline.current = pTimeout(() => {
        const s = stateRef.current;
        if (s.done) return;
        s.streak = 0;
        setStreak(0);
        setFeedback("bad");
        setReveal(trialRef.current.cue);
        controller.burst(0, false);
        controller.audio.sfx("bad");
        pTimeout(() => {
          setFeedback(null);
          setReveal(null);
          nextRound();
        }, 600);
      }, w);
    },
    [nextRound],
  );

  // countdown bar
  useEffect(() => {
    shownAt.current = performance.now();
    scheduleDeadline(windowMs);
    const tick = () => {
      if (!pauseBus.paused) {
        const left = Math.max(0, 1 - (performance.now() - shownAt.current) / windowMs);
        setTimeLeft(left);
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf.current);
      pClear(deadline.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round]);

  const answer = useCallback(
    (cue: Cue) => {
      const s = stateRef.current;
      if (s.done || feedback || pauseBus.paused) return;
      const good = cue === trial.cue;
      const ms = Math.round(performance.now() - shownAt.current);
      pClear(deadline.current);
      if (good) {
        s.correct++;
        s.streak++;
        s.times.push(ms);
        setCorrect(s.correct);
        setStreak(s.streak);
        controller.burst(trial.cue === "Л" ? -1 : trial.cue === "П" ? 1 : 0, true);
        controller.audio.sfx("good");
      } else {
        s.streak = 0;
        setStreak(0);
        setReveal(trial.cue);
        controller.burst(0, false);
        controller.audio.sfx("bad");
      }
      setFeedback(good ? "good" : "bad");
      pTimeout(() => {
        setFeedback(null);
        setReveal(null);
        nextRound();
      }, good ? 320 : 600);
    },
    [feedback, nextRound, trial.cue],
  );

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Cue> = {
        ArrowLeft: "Л",
        ArrowDown: "О",
        ArrowRight: "П",
        KeyA: "Л",
        KeyS: "О",
        KeyD: "П",
        KeyF: "Л",
        Space: "О",
        KeyJ: "П",
      };
      const cue = map[e.code];
      if (cue) {
        e.preventDefault();
        answer(cue);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answer]);

  return (
    <div className="game-stage">
      <HowTo>
        <p>
          На экране — буква и знак: <b>Л</b> — ответьте левой рукой, <b>П</b> — правой, <b>О</b> —
          обеими сразу. Клавиши: ← / ↓ / → (или F / Пробел / J). Темп растёт с серией верных
          ответов: сознание не успевает контролировать — включается состояние.
        </p>
      </HowTo>

      <div className="alphabet-progress">
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${((round - 1) / ALPHABET.ROUNDS) * 100}%` }} />
        </div>
        <span>
          {round}/{ALPHABET.ROUNDS} · серия {streak} · верно {correct}
        </span>
      </div>

      <div className={`alphabet-card ${feedback ?? ""}`}>
        <div className="alphabet-letter">{trial.letter}</div>
        <div className={`alphabet-cue cue-${trial.cue}`}>{trial.cue}</div>
        <div className="alphabet-timer">
          <div className="alphabet-timer-fill" style={{ width: `${timeLeft * 100}%` }} />
        </div>
      </div>

      <div className="alphabet-controls">
        <button
          className={`hand-btn left ${reveal === "Л" ? "reveal" : ""}`}
          onPointerDown={() => answer("Л")}
        >
          ◀<span>левая</span>
        </button>
        <button
          className={`hand-btn both ${reveal === "О" ? "reveal" : ""}`}
          onPointerDown={() => answer("О")}
        >
          ◀▶<span>обе</span>
        </button>
        <button
          className={`hand-btn right ${reveal === "П" ? "reveal" : ""}`}
          onPointerDown={() => answer("П")}
        >
          ▶<span>правая</span>
        </button>
      </div>
    </div>
  );
}
