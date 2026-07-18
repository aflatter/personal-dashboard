import { describe, expect, it } from "vitest";
import { Db } from "../store/db.ts";
import { localDay } from "../time.ts";
import type { Source } from "../sources/port.ts";
import { commit, pollOnce } from "./sampler.ts";

const NOW = new Date(2026, 5, 24, 12, 0, 0).getTime();
const DAY = localDay(NOW);

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
