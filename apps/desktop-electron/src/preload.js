// Minimal preload — deliberately plain CommonJS .js.
//
// A sandboxed preload (sandbox: true) is loaded by Electron's own CJS mechanism,
// not Node's type-stripping ESM loader, so it can't be raw .ts/ESM without a
// transpile step. This file exposes almost nothing, so we keep it as one small
// JS file rather than adding a build step just for it. contextIsolation stays
// on, nodeIntegration stays off: the renderer has no Node, no require, no ipc
// beyond what we deliberately expose here.
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
  },
});
