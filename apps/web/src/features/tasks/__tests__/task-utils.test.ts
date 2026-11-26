import { describe, expect, it } from 'vitest';
import { summarizeActivityPayload } from '../task-types';
import {
  describeEstimateVariance,
  formatEstimateMinutes,
  formatEstimateShort,
  parseEstimateHours,
} from '../task-utils';

describe('parseEstimateHours', () => {
  it('converts blank input to no estimate', () => {
    expect(parseEstimateHours('')).toEqual({ minutes: null, error: null });
    expect(parseEstimateHours('   ')).toEqual({ minutes: null, error: null });
  });

  it('converts 15-minute increments to minutes', () => {
    expect(parseEstimateHours('0.25')).toEqual({ minutes: 15, error: null });
    expect(parseEstimateHours('1.5')).toEqual({ minutes: 90, error: null });
    expect(parseEstimateHours('168')).toEqual({ minutes: 10080, error: null });
  });

  it('rejects values outside the allowed range', () => {
    expect(parseEstimateHours('0').error).toContain('0.25–168');
    expect(parseEstimateHours('169').error).toContain('0.25–168');
  });

  it('rejects values that are not multiples of 15 minutes', () => {
    expect(parseEstimateHours('0.3').error).toContain('整数倍');
    expect(parseEstimateHours('0.249').error).toContain('整数倍');
    expect(parseEstimateHours('168.004').error).toContain('整数倍');
  });

  it('rejects non-numeric input', () => {
    expect(parseEstimateHours('两小时').error).toBe('工时必须是数字');
  });
});

describe('estimate formatting', () => {
  it('formats whole and fractional hours', () => {
    expect(formatEstimateMinutes(15)).toBe('0.25 小时');
    expect(formatEstimateMinutes(60)).toBe('1 小时');
    expect(formatEstimateMinutes(90)).toBe('1.5 小时');
    expect(formatEstimateMinutes(75)).toBe('1.25 小时');
    expect(formatEstimateShort(90)).toBe('1.5h');
  });

  it('returns null for missing estimates', () => {
    expect(formatEstimateMinutes(null)).toBeNull();
    expect(formatEstimateShort(null)).toBeNull();
  });

  it('describes variance between actual and estimated time', () => {
    expect(describeEstimateVariance(120, 90)).toBe('实际超预计 0.5 小时');
    expect(describeEstimateVariance(60, 90)).toBe('实际比预计少 0.5 小时');
    expect(describeEstimateVariance(90, 90)).toBe('实际与预计一致');
    expect(describeEstimateVariance(null, 90)).toBeNull();
    expect(describeEstimateVariance(60, null)).toBeNull();
  });

  it('describes estimate changes in activity payloads', () => {
    expect(summarizeActivityPayload({ changes: { estimateMinutes: [60, 90] } }).detail).toBe(
      '预计工时：1 小时 → 1.5 小时',
    );
    expect(summarizeActivityPayload({ changes: { estimateMinutes: [null, 60] } }).detail).toBe(
      '预计工时：未估算 → 1 小时',
    );
    expect(summarizeActivityPayload({ changes: { actualMinutes: [60, 90] } }).detail).toBe(
      '实际工时：1 小时 → 1.5 小时',
    );
  });
});
