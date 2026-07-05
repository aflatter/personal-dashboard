import { initTRPC } from "@trpc/server";
import type { Db } from "./store/db.ts";

/** Per-request context: the shared database handle. */
export interface Context {
  db: Db;
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
