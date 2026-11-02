/**
 * syncRouter — cloud backup of practice stats by sync code.
 * No accounts: the code IS the credential (stats are non-sensitive).
 */

import { z } from "zod";
import { eq } from "drizzle-orm";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { syncStates } from "@db/schema";

const codeSchema = z
  .string()
  .min(8) // client always generates 8; shorter codes would be brute-forceable
  .max(16)
  .regex(/^[A-Z0-9-]+$/i);

export const syncRouter = createRouter({
  /** Fetch the payload stored under a code; null when the code is unknown. */
  load: publicQuery.input(z.object({ code: codeSchema })).query(async ({ input }) => {
    const row = await getDb().query.syncStates.findFirst({
      where: eq(syncStates.code, input.code.toUpperCase()),
    });
    return row ? { payload: row.payload, updatedAt: row.updatedAt } : null;
  }),

  /** Upsert the payload under a code. */
  save: publicQuery
    .input(z.object({ code: codeSchema, payload: z.string().max(128 * 1024) }))
    .mutation(async ({ input }) => {
      const code = input.code.toUpperCase();
      await getDb()
        .insert(syncStates)
        .values({ code, payload: input.payload })
        .onDuplicateKeyUpdate({ set: { payload: input.payload } });
      return { ok: true as const };
    }),
});
