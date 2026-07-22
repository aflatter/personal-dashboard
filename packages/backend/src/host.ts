import type { RequestListener } from "node:http";
import { loadSecrets } from "@dash/collector/secrets";
import { withSpa } from "./app-server.ts";
import { createBackend } from "./backend.ts";

export interface HostOptions {
  /** SQLite path. Seeded on first run when empty. */
  dbPath: string;
  /** Directory holding the built SPA, served same-origin. */
  distDir: string;
}

/**
 * One entry point for embedders that run the backend in-process — today the
 * Electron shell. It loads the secrets, composes the backend, and wraps it in
 * the same-origin SPA server, so the embedder needs a single import rather than
 * reaching into `backend.ts`, `app-server.ts` and `@dash/collector/secrets`
 * separately. That matters for the packaged .app, which imports this
 * dynamically out of a pnpm-deployed tree: `@dash/collector` then resolves
 * through that tree's own node_modules instead of a path the shell has to know.
 */
export function createHostListener(opts: HostOptions): RequestListener {
  const { handler } = createBackend({ dbPath: opts.dbPath, secrets: loadSecrets() });
  return withSpa(handler, opts.distDir);
}
