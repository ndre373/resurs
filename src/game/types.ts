/**
 * types.ts — shared types for the whole app.
 */

export type GameId =
  | "alphabet"
  | "stroop"
  | "echo"
  | "breath"
  | "flow"
  | "rhythm"
  | "mirror"
  | "cross";

export type SceneName = "breath" | "echo" | "flow";

/** Result of a finished game round, shown on the result screen and saved to stats. */
export interface GameResult {
  game: GameId;
  /** Primary metric (higher = better), meaning depends on the game. */
  score: number;
  /** Human-readable summary, e.g. "27/30 верно · реакция 640 мс". */
  detail: string;
  /** Average reaction time in ms — set by the speed games (alphabet/stroop). */
  reactionMs?: number;
}

/** One finished play — the raw material for the progress charts. */
export interface HistoryEntry {
  at: number; // timestamp
  game: GameId;
  score: number;
  reactionMs?: number;
}

/** Per-game persisted best values. */
export interface GameStats {
  best: number;
  plays: number;
  lastDetail: string;
}

export type StatsMap = Partial<Record<GameId, GameStats>>;

/** Difficulty picked on the ready gate: easy / mid (default) / hard. */
export type Difficulty = "easy" | "mid" | "hard";

export interface SessionRecord {
  at: number; // timestamp
  intention: string;
  games: GameId[];
  results: GameResult[];
  /** Self-rated state 1..10 before / after the session — the measurable effect. */
  stateBefore?: number;
  stateAfter?: number;
}
