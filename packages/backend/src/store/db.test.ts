import { describe, expect, it } from "vitest";
import { Db, flowBuckets as buckets } from "./db.ts";

const SRC = "inbox:personal";

// A Berlin-daytime instant (10:00Z is inside the Berlin day year-round).
const at = (y: number, mo: number, d: number) => new Date(Date.UTC(y, mo, d, 10)).toISOString();

const NOW = Date.UTC(2026, 6, 20, 12, 0, 0); // 2026-07-20; window = 07-18..07-20

describe("applyInboxMembership + flowByDay", () => {
  it("does not count the standing inbox as arrivals on the first-ever poll", () => {
    const db = new Db(":memory:");
    db.applyInboxMembership(SRC, ["base1", "base2"], at(2026, 6, 18)); // cold start
    // baseline rows are dated before any window → zero received, all days.
    expect(db.flowByDay(SRC, "first_seen_at", buckets(NOW, 3))).toEqual([
      { day: "2026-07-18", value: 0 },
      { day: "2026-07-19", value: 0 },
      { day: "2026-07-20", value: 0 },
    ]);
  });

  it("still counts the standing inbox as processed when it later leaves", () => {
    const db = new Db(":memory:");
    db.applyInboxMembership(SRC, ["old1", "old2"], at(2026, 6, 18)); // cold start
    db.applyInboxMembership(SRC, ["old2"], at(2026, 6, 20)); // old1 archived
    // arrival was never observed (NULL first_seen) → no received…
    expect(db.flowByDay(SRC, "first_seen_at", buckets(NOW, 3))).toEqual([
      { day: "2026-07-18", value: 0 },
      { day: "2026-07-19", value: 0 },
      { day: "2026-07-20", value: 0 },
    ]);
    // …but clearing it is real work and does count.
    expect(db.flowByDay(SRC, "departed_at", buckets(NOW, 3))).toEqual([
      { day: "2026-07-18", value: 0 },
      { day: "2026-07-19", value: 0 },
      { day: "2026-07-20", value: 1 },
    ]);
  });

  it("records arrivals and departures on the day observed", () => {
    const db = new Db(":memory:");
    db.applyInboxMembership(SRC, ["base1", "base2"], at(2026, 6, 18)); // cold start (baseline)
    db.applyInboxMembership(SRC, ["base1", "base2", "A", "B"], at(2026, 6, 19)); // A, B arrive
    db.applyInboxMembership(SRC, ["base1", "base2", "B", "C"], at(2026, 6, 20)); // C arrives, A departs

    expect(db.flowByDay(SRC, "first_seen_at", buckets(NOW, 3))).toEqual([
      { day: "2026-07-18", value: 0 },
      { day: "2026-07-19", value: 2 }, // A, B
      { day: "2026-07-20", value: 1 }, // C
    ]);
    expect(db.flowByDay(SRC, "departed_at", buckets(NOW, 3))).toEqual([
      { day: "2026-07-18", value: 0 },
      { day: "2026-07-19", value: 0 },
      { day: "2026-07-20", value: 1 }, // A left
    ]);
  });

  it("revives a re-arrival instead of double-counting it", () => {
    const db = new Db(":memory:");
    db.applyInboxMembership(SRC, ["A"], at(2026, 6, 18)); // baseline
    db.applyInboxMembership(SRC, ["A", "B"], at(2026, 6, 19)); // B arrives
    db.applyInboxMembership(SRC, ["A"], at(2026, 6, 20)); // B departs
    db.applyInboxMembership(SRC, ["A", "B"], at(2026, 6, 20)); // B comes back same day

    // B keeps its original arrival day and is no longer counted as departed.
    expect(db.flowByDay(SRC, "first_seen_at", buckets(NOW, 3))).toEqual([
      { day: "2026-07-18", value: 0 },
      { day: "2026-07-19", value: 1 }, // B's single arrival
      { day: "2026-07-20", value: 0 },
    ]);
    expect(db.flowByDay(SRC, "departed_at", buckets(NOW, 3))).toEqual([
      { day: "2026-07-18", value: 0 },
      { day: "2026-07-19", value: 0 },
      { day: "2026-07-20", value: 0 }, // revived → not departed
    ]);
  });

  it("is idempotent — re-applying the same set records nothing new", () => {
    const db = new Db(":memory:");
    db.applyInboxMembership(SRC, ["base"], at(2026, 6, 18)); // baseline
    db.applyInboxMembership(SRC, ["base", "A"], at(2026, 6, 19)); // A arrives
    db.applyInboxMembership(SRC, ["base", "A"], at(2026, 6, 20)); // unchanged
    expect(db.flowByDay(SRC, "first_seen_at", buckets(NOW, 3))).toEqual([
      { day: "2026-07-18", value: 0 },
      { day: "2026-07-19", value: 1 },
      { day: "2026-07-20", value: 0 }, // no phantom arrival
    ]);
    expect(db.flowByDay(SRC, "departed_at", buckets(NOW, 3))).toEqual([
      { day: "2026-07-18", value: 0 },
      { day: "2026-07-19", value: 0 },
      { day: "2026-07-20", value: 0 },
    ]);
  });

  it("folds a nested applyInboxMembership into the caller's transaction", () => {
    const db = new Db(":memory:");
    db.applyInboxMembership(SRC, ["a"], at(2026, 6, 18)); // baseline
    expect(() =>
      db.transaction(() => {
        db.upsertSample(SRC, "unread", "2026-07-20", 5);
        db.applyInboxMembership(SRC, ["a", "b"], at(2026, 6, 20)); // must join, not nest
        throw new Error("boom");
      }),
    ).toThrow("boom");
    // Everything in the outer transaction rolled back together.
    expect(db.samples(SRC, "unread")).toEqual([]);
    expect(db.flowByDay(SRC, "first_seen_at", buckets(NOW, 3))[2]).toEqual({
      day: "2026-07-20",
      value: 0,
    });
  });

  it("keeps accounts separate by source", () => {
    const db = new Db(":memory:");
    db.applyInboxMembership("inbox:personal", [], at(2026, 6, 18)); // both cold-start empty
    db.applyInboxMembership("inbox:work", [], at(2026, 6, 18));
    db.applyInboxMembership("inbox:personal", ["A"], at(2026, 6, 19));
    expect(db.flowByDay("inbox:personal", "first_seen_at", buckets(NOW, 3))[1]).toEqual({
      day: "2026-07-19",
      value: 1,
    });
    expect(db.flowByDay("inbox:work", "first_seen_at", buckets(NOW, 3))[1]).toEqual({
      day: "2026-07-19",
      value: 0,
    });
  });
});
