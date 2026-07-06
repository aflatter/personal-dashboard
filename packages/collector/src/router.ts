import { z } from "zod";
import type { Settings } from "./contract.ts";
import { pollOnce } from "./sampling/sampler.ts";
import { bankSource } from "./sources/index.ts";
import { buildState } from "./state.ts";
import { publicProcedure, router } from "./trpc.ts";

/** Optional `{ at }` for the "done" mutations — defaults to now on the server. */
const doneInput = z.object({ at: z.number() }).partial().optional();

const settingsPatch = z
  .object({
    overdueThreshold: z.number().int().positive(),
    dueSoonThreshold: z.number().int().positive(),
    clockSeconds: z.boolean(),
  })
  .partial();

/**
 * The collector's API. Every procedure returns the full state so the client can
 * apply one fresh snapshot after each mutation. `AppRouter` is the contract the
 * dashboard's typed client infers from.
 */
export const appRouter = router({
  state: publicProcedure.query(({ ctx }) => buildState(ctx.db)),

  rentDone: publicProcedure.input(doneInput).mutation(({ ctx, input }) => {
    ctx.db.addEvent("rent_done", input?.at ?? Date.now());
    return buildState(ctx.db);
  }),

  taxDone: publicProcedure.input(doneInput).mutation(({ ctx, input }) => {
    ctx.db.addEvent("tax_done", input?.at ?? Date.now());
    return buildState(ctx.db);
  }),

  settings: publicProcedure.input(settingsPatch).mutation(({ ctx, input }) => {
    const current = ctx.db.getSettings<Settings>();
    if (!current) throw new Error("settings not initialised");
    ctx.db.putSettings({ ...current, ...input });
    return buildState(ctx.db);
  }),

  // HTTP sources refresh themselves on the scheduler; this just returns the
  // latest assembled state (the inbox "sync" button's refresh).
  sync: publicProcedure.mutation(({ ctx }) => buildState(ctx.db)),

  // On-demand MoneyMoney sync (it is not scheduled). `pollOnce` is fault-isolated:
  // on failure it flips bank to ok:false with the error, never throwing out, so
  // the mutation always returns coherent state and the card shows the staleness.
  syncBank: publicProcedure.mutation(async ({ ctx }) => {
    if (!bankSource.ready(ctx.secrets)) {
      ctx.db.markSourceError("bank", "MoneyMoney sync needs macOS", Date.now());
    } else {
      await pollOnce(ctx.db, bankSource, ctx.secrets, Date.now());
    }
    return buildState(ctx.db);
  }),
});

export type AppRouter = typeof appRouter;
