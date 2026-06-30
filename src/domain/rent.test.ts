import { describe, expect, it } from 'vitest';
import { nthWorkday, rentCalc } from './rent';

const at = (y: number, m: number, d: number) => new Date(y, m, d).getTime();

describe('nthWorkday', () => {
  it('finds the 4th workday of June 2026 (1 Jun is a Monday → 4 Jun)', () => {
    expect(nthWorkday(2026, 5, 4)).toEqual(new Date(2026, 5, 4));
  });

  it('skips weekends — 4th workday of July 2026 is Mon 6 Jul', () => {
    expect(nthWorkday(2026, 6, 4)).toEqual(new Date(2026, 6, 6));
  });
});

describe('rentCalc', () => {
  it('is calm and counts down before the due date', () => {
    const line = rentCalc(at(2026, 5, 2), null); // 2 Jun, due 4 Jun
    expect(line.done).toBe(true);
    expect(line.linePre).toBe('Nächste Fälligkeit in ');
    expect(line.lineEm).toBe('2 Tagen');
    expect(line.lineEmColor).toBe('#3E8E6B');
  });

  it('points to next month once this cycle is done', () => {
    const line = rentCalc(at(2026, 5, 10), at(2026, 5, 5)); // done 5 Jun ≥ due 4 Jun
    expect(line.done).toBe(true);
    expect(line.lineEm).toBe('26 Tagen'); // until 6 Jul
  });

  it('is "fällig" within the grace window', () => {
    const line = rentCalc(at(2026, 5, 7), null); // 3 days past due, grace ends 9 Jun
    expect(line.done).toBe(false);
    expect(line.lineEm).toBe('3 Tage');
    expect(line.linePost).toBe(' fällig');
    expect(line.lineEmColor).toBe('#C9991F');
  });

  it('is "überfällig" past the grace window', () => {
    const line = rentCalc(at(2026, 5, 20), null); // well past grace
    expect(line.done).toBe(false);
    expect(line.lineEm).toBe('16 Tage');
    expect(line.linePost).toBe(' überfällig');
    expect(line.lineEmColor).toBe('#C2453A');
  });
});
