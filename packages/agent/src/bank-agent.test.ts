import { describe, expect, it } from "vitest";
import { createBankAgent } from "./bank-agent.ts";
import type { BankBacklog } from "./collect.ts";

const BACKLOG: BankBacklog = { unchecked: 4, syncedAt: new Date(2026, 5, 24).getTime() };

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

describe("createBankAgent", () => {
  it("collects then pushes, returning the backlog", async () => {
    const pushed: BankBacklog[] = [];
    const agent = createBankAgent({
      collect: async () => BACKLOG,
      push: async (b) => void pushed.push(b),
    });

    const result = await agent.refresh();

    expect(result).toEqual({ ok: true, backlog: BACKLOG });
    expect(pushed).toEqual([BACKLOG]);
  });

  it("coalesces concurrent refreshes into a single collect + push", async () => {
    const gate = deferred<void>();
    let collects = 0;
    let pushes = 0;
    const agent = createBankAgent({
      collect: async () => {
        collects++;
        await gate.promise;
        return BACKLOG;
      },
      push: async () => void pushes++,
    });

    const p1 = agent.refresh();
    const p2 = agent.refresh();
    expect(p1).toBe(p2); // both callers share the one in-flight run
    expect(collects).toBe(1);

    gate.resolve();
    await Promise.all([p1, p2]);

    expect(collects).toBe(1);
    expect(pushes).toBe(1);
  });

  it("runs fresh again once the in-flight refresh settled", async () => {
    let collects = 0;
    const agent = createBankAgent({
      collect: async () => {
        collects++;
        return BACKLOG;
      },
      push: async () => {},
    });

    await agent.refresh();
    await agent.refresh();

    expect(collects).toBe(2);
  });

  it("surfaces a collect failure as { ok:false } and does not push", async () => {
    let pushes = 0;
    const agent = createBankAgent({
      collect: async () => {
        throw new Error("MoneyMoney is locked — unlock it and sync again");
      },
      push: async () => void pushes++,
    });

    const result = await agent.refresh();

    expect(result).toEqual({ ok: false, error: "MoneyMoney is locked — unlock it and sync again" });
    expect(pushes).toBe(0);
  });

  it("surfaces a push failure as { ok:false } (collect succeeded)", async () => {
    const agent = createBankAgent({
      collect: async () => BACKLOG,
      push: async () => {
        throw new Error("backend unreachable");
      },
    });

    expect(await agent.refresh()).toEqual({ ok: false, error: "backend unreachable" });
  });
});
