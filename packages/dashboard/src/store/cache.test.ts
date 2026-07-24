import { beforeEach, describe, expect, it } from "vitest";
import type { DashboardState } from "../api/client";
import { loadCache, saveCache } from "./cache";

const store = new Map<string, string>();

// Minimal localStorage stand-in — these tests are about the parse boundary,
// not the browser API.
beforeEach(() => {
  store.clear();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
});

const status = { polledAt: 1, ok: true };

function makeState(): DashboardState {
  const inbox = {
    account: "personal" as const,
    email: "alex@flatter.io",
    protocol: "JMAP" as const,
    total: 47,
    unread: 12,
    history: [1, 2],
    totalHistory: [3, 4],
    receivedHistory: [5, 6],
    processedHistory: [7, 8],
  };
  return {
    emails: { personal: inbox, work: { ...inbox, account: "work" } },
    clients: [{ name: "Nordlicht", projects: [{ name: "App MVP", hours: 24 }] }],
    rentDoneAt: null,
    taxDoneAt: 123,
    bank: { unchecked: 34, syncedAt: null },
    settings: { overdueThreshold: 21, dueSoonThreshold: 7, clockSeconds: false },
    meta: {
      "inbox:personal": status,
      "inbox:work": status,
      bank: status,
      hours: status,
    },
  };
}

describe("cache", () => {
  it("round-trips a well-formed state", () => {
    const state = makeState();
    saveCache(state);
    expect(loadCache()).toEqual(state);
  });

  it("returns null when nothing is cached", () => {
    expect(loadCache()).toBeNull();
  });

  it("rejects a cache written by an older build that lacks the flow series", () => {
    // Exactly the pre-flow shape: an Inbox with no received/processedHistory.
    const stale = makeState();
    for (const account of ["personal", "work"] as const) {
      const inbox = stale.emails[account] as Partial<(typeof stale.emails)[typeof account]>;
      delete inbox.receivedHistory;
      delete inbox.processedHistory;
    }
    saveCache(stale as DashboardState);
    // Must be discarded, not handed back — returning it would white-screen the
    // first render (buildFlow deref'ing undefined.length).
    expect(loadCache()).toBeNull();
  });

  it("rejects malformed JSON and wrong-typed fields", () => {
    store.set("dashboard-cache-v3", "{not json");
    expect(loadCache()).toBeNull();

    const wrongType = makeState() as unknown as { bank: { unchecked: string } };
    wrongType.bank.unchecked = "lots";
    saveCache(wrongType as unknown as DashboardState);
    expect(loadCache()).toBeNull();
  });
});
