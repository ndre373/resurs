import { createRouter, publicQuery } from "./middleware";
import { syncRouter } from "./syncRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),

  sync: syncRouter,
});

export type AppRouter = typeof appRouter;
