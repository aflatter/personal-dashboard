import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import { appRouter } from "./router.ts";
import { loadSecrets } from "./secrets.ts";
import { seed } from "./seed.ts";
import { startScheduler } from "./scheduler.ts";
import { jobs } from "./sources/index.ts";
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

// Poll real sources on their cadences (skips any without a secret / opt-in).
startScheduler(db, loadSecrets(), jobs);

// Own http server so we can bind loopback explicitly; tRPC handles the routing.
const handler = createHTTPHandler({ router: appRouter, createContext: () => ({ db }) });
createServer(handler).listen(PORT, HOST, () => {
  console.log(`collector listening on http://${HOST}:${PORT}`);
});
