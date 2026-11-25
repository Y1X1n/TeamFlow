import { formatDate } from '@/lib/utils';

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

export function currentWeekStart(now: Date = new Date()): string {
  const shanghai = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  const daysSinceMonday = (shanghai.getUTCDay() + 6) % 7;
  const monday = new Date(
    Date.UTC(
      shanghai.getUTCFullYear(),
      shanghai.getUTCMonth(),
      shanghai.getUTCDate() - daysSinceMonday,
    ),
  );
  return monday.toISOString().slice(0, 10);
}

export function formatWeekRange(weekStart: string, weekEnd: string): string {
  return `${formatDate(weekStart)} - ${formatDate(weekEnd)}`;
}
