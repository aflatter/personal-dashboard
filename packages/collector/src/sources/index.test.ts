import { describe, expect, it } from "vitest";
import { Db } from "../store/db.ts";
import type { Secrets } from "../secrets.ts";
import type { Poll, Source } from "./port.ts";
import { syncBankOnce } from "./index.ts";

const NOW = new Date(2026, 5, 24, 12, 0, 0).getTime();
const NO_SECRETS: Secrets = {};

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

/** A fake `bank` source that counts poll calls; `over` tweaks readiness/behaviour. */
function bankFake(over: Partial<Source> = {}): { source: Source; polls: () => number } {
  let polls = 0;
  const source: Source = {
    id: "bank",
    historyMetrics: [],
    ready: () => true,
    poll: async (): Promise<Poll> => {
      polls++;
      return { metrics: {}, snapshot: { unchecked: 2, syncedAt: NOW } };
    },
    ...over,
  };
  return { source, polls: () => polls };
}

describe("syncBankOnce", () => {
  it("coalesces concurrent callers into a single poll", async () => {
    const db = new Db(":memory:");
    const gate = deferred<void>();
    let polls = 0;
    const source: Source = {
      id: "bank",
      historyMetrics: [],
      ready: () => true,
      poll: async (): Promise<Poll> => {
        polls++;
        await gate.promise;
        return { metrics: {}, snapshot: { unchecked: 2, syncedAt: NOW } };
      },
    };

    const p1 = syncBankOnce(db, NO_SECRETS, NOW, source);
    const p2 = syncBankOnce(db, NO_SECRETS, NOW, source);

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
    const { source, polls } = bankFake();

    await syncBankOnce(db, NO_SECRETS, NOW, source);
    await syncBankOnce(db, NO_SECRETS, NOW, source);

    // The `.finally` cleared the in-flight ref, so the second call runs fresh.
    expect(polls()).toBe(2);
  });

  it("records a source error and does not poll when the source is not ready", async () => {
    const db = new Db(":memory:");
    db.putSnapshot("bank", { unchecked: 3, syncedAt: NOW }, NOW, true); // last-good
    const { source, polls } = bankFake({ ready: () => false });

    await syncBankOnce(db, NO_SECRETS, NOW, source);

    expect(polls()).toBe(0);
    const snap = db.getSnapshot<{ unchecked: number }>("bank");
    expect(snap?.ok).toBe(false);
    expect(snap?.error).toContain("macOS");
    // Last-good snapshot is preserved, only liveness flipped.
    expect(snap?.data.unchecked).toBe(3);
  });
});
