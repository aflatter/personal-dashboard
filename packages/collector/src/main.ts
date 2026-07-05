import { fileURLToPath } from "node:url";
import { Db } from "./store/db.ts";
import { seed } from "./seed.ts";
import { startServer } from "./api/server.ts";

const HOST = process.env.COLLECTOR_HOST ?? "127.0.0.1";
const PORT = Number(process.env.COLLECTOR_PORT ?? 4319);
const DB_PATH =
  process.env.COLLECTOR_DB ?? fileURLToPath(new URL("../collector.db", import.meta.url));

const db = new Db(DB_PATH);
if (db.isEmpty()) {
  seed(db, Date.now());
  console.log("seeded empty database");
}

startServer(db, HOST, PORT);
// Stage 3: scheduler.start(db, secrets) drives real source polling here.
