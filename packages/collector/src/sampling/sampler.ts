import type { Secrets } from "../secrets.ts";
import type { Source, Poll } from "../sources/port.ts";
import type { Db } from "../store/db.ts";
import { localDay } from "../time.ts";

/**
 * Persist one poll: upsert today's day-bucket for each history metric (idempotent —
 * a later poll the same day overwrites it, last-observed wins) and store the
 * current snapshot with ok=true.
 */
export function commit(db: Db, source: Source, poll: Poll, now: number): void {
  const day = localDay(now);
  for (const metric of source.historyMetrics) {
    db.upsertSample(source.id, metric, day, poll.metrics[metric]);
  }
  db.putSnapshot(source.id, poll.snapshot, now, true);
}

/**
 * Poll a source once, isolating failures: on error the source is flipped to
 * `ok:false` (keeping its last-good snapshot) and the error recorded — it never
 * throws out, so one failing source can't disturb the others.
 */
export async function pollOnce(
  db: Db,
  source: Source,
  secrets: Secrets,
  now: number,
): Promise<void> {
  try {
    commit(db, source, await source.poll(secrets), now);
  } catch (err) {
    db.markSourceError(source.id, err instanceof Error ? err.message : String(err), now);
  }
}
