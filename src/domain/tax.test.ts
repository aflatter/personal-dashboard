import { describe, expect, it } from 'vitest';
import { taxCalc } from './tax';
import { DAY } from './constants';

const NOW = new Date(2026, 5, 24).getTime();
const THRESHOLDS = { dueSoonThreshold: 7, overdueThreshold: 21 };

describe('taxCalc', () => {
  it('is calm and reports time since the last upload', () => {
    const line = taxCalc(NOW, NOW - 3 * DAY, THRESHOLDS);
    expect(line.done).toBe(true);
    expect(line.linePre).toBe('Letzter Upload vor ');
    expect(line.lineEm).toBe('3 Tagen');
    expect(line.lineEmColor).toBe('#3E8E6B');
  });

  it('is "fällig" between the thresholds', () => {
    const line = taxCalc(NOW, NOW - 14 * DAY, THRESHOLDS);
    expect(line.done).toBe(false);
    expect(line.lineEm).toBe('14 Tage');
    expect(line.linePost).toBe(' fällig');
  });

  it('is "überfällig" beyond the overdue threshold', () => {
    const line = taxCalc(NOW, NOW - 30 * DAY, THRESHOLDS);
    expect(line.done).toBe(false);
    expect(line.lineEm).toBe('30 Tage');
    expect(line.linePost).toBe(' überfällig');
    expect(line.lineEmColor).toBe('#C2453A');
  });
});
