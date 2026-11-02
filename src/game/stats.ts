/**
 * stats.ts — practice statistics in localStorage (browser-local only:
 * does not sync across devices, clearing browser data resets it).
 * Also keeps a per-day activity log for the streak on the progress screen.
 */

import type { GameId, GameResult, HistoryEntry, SessionRecord, StatsMap } from "./types";
import { storage } from "./storage";

const ACTIVITY_KEY = "activity"; // string[] of local day keys "YYYY-MM-DD"
const HISTORY_KEY = "history"; // HistoryEntry[] — per-play log for the charts
const HISTORY_MAX = 300;
const UPDATED_KEY = "statsUpdatedAt"; // last local change, for cloud sync
const RESET_KEY = "statsResetAt"; // tombstone: resets propagate to other devices

function touch(): void {
  storage.set(UPDATED_KEY, Date.now());
}
export function getStatsUpdatedAt(): number {
  return storage.get<number>(UPDATED_KEY, 0);
}

/** Local calendar day key (YYYY-MM-DD, the device's own timezone). */
export function dayKey(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function markActivity(): void {
  const days = storage.get<string[]>(ACTIVITY_KEY, []);
  const today = dayKey();
  if (days[days.length - 1] !== today) {
    days.push(today);
    storage.set(ACTIVITY_KEY, days.slice(-400));
  }
}

/** Sorted list of days (YYYY-MM-DD) with at least one finished game/session. */
export function getActivityDays(): string[] {
  return storage.get<string[]>(ACTIVITY_KEY, []);
}

/**
 * Current streak: consecutive practice days ending today — or ending
 * yesterday, if today has no practice yet (the streak is still alive).
 */
export function getStreak(): { current: number; best: number } {
  // sorted copy: the "best run" walk below relies on ascending order
  const days = [...getActivityDays()].sort();
  if (days.length === 0) return { current: 0, best: 0 };
  const set = new Set(days);

  const shift = (key: string, by: number): string => {
    const d = new Date(`${key}T12:00:00`);
    d.setDate(d.getDate() + by);
    return dayKey(d);
  };

  // longest run
  let best = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && shift(days[i - 1], 1) === days[i] ? run + 1 : 1;
    best = Math.max(best, run);
  }

  // current run: walk back from today (or yesterday)
  const today = dayKey();
  let cursor = set.has(today) ? today : set.has(shift(today, -1)) ? shift(today, -1) : null;
  let current = 0;
  while (cursor && set.has(cursor)) {
    current++;
    cursor = shift(cursor, -1);
  }
  return { current, best };
}

export function getStats(): StatsMap {
  return storage.get<StatsMap>("stats", {});
}

export function recordResult(result: GameResult): StatsMap {
  const stats = getStats();
  const prev = stats[result.game];
  stats[result.game] = {
    best: Math.max(prev?.best ?? 0, result.score),
    plays: (prev?.plays ?? 0) + 1,
    lastDetail: result.detail,
  };
  storage.set("stats", stats);
  const history = getHistory();
  history.push({
    at: Date.now(),
    game: result.game,
    score: result.score,
    reactionMs: result.reactionMs,
  });
  storage.set(HISTORY_KEY, history.slice(-HISTORY_MAX));
  markActivity();
  touch();
  return stats;
}

/** Per-play history (oldest first), capped at the last 300 entries. */
export function getHistory(): HistoryEntry[] {
  return storage.get<HistoryEntry[]>(HISTORY_KEY, []);
}

export function getBest(game: GameId): number {
  return getStats()[game]?.best ?? 0;
}

export function getSessions(): SessionRecord[] {
  return storage.get<SessionRecord[]>("sessions", []);
}

export function recordSession(rec: SessionRecord): void {
  const all = getSessions();
  all.push(rec);
  storage.set("sessions", all.slice(-50));
  markActivity();
  touch();
}

export function resetStats(): void {
  storage.remove("stats");
  storage.remove("sessions");
  storage.remove(ACTIVITY_KEY);
  storage.remove(HISTORY_KEY);
  storage.set(RESET_KEY, Date.now()); // other devices must wipe too, not merge back
  touch();
}

function getResetAt(): number {
  return storage.get<number>(RESET_KEY, 0);
}

// ---------------------------------------------------------------- cloud sync

export interface StatsPayload {
  stats: StatsMap;
  sessions: SessionRecord[];
  activity: string[];
  history?: HistoryEntry[];
  updatedAt: number;
  /** Time of the last explicit stats reset; 0 when never reset. */
  resetAt?: number;
}

/** Everything the cloud backup carries. */
export function exportPayload(): StatsPayload {
  return {
    stats: getStats(),
    sessions: getSessions(),
    activity: getActivityDays(),
    history: getHistory(),
    updatedAt: getStatsUpdatedAt(),
    resetAt: getResetAt(),
  };
}

/**
 * Merge a remote payload into the local data. Idempotent — bests and play
 * counts take the max (never summed), sessions and activity days are unioned,
 * so merging the same payload twice changes nothing.
 */
export function mergePayload(remote: StatsPayload): void {
  // A newer reset on another device wins over everything: wipe first, so a
  // local history that predates the reset does not get merged back in.
  if ((remote.resetAt ?? 0) > getResetAt()) {
    storage.set(RESET_KEY, remote.resetAt!);
    storage.remove("stats");
    storage.remove("sessions");
    storage.remove(ACTIVITY_KEY);
    storage.remove(HISTORY_KEY);
  }

  const newerRemote = (remote.updatedAt ?? 0) >= getStatsUpdatedAt();

  const merged: StatsMap = { ...getStats() };
  for (const [id, r] of Object.entries(remote.stats ?? {})) {
    const gid = id as GameId;
    const l = merged[gid];
    if (!r) continue;
    if (!l || r.best > l.best || r.plays > l.plays) {
      merged[gid] = {
        best: Math.max(l?.best ?? 0, r.best ?? 0),
        plays: Math.max(l?.plays ?? 0, r.plays ?? 0),
        lastDetail: newerRemote || !l ? r.lastDetail : l.lastDetail,
      };
    }
  }
  storage.set("stats", merged);

  const byAt = new Map<number, SessionRecord>();
  for (const s of getSessions()) byAt.set(s.at, s);
  for (const s of remote.sessions ?? []) byAt.set(s.at, s);
  storage.set(
    "sessions",
    [...byAt.values()].sort((a, b) => a.at - b.at).slice(-50),
  );

  const days = [...new Set([...getActivityDays(), ...(remote.activity ?? [])])].sort();
  storage.set(ACTIVITY_KEY, days.slice(-400));

  // history: dedupe by (at, game) — the same play can arrive from both devices
  const byPlay = new Map<string, HistoryEntry>();
  for (const h of getHistory()) byPlay.set(`${h.at}:${h.game}`, h);
  for (const h of remote.history ?? []) byPlay.set(`${h.at}:${h.game}`, h);
  storage.set(
    HISTORY_KEY,
    [...byPlay.values()].sort((a, b) => a.at - b.at).slice(-HISTORY_MAX),
  );

  touch();
}
