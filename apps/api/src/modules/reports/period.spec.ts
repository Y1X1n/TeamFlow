import { dayBounds, normalizeWeekStart, parseDateKey, periodBounds } from './week';

describe('parseDateKey', () => {
  it('returns UTC midnight for a valid calendar date', () => {
    expect(parseDateKey('2026-11-25').toISOString()).toBe('2026-11-25T00:00:00.000Z');
    expect(parseDateKey('2024-02-29').toISOString()).toBe('2024-02-29T00:00:00.000Z');
  });

  it('rejects malformed values and dates that do not exist', () => {
    expect(() => parseDateKey('2026-11-25T00:00:00Z')).toThrow('Invalid date');
    expect(() => parseDateKey('2026-1-5')).toThrow('Invalid date');
    expect(() => parseDateKey('2026-13-01')).toThrow('Invalid date');
    expect(() => parseDateKey('2026-02-30')).toThrow('Invalid date');
    expect(() => parseDateKey('2026-02-29')).toThrow('Invalid date');
    expect(() => parseDateKey('2025-04-31')).toThrow('Invalid date');
  });
});

describe('dayBounds', () => {
  it('uses the Asia/Shanghai day as a UTC window', () => {
    const bounds = dayBounds('2026-11-25');
    expect(bounds.start.toISOString()).toBe('2026-11-24T16:00:00.000Z');
    expect(bounds.endExclusive.toISOString()).toBe('2026-11-25T16:00:00.000Z');
    expect(bounds.startDate).toBe('2026-11-25');
    expect(bounds.endDate).toBe('2026-11-25');
  });

  it('crosses month and year boundaries', () => {
    const bounds = dayBounds('2026-01-01');
    expect(bounds.start.toISOString()).toBe('2025-12-31T16:00:00.000Z');
    expect(bounds.endExclusive.toISOString()).toBe('2026-01-01T16:00:00.000Z');
  });

  it('rejects invalid dates', () => {
    expect(() => dayBounds('2026-02-30')).toThrow('Invalid date');
  });
});

describe('normalizeWeekStart', () => {
  it('returns the Monday of the Shanghai week for any date key', () => {
    expect(normalizeWeekStart('2026-11-23')).toBe('2026-11-23');
    expect(normalizeWeekStart('2026-11-25')).toBe('2026-11-23');
    expect(normalizeWeekStart('2026-11-29')).toBe('2026-11-23');
    expect(normalizeWeekStart('2026-11-22')).toBe('2026-11-16');
    expect(normalizeWeekStart('2026-01-01')).toBe('2025-12-29');
  });

  it('interprets Date values in the Shanghai calendar', () => {
    expect(normalizeWeekStart(new Date('2026-11-22T15:30:00.000Z'))).toBe('2026-11-16');
    expect(normalizeWeekStart(new Date('2026-11-22T16:30:00.000Z'))).toBe('2026-11-23');
  });

  it('rejects invalid date keys', () => {
    expect(() => normalizeWeekStart('not-a-date')).toThrow('Invalid date');
    expect(() => normalizeWeekStart('2026-02-30')).toThrow('Invalid date');
  });
});

describe('periodBounds', () => {
  it('defaults daily bounds to the current Shanghai day', () => {
    const bounds = periodBounds('daily', undefined, new Date('2026-11-25T16:30:00.000Z'));
    expect(bounds.startDate).toBe('2026-11-26');
    expect(bounds.start.toISOString()).toBe('2026-11-25T16:00:00.000Z');
    expect(bounds.endExclusive.toISOString()).toBe('2026-11-26T16:00:00.000Z');
  });

  it('uses the given daily date without normalizing it', () => {
    const bounds = periodBounds('daily', '2026-11-25');
    expect(bounds.startDate).toBe('2026-11-25');
    expect(bounds.endDate).toBe('2026-11-25');
  });

  it('defaults weekly bounds to the current Shanghai week', () => {
    const bounds = periodBounds('weekly', undefined, new Date('2026-11-22T16:30:00.000Z'));
    expect(bounds.startDate).toBe('2026-11-23');
    expect(bounds.endDate).toBe('2026-11-29');
    expect(bounds.start.toISOString()).toBe('2026-11-22T16:00:00.000Z');
    expect(bounds.endExclusive.toISOString()).toBe('2026-11-29T16:00:00.000Z');
  });

  it('normalizes a weekly date to its Monday', () => {
    const bounds = periodBounds('weekly', '2026-11-25');
    expect(bounds.startDate).toBe('2026-11-23');
    expect(bounds.endDate).toBe('2026-11-29');
  });

  it('normalizes a cross-year weekly date to the previous Monday', () => {
    const bounds = periodBounds('weekly', '2026-01-01');
    expect(bounds.startDate).toBe('2025-12-29');
    expect(bounds.endDate).toBe('2026-01-04');
    expect(bounds.start.toISOString()).toBe('2025-12-28T16:00:00.000Z');
    expect(bounds.endExclusive.toISOString()).toBe('2026-01-04T16:00:00.000Z');
  });

  it('rejects invalid dates for both periods', () => {
    expect(() => periodBounds('daily', '2026-02-30')).toThrow('Invalid date');
    expect(() => periodBounds('weekly', '2026-13-01')).toThrow('Invalid date');
  });
});
