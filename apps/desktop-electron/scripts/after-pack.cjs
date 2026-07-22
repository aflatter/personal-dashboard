// electron-builder afterPack hook (CJS — builder require()s it; the package is
// otherwise ESM/TS). Pure sanity assertion, no copying.
//
// The app's entire payload is the bundled main process + preload (built by
// scripts/stage-resources.ts). Two things can silently go wrong and both produce
// an app that only fails at launch, so assert them here instead:
//
//   1. The bundle is missing from the .app — a files-glob or extraMetadata.main
//      typo leaves Electron with no entry point.
//   2. TypeScript ends up inside the bundle's directory — meaning something
//      started shipping raw sources again. Node refuses to strip types under
//      node_modules (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING), which is the
//      failure that motivated bundling in the first place.
const { existsSync, readdirSync } = require("node:fs");
const path = require("node:path");

module.exports = async function afterPack(context) {
  const app = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    "Contents/Resources",
  );
  // asar: true packs app/ into app.asar; the unpacked layout is kept working too
  // so toggling asar off for debugging doesn't trip this hook.
  const packed = path.join(app, "app.asar");
  const appDir = path.join(app, "app");
  if (!existsSync(packed) && !existsSync(appDir))
    throw new Error(`afterPack: no app payload at ${packed} or ${appDir}`);

  if (existsSync(appDir)) {
    const bundle = path.join(appDir, ".build/app/main.js");
    if (!existsSync(bundle)) throw new Error(`afterPack: main bundle missing at ${bundle}`);
    const stray = findTs(appDir);
    if (stray) throw new Error(`afterPack: raw TypeScript shipped in the app: ${stray}`);
  }

  // The serving half belongs in k3s, never in the .app (briefing §7.3).
  const backend = path.join(app, "backend");
  if (existsSync(backend))
    throw new Error(`afterPack: backend tree shipped into the app at ${backend}`);

  console.log("  • afterPack: payload is the bundled agent only (no backend, no raw TypeScript)");
};

function findTs(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const hit = findTs(child);
      if (hit) return hit;
    } else if (entry.name.endsWith(".ts")) return child;
  }
  return null;
}
