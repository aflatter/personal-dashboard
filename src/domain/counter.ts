import type { CounterStatus, Settings } from './types';
import { DAY, STATUS_COLORS } from './constants';
import { formatDayMonth } from './format';

export interface CounterView {
  /** Whole days since the task was last done. */
  days: number;
  status: CounterStatus;
  /** Emphasis color (number / ring) for the status. */
  emphasisColor: string;
  /** Status-word color (tuned for legibility on white). */
  wordColor: string;
  /** Fill fraction `min(days / overdue, 1)` — kept for any ring rendering. */
  fraction: number;
  /** de-DE last-done date, e.g. "12. Juni". */
  last: string;
}

type Thresholds = Pick<Settings, 'dueSoonThreshold' | 'overdueThreshold'>;

/** Derive day-counter status from a last-done timestamp. */
export function counter(doneAt: number, thresholds: Thresholds, now: number): CounterView {
  const { dueSoonThreshold, overdueThreshold } = thresholds;
  const days = Math.max(0, Math.floor((now - doneAt) / DAY));

  let status: CounterStatus;
  if (days <= dueSoonThreshold) status = 'aktuell';
  else if (days <= overdueThreshold) status = 'fällig bald';
  else status = 'überfällig';

  const colors = STATUS_COLORS[status];
  return {
    days,
    status,
    emphasisColor: colors.emphasis,
    wordColor: colors.word,
    fraction: Math.max(0, Math.min(1, days / overdueThreshold)),
    last: formatDayMonth(doneAt),
  };
}
