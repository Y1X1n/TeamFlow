import { describe, expect, it } from 'vitest';
import type { BoardData, TaskCard } from '@/lib/types';
import { summarizeBoard } from '../overview-utils';

function makeTask(overrides: Partial<TaskCard> & Pick<TaskCard, 'id'>): TaskCard {
  const { id, ...rest } = overrides;
  return {
    id,
    projectId: 'project-1',
    columnId: 'column-1',
    title: '任务',
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

function makeBoard(tasks: TaskCard[]): BoardData {
  return {
    project: { archived: false } as BoardData['project'],
    columns: [],
    tasks,
    members: [{ userId: 'u1', name: 'Alice', avatarUrl: null, role: 'MEMBER' }],
    myPermissions: [],
  };
}

describe('summarizeBoard workload estimates', () => {
  it('sums estimates of open tasks per assignee and ignores done or unassigned tasks', () => {
    const summary = summarizeBoard(
      makeBoard([
        makeTask({
          id: 'open-estimated',
          assignee: { userId: 'u1', name: 'Alice', avatarUrl: null, role: 'MEMBER' },
          estimateMinutes: 120,
        }),
        makeTask({
          id: 'open-unestimated',
          assignee: { userId: 'u1', name: 'Alice', avatarUrl: null, role: 'MEMBER' },
        }),
        makeTask({
          id: 'done-estimated',
          assignee: { userId: 'u1', name: 'Alice', avatarUrl: null, role: 'MEMBER' },
          estimateMinutes: 240,
          completedAt: '2026-01-02T00:00:00.000Z',
        }),
        makeTask({ id: 'unassigned', estimateMinutes: 60 }),
      ]),
    );

    expect(summary.workload[0]).toMatchObject({
      userId: 'u1',
      open: 2,
      openEstimateMinutes: 120,
      done: 1,
      total: 3,
    });
  });
});
