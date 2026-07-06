import { pollOnce } from "../sampling/sampler.ts";
import type { Secrets } from "../secrets.ts";
import type { Job } from "../scheduler.ts";
import type { Source } from "./port.ts";
import type { Db } from "../store/db.ts";
import { jmapInbox } from "./jmap.ts";
import { moneyMoneyBank } from "./moneymoney.ts";
import { togglHours } from "./toggl.ts";

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

/**
 * Per-source cadence. Freshness ≠ history resolution: pollers refresh the live
 * number on this cadence, but the sampler only commits one day-bucketed point.
 *
 * The inboxes tick only once a day: JMAP push (see `jmapInbox`'s `watch`) keeps
 * their live counts fresh within seconds, so the timer exists solely to
 * guarantee one history sample on a day with no push activity.
 *
 * Bank (MoneyMoney) is deliberately absent: it syncs on-demand only (see
 * `bankSource` + the router's `syncBank` mutation), never on a timer.
 */
export const jobs: Job[] = [
  { source: jmapInbox("inbox:personal", "personal", "fastmailTokenPersonal"), everyMs: DAY },
  { source: jmapInbox("inbox:work", "work", "fastmailTokenWork"), everyMs: DAY },
  { source: togglHours(), everyMs: 60 * MIN },
];

/** MoneyMoney, polled only when the user hits the bank card's sync button. */
export const bankSource = moneyMoneyBank();

let bankInFlight: Promise<void> | null = null;

/**
 * Poll MoneyMoney once, coalescing concurrent callers into a single osascript
 * run — a second click (another tab, a rapid re-click) awaits the in-flight sync
 * instead of spawning a parallel AppleScript. `pollOnce` is fault-isolated, so a
 * failure (locked / not authorized) is recorded on the source, never thrown.
 *
 * `source` is injectable for tests; production always uses the `bankSource`
 * singleton so the module-level in-flight ref coalesces every caller.
 */
export function syncBankOnce(
  db: Db,
  secrets: Secrets,
  now: number,
  source: Source = bankSource,
): Promise<void> {
  if (!source.ready(secrets)) {
    const reason =
      process.platform !== "darwin"
        ? "MoneyMoney sync needs macOS"
        : "MoneyMoney account not configured (set MONEYMONEY_ACCOUNT)";
    db.markSourceError("bank", reason, now);
    return Promise.resolve();
  }
  if (!bankInFlight) {
    bankInFlight = pollOnce(db, source, secrets, now).finally(() => {
      bankInFlight = null;
    });
  }
  return bankInFlight;
}
