import { describe, expect, it } from "vitest";
import { seed } from "./seed.ts";
import { buildState } from "./state.ts";
import { Db } from "./store/db.ts";

const NOW = new Date(2026, 5, 24, 12, 0, 0).getTime();
const HOUR = 60 * 60 * 1000;

function seeded(): Db {
  const db = new Db(":memory:");
  seed(db, NOW);
  return db;
}

// `meta` is what tells a client whether to trust the numbers. `ok` alone can't:
// it describes the last poll, so a source that quietly stopped being polled
// keeps reporting ok forever. The staleness budget is the missing half, and only
// the composition point knows it — hence it is passed in.
describe("buildState meta", () => {
  it("carries each polled source's staleness budget", () => {
    const state = buildState(seeded(), { "inbox:personal": 3 * HOUR, hours: HOUR });

    expect(state.meta["inbox:personal"].staleAfter).toBe(3 * HOUR);
    expect(state.meta.hours.staleAfter).toBe(HOUR);
  });

  it("leaves it off sources with no cadence, rather than inventing one", () => {
    // The bank is pushed from the Mac and unconfigured sources are never polled;
    // both must stay judgement-free instead of defaulting to some budget.
    const state = buildState(seeded(), { "inbox:personal": 3 * HOUR });

    expect(state.meta.bank.staleAfter).toBeUndefined();
    expect(state.meta["inbox:work"].staleAfter).toBeUndefined();
  });

  it("defaults to no budgets at all when none are supplied", () => {
    const state = buildState(seeded());

    for (const status of Object.values(state.meta)) {
      expect(status.staleAfter).toBeUndefined();
    }
  });

  it("keeps reporting the last poll's outcome alongside the budget", () => {
    const db = seeded();
    db.markSourceError("hours", "token rejected", NOW);

    const status = buildState(db, { hours: HOUR }).meta.hours;

    expect(status).toMatchObject({ ok: false, error: "token rejected", staleAfter: HOUR });
  });
});
