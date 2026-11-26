import { TASK_PRIORITIES, TASK_PRIORITY_LABELS } from '@teamflow/shared/enums';
import type { TaskPriority } from '@teamflow/shared/enums';
import type { MemberSummary, TaskCard } from '@/lib/types';

export type BoardGroupBy = 'none' | 'assignee' | 'priority' | 'label';

export const BOARD_GROUP_OPTIONS: ReadonlyArray<{ value: BoardGroupBy; label: string }> = [
  { value: 'none', label: '不分组' },
  { value: 'assignee', label: '按负责人' },
  { value: 'priority', label: '按优先级' },
  { value: 'label', label: '按标签' },
];

export const UNASSIGNED_GROUP_KEY = 'assignee:unassigned';
export const UNASSIGNED_GROUP_LABEL = '未指派';
export const UNLABELED_GROUP_KEY = 'label:unlabeled';
export const UNLABELED_GROUP_LABEL = '无标签';

const PRIORITY_GROUP_ORDER: readonly TaskPriority[] = [...TASK_PRIORITIES].reverse();

export interface BoardTaskGroup {
  key: string;
  label: string;
  tasks: TaskCard[];
}

export function isBoardGroupBy(value: string): value is BoardGroupBy {
  return BOARD_GROUP_OPTIONS.some((option) => option.value === value);
}

function groupTasksByAssignee(
  tasks: TaskCard[],
  membersById: Map<string, MemberSummary>,
): BoardTaskGroup[] {
  const groups = new Map<string, BoardTaskGroup>();
  for (const task of tasks) {
    const assigneeId = task.assignee?.userId;
    const key = assigneeId ? `assignee:${assigneeId}` : UNASSIGNED_GROUP_KEY;
    let group = groups.get(key);
    if (!group) {
      const label = assigneeId
        ? (membersById.get(assigneeId)?.name ?? task.assignee?.name ?? UNASSIGNED_GROUP_LABEL)
        : UNASSIGNED_GROUP_LABEL;
      group = { key, label, tasks: [] };
      groups.set(key, group);
    }
    group.tasks.push(task);
  }
  return [...groups.values()].sort((a, b) => {
    if (a.key === UNASSIGNED_GROUP_KEY) return b.key === UNASSIGNED_GROUP_KEY ? 0 : 1;
    if (b.key === UNASSIGNED_GROUP_KEY) return -1;
    return a.label.localeCompare(b.label, 'zh-CN') || a.key.localeCompare(b.key);
  });
}

function groupTasksByPriority(tasks: TaskCard[]): BoardTaskGroup[] {
  const buckets = new Map<TaskPriority, TaskCard[]>();
  for (const task of tasks) {
    const bucket = buckets.get(task.priority);
    if (bucket) bucket.push(task);
    else buckets.set(task.priority, [task]);
  }
  return PRIORITY_GROUP_ORDER.flatMap((priority) => {
    const priorityTasks = buckets.get(priority);
    if (!priorityTasks || priorityTasks.length === 0) return [];
    return [{ key: priority, label: TASK_PRIORITY_LABELS[priority], tasks: priorityTasks }];
  });
}

function groupTasksByLabel(tasks: TaskCard[]): BoardTaskGroup[] {
  const groups = new Map<string, BoardTaskGroup>();
  for (const task of tasks) {
    const firstLabel = task.labels[0];
    const key = firstLabel ? `label:${firstLabel}` : UNLABELED_GROUP_KEY;
    let group = groups.get(key);
    if (!group) {
      const label = firstLabel ? firstLabel : UNLABELED_GROUP_LABEL;
      group = { key, label, tasks: [] };
      groups.set(key, group);
    }
    group.tasks.push(task);
  }
  return [...groups.values()].sort((a, b) => {
    if (a.key === UNLABELED_GROUP_KEY) return b.key === UNLABELED_GROUP_KEY ? 0 : 1;
    if (b.key === UNLABELED_GROUP_KEY) return -1;
    return a.label.localeCompare(b.label, 'zh-CN') || a.key.localeCompare(b.key);
  });
}

/**
 * 把单列任务按指定维度分组；同一任务只会出现在一个分组中，组内保留原顺序。
 */
export function groupTasksForColumn(
  tasks: TaskCard[],
  groupBy: BoardGroupBy,
  membersById: Map<string, MemberSummary>,
): BoardTaskGroup[] {
  if (groupBy === 'assignee') return groupTasksByAssignee(tasks, membersById);
  if (groupBy === 'priority') return groupTasksByPriority(tasks);
  if (groupBy === 'label') return groupTasksByLabel(tasks);
  return [{ key: 'all', label: '', tasks }];
}
