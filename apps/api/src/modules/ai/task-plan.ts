import { TASK_PRIORITIES } from '@teamflow/shared/enums';
import type { ProjectRole, TaskPriority } from '@teamflow/shared/enums';

export const LOCAL_PLAN_NOTICE = '未配置 AI 或 AI 暂不可用，已使用本地规则生成拆解与分工。';
export const AI_PLAN_NOTICE = '建议由 AI 生成，请在创建前核对负责人和日期。';

export const PLAN_STEP_TITLE_MAX_LENGTH = 120;
export const PLAN_STEP_REASON_MAX_LENGTH = 120;
export const PLAN_STEPS_MAX = 6;
/** The local rule engine always produces this many steps (within the contract's 3-6 range). */
export const LOCAL_PLAN_STEPS = 5;
/** AI output is accepted only when at least this many valid steps survive sanitization. */
export const AI_PLAN_MIN_VALID_STEPS = 2;
export const PLAN_DUE_IN_DAYS_MAX = 30;

export interface TaskPlanMember {
  userId: string;
  name: string;
  role: ProjectRole;
  skills: string[];
  openTaskCount: number;
  overdueTaskCount: number;
}

export interface TaskPlanStep {
  title: string;
  reason: string | null;
  suggestedAssigneeId: string | null;
  suggestedAssigneeName: string | null;
  priority: TaskPriority;
  dueInDays: number | null;
  dependsOn: number[];
}

export interface TaskPlanResult {
  steps: TaskPlanStep[];
  source: 'ai' | 'local';
  model: string | null;
  notice: string | null;
}

export interface GeneratePlanInput {
  taskTitle: string;
  taskDescription: string | null;
  taskLabels: string[];
  projectName: string;
  members: TaskPlanMember[];
  useAi?: boolean;
}

interface LocalPlanTemplate {
  title: (shortTaskTitle: string) => string;
  reason: string;
}

const LOCAL_PLAN_TEMPLATES: readonly LocalPlanTemplate[] = [
  {
    title: (task) => `明确「${task}」的目标与验收标准`,
    reason: '先确认范围与验收标准，避免后续返工。',
  },
  {
    title: (task) => `拆解「${task}」的执行步骤`,
    reason: '将工作拆成可执行子任务并确认先后顺序。',
  },
  {
    title: (task) => `完成「${task}」的初版产出`,
    reason: '集中完成核心产出，便于后续评审与调整。',
  },
  {
    title: (task) => `自查并评审「${task}」`,
    reason: '检查质量并邀请相关成员评审。',
  },
  {
    title: (task) => `交付「${task}」并复盘`,
    reason: '交付结果并记录问题与改进点。',
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanStepText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\u0000/g, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function cleanStepTitle(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\u0000/g, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/^\s*(?:[-*•·]|\d+[.)、]|[(（]\d+[)）])\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, PLAN_STEP_TITLE_MAX_LENGTH);
}

function cleanStepReason(value: unknown): string | null {
  const reason = cleanStepText(value, PLAN_STEP_REASON_MAX_LENGTH);
  return reason.length > 0 ? reason : null;
}

function sanitizePriority(value: unknown): TaskPriority {
  if (typeof value !== 'string') return 'MEDIUM';
  const priority = value.trim();
  return (TASK_PRIORITIES as readonly string[]).includes(priority)
    ? (priority as TaskPriority)
    : 'MEDIUM';
}

function sanitizeDueInDays(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(PLAN_DUE_IN_DAYS_MAX, Math.max(1, Math.round(value)));
}

function sanitizeDependsOn(value: unknown, currentIndex: number): number[] {
  if (!Array.isArray(value)) return [];
  const indexes = new Set<number>();
  for (const entry of value) {
    if (typeof entry !== 'number' || !Number.isInteger(entry)) continue;
    if (entry < 0 || entry >= currentIndex) continue;
    indexes.add(entry);
  }
  return Array.from(indexes).sort((left, right) => left - right);
}

export function eligiblePlanMembers(members: readonly TaskPlanMember[]): TaskPlanMember[] {
  return members.filter((member) => member.role !== 'VIEWER');
}

/**
 * Sanitizes model-provided steps against the project members and the response contract.
 * Titles are trimmed, de-prefixed, deduplicated and capped; assignees are resolved from the
 * authoritative member list (invalid ids become null); priorities, due days and dependencies
 * are clamped. Dependencies may only point at earlier output indexes.
 */
