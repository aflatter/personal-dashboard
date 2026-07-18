import type { BankGate } from "./registry.ts";
import { pollOnce } from "./sampling/sampler.ts";
import type { Db } from "./store/db.ts";

let bankInFlight: Promise<void> | null = null;

/**
 * Poll MoneyMoney once, coalescing concurrent callers into a single osascript
 * run — a second click (another tab, a rapid re-click) awaits the in-flight sync
 * instead of spawning a parallel AppleScript. `pollOnce` is fault-isolated, so a
 * failure (locked / not authorized) is recorded on the source, never thrown.
 *
 * A gated-off bank (`source: null` — wrong platform or unconfigured account)
 * marks the snapshot with the gate's reason while keeping the last-good data,
 * so the card can surface why the sync didn't run.
 */
export function syncBankOnce(db: Db, bank: BankGate, now: number): Promise<void> {
  if (!bank.source) {
    db.markSourceError("bank", bank.reason, now);
    return Promise.resolve();
  }
  const source = bank.source;
  if (!bankInFlight) {
    bankInFlight = pollOnce(db, source, now).finally(() => {
      bankInFlight = null;
    });
  }
  return bankInFlight;
}
