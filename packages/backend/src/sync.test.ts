import { describe, expect, it } from "vitest";
import type { BankGate } from "@dash/collector/registry";
import type { Poll, Source } from "@dash/collector/sources/port";
import { Db } from "./store/db.ts";
import { syncBankOnce, syncInboxesOnce } from "./sync.ts";

const NOW = new Date(2026, 5, 24, 12, 0, 0).getTime();

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** A fake configured `bank` gate that counts poll calls. */
function bankFake(): { gate: BankGate; polls: () => number } {
  let polls = 0;
  const source: Source = {
    id: "bank",
    historyMetrics: [],
    poll: async (): Promise<Poll> => {
      polls++;
      return { metrics: {}, snapshot: { unchecked: 2, syncedAt: NOW } };
    },
  };
  return { gate: { source }, polls: () => polls };
}

describe("syncBankOnce", () => {
  it("coalesces concurrent callers into a single poll", async () => {
    const db = new Db(":memory:");
    const gate = deferred<void>();
    let polls = 0;
    const source: Source = {
      id: "bank",
      historyMetrics: [],
      poll: async (): Promise<Poll> => {
        polls++;
        await gate.promise;
        return { metrics: {}, snapshot: { unchecked: 2, syncedAt: NOW } };
      },
    };

    const p1 = syncBankOnce(db, { source }, NOW);
    const p2 = syncBankOnce(db, { source }, NOW);

    // Both callers share the one in-flight run — poll fired exactly once.
    expect(polls).toBe(1);
    expect(p1).toBe(p2);

    gate.resolve();
    await Promise.all([p1, p2]);

    expect(polls).toBe(1);
    expect(db.getSnapshot("bank")?.ok).toBe(true);
  });

  it("polls again once the in-flight sync has settled", async () => {
    const db = new Db(":memory:");
    const { gate, polls } = bankFake();

    await syncBankOnce(db, gate, NOW);
    await syncBankOnce(db, gate, NOW);

    // The `.finally` cleared the in-flight ref, so the second call runs fresh.
    expect(polls()).toBe(2);
  });

  it("records the gate reason and does not poll when the bank is gated off", async () => {
    const db = new Db(":memory:");
    db.putSnapshot("bank", { unchecked: 3, syncedAt: NOW }, NOW, true); // last-good

    await syncBankOnce(db, { source: null, reason: "MoneyMoney sync needs macOS" }, NOW);

    const snap = db.getSnapshot<{ unchecked: number }>("bank");
    expect(snap?.ok).toBe(false);
    expect(snap?.error).toBe("MoneyMoney sync needs macOS");
    // Last-good snapshot is preserved, only liveness flipped.
    expect(snap?.data.unchecked).toBe(3);
  });
});

/** A fake inbox source that counts polls and returns given counts. */
function inboxFake(
  id: "inbox:personal" | "inbox:work",
  unread: number,
  total: number,
): { source: Source; polls: () => number } {
  let polls = 0;
  const account = id === "inbox:personal" ? "personal" : "work";
  const source: Source = {
    id,
    historyMetrics: ["unread", "total"],
    poll: async (): Promise<Poll> => {
      polls++;
      return {
        metrics: { unread, total },
        snapshot: { account, email: `${account}@example.com`, protocol: "JMAP", unread, total },
      };
    },
  };
  return { source, polls: () => polls };
}

describe("syncInboxesOnce", () => {
  it("polls every inbox and writes fresh snapshots", async () => {
    const db = new Db(":memory:");
    const personal = inboxFake("inbox:personal", 5, 40);
    const work = inboxFake("inbox:work", 1, 12);

    await syncInboxesOnce(db, [personal.source, work.source], NOW);

    expect(personal.polls()).toBe(1);
    expect(work.polls()).toBe(1);
    expect(db.getSnapshot<{ unread: number }>("inbox:personal")?.data.unread).toBe(5);
    expect(db.getSnapshot<{ total: number }>("inbox:work")?.data.total).toBe(12);
  });

  it("coalesces concurrent callers into a single round of polls", async () => {
    const db = new Db(":memory:");
    const gate = deferred<void>();
    let polls = 0;
    const source: Source = {
      id: "inbox:personal",
      historyMetrics: ["unread", "total"],
      poll: async (): Promise<Poll> => {
        polls++;
        await gate.promise;
        return {
          metrics: { unread: 5, total: 40 },
          snapshot: {
            account: "personal",
            email: "p@example.com",
            protocol: "JMAP",
            unread: 5,
            total: 40,
          },
        };
      },
    };

    const p1 = syncInboxesOnce(db, [source], NOW);
    const p2 = syncInboxesOnce(db, [source], NOW);

    expect(polls).toBe(1);
    expect(p1).toBe(p2);

    gate.resolve();
    await Promise.all([p1, p2]);
    expect(polls).toBe(1);
  });

  it("isolates a failing account — the other still updates and it never throws", async () => {
    const db = new Db(":memory:");
    // A prior snapshot exists (seeded in prod); markSourceError flips its liveness.
    db.putSnapshot(
      "inbox:personal",
      { account: "personal", email: "p@example.com", protocol: "JMAP", unread: 9, total: 44 },
      NOW,
      true,
    );
    const ok = inboxFake("inbox:work", 1, 12);
    const failing: Source = {
      id: "inbox:personal",
      historyMetrics: ["unread", "total"],
      poll: async (): Promise<Poll> => {
        throw new Error("token rejected");
      },
    };

    await expect(syncInboxesOnce(db, [failing, ok.source], NOW)).resolves.toBeUndefined();

    expect(ok.polls()).toBe(1);
    expect(db.getSnapshot<{ total: number }>("inbox:work")?.data.total).toBe(12);
    const bad = db.getSnapshot<{ unread: number }>("inbox:personal");
    expect(bad?.ok).toBe(false);
    expect(bad?.error).toBe("token rejected");
    // Last-good counts preserved, only liveness flipped.
    expect(bad?.data.unread).toBe(9);
  });
});
