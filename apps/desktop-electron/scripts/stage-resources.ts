// Builds what the packaged .app ships (run before electron-builder — `pnpm
// package` chains both):
//
//   .build/app/main.js       the Electron main process, bundled to one ESM file
//   .build/app/preload.js    copied verbatim (plain CJS, loaded by Electron's
//                            own CJS loader, so it is never bundled)
//   .build/app/offline.html  the local "backend not reachable" page
//
// That is the whole payload. The app is an *agent*: it collects MoneyMoney on
// this Mac and pushes it to the backend in k3s, which serves the SPA and owns the
// store (docs/multi-device-sync-briefing.md §7.3). Nothing of the serving half —
// no collector deps, no SPA build, no sqlite, no secretspec — belongs here.
//
// Why bundle rather than ship .ts and let Electron's Node strip types, the way
// `pnpm start` runs in dev: main.ts imports `@dash/agent`, which imports
// `@dash/collector`, and *any* copy of those into the app would land under
// node_modules, where Node hard-refuses to strip types
// (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING — it works in dev only because
// pnpm's symlinks make the realpath land outside node_modules). Bundling to one
// JS file is both the standard Electron main-process shape and the thing that
// makes that failure structurally impossible. The bundle has no native modules
// and no runtime deps at all.
//
// Run from inside `devenv shell` (needs pnpm + vite): node scripts/stage-resources.ts

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, "..");
const repoRoot = resolve(appDir, "../..");
const outDir = resolve(appDir, ".build/app");

console.log("▶ building the packaged app's main process\n");

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// Bundled from the REPO ROOT, not from apps/desktop-electron, so that one
// resolution origin covers both `vp`'s own toolchain and the `@dash/*` sources
// the bundle inlines.
// Through `vp` (the workspace's toolchain) rather than a bare `vite` binary:
// vite is only a transitive dependency here, so its hoisted bin is not ours to
// rely on — `vp build` takes the same --config and is the project's declared
// build entry point.
console.log("▶ bundling src/main.ts → .build/app/main.js…");
execFileSync("./node_modules/.bin/vp", ["build", "--config", resolve(here, "vite.main.ts")], {
  stdio: "inherit",
  cwd: repoRoot,
});

const bundle = resolve(outDir, "main.js");
if (!existsSync(bundle)) throw new Error(`bundle missing: ${bundle}`);

// Plain CJS, loaded by Electron's preload mechanism rather than by Node's ESM
// loader — it must stay a standalone file next to main.js (main.ts resolves it
// relative to its own directory, which is true in dev and here alike).
copyFileSync(resolve(appDir, "src/preload.js"), resolve(outDir, "preload.js"));

// The offline page is loaded from disk by path, not imported, so it is copied
// rather than bundled — same reasoning as the preload.
copyFileSync(resolve(appDir, "src/offline.html"), resolve(outDir, "offline.html"));

console.log(`\n✓ .build/app ready (main.js ${(statSync(bundle).size / 1024).toFixed(0)} kB)\n`);
