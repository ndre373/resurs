/**
 * StroopGame — colour/word dissonance («Радуга» в терминах Нового кода):
 * the word names a colour, the ink shows another. Name the INK.
 * Signal/noise mixing overloads the habitual channel and refreshes perception.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { controller } from "@/game/boot";
import { voice } from "@/game/voice";
import { pauseBus, pTimeout, pClear } from "@/game/pause";
import { STROOP, STROOP_DIFF } from "@/game/config";
import type { Difficulty, GameResult } from "@/game/types";
import { HowTo, useGameTimer } from "@/ui/common";

interface Ink {
  name: string;
  css: string;
}
const COLORS6: Ink[] = [
  { name: "КРАСНЫЙ", css: "#f87171" },
  { name: "СИНИЙ", css: "#60a5fa" },
  { name: "ЗЕЛЁНЫЙ", css: "#4ade80" },
  { name: "ЖЁЛТЫЙ", css: "#facc15" },
  { name: "ФИОЛЕТОВЫЙ", css: "#c084fc" },
  { name: "ОРАНЖЕВЫЙ", css: "#fb923c" },
];

interface Trial {
  word: Ink;
  ink: Ink;
}

function randomTrial(): Trial {
  const word = COLORS6[(Math.random() * COLORS6.length) | 0];
  let ink = COLORS6[(Math.random() * COLORS6.length) | 0];
  // 80% incongruent — the dissonance is the point; 20% congruent keeps you honest
  if (Math.random() < 0.8) {
    while (ink.name === word.name) ink = COLORS6[(Math.random() * COLORS6.length) | 0];
  }
  return { word, ink };
}

export function StroopGame(props: {
  onDone: (r: GameResult) => void;
  rounds?: number;
  /** Ready-gate time choice: finite seconds = timed run, Infinity = endless. */
  durationSec?: number;
  difficulty?: Difficulty;
}) {
  /** Run length in rounds — legacy/session mode (no durationSec given). */
  const totalRounds = props.rounds ?? STROOP.ROUNDS;
  const timed = props.durationSec !== undefined;
  /** ms per word at the chosen difficulty. */
  const timeLimit = STROOP_DIFF[props.difficulty ?? "mid"];
  const [trial, setTrial] = useState<Trial>(() => randomTrial());
  const [round, setRound] = useState(1);
  const [correct, setCorrect] = useState(0);
  const [feedback, setFeedback] = useState<"good" | "bad" | null>(null);
  /** Correct ink name highlighted after a mistake/timeout — the learning moment. */
  const [reveal, setReveal] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(1);

  const stateRef = useRef({ round: 1, correct: 0, times: [] as number[], done: false });
  const trialRef = useRef(trial);
  trialRef.current = trial;
  const shownAt = useRef(performance.now());
  const deadline = useRef<number | null>(null);
  const raf = useRef(0);

  // hypnotic prompter: start cue
  useEffect(() => {
    voice.setContext("stroop");
    voice.cue("Называйте цвет букв… не читайте слово…", controller.audio.muted);
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
      game: "stroop",
      score: s.correct,
      detail: timed
        ? `${s.correct} верно · реакция ${avg} мс`
        : `${s.correct}/${totalRounds} верно · реакция ${avg} мс`,
      reactionMs: avg > 0 ? avg : undefined,
    });
  }, [props, timed, totalRounds]);

  const finishRef = useRef(finish);
  finishRef.current = finish;
  const timer = useGameTimer(props.durationSec, () => finishRef.current());

  const nextRound = useCallback(() => {
    const s = stateRef.current;
    if (!timed && s.round >= totalRounds) {
      finish();
      return;
    }
    s.round++;
    setRound(s.round);
    setTrial(randomTrial());
  }, [finish]);

  const scheduleDeadline = useCallback(() => {
    pClear(deadline.current);
    deadline.current = pTimeout(() => {
      setFeedback("bad");
      setReveal(trialRef.current.ink.name);
      controller.burst(0, false);
      controller.audio.sfx("bad");
      pTimeout(() => {
        setFeedback(null);
        setReveal(null);
        nextRound();
      }, 600);
    }, timeLimit);
  }, [nextRound, timeLimit]);

  useEffect(() => {
    shownAt.current = performance.now();
    scheduleDeadline();
    const tick = () => {
      if (!pauseBus.paused) {
        setTimeLeft(Math.max(0, 1 - (performance.now() - shownAt.current) / timeLimit));
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

  const answer = (ink: Ink) => {
    const s = stateRef.current;
    if (s.done || feedback || pauseBus.paused) return;
    const good = ink.name === trial.ink.name;
    const ms = Math.round(performance.now() - shownAt.current);
    pClear(deadline.current);
    if (good) {
      s.correct++;
      s.times.push(ms);
      setCorrect(s.correct);
      controller.burst(0, true);
      controller.audio.sfx("good");
    } else {
      setReveal(trial.ink.name);
      controller.burst(0, false);
      controller.audio.sfx("bad");
    }
    setFeedback(good ? "good" : "bad");
    pTimeout(() => {
      setFeedback(null);
      setReveal(null);
      nextRound();
    }, good ? 320 : 600);
  };

  return (
    <div className="game-stage">
      <HowTo>
        <p>
          Слово называет один цвет, а написано другим. Ваша задача — назвать <b>цвет букв</b>, а не
          читать слово. Пример: слово «СИНИЙ», написанное красным — ответ «красный».
        </p>
      </HowTo>

      <div className="alphabet-progress">
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{
              width: timed
                ? `${Number.isFinite(props.durationSec) ? Math.max(0, 100 - (timer.elapsed / (props.durationSec as number)) * 100) : 100}%`
                : `${((round - 1) / totalRounds) * 100}%`,
            }}
          />
        </div>
        <span>
          {timer.active
            ? `⏱ ${timer.text} · верно ${correct}`
            : `${round}/${totalRounds} · верно ${correct}`}
        </span>
      </div>

      <div className={`stroop-card ${feedback ?? ""}`}>
        <div className="stroop-word" style={{ color: trial.ink.css }}>
          {trial.word.name}
        </div>
        <div className="stroop-timer">
          <div className="alphabet-timer-fill" style={{ width: `${timeLeft * 100}%` }} />
        </div>
      </div>

      <div className="stroop-grid">
        {COLORS6.map((c) => (
          <button
            key={c.name}
            className={`stroop-btn ${reveal === c.name ? "reveal" : ""}`}
            style={{ ["--swatch" as string]: c.css }}
            onPointerDown={() => answer(c)}
          >
            <span className="swatch" />
            {c.name.toLowerCase()}
          </button>
        ))}
      </div>
      {timer.endless && (
        <button className="btn ghost" onClick={() => finishRef.current()}>
          Завершить
        </button>
      )}
    </div>
  );
}
