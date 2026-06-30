import type { CounterStatus, Settings } from './types';

export const DAY = 86_400_000;

export const MONTHS = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
] as const;

/** Emphasis (ring/number) and status-word colors per day-counter status. */
export const STATUS_COLORS: Record<CounterStatus, { emphasis: string; word: string }> = {
  aktuell: { emphasis: '#3E8E6B', word: '#3E8E6B' },
  'fällig bald': { emphasis: '#C9991F', word: '#9A7322' },
  überfällig: { emphasis: '#C2453A', word: '#B23A2E' },
};

/** Base colors cycled per client in the Arbeitszeit widget. */
export const CLIENT_COLORS = ['#6E84CC', '#4F9E86', '#C2925A'] as const;

/** Week-delta colors: unread falling is good (green), rising is bad (amber). */
export const DELTA_DOWN = '#3E8E6B';
export const DELTA_UP = '#B98A3A';
export const DELTA_FLAT = '#9A9A95';

export const SUCCESS = '#3E8E6B';

export const DEFAULT_SETTINGS: Settings = {
  overdueThreshold: 21,
  dueSoonThreshold: 7,
  clockSeconds: false,
};
