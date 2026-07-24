import type {
  BankState,
  Client,
  DayPoint,
  InboxAccount,
  InboxState,
  Settings,
  SourceId,
  SourceStatus,
  StateResponse,
} from "@dash/collector/contract";
import type { Db } from "./store/db.ts";
import type { InboxSnapshot } from "./seed.ts";
import { flowBuckets } from "./store/db.ts";
import { localDay } from "@dash/collector/time";

/** How many days of per-day mail flow the widget shows (and we query). */
const FLOW_DAYS = 14;

function points(db: Db, source: SourceId, metric: string): DayPoint[] {
  return db.samples(source, metric).map((r) => ({ day: r.day, value: r.value }));
}

/**
 * The flow buckets for today, memoised on the calendar day. buildState runs on
 * every state read *and* every change-bus emit (one per open tab per poll, and
 * polls fire on every JMAP push), while the bounds only move at midnight —
 * rebuilding them meant ~30–40 Intl.formatToParts calls per emit for an
 * identical string.
 */
let cachedBuckets: { day: string; json: string } | undefined;

function todaysBuckets(now: number): string {
  const day = localDay(now);
  if (cachedBuckets?.day !== day) {
    cachedBuckets = { day, json: flowBuckets(now, FLOW_DAYS) };
  }
  return cachedBuckets.json;
}

function inbox(db: Db, source: SourceId, account: InboxAccount, buckets: string): InboxState {
  const snap = db.getSnapshot<InboxSnapshot>(source);
  if (!snap) throw new Error(`missing inbox snapshot: ${source}`);
  const { email, protocol, unread, total } = snap.data;
  return {
    account,
    email,
    protocol,
    unread,
    total,
    unreadHistory: points(db, source, "unread"),
    totalHistory: points(db, source, "total"),
    receivedHistory: db.flowByDay(source, "first_seen_at", buckets),
    processedHistory: db.flowByDay(source, "departed_at", buckets),
  };
}

/**
 * Per-source staleness budget, keyed by source id: how old a poll may get before
 * the data is suspect. Only the composition point knows the cadences (they come
 * from the registry's jobs), so it is passed in rather than guessed here.
 */
export type StaleAfter = Partial<Record<SourceId, number>>;

function status(db: Db, source: SourceId, staleAfter: StaleAfter): SourceStatus {
  const snap = db.getSnapshot(source);
  const base: SourceStatus = snap
    ? { polledAt: snap.fetchedAt, ok: snap.ok, error: snap.error }
    : { polledAt: null, ok: false, error: "never polled" };
  const budget = staleAfter[source];
  return budget ? { ...base, staleAfter: budget } : base;
}

/** Assemble the full StateResponse from the tables. */
export function buildState(db: Db, staleAfter: StaleAfter = {}): StateResponse {
  const bank = db.getSnapshot<BankState>("bank");
  const hours = db.getSnapshot<{ clients: Client[] }>("hours");
  const settings = db.getSettings<Settings>();
  if (!bank || !hours || !settings) throw new Error("collector state not initialised");

  const buckets = todaysBuckets(Date.now());
  return {
    inboxes: {
      personal: inbox(db, "inbox:personal", "personal", buckets),
      work: inbox(db, "inbox:work", "work", buckets),
    },
    bank: bank.data,
    hours: { clients: hours.data.clients },
    rent: { doneAt: db.latestEvent("rent_done") },
    tax: { doneAt: db.latestEvent("tax_done") },
    settings,
    meta: {
      "inbox:personal": status(db, "inbox:personal", staleAfter),
      "inbox:work": status(db, "inbox:work", staleAfter),
      bank: status(db, "bank", staleAfter),
      hours: status(db, "hours", staleAfter),
    },
  };
}
