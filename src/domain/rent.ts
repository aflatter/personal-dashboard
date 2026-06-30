import { DAY } from './constants';
import { formatDayMonth } from './format';
import { tageDative, tageNominative, type TaskLineView } from './task-line';

/** The n-th weekday (Mon–Fri) of a given month, or null if it doesn't exist. */
export function nthWorkday(year: number, month: number, n: number): Date | null {
  let count = 0;
  for (let d = 1; d <= 31; d++) {
    const date = new Date(year, month, d);
    if (date.getMonth() !== month) break;
    const wd = date.getDay();
    if (wd >= 1 && wd <= 5) {
      count++;
      if (count === n) return date;
    }
  }
  return null;
}

const DUE_WORKDAY = 4; // rent bookkeeping is due by the 4th workday of the month
const GRACE_DAYS = 5;

/**
 * Rent bookkeeping (Mietbuchhaltung): due by the 4th workday each month, with
 * a 5-day grace window before it counts as overdue. Calm while the current
 * cycle is done or the due date hasn't arrived yet.
 */
export function rentCalc(now: number, rentDoneAt: number | null): TaskLineView {
  const nowDate = new Date(now);
  const year = nowDate.getFullYear();
  const month = nowDate.getMonth();
  const today = new Date(year, month, nowDate.getDate());

  const dueDate = nthWorkday(year, month, DUE_WORKDAY)!;
  const graceEnd = new Date(dueDate.getTime() + GRACE_DAYS * DAY);
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  const nextDue = nthWorkday(nextYear, nextMonth, DUE_WORKDAY)!;

  const isDoneCycle = rentDoneAt != null && new Date(rentDoneAt) >= dueDate;
  const beforeDue = today < dueDate;
  const last = rentDoneAt != null ? formatDayMonth(rentDoneAt) : '—';
  const daysUntil = (target: Date) => Math.max(0, Math.ceil((target.getTime() - today.getTime()) / DAY));

  // Calm: this cycle is handled, or the next due date hasn't arrived.
  if (isDoneCycle || beforeDue) {
    const target = isDoneCycle ? nextDue : dueDate;
    return {
      done: true,
      linePre: 'Nächste Fälligkeit in ',
      lineEm: tageDative(daysUntil(target)),
      lineEmColor: '#3E8E6B',
      linePost: '',
      last,
    };
  }

  // Urgent: past due and not done this cycle.
  const daysOverdue = Math.max(0, Math.ceil((today.getTime() - dueDate.getTime()) / DAY));
  const overdue = today > graceEnd;
  return {
    done: false,
    linePre: '',
    lineEm: tageNominative(daysOverdue),
    lineEmColor: overdue ? '#C2453A' : '#C9991F',
    linePost: overdue ? ' überfällig' : ' fällig',
    last,
  };
}
