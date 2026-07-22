import { moneyMoneyBank } from "./sources/moneymoney.ts";
import type { Source } from "./sources/port.ts";

/**
 * The bank source's wiring, deliberately in its own module rather than in
 * `registry.ts` with the polled sources.
 *
 * Its only consumer is the **Mac agent**, which runs in the Electron main
 * process and is bundled: importing this from the registry would drag the JMAP
 * and Toggl sources — and with them a whole HTTP stack (undici) — into an app
 * that never makes those calls. It measured 9× the bundle. The backend, the
 * other way round, never builds a bank source at all: MoneyMoney can only be
 * read by a native Mac process, so it is pushed in via `pushBankBacklog`.
 */
export type BankGate = { source: Source; reason?: undefined } | { source: null; reason: string };

/**
 * What the bank source needs to run — deliberately NOT part of `Secrets`. The
 * account selector is an IBAN, not a credential: it never goes to the vault or
 * the cluster, and lives in the Mac app's own config file. Keeping it out of the
 * secret bag is what stops it being treated as one.
 */
export interface BankConfig {
  /**
   * Which MoneyMoney account to read. IBAN preferred (unique + stable);
   * MoneyMoney also accepts UUID / account number / name / group name.
   */
  account?: string;
}

/**
 * The bank source when it can run here, else the human-facing reason it can't —
 * surfaced on the bank card when the Mac agent's refresh comes back `ok: false`.
 * The reason names no specific config mechanism, since only the Mac app calls it.
 */
export function buildBankSource(config: BankConfig): BankGate {
  if (process.platform !== "darwin") return { source: null, reason: "MoneyMoney sync needs macOS" };
  if (!config.account) return { source: null, reason: "MoneyMoney account not configured" };
  return { source: moneyMoneyBank({ account: config.account }) };
}
