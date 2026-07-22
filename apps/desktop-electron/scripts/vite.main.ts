// Vite config for the Electron main-process bundle, run through the workspace's
// `vp` (see stage-resources.ts) — this app is outside the workspace and has no
// bundler of its own.
//
// One ESM file, no runtime dependencies: `@dash/agent` + `@dash/collector` are
// inlined from source, `electron` and the node: builtins stay external (the
// runtime provides them). Not minified — a packaged main process is not
// bandwidth-constrained, and readable stack traces are worth more here.
//
// Exported as a plain object rather than via vite's `defineConfig`: `vite` is not
// a direct dependency of this app *or* of the workspace root (it arrives under
// vite-plus), so importing it here would resolve only by accident.

import { builtinModules } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, "..");
const repoRoot = resolve(appDir, "../..");

export default {
  // Rooted at the repo, so the workspace's node_modules resolve while bundling
  // packages/agent + packages/collector (the app itself is installed with
  // --ignore-workspace and has no @dash deps of its own).
  root: repoRoot,
  build: {
    outDir: resolve(appDir, ".build/app"),
    emptyOutDir: false, // outside root, and the staging script clears it
    ssr: resolve(appDir, "src/main.ts"),
    target: "node22", // Electron 43 ships Node 24
    minify: false,
    sourcemap: true,
    rollupOptions: {
      external: ["electron", ...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
      output: { format: "es", entryFileNames: "main.js" },
    },
  },
  // Inline everything resolvable (chiefly @trpc/client) so the packaged app
  // needs no node_modules at all.
  ssr: { noExternal: true },
};
