import type { Job } from "../scheduler.ts";
import { jmapInbox } from "./jmap.ts";
import { moneyMoneyBank } from "./moneymoney.ts";
import { togglHours } from "./toggl.ts";

const MIN = 60_000;

/**
 * Per-source cadence. Freshness ≠ history resolution: pollers refresh the live
 * number on this cadence, but the sampler only commits one day-bucketed point.
 */
export const jobs: Job[] = [
  { source: jmapInbox("inbox:personal", "personal", "fastmailTokenPersonal"), everyMs: 3 * MIN },
  { source: jmapInbox("inbox:work", "work", "fastmailTokenWork"), everyMs: 3 * MIN },
  { source: togglHours(), everyMs: 60 * MIN },
  { source: moneyMoneyBank(), everyMs: 20 * MIN },
];
