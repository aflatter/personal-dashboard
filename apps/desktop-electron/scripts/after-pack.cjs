// electron-builder afterPack hook (CJS — builder require()s it; the package is
// otherwise ESM/TS).
//
// electron-builder silently drops node_modules from extraResources copies —
// even with an explicit `filter: ["**/*"]` — but the deployed collector's
// node_modules ARE the payload (its runtime deps, including the secretspec
// N-API .node, which must be a real file for dlopen). So the collector tree is
// copied here, after packing, instead of via extraResources.
const { cpSync, existsSync } = require("node:fs");
const path = require("node:path");

module.exports = async function afterPack(context) {
  const staged = path.resolve(__dirname, "../.build/resources/collector");
  const target = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    "Contents/Resources/collector",
  );
  cpSync(staged, target, { recursive: true });

  const addon = path.join(
    target,
    "node_modules/secretspec-darwin-arm64/secretspec.darwin-arm64.node",
  );
  if (!existsSync(addon)) throw new Error(`afterPack: native addon missing at ${addon}`);
  console.log("  • afterPack: deployed collector copied into Resources (node_modules intact)");
};
