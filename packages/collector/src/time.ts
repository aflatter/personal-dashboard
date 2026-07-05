export const DAY = 86_400_000;

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
