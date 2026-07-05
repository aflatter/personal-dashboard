import { describe, expect, it } from "vitest";
import { taxCalc } from "./tax";
import { DAY } from "./constants";

const NOW = new Date(2026, 5, 24).getTime();
const THRESHOLDS = { dueSoonThreshold: 7, overdueThreshold: 21 };

describe("taxCalc", () => {
  it("is calm and reports time since the last upload", () => {
    const line = taxCalc(NOW, NOW - 3 * DAY, THRESHOLDS);
    expect(line.done).toBe(true);
    expect(line.kind).toBe("calm-since");
    expect(line.days).toBe(3);
  });

  it('is "fällig" between the thresholds', () => {
    const line = taxCalc(NOW, NOW - 14 * DAY, THRESHOLDS);
    expect(line.done).toBe(false);
    expect(line.kind).toBe("due");
    expect(line.days).toBe(14);
  });

  it('is "überfällig" beyond the overdue threshold', () => {
    const line = taxCalc(NOW, NOW - 30 * DAY, THRESHOLDS);
    expect(line.done).toBe(false);
    expect(line.kind).toBe("overdue");
    expect(line.days).toBe(30);
  });
});
