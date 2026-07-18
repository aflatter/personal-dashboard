# Electron packaging spike — evaluation

Spike goal: would shipping the dashboard SPA + Node collector as one **Electron**
app be _easier_ than the **Tauri v2** approach we already prototyped
(`apps/desktop/`, branch `claude/pensive-carson-d28647`)? The Electron hypothesis:
its main process **is** Node, so the collector runs **in-process** — no separate
Node runtime to ship, no `/nix/store` GC hazard, no sidecar orphan.

Scope: macOS (Apple Silicon), "runs & evaluated" (no signing/notarization).
Compared against the Tauri baseline documented in `apps/desktop/EVALUATION.md`.

## What was built

`apps/desktop-electron/` — kept **outside** `packages/*` (pnpm ignores it) and
installed with `pnpm install --ignore-workspace`, so Electron never touches the
root lockfile or the workspace's platform bindings. **The whole app is
TypeScript** (see "TypeScript everywhere" below), typechecked by its own
`tsconfig.json` mirroring the collector's.

- `src/probe.ts` — a main-process **feasibility probe** that asserts the two
  risky facts and the TypeScript story, then exits 0/1. This is the load-bearing
  artifact; its output is quoted below.
- `src/collector-host.ts` — boots the collector **in-process** by importing its
  real modules (`router.ts`, `store/db.ts`, `secrets.ts`, `seed.ts`,
  `scheduler.ts`, `sources/index.ts`) **by path** and standing up the same
  loopback HTTP server `collector/src/main.ts` uses — plus static SPA serving.
- `src/main.ts` + `src/preload.ts` — the Electron host: boot the collector, wait
  for `/health`, open a hardened `BrowserWindow` on the loopback origin.

**Zero changes to `packages/*`.** The collector and SPA are reused byte-for-byte
(see "Architecture" — the same-origin trick removes the CORS/`VITE_API_URL`
edits Tauri needed). Project checks stay green: typecheck 2/2, lint clean,
**51 tests** (17 collector + 34 dashboard); the app's own `tsc --noEmit` is clean.

## The two facts that decide feasibility — both verified

Pinned **Electron 43.1.1**. Verified empirically by running the probe _inside
Electron's main process_ (not from memory):

```
electron 43.1.1 · node 24.18.0 · chromium 150 · modules(ABI) 148 · arm64
node:sqlite ................ ok   { roundtrip: { a: 42, b: "hello" } }
secretspec-addon-load ...... ok   loaded secretspec + darwin-arm64 .node, no rebuild
ts-strip-direct-import ..... ok   imported collector/src/store/db.ts unmodified
collector-loadSecrets ...... ok   returns {} gracefully (env provider, no secret)
summary .................... allCriticalOk: true, tsStripWorks: true
```

### 1. `node:sqlite` — present ✅ (pin Electron ≥ 35, ideally ≥ 40)

`node:sqlite` landed in Node **22.5.0**. From Electron's `DEPS` files, the
authoritative Electron→Node map:

| Electron            | Node      | `node:sqlite` | Type-strip default |
| ------------------- | --------- | ------------- | ------------------ |
| 35.x                | 22.14     | ✅            | ❌ (needs a flag)  |
| 37.x                | 22.16     | ✅            | ❌                 |
| 40.0                | 24.11     | ✅            | ✅ (Node ≥ 23.6)   |
| **43.1.1 (latest)** | **24.18** | ✅            | ✅                 |

The probe created a `DatabaseSync(":memory:")`, wrote, and read it back under
Electron 43. **Node 24.18 is the sweet spot** — it has `node:sqlite` _and_
default type-stripping (next point), and is close to dev's Node 26. Pin **≥ 40**
to get Node 24; below that you keep sqlite but lose the no-build TS story.

### 2. `secretspec` N-API addon — loads with **no** `electron-rebuild` ✅

`secretspec` is a **napi-rs (N-API)** addon. N-API is ABI-stable _across Node and
Electron versions_, so a prebuilt `.node` is not tied to Electron's `modules` ABI
(148 here). The probe `require("secretspec")` → the SDK's `index.js`
`require("secretspec-darwin-arm64")` → **`dlopen` of the prebuilt
`secretspec.darwin-arm64.node` succeeded** and `SecretSpec.builder()` bound. No
`electron-rebuild`, no `@electron/rebuild`, no native toolchain at package time.

