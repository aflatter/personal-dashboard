// Core domain model for the personal dashboard.
// Pure types — no React, no rendering concerns.

export type InboxAccount = 'personal' | 'work';
export type MailProtocol = 'IMAP' | 'Exchange';

/** A mail inbox we track for Inbox-Zero: both total and unread matter. */
export interface Inbox {
  account: InboxAccount;
  /** Shown as the card subtitle, e.g. "alex@tevim.com". */
  email: string;
  /** Transport for the production integration; not shown in the UI. */
  protocol: MailProtocol;
  total: number;
  unread: number;
  /** Unread count per day (oldest → newest), ~11 points. */
  history: number[];
  /** Total count per day, same length as `history`. */
  totalHistory: number[];
}

export interface Project {
  name: string;
  /** Hours billed this month. */
  hours: number;
}

export interface Client {
  name: string;
  projects: Project[];
}

/** A reviewable bank account (Spaßkonto / MoneyMoney). */
export interface Bank {
  /** Unreviewed transactions — the actionable backlog (hero number). */
  unchecked: number;
  /** When the account was last reviewed → "geprüft vor {n} T". */
  lastCheckedAt: number;
}

export type CounterStatus = 'aktuell' | 'fällig bald' | 'überfällig';

/** User-configurable thresholds and display options (SPEC "tweaks"). */
export interface Settings {
  /** Days until a counter is "überfällig". */
  overdueThreshold: number;
  /** Days until a counter is "fällig bald". */
  dueSoonThreshold: number;
  /** Show seconds in the header clock. */
  clockSeconds: boolean;
}
