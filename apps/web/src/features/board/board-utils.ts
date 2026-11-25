import type { Over } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { comparePositions, positionBetween } from '@teamflow/shared/fractional';
import type { BoardColumn, TaskCard } from '@/lib/types';

export const COLUMN_DROPPABLE_PREFIX = 'column:';

export type DueFilter = 'all' | 'overdue' | 'today' | 'week' | 'none';

const COLUMN_DOT_CLASSES = [
  'bg-indigo-400',
  'bg-sky-400',
  'bg-amber-400',
  'bg-rose-400',
  'bg-teal-400',
  'bg-violet-400',
];

export function columnDotClass(index: number): string {
  return COLUMN_DOT_CLASSES[index % COLUMN_DOT_CLASSES.length] ?? 'bg-slate-400';
}

export interface DragPreview {
  taskId: string;
  columnId: string;
  index: number;
}

export function sortTasks(tasks: TaskCard[]): TaskCard[] {
  return [...tasks].sort(
    (a, b) => comparePositions(a.position, b.position) || a.id.localeCompare(b.id),
  );
}

/**
 * 把看板任务按列分组并生成有序 id 列表；拖拽期间把活动卡片插入预览位置。
 */
export function buildColumnTaskIds(
  columns: BoardColumn[],
  tasks: TaskCard[],
  preview: DragPreview | null,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const column of columns) result[column.id] = [];
  for (const task of sortTasks(tasks)) {
    const list = result[task.columnId];
    if (list) list.push(task.id);
  }
  if (!preview) return result;
  for (const key of Object.keys(result)) {
    const list = result[key];
    if (!list) continue;
    result[key] = list.filter((id) => id !== preview.taskId);
  }
  const target = result[preview.columnId];
  if (!target) return result;
  const clamped = Math.max(0, Math.min(preview.index, target.length));
  target.splice(clamped, 0, preview.taskId);
  return result;
}

export function columnIdFromOver(over: Over, taskById: Map<string, TaskCard>): string | null {
  const data: Record<string, unknown> | undefined = over.data.current;
  const dataColumnId = data?.columnId;
  if (typeof dataColumnId === 'string') return dataColumnId;
  const overId = String(over.id);
  if (overId.startsWith(COLUMN_DROPPABLE_PREFIX)) {
    return overId.slice(COLUMN_DROPPABLE_PREFIX.length);
  }
  return taskById.get(overId)?.columnId ?? null;
}

export type DropTargetType = 'task' | 'column' | null;

export function dropTargetTypeFromOver(over: Over): DropTargetType {
  const data: Record<string, unknown> | undefined = over.data.current;
  if (data?.type === 'task') return 'task';
  if (data?.type === 'column') return 'column';
  return null;
}

export interface DropResolution {
  columnId: string;
  beforeTaskId: string | null;
  position: string;
  completedAt: string | null;
  unchanged: boolean;
}

export interface ResolveDropInput {
  activeTask: TaskCard;
  preview: DragPreview;
  columns: BoardColumn[];
  tasks: TaskCard[];
  overId: string;
  overColumnId: string;
  overType: DropTargetType;
}

function safePositionBetween(above: TaskCard | undefined, below: TaskCard | undefined): string {
  try {
    return positionBetween(above?.position ?? null, below?.position ?? null);
  } catch {
    return below?.position ?? above?.position ?? '000000000000';
  }
}

export function resolveDrop(input: ResolveDropInput): DropResolution | null {
  const { activeTask, preview, columns, tasks, overId, overColumnId, overType } = input;
  const ordered = buildColumnTaskIds(columns, tasks, preview);
  const targetList = ordered[overColumnId];
  if (!targetList) return null;

  const originalList = buildColumnTaskIds(columns, tasks, null)[activeTask.columnId] ?? [];
  const originalIndex = originalList.indexOf(activeTask.id);
  const originalNextId = originalIndex >= 0 ? (originalList[originalIndex + 1] ?? null) : null;

  let finalList: string[];
  if (preview.columnId === overColumnId) {
    if (overColumnId === activeTask.columnId) {
      const fromIndex = targetList.indexOf(activeTask.id);
      const toIndex = overType === 'task' ? targetList.indexOf(overId) : targetList.length - 1;
      if (fromIndex < 0 || toIndex < 0) return null;
      finalList = arrayMove(targetList, fromIndex, toIndex);
    } else {
      finalList = targetList;
    }
  } else {
    const base = targetList.filter((id) => id !== activeTask.id);
    let insertIndex = base.length;
    if (overType === 'task') {
      const index = base.indexOf(overId);
      if (index >= 0) insertIndex = index;
    }
    finalList = [...base.slice(0, insertIndex), activeTask.id, ...base.slice(insertIndex)];
  }

  const activeIndex = finalList.indexOf(activeTask.id);
  if (activeIndex < 0) return null;
  const beforeTaskId = finalList[activeIndex + 1] ?? null;
  const aboveId = finalList[activeIndex - 1];
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const aboveTask = aboveId ? taskMap.get(aboveId) : undefined;
  const belowTask = beforeTaskId ? taskMap.get(beforeTaskId) : undefined;
  const column = columns.find((item) => item.id === overColumnId);
  const unchanged = overColumnId === activeTask.columnId && beforeTaskId === originalNextId;

  return {
    columnId: overColumnId,
    beforeTaskId,
    position: safePositionBetween(aboveTask, belowTask),
    completedAt: column?.isDone ? new Date().toISOString() : null,
    unchanged,
  };
}
