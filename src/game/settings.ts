/**
 * settings.ts — persisted user preferences that don't belong to a single
 * subsystem: default exercise duration (used by Breath/Flow chips) and the
 * haptics master switch. Everything is localStorage-backed with safe
 * fallbacks, same pattern as voice.ts.
 */

const DURATION_KEY = "resurs.durationMin";
const HAPTICS_KEY = "resurs.haptics";

function readNum(key: string, fallback: number): number {
  try {
    const v = localStorage.getItem(key);
    const n = v === null ? NaN : Number(v);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}
function writeNum(key: string, v: number): void {
  try {
    localStorage.setItem(key, String(v));
  } catch {
    /* in-memory default still applies */
  }
}
function readFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}
function writeFlag(key: string, v: boolean): void {
  try {
    localStorage.setItem(key, v ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** Default exercise length in minutes; 0 = endless. */
export function getDefaultDuration(): number {
  const v = readNum(DURATION_KEY, 1);
  return [1, 5, 10, 15, 20, 0].includes(v) ? v : 1;
}
export function setDefaultDuration(minutes: number): void {
  writeNum(DURATION_KEY, minutes);
}

/** Master switch for tactile feedback (Vibration API). */
export function hapticsEnabled(): boolean {
  return readFlag(HAPTICS_KEY, true);
}
export function setHapticsEnabled(on: boolean): void {
  writeFlag(HAPTICS_KEY, on);
}
