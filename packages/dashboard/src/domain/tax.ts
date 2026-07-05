import type { Settings } from "./types";
import { counter } from "./counter";
import type { TaskLine } from "./task-line";

type Thresholds = Pick<Settings, "dueSoonThreshold" | "overdueThreshold">;

/**
 * Company receipts upload to the tax office (Firmenbelege · Finanzamt): a plain
 * day-counter. Calm (`current`) reports time since the last upload; otherwise it
 * reports how long the upload has been due / overdue.
 */
export function taxCalc(now: number, taxDoneAt: number | null, thresholds: Thresholds): TaskLine {
  // Never uploaded → overdue.
  if (taxDoneAt == null) return { kind: "overdue", days: 0, done: false, doneAt: null };

  const c = counter(taxDoneAt, thresholds, now);

  if (c.status === "current") {
    return { kind: "calm-since", days: c.days, done: true, doneAt: taxDoneAt };
  }

  return {
    kind: c.status === "overdue" ? "overdue" : "due",
    days: c.days,
    done: false,
    doneAt: taxDoneAt,
  };
}
