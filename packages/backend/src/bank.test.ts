import { describe, expect, it } from "vitest";
import type { BankState } from "@dash/collector/contract";
import { recordBankBacklog } from "./bank.ts";
import { Db } from "./store/db.ts";

const NOW = new Date(2026, 5, 24, 12, 0, 0).getTime();

describe("recordBankBacklog", () => {
  it("stores the pushed backlog as a live bank snapshot", () => {
    const db = new Db(":memory:");
    recordBankBacklog(db, { unchecked: 7, syncedAt: NOW }, NOW);

    const snap = db.getSnapshot<BankState>("bank");
    expect(snap?.ok).toBe(true);
    expect(snap?.data.unchecked).toBe(7);
    expect(snap?.data.syncedAt).toBe(NOW);
  });

  it("defaults syncedAt to now when the agent omits it", () => {
    const db = new Db(":memory:");
    recordBankBacklog(db, { unchecked: 3 }, NOW);

    expect(db.getSnapshot<BankState>("bank")?.data.syncedAt).toBe(NOW);
  });

  it("overwrites the previous backlog and clears a prior error (ok flips back true)", () => {
    const db = new Db(":memory:");
    db.putSnapshot(
      "bank",
      { unchecked: 99, syncedAt: NOW } satisfies BankState,
      NOW,
      false,
      "was locked",
    );

    recordBankBacklog(db, { unchecked: 2, syncedAt: NOW }, NOW + 1000);

    const snap = db.getSnapshot<BankState>("bank");
    expect(snap?.data.unchecked).toBe(2);
    expect(snap?.ok).toBe(true);
    expect(snap?.error).toBeUndefined();
  });
});
