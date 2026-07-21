import type { BankState } from "@dash/collector/contract";
import type { Db } from "./store/db.ts";

/**
 * The payload the Mac agent pushes up. MoneyMoney can only be read on the Mac
 * (osascript/JXA under macOS TCC), so the agent collects the backlog locally and
 * POSTs it here — the backend never polls MoneyMoney itself.
 */
export interface BankBacklog {
  /** Unreviewed transactions — the actionable backlog. */
  unchecked: number;
  /**
   * When MoneyMoney was read on the Mac. The agent stamps it at collection time;
   * the backend defaults it to `now` if the agent omits it.
   */
  syncedAt?: number;
}

/**
 * Record a bank backlog pushed up by the Mac agent: store it as the `bank`
 * snapshot and mark the source live (ok:true). This is the receive half of the
 * push-only bank flow — the counterpart to the agent's local collection. The
 * backend is the durable hub, so once stored the value reaches every client
 * (the phone included) on the next state read, even while the Mac is offline.
 */
export function recordBankBacklog(db: Db, backlog: BankBacklog, now: number): void {
  const state: BankState = { unchecked: backlog.unchecked, syncedAt: backlog.syncedAt ?? now };
  db.putSnapshot("bank", state, now, true);
}
