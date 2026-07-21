// Thin bin: env parsing + loopback listen. All composition lives in
// createBackend (./backend.ts), shared with the desktop shell.
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { loadSecrets } from "@dash/collector/secrets";
import { withSpa } from "./app-server.ts";
import { createBackend } from "./backend.ts";

const HOST = process.env.COLLECTOR_HOST ?? "127.0.0.1";
const PORT = Number(process.env.COLLECTOR_PORT ?? 4319);
const DB_PATH =
  process.env.COLLECTOR_DB ?? fileURLToPath(new URL("../collector.db", import.meta.url));
// In the container the built SPA is baked in and served same-origin; set
// DASHBOARD_DIST to its path. Unset in dev — Vite serves the SPA and proxies /api.
const DIST = process.env.DASHBOARD_DIST;

const { handler } = createBackend({ dbPath: DB_PATH, secrets: loadSecrets() });
const listener = DIST ? withSpa(handler, DIST) : handler;

createServer(listener).listen(PORT, HOST, () => {
  console.log(`backend listening on http://${HOST}:${PORT}${DIST ? " (serving SPA)" : ""}`);
});
