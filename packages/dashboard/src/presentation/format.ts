// de-DE locale formatting for the view layer, via Intl. Formatters are created
// once at module scope (constructing an Intl.*Format per call is expensive).

const dayMonthFmt = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long" });
const monthFmt = new Intl.DateTimeFormat("de-DE", { month: "long" });
const weekdayFmt = new Intl.DateTimeFormat("de-DE", { weekday: "short" });
const headerDateFmt = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const clockFmt = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const clockSecondsFmt = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});
const hoursFmt = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

/** "Juni" — de-DE full month name for a timestamp. */
export function formatMonth(ms: number): string {
  return monthFmt.format(new Date(ms));
}

/** "12. Juni" — de-DE day + full month. */
export function formatDayMonth(ms: number): string {
  return dayMonthFmt.format(new Date(ms));
}

/** "Mi · 24.06.2026" — short weekday + zero-padded date. */
export function formatHeaderDate(ms: number): string {
  const d = new Date(ms);
  const weekday = weekdayFmt.format(d).replace(".", ""); // some ICU builds append a dot
  return `${weekday} · ${headerDateFmt.format(d)}`;
}

/** "08:45" or "08:45:07" — 24-hour, zero-padded (pair with the .tnum class). */
export function formatClock(ms: number, withSeconds: boolean): string {
  return (withSeconds ? clockSecondsFmt : clockFmt).format(new Date(ms));
}

/** "18,5" / "5" / "24" — de-DE, at most one decimal, no trailing zero. */
export function formatHours(h: number): string {
  return hoursFmt.format(h);
}
