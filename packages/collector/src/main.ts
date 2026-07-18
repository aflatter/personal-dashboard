// Thin bin: env parsing + loopback listen. All composition lives in
// createCollector (./collector.ts), shared with the desktop shell.
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createCollector } from "./collector.ts";
import { loadSecrets } from "./secrets.ts";

const HOST = process.env.COLLECTOR_HOST ?? "127.0.0.1";
const PORT = Number(process.env.COLLECTOR_PORT ?? 4319);
const DB_PATH =
  process.env.COLLECTOR_DB ?? fileURLToPath(new URL("../collector.db", import.meta.url));

const { handler } = createCollector({ dbPath: DB_PATH, secrets: loadSecrets() });

createServer(handler).listen(PORT, HOST, () => {
  console.log(`collector listening on http://${HOST}:${PORT}`);
});
