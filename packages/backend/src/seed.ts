import type {
  BankState,
  Client,
  InboxAccount,
  MailProtocol,
  Settings,
} from "@dash/collector/contract";
import type { Db } from "./store/db.ts";
import { berlinDays, DAY, localDay } from "@dash/collector/time";

/** Non-history part of an inbox, stored in the snapshot row. */
export interface InboxSnapshot {
  account: InboxAccount;
  email: string;
  protocol: MailProtocol;
  unread: number;
  total: number;
}

/**
 * Populate the inbox lifecycle log by driving the *real* membership diff: seed a
 * standing inbox as the baseline (dated before the window, so it isn't counted
 * as arrivals), then per day remove `processed[i]` of the oldest live ids and add
 * `received[i]` new ones and re-apply — so received/processed derive to exactly
 * those arrays. Stamps at local noon so each event lands inside its own day bucket.
 */
function seedFlow(
  db: Db,
  source: string,
  baseline: number,
  received: number[],
  processed: number[],
  now: number,
): void {
  // The two series are hand-maintained literals; a length mismatch would make
  // `processed[i]` undefined, and `slice(0, undefined)` silently clears the whole
  // live set instead of a few ids. Fail loudly rather than seed nonsense.
  if (received.length !== processed.length) {
    throw new Error(
      `seedFlow(${source}): received/processed length mismatch (${received.length} vs ${processed.length})`,
    );
  }
  let counter = 0;
  const nextId = () => `${source}#${counter++}`;
  const live = new Set<string>();
  for (let i = 0; i < baseline; i++) live.add(nextId());
  db.applyInboxMembership(source, [...live], new Date(now).toISOString()); // cold-start baseline

  for (const [i, d] of berlinDays(now, received.length).entries()) {
    const stamp = new Date(d.startMs + DAY / 2).toISOString();
    for (const gone of [...live].slice(0, processed[i])) live.delete(gone);
    for (let k = 0; k < received[i]; k++) live.add(nextId());
    db.applyInboxMembership(source, [...live], stamp);
  }
}

function seedInbox(
  db: Db,
  source: string,
  snap: InboxSnapshot,
  unread: number[],
  total: number[],
  received: number[],
  processed: number[],
  now: number,
  live: boolean,
): void {
  // A snapshot row is an invariant, not demo data: buildState throws without one,
  // so a live inbox gets this placeholder purely to keep /state answerable in the
  // seconds before its first poll overwrites it.
  db.putSnapshot(source, snap, now, true);
  // Everything below is prototype data for an inbox nothing polls (dev/preview).
  // A live inbox gets none of it — invented history would sit in the real series
  // until it aged out, and a seeded flow log would mark the source initialised,
  // defeating the first poll's cold-start baseline. Its real data fills in from
  // that poll instead.
  if (live) return;

  const n = unread.length;
  const dayFor = (i: number) => localDay(now - (n - 1 - i) * DAY);
  unread.forEach((v, i) => db.upsertSample(source, "unread", dayFor(i), v));
  total.forEach((v, i) => db.upsertSample(source, "total", dayFor(i), v));
  seedFlow(db, source, snap.total, received, processed, now);
}

/**
 * Populate an empty DB with the design-prototype data, relative to `now`.
 * `liveInboxes` are the inbox sources that will be polled for real — their flow
 * log is left unseeded so the first poll baselines cleanly (see seedInbox).
 */
export function seed(db: Db, now: number, liveInboxes: ReadonlySet<string> = new Set()): void {
  seedInbox(
    db,
    "inbox:personal",
    {
      account: "personal",
      email: "alex@flatter.io",
      protocol: "JMAP",
      unread: 12,
      total: 47,
    },
    [10, 13, 9, 12, 15, 11, 14, 12, 16, 13, 12],
    [44, 47, 43, 46, 48, 45, 47, 46, 49, 47, 47],
    [6, 9, 5, 8, 11, 7, 10, 8, 12, 9, 7, 10, 6, 5],
    [5, 8, 6, 7, 9, 8, 9, 8, 10, 9, 7, 9, 5, 3],
    now,
    liveInboxes.has("inbox:personal"),
  );
  seedInbox(
    db,
    "inbox:work",
    {
      account: "work",
      email: "alex@tevim.com",
      protocol: "JMAP",
      unread: 23,
      total: 138,
    },
    [22, 26, 21, 28, 24, 23, 27, 25, 29, 24, 23],
    [132, 136, 130, 138, 134, 133, 137, 135, 140, 138, 138],
    [14, 20, 12, 22, 18, 16, 21, 19, 24, 17, 15, 20, 13, 11],
    [12, 18, 13, 19, 16, 15, 19, 17, 21, 16, 14, 18, 11, 9],
    now,
    liveInboxes.has("inbox:work"),
  );

  const bank: BankState = { unchecked: 34, syncedAt: now - 5 * DAY };
  db.putSnapshot("bank", bank, now, true);

  const clients: Client[] = [
    {
      name: "Hansequartier",
      projects: [
        { name: "Website Relaunch", hours: 18.5 },
        { name: "Exposé-Texte", hours: 5 },
      ],
    },
    {
      name: "Nordlicht",
      projects: [
        { name: "App MVP", hours: 24 },
        { name: "Code Review", hours: 4.5 },
      ],
    },
    {
      name: "intern",
      projects: [
        { name: "Buchhaltung", hours: 3 },
        { name: "Akquise", hours: 6 },
      ],
    },
  ];
  db.putSnapshot("hours", { clients }, now, true);

  db.addEvent("rent_done", now - 12 * DAY);
  db.addEvent("tax_done", now - 26 * DAY);

  const settings: Settings = {
    overdueThreshold: 21,
    dueSoonThreshold: 7,
    clockSeconds: false,
  };
  db.putSettings(settings);
}
