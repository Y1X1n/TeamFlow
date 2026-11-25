import { describe, expect, it } from 'vitest';
import { STALE_TASK_DAYS, staleTaskDays } from '../task-age';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-25T12:00:00.000Z');

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * MS_PER_DAY).toISOString();
}

describe('staleTaskDays', () => {
  it('uses a three day stale threshold', () => {
    expect(STALE_TASK_DAYS).toBe(3);
  });

  it('returns null below the threshold', () => {
    expect(staleTaskDays(daysAgo(2), null, NOW)).toBeNull();
    expect(staleTaskDays(daysAgo(2.99), null, NOW)).toBeNull();
  });

  it('returns three days exactly at the threshold', () => {
    expect(staleTaskDays(daysAgo(3), null, NOW)).toBe(3);
  });

  it('floors elapsed days', () => {
    expect(staleTaskDays(daysAgo(7.9), null, NOW)).toBe(7);
    expect(staleTaskDays(daysAgo(5.2), null, NOW)).toBe(5);
  });

  it('returns null for completed tasks', () => {
    const completedAt = new Date('2026-11-24T08:00:00.000Z').toISOString();
    expect(staleTaskDays(daysAgo(10), completedAt, NOW)).toBeNull();
  });

  it('returns null when updatedAt is in the future', () => {
    expect(staleTaskDays(daysAgo(-1), null, NOW)).toBeNull();
    expect(staleTaskDays(daysAgo(-0.5), null, NOW)).toBeNull();
  });

  it('returns null for an invalid updatedAt', () => {
    expect(staleTaskDays('not-a-date', null, NOW)).toBeNull();
    expect(staleTaskDays('', null, NOW)).toBeNull();
  });
});
