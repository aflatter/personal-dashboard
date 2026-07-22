// Electron main entry for the personal-dashboard Mac app (macOS-only).
//
// The Mac has two roles in one app (docs/multi-device-sync-briefing.md §7.3):
//
//   - Main process = the AGENT. Runs the MoneyMoney source — the one source that
//     can only be collected by a native Mac process — and PUSHES the result to
//     the backend over the tailnet. Push-only: it never serves, never subscribes
//     for commands, and holds no store. Triggered locally (the renderer's ↺ via
//     IPC), because the trigger is the only Mac-bound part; the value itself
//     reaches every device seconds later through the backend's live stream.
//   - Renderer = a thin PWA loader. Loads the *same* SPA the phone loads, from
//     the backend, so the Mac UI auto-updates with every deploy. The single
//     device-specific branch is the `window.dashboardAgent` preload bridge:
//     present here → the bank ↺ control is enabled; absent on the phone → hidden.
//
// The backend (collector, store, scheduler, SPA) runs in k3s and is deliberately
// NOT bundled here — per the briefing, "the Electron agent must not bundle the
// serving half". That keeps this app to one JS bundle with no native modules.
//
// This file is TypeScript: run directly by Electron's Node via type-stripping in
// dev (`pnpm start`), bundled to one .js for the packaged app (see
// scripts/stage-resources.ts). The one non-.ts file is preload.js (plain CJS) —
// a sandboxed preload is loaded by Electron's own CJS loader, not Node's ESM
// loader, and it exposes almost nothing, so it stays JS.
//
// Other desktop-shell duties:
//   - login item: packaged builds register themselves to start at login
//   - bank staleness reminder: if MoneyMoney data hasn't been synced for 3 days,
//     post a macOS notification (at most once a day). Reminder only — the sync
//     itself stays a deliberate user gesture (the bank card's ↺), so the macOS
//     Automation/TCC prompt never fires unattended.

import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { app, BrowserWindow, ipcMain, Notification, powerMonitor, shell } from "electron";
import type { BrowserWindow as BrowserWindowType } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AppRouter } from "@dash/backend";
import { bankCollector, bankPusher, createBankAgent } from "@dash/agent";
import type { BankAgent, RefreshResult } from "@dash/agent";
import { backendUrl, loadHostConfig } from "./host-config.ts";

const here = fileURLToPath(new URL(".", import.meta.url));
const preloadPath = resolve(here, "preload.js");
// Local fallback page for when the backend can't be reached. Like preload.js it
// is staged next to the bundle, so this one path is right in dev and packaged.
const offlinePath = resolve(here, "offline.html");
// Dev-only Dock icon. The packaged .app carries its icon in the bundle (the
// .icns wired via electron-builder.yml → mac.icon); a bare `pnpm start` runs the
// node_modules Electron binary, which would otherwise show the generic Electron
// tile. resources/ ships only in dev (not in the packaged files glob), hence the
// !app.isPackaged guard.
const devDockIcon = resolve(here, "../resources/icon/icon-512.png");

const config = loadHostConfig();
const BACKEND_URL = backendUrl(config);
const API_URL = new URL("/api", BACKEND_URL).href;

const DAY = 24 * 60 * 60 * 1000;
// Env-overridable for testing (ms). Defaults: remind after 3 days without a
// bank sync, check hourly (plus on wake), nag at most once a day.
const REMIND_AFTER = Number(process.env.BANK_REMIND_AFTER_MS ?? 3 * DAY);
const REMIND_CHECK_EVERY = Number(process.env.BANK_REMIND_CHECK_MS ?? 60 * 60 * 1000);
const NAG_AT_MOST_EVERY = Number(process.env.BANK_REMIND_NAG_MS ?? DAY);
// The backend is tailnet-only, so a Mac off the tailnet (or a pod mid-rollout)
// simply can't load the UI. Retry rather than parking on a Chromium error page.
const RELOAD_AFTER = Number(process.env.DASHBOARD_RETRY_MS ?? 15_000);
// Ceiling for the retry backoff — a lid closed overnight shouldn't mean a failed
// load every 15s until morning, but the wait after a reconnect stays tolerable.
const MAX_RETRY_AFTER = Number(process.env.DASHBOARD_RETRY_MAX_MS ?? 2 * 60_000);
// Reachability probe budget. Short: this only decides whether to navigate, and a
// tailnet that needs longer than this is "not up yet" for our purposes.
const HEALTH_TIMEOUT = Number(process.env.DASHBOARD_HEALTH_TIMEOUT_MS ?? 5_000);

