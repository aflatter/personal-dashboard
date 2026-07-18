// Stages the self-contained resources the packaged .app ships (run before
// electron-builder — `pnpm package` chains both):
//
//   .build/resources/collector/        pnpm-deployed collector: src/ (.ts, run
//                                      by Electron's Node via type-stripping —
//                                      no build) + a flat, symlink-free
//                                      node_modules incl. the secretspec
//                                      darwin-arm64 N-API .node
//   .build/resources/dist/             the SPA production build
//   .build/resources/secretspec.toml   secret declarations (SECRETSPEC_PATH
//                                      target — the deployed tree's relative
//                                      default would point outside Resources)
//
// The deploy uses --legacy --config.node-linker=hoisted (learned in the Tauri
// spike): flat and symlink-free so the tree survives being copied into an .app
// bundle. Unlike Tauri there is NO Node runtime to ship — the collector runs
// on Electron's own Node in the main process.
//
// Run from inside `devenv shell` (needs pnpm + vp): node scripts/stage-resources.ts

import { execFileSync } from "node:child_process";
import { cpSync, copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, "..");
const repoRoot = resolve(appDir, "../..");
const resourcesDir = resolve(appDir, ".build/resources");
const collectorOut = resolve(resourcesDir, "collector");

const run = (cmd: string, args: string[], cwd: string) =>
  execFileSync(cmd, args, { stdio: "inherit", cwd });

console.log("▶ staging packaged-app resources\n");

// Clean staging so pnpm deploy gets an empty target.
rmSync(resourcesDir, { recursive: true, force: true });
mkdirSync(resourcesDir, { recursive: true });

// 1. Self-contained collector: production deps only, flat/hoisted node_modules.
console.log("▶ pnpm deploy (collector, --prod, hoisted)…");
run(
  "pnpm",
  [
    "--filter",
    "@dash/collector",
    "--legacy",
    "--config.node-linker=hoisted",
    "deploy",
    "--prod",
    collectorOut,
  ],
  repoRoot,
);
const addon = resolve(
  collectorOut,
  "node_modules/secretspec-darwin-arm64/secretspec.darwin-arm64.node",
);
if (!existsSync(addon)) throw new Error(`native addon missing from deploy: ${addon}`);
console.log("▶ deployed collector OK (secretspec .node present)");

// 2. SPA production build → resources/dist.
console.log("▶ building SPA…");
run("./node_modules/.bin/vp", ["build", "packages/dashboard"], repoRoot);
cpSync(resolve(repoRoot, "packages/dashboard/dist"), resolve(resourcesDir, "dist"), {
  recursive: true,
});

// 3. Secret declarations.
copyFileSync(resolve(repoRoot, "secretspec.toml"), resolve(resourcesDir, "secretspec.toml"));

console.log("\n✓ resources staged in .build/resources\n");
