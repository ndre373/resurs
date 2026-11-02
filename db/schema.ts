import { mysqlTable, varchar, text, timestamp } from "drizzle-orm/mysql-core";

/**
 * Cloud backup of a player's practice stats, addressable by a short
 * human-typed sync code (no accounts — whoever knows the code can
 * read/overwrite the payload, so codes are random: 8 chars from a
 * 30-letter alphabet ≈ 6.5e11 combos).
 */
export const syncStates = mysqlTable("sync_states", {
  code: varchar("code", { length: 16 }).primaryKey(),
  /** JSON: { stats, sessions, activity, updatedAt } — merged client-side. */
  payload: text("payload").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});
