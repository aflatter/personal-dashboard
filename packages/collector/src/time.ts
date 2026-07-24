export const DAY = 86_400_000;
const HOUR = 3_600_000;

const dayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Local calendar day "YYYY-MM-DD" (Europe/Berlin) for a timestamp — the history bucket key. */
export function localDay(ms: number): string {
  return dayFmt.format(new Date(ms));
}

const wallFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Berlin",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Offset in ms that Berlin's wall clock is ahead of UTC at instant `t`. */
function berlinOffset(t: number): number {
  const p = wallFmt.formatToParts(new Date(t));
  const at = (type: string) => Number(p.find((x) => x.type === type)?.value);
  const asUtc = Date.UTC(
    at("year"),
    at("month") - 1,
    at("day"),
    at("hour"),
    at("minute"),
    at("second"),
  );
  return asUtc - Math.floor(t / 1000) * 1000;
}

/**
 * UTC ms of the start (00:00 Europe/Berlin) of the calendar day containing `t`.
 * Convert the day's wall-clock midnight to a UTC instant via the zone offset;
 * DST-correct even on transition days, where the offset at midnight differs from
 * the offset at `t` (one correction step settles the boundary).
 */
export function berlinDayStart(t: number): number {
  const [y, m, d] = localDay(t).split("-").map(Number);
  const midnightAsUtc = Date.UTC(y, m - 1, d); // wall-clock midnight read as if UTC
  let start = midnightAsUtc - berlinOffset(midnightAsUtc);
  const offsetThere = berlinOffset(start);
  if (offsetThere !== berlinOffset(midnightAsUtc)) start = midnightAsUtc - offsetThere;
  return start;
}

export interface DayRange {
  /** Local calendar day "YYYY-MM-DD" (Europe/Berlin). */
  day: string;
  /** UTC ms of 00:00 Berlin — inclusive lower bound. */
  startMs: number;
  /** UTC ms of the next 00:00 Berlin — exclusive upper bound. */
  endMs: number;
}

/**
 * The `count` Berlin calendar days ending with the one containing `now`, oldest
 * first, each as a half-open UTC instant range [startMs, endMs). Anchored at
 * local noon per day so the ±DAY steps never straddle a DST transition (which
 * happens near 02:00–03:00); `endMs` is recomputed from the next day's noon, so a
 * 23h/25h DST day still spans exactly its own midnight-to-midnight.
 */
export function berlinDays(now: number, count: number): DayRange[] {
  const noonToday = berlinDayStart(now) + 12 * HOUR;
  const out: DayRange[] = [];
  for (let k = count - 1; k >= 0; k--) {
    const noon = noonToday - k * DAY;
    const startMs = berlinDayStart(noon);
    out.push({ day: localDay(noon), startMs, endMs: berlinDayStart(noon + DAY) });
  }
  return out;
}
