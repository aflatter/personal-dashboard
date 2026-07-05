import { describe, expect, it } from "vitest";
import { nthWorkday, rentCalc } from "./rent";

const at = (y: number, m: number, d: number) => new Date(y, m, d).getTime();

describe("nthWorkday", () => {
  it("finds the 4th workday of June 2026 (1 Jun is a Monday → 4 Jun)", () => {
    expect(nthWorkday(2026, 5, 4)).toEqual(new Date(2026, 5, 4));
  });

  it("skips weekends — 4th workday of July 2026 is Mon 6 Jul", () => {
    expect(nthWorkday(2026, 6, 4)).toEqual(new Date(2026, 6, 6));
  });
});

describe("rentCalc", () => {
  it("is calm and counts down before the due date", () => {
    const line = rentCalc(at(2026, 5, 2), null); // 2 Jun, due 4 Jun
    expect(line.done).toBe(true);
    expect(line.kind).toBe("calm-next-due");
    expect(line.days).toBe(2);
  });

  it("points to next month once this cycle is done", () => {
    const line = rentCalc(at(2026, 5, 10), at(2026, 5, 5)); // done 5 Jun ≥ due 4 Jun
    expect(line.done).toBe(true);
    expect(line.kind).toBe("calm-next-due");
    expect(line.days).toBe(26); // until 6 Jul
  });

  it('is "fällig" within the grace window', () => {
    const line = rentCalc(at(2026, 5, 7), null); // 3 days past due, grace ends 9 Jun
    expect(line.done).toBe(false);
    expect(line.kind).toBe("due");
    expect(line.days).toBe(3);
  });

  it('is "überfällig" past the grace window', () => {
    const line = rentCalc(at(2026, 5, 20), null); // well past grace
    expect(line.done).toBe(false);
    expect(line.kind).toBe("overdue");
    expect(line.days).toBe(16);
  });
});
