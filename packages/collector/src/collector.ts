import type { RequestListener } from "node:http";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import { buildBankSource, buildJobs } from "./registry.ts";
import { appRouter } from "./router.ts";
import type { Secrets } from "./secrets.ts";
import { seed } from "./seed.ts";
import { startScheduler } from "./scheduler.ts";
import { Db } from "./store/db.ts";

export interface CollectorOptions {
  /** SQLite path (":memory:" works). Seeded on first run when empty. */
  dbPath: string;
  /** Resolved secrets — load via `loadSecrets()` (./secrets.ts) or supply directly. */
  secrets: Secrets;
}

export interface Collector {
  /**
   * HTTP request listener: `/health` → 204, everything else tRPC. Mount it on
   * your own `http.Server` (bin: loopback listen; Electron: same-origin with
   * static SPA serving). The collector is a process-lifetime service — the
   * scheduler has no stop mechanism, so there is no close(); consumers own
   * their server's lifecycle and the process's.
   */
  handler: RequestListener;
  db: Db;
}

/**
 * Compose a collector: open + seed the store, gate/construct the sources from
 * the secrets (registry), start the polling scheduler, and return the request
 * handler. This is the one composition point every consumer shares — the bin
 * (main.ts) and the Electron desktop shell differ only in how they serve it.
 */
export function createCollector(opts: CollectorOptions): Collector {
  const db = new Db(opts.dbPath);
  if (db.isEmpty()) {
    seed(db, Date.now());
    console.log("seeded empty database");
  }

  const bank = buildBankSource(opts.secrets);

  // Poll real sources on their cadences (the registry skips any without a
  // secret). MoneyMoney is not here — it syncs on-demand via `syncBank`.
  startScheduler(db, buildJobs(opts.secrets));

  const trpcHandler = createHTTPHandler({
    router: appRouter,
    createContext: () => ({ db, bank }),
  });

  // A plain /health route backs readiness probes (tRPC would 404 it).
  const handler: RequestListener = (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(204);
      res.end();
      return;
    }
    trpcHandler(req, res);
  };

  return { handler, db };
}