// One instance only: a login-item app relaunched by hand should focus the
// existing window, not double-notify.
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
}
app.on("second-instance", () => void focusWindow());

// --- The agent ----------------------------------------------------------------

// Push-only: collect the MoneyMoney backlog on this Mac, POST it to the backend.
// `moneyMoneyAccount` is the source's only configuration and it is not a secret
// (an IBAN selector, not a credential), so it comes from the host config file —
// no secretspec, no 1Password, no native addon in this app.
const agent: BankAgent = createBankAgent({
  collect: bankCollector({ account: config.moneyMoneyAccount }),
  push: bankPusher(API_URL),
});

// The renderer's ↺ button, bridged through preload. `refresh` never throws — a
// locked MoneyMoney or an unreachable backend comes back as { ok:false, error }
// for the card to show. Nothing is pushed on failure, so the backend keeps its
// last-good value; a success reaches every other device over the live stream.
ipcMain.handle("agent:refresh-bank", async (): Promise<RefreshResult> => {
  const result = await agent.refresh();
  if (!result.ok) console.warn("[agent] bank refresh failed:", result.error);
  return result;
});

// --- Window -------------------------------------------------------------------

const BACKEND_ORIGIN = new URL(BACKEND_URL).origin;

/** Same origin as the backend the SPA is served from — compared parsed, never by prefix. */
function isBackendOrigin(url: string): boolean {
  try {
    return new URL(url).origin === BACKEND_ORIGIN;
  } catch {
    return false; // unparseable (about:blank, a bare scheme) is never ours
  }
}

async function createWindow(): Promise<BrowserWindowType> {
  const win = new BrowserWindow({
    width: 1280,
    height: 832,
    title: "Personal Dashboard",
    backgroundColor: "#ffffff", // light-only UI
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true, // isolated worlds
      nodeIntegration: false, // no Node in the renderer
      sandbox: true,
    },
  });

  // This window loads a REMOTE origin and carries the `window.dashboardAgent`
  // bridge (preload.js), i.e. a live handle on the MoneyMoney agent. contextIso-
  // lation and the sandbox keep the renderer out of Node, but they say nothing
  // about *which page* gets the bridge: one redirect or one link click and a
  // foreign origin would inherit it. So pin the window to the backend origin.
  //
  // will-navigate covers in-page navigations (link clicks, location =), and
  // will-redirect the server-side 30x hop that will-navigate never sees — an
  // open redirect on the backend would otherwise land us elsewhere with the
  // bridge still attached. Both compare parsed origins, not string prefixes.
  const denyForeignNavigation = (event: { preventDefault: () => void }, url: string): void => {
    if (isBackendOrigin(url)) return;
    event.preventDefault();
    console.warn(`[main] blocked navigation to ${url} (not ${BACKEND_ORIGIN})`);
  };
  win.webContents.on("will-navigate", denyForeignNavigation);
  win.webContents.on("will-redirect", denyForeignNavigation);

  // target=_blank / window.open: never open a second Electron window (it would
  // get the same preload). External http(s) links go to the user's browser
  // instead; any other scheme is dropped rather than handed to the OS opener,
  // which would happily launch things far beyond a browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    let protocol: string;
    try {
      protocol = new URL(url).protocol;
    } catch {
      protocol = "";
    }
    if (protocol === "https:" || protocol === "http:") {
      // Caught, not left dangling: an unhandled rejection here would take the
      // whole main process — and with it the agent — down over a failed link.
      void shell.openExternal(url).catch((err: unknown) => {
        console.warn(`[main] opening ${url} externally failed:`, err);
      });
    } else console.warn(`[main] blocked window.open for ${url}`);
    return { action: "deny" };
  });

  // A load that fails *after* a healthy probe — the backend went away mid-session,
  // or the user hit the offline page's retry button at the wrong moment. Ignore
  // -3 (ABORTED), which a navigation superseded by our own reload reports.
  win.webContents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    console.warn(`[main] load failed (${code} ${description}) for ${url}`);
    void showOffline(win);
    scheduleRetry(win);
  });
  await openDashboard(win);
  return win;
}

