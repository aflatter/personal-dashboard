import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import { buildBankSource, buildJobs } from "./registry.ts";
import { appRouter } from "./router.ts";
import { loadSecrets } from "./secrets.ts";
import { seed } from "./seed.ts";
import { startScheduler } from "./scheduler.ts";
import { Db } from "./store/db.ts";

const HOST = process.env.COLLECTOR_HOST ?? "127.0.0.1";
const PORT = Number(process.env.COLLECTOR_PORT ?? 4319);
const DB_PATH =
  process.env.COLLECTOR_DB ?? fileURLToPath(new URL("../collector.db", import.meta.url));

const db = new Db(DB_PATH);
if (db.isEmpty()) {
  seed(db, Date.now());
  console.log("seeded empty database");
}

const secrets = loadSecrets();
const bank = buildBankSource(secrets);

// Poll real sources on their cadences (the registry skips any without a secret).
// MoneyMoney is not here — it syncs on-demand via the `syncBank` mutation.
startScheduler(db, buildJobs(secrets));

// Own http server so we can bind loopback explicitly; tRPC handles the routing.
// A plain /health route backs the devenv readiness probe (tRPC would 404 it).
const handler = createHTTPHandler({ router: appRouter, createContext: () => ({ db, bank }) });
createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(204);
    res.end();
    return;
  }
  handler(req, res);
}).listen(PORT, HOST, () => {
  console.log(`collector listening on http://${HOST}:${PORT}`);
});
