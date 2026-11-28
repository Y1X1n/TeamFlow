import { TASK_PRIORITIES, TASK_PRIORITY_LABELS } from '@teamflow/shared/enums';
import type { TaskPriority } from '@teamflow/shared/enums';
import type { BoardColumn, MemberSummary } from '@/lib/types';
import { parseEstimateHours } from '@/features/tasks/task-utils';

export interface BoardImportRow {
  /** 1-based 行号，用于错误提示（含表头）。 */
  line: number;
  title: string;
  columnName: string;
  columnId: string | null;
  assigneeName: string;
  assigneeId: string | null;
  priority: TaskPriority;
  dueDate: string | null;
  estimateMinutes: number | null;
  labels: string[];
  errors: string[];
}

export interface BoardImportPlan {
  rows: BoardImportRow[];
  validRows: BoardImportRow[];
  globalErrors: string[];
}

const HEADER_ALIASES: Record<string, keyof ImportFields> = {
  任务标题: 'title',
  标题: 'title',
  title: 'title',
  看板列: 'column',
  列: 'column',
  column: 'column',
  负责人: 'assignee',
  assignee: 'assignee',
  优先级: 'priority',
  priority: 'priority',
  截止时间: 'dueDate',
  截止日期: 'dueDate',
  due: 'dueDate',
  duedate: 'dueDate',
  预计工时: 'estimate',
  预估工时: 'estimate',
  工时估算: 'estimate',
  预计工时小时: 'estimate',
  estimate: 'estimate',
  标签: 'labels',
  labels: 'labels',
};

interface ImportFields {
  title: string;
  column: string;
  assignee: string;
  priority: string;
  dueDate: string;
  estimate: string;
  labels: string;
}

const PRIORITY_BY_LABEL = new Map<string, TaskPriority>(
  TASK_PRIORITIES.map((priority) => [TASK_PRIORITY_LABELS[priority], priority]),
);

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function cell(row: string[], index: number): string {
  return index >= 0 ? (row[index] ?? '').trim() : '';
}

/**
 * 解析 CSV（兼容引号包裹、逗号、换行、双引号转义与 BOM）。
 */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]!;
    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field.trim());
      field = '';
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && input[index + 1] === '\n') index += 1;
      row.push(field.trim());
      field = '';
      if (row.some((item) => item.length > 0)) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  row.push(field.trim());
  if (row.some((item) => item.length > 0)) rows.push(row);
  return rows;
}

function parseImportDueDate(value: string): string | null | 'invalid' {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace(/\//g, '-');
  const dateTime = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})$/.exec(normalized);
  if (dateTime) {
    const [, year, month, day, hour, minute] = dateTime;
    const candidate = `${year}-${month!.padStart(2, '0')}-${day!.padStart(
      2,
      '0',
    )}T${hour!.padStart(2, '0')}:${minute}:00+08:00`;
    return Number.isNaN(new Date(candidate).getTime()) ? 'invalid' : candidate;
  }

  const dateOnly = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(normalized);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    const candidate = `${year}-${month!.padStart(2, '0')}-${day!.padStart(
      2,
      '0',
    )}T23:59:59+08:00`;
    return Number.isNaN(new Date(candidate).getTime()) ? 'invalid' : candidate;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? 'invalid' : parsed.toISOString();
}

function parseImportPriority(value: string): TaskPriority | null {
  const trimmed = value.trim();
  if (!trimmed) return 'MEDIUM';
  const byLabel = PRIORITY_BY_LABEL.get(trimmed);
  if (byLabel) return byLabel;
  const upper = trimmed.toUpperCase();
  return TASK_PRIORITIES.find((priority) => priority === upper) ?? null;
}

function parseImportEstimate(value: string): number | null | 'invalid' {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const hours = trimmed.replace(/\s*小时$/, '').trim();
  const parsed = parseEstimateHours(hours);
  return parsed.error ? 'invalid' : parsed.minutes;
}

function parseImportLabels(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[、,，]/)
        .map((label) => label.trim())
        .filter((label) => label.length > 0),
    ),
  );
}

export function buildBoardImportPlan(
  text: string,
  columns: readonly BoardColumn[],
  members: readonly MemberSummary[],
  fallbackColumnId: string | null,
): BoardImportPlan {
  const table = parseCsv(text);
  if (table.length === 0) {
    return { rows: [], validRows: [], globalErrors: ['CSV 内容为空'] };
  }

  const headerRow = table[0]!;
  const headerIndex = new Map<keyof ImportFields, number>();
  headerRow.forEach((header, index) => {
    const field = HEADER_ALIASES[normalizeHeader(header)];
    if (field && !headerIndex.has(field)) headerIndex.set(field, index);
  });

  if (!headerIndex.has('title')) {
    return { rows: [], validRows: [], globalErrors: ['缺少「任务标题」列'] };
  }

  const columnByName = new Map(columns.map((column) => [column.name, column]));
  const memberByName = new Map(members.map((member) => [member.name, member]));
  const rows: BoardImportRow[] = [];

  table.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const errors: string[] = [];
    const title = cell(cells, headerIndex.get('title') ?? -1);
    if (!title) errors.push('任务标题不能为空');
    if (title.length > 200) errors.push('任务标题不能超过 200 字符');

    const columnName = cell(cells, headerIndex.get('column') ?? -1);
    let columnId = fallbackColumnId;
    if (columnName) {
      const column = columnByName.get(columnName);
      if (column) columnId = column.id;
      else errors.push(`看板列「${columnName}」不存在`);
    }
    if (!columnId) errors.push('找不到可用的看板列');

    const assigneeName = cell(cells, headerIndex.get('assignee') ?? -1);
    let assigneeId: string | null = null;
    if (assigneeName) {
      const member = memberByName.get(assigneeName);
      if (member) assigneeId = member.userId;
      else errors.push(`负责人「${assigneeName}」不是项目成员`);
    }

    const priority = parseImportPriority(cell(cells, headerIndex.get('priority') ?? -1));
    if (!priority) errors.push('优先级需为 低/中/高/紧急');

    const dueDate = parseImportDueDate(cell(cells, headerIndex.get('dueDate') ?? -1));
    if (dueDate === 'invalid') errors.push('截止时间格式无法识别');

    const estimate = parseImportEstimate(cell(cells, headerIndex.get('estimate') ?? -1));
    if (estimate === 'invalid') errors.push('预计工时需为 0.25–168 小时');

    const labels = parseImportLabels(cell(cells, headerIndex.get('labels') ?? -1));
    if (labels.length > 5) errors.push('标签最多 5 个');

    rows.push({
      line,
      title,
      columnName: columnName || (columns.find((column) => column.id === columnId)?.name ?? ''),
      columnId: columnId ?? null,
      assigneeName,
      assigneeId,
      priority: priority ?? 'MEDIUM',
      dueDate: dueDate === 'invalid' ? null : dueDate,
      estimateMinutes: estimate === 'invalid' ? null : estimate,
      labels,
      errors,
    });
  });

  return {
    rows,
    validRows: rows.filter((row) => row.errors.length === 0),
    globalErrors: [],
  };
}

export function boardImportTemplateCsv(): string {
  return `\uFEFF任务标题,看板列,负责人,优先级,截止时间,预计工时,标签\n完成登录页联调,待办,Alice,高,2026-12-01 18:00,2,前端、紧急\n`;
}
