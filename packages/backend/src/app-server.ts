import { readFile, stat } from "node:fs/promises";
import type { RequestListener, ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";

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

/**
 * Map a request path to a file under `distDir`, applying the path-escape guard
 * and the SPA convention ("/" → index.html). Pure: no I/O — the directory /
 * not-found → index.html fallback happens in `serveStatic`. The returned path is
 * always within `distDir` (a "../…" escape collapses back to index.html).
 */
export function resolveStaticPath(distDir: string, urlPath: string): string {
  const clean = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(distDir, clean === "/" ? "index.html" : clean);
  return filePath.startsWith(distDir) ? filePath : join(distDir, "index.html");
}

async function serveStatic(distDir: string, urlPath: string, res: ServerResponse): Promise<void> {
  let filePath = resolveStaticPath(distDir, urlPath);
  try {
    if ((await stat(filePath)).isDirectory()) filePath = join(filePath, "index.html");
  } catch {
    filePath = join(distDir, "index.html"); // SPA fallback for client-side routes
  }
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { "content-type": MIME[extname(filePath)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}

/**
 * Wrap the backend's base listener (`/health` + tRPC-at-root, from
 * `createBackend`) into a full same-origin app server: `/health` and `/api/*` go
 * to the backend (the `/api` prefix is stripped so procedures resolve at the tRPC
 * root), GET/HEAD elsewhere serve the built SPA from `distDir` (client-side
 * routes fall back to index.html), other methods get 405. Both the deployed
 * container (via `main.ts` when `DASHBOARD_DIST` is set) and the Electron shell
 * mount this, so the SPA's relative `/api` is same-origin — no CORS, no baked-in
 * API URL. In dev the SPA is served by Vite instead, which proxies `/api`.
 */
export function withSpa(base: RequestListener, distDir: string): RequestListener {
  return (req, res) => {
    const url = req.url ?? "/";
    if (url === "/health") {
      base(req, res); // the backend handler owns /health (204)
      return;
    }
    if (url === "/api" || url.startsWith("/api/") || url.startsWith("/api?")) {
      req.url = url.slice("/api".length) || "/"; // strip the mount prefix, then route tRPC
      base(req, res);
      return;
    }
    if (req.method === "GET" || req.method === "HEAD") {
      void serveStatic(distDir, url, res);
      return;
    }
    res.writeHead(405).end("method not allowed");
  };
}
