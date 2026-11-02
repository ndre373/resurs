/**
 * ratelimit.ts — tiny fixed-window per-IP rate limiter for the public
 * endpoints. The sync code IS the credential for the stats backup, so
 * sync.load/sync.save must not be brute-forceable: without a cap a caller
 * could sweep short codes at full speed. In-memory is enough here — the
 * server is a single node process; the map is swept periodically so stale
 * buckets never accumulate.
 */

import type { Context, Next } from "hono";
import { log } from "./logger";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Drop expired buckets once the map grows past this size. */
const SWEEP_THRESHOLD = 5000;

function sweep(now: number): void {
  for (const [key, b] of buckets) {
    if (now > b.resetAt) buckets.delete(key);
  }
}

function clientIp(c: Context): string {
  const fwd = c.req.header("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  // @hono/node-server exposes the raw request on the bindings
  const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)
    ?.incoming;
  return incoming?.socket?.remoteAddress ?? "unknown";
}

export function rateLimit(opts: { windowMs: number; max: number }): (c: Context, next: Next) => Promise<Response | void> {
  return async (c, next) => {
    const now = Date.now();
    if (buckets.size > SWEEP_THRESHOLD) sweep(now);
    const key = `${c.req.path}|${clientIp(c)}`;
    let b = buckets.get(key);
    if (!b || now > b.resetAt) {
      b = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(key, b);
    }
    b.count++;
    if (b.count > opts.max) {
      log.warn("rate limit exceeded", { path: c.req.path, ip: clientIp(c) });
      return c.json({ error: "Too Many Requests" }, 429);
    }
    await next();
  };
}
