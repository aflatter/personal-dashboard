// Boots the collector IN-PROCESS inside Electron's main process.
//
// The whole point of Electron over Tauri: the main process IS Node, so we run
// the collector on Electron's bundled Node (24.x) instead of shipping a separate
// Node runtime as a sidecar. Composition comes from the collector's own
// createCollector() factory — statically imported (typed), no re-wiring of
// collector internals. Electron's Node type-strips the collector's .ts sources
// directly, and their deps resolve from the collector's own node_modules.
//
// What this host adds around the factory's handler: static serving of the SPA
// build and an /api mount, so the renderer loads http://127.0.0.1:<port>/ and
// the SPA's relative "/api" is same-origin — no CORS, no port baked into the
// client, no VITE_API_URL. (Serving the SPA from the collector proper is a
// planned follow-up; until then this stays host-side.)
//
// No sidecar => no orphan-on-quit => no parent-death watchdog. The collector is
// this process; it dies exactly when the app does.

import { createServer } from "node:http";
import type { ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { pathToFileURL } from "node:url";

// The collector lives at a different place per mode — the workspace package in
// dev, the pnpm-deployed tree under Contents/Resources in the packaged .app —
// so it is imported dynamically from opts.collectorDir. The `typeof import`
// types are erased at runtime (the ../../../ specifier need not exist in the
// packaged app) but give the dev workspace full type checking.
type CollectorModule = typeof import("../../../packages/collector/src/collector.ts");
type SecretsModule = typeof import("../../../packages/collector/src/secrets.ts");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

async function serveStatic(distDir: string, urlPath: string, res: ServerResponse): Promise<void> {
  // Map the request path to a file under distDir, with an SPA fallback to
  // index.html for client-side routes / unknown paths.
  const clean = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(distDir, clean === "/" ? "index.html" : clean);
  if (!filePath.startsWith(distDir)) filePath = join(distDir, "index.html"); // path-escape guard
  try {
    if ((await stat(filePath)).isDirectory()) filePath = join(filePath, "index.html");
  } catch {
    filePath = join(distDir, "index.html"); // SPA fallback
  }
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { "content-type": MIME[extname(filePath)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}

export interface CollectorHost {
  url: string;
  port: number;
  close: () => Promise<void>;
}

export interface CollectorHostOptions {
  host?: string;
  port?: number;
  dbPath: string;
  distDir: string;
  /** Directory of the collector package (contains src/ and node_modules). */
  collectorDir: string;
}

/** Start the in-process collector + static SPA server on one loopback origin. */
export async function startCollectorHost(opts: CollectorHostOptions): Promise<CollectorHost> {
  const { host = "127.0.0.1", port = 4390, dbPath, distDir, collectorDir } = opts;

  const collectorUrl = (rel: string) => pathToFileURL(join(collectorDir, rel)).href;
  const { createCollector } = (await import(collectorUrl("src/collector.ts"))) as CollectorModule;
  const { loadSecrets } = (await import(collectorUrl("src/secrets.ts"))) as SecretsModule;

  const { handler } = createCollector({ dbPath, secrets: loadSecrets() });

  const server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (url === "/health") {
      handler(req, res); // the factory's handler owns /health (204)
      return;
    }
    if (url === "/api" || url.startsWith("/api/") || url.startsWith("/api?")) {
      // Strip the /api mount prefix, then let the collector handler route.
      req.url = url.slice("/api".length) || "/";
      handler(req, res);
      return;
    }
    if (req.method === "GET" || req.method === "HEAD") {
      void serveStatic(distDir, url, res);
      return;
    }
    res.writeHead(405).end("method not allowed");
  });

  await new Promise<void>((res, rej) => {
    server.once("error", rej);
    server.listen(port, host, () => res());
  });
  const url = `http://${host}:${port}/`;
  console.log(`[collector] in-process on ${url} (tRPC at /api, SPA served from dist)`);

  return {
    url,
    port,
    close: () => new Promise<void>((res) => server.close(() => res())),
  };
}
