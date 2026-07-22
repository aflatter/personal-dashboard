import { describe, expect, it } from "vitest";
import type { SourceStatus } from "@dash/collector/contract";
import { sourceProblem, sourceStale } from "./source";

const NOW = new Date(2026, 6, 22, 12, 0, 0).getTime();
const HOUR = 60 * 60 * 1000;

/** A healthy polled source: budget of 3 hours, polled a minute ago. */
const healthy: SourceStatus = { polledAt: NOW - 60_000, ok: true, staleAfter: 3 * HOUR };

describe("sourceStale", () => {
  it("is false while polls keep arriving inside the budget", () => {
    expect(sourceStale(healthy, NOW)).toBe(false);
    expect(sourceStale({ ...healthy, polledAt: NOW - 3 * HOUR }, NOW)).toBe(false);
  });

  it("is true once the budget is exceeded — even though the last poll succeeded", () => {
    const frozen: SourceStatus = { polledAt: NOW - 4 * HOUR, ok: true, staleAfter: 3 * HOUR };
    expect(sourceStale(frozen, NOW)).toBe(true);
  });

  it("is true for a source that has never been polled", () => {
    expect(sourceStale({ polledAt: null, ok: false, staleAfter: 3 * HOUR }, NOW)).toBe(true);
  });

  it("is false without a budget — nothing to miss", () => {
    // The bank (pushed from the Mac) and unconfigured sources land here: no
    // cadence exists, so "overdue" is not a question this rule can answer.
    expect(sourceStale({ polledAt: NOW - 400 * HOUR, ok: true }, NOW)).toBe(false);
    expect(sourceStale({ polledAt: null, ok: false }, NOW)).toBe(false);
  });
});

describe("sourceProblem", () => {
  it("says nothing about a healthy source", () => {
    expect(sourceProblem(healthy, NOW)).toBeNull();
  });

  it("prefers the failed poll's own message — it is the more specific one", () => {
    const failing: SourceStatus = { ...healthy, ok: false, error: "token rejected" };
    expect(sourceProblem(failing, NOW)).toBe("token rejected");

    // Still preferred when the source is *also* stale, which is the usual case:
    // polls have been failing for a while, so nothing fresh has landed either.
    const failingAndStale: SourceStatus = { ...failing, polledAt: NOW - 9 * HOUR };
    expect(sourceProblem(failingAndStale, NOW)).toBe("token rejected");
  });

  it("reports staleness when the last poll succeeded but was long ago", () => {
    const frozen: SourceStatus = { ...healthy, polledAt: NOW - 9 * HOUR };
    expect(sourceProblem(frozen, NOW)).toBe("Daten veraltet — Quelle meldet sich nicht");
  });
});
