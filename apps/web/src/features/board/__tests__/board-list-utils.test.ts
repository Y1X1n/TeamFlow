import { describe, expect, it } from 'vitest';
import type { BoardColumn, TaskCard } from '@/lib/types';
import { defaultListSortDirection, sortBoardListTasks } from '../board-list-utils';

function makeTask(overrides: Partial<TaskCard> & Pick<TaskCard, 'id'>): TaskCard {
  const { id, ...rest } = overrides;
  return {
    id,
    projectId: 'project-1',
    columnId: 'column-1',
    title: id,
    priority: 'MEDIUM',
    assignee: null,
    dueDate: null,
    estimateMinutes: null,
    actualMinutes: null,
    labels: [],
    position: 'a0',
    completedAt: null,
    commentCount: 0,
    attachmentCount: 0,
    subtaskTotal: 0,
    subtaskDone: 0,
    blockedByCount: 0,
    blockingCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...rest,
  };
}

const columns: BoardColumn[] = [
  {
    id: 'column-1',
    projectId: 'project-1',
    name: '待办',
    position: 'a0',
    isDone: false,
    taskCount: 0,
  },
  {
    id: 'column-2',
    projectId: 'project-1',
    name: '进行中',
    position: 'a1',
    isDone: false,
    taskCount: 0,
  },
];

const tasks = [
  makeTask({
    id: 'normal',
    priority: 'MEDIUM',
    dueDate: '2026-12-10T00:00:00.000Z',
    position: 'a1',
  }),
  makeTask({
    id: 'urgent',
    priority: 'URGENT',
    dueDate: '2026-12-20T00:00:00.000Z',
    position: 'a2',
  }),
  makeTask({ id: 'no-due', priority: 'LOW', dueDate: null, position: 'a3' }),
  makeTask({
    id: 'early',
    priority: 'HIGH',
    dueDate: '2026-12-01T00:00:00.000Z',
    position: 'a4',
  }),
];

describe('defaultListSortDirection', () => {
  it('defaults to ascending for dates/position and descending for priority/updated', () => {
    expect(defaultListSortDirection('dueDate')).toBe('asc');
    expect(defaultListSortDirection('position')).toBe('asc');
    expect(defaultListSortDirection('priority')).toBe('desc');
    expect(defaultListSortDirection('updatedAt')).toBe('desc');
  });
});

describe('sortBoardListTasks', () => {
  it('sorts by due date ascending and keeps missing dates last', () => {
    const sorted = sortBoardListTasks(tasks, columns, 'dueDate', 'asc');
    expect(sorted.map((task) => task.id)).toEqual(['early', 'normal', 'urgent', 'no-due']);
  });

  it('keeps missing dates last in descending order too', () => {
    const sorted = sortBoardListTasks(tasks, columns, 'dueDate', 'desc');
    expect(sorted.map((task) => task.id)).toEqual(['urgent', 'normal', 'early', 'no-due']);
  });

  it('sorts priority by urgency', () => {
    const sorted = sortBoardListTasks(tasks, columns, 'priority', 'desc');
    expect(sorted.map((task) => task.id)).toEqual(['urgent', 'early', 'normal', 'no-due']);
  });

  it('sorts by update time and preserves the original order for ties', () => {
    const withUpdates = [
      makeTask({ id: 'old', updatedAt: '2026-01-01T00:00:00.000Z' }),
      makeTask({ id: 'new-a', updatedAt: '2026-02-01T00:00:00.000Z' }),
      makeTask({ id: 'new-b', updatedAt: '2026-02-01T00:00:00.000Z' }),
    ];
    const sorted = sortBoardListTasks(withUpdates, columns, 'updatedAt', 'desc');
    expect(sorted.map((task) => task.id)).toEqual(['new-a', 'new-b', 'old']);
  });

  it('preserves true board order for the position key and can reverse it', () => {
    expect(sortBoardListTasks(tasks, columns, 'position', 'asc').map((task) => task.id)).toEqual([
      'normal',
      'urgent',
      'no-due',
      'early',
    ]);
    expect(sortBoardListTasks(tasks, columns, 'position', 'desc').map((task) => task.id)).toEqual([
      'early',
      'no-due',
      'urgent',
      'normal',
    ]);
  });

  it('sorts position by column order before task position', () => {
    const outOfOrder = [
      makeTask({ id: 'second-column', columnId: 'column-2', position: 'a0' }),
      makeTask({ id: 'first-column-later', columnId: 'column-1', position: 'z0' }),
      makeTask({ id: 'first-column-earlier', columnId: 'column-1', position: 'a0' }),
    ];

    expect(sortBoardListTasks(outOfOrder, columns, 'position', 'asc').map((task) => task.id)).toEqual(
      ['first-column-earlier', 'first-column-later', 'second-column'],
    );
  });
});
