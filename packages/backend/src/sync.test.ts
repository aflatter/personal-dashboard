import { describe, expect, it } from "vitest";
import type { BankGate } from "@dash/collector/registry";
import type { Poll, Source } from "@dash/collector/sources/port";
import { Db } from "./store/db.ts";
import { syncBankOnce } from "./sync.ts";

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
