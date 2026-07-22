import type { EventEmitter } from "node:events";
import { initTRPC } from "@trpc/server";
import type { BankGate } from "@dash/collector/registry";
import type { Source } from "@dash/collector/sources/port";
import type { Db } from "./store/db.ts";

/**
 * Per-request context: the shared database handle, the gated bank source, the
 * configured inbox sources (for the inbox sync button's on-demand poll), and the
 * change bus (fires "change" whenever the stored state moves, so the live
 * `onStateChange` subscription can re-emit). Deliberately NOT the raw secrets —
 * sources are configured at construction (registry), so the API layer never holds
 * tokens.
 */
export interface Context {
  db: Db;
  bank: BankGate;
  inboxes: Source[];
  bus: EventEmitter;
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
