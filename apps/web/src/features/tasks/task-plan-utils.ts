import { SUBTASK_TITLE_MAX_LENGTH } from '@teamflow/shared/enums';
import type { TaskPriority } from '@teamflow/shared/enums';
import type { AiPlanStep } from '@/lib/types';
import { getErrorMessage, parseDateTimeLocal } from './task-utils';

/** Same limit as subtask titles; task titles accept up to 200 on the API. */
export const PLAN_STEP_TITLE_MAX_LENGTH = 120;

/** Default deadline time (local) for a plan step with `dueInDays`. */
export const DEFAULT_PLAN_DUE_TIME = '18:00';

export interface BreakdownRow {
  key: string;
  title: string;
  checked: boolean;
}

export interface CreationFailure {
  title: string;
  message: string;
}

export interface BreakdownCreationSummary {
  total: number;
  created: number;
  failed: number;
  failures: CreationFailure[];
}

export interface PlanCreationSummary {
  total: number;
  created: number;
  failed: number;
  failures: CreationFailure[];
  dependencyTotal: number;
  dependenciesCreated: number;
  dependenciesFailed: number;
  dependenciesSkipped: number;
  dependencyFailures: CreationFailure[];
}

export interface PlanCreationHandlers {
  createTask: (payload: PlanTaskPayload) => Promise<{ id: string }>;
  createDependency: (taskId: string, blockedByTaskId: string) => Promise<unknown>;
}

export interface PlanStepDraft {
  key: string;
  stepIndex: number;
  title: string;
  checked: boolean;
  assigneeId: string | null;
  priority: TaskPriority;
  /** `datetime-local` value, empty string means no deadline. */
  dueDate: string;
  dependsOn: number[];
  reason: string | null;
}

export interface PlanTaskPayload {
  title: string;
  columnId: string;
  priority: TaskPriority;
  assigneeId: string | null;
  dueDate: string | null;
}

export interface PlanDependencyPair {
  stepIndex: number;
  dependsOnIndex: number;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function toLocalDateTimeValue(date: Date, time: string): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${time}`;
}

/**
 * Converts the API `dueInDays` suggestion into a local `datetime-local` value.
 * The date is calculated in the browser's local timezone (Asia/Shanghai for this app).
 */
export function planDueDateFromDays(dueInDays: number | null, now: Date = new Date()): string {
  if (
    dueInDays === null ||
    !Number.isInteger(dueInDays) ||
    dueInDays < 1 ||
    dueInDays > 30
  ) {
    return '';
  }
  const date = new Date(now.getTime());
  date.setDate(date.getDate() + dueInDays);
  return toLocalDateTimeValue(date, DEFAULT_PLAN_DUE_TIME);
}

export function formatDependsOn(dependsOn: number[]): string {
  const steps = Array.from(
    new Set(dependsOn.filter((value) => Number.isInteger(value) && value >= 0)),
  ).sort((left, right) => left - right);
  if (steps.length === 0) return '无依赖';
  return `依赖第 ${steps.map((value) => value + 1).join('、')} 步`;
}

/** Keeps only indexes that refer to another existing step, sorted and deduplicated. */
export function normalizeDependsOn(
  dependsOn: number[],
  stepIndex: number,
  stepCount: number,
): number[] {
  const unique = new Set(
    dependsOn.filter(
      (value) => Number.isInteger(value) && value >= 0 && value < stepCount && value !== stepIndex,
    ),
  );
  return Array.from(unique).sort((left, right) => left - right);
}

export function createPlanDrafts(
  steps: AiPlanStep[],
  now: Date = new Date(),
  knownAssigneeIds?: ReadonlySet<string>,
): PlanStepDraft[] {
  return steps.map((step, index) => {
    const suggestedAssigneeId = step.suggestedAssigneeId;
    const assigneeIsKnown =
      suggestedAssigneeId !== null &&
      (knownAssigneeIds === undefined || knownAssigneeIds.has(suggestedAssigneeId));
    return {
      key: `plan-step-${index}`,
      stepIndex: index,
      title: step.title.trim(),
      checked: true,
      assigneeId: assigneeIsKnown ? suggestedAssigneeId : null,
      priority: step.priority,
      dueDate: planDueDateFromDays(step.dueInDays, now),
      dependsOn: normalizeDependsOn(step.dependsOn, index, steps.length),
      reason: step.reason?.trim() ? step.reason.trim() : null,
    };
  });
}

export interface PlanPayloadResult {
  payload: PlanTaskPayload | null;
  error: string | null;
}

export function buildPlanTaskPayload(
  row: PlanStepDraft,
  columnId: string,
): PlanPayloadResult {
  const title = row.title.trim();
  if (!title) {
    return { payload: null, error: `第 ${row.stepIndex + 1} 步标题不能为空` };
  }
  if (title.length > PLAN_STEP_TITLE_MAX_LENGTH) {
    return {
      payload: null,
      error: `第 ${row.stepIndex + 1} 步标题超过 ${PLAN_STEP_TITLE_MAX_LENGTH} 个字符`,
    };
  }
  if (!columnId) {
    return { payload: null, error: '任务缺少看板列信息，请刷新后重试' };
  }
  const due = parseDateTimeLocal(row.dueDate);
  if (!due.valid) {
    return { payload: null, error: `第 ${row.stepIndex + 1} 步截止时间格式不正确` };
  }
  return {
    payload: {
      title,
      columnId,
      priority: row.priority,
      assigneeId: row.assigneeId?.trim() || null,
      dueDate: due.iso,
    },
    error: null,
  };
}

/**
 * Returns dependency links that should be attempted for the selected rows.
 * Links that point at unselected steps, at the step itself, or at invalid indexes are dropped.
 */
export function planDependencyPairs(rows: PlanStepDraft[]): PlanDependencyPair[] {
  const selected = new Set(rows.filter((row) => row.checked).map((row) => row.stepIndex));
  const seen = new Set<string>();
  const pairs: PlanDependencyPair[] = [];
  for (const row of rows) {
    if (!row.checked) continue;
    for (const dependsOnIndex of row.dependsOn) {
      if (!selected.has(dependsOnIndex) || dependsOnIndex === row.stepIndex) continue;
      const key = `${row.stepIndex}:${dependsOnIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ stepIndex: row.stepIndex, dependsOnIndex });
    }
  }
  return pairs;
}

