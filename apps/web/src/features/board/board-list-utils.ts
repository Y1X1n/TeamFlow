import { comparePositions } from '@teamflow/shared/fractional';
import type { BoardColumn, TaskCard } from '@/lib/types';

export type BoardViewMode = 'board' | 'list';
export type BoardListSortKey = 'position' | 'dueDate' | 'priority' | 'updatedAt';
export type BoardListSortDirection = 'asc' | 'desc';

const PRIORITY_RANK: Record<TaskCard['priority'], number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  URGENT: 3,
};

function timeValue(value: string | null): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function defaultListSortDirection(key: BoardListSortKey): BoardListSortDirection {
  return key === 'dueDate' || key === 'position' ? 'asc' : 'desc';
}

export function sortBoardListTasks(
  tasks: readonly TaskCard[],
  columns: readonly BoardColumn[],
  key: BoardListSortKey,
  direction: BoardListSortDirection,
): TaskCard[] {
  const factor = direction === 'asc' ? 1 : -1;
  if (key === 'position') {
    const columnIndex = new Map(columns.map((column, index) => [column.id, index]));
    return tasks
      .map((task, index) => ({ task, index }))
      .sort((left, right) => {
        const columnOrder =
          (columnIndex.get(left.task.columnId) ?? Number.MAX_SAFE_INTEGER) -
          (columnIndex.get(right.task.columnId) ?? Number.MAX_SAFE_INTEGER);
        if (columnOrder !== 0) return columnOrder * factor;
        const positionOrder =
          comparePositions(left.task.position, right.task.position) ||
          left.task.id.localeCompare(right.task.id);
        return positionOrder === 0 ? left.index - right.index : positionOrder * factor;
      })
      .map((entry) => entry.task);
  }

  return tasks
    .map((task, index) => ({ task, index }))
    .sort((left, right) => {
      let result = 0;
      if (key === 'priority') {
        result = PRIORITY_RANK[left.task.priority] - PRIORITY_RANK[right.task.priority];
      } else {
        const leftTime = timeValue(key === 'dueDate' ? left.task.dueDate : left.task.updatedAt);
        const rightTime = timeValue(key === 'dueDate' ? right.task.dueDate : right.task.updatedAt);
        if (leftTime === null && rightTime === null) result = 0;
        else if (leftTime === null) return 1;
        else if (rightTime === null) return -1;
        else result = leftTime - rightTime;
      }
      return result === 0 ? left.index - right.index : result * factor;
    })
    .map((entry) => entry.task);
}
