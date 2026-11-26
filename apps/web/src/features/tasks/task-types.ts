import { TASK_PRIORITY_LABELS } from '@teamflow/shared/enums';
import { formatDate } from '@/lib/utils';
import type { TaskComment } from '@/lib/types';
import { formatEstimateMinutes, isTaskPriority } from './task-utils';

export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  PROJECT_CREATED: '创建项目',
  PROJECT_UPDATED: '更新项目',
  PROJECT_ARCHIVED: '归档项目',
  PROJECT_UNARCHIVED: '恢复项目',
  MEMBER_JOINED: '成员加入',
  MEMBER_REMOVED: '移除成员',
  MEMBER_ROLE_CHANGED: '调整成员角色',
  MEMBER_PERMISSIONS_CHANGED: '更新成员权限',
  MEMBER_SKILLS_CHANGED: '更新成员职能',
  COLUMN_CREATED: '创建看板列',
  COLUMN_UPDATED: '更新看板列',
  COLUMN_DELETED: '删除看板列',
  TASK_CREATED: '创建任务',
  TASK_UPDATED: '更新任务',
  TASK_MOVED: '移动任务',
  TASK_COMPLETED: '完成任务',
  TASK_REOPENED: '重新打开任务',
  TASK_ASSIGNED: '指派任务',
  TASK_DELETED: '删除任务',
  COMMENT_CREATED: '发表评论',
  COMMENT_UPDATED: '更新评论',
  COMMENT_DELETED: '删除评论',
  ATTACHMENT_ADDED: '上传附件',
  ATTACHMENT_DELETED: '删除附件',
  REPORT_GENERATED: '生成周报',
};

export function activityTypeLabel(type: string): string {
  return ACTIVITY_TYPE_LABELS[type] ?? '更新任务动态';
}

function readString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readPair(value: unknown): [string | null, string | null] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const from = value[0];
  const to = value[1];
  const normalize = (item: unknown): string | null => (typeof item === 'string' ? item : null);
  return [normalize(from), normalize(to)];
}

function readEstimatePair(value: unknown): [number | null, number | null] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const normalize = (item: unknown): number | null =>
    typeof item === 'number' && Number.isFinite(item) ? item : null;
  return [normalize(value[0]), normalize(value[1])];
}

function truncate(value: string, max = 24): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function describeChanges(changes: unknown): string | null {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return null;
  const record = changes as Record<string, unknown>;
  const action = readString(record, 'action');
  if (action) {
    const subtaskTitle = readString(record, 'subtaskTitle');
    const quoted = subtaskTitle ? `「${truncate(subtaskTitle)}」` : '子任务';
    switch (action) {
      case 'subtask_created':
        return `新增子任务${quoted}`;
      case 'subtask_updated':
        return `更新子任务${quoted}`;
      case 'subtask_deleted':
        return `删除子任务${quoted}`;
      case 'subtask_toggled':
        return record.isDone === true ? `完成子任务${quoted}` : `重新打开子任务${quoted}`;
      default:
        return null;
    }
  }

  const parts: string[] = [];
  const titleChange = readPair(record.title);
  if (titleChange && titleChange[0] !== null && titleChange[1] !== null) {
    parts.push(`标题：${truncate(titleChange[0])} → ${truncate(titleChange[1])}`);
  }
  const priorityChange = readPair(record.priority);
  if (
    priorityChange &&
    priorityChange[0] !== null &&
    priorityChange[1] !== null &&
    isTaskPriority(priorityChange[0]) &&
    isTaskPriority(priorityChange[1])
  ) {
    parts.push(
      `优先级：${TASK_PRIORITY_LABELS[priorityChange[0]]} → ${TASK_PRIORITY_LABELS[priorityChange[1]]}`,
    );
  }
  const dueChange = readPair(record.dueDate);
  if (dueChange) {
    parts.push(`截止时间：${formatDate(dueChange[0])} → ${formatDate(dueChange[1])}`);
  }
  const estimateChange = readEstimatePair(record.estimateMinutes);
  if (estimateChange) {
    parts.push(
      `工时估算：${formatEstimateMinutes(estimateChange[0]) ?? '未估算'} → ${formatEstimateMinutes(estimateChange[1]) ?? '未估算'}`,
    );
  }
  if (Array.isArray(record.assigneeId)) {
    parts.push('负责人已变更');
  }
  if (record.description !== undefined) {
    parts.push('描述已更新');
  }
  if (record.labels !== undefined) {
    parts.push('标签已更新');
  }
  if (parts.length === 0) return null;
  return parts.slice(0, 3).join('；');
}

export interface ActivitySummary {
  title: string | null;
  detail: string | null;
  excerpt: string | null;
}

export function summarizeActivityPayload(payload: Record<string, unknown>): ActivitySummary {
  return {
    title: readString(payload, 'title'),
    detail: describeChanges(payload.changes),
    excerpt: readString(payload, 'excerpt'),
  };
}

export interface CommentThread {
  root: TaskComment;
  replies: TaskComment[];
}

export function groupCommentThreads(comments: TaskComment[]): CommentThread[] {
  const known = new Set(comments.map((comment) => comment.id));
  const roots: TaskComment[] = [];
  const repliesByParent = new Map<string, TaskComment[]>();

  for (const comment of comments) {
    if (!comment.parentId || !known.has(comment.parentId)) {
      roots.push(comment);
      continue;
    }
    const replies = repliesByParent.get(comment.parentId) ?? [];
    replies.push(comment);
    repliesByParent.set(comment.parentId, replies);
  }

  return roots.map((root) => ({
    root,
    replies: repliesByParent.get(root.id) ?? [],
  }));
}
