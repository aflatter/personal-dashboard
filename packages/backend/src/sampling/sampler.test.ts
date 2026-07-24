import { describe, expect, it } from "vitest";
import { Db, flowBuckets } from "../store/db.ts";
import { localDay } from "@dash/collector/time";
import type { Source } from "@dash/collector/sources/port";
import { commit, pollOnce } from "./sampler.ts";

const NOW = new Date(2026, 5, 24, 12, 0, 0).getTime();
const DAY = localDay(NOW);

const todayBucket = flowBuckets(NOW, 1);

function fakeSource(over: Partial<Source> = {}): Source {
  return {
    id: "inbox:personal",
    historyMetrics: ["unread", "total"],
    poll: async () => ({ metrics: { unread: 5, total: 9 }, snapshot: { unread: 5, total: 9 } }),
    ...over,
  };
}

describe("commit", () => {
  it("upserts today's history buckets and the snapshot", () => {
    const db = new Db(":memory:");
    commit(db, fakeSource(), { metrics: { unread: 5, total: 9 }, snapshot: { unread: 5 } }, NOW);
    expect(db.samples("inbox:personal", "unread")).toEqual([{ day: DAY, value: 5 }]);
    expect(db.getSnapshot("inbox:personal")?.ok).toBe(true);
  });

  it("is idempotent — a second poll the same day overwrites, not appends", () => {
    const db = new Db(":memory:");
    commit(db, fakeSource(), { metrics: { unread: 5, total: 9 }, snapshot: {} }, NOW);
    commit(db, fakeSource(), { metrics: { unread: 7, total: 9 }, snapshot: {} }, NOW);
    expect(db.samples("inbox:personal", "unread")).toEqual([{ day: DAY, value: 7 }]);
  });

  it("reconciles inbox membership when the poll reports it", () => {
    const db = new Db(":memory:");
    const base = { metrics: { unread: 5, total: 9 }, snapshot: {} };
    commit(db, fakeSource(), { ...base, inboxMembers: ["m1", "m2"] }, NOW); // cold-start baseline
    commit(db, fakeSource(), { ...base, inboxMembers: ["m2", "m3"] }, NOW); // m3 arrives, m1 departs
    expect(db.flowByDay("inbox:personal", "first_seen_at", todayBucket)).toEqual([
      { day: DAY, value: 1 }, // m3 (m1/m2 were baseline)
    ]);
    expect(db.flowByDay("inbox:personal", "departed_at", todayBucket)).toEqual([
      { day: DAY, value: 1 }, // m1
    ]);
  });

  it("leaves the lifecycle log untouched when the poll has no membership", () => {
    const db = new Db(":memory:");
    commit(db, fakeSource(), { metrics: { unread: 5, total: 9 }, snapshot: {} }, NOW);
    expect(db.flowByDay("inbox:personal", "first_seen_at", todayBucket)).toEqual([
      { day: DAY, value: 0 },
    ]);
  });
});

describe("pollOnce", () => {
  it("records a successful poll", async () => {
    const db = new Db(":memory:");
    await pollOnce(db, fakeSource(), NOW);
    expect(db.getSnapshot("inbox:personal")?.ok).toBe(true);
  });

  it("isolates a failing source: marks it ok=false without throwing", async () => {
    const db = new Db(":memory:");
    db.putSnapshot("inbox:personal", { unread: 1 }, NOW, true); // last-good
    const throwing = fakeSource({
      poll: async () => {
        throw new Error("boom");
      },
    });
    await expect(pollOnce(db, throwing, NOW)).resolves.toBeUndefined();
    const snap = db.getSnapshot("inbox:personal");
    expect(snap?.ok).toBe(false);
    expect(snap?.error).toContain("boom");
  });
});