export function sanitizeAiPlanSteps(
  raw: unknown,
  members: readonly TaskPlanMember[],
): TaskPlanStep[] {
  if (!Array.isArray(raw)) return [];
  const memberById = new Map<string, TaskPlanMember>();
  for (const member of eligiblePlanMembers(members)) {
    const userId = member.userId.trim();
    if (userId.length === 0) continue;
    memberById.set(userId, member);
  }

  const steps: TaskPlanStep[] = [];
  const seenTitles = new Set<string>();
  for (const entry of raw) {
    if (steps.length >= PLAN_STEPS_MAX) break;
    if (!isRecord(entry)) continue;
    const title = cleanStepTitle(entry.title);
    if (title.length === 0 || seenTitles.has(title)) continue;
    const assigneeId = typeof entry.assigneeId === 'string' ? entry.assigneeId.trim() : '';
    const assignee = assigneeId.length > 0 ? memberById.get(assigneeId) : undefined;
    const currentIndex = steps.length;
    steps.push({
      title,
      reason: cleanStepReason(entry.reason),
      suggestedAssigneeId: assignee?.userId ?? null,
      suggestedAssigneeName: assignee?.name ?? null,
      priority: sanitizePriority(entry.priority),
      dueInDays: sanitizeDueInDays(entry.dueInDays),
      dependsOn: sanitizeDependsOn(entry.dependsOn, currentIndex),
    });
    seenTitles.add(title);
  }
  return steps;
}

function shortTaskTitle(taskTitle: string): string {
  const cleaned = cleanStepText(taskTitle, 24);
  return cleaned.length > 0 ? cleaned : '任务';
}

function memberLoad(member: TaskPlanMember): number {
  return Math.max(0, member.openTaskCount) + Math.max(0, member.overdueTaskCount) * 2;
}

function compareMembers(left: TaskPlanMember, right: TaskPlanMember): number {
  if (left.name !== right.name) return left.name < right.name ? -1 : 1;
  if (left.userId !== right.userId) return left.userId < right.userId ? -1 : 1;
  return 0;
}

function compareMembersByLoad(left: TaskPlanMember, right: TaskPlanMember): number {
  const difference = memberLoad(left) - memberLoad(right);
  return difference !== 0 ? difference : compareMembers(left, right);
}

function preferredFirstMember(
  members: readonly TaskPlanMember[],
  labels: readonly string[],
): TaskPlanMember | null {
  const normalizedLabels = new Set(
    labels.map((label) => label.trim().toLowerCase()).filter((label) => label.length > 0),
  );
  if (normalizedLabels.size === 0) return null;
  const matches = members.filter((member) =>
    member.skills.some((skill) => normalizedLabels.has(skill.trim().toLowerCase())),
  );
  if (matches.length === 0) return null;
  return [...matches].sort(compareMembersByLoad)[0] ?? null;
}

/**
 * Round-robin allocation over members ordered by current workload (open + overdue * 2).
 * A skill match on the task labels moves that member to the front for the first step.
 */
function allocateAssignees(
  members: readonly TaskPlanMember[],
  count: number,
  labels: readonly string[],
): Array<TaskPlanMember | null> {
  const ordered = eligiblePlanMembers(members).sort(compareMembersByLoad);
  if (ordered.length === 0) return new Array<TaskPlanMember | null>(count).fill(null);
  const preferred = preferredFirstMember(ordered, labels);
  const rotation = preferred
    ? [preferred, ...ordered.filter((member) => member.userId !== preferred.userId)]
    : ordered;
  return Array.from({ length: count }, (_, index) => {
    const member = rotation[index % rotation.length];
    return member ?? null;
  });
}

function localPriority(index: number, total: number): TaskPriority {
  if (index === 0) return 'HIGH';
  if (index === total - 1) return 'LOW';
  return 'MEDIUM';
}

/**
 * Builds a deterministic 5-step local plan: priorities start HIGH and end LOW, due dates are
 * 1, 3, 5, 7, 9 days out, and each step depends on the previous one. Members excluded from
 * assignment (VIEWER) never receive a suggestion; when no eligible member exists all suggested
 * assignees are null.
 */
export function buildLocalPlanSteps(input: GeneratePlanInput): TaskPlanStep[] {
  const assignees = allocateAssignees(input.members, LOCAL_PLAN_TEMPLATES.length, input.taskLabels);
  const title = shortTaskTitle(input.taskTitle);
  return LOCAL_PLAN_TEMPLATES.map((template, index) => {
    const member = assignees[index] ?? null;
    return {
      title: template.title(title).slice(0, PLAN_STEP_TITLE_MAX_LENGTH),
      reason: template.reason,
      suggestedAssigneeId: member?.userId ?? null,
      suggestedAssigneeName: member?.name ?? null,
      priority: localPriority(index, LOCAL_PLAN_TEMPLATES.length),
      dueInDays: Math.min(PLAN_DUE_IN_DAYS_MAX, index * 2 + 1),
      dependsOn: index === 0 ? [] : [index - 1],
    };
  });
}
