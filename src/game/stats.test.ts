/**
 * stats.test.ts — unit tests for the practice-stats store: the streak
 * computation (edge cases) and the cloud-merge logic (idempotency, max-not-sum,
 * reset tombstone). Runs in the node environment with an in-memory
 * localStorage stub, installed fresh before every test.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

function makeLocalStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

let stats: typeof import("./stats");

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 2, 12, 0, 0)); // 2026-11-02, local noon
  vi.stubGlobal("localStorage", makeLocalStorage());
  vi.resetModules();
  stats = await import("./stats");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Record a result as if played `daysAgo` days before the fake "today". */
function playOn(daysAgo: number, score = 1): void {
  const d = new Date(2026, 10, 2 - daysAgo, 12, 0, 0);
  vi.setSystemTime(d);
  stats.recordResult({ game: "alphabet", score, detail: "" });
  vi.setSystemTime(new Date(2026, 10, 2, 12, 0, 0));
}

describe("getStreak", () => {
  it("returns zeros when nothing was played", () => {
    expect(stats.getStreak()).toEqual({ current: 0, best: 0 });
  });

  it("counts a single day played today", () => {
    playOn(0);
    expect(stats.getStreak()).toEqual({ current: 1, best: 1 });
  });

  it("keeps the streak alive when today has no practice yet", () => {
    playOn(1);
    playOn(2);
    expect(stats.getStreak()).toEqual({ current: 2, best: 2 });
  });

  it("extends the streak once today is played", () => {
    playOn(1);
    playOn(0);
    expect(stats.getStreak()).toEqual({ current: 2, best: 2 });
  });

  it("drops the current run after a gap but keeps the best", () => {
    playOn(0);
    playOn(1);
    playOn(3); // gap on day 2
    playOn(4);
    playOn(5);
    expect(stats.getStreak()).toEqual({ current: 2, best: 3 });
  });

  it("ignores duplicate entries on the same day", () => {
    playOn(0);
    playOn(0);
    playOn(0);
    expect(stats.getActivityDays()).toHaveLength(1);
    expect(stats.getStreak().current).toBe(1);
  });
});

describe("recordResult", () => {
  it("keeps the max score as best and counts plays", () => {
    stats.recordResult({ game: "flow", score: 10, detail: "a" });
    stats.recordResult({ game: "flow", score: 7, detail: "b" });
    const s = stats.getStats().flow!;
    expect(s.best).toBe(10);
    expect(s.plays).toBe(2);
    expect(s.lastDetail).toBe("b");
  });
});

