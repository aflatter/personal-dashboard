// electron-builder afterPack hook (CJS — builder require()s it; the package is
// otherwise ESM/TS). Pure sanity assertion, no copying.
//
// The app's entire payload is the bundled main process + preload (built by
// scripts/stage-resources.ts). Two things can silently go wrong and both produce
// an app that only fails at launch — a packaged Electron app whose main entry
// fails to load shows a GUI dialog and prints nothing, so it is worth catching
// at build time instead:
//
//   1. The entry point named by the packaged package.json "main" is not actually
//      in the payload — a files-glob or extraMetadata.main typo leaves Electron
//      with no entry to run.
//   2. TypeScript ends up in the payload — meaning something started shipping raw
//      sources again. Node refuses to strip types under node_modules
//      (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING), which is the failure that
//      motivated bundling in the first place.
//
// Both layouts are checked through ONE assertion body: `asar: true` (what we
// ship) packs everything into app.asar, while `asar: false` leaves a plain app/
// directory that is occasionally useful for debugging. An earlier version of
// this hook gated its checks on the unpacked directory existing, which meant
// they silently did nothing in the configuration we actually ship — hence the
// deliberate symmetry below.
const asar = require("@electron/asar");
const { existsSync, readdirSync, readFileSync } = require("node:fs");
const path = require("node:path");

module.exports = async function afterPack(context) {
  const resources = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    "Contents/Resources",
  );
  const packed = path.join(resources, "app.asar");
  const unpacked = path.join(resources, "app");

  const payload = existsSync(packed)
    ? asarPayload(packed)
    : existsSync(unpacked)
      ? dirPayload(unpacked)
      : null;
  if (!payload) throw new Error(`afterPack: no app payload at ${packed} or ${unpacked}`);

  assertPayload(payload);

  // The serving half belongs in k3s, never in the .app (briefing §7.3).
  const backend = path.join(resources, "backend");
  if (existsSync(backend))
    throw new Error(`afterPack: backend tree shipped into the app at ${backend}`);

  console.log(
    `  • afterPack: ${payload.describe} — entry ${payload.entry} present, no raw TypeScript`,
  );
};

/**
 * A uniform view of the shipped payload, so the assertions below never have to
 * care which layout produced it. `files` are archive-absolute POSIX paths
 * ("/.build/app/main.js"), matching @electron/asar's own listing format.
 */
function asarPayload(archive) {
  const read = (file) => asar.extractFile(archive, file).toString("utf8");
  return {
    describe: path.basename(archive),
    files: asar.listPackage(archive, { isPack: false }),
    entry: mainField(read),
  };
}

function dirPayload(dir) {
  const read = (file) => readFileSync(path.join(dir, file), "utf8");
  return { describe: "unpacked app/ (asar: false)", files: listFiles(dir), entry: mainField(read) };
}

/** The entry point Electron will actually run, per the PACKAGED package.json. */
function mainField(read) {
  let pkg;
  try {
    pkg = JSON.parse(read("package.json"));
  } catch (err) {
    throw new Error(`afterPack: cannot read the packaged package.json (${err.message})`);
  }
  // electron-builder's extraMetadata.main repoints this at the bundle; without
  // it Electron falls back to index.js, which does not exist here.
  if (!pkg.main) throw new Error('afterPack: packaged package.json has no "main"');
  return pkg.main;
}

function assertPayload({ describe, files, entry }) {
  const present = new Set(files);
  if (!present.has(toArchivePath(entry)))
    throw new Error(`afterPack: entry "${entry}" missing from ${describe}`);

  const stray = files.find((file) => file.endsWith(".ts"));
  if (stray) throw new Error(`afterPack: raw TypeScript shipped in ${describe}: ${stray}`);
}

/** Normalise a package.json-relative path (".build/app/main.js") to "/.build/app/main.js". */
function toArchivePath(file) {
  return path.posix.join("/", file.replace(/^\.\//, ""));
}

/** Recursively list a directory as archive-absolute POSIX paths. */
function listFiles(root, prefix = "/") {
  const out = [];
  for (const entry of readdirSync(path.join(root, prefix), { withFileTypes: true })) {
    const child = path.posix.join(prefix, entry.name);
    out.push(child);
    if (entry.isDirectory()) out.push(...listFiles(root, child));
  }
  return out;
}
