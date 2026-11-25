export const STALE_TASK_DAYS = 3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function staleTaskDays(
  updatedAt: string,
  completedAt: string | null,
  now: Date = new Date(),
): number | null {
  if (completedAt) return null;

  const updated = new Date(updatedAt);
  if (Number.isNaN(updated.getTime())) return null;

  const elapsed = now.getTime() - updated.getTime();
  if (elapsed < 0) return null;

  const days = Math.floor(elapsed / MS_PER_DAY);
  return days >= STALE_TASK_DAYS ? days : null;
}