describe("mergePayload", () => {
  it("is idempotent: merging the same payload twice changes nothing", () => {
    const payload = {
      stats: { alphabet: { best: 5, plays: 3, lastDetail: "x" } },
      sessions: [{ at: 1000, intention: "i", games: ["alphabet" as const], results: [] }],
      activity: ["2026-11-01"],
      updatedAt: 1000,
    };
    stats.mergePayload(payload);
    const first = stats.exportPayload();
    stats.mergePayload(payload);
    expect(stats.exportPayload()).toEqual(first);
  });

  it("takes the max of best/plays instead of summing devices", () => {
    stats.recordResult({ game: "echo", score: 8, detail: "" });
    stats.recordResult({ game: "echo", score: 3, detail: "" });
    stats.mergePayload({
      stats: { echo: { best: 6, plays: 5, lastDetail: "r" } },
      sessions: [],
      activity: [],
      updatedAt: Date.now() + 1000,
    });
    const s = stats.getStats().echo!;
    expect(s.best).toBe(8); // max(8, 6)
    expect(s.plays).toBe(5); // max(2, 5), NOT 7
  });

  it("unions sessions and activity days without duplicates", () => {
    stats.recordSession({ at: 1000, intention: "a", games: [], results: [] });
    stats.mergePayload({
      stats: {},
      sessions: [
        { at: 1000, intention: "a", games: [], results: [] }, // same `at` — duplicate
        { at: 2000, intention: "b", games: [], results: [] },
      ],
      activity: ["2026-11-02", "2026-11-01"],
      updatedAt: Date.now(),
    });
    expect(stats.getSessions()).toHaveLength(2);
    expect(stats.getActivityDays()).toEqual(["2026-11-01", "2026-11-02"]);
  });

  it("a newer remote resetAt wipes local history before merging", () => {
    playOn(1);
    stats.recordResult({ game: "alphabet", score: 9, detail: "old" });
    stats.mergePayload({
      stats: { flow: { best: 4, plays: 1, lastDetail: "post-reset" } },
      sessions: [],
      activity: [],
      updatedAt: Date.now(),
      resetAt: Date.now() + 60_000, // another device reset AFTER our plays
    });
    const s = stats.getStats();
    expect(s.alphabet).toBeUndefined(); // pre-reset local data is gone
    expect(s.flow?.best).toBe(4); // post-reset remote data survives
    expect(stats.getActivityDays()).toEqual([]);
  });

  it("an older remote resetAt does not wipe local data", () => {
    stats.resetStats();
    stats.recordResult({ game: "alphabet", score: 9, detail: "fresh" });
    const resetAt = stats.exportPayload().resetAt!;
    stats.mergePayload({
      stats: { echo: { best: 12, plays: 9, lastDetail: "stale" } },
      sessions: [],
      activity: ["2026-10-01"],
      updatedAt: Date.now(),
      resetAt: resetAt - 60_000, // reset happened BEFORE ours — irrelevant
    });
    expect(stats.getStats().alphabet?.best).toBe(9);
    expect(stats.getStats().echo?.best).toBe(12); // still merges normally
  });
});

describe("history", () => {
  it("appends one entry per finished play, oldest first", () => {
    stats.recordResult({ game: "alphabet", score: 20, detail: "", reactionMs: 640 });
    stats.recordResult({ game: "stroop", score: 18, detail: "", reactionMs: 720 });
    const h = stats.getHistory();
    expect(h).toHaveLength(2);
    expect(h[0]).toMatchObject({ game: "alphabet", score: 20, reactionMs: 640 });
    expect(h[1]).toMatchObject({ game: "stroop", score: 18, reactionMs: 720 });
  });

  it("merge unions history by (at, game) without duplicates and keeps order", () => {
    stats.recordResult({ game: "alphabet", score: 20, detail: "", reactionMs: 640 });
    const local = stats.getHistory()[0];
    stats.mergePayload({
      stats: {},
      sessions: [],
      activity: [],
      history: [
        { ...local }, // duplicate of the local play
        { at: local.at + 5000, game: "stroop" as const, score: 15, reactionMs: 800 },
      ],
      updatedAt: Date.now(),
    });
    const h = stats.getHistory();
    expect(h).toHaveLength(2);
    expect(h[0].game).toBe("alphabet");
    expect(h[1].game).toBe("stroop");
  });

  it("a newer remote resetAt also wipes the local history", () => {
    stats.recordResult({ game: "alphabet", score: 20, detail: "", reactionMs: 640 });
    stats.mergePayload({
      stats: {},
      sessions: [],
      activity: [],
      history: [],
      updatedAt: Date.now(),
      resetAt: Date.now() + 60_000,
    });
    expect(stats.getHistory()).toEqual([]);
  });
});

describe("resetStats", () => {
  it("clears stats/sessions/activity and stamps resetAt", () => {
    playOn(0);
    stats.recordSession({ at: 1, intention: "a", games: [], results: [] });
    stats.resetStats();
    expect(stats.getStats()).toEqual({});
    expect(stats.getSessions()).toEqual([]);
    expect(stats.getActivityDays()).toEqual([]);
    expect(stats.getHistory()).toEqual([]);
    expect(stats.exportPayload().resetAt).toBeGreaterThan(0);
  });
});
