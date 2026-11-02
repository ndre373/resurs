/**
 * Home.tsx — the React shell: title screen, game hub, game screens, guided session.
 * React owns the DOM; the 3D world behind it lives in src/game/ (controller).
 *
 * The visible screen is derived from the URL, so every screen has a deep link
 * and the browser back button works: "/", "/hub", "/session", "/progress",
 * "/settings", "/game/<id>".
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Sparkles, Flame, Settings, Play, BookOpen } from "lucide-react";
import { startGame, stopGame, controller } from "@/game/boot";
import type { GameId, GameResult } from "@/game/types";
import { getStats, getSessions, resetStats, recordResult, getStreak } from "@/game/stats";
import { getSyncCode, pullFromCloud, schedulePush } from "@/game/sync";
import { pauseBus } from "@/game/pause";
import { GAME_META, GAME_ORDER } from "@/games/meta";
import { TopBar, GameCard, ResultModal, PauseOverlay } from "@/ui/common";
import { SessionFlow } from "@/ui/SessionFlow";
import { ProgressView } from "@/ui/ProgressView";
import { SettingsView } from "@/ui/SettingsView";
import { Onboarding, onboardingNeeded } from "@/ui/Onboarding";
import { GuideView } from "@/ui/GuideView";
import { applyPwaUpdate } from "@/pwa";
import { AlphabetGame } from "@/games/AlphabetGame";
import { StroopGame } from "@/games/StroopGame";
import { RhythmGame } from "@/games/RhythmGame";
import { MirrorGame } from "@/games/MirrorGame";
import { BreathGame } from "@/games/BreathGame";
import { EchoGame } from "@/games/EchoGame";
import { FlowGame } from "@/games/FlowGame";
import { CrossGame } from "@/games/CrossGame";

type Screen = "title" | "hub" | "game" | "session" | "progress" | "settings" | "guide";

function isGameId(id: string): id is GameId {
  return id in GAME_META;
}

/** Games with a selectable run length (shown on the ready gate). */
type LenChoice = "short" | "mid" | "long";
const GAME_LENGTHS: Partial<
  Record<GameId, { label: string; options: { id: LenChoice; label: string; value: number }[] }>
> = {
  echo: {
    label: "Длина цепочки",
    options: [
      { id: "short", label: "Короткая · до 8", value: 8 },
      { id: "mid", label: "Средняя · до 12", value: 12 },
      { id: "long", label: "Длинная · до 16", value: 16 },
    ],
  },
  rhythm: {
    label: "Длина ритма",
    options: [
      { id: "short", label: "Короткий · до 6", value: 6 },
      { id: "mid", label: "Средний · до 10", value: 10 },
      { id: "long", label: "Длинный · до 14", value: 14 },
    ],
  },
};

