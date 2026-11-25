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
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error('Invalid date');
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.getUTCDay() !== 1) throw new Error('weekStart must be a Monday');
  return date;
}
