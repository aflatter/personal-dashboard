import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// The secretspec Node SDK is a CommonJS native (napi) addon — load it via
// createRequire so the ESM named-export interop can't bite us.
const require = createRequire(import.meta.url);

// Secrets are declared in the repo-root secretspec.toml and resolved at boot from
// the configured provider (1Password). All optional: a missing secret (or the
// provider being unavailable) just means the matching source is skipped — the
// collector keeps serving its last-known / seeded state.
export interface Secrets {
  fastmailTokenPersonal?: string;
  fastmailTokenWork?: string;
  togglApiToken?: string;
  togglWorkspaceId?: string;
  /**
   * Which MoneyMoney account to read. Not auth — just a selector. IBAN preferred
   * (unique + stable); MoneyMoney also accepts UUID / account number / name /
   * group name. Required in secretspec, so present whenever the load succeeds;
   * still typed optional because a failed load yields an empty {} (bank is then
   * gated off by its `ready`).
   */
  moneyMoneyAccount?: string;
}

const TOML_PATH =
  process.env.SECRETSPEC_PATH ??
  fileURLToPath(new URL("../../../secretspec.toml", import.meta.url));

export function loadSecrets(): Secrets {
  try {
    const { SecretSpec } = require("secretspec") as typeof import("secretspec");

    let builder = SecretSpec.builder()
      .withPath(TOML_PATH)
      .withProfile(process.env.SECRETSPEC_PROFILE ?? "default")
      .withReason("personal-dashboard collector");
    // Provider comes from `secretspec config` (global) unless overridden here.
    const provider = process.env.SECRETSPEC_PROVIDER;
    if (provider) builder = builder.withProvider(provider);

    const resolved = builder.load();
    const fields = resolved.fields();
    resolved.dispose();

    const val = (name: string): string | undefined => fields[name] ?? undefined;
    return {
      fastmailTokenPersonal: val("FASTMAIL_TOKEN_PERSONAL"),
      fastmailTokenWork: val("FASTMAIL_TOKEN_WORK"),
      togglApiToken: val("TOGGL_API_TOKEN"),
      togglWorkspaceId: val("TOGGL_WORKSPACE_ID"),
      moneyMoneyAccount: val("MONEYMONEY_ACCOUNT"),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`secretspec: no secrets loaded (${msg}); sources needing them are skipped`);
    return {};
  }
}
