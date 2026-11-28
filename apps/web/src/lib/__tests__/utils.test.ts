import { describe, expect, it } from 'vitest';
import {
  avatarColor,
  fileSize,
  formatDate,
  formatDateTime,
  isOverdue,
  safeNextPath,
  shanghaiDayRange,
} from '../utils';

describe('utils', () => {
  it('assigns stable avatar colors', () => {
    expect(avatarColor('user_1')).toBe(avatarColor('user_1'));
    expect(avatarColor('user_1')).toMatch(/^bg-/);
  });

  it('detects overdue tasks', () => {
    expect(isOverdue('2020-01-01T00:00:00.000Z', null)).toBe(true);
    expect(isOverdue('2020-01-01T00:00:00.000Z', '2020-01-02T00:00:00.000Z')).toBe(false);
    expect(isOverdue(null, null)).toBe(false);
  });

  it('formats file sizes', () => {
    expect(fileSize(512)).toBe('512 B');
    expect(fileSize(2048)).toBe('2.0 KB');
    expect(fileSize(3 * 1024 * 1024)).toBe('3.0 MB');
  });

  it('formats dates in the Shanghai timezone and tolerates bad values', () => {
    expect(formatDate('2026-11-22T16:30:00.000Z')).toContain('11/23');
    expect(formatDateTime('not-a-date')).toBe('—');
    const range = shanghaiDayRange(new Date('2026-11-22T16:30:00.000Z'));
    expect(range.start).toBe(Date.parse('2026-11-23T00:00:00+08:00'));
    expect(range.end - range.start).toBe(24 * 60 * 60 * 1000 - 1);
  });

  it('only allows internal redirect targets', () => {
    expect(safeNextPath('/invite/abc')).toBe('/invite/abc');
    expect(safeNextPath('https://evil.example')).toBe('/');
    expect(safeNextPath('//evil.example')).toBe('/');
    expect(safeNextPath('/\\evil.example')).toBe('/');
    expect(safeNextPath('/\t/evil.example')).toBe('/');
    expect(safeNextPath('/%2f%2fevil.example')).toBe('/');
    expect(safeNextPath('/login?next=/invite/x')).toBe('/');
    expect(safeNextPath(null)).toBe('/');
  });
});
