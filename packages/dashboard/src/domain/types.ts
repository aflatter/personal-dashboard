// Core domain model for the personal dashboard.
// Pure types — no React, no rendering concerns.
//
// Entity types shared with the collector service live in @dash/shared and are
// re-exported here so the domain has one import surface. Types below are the
// SPA's internal shapes that differ from the wire contract.

import type { InboxAccount, MailProtocol } from "@dash/shared";

export type { InboxAccount, MailProtocol, Project, Client, Settings } from "@dash/shared";

/**
 * A mail inbox for the card. Histories are plain number series here (the wire
 * contract carries dated DayPoints; the store flattens them for the chart).
 */
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

/** A reviewable bank account (Spaßkonto / MoneyMoney). */
export interface Bank {
  /** Unreviewed transactions — the actionable backlog (hero number). */
  unchecked: number;
  /** When the account was last reviewed → "geprüft vor {n} T". */
  lastCheckedAt: number;
}

export type CounterStatus = "current" | "due-soon" | "overdue";
