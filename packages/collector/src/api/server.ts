import { createServer, type IncomingMessage, type Server } from "node:http";
import type { Settings } from "@dash/shared";
import type { Db } from "../store/db.ts";
import { buildState } from "../state.ts";

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error("body too large"));
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

/** Start the loopback JSON API. The collector's SQLite is the single source of truth. */
export function startServer(db: Db, host: string, port: number): Server {
  const server = createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const ok = () => send(200, buildState(db));

    const url = req.url ?? "/";
    const method = req.method ?? "GET";

    void (async () => {
      try {
        if (method === "GET" && url === "/api/state") return ok();

        if (method === "POST" && url === "/api/rent/done") {
          const body = (await readJson(req)) as { at?: number };
          db.addEvent("rent_done", body.at ?? Date.now());
          return ok();
        }
        if (method === "POST" && url === "/api/tax/done") {
          const body = (await readJson(req)) as { at?: number };
          db.addEvent("tax_done", body.at ?? Date.now());
          return ok();
        }
        if (method === "POST" && url === "/api/settings") {
          const patch = (await readJson(req)) as Partial<Settings>;
          const current = db.getSettings<Settings>();
          if (!current) return send(409, { error: "settings not initialised" });
          db.putSettings({ ...current, ...patch });
          return ok();
        }
        if (method === "POST" && url === "/api/sync") {
          // No adapters yet (Stage 3 wires real polling); just return current state.
          return ok();
        }
        send(404, { error: "not found" });
      } catch (err) {
        send(400, { error: err instanceof Error ? err.message : "bad request" });
      }
    })();
  });

  server.listen(port, host, () => {
    console.log(`collector listening on http://${host}:${port}`);
  });
  return server;
}
