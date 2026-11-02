/**
 * sync.ts — cloud backup of practice stats behind a short sync code.
 * Talks to the tRPC `sync` router with plain fetch (superjson wire format)
 * so game modules need no React context. Offline simply means «local only».
 */

import { exportPayload, mergePayload } from "./stats";
import { storage } from "./storage";

const CODE_KEY = "syncCode";

/** Unguessable but typeable: no 0/O, 1/I/L confusion. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateSyncCode(): string {
  const rnd = new Uint8Array(8);
  crypto.getRandomValues(rnd);
  return [...rnd].map((b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function getSyncCode(): string | null {
  return storage.get<string | null>(CODE_KEY, null);
}

export function setSyncCode(code: string | null): void {
  if (code) storage.set(CODE_KEY, code.toUpperCase());
  else storage.remove(CODE_KEY);
}

// ---- minimal tRPC client (superjson wire format) --------------------------

async function trpcGet<T>(path: string, input: unknown): Promise<T | null> {
  const res = await fetch(
    `/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`,
    { credentials: "include" },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return (body?.result?.data?.json ?? null) as T | null;
}

async function trpcPost<T>(path: string, input: unknown): Promise<T | null> {
  const res = await fetch(`/api/trpc/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ json: input }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return (body?.result?.data?.json ?? null) as T | null;
}

// ---- public API ------------------------------------------------------------

export async function pushToCloud(): Promise<boolean> {
  const code = getSyncCode();
  if (!code) return false;
  try {
    await trpcPost("sync.save", { code, payload: JSON.stringify(exportPayload()) });
    return true;
  } catch {
    return false;
  }
}

export type PullResult = "merged" | "empty" | "error";

/** Pull the cloud payload and merge it into local stats. */
export async function pullFromCloud(): Promise<PullResult> {
  const code = getSyncCode();
  if (!code) return "error";
  try {
    const row = await trpcGet<{ payload: string }>("sync.load", { code });
    if (!row) return "empty";
    mergePayload(JSON.parse(row.payload));
    return "merged";
  } catch {
    return "error";
  }
}

/** Create a fresh code, store it and push the current stats up. */
export async function createCloudSync(): Promise<string | null> {
  const code = generateSyncCode();
  setSyncCode(code);
  const ok = await pushToCloud();
  if (!ok) {
    setSyncCode(null);
    return null;
  }
  return code;
}

/** Connect to an existing code and pull its data down. */
export async function connectCloudSync(code: string): Promise<PullResult> {
  setSyncCode(code);
  return pullFromCloud();
}

// Debounced auto-push after a finished game/session.
let pushTimer: ReturnType<typeof setTimeout> | null = null;
export function schedulePush(): void {
  if (!getSyncCode()) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void pushToCloud(), 2500);
}