> Caveat worth recording: this holds **because** secretspec is N-API. A classic
> NAN / V8-ABI addon _would_ need `electron-rebuild` per Electron version. Our
> one native dep happens to be on the friendly side of that line.

### 3. TypeScript — the collector runs **unbuilt**, same as today ✅

Node strips inline types by default from **23.6+**; Electron 43's Node 24.18
inherits that. The probe imported `collector/src/store/db.ts` **directly** and
ran it; `collector-host.ts` then imported the _entire_ collector graph (router →
zod, contract, state, all sources, scheduler, sampler) the same way and it
booted. The collector is already written in erasable-TS style (explicit `.ts`
import specifiers, no `enum`/`namespace`/decorators/param-properties — it has to
be, to run on Node 26 in `devenv up`), so type-stripping needs **no transpile
step**. This is a real win over Tauri, where nothing changed on this axis but the
option of a build step still loomed; here the delta vs today's no-build collector
is **zero**.

> If a future Electron pin dropped below Node 23.6, this reverses: you'd add an
> esbuild/tsdown pre-bundle (a `scripts/build-collector.mjs`, ~20 lines) or a
> `--import` TS loader. Pinning Node 24 avoids it entirely.

## TypeScript everywhere — including the Electron layer (verified)

The renderer (SPA) and collector are already TS. The open question was the
Electron layer itself. Tested empirically on Electron 43; the answer is **yes,
with one small asterisk for the sandboxed preload**:

| Layer                               | TypeScript?         | How                                                                   | Build step           |
| ----------------------------------- | ------------------- | --------------------------------------------------------------------- | -------------------- |
| Renderer / SPA                      | ✅ already          | Vite                                                                  | (existing SPA build) |
| Collector                           | ✅ already          | Node 24 type-strip                                                    | **none**             |
| **Main entry** (`main.ts`)          | ✅                  | Electron routes the `main` entry through Node's type-stripping loader | **none**             |
| **`collector-host.ts`, `probe.ts`** | ✅                  | imported with `.ts` specifiers, type-stripped                         | **none**             |
| **Preload** (`preload.js`)          | plain CJS by choice | see asterisk ↓                                                        | **none** (kept JS)   |

- **Electron's `main` entry can be a raw `.ts` file.** Verified: with
  `"main": "src/main.ts"` and `"type": "module"`, Electron loaded a `.ts` entry
  using `import type` and annotations and ran it — no build, no loader flag. So
  `main.ts` / `collector-host.ts` / `probe.ts` are all no-build TypeScript, using
  explicit `.ts` import specifiers exactly like the collector.
- **The preload is the asterisk.** A **sandboxed** preload (`sandbox: true`) is
  loaded by Electron's _own_ CommonJS mechanism, **not** Node's type-stripping
  ESM loader. Verified both ways on Electron 43:
  - `sandbox: true` + `.ts`/ESM preload → **fails**: `Cannot use import
statement outside a module` (no type-strip, no ESM there).
  - `sandbox: false` + `.ts` preload → **works** (Node loads it → type-stripped).

  **Decision: keep `preload.js` as plain CJS** and keep `sandbox: true`. The file
  exposes almost nothing (a read-only version marker), so one small JS file is a
  defensible line to draw rather than adding a transpile step just for it.
  Verified: the plain-JS preload runs under `sandbox: true` and exposes its
  `contextBridge` value. (If you ever want it in TS too, the standard move is one
  `esbuild.transform` of `preload.ts` → CJS in the `electron-builder` pipeline —
  electron-vite/forge do exactly this; or drop to `sandbox: false` to run raw
  `.ts`, which weakens the sandbox and isn't worth it.)

- **Typechecking:** `tsconfig.json` mirrors the collector's (`strict`,
  `verbatimModuleSyntax`, `allowImportingTsExtensions`, `noEmit`); Electron ships
  its own `.d.ts`, plus `@types/node`. `pnpm typecheck` (`tsc --noEmit`) is clean.

Net: the desktop app is TypeScript except the tiny sandboxed preload (kept as
plain CJS by choice), and **every layer needs zero build** — the collector, the
main entry, and the host modules all run straight off `.ts` via type-stripping.

## Architecture — lowest-friction reuse (the clean part)

The collector stays the **source of truth**; no data logic moved into the SPA.
Three transport options were considered:

1. **Loopback tRPC + second origin + CORS** — the literal Tauri port. Works, but
   needs the collector's loopback-CORS patch _and_ the SPA's `VITE_API_URL`
   edit, because the webview origin (`tauri://localhost` / `file://` / `app://`)
   differs from `http://127.0.0.1`.
