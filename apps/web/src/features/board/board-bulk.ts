import { TASK_LABELS_MAX, TASK_LABEL_MAX_LENGTH } from '@teamflow/shared/enums';
import type { TaskCard } from '@/lib/types';

export interface BulkMutationResult {
  success: number;
  failed: number;
  failedTaskIds: string[];
}

export type BulkSummaryTone = 'success' | 'warning' | 'error';

export interface BulkSummary {
  tone: BulkSummaryTone;
  message: string;
}

/**
 * 返回更新后的选择集合；状态没变化时返回原集合，便于 React 跳过无意义的重渲染。
 */
export function setTaskSelected(
  selectedIds: Set<string>,
  taskId: string,
  selected: boolean,
): Set<string> {
  if (selectedIds.has(taskId) === selected) return selectedIds;
  const next = new Set(selectedIds);
  if (selected) next.add(taskId);
  else next.delete(taskId);
  return next;
}

/**
 * 从选择集合中移除给定任务；没有命中时返回原集合。
 */
export function removeTaskIds(selectedIds: Set<string>, taskIds: Iterable<string>): Set<string> {
  const toRemove = new Set(taskIds);
  let changed = false;
  for (const id of selectedIds) {
    if (toRemove.has(id)) {
      changed = true;
      break;
    }
  }
  if (!changed) return selectedIds;
  const next = new Set<string>();
  for (const id of selectedIds) {
    if (!toRemove.has(id)) next.add(id);
  }
  return next;
}

/**
 * 移除已不在看板任务列表中的选择项（例如被其他成员删除）；未变化时返回原集合。
 */
export function pruneSelectedIds(
  selectedIds: Set<string>,
  tasks: ReadonlyArray<Pick<TaskCard, 'id'>>,
): Set<string> {
  if (selectedIds.size === 0) return selectedIds;
  const taskIds = new Set(tasks.map((task) => task.id));
  let changed = false;
  for (const id of selectedIds) {
    if (!taskIds.has(id)) {
      changed = true;
      break;
    }
  }
  if (!changed) return selectedIds;
  const next = new Set<string>();
  for (const id of selectedIds) {
    if (taskIds.has(id)) next.add(id);
  }
  return next;
}

/**
 * 串行执行批量请求，避免并发移动产生重复 position，也限制写请求与通知的瞬时压力。
 */
export async function runSequentialBulk<T>(
  taskIds: readonly string[],
  run: (taskId: string) => Promise<T>,
): Promise<BulkMutationResult> {
  const failedTaskIds: string[] = [];
  let success = 0;
  for (const taskId of taskIds) {
    try {
      await run(taskId);
      success += 1;
    } catch {
      failedTaskIds.push(taskId);
    }
  }
  return { success, failed: failedTaskIds.length, failedTaskIds };
}

export function summarizeBulkUpdate(result: BulkMutationResult): BulkSummary {
  if (result.success + result.failed === 0) {
    return { tone: 'warning', message: '没有可更新的任务' };
  }
  if (result.failed === 0) {
    return { tone: 'success', message: `已更新 ${result.success} 个任务` };
  }
  if (result.success === 0) {
    return { tone: 'error', message: `批量更新失败：${result.failed} 个任务未更新` };
  }
  return {
    tone: 'warning',
    message: `已更新 ${result.success} 个任务，${result.failed} 个失败`,
  };
}

export function summarizeBulkComplete(result: BulkMutationResult, columnName: string): BulkSummary {
  if (result.success + result.failed === 0) {
    return { tone: 'warning', message: '没有可移入完成列的任务' };
  }
  if (result.failed === 0) {
    return {
      tone: 'success',
      message: `已移入完成列 ${result.success} 个任务（「${columnName}」）`,
    };
  }
  if (result.success === 0) {
    return {
      tone: 'error',
      message: `移入完成列失败：${result.failed} 个任务因依赖或权限未能移入「${columnName}」`,
    };
  }
  return {
    tone: 'warning',
    message: `已移入完成列 ${result.success} 个，${result.failed} 个因依赖/权限失败（「${columnName}」）`,
  };
}

export function summarizeBulkMove(result: BulkMutationResult, columnName: string): BulkSummary {
  if (result.success + result.failed === 0) {
    return { tone: 'warning', message: '没有可移动的任务' };
  }
  if (result.failed === 0) {
    return { tone: 'success', message: `已移动 ${result.success} 个任务到「${columnName}」` };
  }
  if (result.success === 0) {
    return {
      tone: 'error',
      message: `批量移动失败：${result.failed} 个任务因依赖或权限未能移入「${columnName}」`,
    };
  }
  return {
    tone: 'warning',
    message: `已移动 ${result.success} 个到「${columnName}」，${result.failed} 个因依赖/权限失败`,
  };
}

export function summarizeBulkDelete(result: BulkMutationResult): BulkSummary {
  if (result.success + result.failed === 0) {
    return { tone: 'warning', message: '没有可删除的任务' };
  }
  if (result.failed === 0) {
    return {
      tone: 'success',
      message: `已删除 ${result.success} 个任务，可在回收站恢复`,
    };
  }
  if (result.success === 0) {
    return { tone: 'error', message: `批量删除失败：${result.failed} 个任务未删除` };
  }
  return {
    tone: 'warning',
    message: `已删除 ${result.success} 个任务，${result.failed} 个失败`,
  };
}

export interface LabelMergeResult {
  labels: string[];
  added: string[];
}

/**
 * 将新标签追加到已有标签：去重、单个长度与总数上限均按任务标签规则裁剪。
 */
export function mergeTaskLabels(
  existing: readonly string[],
  additions: readonly string[],
): LabelMergeResult {
  const labels = [...existing];
  const added: string[] = [];
  const seen = new Set(labels.map((label) => label.toLowerCase()));
  for (const raw of additions) {
    const label = raw.trim();
    if (!label) continue;
    if (label.length > TASK_LABEL_MAX_LENGTH) continue;
    if (labels.length >= TASK_LABELS_MAX) break;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
    added.push(label);
  }
  return { labels, added };
}
