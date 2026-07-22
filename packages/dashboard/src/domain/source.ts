import type { SourceStatus } from "@dash/collector/contract";

/**
 * Whether a source's data should be distrusted right now.
 *
 * `ok` alone is not enough: it reports how the *last* poll went, so a source that
 * silently stopped being polled keeps `ok: true` and looks healthy forever while
 * the numbers freeze. That is exactly how a broken secret load once served
 * days-old inboxes without a hint in the UI. Staleness asks the other question —
 * "when did we last hear anything?" — against the budget the backend derives from
 * the source's own cadence.
 *
 * Sources with no budget (unconfigured, or pushed in rather than polled) are
 * never stale by this rule: there is no cadence to miss. The bank is the notable
 * one — it is pushed from the Mac, and its own sync-age pill covers it.
 */
export function sourceStale(status: SourceStatus, now: number): boolean {
  if (status.staleAfter === undefined) return false;
  if (status.polledAt === null) return true;
  return now - status.polledAt > status.staleAfter;
}

/**
 * The one-line explanation a card should show, or null when there is nothing to
 * say. A failed poll's own message wins — it is more specific than "stale" and
 * usually actionable ("token rejected"). Otherwise a stale source says so, since
 * the last poll succeeding tells the user nothing about it being days old.
 */
export function sourceProblem(status: SourceStatus, now: number): string | null {
  if (!status.ok && status.error) return status.error;
  return sourceStale(status, now) ? "Daten veraltet — Quelle meldet sich nicht" : null;
}
