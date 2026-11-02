/**
 * ProgressView — practice progress: current day streak, totals, per-game
 * bests and the recent guided sessions. Everything comes from localStorage.
 * Plus the cloud-sync card: backup/merge stats across devices by code.
 */

import { useState } from "react";
import { Flame, CalendarDays, Sparkles, CloudUpload, CloudDownload, Unlink, TrendingDown, TrendingUp } from "lucide-react";
import { dayKey, getActivityDays, getHistory, getSessions, getStats, getStreak } from "@/game/stats";
import type { GameId } from "@/game/types";
import {
  connectCloudSync,
  createCloudSync,
  getSyncCode,
  pullFromCloud,
  pushToCloud,
  setSyncCode,
} from "@/game/sync";
import { GAME_META, GAME_ORDER } from "@/games/meta";

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function formatDate(at: number): string {
  return new Date(at).toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ProgressView(props: { onChanged?: () => void }) {
  const [, setNonce] = useState(0); // force re-read of localStorage after sync
  const refresh = () => {
    setNonce((n) => n + 1);
    props.onChanged?.();
  };

  const stats = getStats();
  const sessions = getSessions();
  const days = getActivityDays();
  const streak = getStreak();
  const totalPlays = GAME_ORDER.reduce((n, id) => n + (stats[id]?.plays ?? 0), 0);
  const recent = sessions.slice(-5).reverse();

  return (
    <div className="progress">
      <div className="progress-cards">
        <div className="progress-card">
          <Flame size={22} className="progress-icon flame" />
          <div className="progress-num">{streak.current}</div>
          <div className="progress-label">
            {plural(streak.current, "день", "дня", "дней")} подряд
          </div>
          {streak.best > streak.current && (
            <div className="progress-sub">рекорд: {streak.best}</div>
          )}
        </div>
        <div className="progress-card">
          <Sparkles size={22} className="progress-icon spark" />
          <div className="progress-num">{sessions.length}</div>
          <div className="progress-label">
            {plural(sessions.length, "сеанс", "сеанса", "сеансов")}
          </div>
          <div className="progress-sub">{totalPlays} {plural(totalPlays, "игра", "игры", "игр")}</div>
        </div>
        <div className="progress-card">
          <CalendarDays size={22} className="progress-icon calm" />
          <div className="progress-num">{days.length}</div>
          <div className="progress-label">
            {plural(days.length, "день", "дня", "дней")} практики
          </div>
        </div>
      </div>

      <ActivityHeatmap />

      <h3 className="progress-h">Рекорды по играм</h3>
      <div className="progress-rows">
        {GAME_ORDER.map((id) => {
          const s = stats[id];
          const m = GAME_META[id];
          return (
            <div key={id} className="progress-row">
              <span className="progress-game">{m.title}</span>
              <span className="dim">
                {s ? `${s.plays} ${plural(s.plays, "раз", "раза", "раз")} · лучший: ${s.best}` : "ещё не играли"}
              </span>
            </div>
          );
        })}
      </div>

      <ReactionChart />

      {recent.length > 0 && (
        <>
          <h3 className="progress-h">Последние сеансы</h3>
          <div className="progress-rows">
            {recent.map((s, i) => (
              <div key={i} className="progress-row">
                <span className="progress-game">«{s.intention}»</span>
                <span className="dim">{formatDate(s.at)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {totalPlays === 0 && sessions.length === 0 && (
        <p className="session-text" style={{ textAlign: "center" }}>
          Здесь появится ваша динамика — сыграйте в любую игру или пройдите сеанс «Ресурс».
        </p>
      )}

      <SyncCard onChanged={refresh} />
    </div>
  );
}

/** Cloud sync by code: backup stats and merge them across devices. */
function SyncCard(props: { onChanged: () => void }) {
  const [code, setCode] = useState<string | null>(getSyncCode());
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setNote("");
    try {
      setNote(await fn());
    } finally {
      setBusy(false);
    }
  };

  const create = () =>
    run(async () => {
      const c = await createCloudSync();
      if (!c) return "Не удалось связаться с облаком — попробуйте позже.";
      setCode(c);
      return "Код создан — статистика сохранена в облаке.";
    });

  const connect = () =>
    run(async () => {
      const c = input.trim().toUpperCase();
      if (c.length < 4) return "Введите код с другого устройства.";
      const r = await connectCloudSync(c);
      if (r === "error") return "Не удалось связаться с облаком — попробуйте позже.";
      if (r === "empty") {
        setSyncCode(null);
        return "Такой код не найден. Проверьте буквы.";
      }
      setCode(c);
      props.onChanged();
      return "Готово — статистика объединена с этим устройством.";
    });

  const push = () =>
    run(async () =>
      (await pushToCloud()) ? "Статистика отправлена в облако." : "Нет связи с облаком.",
    );

  const pull = () =>
    run(async () => {
      const r = await pullFromCloud();
      if (r === "merged") props.onChanged();
      return r === "merged"
        ? "Данные из облака объединены."
        : r === "empty"
          ? "В облаке под этим кодом пока пусто."
          : "Нет связи с облаком.";
    });

  return (
    <div className="sync-card">
      <h3 className="progress-h">Облачная синхронизация</h3>
      {code ? (
        <>
          <p className="session-text">
            Ваш код: <b className="sync-code">{code}</b> — введите его на другом устройстве, чтобы
            перенести прогресс.
          </p>
          <div className="chips">
            <button className="chip" disabled={busy} onClick={push}>
              <CloudUpload size={14} /> Отправить
            </button>
            <button className="chip" disabled={busy} onClick={pull}>
              <CloudDownload size={14} /> Забрать
            </button>
            <button
              className="chip"
              disabled={busy}
              onClick={() => {
                setSyncCode(null);
                setCode(null);
                setNote("Синхронизация отключена — данные остались на устройстве.");
              }}
            >
              <Unlink size={14} /> Отключить
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="session-text">
            Статистика хранится только в этом браузере. Создайте код — и прогресс будет
            подхватываться на других устройствах.
          </p>
          <div className="chips">
            <button className="chip on" disabled={busy} onClick={create}>
              <CloudUpload size={14} /> Создать код
            </button>
          </div>
          <div className="sync-connect">
            <input
              className="intent-input"
              placeholder="или введите код с другого устройства"
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              maxLength={12}
            />
            <button className="chip" disabled={busy} onClick={connect}>
              Подключить
            </button>
          </div>
        </>
      )}
      {note && <p className="sync-note">{note}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- heatmap

const HEAT_WEEKS = 15;

/** GitHub-style practice calendar: one cell per day, weeks run Mon → Sun. */
function ActivityHeatmap() {
  const active = new Set(getActivityDays());
  const todayKey = dayKey();
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // Monday of this week
  const start = new Date(monday);
  start.setDate(monday.getDate() - (HEAT_WEEKS - 1) * 7);

  const cells: Array<{ key: string; on: boolean; today: boolean; future: boolean }> = [];
  for (let i = 0; i < HEAT_WEEKS * 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = dayKey(d);
    cells.push({ key, on: active.has(key), today: key === todayKey, future: d > now });
  }

  return (
    <>
      <h3 className="progress-h">Активность · {HEAT_WEEKS} недель</h3>
      <div className="heatmap" role="img" aria-label="Календарь практики за последние недели">
        {cells.map((c) => (
          <div
            key={c.key}
            className={[
              "heat-cell",
              c.on ? "on" : "",
              c.today ? "today" : "",
              c.future ? "future" : "",
            ].join(" ")}
            title={`${c.key}${c.on ? " — практика" : ""}`}
          />
        ))}
      </div>
      <div className="heat-legend">
        <span className="dim">давно</span>
        <span className="dim">сегодня</span>
      </div>
    </>
  );
}

// ---------------------------------------------------------- reaction chart

/** Average reaction time over the last plays of the speed games (SVG line). */
function ReactionChart() {
  const history = getHistory().filter((h) => h.reactionMs && h.reactionMs > 0);
  const games = [...new Set(history.map((h) => h.game))];
  const [picked, setPicked] = useState<GameId | null>(null);
  if (games.length === 0) return null; // no speed games played yet
  const game: GameId = picked && games.includes(picked) ? picked : games[0];

  const series = history.filter((h) => h.game === game).slice(-30);
  const vals = series.map((h) => h.reactionMs!);
  const accent = GAME_META[game].accent;

  const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  const last = vals[vals.length - 1];
  // trend: mean of the last 5 plays vs the 5 before that — down is good
  let trend: { delta: number; faster: boolean } | null = null;
  if (vals.length >= 10) {
    const tail = vals.slice(-5);
    const prev = vals.slice(-10, -5);
    const m = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    const delta = Math.round(m(tail) - m(prev));
    if (delta !== 0) trend = { delta: Math.abs(delta), faster: delta < 0 };
  }

  const W = 600;
  const H = 150;
  const P = 16;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = Math.max(1, max - min);
  const px = (i: number) => P + (i * (W - 2 * P)) / Math.max(1, vals.length - 1);
  const py = (v: number) => H - P - ((v - min) / span) * (H - 2 * P);

  return (
    <>
      <h3 className="progress-h">Скорость реакции</h3>
      <div className="chips reaction-chips">
        {games.map((g) => (
          <button
            key={g}
            className={`chip ${g === game ? "on" : ""}`}
            onClick={() => setPicked(g)}
          >
            {GAME_META[g].title}
          </button>
        ))}
      </div>
      {vals.length < 2 ? (
        <p className="dim reaction-empty">Сыграйте ещё раз — и здесь появится график.</p>
      ) : (
        <div className="reaction-chart">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="reaction-svg"
            role="img"
            aria-label={`График времени реакции: ${GAME_META[game].title}`}
          >
            <text x={P} y={P - 4} className="reaction-axis">
              {max} мс
            </text>
            <text x={P} y={H - 2} className="reaction-axis">
              {min} мс
            </text>
            <line
              x1={P}
              y1={py(avg)}
              x2={W - P}
              y2={py(avg)}
              className="reaction-avg-line"
            />
            <polyline
              points={vals.map((v, i) => `${px(i)},${py(v)}`).join(" ")}
              fill="none"
              stroke={accent}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {vals.map((v, i) => (
              <circle
                key={i}
                cx={px(i)}
                cy={py(v)}
                r={i === vals.length - 1 ? 5 : 2.5}
                fill={accent}
                opacity={i === vals.length - 1 ? 1 : 0.55}
              />
            ))}
          </svg>
          <div className="reaction-meta">
            <span>
              последняя <b>{last} мс</b>
            </span>
            <span>
              средняя <b>{avg} мс</b>
            </span>
            {trend && (
              <span className={trend.faster ? "trend-good" : "trend-bad"}>
                {trend.faster ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
                {trend.faster
                  ? `быстрее на ${trend.delta} мс`
                  : `медленнее на ${trend.delta} мс`}
              </span>
            )}
          </div>
        </div>
      )}
    </>
  );
}
