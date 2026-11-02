/**
 * emitter.ts — minimal typed event bus between the 3D layer and the React UI.
 */

export type Handler<T = unknown> = (payload: T) => void;

export class Emitter {
  private map = new Map<string, Set<Handler<never>>>();

  on<T>(event: string, fn: Handler<T>): () => void {
    let set = this.map.get(event);
    if (!set) {
      set = new Set();
      this.map.set(event, set);
    }
    set.add(fn as Handler<never>);
    return () => this.off(event, fn);
  }

  off<T>(event: string, fn: Handler<T>): void {
    this.map.get(event)?.delete(fn as Handler<never>);
  }

  emit<T>(event: string, payload?: T): void {
    const set = this.map.get(event);
    if (!set) return;
    for (const fn of Array.from(set)) (fn as Handler<T>)(payload as T);
  }

  clear(): void {
    this.map.clear();
  }
}
