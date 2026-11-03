/**
 * sync.ts — перенос статистики между устройствами БЕЗ сервера.
 *
 * The app is hosted on static hosting (GitHub Pages) — there is no backend to
 * store anything. Instead the whole stats payload is packed into a portable
 * «код переноса»: JSON → gzip → base64url. The user copies the code to the
 * other device (messenger, notes) and pastes it there. Works fully offline.
 * Merging is idempotent (see stats.mergePayload) — applying the same code
 * twice changes nothing, and the better results always win.
 */

import { exportPayload, mergePayload, type StatsPayload } from "./stats";

function base64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000; // String.fromCharCode has an argument-count limit
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Pack the local stats into a portable transfer code. */
export async function createTransferCode(): Promise<string> {
  const payload: StatsPayload = exportPayload();
  // keep the code compact: the reaction chart only reads the recent plays
  payload.history = payload.history?.slice(-60);
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  try {
    const stream = new Blob([bytes as BlobPart])
      .stream()
      .pipeThrough(new CompressionStream("gzip"));
    const packed = new Uint8Array(await new Response(stream).arrayBuffer());
    return "R1." + base64urlEncode(packed);
  } catch {
    // very old browsers without CompressionStream — plain encoding still works
    return "R0." + base64urlEncode(bytes);
  }
}

export type ApplyResult = "merged" | "error";

/** Apply a transfer code created on another device; stats are merged, never overwritten. */
export async function applyTransferCode(code: string): Promise<ApplyResult> {
  const m = code.trim().match(/^(R[01])\.([A-Za-z0-9_-]+)$/);
  if (!m) return "error";
  try {
    let bytes = base64urlDecode(m[2]);
    if (m[1] === "R1") {
      const stream = new Blob([bytes as BlobPart])
        .stream()
        .pipeThrough(new DecompressionStream("gzip"));
      bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    }
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as StatsPayload;
    if (!payload || typeof payload !== "object" || !payload.stats) return "error";
    mergePayload(payload);
    return "merged";
  } catch {
    return "error";
  }
}
