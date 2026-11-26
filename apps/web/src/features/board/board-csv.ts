import { TASK_PRIORITY_LABELS } from '@teamflow/shared/enums';
import type { BoardColumn, TaskCard } from '@/lib/types';
import { formatEstimateMinutes } from '@/features/tasks/task-utils';

const CSV_HEADERS = [
  '任务标题',
  '看板列',
  '负责人',
  '优先级',
  '截止时间',
  '预计工时',
  '实际工时',
  '标签',
  '状态',
  '更新时间',
];

function formatCsvDateTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`;
}

export function escapeCsvCell(value: string): string {
  // 防止表格软件把用户内容当作公式执行（CSV injection）。
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function buildBoardCsv(
  tasks: readonly TaskCard[],
  columns: readonly BoardColumn[],
  membersById: ReadonlyMap<string, { name: string }>,
): string {
  const columnNames = new Map(columns.map((column) => [column.id, column.name]));
  const rows = tasks.map((task) => [
    task.title,
    columnNames.get(task.columnId) ?? '',
    task.assignee ? (membersById.get(task.assignee.userId)?.name ?? task.assignee.name) : '',
    TASK_PRIORITY_LABELS[task.priority],
    formatCsvDateTime(task.dueDate),
    formatEstimateMinutes(task.estimateMinutes) ?? '',
    formatEstimateMinutes(task.actualMinutes) ?? '',
    task.labels.join('、'),
    task.completedAt ? '已完成' : '未完成',
    formatCsvDateTime(task.updatedAt),
  ]);

  return `\uFEFF${[CSV_HEADERS, ...rows]
    .map((row) => row.map(escapeCsvCell).join(','))
    .join('\r\n')}\r\n`;
}

export function buildBoardCsvFilename(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `teamflow-board-${value('year')}-${value('month')}-${value('day')}.csv`;
}
