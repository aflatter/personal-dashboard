import type { CounterStatus, Settings } from "./types";
import { DAY } from "./constants";

export interface CounterView {
  /** Whole days since the task was last done. */
  days: number;
  status: CounterStatus;
  /** Fill fraction `min(days / overdue, 1)` — kept for any ring rendering. */
  fraction: number;
}

type Thresholds = Pick<Settings, "dueSoonThreshold" | "overdueThreshold">;

/** Derive day-counter status from a last-done timestamp. */
export function counter(doneAt: number, thresholds: Thresholds, now: number): CounterView {
  const { dueSoonThreshold, overdueThreshold } = thresholds;
  const days = Math.max(0, Math.floor((now - doneAt) / DAY));

  let status: CounterStatus;
  if (days <= dueSoonThreshold) status = "current";
  else if (days <= overdueThreshold) status = "due-soon";
  else status = "overdue";

  return {
    days,
    status,
    fraction: Math.max(0, Math.min(1, days / overdueThreshold)),
  };
}
