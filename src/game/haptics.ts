/**
 * haptics.ts — tactile channel feedback via the Vibration API.
 * Android devices vibrate; platforms without support (iOS Safari, desktop)
 * silently ignore the call. Short, subtle patterns — a tap, not a buzz.
 */

export const HAPTIC = {
  /** light tick — a tap registered */
  tap: 12,
  /** success — two soft pulses */
  good: [18, 40, 18],
  /** mistake — one longer pulse */
  bad: 70,
  /** exercise finished — rising triple pulse */
  complete: [25, 60, 25, 60, 110],
} as const;

import { hapticsEnabled } from "./settings";

export function haptic(pattern: number | readonly number[]): void {
  if (!hapticsEnabled()) return;
  try {
    navigator.vibrate?.(pattern as number | number[]);
  } catch {
    /* vibration unsupported — fine */
  }
}
