// Feasibility probe — runs in Electron's MAIN process (which IS Node).
//
// Proves the two risky assumptions before any UI work:
//   1. node:sqlite is present in Electron's bundled Node.
//   2. the prebuilt secretspec darwin-arm64 N-API addon dlopens under Electron.
// Plus the TypeScript story: this file is itself TypeScript run by Electron with
// zero build (Node 24 type-stripping), and it imports the collector's .ts
// sources directly.
//
// Run:  cd apps/desktop-electron && pnpm probe   (i.e. `electron src/probe.ts`)
// It prints a JSON report, then exits 0 (all critical checks passed) or 1.

import { app } from "electron";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, "..");
const repoRoot = resolve(appDir, "../..");
// Resolve the collector's runtime deps the way the collector itself does: from
// the collector package (pnpm places `secretspec` under packages/collector/
// node_modules, not the repo root). Node resolution is location-based, so
// importing the collector .ts sources resolves their deps there too.
const collectorRequire = createRequire(resolve(repoRoot, "packages/collector/package.json"));

interface Check {
  ok: boolean;
  detail?: unknown;
  error?: string;
}
const report: {
  versions: Record<string, string | undefined>;
  checks: Record<string, Check>;
  summary?: { allCriticalOk: boolean; tsStripWorks: boolean };
} = { versions: {}, checks: {} };

const record = (name: string, fn: () => unknown): void => {
  try {
    report.checks[name] = { ok: true, detail: fn() };
  } catch (err) {
    report.checks[name] = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
};
const recordAsync = async (name: string, fn: () => Promise<unknown>): Promise<void> => {
  try {
    report.checks[name] = { ok: true, detail: await fn() };
  } catch (err) {
    report.checks[name] = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
};

async function run(): Promise<void> {
  // --- Environment ----------------------------------------------------------
  report.versions = {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    v8: process.versions.v8,
    modules: process.versions.modules, // N-API is ABI-stable regardless of this
    openssl: process.versions.openssl,
    arch: process.arch,
    platform: process.platform,
  };

  // --- 1. node:sqlite -------------------------------------------------------
  record("node:sqlite", () => {
    const { DatabaseSync } = collectorRequire("node:sqlite");
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE t(a INTEGER, b TEXT)");
    db.prepare("INSERT INTO t VALUES(?, ?)").run(42, "hello");
    const row = db.prepare("SELECT a, b FROM t WHERE a = ?").get(42);
    db.close();
    if (row.a !== 42 || row.b !== "hello") throw new Error("roundtrip mismatch");
    return { roundtrip: row };
  });

  // --- 2. secretspec N-API addon --------------------------------------------
  record("secretspec-addon-load", () => {
    // require("secretspec") loads the SDK, whose index.js require()s the platform
    // package `secretspec-darwin-arm64` → dlopen of the prebuilt N-API .node. An
    // ABI mismatch (missing electron-rebuild) would throw right here.
    const sdkPath = collectorRequire.resolve("secretspec");
    const mod = collectorRequire("secretspec");
    if (typeof mod.SecretSpec?.builder !== "function") {
      throw new Error(`SecretSpec.builder is ${typeof mod.SecretSpec?.builder}, not function`);
    }
    const builder = mod.SecretSpec.builder(); // force the addon's native fns to bind
    return {
      sdk: sdkPath.replace(repoRoot, "<repoRoot>"),
      exports: Object.keys(mod),
      builder: typeof builder,
      abiModules: process.versions.modules,
    };
  });

  // --- 3. TypeScript: import the collector's .ts source directly -------------
  // Exercises type-stripping AND node:sqlite AND collector reuse: db.ts is
  // TypeScript and imports node:sqlite at module top.
  const dbTsUrl = pathToFileURL(resolve(repoRoot, "packages/collector/src/store/db.ts")).href;
  await recordAsync("ts-strip-direct-import", async () => {
    const { Db } = await import(dbTsUrl);
    const db = new Db(":memory:");
    const empty = db.isEmpty();
    db.putSettings({ hello: "welt" });
    return {
      imported: "packages/collector/src/store/db.ts",
      isEmpty: empty,
      settings: db.getSettings(),
    };
  });

  // --- 4. Collector graceful-degrade path (secrets absent is fine) ----------
  // Force the non-interactive `env` provider so the probe never triggers a live
  // 1Password auth prompt (which would block a headless run).
  process.env.SECRETSPEC_PROVIDER ||= "env";
  const secretsTsUrl = pathToFileURL(resolve(repoRoot, "packages/collector/src/secrets.ts")).href;
  await recordAsync("collector-loadSecrets", async () => {
    const { loadSecrets } = await import(secretsTsUrl);
    const secrets = await loadSecrets();
    return { type: typeof secrets, keys: Object.keys(secrets) };
  });

  // --- Summary --------------------------------------------------------------
  const critical = ["node:sqlite", "secretspec-addon-load"];
  const allCriticalOk = critical.every((c) => report.checks[c]?.ok);
  report.summary = { allCriticalOk, tsStripWorks: !!report.checks["ts-strip-direct-import"]?.ok };

  console.log("\n===PROBE_REPORT_START===");
  console.log(JSON.stringify(report, null, 2));
  console.log("===PROBE_REPORT_END===\n");

  app.exit(allCriticalOk ? 0 : 1);
}

// Run after ready — do NOT top-level-await whenReady() in an ESM main entry:
// the module loader would deadlock (whenReady resolves only once the entry
// module finishes evaluating).
app.whenReady().then(run);
