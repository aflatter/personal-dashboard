import type { Source, Poll } from "@dash/collector/sources/port";
import type { Db } from "../store/db.ts";
import { localDay } from "@dash/collector/time";

/**
 * Persist one poll: upsert today's day-bucket for each history metric (idempotent —
 * a later poll the same day overwrites it, last-observed wins), reconcile the
 * inbox lifecycle log when the source reports its membership, and store the
 * current snapshot with ok=true.
 */
export function commit(db: Db, source: Source, poll: Poll, now: number): void {
  const day = localDay(now);
  // One transaction: a failure partway through would otherwise leave the history
  // advanced to this poll while the snapshot still holds the previous values, so
  // the card's hero numbers and its series would disagree until the next success.
  db.transaction(() => {
    for (const metric of source.historyMetrics) {
      db.upsertSample(source.id, metric, day, poll.metrics[metric]);
    }
    if (poll.inboxMembers != null) {
      db.applyInboxMembership(source.id, poll.inboxMembers, new Date(now).toISOString());
    }
    db.putSnapshot(source.id, poll.snapshot, now, true);
  });
}

/**
 * Poll a source once, isolating failures: on error the source is flipped to
 * `ok:false` (keeping its last-good snapshot) and the error recorded — it never
 * throws out, so one failing source can't disturb the others.
 */
export async function pollOnce(db: Db, source: Source, now: number): Promise<void> {
  try {
    commit(db, source, await source.poll(), now);
  } catch (err) {
    db.markSourceError(source.id, err instanceof Error ? err.message : String(err), now);
  }
}
