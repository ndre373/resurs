/**
 * config.ts — global tuning: palette, quality tiers, per-game constants.
 */

export const COLORS = {
  background: 0x070a12,
  /** App palette — calm cosmic teal/violet. */
  palette: [0x5eead4, 0x818cf8, 0xc084fc, 0x67e8f9, 0xf0abfc, 0x7dd3fc] as number[],
  good: 0x5eead4,
  bad: 0xfb7185,
} as const;

export const QUALITY = {
  PARTICLES_HIGH: 900,
  PARTICLES_LOW: 260,
  DEGRADE_FPS: 45,
} as const;

export const ALPHABET = {
  ROUNDS: 30,
  /** ms per cue at the start; shrinks as the streak grows. */
  BASE_WINDOW: 3200,
  MIN_WINDOW: 1400,
} as const;

export const STROOP = {
  ROUNDS: 24,
  TIME_LIMIT_MS: 4000,
} as const;

export const ECHO = {
  START_LEN: 3,
  MAX_LEN: 12,
  SHOW_MS: 620,
} as const;

export const BREATH = {
  INHALE_S: 5,
  EXHALE_S: 5,
  DEFAULT_CYCLES: 10,
} as const;

export const FLOW = {
  DURATION_S: 75,
  START_SPEED: 10,
  MAX_SPEED: 22,
  RING_GAP: 9,
  RING_RADIUS: 2.2,
  HIT_RADIUS: 1.05,
} as const;

export const RHYTHM = {
  START_STEPS: 4,
  MAX_STEPS: 10,
  BPM: 84,
} as const;

export const CROSS = {
  /** Total diagonal cues per run. */
  ROUNDS: 12,
  /** Answer window per cue, shrinking from start to min as rounds progress. */
  START_WINDOW: 4200,
  MIN_WINDOW: 1900,
  /** Max gap between the two corner touches to count as «simultaneous». */
  SYNC_MS: 500,
} as const;

// ---------------------------------------------------------- difficulty tiers
// «mid» matches the classic constants above; easy/hard scale the challenge.

/** Alphabet: answer window per cue (shrinks with the streak). */
export const ALPHABET_DIFF = {
  easy: { baseWindow: 4200, minWindow: 1800, shrink: 80 },
  mid: { baseWindow: 3200, minWindow: 1400, shrink: 120 },
  hard: { baseWindow: 2400, minWindow: 1000, shrink: 160 },
} as const;

/** Stroop: ms per word. */
export const STROOP_DIFF = { easy: 6000, mid: 4000, hard: 2600 } as const;

/** Echo: ms between orb flashes while the chain plays. */
export const ECHO_DIFF = { easy: 850, mid: 620, hard: 460 } as const;

/** Rhythm: beats per minute of the drum pattern. */
export const RHYTHM_DIFF = { easy: 70, mid: 84, hard: 100 } as const;

/** Cross: scale of the answer window + simultaneity gap. */
export const CROSS_DIFF = {
  easy: { scale: 1.3, syncMs: 650 },
  mid: { scale: 1, syncMs: 500 },
  hard: { scale: 0.75, syncMs: 360 },
} as const;

/** Flow: flight speed multiplier. */
export const FLOW_DIFF = { easy: 0.75, mid: 1, hard: 1.3 } as const;

/** Breath: how many cycles the voice prompter leads in detail. */
export const BREATH_DIFF = { easy: 5, mid: 3, hard: 1 } as const;
