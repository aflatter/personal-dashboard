// Optional host-side configuration, read at boot from the user's XDG config dir
// (`$XDG_CONFIG_HOME/<APP>/config.json`, else `~/.config/<APP>/config.json`).
//
// Its purpose is the handful of bootstrap knobs the packaged app needs *before*
// it can load secrets — chiefly where to find the `op` CLI. A Finder / login-item
// launch inherits only the minimal system PATH (`/usr/bin:/bin:/usr/sbin:/sbin`),
// so tools installed via nix or home-manager are invisible; rather than hardcode
// a profile path into the app, the user points at their own `op` here (ideally
// generated declaratively, e.g. with home-manager, so it stays correct).
//
// Deliberately tiny and fully optional: a missing or malformed file yields `{}`,
// and PATH augmentation falls back to conventional macOS locations. This is NOT
// the dashboard's user settings (thresholds, clock) — those live in the collector
// DB; this is pre-secrets host bootstrap only.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** Directory name under `$XDG_CONFIG_HOME` (or `~/.config`). */
export const CONFIG_DIR_NAME = "personal-dashboard";

/** Conventional macOS locations for user CLIs, tried when config doesn't specify. */
const CONVENTIONAL_DIRS = ["/opt/homebrew/bin", "/usr/local/bin"];

export interface HostConfig {
  /**
   * Absolute path to the 1Password CLI binary (`op`). Its containing directory is
   * prepended to PATH so secretspec can resolve secrets. Set this when `op` lives
   * outside the conventional Homebrew locations (e.g. a nix profile).
   */
  opPath?: string;
  /** Extra directories to prepend to PATH — escape hatch for other CLIs. */
  pathDirs?: string[];
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
 * Build a PATH that lets the packaged app find user-installed CLIs (notably `op`).
 * Config-specified dirs take precedence, then conventional macOS tool locations,
 * then the existing PATH. Only existing directories are added; entries are
 * de-duplicated with order preserved. `exists` is injectable for testing.
 */
export function augmentedPath(
  config: HostConfig,
  currentPath: string,
  exists: (dir: string) => boolean = existsSync,
): string {
  const fromOp = config.opPath ? [dirname(config.opPath)] : [];
  const configured = [...fromOp, ...(config.pathDirs ?? [])];
  const prepend = [...configured, ...CONVENTIONAL_DIRS].filter(exists);
  const seen = new Set<string>();
  const parts = [...prepend, ...currentPath.split(":")].filter((p) => {
    if (!p || seen.has(p)) return false;
    seen.add(p);
    return true;
  });
  return parts.join(":");
}
