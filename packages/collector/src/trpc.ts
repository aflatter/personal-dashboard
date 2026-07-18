import { initTRPC } from "@trpc/server";
import type { BankGate } from "./registry.ts";
import type { Db } from "./store/db.ts";

/**
 * Per-request context: the shared database handle and the gated bank source.
 * Deliberately NOT the raw secrets — sources are configured at construction
 * (registry), so the API layer never holds tokens.
 */
export interface Context {
  db: Db;
  bank: BankGate;
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
