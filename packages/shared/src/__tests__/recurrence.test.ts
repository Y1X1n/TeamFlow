import { describe, expect, it } from 'vitest';
import { nextRecurringDueDate } from '../recurrence';

const NOW = new Date('2026-11-27T08:00:00.000Z');

describe('nextRecurringDueDate', () => {
  it('returns null for non-recurring tasks', () => {
    expect(nextRecurringDueDate('NONE', new Date('2026-11-20T00:00:00.000Z'), NOW)).toBeNull();
    expect(nextRecurringDueDate('NONE', null, NOW)).toBeNull();
  });

  it('adds one step when the due date is still in the future', () => {
    expect(
      nextRecurringDueDate('DAILY', new Date('2026-11-28T08:00:00.000Z'), NOW)?.toISOString(),
    ).toBe('2026-11-29T08:00:00.000Z');
    expect(
      nextRecurringDueDate('WEEKLY', new Date('2026-12-01T08:00:00.000Z'), NOW)?.toISOString(),
    ).toBe('2026-12-08T08:00:00.000Z');
  });

  it('rolls forward past now when the due date is already overdue', () => {
    // 逾期 10 天，按天重复应落在明天同一时间之后。
    const next = nextRecurringDueDate('DAILY', new Date('2026-11-17T08:00:00.000Z'), NOW);
    expect(next?.toISOString()).toBe('2026-11-28T08:00:00.000Z');
    expect(next!.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it('falls back to now when the task has no due date', () => {
    const next = nextRecurringDueDate('WEEKLY', null, NOW);
    expect(next?.toISOString()).toBe('2026-12-04T08:00:00.000Z');
  });

  it('advances monthly by calendar month and clamps the day', () => {
    expect(
      nextRecurringDueDate('MONTHLY', new Date('2026-12-31T08:00:00.000Z'), NOW)?.toISOString(),
    ).toBe('2027-01-31T08:00:00.000Z');
    expect(
      nextRecurringDueDate('MONTHLY', new Date('2027-01-31T08:00:00.000Z'), NOW)?.toISOString(),
    ).toBe('2027-02-28T08:00:00.000Z');
  });

  it('keeps the original day-of-month anchor across short months', () => {
    // 1/31 起算：2 月夹取到 28 号，之后回到 31 号（而不是永久漂移到 28 号）。
    expect(
      nextRecurringDueDate(
        'MONTHLY',
        new Date('2026-01-31T08:00:00.000Z'),
        new Date('2026-02-01T08:00:00.000Z'),
      )?.toISOString(),
    ).toBe('2026-02-28T08:00:00.000Z');
    expect(
      nextRecurringDueDate(
        'MONTHLY',
        new Date('2026-01-31T08:00:00.000Z'),
        new Date('2026-03-01T08:00:00.000Z'),
      )?.toISOString(),
    ).toBe('2026-03-31T08:00:00.000Z');
    // 逾期多个月后滚动到未来最近一次，并保持 31 号锚点。
    expect(
      nextRecurringDueDate('MONTHLY', new Date('2026-01-31T08:00:00.000Z'), NOW)?.toISOString(),
    ).toBe('2026-11-30T08:00:00.000Z');
  });

  it('keeps rolling monthly until the result is in the future', () => {
    const next = nextRecurringDueDate('MONTHLY', new Date('2026-01-15T08:00:00.000Z'), NOW);
    expect(next?.toISOString()).toBe('2026-12-15T08:00:00.000Z');
  });
});
