/**
 * SessionFlow — the New Code change format as a guided session:
 *  1. intention (context)  2. breathing reset  3. one active game
 *  4. mirror integration   5. return to the context and let the answer surface.
 */

import { useState } from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import type { GameId, GameResult } from "@/game/types";
import { recordResult, recordSession } from "@/game/stats";
import { GAME_META } from "@/games/meta";
import { BreathGame } from "@/games/BreathGame";
import { MirrorGame } from "@/games/MirrorGame";
import { AlphabetGame } from "@/games/AlphabetGame";
import { StroopGame } from "@/games/StroopGame";
import { EchoGame } from "@/games/EchoGame";
import { FlowGame } from "@/games/FlowGame";
import { RhythmGame } from "@/games/RhythmGame";
import { CrossGame } from "@/games/CrossGame";

const INTENTIONS = ["Спокойствие", "Энергия", "Ясность", "Уверенность", "Креативность", "Фокус"];
const ACTIVE_POOL: GameId[] = ["alphabet", "stroop", "echo", "rhythm", "flow", "cross"];

/** Session length presets: breath cycles + mirror seconds. */
const LENGTHS = [
  { id: "short", label: "Короткий · ~5 мин", breathCycles: 5, mirrorSec: 45 },
  { id: "long", label: "Длинный · ~10 мин", breathCycles: 10, mirrorSec: 90 },
] as const;

type Step = "intention" | "breath" | "active" | "mirror" | "done";

export function SessionFlow(props: { onExit: () => void }) {
  const [step, setStep] = useState<Step>("intention");
  const [intention, setIntention] = useState("");
  const [results, setResults] = useState<GameResult[]>([]);
  // null = «случайная игра» — resolved when the session starts
  const [gameChoice, setGameChoice] = useState<GameId | null>(null);
  const [activeGame, setActiveGame] = useState<GameId>("alphabet");
  const [lengthId, setLengthId] = useState<(typeof LENGTHS)[number]["id"]>("short");

  const length = LENGTHS.find((l) => l.id === lengthId) ?? LENGTHS[0];
  const steps: Step[] = ["breath", "active", "mirror", "done"];
  const stepIndex = steps.indexOf(step);

  const start = () => {
    setActiveGame(gameChoice ?? ACTIVE_POOL[(Math.random() * ACTIVE_POOL.length) | 0]);
    setStep("breath");
  };

  const collect = (r: GameResult, next: Step) => {
    recordResult(r);
    setResults((prev) => [...prev, r]);
    setStep(next);
  };

  const finish = () => {
    recordSession({
      at: Date.now(),
      intention: intention || "ресурсное состояние",
      games: results.map((r) => r.game),
      results,
    });
  };

  return (
    <div className="session">
      {step !== "intention" && step !== "done" && (
        <div className="session-progress">
          {steps.slice(0, 3).map((s, i) => (
            <span key={s} className={`session-dot ${i <= stepIndex ? "on" : ""}`} />
          ))}
          <span className="session-intention">«{intention || "ресурсное состояние"}»</span>
        </div>
      )}

      {step === "intention" && (
        <div className="session-intent">
          <Sparkles size={40} className="session-spark" />
          <h2>Шаг 1 · Намерение</h2>
          <p className="session-text">
            Выберите контекст, в который хотите принести ресурсное состояние. Сами игры сделают
            остальное — бессознательное подберёт ответ.
          </p>
          <div className="chips">
            {INTENTIONS.map((i) => (
              <button
                key={i}
                className={`chip ${intention === i ? "on" : ""}`}
                onClick={() => setIntention(i)}
              >
                {i}
              </button>
            ))}
          </div>
          <input
            className="intent-input"
            placeholder="или свой вариант — например, «разговор с руководителем»"
            value={intention}
            onChange={(e) => setIntention(e.target.value)}
            maxLength={60}
          />
          <div className="session-pick">
            <div className="session-pick-label">Игра сеанса</div>
            <div className="chips">
              <button
                className={`chip ${gameChoice === null ? "on" : ""}`}
                onClick={() => setGameChoice(null)}
              >
                Случайная
              </button>
              {ACTIVE_POOL.map((id) => (
                <button
                  key={id}
                  className={`chip ${gameChoice === id ? "on" : ""}`}
                  onClick={() => setGameChoice(id)}
                >
                  {GAME_META[id].title}
                </button>
              ))}
            </div>
          </div>
          <div className="session-pick">
            <div className="session-pick-label">Длительность</div>
            <div className="chips">
              {LENGTHS.map((l) => (
                <button
                  key={l.id}
                  className={`chip ${lengthId === l.id ? "on" : ""}`}
                  onClick={() => setLengthId(l.id)}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          <div className="modal-actions">
            <button className="btn primary big" onClick={start}>
              Начать <ArrowRight size={16} />
            </button>
            <button className="btn ghost" onClick={props.onExit}>
              Отмена
            </button>
          </div>
        </div>
      )}

      {step === "breath" && (
        <div className="session-game">
          <div className="session-step-label">Шаг 2 · Настройка — дыхание</div>
          <BreathGame cycles={length.breathCycles} onDone={(r) => collect(r, "active")} />
        </div>
      )}

      {step === "active" && (
        <div className="session-game">
          <div className="session-step-label">
            Шаг 3 · Игра — {GAME_META[activeGame].title}
          </div>
          {activeGame === "alphabet" && <AlphabetGame onDone={(r) => collect(r, "mirror")} />}
          {activeGame === "stroop" && <StroopGame onDone={(r) => collect(r, "mirror")} />}
          {activeGame === "echo" && <EchoGame onDone={(r) => collect(r, "mirror")} />}
          {activeGame === "rhythm" && <RhythmGame onDone={(r) => collect(r, "mirror")} />}
          {activeGame === "flow" && <FlowGame onDone={(r) => collect(r, "mirror")} />}
          {activeGame === "cross" && <CrossGame onDone={(r) => collect(r, "mirror")} />}
        </div>
      )}

      {step === "mirror" && (
        <div className="session-game">
          <div className="session-step-label">Шаг 4 · Интеграция — зеркало</div>
          <MirrorGame autoFinishSec={length.mirrorSec} onDone={(r) => collect(r, "done")} />
        </div>
      )}

      {step === "done" && <SessionDone intention={intention} results={results} onExit={() => { finish(); props.onExit(); }} />}
    </div>
  );
}

function SessionDone(props: {
  intention: string;
  results: GameResult[];
  onExit: () => void;
}) {
  return (
    <div className="session-intent">
      <Sparkles size={40} className="session-spark" />
      <h2>Сеанс завершён</h2>
      <p className="session-text">
        Вернитесь мысленно к контексту «{props.intention || "ресурсное состояние"}». Не ищите ответ
        усилием — позвольте ему появиться. Обычно он приходит в ближайшие часы.
      </p>
      <div className="session-results">
        {props.results.map((r, i) => (
          <div key={i} className="session-result-row">
            <span>{GAME_META[r.game].title}</span>
            <span className="dim">{r.detail}</span>
          </div>
        ))}
      </div>
      <div className="modal-actions">
        <button className="btn primary big" onClick={props.onExit}>
          Вернуться к играм
        </button>
      </div>
    </div>
  );
}
