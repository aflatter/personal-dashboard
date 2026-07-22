import type { Secrets } from "./secrets.ts";
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
 * The bank source when it can run here, else the human-facing reason it can't —
 * surfaced on the bank card when the Mac agent's refresh comes back `ok: false`.
 * The reason names no specific config mechanism: the caller is the Mac app, which
 * takes the account from its host config file, while the env-var / secretspec
 * spelling is the backend's world.
 */
export function buildBankSource(secrets: Secrets): BankGate {
  if (process.platform !== "darwin") return { source: null, reason: "MoneyMoney sync needs macOS" };
  if (!secrets.moneyMoneyAccount) {
    return { source: null, reason: "MoneyMoney account not configured" };
  }
  return { source: moneyMoneyBank({ account: secrets.moneyMoneyAccount }) };
}
