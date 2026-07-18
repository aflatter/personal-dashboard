// electron-builder afterPack hook (CJS — builder require()s it; the package is
// otherwise ESM/TS). Pure sanity assertion, no copying: the collector ships via
// the extraResources fileset rooted at .build/resources — one level above the
// collector, because builder's copy filter (app-builder-lib util/filter.js)
// hard-rejects a node_modules at a fileset's ROOT while allowing nested ones.
// If someone re-roots that fileset at the collector dir, the deps (incl. the
// secretspec N-API .node, which must be a real file for dlopen) silently
// vanish — this assert turns that silent failure into a build error.
const { existsSync } = require("node:fs");
const path = require("node:path");

module.exports = async function afterPack(context) {
  const addon = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    "Contents/Resources/collector/node_modules/secretspec-darwin-arm64/secretspec.darwin-arm64.node",
  );
  if (!existsSync(addon)) throw new Error(`afterPack: native addon missing at ${addon}`);
  console.log("  • afterPack: collector node_modules shipped intact (secretspec .node present)");
};
