const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function shanghaiWeekStart(now: Date = new Date()): Date {
  const shanghai = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  const daysSinceMonday = (shanghai.getUTCDay() + 6) % 7;
  return new Date(
    Date.UTC(
      shanghai.getUTCFullYear(),
      shanghai.getUTCMonth(),
      shanghai.getUTCDate() - daysSinceMonday,
    ),
  );
}

export function previousWeekStart(now: Date = new Date()): Date {
  return new Date(shanghaiWeekStart(now).getTime() - 7 * DAY_MS);
}

export function weekBounds(weekStart: Date): { start: Date; endExclusive: Date; endDate: Date } {
  const start = new Date(weekStart.getTime() - SHANGHAI_OFFSET_MS);
  const endExclusive = new Date(start.getTime() + 7 * DAY_MS);
  const endDate = new Date(weekStart.getTime() + 6 * DAY_MS);
  return { start, endExclusive, endDate };
}

export function shanghaiDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function parseWeekStart(value: string): Date {
  const date = parseDateKey(value);
  if (date.getUTCDay() !== 1) throw new Error('weekStart must be a Monday');
  return date;
}

export interface PeriodBounds {
  start: Date;
  endExclusive: Date;
  startDate: string;
  endDate: string;
}

export function parseDateKey(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error('Invalid date');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error('Invalid date');
  }
  return date;
}

export function dayBounds(dateKey: string): PeriodBounds {
  const startDate = formatDate(parseDateKey(dateKey));
  const start = new Date(parseDateKey(startDate).getTime() - SHANGHAI_OFFSET_MS);
  const endExclusive = new Date(start.getTime() + DAY_MS);
  return { start, endExclusive, startDate, endDate: startDate };
}

export function normalizeWeekStart(value: string | Date): string {
  const date = typeof value === 'string' ? parseDateKey(value) : value;
  return formatDate(shanghaiWeekStart(date));
}

export function periodBounds(
  period: 'daily' | 'weekly',
  dateKey?: string,
  now: Date = new Date(),
): PeriodBounds {
  if (period === 'daily') {
    return dayBounds(dateKey ?? shanghaiDateKey(now));
  }
  const mondayKey = dateKey ? normalizeWeekStart(dateKey) : formatDate(shanghaiWeekStart(now));
  const bounds = weekBounds(parseDateKey(mondayKey));
  return {
    start: bounds.start,
    endExclusive: bounds.endExclusive,
    startDate: mondayKey,
    endDate: formatDate(bounds.endDate),
  };
}
