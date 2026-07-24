import { describe, expect, it } from "vitest";
import { berlinDayStart, berlinDays, localDay } from "./time.ts";

const iso = (ms: number) => new Date(ms).toISOString();

describe("berlinDayStart", () => {
  it("returns the UTC instant of Berlin midnight (summer, UTC+2)", () => {
    // 2026-07-20 14:30 Berlin === 12:30Z; day starts at 2026-07-19 22:00Z.
    const t = Date.UTC(2026, 6, 20, 12, 30, 0);
    expect(iso(berlinDayStart(t))).toBe("2026-07-19T22:00:00.000Z");
    expect(localDay(berlinDayStart(t))).toBe("2026-07-20");
  });

  it("returns the UTC instant of Berlin midnight (winter, UTC+1)", () => {
    // 2026-01-15 08:00 Berlin === 07:00Z; day starts at 2026-01-14 23:00Z.
    const t = Date.UTC(2026, 0, 15, 7, 0, 0);
    expect(iso(berlinDayStart(t))).toBe("2026-01-14T23:00:00.000Z");
  });

  it("is idempotent — the start of a day is its own day-start", () => {
    const t = Date.UTC(2026, 6, 20, 12, 30, 0);
    const start = berlinDayStart(t);
    expect(berlinDayStart(start)).toBe(start);
  });
});

describe("berlinDays", () => {
  it("yields `count` consecutive days, oldest first, ending on today", () => {
    const now = Date.UTC(2026, 6, 20, 12, 0, 0);
    const days = berlinDays(now, 3);
    expect(days.map((d) => d.day)).toEqual(["2026-07-18", "2026-07-19", "2026-07-20"]);
  });

  it("each range is half-open and the days tile without gaps or overlap", () => {
    const days = berlinDays(Date.UTC(2026, 6, 20, 12, 0, 0), 5);
    for (let i = 1; i < days.length; i++) {
      expect(days[i].startMs).toBe(days[i - 1].endMs);
    }
    for (const d of days) {
      expect(d.endMs - d.startMs).toBe(24 * 3_600_000); // 24h outside DST weeks
      expect(localDay(d.startMs)).toBe(d.day);
    }
  });

  it("spans the spring-forward day as 23h (DST gap), still midnight-to-midnight", () => {
    // Germany springs forward on 2026-03-29 (clocks skip 02:00→03:00).
    const days = berlinDays(Date.UTC(2026, 2, 29, 12, 0, 0), 1);
    expect(days[0].day).toBe("2026-03-29");
    expect(days[0].endMs - days[0].startMs).toBe(23 * 3_600_000);
    expect(localDay(days[0].startMs)).toBe("2026-03-29");
    expect(localDay(days[0].endMs)).toBe("2026-03-30");
  });

  it("spans the fall-back day as 25h (DST overlap)", () => {
    // Germany falls back on 2026-10-25 (02:00 repeats).
    const days = berlinDays(Date.UTC(2026, 9, 25, 12, 0, 0), 1);
    expect(days[0].endMs - days[0].startMs).toBe(25 * 3_600_000);
  });
});
