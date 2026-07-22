import { on } from "node:events";
import { z } from "zod";
import type { Settings } from "@dash/collector/contract";
import { recordBankBacklog } from "./bank.ts";
import { syncBankOnce, syncInboxesOnce } from "./sync.ts";
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

/** The Mac agent's push payload: the collected backlog + when it was read. */
const bankBacklog = z.object({
  unchecked: z.number().int().nonnegative(),
  syncedAt: z.number().int().positive().optional(),
});

/**
 * The backend's API. Every procedure returns the full state so the client can
 * apply one fresh snapshot after each mutation. `AppRouter` is the contract the
 * dashboard's typed client infers from.
 */
export const appRouter = router({
  state: publicProcedure.query(({ ctx }) => buildState(ctx.db)),

  // Live state: yields the current state immediately, then again every time the
  // change bus fires (a poll committed — including a JMAP push — or a mutation).
  // This is the collector → browser push that mirrors the Fastmail → collector
  // one, so the UI reflects a mailbox change within a second instead of waiting
  // for the client's fallback poll. `on(..., { signal })` unwinds and drops the
  // listener when the subscriber disconnects (tRPC aborts the signal).
  onStateChange: publicProcedure.subscription(async function* ({ ctx, signal }) {
    yield buildState(ctx.db);
    for await (const _ of on(ctx.bus, "change", { signal })) {
      yield buildState(ctx.db);
    }
  }),

  rentDone: publicProcedure.input(doneInput).mutation(({ ctx, input }) => {
    ctx.db.addEvent("rent_done", input?.at ?? Date.now());
    ctx.bus.emit("change");
    return buildState(ctx.db);
  }),

  taxDone: publicProcedure.input(doneInput).mutation(({ ctx, input }) => {
    ctx.db.addEvent("tax_done", input?.at ?? Date.now());
    ctx.bus.emit("change");
    return buildState(ctx.db);
  }),

  settings: publicProcedure.input(settingsPatch).mutation(({ ctx, input }) => {
    const current = ctx.db.getSettings<Settings>();
    if (!current) throw new Error("settings not initialised");
    ctx.db.putSettings({ ...current, ...input });
    ctx.bus.emit("change");
    return buildState(ctx.db);
  }),

  // The inbox sync button: force a live JMAP fetch of every inbox, then return
  // the freshly assembled state. Push (`Source.watch`) keeps counts current in
  // the background, but this is the manual refresh — it actually re-reads
  // Fastmail rather than just re-serving the DB. Single-flight + fault-isolated
  // (see `syncInboxesOnce`), so a failing account still returns coherent state.
  sync: publicProcedure.mutation(async ({ ctx }) => {
    await syncInboxesOnce(ctx.db, ctx.inboxes, Date.now());
    ctx.bus.emit("change");
    return buildState(ctx.db);
  }),

  // The receive half of the push-only bank flow: the Mac agent collects the
  // MoneyMoney backlog locally and pushes it here. The backend stores it and
  // marks the source live; the value then reaches every client on the next state
  // read, even while the Mac is offline. This is the forward path — MoneyMoney is
  // collected where it can be (the Mac), never polled by the backend.
  pushBankBacklog: publicProcedure.input(bankBacklog).mutation(({ ctx, input }) => {
    recordBankBacklog(ctx.db, input, Date.now());
    // Emit like every other mutation, so a push from the Mac reaches subscribed
    // clients (the phone) over the live stream instead of waiting for a re-read.
    ctx.bus.emit("change");
    return buildState(ctx.db);
  }),

  // Transitional: in-process MoneyMoney sync (single-flight osascript), used only
  // when the backend runs on the Mac itself (the current Electron shell). It is
  // superseded by `pushBankBacklog` once the Mac push agent lands, and will be
  // removed together with the dashboard's bank-refresh button then. Fault-isolated:
  // a locked / not-authorized MoneyMoney flips bank to ok:false with the error and
  // the mutation still returns coherent state, so the card can surface it.
  syncBank: publicProcedure.mutation(async ({ ctx }) => {
    await syncBankOnce(ctx.db, ctx.bank, Date.now());
    ctx.bus.emit("change");
    return buildState(ctx.db);
  }),
});

export type AppRouter = typeof appRouter;
