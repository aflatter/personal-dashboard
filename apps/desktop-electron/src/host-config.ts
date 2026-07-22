// Optional host-side configuration, read at boot from the user's XDG config dir
// (`$XDG_CONFIG_HOME/<APP>/config.json`, else `~/.config/<APP>/config.json`).
//
// The Mac app is an *agent*, not a server (see docs/multi-device-sync-briefing.md
// §7.3): the backend runs in k3s and this file says where to reach it, plus the
// one piece of local configuration the MoneyMoney source needs. Neither value is
// a secret — the account selector is an IBAN, not a credential — so there is no
// secretspec, no 1Password, and no `op` on PATH involved here. (The backend's
// real secrets live in the cluster; `MONEYMONEY_ACCOUNT` is deliberately never
// sent there, since MoneyMoney only exists on this Mac.)
//
// Deliberately tiny and fully optional: a missing or malformed file yields `{}`
// and the defaults below apply. This is NOT the dashboard's user settings
// (thresholds, clock) — those live in the backend DB.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Directory name under `$XDG_CONFIG_HOME` (or `~/.config`). */
export const CONFIG_DIR_NAME = "personal-dashboard";

/**
 * The always-on backend, reachable only over Tailscale (deploy/README.md pins
 * this URL as the frozen contract with the infra repo). Overridable per host —
 * chiefly to point a dev run at a local `devenv up` backend.
 */
export const DEFAULT_BACKEND_URL = "https://personal-dashboard.braid-stargazer.ts.net";

export interface HostConfig {
  /** Backend origin to load the SPA from and push to. Defaults to the tailnet URL. */
  backendUrl?: string;
  /**
   * Which MoneyMoney account the agent reads. Not auth — just a selector. IBAN
   * preferred (unique + stable); MoneyMoney also accepts UUID / account number /
   * name / group name. Without it the bank source gates itself off and the ↺
   * button reports why.
   */
  moneyMoneyAccount?: string;
}

/** Absolute path of the host config file (does not check existence). */
export function hostConfigPath(): string {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, CONFIG_DIR_NAME, "config.json");
}

/** Read the host config, tolerant of an absent or malformed file (→ `{}`). */
export function loadHostConfig(path = hostConfigPath()): HostConfig {
  try {
    if (!existsSync(path)) return {};
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as HostConfig) : {};
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`host config: ignoring ${path} (${msg})`);
    return {};
  }
}

/**
 * Where this Mac talks to the backend. `DASHBOARD_URL` wins (a dev run pointing
 * at `devenv up`), then the host config, then the tailnet default. Trailing
 * slashes are trimmed so `new URL(path, base)` behaves.
 */
export function backendUrl(config: HostConfig, env = process.env): string {
  const url = env.DASHBOARD_URL || config.backendUrl || DEFAULT_BACKEND_URL;
  return url.replace(/\/+$/, "");
}
