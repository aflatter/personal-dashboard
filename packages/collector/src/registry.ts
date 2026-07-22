import type { InboxAccount, SourceId } from "./contract.ts";
import type { Secrets } from "./secrets.ts";
import { jmapInbox } from "./sources/jmap.ts";
import type { Source } from "./sources/port.ts";
import { togglHours } from "./sources/toggl.ts";

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

/**
 * A source paired with its polling cadence — the registry's output. The cadence
 * is source configuration (defined here, next to the source), while *running* the
 * loop is the engine's job: the backend's scheduler consumes these. Defining `Job`
 * on the acquisition side (rather than in the scheduler) keeps the dependency
 * direction one-way — the engine knows the sources; never the reverse.
 */
export interface Job {
  source: Source;
  everyMs: number;
}

/**
 * The registry is the single place that reads the whole `Secrets` bag and turns
 * it into configured sources — each factory receives only its own narrow config
 * (least privilege). An unconfigured source is simply not constructed; there is
 * no `ready()` gate on the port. Construction is pure wiring (no I/O).
 *
 * Per-source cadence: freshness ≠ history resolution. Pollers refresh the live
 * number on this cadence, but the sampler only commits one day-bucketed point.
 * The inboxes tick only once a day: JMAP push (`watch`) keeps their live counts
 * fresh within seconds, so the timer exists solely to guarantee one history
 * sample on a day with no push activity.
 *
 * Bank (MoneyMoney) is deliberately absent from the jobs: it syncs on-demand
 * only (see `buildBankSource` in ./bank.ts, built by the Mac agent), never on a
 * timer.
 */
export function buildJobs(secrets: Secrets): Job[] {
  const jobs: Job[] = [];
  const skip = (id: SourceId) => console.log(`source ${id}: not configured — skipping`);

  const inbox = (id: SourceId, account: InboxAccount, token: string | undefined) =>
    token ? jobs.push({ source: jmapInbox(id, account, { token }), everyMs: DAY }) : skip(id);
  inbox("inbox:personal", "personal", secrets.fastmailTokenPersonal);
  inbox("inbox:work", "work", secrets.fastmailTokenWork);

  if (secrets.togglApiToken && secrets.togglWorkspaceId) {
    jobs.push({
      source: togglHours({
        apiToken: secrets.togglApiToken,
        workspaceId: secrets.togglWorkspaceId,
      }),
      everyMs: 60 * MIN,
    });
  } else {
    skip("hours");
  }

  return jobs;
}

// The bank source lives in ./bank.ts, NOT here — deliberately. It is built only
// by the Mac agent, whose bundle would otherwise carry the JMAP + Toggl sources
// (and undici) for calls it never makes. Keep this module for polled sources.
