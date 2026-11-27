import type { TaskRecurrence } from './enums';

/** 一天毫秒数；重复任务按固定步长顺延截止时间。 */
const DAY_MS = 24 * 60 * 60 * 1000;

export const RECURRENCE_STEP_DAYS: Record<Exclude<TaskRecurrence, 'NONE'>, number> = {
  DAILY: 1,
  WEEKLY: 7,
  MONTHLY: 30,
};

function addMonthsClamped(date: Date, months: number, anchorDay: number): Date {
  const result = new Date(date.getTime());
  const targetMonth = result.getUTCMonth() + months;
  result.setUTCDate(1);
  result.setUTCMonth(targetMonth);
  const daysInTargetMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  // 以原始 dayOfMonth 为锚点，避免 1/31 → 2/28 后永久漂移到 28 号。
  result.setUTCDate(Math.min(anchorDay, daysInTargetMonth));
  return result;
}

/**
 * 计算下一次任务的截止时间。
 *
 * - 基准为当前任务的截止时间；没有截止时间时以 `now` 为基准。
 * - 顺延结果始终晚于 `now`，避免长时间未完成的任务生成一个已过期的下一次任务。
 * - `MONTHLY` 按自然月顺延，以原始日期为锚点并夹取月末（1/31 → 2/28 → 3/31）。
 */
export function nextRecurringDueDate(
  recurrence: TaskRecurrence,
  dueDate: Date | null,
  now: Date = new Date(),
): Date | null {
  if (recurrence === 'NONE') return null;

  let next = dueDate ? new Date(dueDate.getTime()) : new Date(now.getTime());
  if (recurrence === 'MONTHLY') {
    const anchorDay = next.getUTCDate();
    do {
      next = addMonthsClamped(next, 1, anchorDay);
    } while (next.getTime() <= now.getTime());
    return next;
  }

  const step = RECURRENCE_STEP_DAYS[recurrence] * DAY_MS;
  if (next.getTime() > now.getTime()) {
    next = new Date(next.getTime() + step);
    return next;
  }
  const elapsed = now.getTime() - next.getTime();
  const steps = Math.floor(elapsed / step) + 1;
  return new Date(next.getTime() + steps * step);
}
