import type { EventEmitter } from "node:events";
import { initTRPC } from "@trpc/server";
import type { Source } from "@dash/collector/sources/port";
import type { StaleAfter } from "./state.ts";
import type { Db } from "./store/db.ts";

/**
 * Per-request context: the shared database handle, the configured inbox sources
 * (for the inbox sync button's on-demand poll), and the change bus (fires
 * "change" whenever the stored state moves, so the live `onStateChange`
 * subscription can re-emit). Deliberately NOT the raw secrets — sources are
 * configured at construction (registry), so the API layer never holds tokens.
 * No bank source: it is pushed in by the Mac agent, never polled here.
 */
export interface Context {
  db: Db;
  inboxes: Source[];
  bus: EventEmitter;
  /** Per-source staleness budgets, derived from the job cadences at boot. */
  staleAfter: StaleAfter;
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
