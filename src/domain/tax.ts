import type { Settings } from './types';
import { counter } from './counter';
import { tageDative, tageNominative, type TaskLineView } from './task-line';

type Thresholds = Pick<Settings, 'dueSoonThreshold' | 'overdueThreshold'>;

/**
 * Company receipts upload to the tax office (Firmenbelege · Finanzamt): a plain
 * day-counter. Calm ("aktuell") shows time since the last upload; otherwise it
 * reports how long the upload has been due / overdue.
 */
export function taxCalc(now: number, taxDoneAt: number, thresholds: Thresholds): TaskLineView {
  const c = counter(taxDoneAt, thresholds, now);

  if (c.status === 'aktuell') {
    return {
      done: true,
      linePre: 'Letzter Upload vor ',
      lineEm: tageDative(c.days),
      lineEmColor: '#3E8E6B',
      linePost: '',
      last: c.last,
    };
  }

  return {
    done: false,
    linePre: '',
    lineEm: tageNominative(c.days),
    lineEmColor: c.emphasisColor,
    linePost: c.status === 'überfällig' ? ' überfällig' : ' fällig',
    last: c.last,
  };
}
