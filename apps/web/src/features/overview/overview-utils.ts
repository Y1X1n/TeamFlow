import type { TaskPriority } from '@teamflow/shared/enums';
import type { BoardData, TaskCard } from '@/lib/types';
import { isOverdue } from '@/lib/utils';

const PRIORITY_ORDER: readonly TaskPriority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];

export interface OverviewMetrics {
  total: number;
  completed: number;
  completionRate: number;
  overdue: number;
  dueThisWeek: number;
  unassigned: number;
}

export interface WorkloadEntry {
  userId: string;
  name: string;
  avatarUrl: string | null;
  /** 未完成任务（含逾期） */
  open: number;
  /** 未完成任务中已填写的预计工时合计（分钟） */
  openEstimateMinutes: number;
  overdue: number;
  done: number;
  total: number;
}

export interface PrioritySlice {
  priority: TaskPriority;
  count: number;
}

export interface UpcomingEntry {
  task: TaskCard;
  columnName: string;
  overdue: boolean;
}

export interface OverviewSummary {
  metrics: OverviewMetrics;
  workload: WorkloadEntry[];
  priority: PrioritySlice[];
  openTaskCount: number;
  upcoming: UpcomingEntry[];
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** 以周一为一周起点 */
function startOfWeek(date: Date): Date {
  const start = startOfDay(date);
  const offset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - offset);
  return start;
}

function isDone(task: TaskCard): boolean {
  return task.completedAt !== null;
}

export function summarizeBoard(board: BoardData, now: Date = new Date()): OverviewSummary {
  const tasks = board.tasks;
  const completedTasks = tasks.filter(isDone);
  const overdueTasks = tasks.filter(
    (task) => !isDone(task) && isOverdue(task.dueDate, task.completedAt),
  );
  const openTasks = tasks.filter((task) => !isDone(task));

  const weekStart = startOfWeek(now).getTime();
  const weekEndDate = new Date(weekStart);
  weekEndDate.setDate(weekEndDate.getDate() + 7);
  const weekEnd = weekEndDate.getTime();

  const dueThisWeek = openTasks.filter((task) => {
    if (!task.dueDate) return false;
    const time = new Date(task.dueDate).getTime();
    return Number.isFinite(time) && time >= weekStart && time < weekEnd;
  }).length;

  const metrics: OverviewMetrics = {
    total: tasks.length,
    completed: completedTasks.length,
    completionRate: tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0,
    overdue: overdueTasks.length,
    dueThisWeek,
    unassigned: openTasks.filter((task) => task.assignee === null).length,
  };

  const workloadMap = new Map<string, WorkloadEntry>();
  for (const member of board.members) {
    workloadMap.set(member.userId, {
      userId: member.userId,
      name: member.name,
      avatarUrl: member.avatarUrl,
      open: 0,
      openEstimateMinutes: 0,
      overdue: 0,
      done: 0,
      total: 0,
    });
  }
  for (const task of tasks) {
    const userId = task.assignee?.userId;
    if (!userId) continue;
    const entry = workloadMap.get(userId);
    if (!entry) continue;
    entry.total += 1;
    if (isDone(task)) {
      entry.done += 1;
    } else {
      entry.open += 1;
      if (typeof task.estimateMinutes === 'number') entry.openEstimateMinutes += task.estimateMinutes;
      if (isOverdue(task.dueDate, task.completedAt)) entry.overdue += 1;
    }
  }

  const workload = [...workloadMap.values()].sort(
    (left, right) =>
      right.open - left.open ||
      right.total - left.total ||
      left.name.localeCompare(right.name, 'zh-CN'),
  );

  const priorityCounts: Record<TaskPriority, number> = {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    URGENT: 0,
  };
  for (const task of openTasks) priorityCounts[task.priority] += 1;
  const priority = PRIORITY_ORDER.map((value) => ({
    priority: value,
    count: priorityCounts[value],
  }));

  const columnNames = new Map(board.columns.map((column) => [column.id, column.name]));
  const upcoming = openTasks
    .filter((task) => task.dueDate !== null)
    .sort(
      (left, right) =>
        new Date(left.dueDate ?? 0).getTime() - new Date(right.dueDate ?? 0).getTime(),
    )
    .slice(0, 5)
    .map<UpcomingEntry>((task) => ({
      task,
      columnName: columnNames.get(task.columnId) ?? '未知列',
      overdue: isOverdue(task.dueDate, task.completedAt),
    }));

  return {
    metrics,
    workload,
    priority,
    openTaskCount: openTasks.length,
    upcoming,
  };
}
