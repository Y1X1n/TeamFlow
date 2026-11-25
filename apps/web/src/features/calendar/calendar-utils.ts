import { TASK_PRIORITY_LABELS } from '@teamflow/shared/enums';
import type { TaskPriority } from '@teamflow/shared/enums';
import type { BoardColumn, TaskCard } from '@/lib/types';
import { isOverdue } from '@/lib/utils';

export const SHANGHAI_TIME_ZONE = 'Asia/Shanghai';
export const MONTH_CELL_COUNT = 42;

const FIRST_LINE_MAX_OCTETS = 75;
const CONTINUATION_MAX_OCTETS = 74;

const DATE_KEY_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: SHANGHAI_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export const PRIORITY_RANK: Record<TaskPriority, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

/** 优先级圆点配色，日历与日程列表共用。 */
export const PRIORITY_DOT_CLASSES: Record<TaskPriority, string> = {
  URGENT: 'bg-rose-500',
  HIGH: 'bg-amber-500',
  MEDIUM: 'bg-sky-500',
  LOW: 'bg-slate-400',
};

export interface MonthAnchor {
  year: number;
  /** 1-12 */
  month: number;
}

export interface MonthCell {
  /** Asia/Shanghai 日期键，格式 YYYY-MM-DD */
  dateKey: string;
  dayNumber: number;
  inCurrentMonth: boolean;
  isToday: boolean;
}

export interface ParsedDateKey {
  year: number;
  month: number;
  day: number;
}

export interface BuildProjectIcsInput {
  projectName: string;
  tasks: TaskCard[];
  columns: BoardColumn[];
  now?: Date;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** 按 Asia/Shanghai 时区把时间点转换为 YYYY-MM-DD，非法输入返回空字符串。 */
export function shanghaiDateKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = DATE_KEY_FORMATTER.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) return '';
  return `${year.padStart(4, '0')}-${month}-${day}`;
}

/** 由年月日拼出日期键；月份为 1-12。 */
export function dateKeyFromParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
}

export function parseDateKey(dateKey: string): ParsedDateKey | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

export function monthAnchorFromDateKey(dateKey: string): MonthAnchor {
  const parsed = parseDateKey(dateKey);
  if (parsed) return { year: parsed.year, month: parsed.month };
  const fallback = parseDateKey(shanghaiDateKey(new Date()));
  if (fallback) return { year: fallback.year, month: fallback.month };
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

/** 在月份锚点上偏移若干个月，自动处理跨年。 */
export function shiftMonth(anchor: MonthAnchor, delta: number): MonthAnchor {
  const total = anchor.year * 12 + (anchor.month - 1) + delta;
  const year = Math.floor(total / 12);
  return { year, month: total - year * 12 + 1 };
}

/**
 * 生成 6 行 x 7 列（42 格）的月视图，周一为每周第一天。
 * 相邻月份的日期也会包含在矩阵中，inCurrentMonth 为 false。
 */
export function monthMatrix(year: number, month: number, now: Date = new Date()): MonthCell[] {
  const todayKey = shanghaiDateKey(now);
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const mondayOffset = (firstOfMonth.getUTCDay() + 6) % 7;
  const gridStart = new Date(Date.UTC(year, month - 1, 1 - mondayOffset));
  const cells: MonthCell[] = [];
  for (let index = 0; index < MONTH_CELL_COUNT; index += 1) {
    const date = new Date(gridStart.getTime() + index * 24 * 60 * 60 * 1000);
    const dateKey = dateKeyFromParts(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate(),
    );
    cells.push({
      dateKey,
      dayNumber: date.getUTCDate(),
      inCurrentMonth: date.getUTCFullYear() === year && date.getUTCMonth() === month - 1,
      isToday: dateKey === todayKey,
    });
  }
  return cells;
}

/** 把任务按 Asia/Shanghai 截止日期分组，忽略无截止时间或非法日期的任务。 */
export function tasksByDate(tasks: TaskCard[]): Map<string, TaskCard[]> {
  const grouped = new Map<string, TaskCard[]>();
  for (const task of tasks) {
    if (!task.dueDate) continue;
    const dateKey = shanghaiDateKey(task.dueDate);
    if (!dateKey || !parseDateKey(dateKey)) continue;
    const bucket = grouped.get(dateKey);
    if (bucket) {
      bucket.push(task);
    } else {
      grouped.set(dateKey, [task]);
    }
  }
  return grouped;
}

/** 与看板保持一致：按精确时间判断逾期，已完成任务不算逾期。 */
export function isTaskOverdue(task: TaskCard): boolean {
  return isOverdue(task.dueDate, task.completedAt);
}

/** 日历展示排序：优先级高者在前，其次按标题拼音。 */
export function sortTasksForCalendar(tasks: TaskCard[]): TaskCard[] {
  return [...tasks].sort(
    (left, right) =>
      PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority] ||
      left.title.localeCompare(right.title, 'zh-CN'),
  );
}

