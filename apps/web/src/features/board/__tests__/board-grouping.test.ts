import { describe, expect, it } from 'vitest';
import type { MemberSummary, TaskCard } from '@/lib/types';
import {
  BOARD_GROUP_OPTIONS,
  groupTasksForColumn,
  UNASSIGNED_GROUP_KEY,
  UNLABELED_GROUP_KEY,
} from '../board-grouping';

function makeTask(overrides: Partial<TaskCard> = {}): TaskCard {
  return {
    id: 'task-1',
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
    ...overrides,
  };
}

function makeMember(userId: string, name: string): MemberSummary {
  return { userId, name, avatarUrl: null, role: 'MEMBER' };
}

function taskIds(tasks: TaskCard[]): string[] {
  return tasks.map((task) => task.id);
}

function emptyMembers(): Map<string, MemberSummary> {
  return new Map<string, MemberSummary>();
}

describe('BOARD_GROUP_OPTIONS', () => {
  it('exposes the four grouping modes with their labels', () => {
    expect(BOARD_GROUP_OPTIONS.map((option) => option.value)).toEqual([
      'none',
      'assignee',
      'priority',
      'label',
    ]);
    expect(BOARD_GROUP_OPTIONS.map((option) => option.label)).toEqual([
      '不分组',
      '按负责人',
      '按优先级',
      '按标签',
    ]);
  });
});

describe('groupTasksForColumn', () => {
  it('returns a single unlabelled group for none and preserves task order', () => {
    const tasks = [makeTask({ id: 't1' }), makeTask({ id: 't2' }), makeTask({ id: 't3' })];

    const groups = groupTasksForColumn(tasks, 'none', emptyMembers());

    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe('all');
    expect(groups[0]?.label).toBe('');
    expect(taskIds(groups[0]?.tasks ?? [])).toEqual(['t1', 't2', 't3']);
  });

  it('groups by assignee, keeps task order, and puts unassigned last', () => {
    const membersById = new Map<string, MemberSummary>([
      ['u-zhang', makeMember('u-zhang', '张伟')],
      ['u-li', makeMember('u-li', '李娜')],
    ]);
    const tasks = [
      makeTask({ id: 't1', assignee: makeMember('u-zhang', '张伟') }),
      makeTask({ id: 't2' }),
      makeTask({ id: 't3', assignee: makeMember('u-li', '李娜') }),
      makeTask({ id: 't4', assignee: makeMember('u-zhang', '张伟') }),
    ];

    const groups = groupTasksForColumn(tasks, 'assignee', membersById);

    expect(groups.map((group) => group.key)).toEqual([
      'assignee:u-li',
      'assignee:u-zhang',
      UNASSIGNED_GROUP_KEY,
    ]);
    expect(groups.map((group) => group.label)).toEqual(['李娜', '张伟', '未指派']);
    expect(taskIds(groups[0]?.tasks ?? [])).toEqual(['t3']);
    expect(taskIds(groups[1]?.tasks ?? [])).toEqual(['t1', 't4']);
    expect(taskIds(groups[2]?.tasks ?? [])).toEqual(['t2']);
  });

  it('falls back to the task assignee name when the member map misses the user', () => {
    const tasks = [makeTask({ id: 't1', assignee: makeMember('u-unknown', '外部成员') })];

    const groups = groupTasksForColumn(tasks, 'assignee', emptyMembers());

    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe('外部成员');
  });

  it('orders priority groups urgent to low and omits empty groups', () => {
    const tasks = [
      makeTask({ id: 'low', priority: 'LOW' }),
      makeTask({ id: 'urgent-1', priority: 'URGENT' }),
      makeTask({ id: 'high-1', priority: 'HIGH' }),
      makeTask({ id: 'urgent-2', priority: 'URGENT' }),
    ];

    const groups = groupTasksForColumn(tasks, 'priority', emptyMembers());

    expect(groups.map((group) => group.key)).toEqual(['URGENT', 'HIGH', 'LOW']);
    expect(groups.map((group) => group.label)).toEqual(['紧急', '高', '低']);
    expect(taskIds(groups[0]?.tasks ?? [])).toEqual(['urgent-1', 'urgent-2']);
    expect(taskIds(groups[1]?.tasks ?? [])).toEqual(['high-1']);
    expect(taskIds(groups[2]?.tasks ?? [])).toEqual(['low']);
  });

  it('groups by the first label only and puts unlabelled tasks last', () => {
    const tasks = [
      makeTask({ id: 't1', labels: ['beta'] }),
      makeTask({ id: 't2', labels: ['alpha', 'beta'] }),
      makeTask({ id: 't3' }),
      makeTask({ id: 't4', labels: ['alpha'] }),
    ];

    const groups = groupTasksForColumn(tasks, 'label', emptyMembers());

    expect(groups.map((group) => group.key)).toEqual([
      'label:alpha',
      'label:beta',
      UNLABELED_GROUP_KEY,
    ]);
    expect(groups.map((group) => group.label)).toEqual(['alpha', 'beta', '无标签']);
    expect(taskIds(groups[0]?.tasks ?? [])).toEqual(['t2', 't4']);
    expect(taskIds(groups[1]?.tasks ?? [])).toEqual(['t1']);
    expect(taskIds(groups[2]?.tasks ?? [])).toEqual(['t3']);

    const renderedIds = groups.flatMap((group) => taskIds(group.tasks));
    expect(renderedIds).toEqual(['t2', 't4', 't1', 't3']);
    expect(new Set(renderedIds).size).toBe(tasks.length);
  });

  it('keeps a real __none__ label separate from unlabelled tasks', () => {
    const tasks = [makeTask({ id: 't1', labels: ['__none__'] }), makeTask({ id: 't2' })];

    const groups = groupTasksForColumn(tasks, 'label', emptyMembers());

    expect(groups.map((group) => group.key)).toEqual(['label:__none__', UNLABELED_GROUP_KEY]);
    expect(groups.map((group) => group.label)).toEqual(['__none__', '无标签']);
    expect(taskIds(groups[0]?.tasks ?? [])).toEqual(['t1']);
    expect(taskIds(groups[1]?.tasks ?? [])).toEqual(['t2']);
  });

  it('returns one empty group for none and no groups for other modes', () => {
    expect(groupTasksForColumn([], 'none', emptyMembers())).toEqual([
      { key: 'all', label: '', tasks: [] },
    ]);

    for (const groupBy of ['assignee', 'priority', 'label'] as const) {
      expect(groupTasksForColumn([], groupBy, emptyMembers())).toEqual([]);
    }
  });
});
