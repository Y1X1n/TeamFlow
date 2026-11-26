import { describe, expect, it } from 'vitest';
import {
  pruneSelectedIds,
  removeTaskIds,
  runSequentialBulk,
  setTaskSelected,
  summarizeBulkComplete,
  summarizeBulkUpdate,
} from '../board-bulk';

function selectionOf(...ids: string[]): Set<string> {
  return new Set(ids);
}

describe('setTaskSelected', () => {
  it('adds a task to the selection', () => {
    const next = setTaskSelected(selectionOf('t1'), 't2', true);

    expect([...next]).toEqual(['t1', 't2']);
  });

  it('removes a task from the selection', () => {
    const next = setTaskSelected(selectionOf('t1', 't2'), 't1', false);

    expect([...next]).toEqual(['t2']);
  });

  it('returns the same set when the state does not change', () => {
    const current = selectionOf('t1');

    expect(setTaskSelected(current, 't1', true)).toBe(current);
    expect(setTaskSelected(current, 't2', false)).toBe(current);
  });
});

describe('removeTaskIds', () => {
  it('removes only the given tasks', () => {
    const next = removeTaskIds(selectionOf('t1', 't2', 't3'), ['t2', 't3']);

    expect([...next]).toEqual(['t1']);
  });

  it('returns the same set when nothing matches', () => {
    const current = selectionOf('t1');

    expect(removeTaskIds(current, ['t2'])).toBe(current);
    expect(removeTaskIds(current, [])).toBe(current);
  });
});

describe('pruneSelectedIds', () => {
  it('drops ids that are no longer on the board', () => {
    const next = pruneSelectedIds(selectionOf('t1', 'gone', 't2'), [{ id: 't1' }, { id: 't2' }]);

    expect([...next]).toEqual(['t1', 't2']);
  });

  it('returns the same set when every selected task still exists', () => {
    const current = selectionOf('t1');
    const tasks = [{ id: 't1' }, { id: 't2' }];

    expect(pruneSelectedIds(current, tasks)).toBe(current);
  });

  it('returns the same empty set without work', () => {
    const current = selectionOf();

    expect(pruneSelectedIds(current, [])).toBe(current);
  });
});

describe('runSequentialBulk', () => {
  it('runs tasks one by one in the given order', async () => {
    const visited: string[] = [];
    const result = await runSequentialBulk(['t1', 't2', 't3'], async (taskId) => {
      visited.push(taskId);
      return taskId;
    });

    expect(visited).toEqual(['t1', 't2', 't3']);
    expect(result).toEqual({ success: 3, failed: 0, failedTaskIds: [] });
  });

  it('continues after a failure and reports the failed task ids', async () => {
    const visited: string[] = [];
    const result = await runSequentialBulk(['t1', 't2', 't3'], async (taskId) => {
      visited.push(taskId);
      if (taskId === 't2') throw new Error('409 TASK_BLOCKED');
    });

    expect(visited).toEqual(['t1', 't2', 't3']);
    expect(result).toEqual({ success: 2, failed: 1, failedTaskIds: ['t2'] });
  });
});

describe('summarizeBulkUpdate', () => {
  it('reports a full success', () => {
    expect(summarizeBulkUpdate({ success: 3, failed: 0, failedTaskIds: [] })).toEqual({
      tone: 'success',
      message: '已更新 3 个任务',
    });
  });

  it('reports a partial failure as a warning', () => {
    expect(summarizeBulkUpdate({ success: 2, failed: 1, failedTaskIds: ['t1'] })).toEqual({
      tone: 'warning',
      message: '已更新 2 个任务，1 个失败',
    });
  });

  it('reports a total failure as an error', () => {
    expect(summarizeBulkUpdate({ success: 0, failed: 2, failedTaskIds: ['t1', 't2'] })).toEqual({
      tone: 'error',
      message: '批量更新失败：2 个任务未更新',
    });
  });

  it('reports an empty selection as a warning', () => {
    expect(summarizeBulkUpdate({ success: 0, failed: 0, failedTaskIds: [] })).toEqual({
      tone: 'warning',
      message: '没有可更新的任务',
    });
  });
});

describe('summarizeBulkComplete', () => {
  it('includes the column name on full success', () => {
    expect(summarizeBulkComplete({ success: 2, failed: 0, failedTaskIds: [] }, '完成')).toEqual({
      tone: 'success',
      message: '已移入完成列 2 个任务（「完成」）',
    });
  });

  it('mentions dependency or permission failures on partial success', () => {
    expect(summarizeBulkComplete({ success: 2, failed: 1, failedTaskIds: ['t3'] }, '完成')).toEqual(
      {
        tone: 'warning',
        message: '已移入完成列 2 个，1 个因依赖/权限失败（「完成」）',
      },
    );
  });

  it('reports a total failure as an error', () => {
    expect(
      summarizeBulkComplete({ success: 0, failed: 2, failedTaskIds: ['t1', 't2'] }, '完成'),
    ).toEqual({
      tone: 'error',
      message: '移入完成列失败：2 个任务因依赖或权限未能移入「完成」',
    });
  });

  it('reports an empty selection as a warning', () => {
    expect(summarizeBulkComplete({ success: 0, failed: 0, failedTaskIds: [] }, '完成')).toEqual({
      tone: 'warning',
      message: '没有可移入完成列的任务',
    });
  });
});
