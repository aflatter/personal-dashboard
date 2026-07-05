import { describe, expect, it } from "vitest";
import { formatClock, formatDayMonth, formatHeaderDate, formatHours, formatMonth } from "./format";

describe("formatHours", () => {
  it("uses a de-DE comma and one decimal", () => {
    expect(formatHours(18.5)).toBe("18,5");
    expect(formatHours(23.49)).toBe("23,5");
  });

  it("strips a trailing ,0", () => {
    expect(formatHours(5)).toBe("5");
    expect(formatHours(24)).toBe("24");
  });
});

describe("formatMonth", () => {
  it("returns the de-DE full month for a timestamp", () => {
    expect(formatMonth(new Date(2026, 0, 15).getTime())).toBe("Januar");
    expect(formatMonth(new Date(2026, 5, 15).getTime())).toBe("Juni");
  });
});

describe("formatDayMonth", () => {
  it("renders de-DE day + full month", () => {
    expect(formatDayMonth(new Date(2026, 5, 12).getTime())).toBe("12. Juni");
    expect(formatDayMonth(new Date(2026, 0, 1).getTime())).toBe("1. Januar");
  });
});

describe("formatHeaderDate", () => {
  it('is "Wd · dd.mm.yyyy" with a capitalized weekday and zero padding', () => {
    // 2026-06-24 is a Wednesday.
    expect(formatHeaderDate(new Date(2026, 5, 24).getTime())).toBe("Mi · 24.06.2026");
  });
});

describe("formatClock", () => {
  it("zero-pads HH:MM and adds seconds only when asked", () => {
    const t = new Date(2026, 5, 24, 8, 5, 7).getTime();
    expect(formatClock(t, false)).toBe("08:05");
    expect(formatClock(t, true)).toBe("08:05:07");
  });
});