/** Parse the URL into the shell's screen + (optional) active game. */
function parsePath(pathname: string): { screen: Screen; game: GameId | null; badGame: boolean } {
  const m = pathname.match(/^\/game\/([a-z]+)\/?$/);
  if (m) {
    return isGameId(m[1])
      ? { screen: "game", game: m[1], badGame: false }
      : { screen: "hub", game: null, badGame: true };
  }
  switch (pathname.replace(/\/$/, "") || "/") {
    case "/":
      return { screen: "title", game: null, badGame: false };
    case "/hub":
      return { screen: "hub", game: null, badGame: false };
    case "/session":
      return { screen: "session", game: null, badGame: false };
    case "/progress":
      return { screen: "progress", game: null, badGame: false };
    case "/guide":
      return { screen: "guide", game: null, badGame: false };
    case "/settings":
      return { screen: "settings", game: null, badGame: false };
    default:
      return { screen: "title", game: null, badGame: true };
  }
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { screen, game, badGame } = parsePath(pathname);

  const [result, setResult] = useState<GameResult | null>(null);
  const [gameKey, setGameKey] = useState(0);
  // games never start on their own: a "ready" gate with a big start button
  // comes first — the player reads the rules, then launches the round
  const [gameReady, setGameReady] = useState(false);
  // run length picked on the ready gate (games listed in GAME_LENGTHS)
  const [lenChoice, setLenChoice] = useState<LenChoice>("mid");
  const [stats, setStats] = useState(getStats());
  const [sessionsCount, setSessionsCount] = useState(getSessions().length);
  const [streak, setStreak] = useState(getStreak().current);
  const [updateReady, setUpdateReady] = useState(false);
  // first launch ever → three short hints over the title screen
  const [showOnboarding, setShowOnboarding] = useState(onboardingNeeded);

  // unknown URL (including /game/<typo>) → replace with the closest valid one
  useEffect(() => {
    if (badGame) navigate(screen === "hub" ? "/hub" : "/", { replace: true });
  }, [badGame, screen, navigate]);

  // a stale result modal never survives navigation; the ready gate re-arms too
  useEffect(() => {
    setResult(null);
    setGameReady(false);
  }, [pathname]);

  // PWA: a new version is installed and waiting → offer the reload toast
  useEffect(() => {
    const onUpdate = () => setUpdateReady(true);
    window.addEventListener("pwa:update", onUpdate);
    return () => window.removeEventListener("pwa:update", onUpdate);
  }, []);

  // Cloud sync: if a sync code exists, pull & merge the cloud stats once on start
  useEffect(() => {
    if (!getSyncCode()) return;
    void pullFromCloud().then((r) => {
      if (r === "merged") {
        setStats(getStats());
        setSessionsCount(getSessions().length);
        setStreak(getStreak().current);
      }
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    startGame(canvas);
    return () => stopGame();
  }, []);

  // ambient energy follows the screen
  useEffect(() => {
    if (screen === "game" && game && GAME_META[game].isDom) controller.setMode("dom");
    else if (screen !== "game") controller.setMode("menu");
  }, [screen, game]);

  // Escape returns to the hub from a game
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape" && (screen === "game" || screen === "session")) {
        pauseBus.set(false);
        navigate("/hub");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, navigate]);

  const openGame = (id: GameId) => {
    controller.audio.sfx("ui");
    pauseBus.set(false);
    navigate(`/game/${id}`);
  };

  // «Назад» that prefers real history (direct deep-link → fallback route)
  const goBack = (fallback: string) => () => {
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate(fallback);
  };

  const handleDone = useCallback((r: GameResult) => {
    setStats(recordResult(r));
    setSessionsCount(getSessions().length);
    setStreak(getStreak().current);
    setResult(r);
    schedulePush(); // cloud backup when a sync code is connected
  }, []);

  /** Selected run length for games that offer the choice (Echo, Rhythm). */
  const pickedLen = (id: GameId): number | undefined =>
    GAME_LENGTHS[id]?.options.find((o) => o.id === lenChoice)?.value;

  const renderGame = (id: GameId) => {
    const done = handleDone;
    switch (id) {
      case "alphabet":
        return <AlphabetGame onDone={done} />;
      case "stroop":
        return <StroopGame onDone={done} />;
      case "rhythm":
        return <RhythmGame onDone={done} maxSteps={pickedLen(id)} />;
      case "mirror":
        return <MirrorGame onDone={done} />;
      case "breath":
        return <BreathGame onDone={done} />;
      case "echo":
        return <EchoGame onDone={done} maxLen={pickedLen(id)} />;
      case "flow":
        return <FlowGame onDone={done} />;
      case "cross":
        return <CrossGame onDone={done} />;
    }
  };

  return (
    <div id="game-root">
      <canvas id="game-canvas" ref={canvasRef} />
      <div id="ui-overlay">
        {screen === "title" && (
          <div className="title-screen">
            <button
              className="icon-btn title-settings"
              title="Настройки"
              aria-label="Настройки"
              onClick={() => {
                controller.audio.sfx("ui");
                navigate("/settings");
              }}
            >
              <Settings size={20} />
            </button>
            <div className="title-glow" />
            <div className="title-kicker">тренажёр ресурсного состояния</div>
            <h1 className="title-main">РЕСУРС</h1>
            <p className="title-sub">игры Нового кода НЛП</p>
            <p className="title-desc">
              8 игр перезагружают зрение, слух, кинестетику, тактильность и эмоции — и включают
              оба полушария синхронно
            </p>
            <div className="title-actions">
              <button
                className="btn primary big"
                onClick={() => {
                  controller.audio.sfx("ui");
                  navigate("/session");
                }}
              >
                <Sparkles size={18} /> Начать сеанс
              </button>
              <button
                className="btn ghost big"
                onClick={() => {
                  controller.audio.sfx("ui");
                  navigate("/hub");
                }}
              >
                Выбрать игру
              </button>
            </div>
            <button
              className="link-btn title-guide"
              onClick={() => {
                controller.audio.sfx("ui");
                navigate("/guide");
              }}
            >
              <BookOpen size={15} /> Как пользоваться: правила практики
            </button>
            <div className="title-foot">
              наушники усилят эффект · фоновая музыка и звуки синтезируются живьём
            </div>
          </div>
        )}

        {screen === "hub" && (
          <div className="hub">
            <TopBar title="Игры Нового кода" onBack={goBack("/")} />
            <div className="hub-scroll">
              <button className="session-card" onClick={() => navigate("/session")}>
                <Sparkles size={22} />
                <div>
                  <div className="session-card-title">Сеанс «Ресурс»</div>
                  <div className="session-card-sub">
                    намерение → дыхание → игра → интеграция
                    {sessionsCount > 0 ? ` · проведено: ${sessionsCount}` : ""}
                  </div>
                </div>
              </button>
              <button className="session-card progress-entry" onClick={() => navigate("/progress")}>
                <Flame size={22} />
                <div>
                  <div className="session-card-title">Прогресс</div>
                  <div className="session-card-sub">
                    {streak > 0
                      ? `серия ${streak} ${streak === 1 ? "день" : streak < 5 ? "дня" : "дней"} подряд · история и рекорды`
                      : "история, серии дней и рекорды"}
                  </div>
                </div>
              </button>
              <button className="session-card guide-entry" onClick={() => navigate("/guide")}>
                <BookOpen size={22} />
                <div>
                  <div className="session-card-title">Как пользоваться</div>
                  <div className="session-card-sub">
                    правила практики, устройство сеанса, безопасность
                  </div>
                </div>
              </button>
              <div className="hub-grid">
                {GAME_ORDER.map((id) => {
                  const m = GAME_META[id];
                  return (
                    <GameCard
                      key={id}
                      icon={m.icon}
                      title={m.title}
                      subtitle={m.subtitle}
                      channels={m.channels}
                      best={stats[id]?.best}
                      bestLabel={m.bestLabel}
                      accent={m.accent}
                      onClick={() => openGame(id)}
                    />
                  );
                })}
              </div>
              <button className="session-card settings-entry" onClick={() => navigate("/settings")}>
                <Settings size={22} />
                <div>
                  <div className="session-card-title">Настройки</div>
                  <div className="session-card-sub">
                    звук, голос, вибрация, длительность упражнений
                  </div>
                </div>
              </button>
              <div className="hub-foot">
                <span>
                  Статистика — на этом устройстве; перенос — по коду на экране «Прогресс».
                  Приложение — тренажёр состояния, а не медицинский продукт.
                </span>
              </div>
            </div>
          </div>
        )}

        {screen === "game" && game && (
          <div className="game-screen play">
            <TopBar
              title={GAME_META[game].title}
              pausable
              onBack={() => {
                pauseBus.set(false);
                navigate("/hub");
              }}
            />
            <div key={gameKey} className="game-body">
              {gameReady ? (
                renderGame(game)
              ) : (
                <div className="ready-gate">
                  <div className="ready-icon" style={{ color: GAME_META[game].accent }}>
                    {GAME_META[game].icon}
                  </div>
                  <div className="ready-title">{GAME_META[game].title}</div>
                  <div className="ready-sub">{GAME_META[game].subtitle}</div>
                  <div className="ready-channels">
                    {GAME_META[game].channels.map((c) => (
                      <span key={c} className="ready-channel">
                        {c}
                      </span>
                    ))}
                  </div>
                  {GAME_LENGTHS[game] && (
                    <div className="ready-len">
                      <div className="ready-len-label">{GAME_LENGTHS[game].label}</div>
                      <div className="chips">
                        {GAME_LENGTHS[game].options.map((o) => (
                          <button
                            key={o.id}
                            className={`chip ${lenChoice === o.id ? "on" : ""}`}
                            onClick={() => {
                              controller.audio.sfx("ui");
                              setLenChoice(o.id);
                            }}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <button
                    className="btn primary big"
                    autoFocus
                    onClick={() => {
                      controller.audio.sfx("ui");
                      setGameReady(true);
                    }}
                  >
                    <Play size={18} /> Начать игру
                  </button>
                  <div className="ready-hint">правила будут на экране игры — сверху</div>
                </div>
              )}
            </div>
            {gameReady && <PauseOverlay />}
            {result && (
              <ResultModal
                result={result}
                onAgain={() => {
                  setResult(null);
                  setGameReady(false);
                  setGameKey((k) => k + 1);
                }}
                onHub={() => navigate("/hub")}
              />
            )}
          </div>
        )}

        {screen === "session" && (
          <div className="game-screen play">
            <TopBar
              title="Сеанс «Ресурс»"
              pausable
              onBack={() => {
                pauseBus.set(false);
                navigate("/hub");
              }}
            />
            <SessionFlow
              onExit={() => {
                pauseBus.set(false);
                setStats(getStats());
                setSessionsCount(getSessions().length);
                setStreak(getStreak().current);
                navigate("/hub");
              }}
            />
            <PauseOverlay />
          </div>
        )}

        {screen === "progress" && (
          <div className="game-screen">
            <TopBar title="Прогресс" onBack={() => navigate("/hub")} />
            <div className="hub-scroll">
              <ProgressView
                onChanged={() => {
                  setStats(getStats());
                  setSessionsCount(getSessions().length);
                  setStreak(getStreak().current);
                }}
              />
            </div>
          </div>
        )}

        {screen === "guide" && (
          <div className="game-screen">
            <TopBar title="Как пользоваться" simple onBack={goBack("/")} />
            <GuideView />
          </div>
        )}

        {screen === "settings" && (
          <div className="game-screen">
            <TopBar title="Настройки" simple onBack={goBack("/")} />
            <div className="hub-scroll">
              <SettingsView
                onGoProgress={() => navigate("/progress")}
                onStatsReset={() => {
                  resetStats();
                  setStats({});
                  setSessionsCount(0);
                  setStreak(0);
                  schedulePush(); // propagate the reset tombstone to other devices
                }}
              />
            </div>
          </div>
        )}

        {showOnboarding && <Onboarding onDone={() => setShowOnboarding(false)} />}

        {updateReady && (
          <div className="update-toast" role="status">
            <span>Новая версия готова</span>
            <button className="btn primary" onClick={() => applyPwaUpdate()}>
              Обновить
            </button>
            <button className="link-btn" onClick={() => setUpdateReady(false)}>
              позже
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
