// Boots the backend IN-PROCESS inside Electron's main process.
//
// The whole point of Electron over Tauri: the main process IS Node, so we run
// the backend on Electron's bundled Node (24.x) instead of shipping a separate
// Node runtime as a sidecar. Electron's Node type-strips the backend's .ts
// sources directly.
//
// The backend lives at a different place per mode — the workspace package in
// dev, the pnpm-deployed tree under Contents/Resources in the packaged .app —
// so it is imported dynamically from opts.backendDir. It exposes a single
// embedder entry (`createHostListener`): secrets + backend composition + the
// same-origin SPA server, which is the exact server the deployed container
// mounts. Importing one module (rather than backend.ts / app-server.ts /
// @dash/collector/secrets separately) keeps the deployed tree's internal
// layout — where @dash/collector resolves through its own node_modules — an
// implementation detail the shell never has to know. The `typeof import` type
// is erased at runtime (the ../../../ specifier need not exist in the packaged
// app) but gives the dev workspace full type checking.
//
// The renderer loads http://127.0.0.1:<port>/ and the SPA's relative "/api" is
// same-origin — no CORS, no port baked into the client, no VITE_API_URL.
//
// No sidecar => no orphan-on-quit => no parent-death watchdog. The backend is
// this process; it dies exactly when the app does.

import { createServer } from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

type HostModule = typeof import("../../../packages/backend/src/host.ts");

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
  /** Directory of the backend package (contains src/ and node_modules). */
  backendDir: string;
}

/** Start the in-process backend + static SPA server on one loopback origin. */
export async function startCollectorHost(opts: CollectorHostOptions): Promise<CollectorHost> {
  const { host = "127.0.0.1", port = 4390, dbPath, distDir, backendDir } = opts;

  const hostModuleUrl = pathToFileURL(join(backendDir, "src/host.ts")).href;
  const { createHostListener } = (await import(hostModuleUrl)) as HostModule;

  const server = createServer(createHostListener({ dbPath, distDir }));

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
