// Boots the backend IN-PROCESS inside Electron's main process.
//
// The whole point of Electron over Tauri: the main process IS Node, so we run
// the backend on Electron's bundled Node (24.x) instead of shipping a separate
// Node runtime as a sidecar. Composition comes from the backend's own
// createBackend() factory — statically imported (typed), no re-wiring of
// backend internals. Electron's Node type-strips the backend's .ts sources
// directly, and their deps resolve from the workspace's node_modules.
//
// Same-origin serving (SPA at /, tRPC at /api, /health) is the backend's own
// `withSpa` wrapper — the exact server the deployed container mounts — so the
// renderer loads http://127.0.0.1:<port>/ and the SPA's relative "/api" is
// same-origin (no CORS, no port baked into the client, no VITE_API_URL).
//
// No sidecar => no orphan-on-quit => no parent-death watchdog. The backend is
// this process; it dies exactly when the app does.

import { createServer } from "node:http";
import { withSpa } from "../../../packages/backend/src/app-server.ts";
import { createBackend } from "../../../packages/backend/src/backend.ts";
import { loadSecrets } from "../../../packages/collector/src/secrets.ts";

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
}

/** Start the in-process backend + static SPA server on one loopback origin. */
export async function startCollectorHost(opts: CollectorHostOptions): Promise<CollectorHost> {
  const { host = "127.0.0.1", port = 4390, dbPath, distDir } = opts;

  const { handler } = createBackend({ dbPath, secrets: loadSecrets() });
  const server = createServer(withSpa(handler, distDir));

  await new Promise<void>((res, rej) => {
    server.once("error", rej);
    server.listen(port, host, () => res());
  });
  const url = `http://${host}:${port}/`;
  console.log(`[backend] in-process on ${url} (tRPC at /api, SPA served from dist)`);

  return {
    url,
    port,
    close: () => new Promise<void>((res) => server.close(() => res())),
  };
}
