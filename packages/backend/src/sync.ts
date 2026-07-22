import type { Source } from "@dash/collector/sources/port";
import { pollOnce } from "./sampling/sampler.ts";
import type { Db } from "./store/db.ts";

let inboxInFlight: Promise<void> | null = null;

// There is no bank equivalent here on purpose: MoneyMoney can only be read by a
// native Mac process, so the Mac agent collects it locally and pushes the result
// to `pushBankBacklog`. The backend never polls it — not even when it happens to
// run on a Mac.

/**
 * Force a live JMAP fetch of every inbox, on demand — this is what the inbox
 * "sync" button triggers so a click actually re-reads Fastmail rather than just
 * re-serving the DB. Push (`Source.watch`) keeps counts fresh in the background;
 * this is the manual escape hatch for when a user wants an immediate refresh (or
 * push is asleep). Concurrent callers coalesce into one round of fetches, and
 * each `pollOnce` is fault-isolated, so one failing account can't throw or block
 * the other.
 */
export function syncInboxesOnce(db: Db, sources: Source[], now: number): Promise<void> {
  if (!inboxInFlight) {
    inboxInFlight = Promise.all(sources.map((s) => pollOnce(db, s, now)))
      .then(() => undefined)
      .finally(() => {
        inboxInFlight = null;
      });
  }
  return inboxInFlight;
}
