import type { BankState, Client, InboxAccount, MailProtocol, Settings } from "./contract.ts";
import type { Db } from "./store/db.ts";
import { DAY, localDay } from "./time.ts";

/** Non-history part of an inbox, stored in the snapshot row. */
export interface InboxSnapshot {
  account: InboxAccount;
  email: string;
  protocol: MailProtocol;
  unread: number;
  total: number;
}

function seedInbox(
  db: Db,
  source: string,
  snap: InboxSnapshot,
  unread: number[],
  total: number[],
  now: number,
): void {
  db.putSnapshot(source, snap, now, true);
  const n = unread.length;
  const dayFor = (i: number) => localDay(now - (n - 1 - i) * DAY);
  unread.forEach((v, i) => db.upsertSample(source, "unread", dayFor(i), v));
  total.forEach((v, i) => db.upsertSample(source, "total", dayFor(i), v));
}

/** Populate an empty DB with the design-prototype data, relative to `now`. */
export function seed(db: Db, now: number): void {
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
    now,
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
    now,
  );

  const bank: BankState = { unchecked: 34, lastCheckedAt: now - 5 * DAY };
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
