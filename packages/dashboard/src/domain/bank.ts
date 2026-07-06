import type { Bank } from "./types";
import { DAY } from "./constants";

/** MoneyMoney data older than this (or never synced) is flagged stale in the UI. */
export const BANK_STALE_AFTER = 7 * DAY;

export interface BankView {
  /** Unreviewed transactions — the actionable hero number. */
  unchecked: number;
  /** When MoneyMoney was last synced (null = never); presentation formats the date. */
  syncedAt: number | null;
  /** True when never synced or the last sync is older than {@link BANK_STALE_AFTER}. */
  stale: boolean;
}

export function bankView(bank: Bank, now: number): BankView {
  // Normalize null / undefined / non-finite (e.g. a stale-shaped cache) to "never synced".
  const syncedAt = Number.isFinite(bank.syncedAt as number) ? (bank.syncedAt as number) : null;
  const stale = syncedAt === null || now - syncedAt > BANK_STALE_AFTER;
  return { unchecked: bank.unchecked, syncedAt, stale };
}