export async function createSubtasksSequentially(
  rows: BreakdownRow[],
  createSubtask: (title: string) => Promise<unknown>,
): Promise<BreakdownCreationSummary> {
  const selected = rows.filter((row) => row.checked);
  const failures: CreationFailure[] = [];
  let created = 0;
  for (const [index, row] of selected.entries()) {
    const title = row.title.trim();
    if (!title) {
      failures.push({ title: `建议 ${index + 1}`, message: '标题不能为空' });
      continue;
    }
    if (title.length > SUBTASK_TITLE_MAX_LENGTH) {
      failures.push({
        title,
        message: `标题超过 ${SUBTASK_TITLE_MAX_LENGTH} 个字符`,
      });
      continue;
    }
    try {
      await createSubtask(title);
      created += 1;
    } catch (error) {
      failures.push({ title, message: getErrorMessage(error) });
    }
  }
  return { total: selected.length, created, failed: failures.length, failures };
}

/**
 * Creates the selected plan steps sequentially, then links dependencies between
 * successfully created tasks. Dependencies pointing at skipped or failed steps are skipped.
 */
export async function createPlanSequentially(
  rows: PlanStepDraft[],
  columnId: string,
  handlers: PlanCreationHandlers,
): Promise<PlanCreationSummary> {
  const selected = rows.filter((row) => row.checked);
  const failures: CreationFailure[] = [];
  const createdByStep = new Map<number, string>();

  for (const row of selected) {
    const built = buildPlanTaskPayload(row, columnId);
    if (built.error || !built.payload) {
      failures.push({
        title: `第 ${row.stepIndex + 1} 步`,
        message: built.error ?? '任务参数不完整',
      });
      continue;
    }
    try {
      const created = await handlers.createTask(built.payload);
      createdByStep.set(row.stepIndex, created.id);
    } catch (error) {
      failures.push({
        title: `第 ${row.stepIndex + 1} 步「${built.payload.title}」`,
        message: getErrorMessage(error),
      });
    }
  }

  const pairs = planDependencyPairs(rows);
  const dependencyFailures: CreationFailure[] = [];
  let dependenciesCreated = 0;
  let dependenciesSkipped = 0;
  for (const pair of pairs) {
    const taskIdOfStep = createdByStep.get(pair.stepIndex);
    const blockedById = createdByStep.get(pair.dependsOnIndex);
    if (!taskIdOfStep || !blockedById) {
      dependenciesSkipped += 1;
      continue;
    }
    try {
      await handlers.createDependency(taskIdOfStep, blockedById);
      dependenciesCreated += 1;
    } catch (error) {
      dependencyFailures.push({
        title: `第 ${pair.stepIndex + 1} 步依赖第 ${pair.dependsOnIndex + 1} 步`,
        message: getErrorMessage(error),
      });
    }
  }

  return {
    total: selected.length,
    created: createdByStep.size,
    failed: failures.length,
    failures,
    dependencyTotal: pairs.length,
    dependenciesCreated,
    dependenciesFailed: dependencyFailures.length,
    dependenciesSkipped,
    dependencyFailures,
  };
}