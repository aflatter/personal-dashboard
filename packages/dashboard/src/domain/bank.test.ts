import { expect, test } from "vitest";
import { BANK_STALE_AFTER, bankView } from "./bank";
import { DAY } from "./constants";

const NOW = 1_000 * DAY;

test("fresh sync is not stale and carries the timestamp through", () => {
  const syncedAt = NOW - 3 * DAY;
  const view = bankView({ unchecked: 12, syncedAt }, NOW);
  expect(view).toEqual({ unchecked: 12, syncedAt, stale: false });
});

test("a sync older than the threshold is stale", () => {
  const view = bankView({ unchecked: 5, syncedAt: NOW - 8 * DAY }, NOW);
  expect(view.stale).toBe(true);
});

test("exactly at the threshold is not yet stale", () => {
  const view = bankView({ unchecked: 5, syncedAt: NOW - BANK_STALE_AFTER }, NOW);
  expect(view.stale).toBe(false);
});

test("never synced is stale with a null timestamp", () => {
  const view = bankView({ unchecked: 0, syncedAt: null }, NOW);
  expect(view).toEqual({ unchecked: 0, syncedAt: null, stale: true });
});
