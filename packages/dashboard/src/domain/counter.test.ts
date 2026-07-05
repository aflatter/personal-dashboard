import { describe, expect, it } from "vitest";
import { counter } from "./counter";
import { DAY } from "./constants";

const NOW = new Date(2026, 5, 24).getTime();
const THRESHOLDS = { dueSoonThreshold: 7, overdueThreshold: 21 };

describe("counter", () => {
  it("counts whole days since the task was done", () => {
    expect(counter(NOW - 3 * DAY, THRESHOLDS, NOW).days).toBe(3);
  });

  it("classifies status by the thresholds (inclusive)", () => {
    expect(counter(NOW - 7 * DAY, THRESHOLDS, NOW).status).toBe("current");
    expect(counter(NOW - 8 * DAY, THRESHOLDS, NOW).status).toBe("due-soon");
    expect(counter(NOW - 21 * DAY, THRESHOLDS, NOW).status).toBe("due-soon");
    expect(counter(NOW - 22 * DAY, THRESHOLDS, NOW).status).toBe("overdue");
  });

  it("clamps the ring fraction to [0, 1]", () => {
    expect(counter(NOW - 5 * DAY, THRESHOLDS, NOW).fraction).toBeCloseTo(5 / 21);
    expect(counter(NOW - 100 * DAY, THRESHOLDS, NOW).fraction).toBe(1);
  });
});
