/**
 * pause.ts — one pause switch for every exercise.
 *
 * pauseBus carries the state; the 3D controller freezes the active scene
 * while paused, and DOM games use pTimeout/pInterval instead of the native
 * timers so countdowns freeze too and resume where they left off.
 */

type Listener = (paused: boolean) => void;

class PauseBus {
  paused = false;
  private listeners = new Set<Listener>();

  set(p: boolean): void {
    if (this.paused === p) return;
    this.paused = p;
    for (const l of this.listeners) l(p);
  }

  toggle(): boolean {
    this.set(!this.paused);
    return this.paused;
  }

  on(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

export const pauseBus = new PauseBus();

// ---------------------------------------------------------------------------
// Pausable timers: drop-in replacements for setTimeout/setInterval that hold
// still while the exercise is paused.
// ---------------------------------------------------------------------------

interface TimerRec {
  id: number;
  fn: () => void;
  ms: number;
  remaining: number;
  started: number;
  interval: boolean;
  timer: ReturnType<typeof setTimeout>;
}

const active = new Map<number, TimerRec>();
let seq = 0;

function arm(rec: TimerRec, delay: number): void {
  rec.started = Date.now();
  rec.remaining = delay;
  rec.timer = setTimeout(() => fire(rec.id), delay);
}

function fire(id: number): void {
  const rec = active.get(id);
  if (!rec) return;
  if (rec.interval) arm(rec, rec.ms);
  else active.delete(id);
  rec.fn();
}

function create(fn: () => void, ms: number, interval: boolean): number {
  const id = ++seq;
  const rec = { id, fn, ms, remaining: ms, started: 0, interval, timer: 0 as never };
  active.set(id, rec);
  arm(rec, ms);
  return id;
}

/** Pausable setTimeout. */
export function pTimeout(fn: () => void, ms: number): number {
  return create(fn, ms, false);
}

/** Pausable setInterval. */
export function pInterval(fn: () => void, ms: number): number {
  return create(fn, ms, true);
}

/** Clears both flavours. */
export function pClear(id: number | null): void {
  if (id === null) return;
  const rec = active.get(id);
  if (!rec) return;
  clearTimeout(rec.timer);
  active.delete(id);
}

pauseBus.on((paused) => {
  const now = Date.now();
  for (const rec of active.values()) {
    if (paused) {
      clearTimeout(rec.timer);
      rec.remaining = Math.max(0, rec.remaining - (now - rec.started));
    } else {
      arm(rec, rec.remaining);
    }
  }
});
