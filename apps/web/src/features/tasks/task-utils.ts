import type { QueryClient } from '@tanstack/react-query';
import {
  TASK_ESTIMATE_MAX_MINUTES,
  TASK_ESTIMATE_MIN_MINUTES,
  TASK_LABELS_MAX,
  TASK_LABEL_MAX_LENGTH,
  TASK_PRIORITIES,
} from '@teamflow/shared/enums';
import type { TaskPriority } from '@teamflow/shared/enums';
import { ApiError } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { BoardData, TaskDetail } from '@/lib/types';

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'PROJECT_ARCHIVED') return '项目已归档，无法执行写操作';
    if (error.code === 'TASK_NOT_IN_COLUMN') return '目标任务已不在该列，请刷新看板后重试';
    return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return '操作失败，请稍后重试';
}

export function isTaskPriority(value: string): value is TaskPriority {
  return (TASK_PRIORITIES as readonly string[]).includes(value);
}

export interface LabelParseResult {
  labels: string[];
  error: string | null;
}

export function parseLabelsInput(value: string): LabelParseResult {
  const labels = Array.from(
    new Set(
      value
        .split(/[,，、]/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  );
  if (labels.length > TASK_LABELS_MAX) {
    return { labels: [], error: `最多只能添加 ${TASK_LABELS_MAX} 个标签` };
  }
  const tooLong = labels.find((label) => label.length > TASK_LABEL_MAX_LENGTH);
  if (tooLong) {
    return { labels: [], error: `标签「${tooLong}」超过 ${TASK_LABEL_MAX_LENGTH} 个字符` };
  }
  return { labels, error: null };
}

export function toDateTimeLocalValue(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export interface DateTimeParseResult {
  iso: string | null;
  valid: boolean;
}

export function parseDateTimeLocal(value: string): DateTimeParseResult {
  if (!value.trim()) return { iso: null, valid: true };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { iso: null, valid: false };
  return { iso: date.toISOString(), valid: true };
}

export interface EstimateParseResult {
  minutes: number | null;
  error: string | null;
}

/** 表单以小时输入，存储与 API 统一使用分钟。 */
export function parseEstimateHours(value: string): EstimateParseResult {
  const trimmed = value.trim();
  if (!trimmed) return { minutes: null, error: null };
  const hours = Number(trimmed);
  if (!Number.isFinite(hours)) {
    return { minutes: null, error: '工时必须是数字' };
  }
  const totalMinutes = hours * 60;
  const minutes = Math.round(totalMinutes);
  if (Math.abs(totalMinutes - minutes) > 1e-6 || minutes % TASK_ESTIMATE_MIN_MINUTES !== 0) {
    return { minutes: null, error: `工时需为 ${TASK_ESTIMATE_MIN_MINUTES / 60} 小时的整数倍` };
  }
  if (minutes < TASK_ESTIMATE_MIN_MINUTES || minutes > TASK_ESTIMATE_MAX_MINUTES) {
    return {
      minutes: null,
      error: `工时需在 ${TASK_ESTIMATE_MIN_MINUTES / 60}–${TASK_ESTIMATE_MAX_MINUTES / 60} 小时之间`,
    };
  }
  return { minutes, error: null };
}

export function formatEstimateMinutes(value: number | null): string | null {
  if (value === null || value <= 0) return null;
  const hours = value / 60;
  const text = Number.isInteger(hours)
    ? String(hours)
    : hours.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return `${text} 小时`;
}

export function formatEstimateShort(value: number | null): string | null {
  if (value === null || value <= 0) return null;
  const hours = value / 60;
  const text = Number.isInteger(hours)
    ? String(hours)
    : hours.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return `${text}h`;
}

export function describeEstimateVariance(
  actualMinutes: number | null,
  estimateMinutes: number | null,
): string | null {
  if (actualMinutes === null || estimateMinutes === null) return null;
  const difference = actualMinutes - estimateMinutes;
  if (difference === 0) return '实际与预计一致';
  const absolute = Math.abs(difference);
  const amount = formatEstimateMinutes(absolute) ?? `${absolute} 分钟`;
  return difference > 0 ? `实际超预计 ${amount}` : `实际比预计少 ${amount}`;
}

export type TaskCountField = 'commentCount' | 'attachmentCount';

export function adjustTaskCount(
  queryClient: QueryClient,
  projectId: string,
  taskId: string,
  field: TaskCountField,
  delta: number,
): void {
  const applyDelta = <T extends { commentCount: number; attachmentCount: number }>(task: T): T => {
    const next =
      field === 'commentCount'
        ? { ...task, commentCount: Math.max(0, task.commentCount + delta) }
        : { ...task, attachmentCount: Math.max(0, task.attachmentCount + delta) };
    return next;
  };
  queryClient.setQueryData<BoardData>(queryKeys.board(projectId), (previous) =>
    previous
      ? {
          ...previous,
          tasks: previous.tasks.map((task) => (task.id === taskId ? applyDelta(task) : task)),
        }
      : previous,
  );
  queryClient.setQueryData<TaskDetail>(queryKeys.task(taskId), (previous) =>
    previous ? applyDelta(previous) : previous,
  );
}