// --- Reachability -------------------------------------------------------------

// The tailnet is not always there — a closed lid, a café without the VPN, a pod
// mid-rollout — so being unable to load the dashboard is an ordinary state, not
// a failure. Retry with a capped backoff and say so in the window meanwhile.
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let attempt = 0;

/** Is the backend answering right now? Cheap, unauthenticated, no navigation. */
async function backendReachable(): Promise<boolean> {
  try {
    const res = await fetch(new URL("/health", BACKEND_URL), {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT),
      cache: "no-store",
    });
    return res.status === 204 || res.ok;
  } catch {
    return false; // off the tailnet, DNS, refused, timeout — all the same answer
  }
}

/**
 * Show the dashboard if the backend is up, else the local offline page.
 *
 * The health probe comes first deliberately: navigating to an unreachable URL
 * makes Chromium commit its own error page under that URL, which would flash on
 * every retry before we could swap ours in. Probing keeps the window on the
 * offline page until there is something real to show.
 *
 * It also tolerates failure. `loadURL` REJECTS when the navigation fails, and
 * boot() awaited it unguarded — so launching while off the tailnet (the
 * login-item case: the app starts before Tailscale is up) took the whole app
 * down with "boot failed".
 */
async function openDashboard(win: BrowserWindowType): Promise<void> {
  if (win.isDestroyed()) return;
  if (!(await backendReachable())) {
    await showOffline(win);
    scheduleRetry(win);
    return;
  }
  try {
    await win.loadURL(BACKEND_URL);
    if (attempt > 0) console.log(`[main] dashboard loaded (after ${attempt} failed attempt(s))`);
    // The backend really answered, so start the backoff over: the next outage
    // then retries briskly instead of at the last one's long delay.
    attempt = 0;
  } catch (err) {
    console.warn("[main] navigation failed after a healthy probe:", err);
    await showOffline(win);
    scheduleRetry(win);
  }
}

/** Swap in the local "not reachable" page (the backend URL rides in the hash). */
async function showOffline(win: BrowserWindowType): Promise<void> {
  if (win.isDestroyed()) return;
  try {
    await win.loadFile(offlinePath, { hash: encodeURIComponent(BACKEND_URL) });
  } catch (err) {
    console.warn("[main] offline page failed to load:", err);
  }
}

function scheduleRetry(win: BrowserWindowType): void {
  if (retryTimer) return; // one in flight is enough
  attempt += 1;
  // 15s, 30s, 60s, … capped: a laptop can be away for hours, and there is no
  // point waking every 15s all night to fail again.
  const delay = Math.min(RELOAD_AFTER * 2 ** (attempt - 1), MAX_RETRY_AFTER);
  console.log(`[main] retrying in ${Math.round(delay / 1000)}s`);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (!win.isDestroyed()) void openDashboard(win);
  }, delay);
}

