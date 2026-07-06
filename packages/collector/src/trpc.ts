import { initTRPC } from "@trpc/server";
import type { Secrets } from "./secrets.ts";
import type { Db } from "./store/db.ts";

/** Per-request context: the shared database handle and resolved secrets. */
export interface Context {
  db: Db;
  secrets: Secrets;
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