/**
 * 单日 chip 分配：超过上限时只显示上限减一条，为“+N”留出固定位置，
 * 避免小屏格子把“还有更多”裁掉。
 */
export function partitionDayChips(
  tasks: TaskCard[],
  maxChips = 3,
): { visible: TaskCard[]; hiddenCount: number } {
  const maxVisible = tasks.length > maxChips ? Math.max(1, maxChips - 1) : maxChips;
  return {
    visible: tasks.slice(0, maxVisible),
    hiddenCount: tasks.length - Math.max(0, Math.min(tasks.length, maxVisible)),
  };
}

export function formatMonthLabel(anchor: MonthAnchor): string {
  return `${anchor.year}年${anchor.month}月`;
}

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const;

/** 2026-11-26 -> 2026年11月26日 周四 */
export function formatDateKeyLabel(dateKey: string): string {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return dateKey;
  const weekday =
    WEEKDAY_LABELS[new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay()] ?? '';
  return `${parsed.year}年${parsed.month}月${parsed.day}日 ${weekday}`;
}

/** YYYY-MM-DD -> YYYYMMDD，用于 ICS 全天的 VALUE=DATE。 */
export function formatIcsDate(dateKey: string): string {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return '';
  return `${String(parsed.year).padStart(4, '0')}${pad2(parsed.month)}${pad2(parsed.day)}`;
}

/** 日期键的后一天；非法输入返回空字符串。 */
export function nextDateKey(dateKey: string): string {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return '';
  const next = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + 1));
  return dateKeyFromParts(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

/** UTC 时间戳，格式 YYYYMMDDTHHMMSSZ。 */
export function formatIcsTimestamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

/** 转义 ICS 文本值中的反斜杠、换行、分号与逗号。 */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\n|\r/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function utf8Octets(char: string): number {
  const codePoint = char.codePointAt(0);
  if (codePoint === undefined) return 0;
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

/**
 * 按 RFC 5545 折叠超长行：每行不超过 75 个八位组，续行以一个空格开头。
 * 以 Unicode 码点为单位切分，避免拆断多字节字符。
 */
export function foldIcsLine(line: string): string {
  if (
    Array.from(line).reduce((total, char) => total + utf8Octets(char), 0) <= FIRST_LINE_MAX_OCTETS
  ) {
    return line;
  }

  const parts: string[] = [];
  let current = '';
  let currentOctets = 0;
  let limit = FIRST_LINE_MAX_OCTETS;

  for (const char of line) {
    const octets = utf8Octets(char);
    if (currentOctets + octets > limit) {
      parts.push(current);
      current = '';
      currentOctets = 0;
      limit = CONTINUATION_MAX_OCTETS;
    }
    current += char;
    currentOctets += octets;
  }
  if (current !== '') parts.push(current);

  return parts.join('\r\n ');
}

/**
 * 生成项目任务的 ICS 日历：每个有截止日期的任务是一个全天事件。
 * VEVENT 统一使用 STATUS:CONFIRMED；完成状态写入 DESCRIPTION。
 */
export function buildProjectIcs({
  projectName,
  tasks,
  columns,
  now = new Date(),
}: BuildProjectIcsInput): string {
  const columnNames = new Map(columns.map((column) => [column.id, column.name]));
  const timestamp = formatIcsTimestamp(now);

  const events = tasks.flatMap<{ task: TaskCard; dateKey: string }>((task) => {
    if (!task.dueDate) return [];
    const dateKey = shanghaiDateKey(task.dueDate);
    return dateKey ? [{ task, dateKey }] : [];
  });
  events.sort(
    (left, right) =>
      left.dateKey.localeCompare(right.dateKey) ||
      PRIORITY_RANK[left.task.priority] - PRIORITY_RANK[right.task.priority] ||
      left.task.title.localeCompare(right.task.title, 'zh-CN'),
  );

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TeamFlow//Project Calendar//ZH',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeIcsText(projectName)}`,
  ];

  for (const { task, dateKey } of events) {
    const startDate = formatIcsDate(dateKey);
    const endDate = formatIcsDate(nextDateKey(dateKey));
    if (!startDate || !endDate) continue;
    const description = [
      `项目：${projectName}`,
      `优先级：${TASK_PRIORITY_LABELS[task.priority]}`,
      `负责人：${task.assignee?.name ?? '未指派'}`,
      `列：${columnNames.get(task.columnId) ?? '未知列'}`,
      `状态：${task.completedAt ? '已完成' : '未完成'}`,
    ].join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:teamflow-task-${task.id}@teamflow`,
      `DTSTAMP:${timestamp}`,
      `DTSTART;VALUE=DATE:${startDate}`,
      `DTEND;VALUE=DATE:${endDate}`,
      `SUMMARY:${escapeIcsText(task.title)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}
