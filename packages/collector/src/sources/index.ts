import type { Job } from "../scheduler.ts";
import { jmapInbox } from "./jmap.ts";
import { moneyMoneyBank } from "./moneymoney.ts";
import { togglHours } from "./toggl.ts";

const MIN = 60_000;

/**
 * Per-source cadence. Freshness ≠ history resolution: pollers refresh the live
 * number on this cadence, but the sampler only commits one day-bucketed point.
 *
 * Bank (MoneyMoney) is deliberately absent: it syncs on-demand only (see
 * `bankSource` + the router's `syncBank` mutation), never on a timer.
 */
export const jobs: Job[] = [
  { source: jmapInbox("inbox:personal", "personal", "fastmailTokenPersonal"), everyMs: 3 * MIN },
  { source: jmapInbox("inbox:work", "work", "fastmailTokenWork"), everyMs: 3 * MIN },
  { source: togglHours(), everyMs: 60 * MIN },
];

/** MoneyMoney, polled only when the user hits the bank card's sync button. */
export const bankSource = moneyMoneyBank();
