import { MONTHS } from './constants';

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/** "12. Juni" — de-DE day + full month. */
export function formatDayMonth(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}

/** "Mi · 24.06.2026" — short weekday (capitalized, no dot) + zero-padded date. */
export function formatHeaderDate(ms: number): string {
  const d = new Date(ms);
  const weekday = capitalize(d.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', ''));
  const date = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${weekday} · ${date}`;
}

/** "08:45" or "08:45:07" with zero-padded, tabular numerals. */
export function formatClock(ms: number, withSeconds: boolean): string {
  const d = new Date(ms);
  const parts = [d.getHours(), d.getMinutes()];
  if (withSeconds) parts.push(d.getSeconds());
  return parts.map((n) => String(n).padStart(2, '0')).join(':');
}

/**
 * One decimal, trailing ".0" stripped, de-DE comma separator.
 * 18.5 → "18,5", 5 → "5", 24 → "24".
 */
export function formatHours(h: number): string {
  return (Math.round(h * 10) / 10).toFixed(1).replace(/\.0$/, '').replace('.', ',');
}

/** Mix a "#rrggbb" hex toward white by fraction `t` (0..1) → "rgb(r, g, b)". */
export function lighten(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (c: number) => Math.round(c + (255 - c) * t);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}