2. **Same-origin loopback (chosen).** Serve the SPA build **and** mount tRPC at
   `/api` from _one_ in-process loopback server. The renderer loads
   `http://127.0.0.1:4319/`; the SPA's existing `httpBatchLink({ url: "/api" })`
   is now same-origin. Result: **no CORS, no port in the client, no
   `VITE_API_URL`, no shared-code edits at all.** Electron can do this precisely
   because the server lives in its own process — Tauri's sidecar could too in
   principle, but Electron makes it the path of least resistance.
3. **electron-trpc / IPC (no HTTP at all).** Swap the client's `httpBatchLink`
   for an IPC link over a preload bridge; drops the port entirely. Cleanest
   runtime, but it _does_ change the SPA's transport and adds preload plumbing —
   more friction than #2 for no user-visible gain here. Worth it only if you want
   to guarantee nothing ever listens on a TCP port.

**Recommendation: ship #2.** It's the least code and keeps both the collector's
"tRPC server" contract and the SPA's "typed HTTP client" contract untouched. Keep
#3 in the back pocket if a listening loopback port is ever undesirable.

## Lifecycle — dies with the app, no watchdog needed ✅

The single biggest Tauri pain simply **doesn't exist** here. Tauri's collector was
a separate OS process that **orphaned** on `NSApplication terminate` / `SIGKILL`,
forcing an env-gated **parent-death watchdog** in the collector. In Electron the
collector _is_ the main process. Verified: `kill -9` of the Electron main process
**freed port 4319 immediately** — the listener died with the process. No
`ExitRequested` handler, no `COLLECTOR_EXIT_WITH_PARENT`, no reparent-watch, no
rapid-restart port race. `main.ts` still calls `server.close()` on `will-quit`
for tidy graceful exits, but correctness doesn't depend on it.

