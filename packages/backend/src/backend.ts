import { EventEmitter } from "node:events";
import type { RequestListener } from "node:http";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import { buildJobs } from "@dash/collector/registry";
import type { Secrets } from "@dash/collector/secrets";
import { appRouter } from "./router.ts";
import { seed } from "./seed.ts";
import { startScheduler } from "./scheduler.ts";
import { Db } from "./store/db.ts";

export interface BackendOptions {
  /** SQLite path (":memory:" works). Seeded on first run when empty. */
  dbPath: string;
  /** Resolved secrets — load via `loadSecrets()` (@dash/collector/secrets) or supply directly. */
  secrets: Secrets;
}

export interface Backend {
  /**
   * HTTP request listener: `/health` → 204, everything else tRPC. Mount it on
   * your own `http.Server` (bin: loopback listen; Electron: same-origin with
   * static SPA serving). The backend is a process-lifetime service — the
   * scheduler has no stop mechanism, so there is no close(); consumers own
   * their server's lifecycle and the process's.
   */
  handler: RequestListener;
  db: Db;
}

/**
 * Compose the backend: open + seed the store, gate/construct the sources from
 * the secrets (registry, in @dash/collector), start the polling scheduler, and
 * return the request handler. This is the one composition point every consumer
 * shares — the bin (main.ts) and the Electron desktop shell differ only in how
 * they serve it.
 */
export function createBackend(opts: BackendOptions): Backend {
  const db = new Db(opts.dbPath);
  if (db.isEmpty()) {
    seed(db, Date.now());
    console.log("seeded empty database");
  }

  // Fires "change" whenever stored state moves, so the live `onStateChange`
  // subscription re-emits. One listener per open browser tab — lift the default
  // cap so many tabs don't trip a MaxListeners warning.
  const bus = new EventEmitter();
  bus.setMaxListeners(0);

  // Poll real sources on their cadences (the registry skips any without a
  // secret). MoneyMoney is not here and never will be: only a native Mac process
  // can read it, so the Mac agent pushes it in via `pushBankBacklog`. Each
  // committed poll (timer or JMAP push) pings the bus so live subscribers update.
  const jobs = buildJobs(opts.secrets);
  startScheduler(db, jobs, () => bus.emit("change"));

  // The inbox sources also back the inbox sync button's on-demand poll, so hand
  // them to the API context (only those actually configured are present).
  const inboxes = jobs.map((j) => j.source).filter((s) => s.id.startsWith("inbox:"));

  const trpcHandler = createHTTPHandler({
    router: appRouter,
    createContext: () => ({ db, inboxes, bus }),
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
