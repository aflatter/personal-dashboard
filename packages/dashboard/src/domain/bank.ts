import type { Bank } from "./types";
import { DAY } from "./constants";

export interface BankView {
  /** Unreviewed transactions — the actionable hero number. */
  unchecked: number;
  /** Whole days since the account was last reviewed → "geprüft vor {n} T". */
  sinceDays: number;
}

export function bankView(bank: Bank, now: number): BankView {
  return {
    unchecked: bank.unchecked,
    sinceDays: Math.max(0, Math.floor((now - bank.lastCheckedAt) / DAY)),
  };
}