## Security

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; the renderer
gets Node-nothing. The SPA needs no Node (it's a tRPC-over-HTTP client), so the
preload bridge exposes only a trivial read-only marker. The larger attack surface
vs Tauri is **Chromium itself** (a full browser engine to keep patched) rather
than any renderer capability we granted — mitigated by tracking Electron's ~8-week
security releases. Loopback (`127.0.0.1`) is a Chromium secure context, so no
mixed-content/secure-context friction.

## Packaging — comparable size, simpler toolchain

- **Tooling: electron-builder** (recommended over electron-forge for this).
  builder gives one-shot **DMG + code-sign + notarize + auto-update (Squirrel.Mac
  / `electron-updater`)** from a single `electron-builder.yml`. Effort is on par
  with `cargo tauri build` — arguably lower, since signing/notarization are
  first-class config rather than bolt-ons.
- **Native addon in the bundle:** builder's `asarUnpack` must keep
  `secretspec*/**/*.node` **unpacked** (a `.node` must be a real file for
  `dlopen`) and include the collector's `node_modules`. This is the Electron
  analogue of Tauri's `pnpm deploy` staging — but you _keep the `.ts` sources_
  (no deploy transpile) and reuse Electron's Node, so there's **no separate Node
  binary to fetch/verify/relink** (Tauri's official-nodejs.org dance disappears).
- **Signing/notarization:** unchanged Apple requirements (Developer ID, hardened
  runtime, `--options runtime`, staple). `@electron/notarize` is wired into
  builder. Same work as Tauri; neither is free.
- **Bundle size:** the Electron framework here measures **276 MB unpacked**; a
  pruned, `asar`-packed production build lands ≈ **200–250 MB** — _comparable to
  Tauri's measured 205 MB_, because Tauri's number already includes a full
  shipped Node runtime + the deployed collector tree. Chromium is bigger than
  system WebKit, but Tauri paid most of that back by shipping Node. **Size is
  roughly a wash; it is not a deciding factor.**
- **Auto-update:** `electron-updater` (S3/GitHub/generic feed) is turnkey. Tauri
  has an updater plugin too, but Electron's is more mature.

## devenv / nix fit

- **Drops the whole Rust toolchain.** The Tauri spike added `languages.rust` +
  `cargo-tauri` + `pkg-config` + `libiconv` to `devenv.nix`. Electron needs
  **none of it** — it's a single npm devDependency. `devenv.nix` stays as-is.
- **No `electron-rebuild` step** (N-API, per fact #2), so no native compiler
  needed at install for our deps.
- **The one impurity: Electron fetches a prebuilt Chromium** zip on install
  (from GitHub releases). In this spike pnpm's build-script gate skipped it and I
  ran `node node_modules/electron/install.js` once; it caches under
  `~/Library/Caches/electron`. For a devenv-clean setup, either (a) allow the
  postinstall and rely on the cache, (b) set `ELECTRON_MIRROR` to an internal
  cache, or (c) use nixpkgs' prebuilt `electron` and point
  `ELECTRON_OVERRIDE_DIST_PATH` at it (fully offline). This is _less_ nix-hostile
  than Tauri's release build (which fights the sandbox over the macOS SDK/WebKit
  link + cargo network fetch); a nix **output** that produces the signed `.app`
  is not worth it for either — `electron-builder` (like `cargo tauri build`) is
  the supported path, run from within `devenv shell`.
- **`node:sqlite` needs no dep at all** (built into Electron's Node), unlike a
  `better-sqlite3` that _would_ drag in `electron-rebuild`.

## MoneyMoney JXA — unchanged ✅

`moneymoney.ts` shells `osascript` via `node:child_process` and reduces to a
single integer at the boundary. That runs in Electron's **main** process exactly
as in the collector today — the on-demand `syncBank` gesture still fires the macOS
Automation/TCC prompt only when the user clicks ↺. No change, no new surface.

## Desktop-shell duties: login item + bank staleness reminder

The shell carries two duties beyond showing the SPA (both in `main.ts`):

- **Start at login** — `app.setLoginItemSettings({ openAtLogin: true })`, gated on
  `app.isPackaged` (a dev run would register the bare node_modules Electron
  binary). Appears under System Settings → General → Login Items; needs the
  packaged `.app` to be meaningful, so it's dormant in the spike.
- **Bank staleness reminder** — if `bank.syncedAt` is more than **3 days** old
  (or null), post a German macOS notification ("MoneyMoney-Daten veraltet …"),
  at most **once a day** (throttle persisted in `userData/bank-reminder.json`,
  so restarts don't re-nag). Checked at boot, hourly, and on `powerMonitor`
  resume (laptops sleep through timers). Clicking the notification focuses (or
  recreates) the window. Verified: stale seeded data fires the notification and
  writes the throttle file; an immediate second launch stays silent.

Design decisions worth keeping:

- **Remind, don't auto-sync.** The sync stays the bank card's ↺ gesture, so the
  macOS Automation/TCC prompt never fires unattended (AGENTS.md: the gesture is
  the opt-in). The shell only nudges.
- **Phase-agnostic staleness check.** It reads `bank.syncedAt` from the same
  `/api/state` the SPA consumes, against whatever origin the shell points at —
  the in-process collector today, a remote hub after a hub-and-spoke split. The
  mechanism survives that migration unchanged (only the base URL moves).
- **The app now outlives its window** (macOS convention: window-close keeps the
  dock icon + reminder timer; Cmd-Q quits) — quitting on close would silently
  disable the reminder duty. A single-instance lock stops a second launch from
  fighting over the port and double-notifying; it focuses the existing window
  instead.
- Thresholds: the reminder (3 d) deliberately fires before the bank card turns
  amber (`BANK_STALE_AFTER` = 7 d) — nudge first, escalate visually later. Both
  are env-overridable for testing (`BANK_REMIND_AFTER_MS`, `BANK_REMIND_CHECK_MS`,
  `BANK_REMIND_NAG_MS`).

## Notable gotcha (recorded so the next person doesn't lose an hour)

**Do not top-level-`await app.whenReady()` in an ESM main entry.** With
`"type": "module"`, `await app.whenReady()` at module top **deadlocks**:
`whenReady` resolves only after the entry module finishes evaluating, but the
top-level await pauses that evaluation. Symptom: the app launches, shows no
window, prints nothing, never exits. Fix: run your logic in
`app.whenReady().then(fn)` (see `probe.ts` / `main.ts`). The trivial CJS form
(`.then`) never hits this.

## Electron vs Tauri — head to head (for THIS project)

| Dimension              | Tauri v2 (baseline)                                | Electron 43 (this spike)                   |
| ---------------------- | -------------------------------------------------- | ------------------------------------------ |
| Collector runtime      | **Separate Node sidecar** you build + ship         | **In-process** on Electron's Node 24.18    |
| Ship a Node binary?    | Yes — official nodejs.org build, checksum-verified | **No** — reuse Electron's                  |
| `/nix/store` GC hazard | Real (why we ship official Node)                   | **Gone** — no shipped Node                 |
| `node:sqlite`          | via shipped Node 26                                | via Electron's Node 24.18 ✅               |
| `secretspec` `.node`   | ships in `pnpm deploy` tree                        | loads in-process, **no rebuild** ✅        |
| TypeScript             | no build (Node 26)                                 | **no build** (Node 24 strip) ✅            |
| Sidecar orphan on quit | needed a **parent-death watchdog**                 | **N/A** — dies with app ✅                 |
| CORS / API base URL    | loopback CORS + `VITE_API_URL` edits               | **none** (same-origin) ✅                  |
| Shared-code changes    | collector CORS + SPA base-URL                      | **zero** ✅                                |
| Toolchain in devenv    | + Rust + cargo-tauri + pkg-config + libiconv       | **just an npm dep** ✅                     |
| Renderer engine        | system WKWebView (smaller, less to patch)          | bundled Chromium (bigger surface) ⚠️       |
| Bundle size (measured) | 205 MB                                             | ≈ 200–250 MB (framework 276 MB unpacked) ≈ |
| Signing / notarization | `cargo tauri` + manual                             | `electron-builder` first-class             |

## Verdict — Electron is the easier ship for this macOS-only project

Every Tauri pain point the hypothesis targeted **evaporated**, and it cost **zero
changes to `packages/*`**:

- No separate Node runtime → no official-node fetch/checksum/`otool` relink, and
  the entire `/nix/store` hard-link GC hazard is gone.
- The native `secretspec` addon loads in-process with **no `electron-rebuild`**
  (N-API), and `node:sqlite` is built in.
- The collector runs **unbuilt** on Electron's Node 24, same as Node 26 dev.
- The sidecar-orphan problem — the messiest part of the Tauri spike — **does not
  exist**; no watchdog, verified by `SIGKILL` freeing the port.
- Same-origin loopback means **no CORS and no `VITE_API_URL`** — the collector and
  SPA are reused verbatim.
- `devenv.nix` sheds the whole Rust toolchain; Electron is one npm devDep.

The price is Chromium: a larger security surface to keep patched on Electron's
release cadence — but **not** a meaningful size regression (Tauri's 205 MB already
bought a full Node). For a **single-user, macOS-only, personal** dashboard, that
trade strongly favors Electron.

**Recommendation: build the desktop app on Electron (pin ≥ 40 for Node 24; 43.1.1
today), using the same-origin loopback architecture and `electron-builder` for
signing/notarization/auto-update — run from within `devenv shell`, no nix output
for the `.app`.** The only remaining work for a real distributable, none blocking:
`asarUnpack` for the `.node`, and Developer-ID signing + notarization.

## How to run

```sh
devenv shell                                   # node 26 + pnpm (no Rust needed)
cd apps/desktop-electron && pnpm install --ignore-workspace
node node_modules/electron/install.js          # fetch prebuilt Chromium (once, cached)

pnpm typecheck                                 # tsc --noEmit — the app is all TypeScript

# Prove the risky assumptions (runs the .ts probe, prints JSON, exits 0):
SECRETSPEC_PROVIDER=env pnpm probe

# Build the SPA (vp direct — pnpm script trips verify-deps in non-TTY), then run:
(cd ../.. && ./node_modules/.bin/vp build packages/dashboard)
pnpm start                                     # boots collector in-process, opens the window
```

`pnpm probe` / `pnpm start` run `electron src/probe.ts` / `electron .` (main is
`src/main.ts`) — Electron type-strips them directly; the sandboxed preload is the
only file transpiled (one esbuild call at boot).

The window loads `http://127.0.0.1:4390/` (4390, not 4319 — devenv up allocates
the dev collector's port from 4319 upward, so the shell binds elsewhere to
coexist with a dev session); the collector seeds SQLite into
`~/Library/Application Support/@dash/desktop-electron/collector.db`, serves the
SPA and tRPC from that one origin. As with the Tauri spike, rendered pixels aren't
captured here (automation lacks macOS Screen-Recording/TCC), so verification is
via loopback + logs: `/health` → 204, `/` → the German SPA, `/api/state` → real
seeded tRPC data, and a sandboxed `--lang=de` renderer process confirms the window
loaded. Run it interactively to see the window.
