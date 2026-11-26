import { describe, expect, it } from 'vitest';
import {
  mergeTaskLabels,
  pruneSelectedIds,
  removeTaskIds,
  runSequentialBulk,
  setTaskSelected,
  summarizeBulkComplete,
  summarizeBulkDelete,
  summarizeBulkMove,
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

describe('summarizeBulkMove', () => {
  it('reports full, partial and total results with the target column', () => {
    expect(summarizeBulkMove({ success: 2, failed: 0, failedTaskIds: [] }, '进行中')).toEqual({
      tone: 'success',
      message: '已移动 2 个任务到「进行中」',
    });
    expect(summarizeBulkMove({ success: 1, failed: 1, failedTaskIds: ['t2'] }, '进行中')).toEqual({
      tone: 'warning',
      message: '已移动 1 个到「进行中」，1 个因依赖/权限失败',
    });
    expect(
      summarizeBulkMove({ success: 0, failed: 2, failedTaskIds: ['t1', 't2'] }, '进行中'),
    ).toEqual({
      tone: 'error',
      message: '批量移动失败：2 个任务因依赖或权限未能移入「进行中」',
    });
    expect(summarizeBulkMove({ success: 0, failed: 0, failedTaskIds: [] }, '进行中')).toEqual({
      tone: 'warning',
      message: '没有可移动的任务',
    });
  });
});

describe('summarizeBulkDelete', () => {
  it('mentions trash recovery on success', () => {
    expect(summarizeBulkDelete({ success: 2, failed: 0, failedTaskIds: [] })).toEqual({
      tone: 'success',
      message: '已删除 2 个任务，可在回收站恢复',
    });
  });

  it('reports partial and total failures', () => {
    expect(summarizeBulkDelete({ success: 1, failed: 1, failedTaskIds: ['t2'] })).toEqual({
      tone: 'warning',
      message: '已删除 1 个任务，1 个失败',
    });
    expect(summarizeBulkDelete({ success: 0, failed: 2, failedTaskIds: ['t1', 't2'] })).toEqual({
      tone: 'error',
      message: '批量删除失败：2 个任务未删除',
    });
  });
});

describe('mergeTaskLabels', () => {
  it('appends new labels and skips duplicates case-insensitively', () => {
    const result = mergeTaskLabels(['前端', 'Bug'], ['bug', ' 设计 ']);

    expect(result.labels).toEqual(['前端', 'Bug', '设计']);
    expect(result.added).toEqual(['设计']);
  });

  it('stops at the label limit and drops over-long labels', () => {
    const result = mergeTaskLabels(['a', 'b', 'c', 'd'], ['e', 'f', 'x'.repeat(21)]);

    expect(result.labels).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(result.added).toEqual(['e']);
  });

  it('reports no additions when everything already exists', () => {
    expect(mergeTaskLabels(['前端'], ['前端'])).toEqual({ labels: ['前端'], added: [] });
  });
});