/** Retry now, whatever the backoff said — for events that change reachability. */
function retryNow(): void {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win || win.isDestroyed()) return;
  if (win.webContents.getURL().startsWith(BACKEND_URL)) return; // already there
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  attempt = 0;
  void openDashboard(win);
}

async function focusWindow(): Promise<void> {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  } else {
    await createWindow();
  }
}

// --- Bank staleness reminder -------------------------------------------------

const nagFilePath = () => resolve(app.getPath("userData"), "bank-reminder.json");

// Typed tRPC client against the backend — the same contract the SPA consumes
// (AppRouter is the wire type, nothing hand-written).
const trpc = createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: API_URL })] });

/** German day phrase for the notification body (UI strings are de-DE). */
function daysPhrase(ms: number): string {
  const days = Math.floor(ms / DAY);
  return days === 1 ? "1 Tag" : `${days} Tagen`;
}

async function checkBankReminder(): Promise<void> {
  try {
    const { bank } = await trpc.state.query();
    const syncedAt = bank.syncedAt;
    const now = Date.now();
    const stale = syncedAt === null || now - syncedAt > REMIND_AFTER;
    if (!stale) return;

    // Nag throttle, persisted across restarts (a login-item app restarts often).
    let lastNagged = 0;
    try {
      lastNagged =
        (JSON.parse(await readFile(nagFilePath(), "utf8")) as { lastNagged?: number }).lastNagged ??
        0;
    } catch {
      /* first nag */
    }
    if (now - lastNagged < NAG_AT_MOST_EVERY) return;

    const body =
      syncedAt === null
        ? "Bankdaten wurden noch nie synchronisiert. MoneyMoney entsperren und im Dashboard ↺ drücken."
        : `Letzte MoneyMoney-Synchronisierung vor ${daysPhrase(now - syncedAt)}. MoneyMoney entsperren und im Dashboard ↺ drücken.`;
    const notification = new Notification({ title: "MoneyMoney-Daten veraltet", body });
    notification.on("click", () => void focusWindow());
    notification.show();
    console.log(`[reminder] bank stale (syncedAt=${syncedAt ?? "never"}) — notification shown`);
    await writeFile(nagFilePath(), JSON.stringify({ lastNagged: now }));
  } catch (err) {
    // Best-effort: never let it disturb the app. A Mac off the tailnet is the
    // ordinary failure here, not an error worth surfacing.
    console.warn("[reminder] check failed:", err instanceof Error ? err.message : String(err));
  }
}

// --- Boot ---------------------------------------------------------------------

async function boot(): Promise<void> {
  // Dev Dock icon (packaged builds get it from the bundle .icns instead).
  if (!app.isPackaged && process.platform === "darwin") {
    app.dock?.setIcon(devDockIcon);
  }

  // Start at login (packaged builds only — in dev this would register the bare
  // node_modules Electron binary). Idempotent; shows up under macOS System
  // Settings → General → Login Items and can be disabled there.
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: true });
  }

  console.log(`[main] agent up — backend at ${BACKEND_URL}`);
  await createWindow();

  // Reminder cadence: at boot, hourly, and on wake from sleep (a laptop that
  // sleeps through the hourly timer still gets checked promptly).
  void checkBankReminder();
  setInterval(() => void checkBankReminder(), REMIND_CHECK_EVERY);
  powerMonitor.on("resume", () => {
    // Waking is the moment reachability most often changes (the lid was shut
    // somewhere else entirely), so don't sit out the rest of the backoff.
    retryNow();
    void checkBankReminder();
  });
}

app
  .whenReady()
  .then(boot)
  .catch((err: unknown) => {
    console.error("[main] boot failed:", err);
    app.exit(1);
  });

app.on("activate", () => void focusWindow());

// macOS convention: closing the window keeps the app (and the reminder timer)
// alive in the dock; Cmd-Q quits. Quitting on close would silently disable the
// reminder duty this shell carries. Nothing to tear down on quit any more — the
// agent owns no server, no store and no sidecar.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
