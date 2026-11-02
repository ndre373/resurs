/**
 * breathPatterns.ts — breathing rhythm definitions, shared by the 3D scene
 * (scenes/breath.ts, lazy-loaded) and the HUD (games/BreathGame.tsx) without
 * pulling the scene's three.js code into the main bundle.
 */

export type BreathPhase = "in" | "hold" | "out";

export interface BreathStep {
  phase: BreathPhase;
  sec: number;
}

export interface BreathPattern {
  id: string;
  label: string;
  steps: BreathStep[];
}

/** Breathing rhythms: coherent (default), the 4-7-8 relaxer and box breathing. */
export const BREATH_PATTERNS: BreathPattern[] = [
  {
    id: "coherent",
    label: "Когерентное 5·5",
    steps: [
      { phase: "in", sec: 5 },
      { phase: "out", sec: 5 },
    ],
  },
  {
    id: "478",
    label: "4-7-8",
    steps: [
      { phase: "in", sec: 4 },
      { phase: "hold", sec: 7 },
      { phase: "out", sec: 8 },
    ],
  },
  {
    id: "box",
    label: "Квадрат 4·4·4·4",
    steps: [
      { phase: "in", sec: 4 },
      { phase: "hold", sec: 4 },
      { phase: "out", sec: 4 },
      { phase: "hold", sec: 4 },
    ],
  },
];

export const patternById = (id: string): BreathPattern =>
  BREATH_PATTERNS.find((p) => p.id === id) ?? BREATH_PATTERNS[0];
